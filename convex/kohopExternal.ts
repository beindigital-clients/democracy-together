import { v, ConvexError } from 'convex/values';
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { internal } from './_generated/api';
import { locale } from './schema';
import { sendEmail } from './email';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { COUNTER, bumpCounter } from './lib/counters';
import { enforcePublicFormLimit, enforceRateLimit } from './lib/rateLimit';
import { isEmail } from './lib/validation';
import { normalizeEmail } from './lib/onboarding';
import {
  hashToken,
  isTokenShaped,
  newConfirmToken,
} from './lib/newsletterOptIn';
import {
  KOHOP_BOUNDS,
  KOHOP_DELAYS_MS,
  KOHOP_REVIEWER_CONSENT_VERSION,
  KOHOP_ACTIVE_REVIEWER_STATUSES,
} from './lib/kohop';
import { isHttpsUrl } from './lib/kohopText';
import { collectLinkFacts } from './lib/kohopLinkFacts';
import {
  evaluateLinks,
  isDeclaredRelationship,
  linkLevel,
} from './lib/kohopLinks';
import { externalInvitationEmail } from './lib/kohopEmails';
import {
  recordKohopEvent,
  requireOwnContribution,
  versionOf,
} from './lib/kohopAccess';
import { replaceTitular } from './lib/kohopReviewing';
import { EDITABLE } from './kohop';

// KOHOP — EXTERNAL REVIEWERS (second recourse, K-20/K-21). When the directory is
// not enough, the author proposes someone outside the network. The review chief
// approves; the invitation goes by e-mail with a ONE-TIME link:
//  - a 256-bit token, of which only the SHA-256 is stored (as for the newsletter
//    confirmation); it is drawn in the sending ACTION, never in a scheduled
//    function's arguments;
//  - it expires with the reply deadline, serves once, and only with the address
//    it was sent to;
//  - the answer is the SAME whatever is wrong (unknown, expired, used, wrong
//    address) and whether or not an account exists for that address;
//  - accepting creates the account WITHOUT a rank (`visiteur`) — self sign-up is
//    closed, so it is the acceptance that opens one — audited `USER_INVITED`,
//    `via: 'kohop'`. The person then signs in with a code sent to that address.

const HOUR = 60 * 60 * 1000;
const SIX_MONTHS = 183 * 24 * HOUR;
const PURGE_BATCH = 100;

function refuse(code: string): never {
  throw new ConvexError(code);
}

// --- The author proposes someone outside ----------------------------------------

export const proposeExternalReviewer = mutation({
  args: {
    contributionId: v.id('kohopContributions'),
    slot: v.union(v.literal('titular'), v.literal('substitute')),
    name: v.string(),
    email: v.string(),
    affiliation: v.string(),
    // A public page that attests the person's identity and position.
    publicUrl: v.string(),
    // Why this person.
    rationale: v.string(),
    declaredRelationship: v.string(),
  },
  returns: v.id('kohopReviewers'),
  handler: async (ctx, args) => {
    const { user, contribution } = await requireOwnContribution(
      ctx,
      args.contributionId,
    );
    if (
      !EDITABLE.includes(contribution.stage) &&
      !['submitted', 'in_review', 'revision'].includes(contribution.stage)
    ) {
      refuse('NOT_EDITABLE');
    }
    if (!isDeclaredRelationship(args.declaredRelationship)) {
      refuse('INVALID_RELATIONSHIP');
    }
    await enforceRateLimit(ctx, {
      key: `kohop:external:${user._id}`,
      max: 10,
      windowMs: HOUR,
    });

    const name = args.name.trim().replace(/\s+/g, ' ');
    const email = normalizeEmail(args.email);
    const affiliation = args.affiliation.trim();
    const publicUrl = args.publicUrl.trim();
    const rationale = args.rationale.trim();
    if (
      name.length < 2 ||
      name.length > 120 ||
      !isEmail(email) ||
      affiliation.length > 200 ||
      !isHttpsUrl(publicUrl) ||
      publicUrl.length > KOHOP_BOUNDS.links.url ||
      rationale.length < 20 ||
      rationale.length > 1000
    ) {
      refuse('INVALID_EXTERNAL');
    }

    const existing = await ctx.db
      .query('kohopReviewers')
      .withIndex('by_contribution', (q) =>
        q.eq('contributionId', contribution._id),
      )
      .take(30);
    const active = existing.filter((r) =>
      KOHOP_ACTIVE_REVIEWER_STATUSES.includes(r.status),
    );
    if (active.some((r) => r.email === email)) {
      refuse('REVIEWER_ALREADY_PROPOSED');
    }
    const limit =
      args.slot === 'titular'
        ? KOHOP_BOUNDS.reviewers.titular
        : KOHOP_BOUNDS.reviewers.substitute;
    if (active.filter((r) => r.slot === args.slot).length >= limit) {
      refuse('SLOT_FULL');
    }

    // The same server rules as for a member: the author, a co-author (by
    // address), a declared relationship refuse the designation; the rest is
    // flagged for the review chief.
    const account = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', email))
      .first();
    const facts = await collectLinkFacts(ctx, {
      contribution,
      candidate: { userId: account?._id, email, name },
      declaredRelationship: args.declaredRelationship,
    });
    const findings = evaluateLinks(facts);
    const level = linkLevel(facts);
    if (level === 'blocking') {
      await recordKohopEvent(ctx, {
        contributionId: contribution._id,
        kind: 'link_checked',
        actorId: user._id,
        metadata: {
          candidateEmail: email,
          level,
          findings: findings.map((f) => ({ type: f.type, detail: f.detail })),
        },
      });
      refuse('REVIEWER_NOT_ELIGIBLE');
    }

    const now = Date.now();
    const reviewerId = await ctx.db.insert('kohopReviewers', {
      contributionId: contribution._id,
      slot: args.slot,
      source: 'external',
      name,
      email,
      affiliation: affiliation || undefined,
      publicUrl,
      rationale,
      declaredRelationship: args.declaredRelationship,
      status: 'proposed',
      flags: findings.map((f) => f.type),
      remindersSent: 0,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert('kohopLinkChecks', {
      contributionId: contribution._id,
      reviewerId,
      level,
      findings: findings.map((f) => ({
        type: f.type,
        detail: f.detail,
        source: f.source,
      })),
      origin: 'rules',
      checkedAt: now,
    });
    await recordKohopEvent(ctx, {
      contributionId: contribution._id,
      kind: 'reviewer_proposed',
      actorId: user._id,
      metadata: { reviewerId, slot: args.slot, external: true },
    });
    await recordAudit(ctx, {
      actorId: user._id,
      action: AUDIT.KOHOP_REVIEWER_PROPOSED,
      targetId: contribution._id,
      metadata: { reviewerId, slot: args.slot, level, external: true },
    });
    return reviewerId;
  },
});

// --- Sending the invitation (action: draws the token) ------------------------------

export const armInvitation = internalMutation({
  args: {
    reviewerId: v.id('kohopReviewers'),
    tokenHash: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      email: v.string(),
      locale,
      title: v.string(),
      dueAt: v.number(),
    }),
  ),
  handler: async (ctx, { reviewerId, tokenHash }) => {
    const reviewer = await ctx.db.get(reviewerId);
    // Only a pending invitation to someone without an account yet.
    if (
      !reviewer ||
      reviewer.source !== 'external' ||
      reviewer.status !== 'invited' ||
      reviewer.userId ||
      !reviewer.email ||
      reviewer.dueAt === undefined
    ) {
      return null;
    }
    const file = await ctx.db.get(reviewer.contributionId);
    if (!file) return null;
    await ctx.db.patch(reviewerId, {
      // A NEW token replaces the previous one: only the latest link works.
      inviteTokenHash: tokenHash,
      inviteTokenExpiresAt: reviewer.dueAt,
      updatedAt: Date.now(),
    });
    return {
      email: reviewer.email,
      // The invitee's language is unknown: the text's own language.
      locale: file.lang,
      title: file.title,
      dueAt: reviewer.dueAt,
    };
  },
});

export const sendInvitation = internalAction({
  args: {
    reviewerId: v.id('kohopReviewers'),
    kind: v.union(v.literal('invitation'), v.literal('reminder')),
  },
  returns: v.null(),
  handler: async (ctx, { reviewerId, kind }) => {
    const token = newConfirmToken();
    const target = await ctx.runMutation(internal.kohopExternal.armInvitation, {
      reviewerId,
      tokenHash: await hashToken(token),
    });
    if (!target) return null;
    const mail = externalInvitationEmail({
      siteUrl: process.env.SITE_URL ?? 'http://localhost:3000',
      locale: target.locale,
      token,
      title: target.title,
      dueLabel: new Intl.DateTimeFormat(target.locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      }).format(target.dueAt),
      reminder: kind === 'reminder',
    });
    try {
      await sendEmail({
        to: target.email,
        subject: mail.subject,
        html: mail.html,
      });
    } catch (err) {
      console.error(
        `KOHOP external invitation not sent (${err instanceof Error ? err.message : String(err)})`,
      );
      return null;
    }
    // DEV/TEST only: outbox readable by the E2E, like the newsletter's.
    if (process.env.AUTH_DEV_OTP === 'true') {
      await ctx.runMutation(internal.newsletter._devRecordOutbox, {
        to: target.email,
        kind: 'kohop-invitation',
        subject: mail.subject,
        link: mail.url,
      });
    }
    return null;
  },
});

/** DEV/TEST only: the latest invitation link sent to an address. */
export const devInvitationLink = internalQuery({
  args: { email: v.string() },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, { email }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') return null;
    const rows = await ctx.db.query('devOutbox').order('desc').take(50);
    const to = normalizeEmail(email);
    return (
      rows.find((r) => r.kind === 'kohop-invitation' && r.to === to)?.link ??
      null
    );
  },
});

// --- Answering without an account ---------------------------------------------------

// `null` for EVERY failure (malformed, unknown, expired, used, wrong address): the
// caller answers `{ ok: false }` and COMMITS, so that a failed attempt still
// consumes its share of the rate limits (a throw would roll the counters back).
async function findInvitation(ctx: MutationCtx, token: string, email: string) {
  const clean = token.trim().toLowerCase();
  const shaped = isTokenShaped(clean);
  const tokenHash = shaped ? await hashToken(clean) : 'malformed';
  // Noise guard per token, next to the per-IP and global caps.
  await enforceRateLimit(ctx, {
    key: `kohop:inv:${tokenHash.slice(0, 16)}`,
    max: 20,
    windowMs: HOUR,
  });
  if (!shaped) return null;
  const reviewer = await ctx.db
    .query('kohopReviewers')
    .withIndex('by_tokenHash', (q) => q.eq('inviteTokenHash', tokenHash))
    .unique();
  const now = Date.now();
  if (
    !reviewer ||
    reviewer.source !== 'external' ||
    reviewer.status !== 'invited' ||
    reviewer.inviteTokenExpiresAt === undefined ||
    reviewer.inviteTokenExpiresAt < now ||
    // Another address than the one invited: same refusal.
    normalizeEmail(email) !== reviewer.email
  ) {
    return null;
  }
  const file = await ctx.db.get(reviewer.contributionId);
  if (!file || file.stage !== 'in_review') return null;
  return { reviewer, file };
}

/**
 * What the page shows before the person answers: only what an invitation needs,
 * and the SAME answer for every kind of failure.
 */
export const getInvitation = query({
  args: { token: v.string() },
  returns: v.union(
    v.object({ valid: v.literal(false) }),
    v.object({
      valid: v.literal(true),
      title: v.string(),
      standfirst: v.string(),
      lang: v.string(),
      dueAt: v.number(),
    }),
  ),
  handler: async (ctx, { token }) => {
    const clean = token.trim().toLowerCase();
    if (!isTokenShaped(clean)) return { valid: false as const };
    const tokenHash = await hashToken(clean);
    const reviewer = await ctx.db
      .query('kohopReviewers')
      .withIndex('by_tokenHash', (q) => q.eq('inviteTokenHash', tokenHash))
      .unique();
    if (
      !reviewer ||
      reviewer.source !== 'external' ||
      reviewer.status !== 'invited' ||
      reviewer.inviteTokenExpiresAt === undefined ||
      reviewer.inviteTokenExpiresAt < Date.now()
    ) {
      return { valid: false as const };
    }
    const file = await ctx.db.get(reviewer.contributionId);
    if (!file || file.stage !== 'in_review') return { valid: false as const };
    const version = await versionOf(
      ctx,
      file._id,
      file.reviewedVersion ?? file.currentVersion,
    );
    return {
      valid: true as const,
      title: version?.title ?? file.title,
      standfirst: version?.standfirst ?? '',
      lang: file.lang,
      dueAt: reviewer.inviteTokenExpiresAt,
    };
  },
});

export const respondExternal = mutation({
  args: {
    token: v.string(),
    email: v.string(),
    accept: v.boolean(),
    hasConflict: v.boolean(),
    consent: v.optional(v.boolean()),
    note: v.optional(v.string()),
    suggestedName: v.optional(v.string()),
    suggestedEmail: v.optional(v.string()),
  },
  returns: v.object({ ok: v.boolean(), accepted: v.boolean() }),
  handler: async (ctx, args) => {
    await enforcePublicFormLimit(ctx, 'kohopInvitation');
    const found = await findInvitation(ctx, args.token, args.email);
    if (!found) return { ok: false, accepted: false };
    const { reviewer, file } = found;
    const now = Date.now();
    const note = args.note?.trim() || undefined;
    const suggestedName = args.suggestedName?.trim() || undefined;
    const suggestedEmail =
      args.suggestedEmail?.trim().toLowerCase() || undefined;
    if (
      (note && note.length > 1000) ||
      (suggestedName && suggestedName.length > 120) ||
      (suggestedEmail && !isEmail(suggestedEmail))
    ) {
      refuse('INVALID_NOTE');
    }

    if (args.accept) {
      if (args.hasConflict) refuse('CONFLICT_DECLARED');
      if (args.consent !== true) refuse('CONSENT_REQUIRED');
      // The account: created WITHOUT a rank when none exists for the address;
      // an existing account is linked and left exactly as it is.
      const email = reviewer.email as string;
      const account = await ctx.db
        .query('users')
        .withIndex('email', (q) => q.eq('email', email))
        .first();
      let userId = account?._id;
      if (!userId) {
        userId = await ctx.db.insert('users', {
          email,
          name: reviewer.name,
          role: 'visiteur',
        });
        await bumpCounter(ctx, COUNTER.USERS, 1);
        await recordAudit(ctx, {
          action: AUDIT.USER_INVITED,
          targetId: userId,
          metadata: { email, role: 'visiteur', via: 'kohop' },
        });
      }
      await ctx.db.patch(reviewer._id, {
        userId,
        status: 'accepted',
        respondedAt: now,
        dueAt: now + KOHOP_DELAYS_MS.analysis,
        remindersSent: 0,
        // Single use.
        inviteTokenHash: undefined,
        inviteTokenExpiresAt: undefined,
        conflict: { hasConflict: false, declaredAt: now },
        publicationConsentAt: now,
        publicationConsentVersion: KOHOP_REVIEWER_CONSENT_VERSION,
        updatedAt: now,
      });
      await recordKohopEvent(ctx, {
        contributionId: file._id,
        kind: 'reviewer_accepted',
        metadata: { reviewerId: reviewer._id, external: true },
      });
      await recordAudit(ctx, {
        actorId: userId,
        action: AUDIT.KOHOP_REVIEWER_ACCEPTED,
        targetId: file._id,
        metadata: { reviewerId: reviewer._id, external: true },
      });
      return { ok: true, accepted: true };
    }

    await ctx.db.patch(reviewer._id, {
      status: 'declined',
      respondedAt: now,
      dueAt: undefined,
      inviteTokenHash: undefined,
      inviteTokenExpiresAt: undefined,
      conflict: args.hasConflict
        ? { hasConflict: true, declaredAt: now }
        : undefined,
      suggestedInstead: suggestedName
        ? { name: suggestedName, email: suggestedEmail, note }
        : undefined,
      updatedAt: now,
    });
    await recordKohopEvent(ctx, {
      contributionId: file._id,
      kind: 'reviewer_declined',
      metadata: { reviewerId: reviewer._id, external: true },
    });
    await recordAudit(ctx, {
      action: AUDIT.KOHOP_REVIEWER_DECLINED,
      targetId: file._id,
      metadata: { reviewerId: reviewer._id, external: true },
    });
    if (reviewer.slot === 'titular') {
      await replaceTitular(ctx, file, reviewer);
    }
    return { ok: true, accepted: false };
  },
});

// --- Purge (6 months) ------------------------------------------------------------------

/**
 * Declined, expired or rejected external invitations are DELETED after six
 * months (minimization): the person's name, address and public link go with
 * them. Runs daily; a backlog drains over the next runs.
 */
export const purge = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const before = Date.now() - SIX_MONTHS;
    let deleted = 0;
    for (const status of ['declined', 'expired', 'recused'] as const) {
      const rows = await ctx.db
        .query('kohopReviewers')
        .withIndex('by_source_and_status', (q) =>
          q.eq('source', 'external').eq('status', status),
        )
        .take(PURGE_BATCH);
      for (const row of rows) {
        if (row.updatedAt >= before) continue;
        const checks = await ctx.db
          .query('kohopLinkChecks')
          .withIndex('by_reviewer', (q) => q.eq('reviewerId', row._id))
          .take(50);
        for (const c of checks) await ctx.db.delete(c._id);
        await ctx.db.delete(row._id);
        deleted += 1;
      }
    }
    if (deleted > 0) {
      await recordAudit(ctx, {
        action: AUDIT.KOHOP_DATA_DELETED,
        metadata: { scope: 'external-invitations', deleted },
      });
    }
    return deleted;
  },
});
