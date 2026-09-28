import { v, ConvexError } from 'convex/values';
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import { internal } from './_generated/api';
import { FIELD_MAX, isEmail } from './lib/validation';
import {
  enforcePublicFormLimit,
  enforceRateLimit,
  RATE_LIMITS,
} from './lib/rateLimit';
import { enforceRecaptcha } from './lib/recaptcha';
import { requireNetworkRole } from './lib/rbac';
import { trackYouthApplicationStatus } from './lib/counters';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { assertTransition, type ReviewMachine } from './lib/reviewState';
import { locale } from './schema';
import type { Doc } from './_generated/dataModel';

// --- Public application to the Youth hub (F-58) ------------------------------
// Without an account (by email), like membership. Rate-limited; one pending
// application per email (soft deduplication) to avoid multiple submissions.
// Anti-spam gate: the action checks reCAPTCHA v3 then delegates to
// `storeApplication` (internalMutation -> cannot be bypassed).
export const applyYouth = action({
  args: {
    name: v.string(),
    email: v.string(),
    country: v.string(),
    themes: v.optional(v.array(v.string())),
    motivation: v.string(),
    locale: v.optional(locale),
    captchaToken: v.optional(v.string()),
  },
  handler: async (ctx, { captchaToken, ...input }) => {
    await enforceRecaptcha(captchaToken, 'youth_apply');
    // EXISTENCE ORACLE CLOSED (pentest M-8, audit F-09).
    //
    // The internal mutation still distinguishes "already known" from "new" —
    // it needs to, so as not to duplicate or recount. But this
    // distinction NO LONGER CROSSES the public boundary: this action is
    // open, unauthenticated, and returned `already: true/false`. A single
    // request was therefore enough to know whether a given address is in our
    // lists — membership of an activist network, registration for an event.
    // The per-IP and per-form caps slow down enumeration; they
    // change nothing for a targeted check, which costs only one call.
    //
    // The response is now IDENTICAL in both cases. Nothing is lost
    // product-wise: no form read `already` — they all display the
    // same success message (checked on all five).
    await ctx.runMutation(internal.youth.storeApplication, input);
    return { ok: true };
  },
});

export const storeApplication = internalMutation({
  args: {
    name: v.string(),
    email: v.string(),
    country: v.string(),
    themes: v.optional(v.array(v.string())),
    motivation: v.string(),
    locale: v.optional(locale),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    const email = args.email.trim().toLowerCase();
    const country = args.country.trim();
    const motivation = args.motivation.trim();
    if (name.length < 2 || name.length > FIELD_MAX.name)
      throw new Error('INVALID_NAME');
    if (!isEmail(email)) throw new Error('INVALID_EMAIL');
    if (country.length < 2 || country.length > FIELD_MAX.country)
      throw new Error('INVALID_COUNTRY');
    // Bound shared with the form (`maxLength` + counter); the code
    // travels as a `ConvexError` so that a refusal says "4 000 caractères
    // maximum" and not "L'envoi a échoué" (A-04, measured with 5,000 chars).
    if (motivation.length < 10 || motivation.length > FIELD_MAX.body) {
      throw new ConvexError('INVALID_MOTIVATION');
    }

    // UNFORGEABLE caps (audit M2) — per IP and global per form:
    // changing address no longer yields a fresh quota. Cf. lib/rateLimit.ts.
    await enforcePublicFormLimit(ctx, 'youthApply');

    await enforceRateLimit(ctx, {
      key: `youthApply:${email}`,
      ...RATE_LIMITS.apply,
    });

    const existing = await ctx.db
      .query('youthApplications')
      .withIndex('by_email', (q) => q.eq('email', email))
      .collect();
    if (existing.some((a) => a.status === 'pending')) {
      return { ok: true, already: true };
    }

    await ctx.db.insert('youthApplications', {
      name,
      email,
      country,
      themes: args.themes?.length ? args.themes : undefined,
      motivation,
      locale: args.locale,
      status: 'pending',
      createdAt: Date.now(),
    });
    await trackYouthApplicationStatus(ctx, null, 'pending');
    return { ok: true, already: false };
  },
});

// --- Back office (moderator and above) ----------------------------------
export const listYouthApplications = query({
  // CLOSED domain (mirror of the schema): the back office only offers these
  // values, the validator enforces them. No filter -> the whole queue.
  args: {
    status: v.optional(
      v.union(
        v.literal('pending'),
        v.literal('approved'),
        v.literal('rejected'),
      ),
    ),
  },
  handler: async (ctx, { status }) => {
    await requireNetworkRole(ctx, 'moderateur');
    const all = status
      ? await ctx.db
          .query('youthApplications')
          .withIndex('by_status', (q) => q.eq('status', status))
          .collect()
      : await ctx.db.query('youthApplications').collect();
    return all
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((a) => ({
        _id: a._id,
        name: a.name,
        email: a.email,
        country: a.country,
        themes: a.themes ?? [],
        motivation: a.motivation,
        status: a.status,
        createdAt: a.createdAt,
        // The note entered at decision time (27/09 campaign, A-08): it was
        // stored but never returned, hence invisible in "Toutes".
        reviewNotes: a.reviewNotes ?? null,
      }));
  },
});

// --- State machine for the youth application review (issue #9) --------
//
//   pending ──approved/rejected──► approved | rejected
//   approved | rejected ──reopenYouthApplication──► pending
//
// Side effect of the decision: NONE. Unlike membership
// (`organizations.reviewApplication`, PR #4), approving a youth application
// creates neither account nor role — reversing it would therefore leave no privilege
// behind. Silent reversal remains refused for the issue's other
// reason: the mutation is AUDITED, and a log that piles up "approuvée",
// "rejetée", "approuvée" no longer says which of the three is authoritative.
//
// Reopening remains possible — people click the wrong button — but through the
// named transition `reopenYouthApplication`, recorded under `youth.reopened`.
const YOUTH_REVIEW: ReviewMachine<Doc<'youthApplications'>['status']> = {
  transitions: {
    pending: ['approved', 'rejected'],
    approved: ['pending'],
    rejected: ['pending'],
  },
  decided: ['approved', 'rejected'],
};

export const reviewYouthApplication = mutation({
  args: {
    applicationId: v.id('youthApplications'),
    decision: v.union(v.literal('approved'), v.literal('rejected')),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { applicationId, decision, notes }) => {
    const reviewer = await requireNetworkRole(ctx, 'moderateur');
    const application = await ctx.db.get(applicationId);
    if (!application) throw new Error('NOT_FOUND');
    assertTransition(application.status, decision, YOUTH_REVIEW);

    await ctx.db.patch(applicationId, {
      status: decision,
      reviewedBy: reviewer._id,
      reviewNotes: notes?.trim() || undefined,
      reviewedAt: Date.now(),
    });
    await trackYouthApplicationStatus(ctx, application.status, decision);
    await recordAudit(ctx, {
      actorId: reviewer._id,
      action: AUDIT.YOUTH_REVIEWED,
      targetId: applicationId,
      metadata: { decision },
    });
    return { ok: true };
  },
});

// Reopening of a decided application (issue #9) — moderator and above,
// audited under its own action. The application returns to the queue, and the
// log shows the going back instead of hiding it behind a
// second "youth.reviewed" row. The rejection note is kept: it says
// why the original decision was made.
export const reopenYouthApplication = mutation({
  args: { applicationId: v.id('youthApplications') },
  handler: async (ctx, { applicationId }) => {
    const reviewer = await requireNetworkRole(ctx, 'moderateur');
    const application = await ctx.db.get(applicationId);
    if (!application) throw new Error('NOT_FOUND');
    const from = application.status;
    assertTransition(from, 'pending', YOUTH_REVIEW);

    await ctx.db.patch(applicationId, { status: 'pending' });
    // The application returns to the queue: the dashboard counter
    // counts it again (issue #8).
    await trackYouthApplicationStatus(ctx, from, 'pending');
    await recordAudit(ctx, {
      actorId: reviewer._id,
      action: AUDIT.YOUTH_REOPENED,
      targetId: applicationId,
      metadata: { from },
    });
    return { ok: true };
  },
});

// DEV/TEST only (AUTH_DEV_OTP guard): checks the actual storage in E2E.
export const isYouthApplicant = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') return null;
    const rows = await ctx.db
      .query('youthApplications')
      .withIndex('by_email', (q) => q.eq('email', email.trim().toLowerCase()))
      .collect();
    return rows.length > 0;
  },
});
