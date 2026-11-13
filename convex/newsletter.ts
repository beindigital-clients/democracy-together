import { v, ConvexError, type Infer } from 'convex/values';
import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server';
import {
  action,
  mutation,
  query,
  internalQuery,
  internalMutation,
  internalAction,
  type MutationCtx,
} from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { isEmail } from './lib/validation';
import {
  enforcePublicFormLimit,
  enforceRateLimit,
  RATE_LIMITS,
} from './lib/rateLimit';
import { enforceRecaptcha } from './lib/recaptcha';
import { requireNetworkRole } from './lib/rbac';
import { roleRank } from './lib/roles';
import { COUNTER, bumpCounter, readCounter } from './lib/counters';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import {
  emailProviderStatus,
  sendEmail,
  sendEmailBatch,
  TransientEmailError,
} from './email';
import { locale, type SiteLocale } from './schema';
import {
  CONFIRM_TTL_MS,
  LEGACY_CONFIRM_TTL_MS,
  CONSENT_TEXT_VERSION,
  canResendConfirmation,
  hashToken,
  isTokenShaped,
  newConfirmToken,
  normalizeSource,
  subscriptionSourceValidator,
} from './lib/newsletterOptIn';
import {
  campaignHtml,
  confirmationEmail,
  listUnsubscribeHeaders,
  pickVariant,
  testSubject,
  type CampaignContent,
} from './lib/newsletterContent';
import {
  cercleCampaignHtml,
  cercleListUnsubscribeHeaders,
} from './lib/cercleMailingContent';
import { senderIdentity } from './lib/cercleMailing';
import {
  CLAIM_LEASE_MS,
  MAX_TRANSIENT_ATTEMPTS,
  backoffMs,
  batchAllowance,
  deliveryConfig,
  idempotencyKey,
  msUntilNextUtcDay,
} from './lib/newsletterDelivery';
import { addSent, dailyRemaining } from './lib/emailQuota';

// Random token (unsubscribe link).
function newToken(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

const campaignStatus = v.union(
  v.literal('draft'),
  v.literal('sending'),
  v.literal('paused'),
  v.literal('sent'),
  v.literal('error'),
);

// WHO A CAMPAIGN GOES TO. The engine below (enqueue, batches, retry) serves two
// lists that never share a recipient: the public newsletter and the Cercle's
// mailing list (`cercleContacts`, convex/cercleMailing.ts). A campaign without
// an audience is a newsletter one, as before the Cercle.
const audienceValidator = v.union(v.literal('newsletter'), v.literal('cercle'));
type Audience = Infer<typeof audienceValidator>;
const audienceOf = (c: { audience?: Audience }): Audience =>
  c.audience ?? 'newsletter';

// The recipient a delivery row points to, whichever list it is in. `active` is
// false when they left (or never were confirmed) between queueing and sending:
// nothing is written to them.
type DeliveryRecipient = {
  email: string;
  locale: SiteLocale | undefined;
  unsubToken: string;
  active: boolean;
};
async function recipientOf(
  ctx: MutationCtx,
  row: Doc<'newsletterDeliveries'>,
): Promise<DeliveryRecipient | null> {
  if (row.contactId) {
    const c = await ctx.db.get(row.contactId);
    if (!c) return null;
    // A SUSPENDED account is cut off from the Cercle at once, and that includes
    // its news: someone suspended for abuse keeps no line to the Cercle's list
    // (reactivation puts them back, the contact row is untouched).
    const account =
      c.status === 'confirmed'
        ? await ctx.db
            .query('users')
            .withIndex('email', (q) => q.eq('email', c.email))
            .first()
        : null;
    return {
      email: c.email,
      locale: c.locale,
      unsubToken: c.unsubToken,
      active: c.status === 'confirmed' && account?.suspendedAt === undefined,
    };
  }
  if (row.subscriptionId) {
    const sub = await ctx.db.get(row.subscriptionId);
    if (!sub) return null;
    return {
      email: sub.email,
      locale: sub.locale,
      unsubToken: sub.unsubToken ?? '',
      active: sub.status === 'confirmed' && Boolean(sub.unsubToken),
    };
  }
  return null;
}

// =============================================================================
// PUBLIC SUBSCRIPTION — DOUBLE OPT-IN (F-18)
// =============================================================================
//
// Anti-spam gate: the action checks reCAPTCHA v3 (only actions have
// `fetch`) then delegates to `recordSubscription` (internalMutation -> not
// callable directly, so the captcha gate cannot be bypassed).
//
// Signing up no longer creates a subscriber: it creates a PENDING entry and sends a
// confirmation link. Only clicking that link — proof that the person
// who entered the address reads it — enables sending (framing § 2.15, "double
// opt-in").
export const subscribe = action({
  args: {
    email: v.string(),
    locale: v.optional(locale),
    // Originating form (home, footer, dedicated page) — kept
    // with the proof of consent.
    source: subscriptionSourceValidator,
    captchaToken: v.optional(v.string()),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { captchaToken, ...input }) => {
    await enforceRecaptcha(captchaToken, 'newsletter');
    // FAIL-CLOSED, like campaigns: without a provider, the confirmation
    // link would not go out, and the form would say "check your
    // inbox" for an email that will never arrive. The refusal is the same
    // for ALL addresses: it reveals nothing about any of them.
    if (emailProviderStatus().mode === 'none') {
      throw new ConvexError('EMAIL_PROVIDER_NOT_CONFIGURED');
    }
    // EXISTENCE ORACLE CLOSED (pentest M-8, audit F-09).
    //
    // The internal mutation still distinguishes "already known" from "new" —
    // it needs to, so as not to duplicate or double-count. But this
    // distinction does NOT CROSS the public boundary: the response is
    // IDENTICAL in all cases (new address, pending, confirmed
    // subscriber). The confirmation email itself is sent by a
    // SCHEDULED function: the action responds first, and its response time
    // does not depend on the sending.
    await ctx.runMutation(internal.newsletter.recordSubscription, input);
    return { ok: true };
  },
});

export const recordSubscription = internalMutation({
  args: {
    email: v.string(),
    locale: v.optional(locale),
    source: subscriptionSourceValidator,
  },
  returns: v.object({ ok: v.boolean(), already: v.boolean() }),
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    if (!isEmail(email)) throw new Error('INVALID_EMAIL');

    // UNFORGEABLE caps (audit M2) — per IP and global per form:
    // changing address no longer yields a fresh quota. See lib/rateLimit.ts.
    await enforcePublicFormLimit(ctx, 'newsletter');

    await enforceRateLimit(ctx, {
      key: `newsletter:${email}`,
      ...RATE_LIMITS.newsletter,
    });

    const now = Date.now();
    const consent = {
      at: now,
      source: normalizeSource(args.source),
      locale: args.locale,
      textVersion: CONSENT_TEXT_VERSION,
    };

    const existing = await ctx.db
      .query('newsletterSubscriptions')
      .withIndex('by_email', (q) => q.eq('email', email))
      .unique();

    if (existing) {
      if (existing.status === 'confirmed') return { ok: true, already: true };

      if (existing.status === undefined) {
        // LEGACY subscriber (from before double opt-in) re-subscribing: this is a
        // NEW consent, expressed now — we treat it as such,
        // pending entry and link included. The counter did not count it (it only
        // counts confirmed ones): it will count it on confirmation.
        await ctx.db.patch(existing._id, {
          status: 'pending',
          locale: args.locale ?? existing.locale,
          consent,
          confirmSends: 1,
          confirmLastSentAt: now,
          confirmExpiresAt: now + CONFIRM_TTL_MS,
        });
        await ctx.scheduler.runAfter(0, internal.newsletter.sendConfirmation, {
          subscriptionId: existing._id,
          legacy: false,
        });
        return { ok: true, already: true };
      }

      // Pending: BOUNDED resend of the link (see lib/newsletterOptIn.ts). Outside
      // the bounds, nothing goes out — and the public response is the same.
      if (canResendConfirmation(existing, now)) {
        await ctx.db.patch(existing._id, {
          locale: args.locale ?? existing.locale,
          confirmSends: (existing.confirmSends ?? 0) + 1,
          confirmLastSentAt: now,
          // The delay restarts: the subscriber just asked for the link again.
          confirmExpiresAt: now + CONFIRM_TTL_MS,
        });
        await ctx.scheduler.runAfter(0, internal.newsletter.sendConfirmation, {
          subscriptionId: existing._id,
          legacy: false,
        });
      }
      return { ok: true, already: true };
    }

    const subscriptionId = await ctx.db.insert('newsletterSubscriptions', {
      email,
      locale: args.locale,
      unsubToken: newToken(),
      createdAt: now,
      status: 'pending',
      consent,
      confirmSends: 1,
      confirmLastSentAt: now,
      confirmExpiresAt: now + CONFIRM_TTL_MS,
    });
    // NO increment of the subscriber counter: it counts CONFIRMED ones, those
    // who receive campaigns.
    await ctx.scheduler.runAfter(0, internal.newsletter.sendConfirmation, {
      subscriptionId,
      legacy: false,
    });
    return { ok: true, already: false };
  },
});

// Sending the confirmation link. The token is drawn HERE, in the action, and
// exists in plaintext only in memory and in the email: it goes neither through
// the arguments of a scheduled function (stored by the scheduler) nor through
// the database, which only receives its hash.
export const sendConfirmation = internalAction({
  args: {
    subscriptionId: v.id('newsletterSubscriptions'),
    legacy: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { subscriptionId, legacy }) => {
    const token = newConfirmToken();
    const target = await ctx.runMutation(internal.newsletter._armConfirmation, {
      subscriptionId,
      tokenHash: await hashToken(token),
      ttlMs: legacy ? LEGACY_CONFIRM_TTL_MS : CONFIRM_TTL_MS,
    });
    if (!target) return null; // unsubscribed or already confirmed in the meantime
    const loc: SiteLocale = target.locale ?? 'fr';
    const mail = confirmationEmail(token, loc, legacy);
    try {
      await sendEmail({
        to: target.email,
        subject: mail.subject,
        html: mail.html,
      });
    } catch (err) {
      // The pending entry stays in place and will expire; the subscriber can ask for the
      // link again. We log without the address.
      console.error(
        `[newsletter] confirmation non envoyée : ${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
    // DEV/TEST only: outbox readable by the E2E, like the OTP
    // codes (`devOtpCodes`). The guard is in the mutation.
    if (process.env.AUTH_DEV_OTP === 'true') {
      await ctx.runMutation(internal.newsletter._devRecordOutbox, {
        to: target.email,
        kind: 'newsletter-confirmation',
        subject: mail.subject,
        link: mail.url,
      });
    }
    return null;
  },
});

export const _armConfirmation = internalMutation({
  args: {
    subscriptionId: v.id('newsletterSubscriptions'),
    tokenHash: v.string(),
    ttlMs: v.number(),
  },
  returns: v.union(
    v.null(),
    v.object({ email: v.string(), locale: v.optional(locale) }),
  ),
  handler: async (ctx, { subscriptionId, tokenHash, ttlMs }) => {
    const sub = await ctx.db.get(subscriptionId);
    if (!sub || sub.status !== 'pending') return null;
    // A new link REPLACES the previous one: only the last email received
    // confirms. An old link found later is worthless.
    await ctx.db.patch(subscriptionId, {
      confirmTokenHash: tokenHash,
      confirmExpiresAt: Date.now() + ttlMs,
    });
    return { email: sub.email, locale: sub.locale };
  },
});

export const _devRecordOutbox = internalMutation({
  args: {
    to: v.string(),
    kind: v.string(),
    subject: v.string(),
    link: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Belt and braces: even if called by mistake, this mutation writes
    // nothing outside development mode.
    if (process.env.AUTH_DEV_OTP !== 'true') return null;
    await ctx.db.insert('devOutbox', { ...args, createdAt: Date.now() });
    return null;
  },
});

// Confirmation by token (email link). Public: the token IS
// the authorization. Single use — the hash is erased on confirmation —
// and expiring. The response states the outcome (and the subscriber's language, so the
// page speaks theirs); it is not an existence oracle, for the same
// reason as `unsubscribe`: a 256-bit token identifies no address
// a third party could choose.
export const confirm = mutation({
  args: { token: v.string() },
  returns: v.object({
    status: v.union(
      v.literal('confirmed'),
      v.literal('expired'),
      v.literal('invalid'),
    ),
    locale: v.union(locale, v.null()),
  }),
  handler: async (ctx, { token }) => {
    const clean = token.trim().toLowerCase();
    if (!isTokenShaped(clean))
      return { status: 'invalid' as const, locale: null };
    const tokenHash = await hashToken(clean);
    const sub = await ctx.db
      .query('newsletterSubscriptions')
      .withIndex('by_confirm_hash', (q) => q.eq('confirmTokenHash', tokenHash))
      .unique();
    if (!sub || sub.status !== 'pending') {
      return { status: 'invalid' as const, locale: null };
    }
    const now = Date.now();
    if (sub.confirmExpiresAt !== undefined && sub.confirmExpiresAt < now) {
      return { status: 'expired' as const, locale: sub.locale ?? null };
    }
    await ctx.db.patch(sub._id, {
      status: 'confirmed',
      confirmedAt: now,
      confirmTokenHash: undefined,
      confirmExpiresAt: undefined,
    });
    await bumpCounter(ctx, COUNTER.NEWSLETTER_SUBSCRIBERS, 1);
    return { status: 'confirmed' as const, locale: sub.locale ?? null };
  },
});

// Unsubscribe by token (link in the email) — idempotent.
//
// `found` says whether the token matched a subscription. Without it, the page
// confirmed "you are unsubscribed" for a made-up token (measured on 27/09,
// showcase O2 / R-09): a subscriber whose link was truncated or expired believed
// they had succeeded, and stayed subscribed. THIS IS NOT AN EXISTENCE ORACLE: the
// token is a 128-bit random secret, it identifies no address —
// unlike the oracle closed on `subscribe` (F-09), which answered for a
// chosen address. A link clicked twice answers `found: false` the second
// time: the subscriber has left, the page says so as "link expired".
async function unsubscribeByTokenImpl(
  ctx: MutationCtx,
  token: string,
): Promise<{ ok: boolean; found: boolean }> {
  if (!token) return { ok: false, found: false };
  const sub = await ctx.db
    .query('newsletterSubscriptions')
    .withIndex('by_token', (q) => q.eq('unsubToken', token))
    .unique();
  if (!sub) return { ok: true, found: false };
  await ctx.db.delete(sub._id);
  // Only CONFIRMED ones are counted: a pending entry (or an unmigrated legacy
  // one) that unsubscribes decrements nothing.
  if (sub.status === 'confirmed') {
    await bumpCounter(ctx, COUNTER.NEWSLETTER_SUBSCRIBERS, -1);
  }
  return { ok: true, found: true };
}

export const unsubscribe = mutation({
  args: { token: v.string() },
  returns: v.object({ ok: v.boolean(), found: v.boolean() }),
  handler: (ctx, { token }) => unsubscribeByTokenImpl(ctx, token),
});

// "One-click" unsubscribe (RFC 8058) — called by the
// HTTP entry point `POST /newsletter/unsubscribe` (convex/newsletterHttp.ts).
export const unsubscribeByToken = internalMutation({
  args: { token: v.string() },
  returns: v.object({ ok: v.boolean(), found: v.boolean() }),
  handler: (ctx, { token }) => unsubscribeByTokenImpl(ctx, token),
});

// Scheduled purge (hourly cron) of EXPIRED pending entries: an address entered
// by a third party and never confirmed does not stay in the database beyond its deadline
// (minimization, GDPR art. 5.1.c). And the development outbox.
const PURGE_BATCH = 200;
export const purgeExpiredPending = internalMutation({
  args: {},
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query('newsletterSubscriptions')
      .withIndex('by_status_and_expiry', (q) =>
        q.eq('status', 'pending').lt('confirmExpiresAt', now),
      )
      .take(PURGE_BATCH);
    for (const s of expired) await ctx.db.delete(s._id);

    const outbox = await ctx.db
      .query('devOutbox')
      .withIndex('by_createdAt', (q) => q.lt('createdAt', now - 86_400_000))
      .take(PURGE_BATCH);
    for (const o of outbox) await ctx.db.delete(o._id);

    if (expired.length === PURGE_BATCH || outbox.length === PURGE_BATCH) {
      await ctx.scheduler.runAfter(
        0,
        internal.newsletter.purgeExpiredPending,
        {},
      );
    }
    return { deleted: expired.length };
  },
});

// MIGRATION OF LEGACY SUBSCRIBERS (predating double opt-in).
//
// DECISION (docs/backlog/diffusion.md § Migration): they are NOT deemed
// confirmed. The old form accepted any address without
// verification — which is precisely what double opt-in fixes —, and
// the association therefore cannot demonstrate (GDPR art. 7.1) that the person
// behind each address consented. Each one receives ONE confirmation
// request (30-day deadline); without a response, the address is purged.
//
// To be run once, via the CLI (trusted context), AFTER setting the
// provider key: `npx convex run newsletter:migrateLegacySubscribers`.
// In batches of 100, spread at the configured rate; reschedules itself until done.
const MIGRATION_BATCH = 100;
export const migrateLegacySubscribers = internalMutation({
  args: {},
  returns: v.object({ migrated: v.number(), done: v.boolean() }),
  handler: async (ctx) => {
    if (emailProviderStatus().mode === 'none') {
      // Re-running without being able to write would expire — hence delete —
      // subscribers we would never have notified.
      throw new ConvexError('EMAIL_PROVIDER_NOT_CONFIGURED');
    }
    const legacy = await ctx.db
      .query('newsletterSubscriptions')
      .withIndex('by_status_and_expiry', (q) => q.eq('status', undefined))
      .take(MIGRATION_BATCH);
    const now = Date.now();
    const { intervalMs, batchSize } = deliveryConfig();
    for (let i = 0; i < legacy.length; i++) {
      const s = legacy[i];
      await ctx.db.patch(s._id, {
        status: 'pending',
        consent: {
          // The only known date is the original sign-up date; the
          // source says it was not confirmed at the time.
          at: s.createdAt,
          source: 'legacy',
          locale: s.locale,
          textVersion: 'legacy',
        },
        confirmSends: 1,
        confirmLastSentAt: now,
        confirmExpiresAt: now + LEGACY_CONFIRM_TTL_MS,
      });
      await ctx.scheduler.runAfter(
        Math.floor(i / batchSize) * intervalMs,
        internal.newsletter.sendConfirmation,
        { subscriptionId: s._id, legacy: true },
      );
    }
    if (legacy.length > 0) {
      await recordAudit(ctx, {
        action: AUDIT.NEWSLETTER_LEGACY_MIGRATED,
        metadata: { count: legacy.length },
      });
    }
    const done = legacy.length < MIGRATION_BATCH;
    if (!done) {
      await ctx.scheduler.runAfter(
        Math.ceil(MIGRATION_BATCH / batchSize) * intervalMs,
        internal.newsletter.migrateLegacySubscribers,
        {},
      );
    }
    return { migrated: legacy.length, done };
  },
});

// Newsletter data of a deleted account: the subscription is tied to the address,
// not to the account. To be wired into account deletion (orchestrator).
export async function deleteUserDataDiffusion(
  ctx: MutationCtx,
  userId: Id<'users'>,
): Promise<void> {
  const user = await ctx.db.get(userId);
  const email = user?.email?.trim().toLowerCase();
  if (!email) return;
  const sub = await ctx.db
    .query('newsletterSubscriptions')
    .withIndex('by_email', (q) => q.eq('email', email))
    .unique();
  if (!sub) return;
  await ctx.db.delete(sub._id);
  if (sub.status === 'confirmed') {
    await bumpCounter(ctx, COUNTER.NEWSLETTER_SUBSCRIBERS, -1);
  }
}

// --- DEV/TEST oracles (AUTH_DEV_OTP guard) -----------------------------------
//
// DEV/TEST only: returns an address's unsubscribe token, so that
// the E2E can follow the email link as a subscriber would (audit
// F-12). THIS IS NOT A REOPENING OF THE ORACLE CLOSED IN F-09: it is an
// `internalQuery` — outside the public API, callable by no client — backed by
// the AUTH_DEV_OTP guard, invoked by the Convex CLI in a trusted context.
export const devUnsubToken = internalQuery({
  args: { email: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { email }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') return null;
    const sub = await ctx.db
      .query('newsletterSubscriptions')
      .withIndex('by_email', (q) => q.eq('email', email.trim().toLowerCase()))
      .unique();
    return sub?.unsubToken ?? null;
  },
});

// DEV/TEST only (AUTH_DEV_OTP guard): is the address in the database
// (pending OR confirmed)?
export const isSubscribed = internalQuery({
  args: { email: v.string() },
  returns: v.union(v.boolean(), v.null()),
  handler: async (ctx, { email }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') return null;
    const sub = await ctx.db
      .query('newsletterSubscriptions')
      .withIndex('by_email', (q) => q.eq('email', email.trim().toLowerCase()))
      .unique();
    return Boolean(sub);
  },
});

// DEV/TEST only (AUTH_DEV_OTP guard): double opt-in state.
export const devSubscriptionStatus = internalQuery({
  args: { email: v.string() },
  returns: v.union(
    v.literal('pending'),
    v.literal('confirmed'),
    v.literal('legacy'),
    v.null(),
  ),
  handler: async (ctx, { email }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') return null;
    const sub = await ctx.db
      .query('newsletterSubscriptions')
      .withIndex('by_email', (q) => q.eq('email', email.trim().toLowerCase()))
      .unique();
    if (!sub) return null;
    return sub.status ?? 'legacy';
  },
});

// DEV/TEST only (AUTH_DEV_OTP guard): last confirmation link
// "sent" to an address — what the E2E follows, like `otp.latestDevCode`.
export const devLatestConfirmationLink = internalQuery({
  args: { email: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { email }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') return null;
    const rows = await ctx.db
      .query('devOutbox')
      .withIndex('by_to', (q) => q.eq('to', email.trim().toLowerCase()))
      .order('desc')
      .take(10);
    return rows.find((r) => r.kind === 'newsletter-confirmation')?.link ?? null;
  },
});

// =============================================================================
// BACK-OFFICE — subscribers and campaigns (editor and above)
// =============================================================================

// Number of CONFIRMED subscribers — those a campaign will reach. Denormalized
// counter (convex/counters.ts): a single-row read (issue #8).
export const subscriberCount = query({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'editeur');
    return await readCounter(ctx, COUNTER.NEWSLETTER_SUBSCRIBERS);
  },
});

// Pending entries and unmigrated legacy ones — bounded: beyond 1,000, a
// "1000+" is enough on screen, and counting it exactly would cost the whole table.
const COUNT_CAP = 1000;
export const subscriberBreakdown = query({
  args: {},
  returns: v.object({
    confirmed: v.number(),
    pending: v.number(),
    legacy: v.number(),
    capped: v.number(),
  }),
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'editeur');
    const [pending, legacy] = await Promise.all([
      ctx.db
        .query('newsletterSubscriptions')
        .withIndex('by_status_and_expiry', (q) => q.eq('status', 'pending'))
        .take(COUNT_CAP),
      ctx.db
        .query('newsletterSubscriptions')
        .withIndex('by_status_and_expiry', (q) => q.eq('status', undefined))
        .take(COUNT_CAP),
    ]);
    return {
      confirmed: await readCounter(ctx, COUNTER.NEWSLETTER_SUBSCRIBERS),
      pending: pending.length,
      legacy: legacy.length,
      capped: COUNT_CAP,
    };
  },
});

const subscriberRow = v.object({
  _id: v.id('newsletterSubscriptions'),
  email: v.string(),
  status: v.union(
    v.literal('pending'),
    v.literal('confirmed'),
    v.literal('legacy'),
  ),
  locale: v.union(locale, v.null()),
  createdAt: v.number(),
  confirmedAt: v.union(v.number(), v.null()),
  consentSource: v.union(v.string(), v.null()),
  consentAt: v.union(v.number(), v.null()),
});

function projectSubscriber(s: Doc<'newsletterSubscriptions'>) {
  return {
    _id: s._id,
    email: s.email,
    status: s.status ?? ('legacy' as const),
    locale: s.locale ?? null,
    createdAt: s.createdAt,
    confirmedAt: s.confirmedAt ?? null,
    consentSource: s.consent?.source ?? null,
    consentAt: s.consent?.at ?? null,
  };
}

// Subscriber list, paginated, with the proof of consent. Exact `email`
// = lookup of ONE address (access request, unsubscribe by the
// administration). Never any token in the response.
export const listSubscribers = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(v.union(v.literal('pending'), v.literal('confirmed'))),
    email: v.optional(v.string()),
  },
  returns: paginationResultValidator(subscriberRow),
  handler: async (ctx, { paginationOpts, status, email }) => {
    await requireNetworkRole(ctx, 'editeur');
    const wanted = email?.trim().toLowerCase();
    if (wanted) {
      const sub = await ctx.db
        .query('newsletterSubscriptions')
        .withIndex('by_email', (q) => q.eq('email', wanted))
        .unique();
      return {
        page: sub ? [projectSubscriber(sub)] : [],
        isDone: true,
        continueCursor: '',
      };
    }
    const result = status
      ? await ctx.db
          .query('newsletterSubscriptions')
          .withIndex('by_status_and_expiry', (q) => q.eq('status', status))
          .order('desc')
          .paginate(paginationOpts)
      : await ctx.db
          .query('newsletterSubscriptions')
          .order('desc')
          .paginate(paginationOpts);
    return {
      ...result,
      page: result.page.map(projectSubscriber),
    };
  },
});

// Email provider status, announced at the top of the screen (27/09
// campaign, R-07). Read at query time: setting the key on the deployment
// is enough, without redeploying the code.
export const emailStatus = query({
  args: {},
  returns: v.object({
    provider: v.string(),
    mode: v.union(
      v.literal('configured'),
      v.literal('simulated'),
      v.literal('none'),
    ),
    batchSize: v.number(),
    ratePerMinute: v.number(),
  }),
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'editeur');
    const { batchSize, ratePerMinute } = deliveryConfig();
    return { ...emailProviderStatus(), batchSize, ratePerMinute };
  },
});

const variantValidator = v.object({
  locale,
  subject: v.string(),
  body: v.string(),
});

// List bounded to the 50 most recent campaigns: the screen does not show
// more, and the table must not be re-read in full on every sending
// progress update (the list is reactive).
export const listCampaigns = query({
  // Which list's campaigns: the newsletter's by default, so the newsletter
  // screen never shows (nor can mistake for its own) a Cercle message.
  args: { audience: v.optional(audienceValidator) },
  returns: v.array(
    v.object({
      _id: v.id('newsletterCampaigns'),
      audience: audienceValidator,
      subject: v.string(),
      body: v.string(),
      locale,
      variants: v.array(variantValidator),
      status: campaignStatus,
      createdAt: v.number(),
      sentAt: v.union(v.number(), v.null()),
      recipientCount: v.union(v.number(), v.null()),
      failedCount: v.union(v.number(), v.null()),
      skippedCount: v.number(),
      totalCount: v.number(),
      enqueueDone: v.boolean(),
      lastTestAt: v.union(v.number(), v.null()),
      // True when no internal test went out since the last change: a Cercle
      // campaign cannot be sent until it has one.
      needsTest: v.boolean(),
      // Sending in waves: how many recipients may be served so far, if limited.
      waveLimit: v.union(v.number(), v.null()),
      // The sending service's daily quota is spent: resumes by itself then.
      pausedUntil: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx, { audience }) => {
    await requireNetworkRole(ctx, 'editeur');
    const wanted = audience ?? 'newsletter';
    const recent = (
      await ctx.db.query('newsletterCampaigns').order('desc').take(200)
    )
      .filter((c) => audienceOf(c) === wanted)
      .slice(0, 50);
    return recent.map((c) => ({
      _id: c._id,
      audience: audienceOf(c),
      subject: c.subject,
      // The body feeds the preview BEFORE sending (27/09 campaign, R-07).
      body: c.body,
      locale: c.locale ?? 'fr',
      variants: c.variants ?? [],
      status: c.status,
      createdAt: c.createdAt,
      sentAt: c.sentAt ?? null,
      recipientCount: c.recipientCount ?? null,
      failedCount: c.failedCount ?? null,
      skippedCount: c.skippedCount ?? 0,
      totalCount: c.totalCount ?? 0,
      enqueueDone: c.enqueueDone ?? false,
      lastTestAt: c.lastTestAt ?? null,
      needsTest:
        c.lastTestAt === undefined ||
        c.lastTestAt < (c.editedAt ?? c.createdAt),
      waveLimit: c.waveLimit ?? null,
      pausedUntil: c.pausedUntil ?? null,
    }));
  },
});

const SUBJECT_MIN = 3;
const SUBJECT_MAX = 200;
const BODY_MIN = 10;
const BODY_MAX = 50_000;

function checkContent(subject: string, body: string) {
  const s = subject.trim();
  const b = body.trim();
  if (
    s.length < SUBJECT_MIN ||
    s.length > SUBJECT_MAX ||
    b.length < BODY_MIN ||
    b.length > BODY_MAX
  ) {
    throw new Error('INVALID_CAMPAIGN');
  }
  return { subject: s, body: b };
}

export const createCampaign = mutation({
  args: {
    subject: v.string(),
    body: v.string(),
    locale: v.optional(locale),
    // Missing = the public newsletter.
    audience: v.optional(audienceValidator),
  },
  returns: v.id('newsletterCampaigns'),
  handler: async (ctx, args) => {
    const editor = await requireNetworkRole(ctx, 'editeur');
    const { subject, body } = checkContent(args.subject, args.body);
    return await ctx.db.insert('newsletterCampaigns', {
      subject,
      body,
      locale: args.locale ?? 'fr',
      ...(args.audience === 'cercle' ? { audience: 'cercle' as const } : {}),
      status: 'draft',
      createdBy: editor._id,
      createdAt: Date.now(),
    });
  },
});

async function requireDraft(
  ctx: MutationCtx,
  campaignId: Id<'newsletterCampaigns'>,
) {
  const campaign = await ctx.db.get(campaignId);
  if (!campaign) throw new Error('NOT_FOUND');
  if (campaign.status !== 'draft') throw new Error('ALREADY_SENT');
  return campaign;
}

// Translated version of a draft: one per language, replaced if it exists.
// The reference language has no "variant" — one edits the campaign.
export const upsertCampaignVariant = mutation({
  args: {
    campaignId: v.id('newsletterCampaigns'),
    locale,
    subject: v.string(),
    body: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireNetworkRole(ctx, 'editeur');
    const campaign = await requireDraft(ctx, args.campaignId);
    if (args.locale === (campaign.locale ?? 'fr')) {
      throw new Error('VARIANT_IS_REFERENCE');
    }
    const content = checkContent(args.subject, args.body);
    const variants = (campaign.variants ?? []).filter(
      (x) => x.locale !== args.locale,
    );
    variants.push({ locale: args.locale, ...content });
    await ctx.db.patch(args.campaignId, { variants, editedAt: Date.now() });
    return null;
  },
});

export const removeCampaignVariant = mutation({
  args: { campaignId: v.id('newsletterCampaigns'), locale },
  returns: v.null(),
  handler: async (ctx, { campaignId, locale: loc }) => {
    await requireNetworkRole(ctx, 'editeur');
    const campaign = await requireDraft(ctx, campaignId);
    await ctx.db.patch(campaignId, {
      variants: (campaign.variants ?? []).filter((x) => x.locale !== loc),
      editedAt: Date.now(),
    });
    return null;
  },
});

// TEST SEND TO ONESELF: all versions (reference + translations)
// go to the editor's account address, subject prefixed with "[TEST]".
// Nothing is enqueued, the draft stays a draft.
// INTERNAL TEST BEFORE THE FULL LIST.
//
// All versions (reference + translations) go to the people named — the
// editor's own address by default, or up to `INTERNAL_TEST_MAX` addresses of
// the TEAM (accounts of rank moderator and above, not suspended). Not an open
// field: a test to any address would be a way to make the platform write to
// strangers. Subject prefixed with "[TEST]", a dummy unsubscribe token so that a
// test unsubscribes nobody. Nothing is enqueued, the draft stays a draft, and
// `lastTestAt` is stamped: a Cercle campaign cannot be sent to its list unless
// a test went out AFTER its last change (`sendCampaign`).
export const INTERNAL_TEST_MAX = 5;
export const sendTestCampaign = mutation({
  args: {
    campaignId: v.id('newsletterCampaigns'),
    // Missing = the editor's own address.
    to: v.optional(v.array(v.string())),
  },
  returns: v.object({ ok: v.boolean(), to: v.string(), versions: v.number() }),
  handler: async (ctx, { campaignId, to: requested }) => {
    const editor = await requireNetworkRole(ctx, 'editeur');
    const campaign = await ctx.db.get(campaignId);
    if (!campaign) throw new Error('NOT_FOUND');
    if (emailProviderStatus().mode === 'none') {
      throw new Error('EMAIL_PROVIDER_NOT_CONFIGURED');
    }
    let recipients: string[];
    if (requested === undefined) {
      const own = editor.email?.trim().toLowerCase();
      if (!own || !isEmail(own)) throw new Error('NO_EDITOR_EMAIL');
      recipients = [own];
    } else {
      recipients = [
        ...new Set(
          requested.map((a) => a.trim().toLowerCase()).filter(Boolean),
        ),
      ];
      if (recipients.length === 0) throw new ConvexError('NO_TEST_RECIPIENT');
      if (recipients.length > INTERNAL_TEST_MAX) {
        throw new ConvexError('TOO_MANY_TEST_RECIPIENTS');
      }
      for (const address of recipients) {
        if (!isEmail(address)) throw new ConvexError('INVALID_EMAIL');
        const account = await ctx.db
          .query('users')
          .withIndex('email', (q) => q.eq('email', address))
          .first();
        if (
          !account ||
          account.suspendedAt !== undefined ||
          roleRank(account.role) < roleRank('moderateur')
        ) {
          // Same answer for "no such account" and "not on the team": a test is
          // not a way to find out who has an account.
          throw new ConvexError('NOT_INTERNAL_ADDRESS');
        }
      }
    }
    await enforceRateLimit(ctx, {
      key: `nlTest:${editor._id}`,
      max: 10,
      windowMs: 60 * 60 * 1000,
    });
    await ctx.db.patch(campaignId, { lastTestAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.newsletter._deliverTest, {
      campaignId,
      recipients,
    });
    await recordAudit(ctx, {
      actorId: editor._id,
      action: AUDIT.NEWSLETTER_TEST_SENT,
      targetId: campaignId,
      metadata: { recipients: recipients.length },
    });
    return {
      ok: true,
      to: recipients.join(', '),
      versions: 1 + (campaign.variants?.length ?? 0),
    };
  },
});

export const _deliverTest = internalAction({
  args: {
    campaignId: v.id('newsletterCampaigns'),
    recipients: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { campaignId, recipients }) => {
    const campaign: CampaignContent | null = await ctx.runQuery(
      internal.newsletter._campaignContent,
      { campaignId },
    );
    if (!campaign) return null;
    const locales: SiteLocale[] = [
      campaign.locale ?? 'fr',
      ...(campaign.variants ?? []).map((x) => x.locale),
    ];
    for (const to of recipients) {
      for (const loc of locales) {
        const version = pickVariant(campaign, loc);
        try {
          await sendEmail({
            to,
            subject: testSubject(version.subject, version.locale),
            // Dummy token: a test's unsubscribe link must not
            // unsubscribe anyone.
            html:
              campaign.audience === 'cercle'
                ? cercleCampaignHtml({
                    body: version.body,
                    token: 'test',
                    locale: version.locale,
                    title: version.subject,
                    sender: senderIdentity(),
                  })
                : campaignHtml(
                    version.body,
                    'test',
                    version.locale,
                    version.subject,
                  ),
            headers:
              campaign.audience === 'cercle'
                ? cercleListUnsubscribeHeaders('test', version.locale)
                : listUnsubscribeHeaders('test', version.locale),
          });
        } catch (err) {
          console.error(
            `[newsletter] envoi de test en échec : ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
    return null;
  },
});

export const _campaignContent = internalQuery({
  args: { campaignId: v.id('newsletterCampaigns') },
  returns: v.union(
    v.null(),
    v.object({
      subject: v.string(),
      body: v.string(),
      locale: v.optional(locale),
      variants: v.optional(v.array(variantValidator)),
      audience: audienceValidator,
    }),
  ),
  handler: async (ctx, { campaignId }) => {
    const c = await ctx.db.get(campaignId);
    if (!c) return null;
    return {
      subject: c.subject,
      body: c.body,
      locale: c.locale,
      variants: c.variants,
      audience: audienceOf(c),
    };
  },
});

// Starts sending: switches to 'sending', then the ENQUEUEING (one
// `newsletterDeliveries` row per confirmed subscriber, in pages of 500) and the
// DELIVERY in batches are scheduled. The screen follows progress live.
export const WAVE_SIZE_MAX = 10_000;
export const sendCampaign = mutation({
  args: {
    campaignId: v.id('newsletterCampaigns'),
    // SENDING IN WAVES (Cercle campaigns): serve this many recipients, then hold
    // the campaign `paused` until `releaseNextWave`. Missing = the whole list.
    waveSize: v.optional(v.number()),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { campaignId, waveSize }) => {
    const editor = await requireNetworkRole(ctx, 'editeur');
    const campaign = await ctx.db.get(campaignId);
    if (!campaign) throw new Error('NOT_FOUND');
    if (campaign.status !== 'draft') throw new Error('ALREADY_SENT');
    // Without a provider, delivery would fail subscriber by subscriber and the
    // campaign would end as "Error" without a word: we refuse BEFOREHAND, and the screen
    // translates the code (27/09 campaign, R-07). In explicit dev/test
    // (AUTH_DEV_OTP=true) simulated sending remains possible.
    if (emailProviderStatus().mode === 'none') {
      throw new Error('EMAIL_PROVIDER_NOT_CONFIGURED');
    }
    // A message to the Cercle's list must say who writes and where they are.
    // While the association's name or postal address is still a placeholder,
    // nothing goes to real recipients (a simulated development send is fine).
    if (
      audienceOf(campaign) === 'cercle' &&
      senderIdentity().placeholder &&
      emailProviderStatus().mode !== 'simulated'
    ) {
      throw new ConvexError('SENDER_IDENTITY_MISSING');
    }
    if (waveSize !== undefined) {
      // Waves are a Cercle tool: the newsletter screen does not know the
      // `paused` state, and a held newsletter would look like a stuck one.
      if (audienceOf(campaign) !== 'cercle') {
        throw new ConvexError('WAVES_NOT_AVAILABLE');
      }
      if (
        !Number.isInteger(waveSize) ||
        waveSize < 1 ||
        waveSize > WAVE_SIZE_MAX
      ) {
        throw new ConvexError('INVALID_WAVE_SIZE');
      }
    }
    // INTERNAL TEST FIRST. A message to the Cercle's list goes out only if the
    // team has received it — and the version they received is the one being
    // sent: a test sent before the last change does not count.
    if (
      audienceOf(campaign) === 'cercle' &&
      (campaign.lastTestAt === undefined ||
        campaign.lastTestAt < (campaign.editedAt ?? campaign.createdAt))
    ) {
      throw new ConvexError('TEST_REQUIRED');
    }
    await ctx.db.patch(campaignId, {
      status: 'sending',
      startedAt: Date.now(),
      ...(waveSize !== undefined ? { waveLimit: waveSize } : {}),
      totalCount: 0,
      recipientCount: 0,
      failedCount: 0,
      skippedCount: 0,
      enqueueDone: false,
    });
    await ctx.scheduler.runAfter(0, internal.newsletter._enqueue, {
      campaignId,
      cursor: null,
    });
    await recordAudit(ctx, {
      actorId: editor._id,
      action: AUDIT.NEWSLETTER_CAMPAIGN_SENT,
      targetId: campaignId,
    });
    return { ok: true };
  },
});

// ENQUEUEING, by pages. IDEMPOTENT: a replayed page (resumption after
// an error) does not create a second row for a subscriber already queued — hence no
// second send.
const ENQUEUE_PAGE = 500;
export const _enqueue = internalMutation({
  args: {
    campaignId: v.id('newsletterCampaigns'),
    cursor: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, { campaignId, cursor }) => {
    const campaign = await ctx.db.get(campaignId);
    // Enqueueing carries on while a campaign is held between waves: what is
    // queued must be there when the next wave is released.
    if (
      !campaign ||
      (campaign.status !== 'sending' && campaign.status !== 'paused')
    )
      return null;
    let added = 0;
    let page: { isDone: boolean; continueCursor: string };
    if (audienceOf(campaign) === 'cercle') {
      const contacts = await ctx.db
        .query('cercleContacts')
        .withIndex('by_status_and_expiry', (q) => q.eq('status', 'confirmed'))
        .paginate({ numItems: ENQUEUE_PAGE, cursor });
      page = contacts;
      for (const contact of contacts.page) {
        const already = await ctx.db
          .query('newsletterDeliveries')
          .withIndex('by_campaign_and_contact', (q) =>
            q.eq('campaignId', campaignId).eq('contactId', contact._id),
          )
          .first();
        if (already) continue;
        await ctx.db.insert('newsletterDeliveries', {
          campaignId,
          contactId: contact._id,
          status: 'queued',
          attempts: 0,
          locale: contact.locale,
        });
        added++;
      }
    } else {
      const subs = await ctx.db
        .query('newsletterSubscriptions')
        .withIndex('by_status_and_expiry', (q) => q.eq('status', 'confirmed'))
        .paginate({ numItems: ENQUEUE_PAGE, cursor });
      page = subs;
      for (const sub of subs.page) {
        const already = await ctx.db
          .query('newsletterDeliveries')
          .withIndex('by_campaign_and_subscription', (q) =>
            q.eq('campaignId', campaignId).eq('subscriptionId', sub._id),
          )
          .first();
        if (already) continue;
        await ctx.db.insert('newsletterDeliveries', {
          campaignId,
          subscriptionId: sub._id,
          status: 'queued',
          attempts: 0,
          locale: sub.locale,
        });
        added++;
      }
    }
    await ctx.db.patch(campaignId, {
      totalCount: (campaign.totalCount ?? 0) + added,
      enqueueDone: page.isDone,
    });
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.newsletter._enqueue, {
        campaignId,
        cursor: page.continueCursor,
      });
    }
    // Delivery starts from the first page: a large list does not wait
    // to be fully queued before the first batches go out.
    if (cursor === null) {
      await ctx.scheduler.runAfter(0, internal.newsletter._processBatch, {
        campaignId,
      });
    }
    return null;
  },
});

const recipientValidator = v.object({
  deliveryId: v.id('newsletterDeliveries'),
  email: v.string(),
  locale: v.optional(locale),
  unsubToken: v.string(),
});

const claimResult = v.union(
  v.object({
    kind: v.literal('batch'),
    claimId: v.string(),
    attempt: v.number(),
    recipients: v.array(recipientValidator),
  }),
  // `retryInMs`: when to come back. An in-flight batch is resumed when
  // its lease expires, not before; an ongoing enqueueing, at the next interval.
  v.object({ kind: v.literal('wait'), retryInMs: v.optional(v.number()) }),
  v.object({ kind: v.literal('done') }),
);

// Claims a BATCH. Three cases, in this order:
//  1. a batch left "in progress" beyond its lease (action cut off) is RESUMED as
//     is, with its `claimId` — hence the same idempotency key;
//  2. otherwise, the next `batchSize` queued rows form a new batch;
//  3. otherwise, the campaign is finished (if enqueueing is too).
export const _claimBatch = internalMutation({
  args: { campaignId: v.id('newsletterCampaigns'), batchSize: v.number() },
  returns: claimResult,
  handler: async (ctx, { campaignId, batchSize }) => {
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.status !== 'sending')
      return { kind: 'done' as const };
    const now = Date.now();

    const inFlight = await ctx.db
      .query('newsletterDeliveries')
      .withIndex('by_campaign_and_status', (q) =>
        q.eq('campaignId', campaignId).eq('status', 'sending'),
      )
      .take(1);
    if (inFlight.length > 0) {
      const stale = inFlight[0];
      if (
        stale.claimId === undefined ||
        (stale.claimedAt ?? 0) > now - CLAIM_LEASE_MS
      ) {
        return {
          kind: 'wait' as const,
          retryInMs: (stale.claimedAt ?? now) + CLAIM_LEASE_MS - now + 1,
        };
      }
      const rows = await ctx.db
        .query('newsletterDeliveries')
        .withIndex('by_claim', (q) => q.eq('claimId', stale.claimId))
        .collect();
      // The batch is replayed IDENTICALLY — same recipients, same key:
      // that is the condition for the provider to recognize the request and
      // not send a second time what may already have gone out.
      const recipients = [];
      let attempt = 1;
      for (const row of rows) {
        if (row.status !== 'sending') continue;
        const who = await recipientOf(ctx, row);
        await ctx.db.patch(row._id, {
          claimedAt: now,
          attempts: row.attempts + 1,
        });
        attempt = Math.max(attempt, row.attempts + 1);
        recipients.push({
          deliveryId: row._id,
          email: who?.email ?? '',
          locale: row.locale,
          unsubToken: who?.unsubToken ?? '',
        });
      }
      return {
        kind: 'batch' as const,
        claimId: stale.claimId,
        attempt,
        recipients,
      };
    }

    // THE LIMITS ON THIS BATCH: the sending service's daily quota and, for a
    // campaign sent in waves, what the current wave still allows. Both can
    // shrink the batch to nothing.
    const config = deliveryConfig();
    const allowance = batchAllowance({
      batchSize: Math.max(1, Math.min(100, batchSize)),
      dailyRemaining: await dailyRemaining(ctx, config.dailyLimit, now),
      waveRemaining:
        campaign.waveLimit === undefined
          ? undefined
          : Math.max(
              0,
              campaign.waveLimit -
                (campaign.recipientCount ?? 0) -
                (campaign.failedCount ?? 0),
            ),
    });
    const queued =
      allowance.size > 0
        ? await ctx.db
            .query('newsletterDeliveries')
            .withIndex('by_campaign_and_status', (q) =>
              q.eq('campaignId', campaignId).eq('status', 'queued'),
            )
            .take(allowance.size)
        : [];
    if (queued.length === 0) {
      // Is there still something to send once the limit lifts?
      const more =
        allowance.size === 0
          ? (
              await ctx.db
                .query('newsletterDeliveries')
                .withIndex('by_campaign_and_status', (q) =>
                  q.eq('campaignId', campaignId).eq('status', 'queued'),
                )
                .take(1)
            ).length > 0
          : false;
      if (allowance.size === 0 && (more || !campaign.enqueueDone)) {
        if (allowance.limitedBy === 'wave') {
          // The wave is served: the campaign is HELD, and nothing is scheduled
          // until someone releases the next one (`releaseNextWave`).
          await ctx.db.patch(campaignId, {
            status: 'paused',
            pausedUntil: undefined,
          });
          return { kind: 'done' as const };
        }
        // Today's quota is spent: come back at the next UTC midnight.
        const retryInMs = msUntilNextUtcDay(now);
        await ctx.db.patch(campaignId, { pausedUntil: now + retryInMs });
        return { kind: 'wait' as const, retryInMs };
      }
      if (!campaign.enqueueDone) return { kind: 'wait' as const };
      const sent = campaign.recipientCount ?? 0;
      const failed = campaign.failedCount ?? 0;
      await ctx.db.patch(campaignId, {
        status: failed > 0 && sent === 0 ? 'error' : 'sent',
        sentAt: now,
        pausedUntil: undefined,
      });
      return { kind: 'done' as const };
    }
    if (campaign.pausedUntil !== undefined) {
      await ctx.db.patch(campaignId, { pausedUntil: undefined });
    }

    const claimId = `${campaignId}:${queued[0]._id}:${queued[0].attempts}`;
    const recipients = [];
    let skipped = 0;
    for (const row of queued) {
      const who = await recipientOf(ctx, row);
      // Left between enqueueing and sending (unsubscribed): we do not write
      // to them. The status says so, and so does the counter.
      if (!who || !who.active) {
        await ctx.db.patch(row._id, { status: 'skipped' });
        skipped++;
        continue;
      }
      await ctx.db.patch(row._id, {
        status: 'sending',
        claimId,
        claimedAt: now,
        attempts: row.attempts + 1,
      });
      recipients.push({
        deliveryId: row._id,
        email: who.email,
        locale: who.locale ?? row.locale,
        unsubToken: who.unsubToken,
      });
    }
    if (skipped > 0) {
      await ctx.db.patch(campaignId, {
        skippedCount: (campaign.skippedCount ?? 0) + skipped,
      });
    }
    if (recipients.length === 0) return { kind: 'wait' as const };
    return { kind: 'batch' as const, claimId, attempt: 1, recipients };
  },
});

export const _recordResults = internalMutation({
  args: {
    campaignId: v.id('newsletterCampaigns'),
    results: v.array(
      v.object({
        deliveryId: v.id('newsletterDeliveries'),
        ok: v.boolean(),
        providerId: v.optional(v.string()),
        error: v.optional(v.string()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { campaignId, results }) => {
    const campaign = await ctx.db.get(campaignId);
    if (!campaign) return null;
    let sent = 0;
    let failed = 0;
    const now = Date.now();
    for (const r of results) {
      const row = await ctx.db.get(r.deliveryId);
      // Already decided (result replayed after a resumption): we do not count
      // twice.
      if (!row || row.status !== 'sending') continue;
      if (r.ok) {
        await ctx.db.patch(r.deliveryId, {
          status: 'sent',
          sentAt: now,
          providerId: r.providerId,
          error: undefined,
        });
        sent++;
      } else {
        await ctx.db.patch(r.deliveryId, {
          status: 'failed',
          error: r.error?.slice(0, 300),
        });
        failed++;
      }
    }
    await ctx.db.patch(campaignId, {
      recipientCount: (campaign.recipientCount ?? 0) + sent,
      failedCount: (campaign.failedCount ?? 0) + failed,
    });
    // Counts against the sending service's daily quota (only what went out).
    await addSent(ctx, sent, now);
    return null;
  },
});

// Transient failure: the batch stays "in progress" but its lease expires
// immediately — it will be RESUMED on the next pass, same `claimId`, hence the same
// idempotency key. Beyond MAX_TRANSIENT_ATTEMPTS, the rows are marked as
// failed (retryable from the screen).
export const _releaseClaim = internalMutation({
  args: {
    campaignId: v.id('newsletterCampaigns'),
    claimId: v.string(),
    error: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { campaignId, claimId, error }) => {
    const rows = await ctx.db
      .query('newsletterDeliveries')
      .withIndex('by_claim', (q) => q.eq('claimId', claimId))
      .collect();
    let failed = 0;
    for (const row of rows) {
      if (row.status !== 'sending') continue;
      if (row.attempts >= MAX_TRANSIENT_ATTEMPTS) {
        await ctx.db.patch(row._id, { status: 'failed', error });
        failed++;
      } else {
        await ctx.db.patch(row._id, { claimedAt: 0, error });
      }
    }
    if (failed > 0) {
      const campaign = await ctx.db.get(campaignId);
      if (campaign) {
        await ctx.db.patch(campaignId, {
          failedCount: (campaign.failedCount ?? 0) + failed,
        });
      }
    }
    return null;
  },
});

// Delivery loop: one batch, then the next after the pause derived from the
// configured rate. A single chain per campaign.
export const _processBatch = internalAction({
  args: { campaignId: v.id('newsletterCampaigns') },
  returns: v.null(),
  handler: async (ctx, { campaignId }) => {
    const config = deliveryConfig();
    const claim: Infer<typeof claimResult> = await ctx.runMutation(
      internal.newsletter._claimBatch,
      {
        campaignId,
        batchSize: config.batchSize,
      },
    );
    if (claim.kind === 'done') return null;
    if (claim.kind === 'wait') {
      await ctx.scheduler.runAfter(
        Math.max(config.intervalMs, claim.retryInMs ?? 0),
        internal.newsletter._processBatch,
        { campaignId },
      );
      return null;
    }

    const campaign: CampaignContent | null = await ctx.runQuery(
      internal.newsletter._campaignContent,
      { campaignId },
    );
    if (!campaign) return null;

    // Read ONCE per batch (an environment read), so every message of the batch
    // carries the same identity.
    const sender = senderIdentity();
    const messages = claim.recipients.map((r) => {
      const version = pickVariant(campaign, r.locale);
      if (campaign.audience === 'cercle') {
        return {
          to: r.email,
          subject: version.subject,
          html: cercleCampaignHtml({
            body: version.body,
            token: r.unsubToken,
            locale: version.locale,
            title: version.subject,
            sender,
          }),
          headers: cercleListUnsubscribeHeaders(r.unsubToken, version.locale),
        };
      }
      return {
        to: r.email,
        subject: version.subject,
        html: campaignHtml(
          version.body,
          r.unsubToken,
          version.locale,
          version.subject,
        ),
        headers: listUnsubscribeHeaders(r.unsubToken, version.locale),
      };
    });

    try {
      const results = await sendEmailBatch(
        messages,
        idempotencyKey(claim.claimId),
      );
      await ctx.runMutation(internal.newsletter._recordResults, {
        campaignId,
        results: claim.recipients.map((r, i) => {
          const res = results[i];
          return res.ok
            ? { deliveryId: r.deliveryId, ok: true, providerId: res.id }
            : { deliveryId: r.deliveryId, ok: false, error: res.error };
        }),
      });
      await ctx.scheduler.runAfter(
        config.intervalMs,
        internal.newsletter._processBatch,
        { campaignId },
      );
    } catch (err) {
      const message = (err instanceof Error ? err.message : String(err)).slice(
        0,
        300,
      );
      await ctx.runMutation(internal.newsletter._releaseClaim, {
        campaignId,
        claimId: claim.claimId,
        error: message,
      });
      await ctx.scheduler.runAfter(
        err instanceof TransientEmailError
          ? backoffMs(claim.attempt, config.intervalMs)
          : config.intervalMs,
        internal.newsletter._processBatch,
        { campaignId },
      );
    }
    return null;
  },
});

// RETRY AFTER FAILURE: failed recipients go back into the queue and
// delivery restarts. No recipient already served is touched (`sent` is
// never re-queued) — this is what guarantees there are no duplicates.
export const retryFailedDeliveries = mutation({
  args: { campaignId: v.id('newsletterCampaigns') },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { campaignId }) => {
    const editor = await requireNetworkRole(ctx, 'editeur');
    const campaign = await ctx.db.get(campaignId);
    if (!campaign) throw new Error('NOT_FOUND');
    if (campaign.status !== 'sent' && campaign.status !== 'error') {
      throw new Error('NOT_RETRYABLE');
    }
    if (emailProviderStatus().mode === 'none') {
      throw new Error('EMAIL_PROVIDER_NOT_CONFIGURED');
    }
    if (
      audienceOf(campaign) === 'cercle' &&
      senderIdentity().placeholder &&
      emailProviderStatus().mode !== 'simulated'
    ) {
      throw new ConvexError('SENDER_IDENTITY_MISSING');
    }
    await ctx.db.patch(campaignId, { status: 'sending', enqueueDone: false });
    await ctx.scheduler.runAfter(0, internal.newsletter._requeueFailed, {
      campaignId,
    });
    await recordAudit(ctx, {
      actorId: editor._id,
      action: AUDIT.NEWSLETTER_CAMPAIGN_RETRIED,
      targetId: campaignId,
    });
    return { ok: true };
  },
});

export const _requeueFailed = internalMutation({
  args: { campaignId: v.id('newsletterCampaigns') },
  returns: v.null(),
  handler: async (ctx, { campaignId }) => {
    const campaign = await ctx.db.get(campaignId);
    if (!campaign || campaign.status !== 'sending') return null;
    const failed = await ctx.db
      .query('newsletterDeliveries')
      .withIndex('by_campaign_and_status', (q) =>
        q.eq('campaignId', campaignId).eq('status', 'failed'),
      )
      .take(ENQUEUE_PAGE);
    for (const row of failed) {
      await ctx.db.patch(row._id, {
        status: 'queued',
        claimId: undefined,
        claimedAt: undefined,
        error: undefined,
      });
    }
    const done = failed.length < ENQUEUE_PAGE;
    await ctx.db.patch(campaignId, {
      failedCount: Math.max(0, (campaign.failedCount ?? 0) - failed.length),
      enqueueDone: done,
    });
    await ctx.scheduler.runAfter(
      0,
      done
        ? internal.newsletter._processBatch
        : internal.newsletter._requeueFailed,
      { campaignId },
    );
    return null;
  },
});

// RELEASING THE NEXT WAVE of a campaign sent in waves: it was held `paused`
// after serving `waveLimit` recipients; this widens the limit by `size` and
// restarts the delivery chain. The gap between two waves is the time to look at
// what the first one produced (failures, bounces, replies) before going on.
export const releaseNextWave = mutation({
  args: { campaignId: v.id('newsletterCampaigns'), size: v.number() },
  returns: v.object({ ok: v.boolean(), waveLimit: v.number() }),
  handler: async (ctx, { campaignId, size }) => {
    const editor = await requireNetworkRole(ctx, 'editeur');
    const campaign = await ctx.db.get(campaignId);
    if (!campaign) throw new Error('NOT_FOUND');
    if (campaign.status !== 'paused' || campaign.waveLimit === undefined) {
      throw new ConvexError('NOT_PAUSED');
    }
    if (!Number.isInteger(size) || size < 1 || size > WAVE_SIZE_MAX) {
      throw new ConvexError('INVALID_WAVE_SIZE');
    }
    if (emailProviderStatus().mode === 'none') {
      throw new Error('EMAIL_PROVIDER_NOT_CONFIGURED');
    }
    const waveLimit = campaign.waveLimit + size;
    await ctx.db.patch(campaignId, { status: 'sending', waveLimit });
    await ctx.scheduler.runAfter(0, internal.newsletter._processBatch, {
      campaignId,
    });
    await recordAudit(ctx, {
      actorId: editor._id,
      action: AUDIT.NEWSLETTER_WAVE_RELEASED,
      targetId: campaignId,
      metadata: { size, waveLimit },
    });
    return { ok: true, waveLimit };
  },
});

// Failure reasons for a campaign (sample) — so the editor knows
// what to fix before retrying (key refused, domain not verified…).
export const campaignFailures = query({
  args: { campaignId: v.id('newsletterCampaigns') },
  returns: v.array(v.object({ error: v.string(), count: v.number() })),
  handler: async (ctx, { campaignId }) => {
    await requireNetworkRole(ctx, 'editeur');
    const rows = await ctx.db
      .query('newsletterDeliveries')
      .withIndex('by_campaign_and_status', (q) =>
        q.eq('campaignId', campaignId).eq('status', 'failed'),
      )
      .take(200);
    const byError = new Map<string, number>();
    for (const r of rows) {
      const key = r.error ?? '—';
      byError.set(key, (byError.get(key) ?? 0) + 1);
    }
    return [...byError.entries()]
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  },
});

// WHO did not get it, and why — the addresses behind `campaignFailures`' counts,
// so the editor can see a typo, a bounced mailbox or a refused domain by name
// before retrying. A bounded sample, editor and above.
export const campaignFailedRecipients = query({
  args: { campaignId: v.id('newsletterCampaigns') },
  returns: v.array(v.object({ email: v.string(), error: v.string() })),
  handler: async (ctx, { campaignId }) => {
    await requireNetworkRole(ctx, 'editeur');
    const rows = await ctx.db
      .query('newsletterDeliveries')
      .withIndex('by_campaign_and_status', (q) =>
        q.eq('campaignId', campaignId).eq('status', 'failed'),
      )
      .take(50);
    const out: { email: string; error: string }[] = [];
    for (const row of rows) {
      const email = row.contactId
        ? (await ctx.db.get(row.contactId))?.email
        : row.subscriptionId
          ? (await ctx.db.get(row.subscriptionId))?.email
          : undefined;
      out.push({ email: email ?? '—', error: row.error ?? '—' });
    }
    return out;
  },
});
