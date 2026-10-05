import { ConvexError } from 'convex/values';
import type { MutationCtx } from '../_generated/server';

// Rate limiter (security — defence in depth) against spam / abuse on public
// endpoints. Threat profile: spikes during a summit, contributors in
// sensitive areas. FIXED window: one counter per key, reset once the window
// has passed.
//
// Key = actor identifier: e-mail for anonymous endpoints (contact,
// membership), userId for authenticated endpoints (submission, upload).
//
// LIMITS: the e-mail key is SUPPLIED BY THE CALLER, hence forgeable — varying
// the address yields a fresh quota (audit M2, issue #24). It bounds an honest
// actor, not a script. The non-forgeable caps (per IP, and global per form)
// live further down in this file: `enforcePublicFormLimit`.
//
// When exceeded: ConvexError('RATE_LIMITED') — `data` reaches the client
// (unlike a bare Error, masked in prod), for a dedicated message.
export type RateLimitRule = { key: string; max: number; windowMs: number };

export async function enforceRateLimit(
  ctx: MutationCtx,
  rule: RateLimitRule,
): Promise<void> {
  if (!(await consumeRateLimit(ctx, rule))) {
    throw new ConvexError('RATE_LIMITED');
  }
}

// NON-blocking variant: consumes a token and says whether any were left,
// instead of throwing. For calls where exceeding the quota is not an error to
// surface to the user but an action not to count (see recordPublicationView:
// one view too many must not break anything on the page, just not count).
// `enforceRateLimit` is this function + a throw.
export async function consumeRateLimit(
  ctx: MutationCtx,
  { key, max, windowMs }: RateLimitRule,
): Promise<boolean> {
  const now = Date.now();
  const existing = await ctx.db
    .query('rateLimits')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();

  if (!existing) {
    await ctx.db.insert('rateLimits', { key, count: 1, windowStart: now });
    return true;
  }
  if (now - existing.windowStart >= windowMs) {
    // Expired window -> new window.
    await ctx.db.patch(existing._id, { count: 1, windowStart: now });
    return true;
  }
  if (existing.count >= max) {
    return false;
  }
  await ctx.db.patch(existing._id, { count: existing.count + 1 });
  return true;
}

const HOUR = 60 * 60 * 1000;

// Centralised limits (generous: normal human usage does not reach them).
export const RATE_LIMITS = {
  contact: { max: 5, windowMs: HOUR },
  apply: { max: 5, windowMs: HOUR },
  newsletter: { max: 5, windowMs: HOUR },
  // Sending OTP / verification / reset codes by e-mail (anti e-mail-bombing:
  // the message goes to an address supplied by the caller). Generous for human
  // usage (sign-up + one resend + reset), strict against abuse.
  otpSend: { max: 8, windowMs: HOUR },
  eventRegister: { max: 10, windowMs: HOUR },
  tribunePost: { max: 10, windowMs: HOUR },
  tribuneComment: { max: 40, windowMs: HOUR },
  tribuneReport: { max: 20, windowMs: HOUR },
  publicationSubmit: { max: 10, windowMs: 24 * HOUR },
  projectSubmit: { max: 5, windowMs: 24 * HOUR },
  workspaceCreate: { max: 10, windowMs: 24 * HOUR },
  workspaceNote: { max: 60, windowMs: HOUR },
  upload: { max: 30, windowMs: HOUR },
  // Payments (F-27/F-28): a request opens a session at a third-party provider —
  // the cap also bounds the calls a script could get billed.
  donation: { max: 10, windowMs: HOUR },
  dues: { max: 10, windowMs: HOUR },
  checkoutSync: { max: 30, windowMs: HOUR },
  // Community workstream: invitations (space, deep-dive) and uploads into a
  // space. An invitation notifies someone else: this cap is what stops it from
  // becoming a harassment channel.
  workspaceInvite: { max: 30, windowMs: 24 * HOUR },
  workspaceUpload: { max: 60, windowMs: HOUR },
  deepeningInvite: { max: 20, windowMs: 24 * HOUR },
  tribuneEdit: { max: 30, windowMs: HOUR },
} as const;

// --- NON-FORGEABLE caps (audit M2, issue #24) --------------------------------
//
// The limits above are keyed on a form field (the e-mail): a script that
// varies the address gets a fresh quota on every request, and fills the table
// at will. Two additional caps, which depend on NO data from the request
// body, close this hole:
//
//  1. PER IP — Convex 1.42 exposes the HTTP request metadata to mutations as
//     well as actions: `ctx.meta.getRequestMetadata()` returns
//     `{ ip, userAgent, requestId, scheduledFunctionId }`. The IP is the one
//     seen by the Convex infrastructure, not a payload field: the caller
//     cannot choose it. Key point for this repo: a function called via
//     `runMutation` INHERITS its caller's metadata — the business
//     internalMutation therefore sees the IP of the client that called the
//     gateway action, without having to pass the address as an argument
//     (which would have made it… supplied by the caller, and the problem
//     would have remained untouched).
//
//  2. GLOBAL PER FORM — a single counter per form, with no key at all. Last
//     line of defence: it holds even behind an address pool (botnet, proxies,
//     carrier NAT) and when the IP is unavailable.
//
// Accepted TRADE-OFF of the global cap: an attacker can reach it, and it then
// blocks legitimate submissions until the end of the window. It is a
// time-bounded denial of service, preferred over unlimited filling of the
// database. It is therefore set WIDE — the per-IP cap stops a single-source
// attacker well before —, and network hardening remains the edge layer's job.
//
// Both counters live in the same `rateLimits` table, in distinct namespaces
// (`ip:<form>:<address>` and `form:<form>`): no possible collision with the
// existing e-mail/userId keys.

type PublicFormLimit = {
  perIp: { max: number; windowMs: number };
  global: { max: number; windowMs: number };
};

// Limits per public form (the seven tables the audit flags as exposed to
// flooding). Generous on purpose: normal human usage, even at a summit peak
// and even behind a shared NAT, does not reach them.
export const PUBLIC_FORM_LIMITS = {
  contact: {
    perIp: { max: 20, windowMs: HOUR },
    global: { max: 200, windowMs: HOUR },
  },
  apply: {
    perIp: { max: 20, windowMs: HOUR },
    global: { max: 100, windowMs: HOUR },
  },
  newsletter: {
    perIp: { max: 30, windowMs: HOUR },
    global: { max: 500, windowMs: HOUR },
  },
  eventRegister: {
    perIp: { max: 30, windowMs: HOUR },
    global: { max: 500, windowMs: HOUR },
  },
  eventReminder: {
    perIp: { max: 30, windowMs: HOUR },
    global: { max: 500, windowMs: HOUR },
  },
  youthApply: {
    perIp: { max: 20, windowMs: HOUR },
    global: { max: 200, windowMs: HOUR },
  },
  mentorship: {
    perIp: { max: 20, windowMs: HOUR },
    global: { max: 200, windowMs: HOUR },
  },
  // KOHOP: answer to an external reviewer's invitation (token link, no
  // account). Tokens are 256-bit, so this bounds noise, not guessing.
  kohopInvitation: {
    perIp: { max: 30, windowMs: HOUR },
    global: { max: 300, windowMs: HOUR },
  },
  // Donation form (F-28), open to visitors. The global cap is wide: a
  // fundraising campaign causes legitimate spikes.
  donation: {
    perIp: { max: 20, windowMs: HOUR },
    global: { max: 500, windowMs: HOUR },
  },
} satisfies Record<string, PublicFormLimit>;

export type PublicForm = keyof typeof PUBLIC_FORM_LIMITS;

// Groups an address into a "billable block" before making it a key.
//
// IPv4: the whole address. IPv6: the /64 — an operator commonly delegates a
// whole prefix to a single subscriber, who can therefore change address at
// will within the block. Counting per full address would make the per-IP cap
// free to bypass over IPv6. Abbreviated forms (`2001:db8::1`) and
// IPv4-mapped addresses (`::ffff:203.0.113.7`) are reduced to the same form
// as their direct equivalent, so that the same client does not count twice
// depending on how the infrastructure wrote its address.
export function ipBucket(raw: string): string {
  const ip = raw.trim().toLowerCase();
  if (!ip) return '';
  if (!ip.includes(':')) return ip; // IPv4

  // IPv4 mapped into IPv6 (::ffff:a.b.c.d) -> we keep the IPv4.
  const mapped = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(ip);
  if (mapped) return mapped[1];

  // Expands the `::` abbreviation into 8 hextets, then keeps the first 4.
  const [head, tail] = ip.split('::');
  const left = head ? head.split(':') : [];
  const right = ip.includes('::') && tail ? tail.split(':') : [];
  const hextets = ip.includes('::')
    ? [
        ...left,
        ...Array<string>(Math.max(8 - left.length - right.length, 0)).fill('0'),
        ...right,
      ]
    : left;

  const prefix = hextets
    .slice(0, 4)
    .map((h) => h.replace(/^0+/, '') || '0')
    .join(':');
  return `${prefix}::/64`;
}

// Reads the caller's IP as the Convex infrastructure saw it.
//
// `ctx.meta` does not exist everywhere: convex-test does not mock it, and an
// older deployment does not expose it. We then degrade cleanly to the global
// cap alone rather than failing every submission. `ip` is also `null` by
// contract when execution does not come from an HTTP request (cron,
// scheduled function).
export async function callerIpBucket(ctx: MutationCtx): Promise<string | null> {
  try {
    const meta = ctx.meta as MutationCtx['meta'] | undefined;
    if (typeof meta?.getRequestMetadata !== 'function') return null;
    const { ip } = await meta.getRequestMetadata();
    if (!ip) return null;
    const bucket = ipBucket(ip);
    return bucket || null;
  } catch {
    return null;
  }
}

// Guard to place in EVERY internalMutation of a public form, next to the
// per-e-mail cap (which remains useful: it bounds an honest actor and gives a
// clear message). Both counters are incremented in the write's transaction: a
// submission ultimately rejected — by validation, by another cap — is fully
// rolled back and therefore consumes no quota.
export async function enforcePublicFormLimit(
  ctx: MutationCtx,
  form: PublicForm,
): Promise<void> {
  const limits = PUBLIC_FORM_LIMITS[form];
  const bucket = await callerIpBucket(ctx);
  if (bucket) {
    await enforceRateLimit(ctx, {
      key: `ip:${form}:${bucket}`,
      ...limits.perIp,
    });
  }
  await enforceRateLimit(ctx, { key: `form:${form}`, ...limits.global });
}

// --- Publication views (F-37, issue #8) --------------------------------------
//
// `recordPublicationView` is a PUBLIC, UNAUTHENTICATED mutation: without a
// cap, the view counter can be inflated with a `for` loop. There is no e-mail
// or userId here to use as a key — only the IP seen by the infrastructure is
// non-forgeable.
//
// ONE SINGLE quota row per call, on purpose: the whole point of the
// `publicationViews` split is to remove write contention, not to reintroduce
// it on three rate counters. The chosen key is as targeted as possible —
// (address block, publication): it makes inflating ONE publication by ONE
// actor ineffective, without a shared cap being able to block counting for
// other publications or other readers.
//
// Wide on purpose: a human reader records one view per publication and per
// session (deduplicated in sessionStorage on the client), and an address
// block can legitimately host an entire campus.
//
// WITHOUT AN IP (`ctx.meta` absent: convex-test, deployment older than Convex
// 1.42, scheduled execution), we fall back on a per-publication cap. An
// attacker can reach it, and then freezes THAT publication's counter until
// the end of the window: a display count that stalls, preferred over an
// invented count.
export const VIEW_LIMITS = {
  perIpAndPublication: { max: 60, windowMs: HOUR },
  perPublicationWithoutIp: { max: 1000, windowMs: HOUR },
} as const;

export async function consumePublicationViewQuota(
  ctx: MutationCtx,
  slug: string,
): Promise<boolean> {
  const bucket = await callerIpBucket(ctx);
  return bucket
    ? await consumeRateLimit(ctx, {
        key: `view:${bucket}:${slug}`,
        ...VIEW_LIMITS.perIpAndPublication,
      })
    : await consumeRateLimit(ctx, {
        key: `view:noip:${slug}`,
        ...VIEW_LIMITS.perPublicationWithoutIp,
      });
}
