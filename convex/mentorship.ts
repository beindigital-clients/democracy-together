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
import { getCurrentUser, requireNetworkRole } from './lib/rbac';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { assertTransition, type ReviewMachine } from './lib/reviewState';
import { locale } from './schema';
import type { Doc } from './_generated/dataModel';

// --- Mentoring: matchmaking (F-59) -----------------------------------------
// Makes real the "Demander un mentor" / "Trouver mon mentor" intent of the
// Youth hub. No account needed (by email, like the F-58 application). One signs up
// as "mentore" (looking for a mentor) or "mentor" (offering help).
// Rate-limited; soft deduplication: one pending request per (email, role).
// Anti-spam gate: the action checks reCAPTCHA v3 then delegates to
// `storeRequest` (internalMutation -> cannot be bypassed).
export const requestMentorship = action({
  args: {
    name: v.string(),
    email: v.string(),
    country: v.string(),
    role: v.union(v.literal('mentore'), v.literal('mentor')),
    themes: v.optional(v.array(v.string())),
    message: v.string(),
    locale: v.optional(locale),
    captchaToken: v.optional(v.string()),
  },
  handler: async (ctx, { captchaToken, ...input }) => {
    await enforceRecaptcha(captchaToken, 'mentorship');
    // EXISTENCE ORACLE CLOSED (pentest M-8, audit F-09).
    //
    // The internal mutation still distinguishes "already known" from "new" —
    // it needs to, so as not to duplicate or double-count. But this
    // distinction NO LONGER CROSSES the public boundary: this action is
    // open, unauthenticated, and used to return `already: true/false`. A single
    // request was therefore enough to know whether a given address is in our
    // lists — membership of an activist network, registration for an event.
    // Per-IP and per-form caps slow down enumeration; they
    // change nothing for a targeted check, which costs only one call.
    //
    // The response is now IDENTICAL in both cases. Nothing is lost
    // product-wise: no form read `already` — they all display the
    // same success message (checked on all five).
    await ctx.runMutation(internal.mentorship.storeRequest, input);
    return { ok: true };
  },
});

export const storeRequest = internalMutation({
  args: {
    name: v.string(),
    email: v.string(),
    country: v.string(),
    role: v.union(v.literal('mentore'), v.literal('mentor')),
    themes: v.optional(v.array(v.string())),
    message: v.string(),
    locale: v.optional(locale),
  },
  handler: async (ctx, args) => {
    const name = args.name.trim();
    const email = args.email.trim().toLowerCase();
    const country = args.country.trim();
    const message = args.message.trim();
    if (name.length < 2 || name.length > 120) throw new Error('INVALID_NAME');
    if (!isEmail(email)) throw new Error('INVALID_EMAIL');
    if (country.length < 2) throw new Error('INVALID_COUNTRY');
    if (message.length < 10 || message.length > FIELD_MAX.body) {
      throw new ConvexError('INVALID_MESSAGE');
    }

    // UNFORGEABLE caps (audit M2) — per IP and global per form:
    // changing address no longer yields a fresh quota. See lib/rateLimit.ts.
    await enforcePublicFormLimit(ctx, 'mentorship');

    await enforceRateLimit(ctx, {
      key: `mentorship:${email}`,
      ...RATE_LIMITS.apply,
    });

    // Soft deduplication: one pending request per (email, role). So one can
    // sign up both as mentee AND mentor, but not twice in the
    // same role while the first one is pending.
    const existing = await ctx.db
      .query('mentorshipRequests')
      .withIndex('by_email', (q) => q.eq('email', email))
      .collect();
    if (existing.some((m) => m.status === 'pending' && m.role === args.role)) {
      return { ok: true, already: true };
    }

    await ctx.db.insert('mentorshipRequests', {
      name,
      email,
      country,
      role: args.role,
      themes: args.themes?.length ? args.themes : undefined,
      message,
      locale: args.locale,
      status: 'pending',
      createdAt: Date.now(),
    });
    return { ok: true, already: false };
  },
});

// --- My request (signed-in member) ------------------------------------------
// Mentoring had NO member journey (A-13): a public form on one
// side, a matching queue on the other, and the requester learned nothing —
// neither that their request is pending, nor that it was matched or closed.
// This query returns to a signed-in account ITS requests, found by
// its account address (verified at sign-in by code): one per role,
// with the status. An anonymous visitor or an account without an address gets
// an empty list, never an error — the /jeunes page is public.
//
// What remains out of scope here, and belongs to a separate feature:
// choosing the mentor, following the pair, notifying the requester on
// matching (no `notify`/`sendEmail` in this module).
export const myMentorshipRequest = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('mentorshipRequests'),
      role: v.union(v.literal('mentore'), v.literal('mentor')),
      status: v.union(
        v.literal('pending'),
        v.literal('matched'),
        v.literal('closed'),
      ),
      createdAt: v.number(),
      reviewedAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    const email = user?.email?.trim().toLowerCase();
    if (!email) return [];
    const rows = await ctx.db
      .query('mentorshipRequests')
      .withIndex('by_email', (q) => q.eq('email', email))
      .collect();
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((m) => ({
        _id: m._id,
        role: m.role,
        status: m.status,
        createdAt: m.createdAt,
        reviewedAt: m.reviewedAt ?? null,
      }));
  },
});

// --- Back-office (moderator and above) --------------------------------------
export const listMentorshipRequests = query({
  // CLOSED domain (mirrors the schema): the back-office only offers these
  // values, the validator enforces them. No filter -> the whole queue.
  args: {
    status: v.optional(
      v.union(v.literal('pending'), v.literal('matched'), v.literal('closed')),
    ),
  },
  handler: async (ctx, { status }) => {
    await requireNetworkRole(ctx, 'moderateur');
    const all = status
      ? await ctx.db
          .query('mentorshipRequests')
          .withIndex('by_status', (q) => q.eq('status', status))
          .collect()
      : await ctx.db.query('mentorshipRequests').collect();
    return all
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((m) => ({
        _id: m._id,
        name: m.name,
        email: m.email,
        country: m.country,
        role: m.role,
        themes: m.themes ?? [],
        message: m.message,
        status: m.status,
        createdAt: m.createdAt,
        reviewNotes: m.reviewNotes ?? null,
      }));
  },
});

// --- State machine for reviewing mentoring requests (issue #9) -------------
//
//   pending ──matched/closed──► matched | closed
//   matched ──closed──► closed                  (end of mentoring)
//   matched | closed ──reopenMentorshipRequest──► pending
//
// `matched -> closed` is a CONTINUATION, not a reversal: the match did
// take place, then the mentoring ends. The reverse — `closed` moved back
// to `matched` — would claim a match exists when it was closed;
// the request must first be reopened.
//
// Side effect of the decision: NONE (no account, no role, no automatic
// matchmaking — matching happens by email, outside the tool). The guard
// therefore protects the LOG: these mutations are audited, and a decision
// replayed or silently reversed piles up contradictory rows there.
const MENTORSHIP_REVIEW: ReviewMachine<Doc<'mentorshipRequests'>['status']> = {
  transitions: {
    pending: ['matched', 'closed'],
    matched: ['closed', 'pending'],
    closed: ['pending'],
  },
  decided: ['matched', 'closed'],
};

export const reviewMentorshipRequest = mutation({
  args: {
    requestId: v.id('mentorshipRequests'),
    status: v.union(v.literal('matched'), v.literal('closed')),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { requestId, status, notes }) => {
    const reviewer = await requireNetworkRole(ctx, 'moderateur');
    const request = await ctx.db.get(requestId);
    if (!request) throw new Error('NOT_FOUND');
    assertTransition(request.status, status, MENTORSHIP_REVIEW);

    await ctx.db.patch(requestId, {
      status,
      reviewedBy: reviewer._id,
      reviewedAt: Date.now(),
      reviewNotes: notes?.trim() || undefined,
    });
    await recordAudit(ctx, {
      actorId: reviewer._id,
      action: AUDIT.MENTORSHIP_REVIEWED,
      targetId: requestId,
      metadata: {
        status,
        role: request.role,
        notes: notes?.trim() || undefined,
      },
    });
    return { ok: true };
  },
});

// Reopening a decided request (issue #9) — moderator and above,
// audited under its own action. It is the only way back: a closed
// match one wants to resume goes back through the queue, visibly.
export const reopenMentorshipRequest = mutation({
  args: { requestId: v.id('mentorshipRequests') },
  handler: async (ctx, { requestId }) => {
    const reviewer = await requireNetworkRole(ctx, 'moderateur');
    const request = await ctx.db.get(requestId);
    if (!request) throw new Error('NOT_FOUND');
    const from = request.status;
    assertTransition(from, 'pending', MENTORSHIP_REVIEW);

    await ctx.db.patch(requestId, { status: 'pending' });
    await recordAudit(ctx, {
      actorId: reviewer._id,
      action: AUDIT.MENTORSHIP_REOPENED,
      targetId: requestId,
      metadata: { from, role: request.role },
    });
    return { ok: true };
  },
});

// DEV/TEST only (AUTH_DEV_OTP guard): checks the actual storage in E2E.
export const isMentorshipRequested = internalQuery({
  args: { email: v.string() },
  handler: async (ctx, { email }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') return null;
    const rows = await ctx.db
      .query('mentorshipRequests')
      .withIndex('by_email', (q) => q.eq('email', email.trim().toLowerCase()))
      .collect();
    return rows.length > 0;
  },
});
