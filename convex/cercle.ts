import { ConvexError, v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import {
  action,
  internalAction,
  internalMutation,
  mutation,
  query,
} from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import {
  getCurrentUser,
  getActiveUserId,
  requireNetworkRole,
} from './lib/rbac';
import { effectiveRole, hasCercleAccess, isAmi } from './lib/roles';
import { locale } from './lib/locales';
import { enforceRecaptcha } from './lib/recaptcha';
import {
  enforcePublicFormLimit,
  enforceRateLimit,
  RATE_LIMITS,
} from './lib/rateLimit';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { assertTransition } from './lib/reviewState';
import { COUNTER, bumpCounter } from './lib/counters';
import { clampPageSize, paginatedValidator } from './lib/pagination';
import { isReservedEmail } from './lib/validation';
import { normalizeEmail } from './lib/onboarding';
import { checkFileContent, sanitizeFileName } from './lib/fileCheck';
import { CV_AI_NOTICE_VERSION, cvAiEnabled } from './lib/cercleCvAi';
import { confirmContactFromRequest } from './lib/cercleContacts';
import { sendEmail } from './email';
import {
  CERCLE_CHARTER_VERSION,
  CERCLE_NOTICE_VERSION,
  CERCLE_REQUEST_REVIEW,
  CV_FILE_NAME_MAX,
  cvMetadataVerdict,
  validateRequestInput,
} from './lib/cercle';
import {
  cercleApprovedEmail,
  cercleDeclinedEmail,
  cercleRequestReceivedEmail,
} from './lib/cercleEmails';
import { cercleRequestStatus } from './lib/tables/cercle';

// CERCLE DES AMIS — entry point of the Cercle's own functions.
//
// The status itself lives on the account (`users.amiSince`, see
// convex/lib/roles.ts for why it is NOT a role). This module only answers
// "what does the current session see of the Cercle", server-side: the
// interface reads it to decide which screen to show, and every Cercle
// function re-checks through `requireCercleAccess`.

export const accessLevel = v.union(
  // Not signed in, suspended, or a visitor without the Ami status.
  v.literal('none'),
  v.literal('ami'),
  // A validated member or above: already part of the network.
  v.literal('member'),
);

/** What the session may see of the Cercle. Never throws, never leaks data. */
export const access = query({
  args: {},
  returns: v.object({ level: accessLevel }),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user || !hasCercleAccess(user)) return { level: 'none' as const };
    // An Ami who also holds a member rank is reported as a member: the rank
    // is what they already had, the status adds nothing on top of it.
    return {
      level:
        isAmi(user) && effectiveRole(user.role) === 'visiteur'
          ? ('ami' as const)
          : ('member' as const),
    };
  },
});

// --- Request to join ------------------------------------------------------------
//
// The person has no account: the form is public. Three steps, none of which
// gives access to anything:
//   1. `generateCvUploadUrl` — a single-use storage URL, capped per IP;
//   2. the browser uploads the CV to it;
//   3. `submitRequest` — reCAPTCHA, the bytes of the CV are checked, then
//      `storeRequest` writes the pending request.
// The decision is the president's (`reviewRequest`, administrator only).

// --- CV upload bookkeeping (the HTTP endpoint is convex/cercleHttp.ts) --------------

/** Called BEFORE the body is read: the IP caps apply to the endpoint itself. */
export const reserveUpload = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await enforcePublicFormLimit(ctx, 'cercleRequest');
    return null;
  },
});

export const recordUpload = internalMutation({
  args: { storageId: v.id('_storage') },
  returns: v.null(),
  handler: async (ctx, { storageId }) => {
    await ctx.db.insert('cercleUploads', { storageId, createdAt: Date.now() });
    return null;
  },
});

// A CV nobody attached to a request is not kept: the blob and its row go after
// a day. Bounded batch, rescheduled while there is more to do.
export const UNCLAIMED_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
const PURGE_BATCH = 100;
export const purgeUnclaimedUploads = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const stale = await ctx.db
      .query('cercleUploads')
      .withIndex('by_createdAt', (q) =>
        q.lt('createdAt', Date.now() - UNCLAIMED_UPLOAD_TTL_MS),
      )
      .take(PURGE_BATCH);
    for (const row of stale) {
      try {
        await ctx.storage.delete(row.storageId);
      } catch {
        // Already gone: the row still goes.
      }
      await ctx.db.delete(row._id);
    }
    if (stale.length === PURGE_BATCH) {
      await ctx.scheduler.runAfter(
        0,
        internal.cercle.purgeUnclaimedUploads,
        {},
      );
    }
    return null;
  },
});

/**
 * What the public form needs to know about the deployment: whether to offer the
 * optional consent to the automatic CV reading. A single boolean, no secret.
 */
export const formConfig = query({
  args: {},
  returns: v.object({ cvAi: v.boolean() }),
  handler: async () => ({ cvAi: cvAiEnabled() }),
});

export const submitRequest = action({
  args: {
    name: v.string(),
    email: v.string(),
    country: v.optional(v.string()),
    motivation: v.optional(v.string()),
    locale: v.optional(locale),
    cvStorageId: v.id('_storage'),
    cvFileName: v.string(),
    // The two things the person must have accepted. `v.literal(true)`: a
    // client that does not send them is refused by the validator itself.
    acceptCharter: v.literal(true),
    acceptNotice: v.literal(true),
    // OPTIONAL: agrees that the CV is read with the help of an automatic tool
    // (only offered when the deployment has it on; ignored otherwise).
    acceptCvAi: v.optional(v.boolean()),
    captchaToken: v.optional(v.string()),
  },
  returns: v.id('cercleRequests'),
  handler: async (
    ctx,
    { captchaToken, ...input },
  ): Promise<Id<'cercleRequests'>> => {
    await enforceRecaptcha(captchaToken, 'cercle');

    // THE BYTES, not the label: a CV is a PDF (signature `%PDF-`). A refused
    // blob is deleted — nothing else will ever reference it.
    const blob = await ctx.storage.get(input.cvStorageId);
    if (!blob) throw new ConvexError('INVALID_FILE');
    const verdict = checkFileContent(
      'cv.pdf',
      new Uint8Array(await blob.arrayBuffer()),
    );
    if (!verdict.ok) {
      await ctx.storage.delete(input.cvStorageId);
      throw new ConvexError('FILE_CONTENT_MISMATCH');
    }

    try {
      return await ctx.runMutation(internal.cercle.storeRequest, input);
    } catch (err) {
      // Refused (duplicate, caps, invalid field): the CV is not kept.
      await ctx.storage.delete(input.cvStorageId);
      throw err;
    }
  },
});

export const storeRequest = internalMutation({
  args: {
    name: v.string(),
    email: v.string(),
    country: v.optional(v.string()),
    motivation: v.optional(v.string()),
    locale: v.optional(locale),
    cvStorageId: v.id('_storage'),
    cvFileName: v.string(),
    acceptCharter: v.literal(true),
    acceptNotice: v.literal(true),
    acceptCvAi: v.optional(v.boolean()),
  },
  returns: v.id('cercleRequests'),
  handler: async (ctx, args) => {
    const checked = validateRequestInput(args);
    if (!checked.ok) throw new ConvexError(checked.code);
    const { name, email, country, motivation } = checked.value;

    // The CV must come from the upload endpoint (size and PDF signature
    // already checked there) and not have been attached before: claiming it
    // deletes its upload row.
    const upload = await ctx.db
      .query('cercleUploads')
      .withIndex('by_storage', (q) => q.eq('storageId', args.cvStorageId))
      .unique();
    if (!upload) throw new ConvexError('INVALID_FILE');
    const meta = await ctx.db.system.get(args.cvStorageId);
    if (cvMetadataVerdict(meta) !== 'ok') throw new ConvexError('INVALID_FILE');

    await enforcePublicFormLimit(ctx, 'cercleRequest');
    await enforceRateLimit(ctx, {
      key: `cercle:${email}`,
      ...RATE_LIMITS.apply,
    });

    // ONE PENDING REQUEST PER ADDRESS (same rule as the membership queue).
    // Read through `by_email`: bounded by the address itself.
    const sameAddress = await ctx.db
      .query('cercleRequests')
      .withIndex('by_email', (q) => q.eq('email', email))
      .take(20);
    if (sameAddress.some((r) => r.status === 'pending')) {
      throw new ConvexError('DUPLICATE_REQUEST');
    }

    await ctx.db.delete(upload._id);
    const now = Date.now();
    const userId = await getActiveUserId(ctx);
    const id = await ctx.db.insert('cercleRequests', {
      email,
      name,
      ...(country ? { country } : {}),
      ...(motivation ? { motivation } : {}),
      ...(args.locale ? { locale: args.locale } : {}),
      ...(userId ? { applicantUserId: userId } : {}),
      cvStorageId: args.cvStorageId,
      cvFileName:
        sanitizeFileName(args.cvFileName, CV_FILE_NAME_MAX) || 'cv.pdf',
      cvSize: meta?.size,
      consent: {
        at: now,
        charterVersion: CERCLE_CHARTER_VERSION,
        noticeVersion: CERCLE_NOTICE_VERSION,
      },
      // The tool's consent is recorded only if the person gave it AND the
      // deployment offered it: a stale form cannot opt anyone in.
      ...(args.acceptCvAi === true && cvAiEnabled()
        ? { cvAiConsent: { at: now, noticeVersion: CV_AI_NOTICE_VERSION } }
        : {}),
      status: 'pending',
      submittedAt: now,
    });
    if (args.acceptCvAi === true && cvAiEnabled()) {
      await ctx.scheduler.runAfter(0, internal.cercleCvAi.summarize, {
        requestId: id,
      });
    }

    if (!isReservedEmail(email)) {
      await ctx.scheduler.runAfter(0, internal.cercle.sendReceipt, {
        email,
        locale: args.locale ?? 'fr',
      });
    }
    return id;
  },
});

export const sendReceipt = internalAction({
  args: { email: v.string(), locale },
  returns: v.null(),
  handler: async (_ctx, { email, locale: loc }) => {
    const { subject, html } = cercleRequestReceivedEmail({
      siteUrl: process.env.SITE_URL ?? 'http://localhost:3000',
      locale: loc,
    });
    await sendEmail({ to: email, subject, html });
    return null;
  },
});

// --- The president's screen -------------------------------------------------------

const requestRowValidator = v.object({
  _id: v.id('cercleRequests'),
  name: v.string(),
  email: v.string(),
  country: v.union(v.string(), v.null()),
  motivation: v.union(v.string(), v.null()),
  locale: v.union(locale, v.null()),
  status: cercleRequestStatus,
  submittedAt: v.number(),
  reviewedAt: v.union(v.number(), v.null()),
  reviewNotes: v.union(v.string(), v.null()),
  hasCv: v.boolean(),
  cvFileName: v.union(v.string(), v.null()),
  cvSize: v.union(v.number(), v.null()),
  cvDeleted: v.boolean(),
  charterVersion: v.string(),
  noticeVersion: v.string(),
  invited: v.boolean(),
  // The automatic summary of the CV, if there is one (administrators only: this
  // whole query is). `cvAiState` says why there is none.
  cvSummary: v.union(
    v.null(),
    v.object({
      overview: v.string(),
      education: v.array(v.string()),
      experience: v.array(v.string()),
      languages: v.array(v.string()),
      themes: v.array(v.string()),
    }),
  ),
  cvAiState: v.union(
    // No consent, tool off, or decided: nothing was or will be read by it.
    v.literal('none'),
    v.literal('pending'),
    v.literal('ready'),
    v.literal('failed'),
  ),
});

export const listRequests = query({
  args: {
    status: cercleRequestStatus,
    paginationOpts: paginationOptsValidator,
  },
  returns: paginatedValidator(requestRowValidator),
  handler: async (ctx, { status, paginationOpts }) => {
    await requireNetworkRole(ctx, 'admin');
    const result = await ctx.db
      .query('cercleRequests')
      .withIndex('by_status', (q) => q.eq('status', status))
      .order(status === 'pending' ? 'asc' : 'desc')
      .paginate(clampPageSize(paginationOpts));
    return {
      ...result,
      page: result.page.map((r) => ({
        _id: r._id,
        name: r.name,
        email: r.email,
        country: r.country ?? null,
        motivation: r.motivation ?? null,
        locale: r.locale ?? null,
        status: r.status,
        submittedAt: r.submittedAt,
        reviewedAt: r.reviewedAt ?? null,
        reviewNotes: r.reviewNotes ?? null,
        hasCv: r.cvStorageId !== undefined,
        cvFileName: r.cvFileName ?? null,
        cvSize: r.cvSize ?? null,
        cvDeleted: r.cvDeletedAt !== undefined,
        charterVersion: r.consent.charterVersion,
        noticeVersion: r.consent.noticeVersion,
        invited: r.invitedAt !== undefined,
        cvSummary: r.cvSummary
          ? {
              overview: r.cvSummary.overview,
              education: r.cvSummary.education,
              experience: r.cvSummary.experience,
              languages: r.cvSummary.languages,
              themes: r.cvSummary.themes,
            }
          : null,
        cvAiState: r.cvSummary
          ? ('ready' as const)
          : r.status !== 'pending' || !r.cvAiConsent || !r.cvStorageId
            ? ('none' as const)
            : r.cvSummaryFailedAt !== undefined
              ? ('failed' as const)
              : ('pending' as const),
      })),
    };
  },
});

/** How many requests wait for a decision (bounded read). */
export const pendingCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'admin');
    return (
      await ctx.db
        .query('cercleRequests')
        .withIndex('by_status', (q) => q.eq('status', 'pending'))
        .take(500)
    ).length;
  },
});

// OPENING A CV IS A WRITE: it is personal data, so who looked at it, and when,
// is kept in the audit log. A mutation, not a query, for that reason.
export const openCv = mutation({
  args: { requestId: v.id('cercleRequests') },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { requestId }) => {
    const admin = await requireNetworkRole(ctx, 'admin');
    const request = await ctx.db.get(requestId);
    if (!request?.cvStorageId) return null;
    await recordAudit(ctx, {
      actorId: admin._id,
      action: AUDIT.CERCLE_CV_VIEWED,
      targetId: requestId,
    });
    return await ctx.storage.getUrl(request.cvStorageId);
  },
});

export const reviewRequest = mutation({
  args: {
    requestId: v.id('cercleRequests'),
    decision: v.union(v.literal('approved'), v.literal('rejected')),
    notes: v.optional(v.string()),
  },
  returns: v.object({ userId: v.union(v.id('users'), v.null()) }),
  handler: async (ctx, { requestId, decision, notes }) => {
    const admin = await requireNetworkRole(ctx, 'admin');
    const request = await ctx.db.get(requestId);
    if (!request) throw new ConvexError('NOT_FOUND');
    // A decision is not replayed, nor reversed by a second click.
    assertTransition(request.status, decision, CERCLE_REQUEST_REVIEW);

    const now = Date.now();
    const common = {
      status: decision,
      reviewedBy: admin._id,
      reviewedAt: now,
      ...(notes?.trim() ? { reviewNotes: notes.trim().slice(0, 2000) } : {}),
    };

    if (decision === 'rejected') {
      // REFUSED: the CV leaves our storage at once, in the same transaction.
      if (request.cvStorageId) await ctx.storage.delete(request.cvStorageId);
      await ctx.db.patch(requestId, {
        ...common,
        cvStorageId: undefined,
        cvDeletedAt: request.cvStorageId ? now : undefined,
        // What the tool derived from the CV goes with the CV.
        cvSummary: undefined,
        cvSummaryFailedAt: undefined,
      });
      await recordAudit(ctx, {
        actorId: admin._id,
        action: AUDIT.CERCLE_REQUEST_REVIEWED,
        targetId: requestId,
        metadata: { decision },
      });
      if (!isReservedEmail(request.email)) {
        await ctx.scheduler.runAfter(0, internal.cercle.sendDecision, {
          requestId,
          email: request.email,
          decision,
          locale: request.locale ?? 'fr',
        });
      }
      return { userId: null };
    }

    // APPROVED: the account is made an Ami. An existing account keeps its rank
    // (never touched); a missing one is created as a plain visitor, which is
    // all an Ami is for the rest of the platform.
    const email = normalizeEmail(request.email);
    let user = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', email))
      .first();
    if (!user) {
      const id = await ctx.db.insert('users', {
        email,
        role: 'visiteur',
        amiSince: now,
        amiGrantedBy: admin._id,
        ...(request.locale ? { preferredLocale: request.locale } : {}),
      });
      await bumpCounter(ctx, COUNTER.USERS, 1);
      user = (await ctx.db.get(id))!;
      await recordAudit(ctx, {
        actorId: admin._id,
        action: AUDIT.USER_INVITED,
        targetId: id,
        metadata: { via: 'cercle', email },
      });
    } else if (!isAmi(user)) {
      await ctx.db.patch(user._id, { amiSince: now, amiGrantedBy: admin._id });
    }
    await ctx.db.patch(requestId, { ...common, memberUserId: user._id });
    // The notice shown at the form said the person would receive the Cercle's
    // news: that is their consent, kept with the versions they accepted. They go
    // on the mailing list as confirmed (an earlier unsubscribe is lifted by this
    // new, informed request).
    await confirmContactFromRequest(ctx, {
      email,
      locale: request.locale,
      consentAt: request.consent.at,
      textVersion: request.consent.noticeVersion,
    });
    await recordAudit(ctx, {
      actorId: admin._id,
      action: AUDIT.USER_AMI_GRANTED,
      targetId: user._id,
      metadata: { reason: 'cercle_request', requestId },
    });
    await recordAudit(ctx, {
      actorId: admin._id,
      action: AUDIT.CERCLE_REQUEST_REVIEWED,
      targetId: requestId,
      metadata: { decision },
    });
    if (!isReservedEmail(email)) {
      await ctx.scheduler.runAfter(0, internal.cercle.sendDecision, {
        requestId,
        email,
        decision,
        locale: request.locale ?? 'fr',
      });
    }
    return { userId: user._id };
  },
});

export const sendDecision = internalAction({
  args: {
    requestId: v.id('cercleRequests'),
    email: v.string(),
    decision: v.union(v.literal('approved'), v.literal('rejected')),
    locale,
  },
  returns: v.null(),
  handler: async (ctx, { requestId, email, decision, locale: loc }) => {
    const siteUrl = process.env.SITE_URL ?? 'http://localhost:3000';
    const { subject, html } =
      decision === 'approved'
        ? cercleApprovedEmail({ siteUrl, locale: loc })
        : cercleDeclinedEmail({ siteUrl, locale: loc });
    await sendEmail({ to: email, subject, html });
    if (decision === 'approved') {
      await ctx.runMutation(internal.cercle.markInvited, { requestId });
    }
    return null;
  },
});

export const markInvited = internalMutation({
  args: { requestId: v.id('cercleRequests') },
  returns: v.null(),
  handler: async (ctx, { requestId }) => {
    await ctx.db.patch(requestId, { invitedAt: Date.now() });
    return null;
  },
});
