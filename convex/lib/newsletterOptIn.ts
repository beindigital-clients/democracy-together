import { v } from 'convex/values';

// NEWSLETTER DOUBLE OPT-IN (F-18) — pure rules, shared by
// convex/newsletter.ts and its tests.

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Validity period of a confirmation link. 48 h covers a weekend and
// a mailbox checked every other day; beyond that, the pending entry is purged and
// the address can sign up again.
export const CONFIRM_TTL_MS = 48 * HOUR;

// LEGACY subscribers re-contacted by the migration: they did not just ask for this
// e-mail, so we give them a month to respond.
export const LEGACY_CONFIRM_TTL_MS = 30 * DAY;

// BOUNDED RESEND. Signing up again with a pending address resends the link —
// it is the natural move for someone who cannot find the e-mail — but no more than
// three times per pending entry, and no more than once every ten minutes.
// Without these two bounds, the public form would become a way to flood
// a third-party mailbox (the per-IP cap is not enough: it is per form,
// not per recipient).
export const CONFIRM_MAX_SENDS = 3;
export const CONFIRM_RESEND_MIN_INTERVAL_MS = 10 * MINUTE;

// Version of the information text displayed under the form at the time of
// consent. It is recorded with the proof: if the text changes, we
// know under which wording each subscriber consented.
export const CONSENT_TEXT_VERSION = '2026-09-27';

// Sign-up forms — the SOURCE of consent. Closed domain on the client
// side; the server maps any other value to 'other' rather than
// refusing (a form added tomorrow must not break sign-up).
export const SUBSCRIPTION_SOURCES = [
  'home',
  'footer',
  'newsletter-page',
  'legacy',
  'other',
] as const;
export type SubscriptionSource = (typeof SUBSCRIPTION_SOURCES)[number];
export const subscriptionSourceValidator = v.optional(v.string());

export function normalizeSource(raw: string | undefined): SubscriptionSource {
  // `legacy` is reserved for the migration: a client cannot declare itself
  // "a subscriber from before the double opt-in".
  if (!raw || raw === 'legacy') return 'other';
  return (SUBSCRIPTION_SOURCES as readonly string[]).includes(raw)
    ? (raw as SubscriptionSource)
    : 'other';
}

/** 256-bit random token, in hexadecimal. */
export function newConfirmToken(): string {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * SHA-256 hash (hexadecimal) — the only form in which the confirmation
 * token is stored. Since the token has 256 bits of entropy, a fast hash
 * is enough: there is no dictionary to slow down.
 */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

/** Does a token received from a link have the shape of an issued token? */
export function isTokenShaped(token: string): boolean {
  return /^[0-9a-f]{64}$/.test(token);
}

/**
 * Can we (re)send a confirmation link for this pending entry?
 * Pure: the decision is tested without a database.
 */
export function canResendConfirmation(
  sub: { confirmSends?: number; confirmLastSentAt?: number },
  now: number,
): boolean {
  if ((sub.confirmSends ?? 0) >= CONFIRM_MAX_SENDS) return false;
  if (
    sub.confirmLastSentAt !== undefined &&
    now - sub.confirmLastSentAt < CONFIRM_RESEND_MIN_INTERVAL_MS
  ) {
    return false;
  }
  return true;
}
