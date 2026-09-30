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
  CLAIM_LEASE_MS,
  MAX_TRANSIENT_ATTEMPTS,
  backoffMs,
  deliveryConfig,
  idempotencyKey,
} from './lib/newsletterDelivery';

// Random token (unsubscribe link).
function newToken(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

const campaignStatus = v.union(
  v.literal('draft'),
  v.literal('sending'),
  v.literal('sent'),
  v.literal('error'),
);

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
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('newsletterCampaigns'),
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
    }),
  ),
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'editeur');
    const recent = await ctx.db
      .query('newsletterCampaigns')
      .order('desc')
      .take(50);
    return recent.map((c) => ({
      _id: c._id,
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
  args: { subject: v.string(), body: v.string(), locale: v.optional(locale) },
  returns: v.id('newsletterCampaigns'),
  handler: async (ctx, args) => {
    const editor = await requireNetworkRole(ctx, 'editeur');
    const { subject, body } = checkContent(args.subject, args.body);
    return await ctx.db.insert('newsletterCampaigns', {
      subject,
      body,
      locale: args.locale ?? 'fr',
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
    await ctx.db.patch(args.campaignId, { variants });
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
    });
    return null;
  },
});

// TEST SEND TO ONESELF: all versions (reference + translations)
// go to the editor's account address, subject prefixed with "[TEST]".
// Nothing is enqueued, the draft stays a draft.
export const sendTestCampaign = mutation({
  args: { campaignId: v.id('newsletterCampaigns') },
  returns: v.object({ ok: v.boolean(), to: v.string(), versions: v.number() }),
  handler: async (ctx, { campaignId }) => {
    const editor = await requireNetworkRole(ctx, 'editeur');
    const campaign = await ctx.db.get(campaignId);
    if (!campaign) throw new Error('NOT_FOUND');
    if (emailProviderStatus().mode === 'none') {
      throw new Error('EMAIL_PROVIDER_NOT_CONFIGURED');
    }
    const to = editor.email?.trim().toLowerCase();
    if (!to || !isEmail(to)) throw new Error('NO_EDITOR_EMAIL');
    await enforceRateLimit(ctx, {
      key: `nlTest:${editor._id}`,
      max: 10,
      windowMs: 60 * 60 * 1000,
    });
    await ctx.db.patch(campaignId, { lastTestAt: Date.now() });
    await ctx.scheduler.runAfter(0, internal.newsletter._deliverTest, {
      campaignId,
      to,
    });
    await recordAudit(ctx, {
      actorId: editor._id,
      action: AUDIT.NEWSLETTER_TEST_SENT,
      targetId: campaignId,
    });
    return { ok: true, to, versions: 1 + (campaign.variants?.length ?? 0) };
  },
});

export const _deliverTest = internalAction({
  args: { campaignId: v.id('newsletterCampaigns'), to: v.string() },
  returns: v.null(),
  handler: async (ctx, { campaignId, to }) => {
    const campaign: CampaignContent | null = await ctx.runQuery(
      internal.newsletter._campaignContent,
      { campaignId },
    );
    if (!campaign) return null;
    const locales: SiteLocale[] = [
      campaign.locale ?? 'fr',
      ...(campaign.variants ?? []).map((x) => x.locale),
    ];
    for (const loc of locales) {
      const version = pickVariant(campaign, loc);
      try {
        await sendEmail({
          to,
          subject: testSubject(version.subject, version.locale),
          // Dummy token: a test's unsubscribe link must not
          // unsubscribe anyone.
          html: campaignHtml(
            version.body,
            'test',
            version.locale,
            version.subject,
          ),
          headers: listUnsubscribeHeaders('test', version.locale),
        });
      } catch (err) {
        console.error(
          `[newsletter] envoi de test en échec : ${err instanceof Error ? err.message : String(err)}`,
        );
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
    };
  },
});

// Starts sending: switches to 'sending', then the ENQUEUEING (one
// `newsletterDeliveries` row per confirmed subscriber, in pages of 500) and the
// DELIVERY in batches are scheduled. The screen follows progress live.
export const sendCampaign = mutation({
  args: { campaignId: v.id('newsletterCampaigns') },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { campaignId }) => {
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
    await ctx.db.patch(campaignId, {
      status: 'sending',
      startedAt: Date.now(),
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
    if (!campaign || campaign.status !== 'sending') return null;
    const page = await ctx.db
      .query('newsletterSubscriptions')
      .withIndex('by_status_and_expiry', (q) => q.eq('status', 'confirmed'))
      .paginate({ numItems: ENQUEUE_PAGE, cursor });
    let added = 0;
    for (const sub of page.page) {
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
        const sub = await ctx.db.get(row.subscriptionId);
        await ctx.db.patch(row._id, {
          claimedAt: now,
          attempts: row.attempts + 1,
        });
        attempt = Math.max(attempt, row.attempts + 1);
        recipients.push({
          deliveryId: row._id,
          email: sub?.email ?? '',
          locale: row.locale,
          unsubToken: sub?.unsubToken ?? '',
        });
      }
      return {
        kind: 'batch' as const,
        claimId: stale.claimId,
        attempt,
        recipients,
      };
    }

    const queued = await ctx.db
      .query('newsletterDeliveries')
      .withIndex('by_campaign_and_status', (q) =>
        q.eq('campaignId', campaignId).eq('status', 'queued'),
      )
      .take(Math.max(1, Math.min(100, batchSize)));
    if (queued.length === 0) {
      if (!campaign.enqueueDone) return { kind: 'wait' as const };
      const sent = campaign.recipientCount ?? 0;
      const failed = campaign.failedCount ?? 0;
      await ctx.db.patch(campaignId, {
        status: failed > 0 && sent === 0 ? 'error' : 'sent',
        sentAt: now,
      });
      return { kind: 'done' as const };
    }

    const claimId = `${campaignId}:${queued[0]._id}:${queued[0].attempts}`;
    const recipients = [];
    let skipped = 0;
    for (const row of queued) {
      const sub = await ctx.db.get(row.subscriptionId);
      // Left between enqueueing and sending (unsubscribed): we do not write
      // to them. The status says so, and so does the counter.
      if (!sub || sub.status !== 'confirmed' || !sub.unsubToken) {
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
        email: sub.email,
        locale: sub.locale ?? row.locale,
        unsubToken: sub.unsubToken,
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

    const messages = claim.recipients.map((r) => {
      const version = pickVariant(campaign, r.locale);
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
