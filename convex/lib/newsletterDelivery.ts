// BULK SENDING OF A CAMPAIGN (F-65) — settings and pure rules.

import { RESEND_BATCH_MAX } from '../email';

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

function envNumber(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

// Batch size: 50 by default, never more than what the batch API accepts.
export const DEFAULT_BATCH_SIZE = 50;
// Default rate: 600 e-mails/minute, i.e. one batch of 50 every 5 s —
// well under Resend's request limit (2/s), and slow enough that a
// new sender reputation is not burned by a spike.
export const DEFAULT_RATE_PER_MINUTE = 600;

// THE SENDING SERVICE'S OWN RULES (Resend, today). Two limits matter to a bulk
// send, and the engine now honours both instead of hoping:
//
//  - a REQUEST RATE: Resend allows 2 requests per second per account by
//    default, shared with every other message the platform sends (sign-in
//    codes, receipts…). The batch API carries up to 100 messages per request,
//    so the pause between two batches — not the batch size — is what must stay
//    above 1/rate. `MIN_INTERVAL_MS` is that floor with a margin (600 ms, i.e.
//    ~1.7 requests/s): before it, the floor was 200 ms (5 requests/s), which a
//    badly set `NEWSLETTER_RATE_PER_MINUTE` could reach and which the provider
//    answers with a 429 on every other batch;
//  - a SENDING QUOTA: a free account allows 100 messages a day, a paid one more,
//    and a new sending domain should start small and grow (warm-up). The
//    daily cap `EMAIL_DAILY_LIMIT` makes a campaign go out over as many days as
//    it takes — it pauses at the cap and resumes by itself at the next UTC
//    midnight — rather than failing the tail of the list.
export const MIN_INTERVAL_MS = 600;

export type DeliveryConfig = {
  batchSize: number;
  ratePerMinute: number;
  /** Pause between two batches, derived from the rate, never below the floor. */
  intervalMs: number;
  /** Bulk messages allowed per UTC day, or `undefined` for no cap. */
  dailyLimit: number | undefined;
};

/**
 * Settings read from the deployment — `NEWSLETTER_BATCH_SIZE` and
 * `NEWSLETTER_RATE_PER_MINUTE`. Read on every batch: changing the variable
 * slows down an ONGOING campaign, without redeploying.
 */
export function deliveryConfig(): DeliveryConfig {
  const batchSize = Math.round(
    clamp(
      envNumber('NEWSLETTER_BATCH_SIZE') ?? DEFAULT_BATCH_SIZE,
      1,
      RESEND_BATCH_MAX,
    ),
  );
  const ratePerMinute = clamp(
    envNumber('NEWSLETTER_RATE_PER_MINUTE') ?? DEFAULT_RATE_PER_MINUTE,
    1,
    6000,
  );
  const intervalMs = Math.max(
    MIN_INTERVAL_MS,
    Math.round((batchSize / ratePerMinute) * 60_000),
  );
  const daily = envNumber('EMAIL_DAILY_LIMIT');
  return {
    batchSize,
    ratePerMinute,
    intervalMs,
    dailyLimit:
      daily !== undefined && daily >= 1 ? Math.floor(daily) : undefined,
  };
}

/** UTC day of a timestamp, `YYYY-MM-DD` — the key of the daily quota. */
export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** Milliseconds from `now` to the next UTC midnight (plus one, to be past it). */
export function msUntilNextUtcDay(now: number): number {
  const d = new Date(now);
  const next = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() + 1,
  );
  return next - now + 1;
}

/**
 * How many messages the next batch may carry, given the batch size, what the
 * campaign's wave still allows and what is left of today's quota. Pure.
 * `limitedBy` says which rule bound it, so the screen can tell the person.
 */
export function batchAllowance(args: {
  batchSize: number;
  dailyRemaining: number | undefined;
  waveRemaining: number | undefined;
}): { size: number; limitedBy: 'none' | 'daily' | 'wave' } {
  let size = args.batchSize;
  let limitedBy: 'none' | 'daily' | 'wave' = 'none';
  if (args.dailyRemaining !== undefined && args.dailyRemaining < size) {
    size = Math.max(0, args.dailyRemaining);
    limitedBy = 'daily';
  }
  if (args.waveRemaining !== undefined && args.waveRemaining < size) {
    size = Math.max(0, args.waveRemaining);
    limitedBy = 'wave';
  }
  return { size, limitedBy };
}

// A batch claimed and left "in progress" longer than this lease is
// considered interrupted (action cut off, deployment): it is RESUMED, with the
// same idempotency key.
export const CLAIM_LEASE_MS = 5 * 60 * 1000;

// Beyond three consecutive TRANSIENT failures on the same batch, the rows
// are marked failed: the editor will retry them when the provider responds.
// ACCEPTED LIMITATION: the retry forms new batches, hence new idempotency
// keys. If one of the three ambiguous calls (network cut after sending)
// had actually succeeded, that recipient may receive a duplicate. The case
// requires three consecutive outages on the same batch; it is preferred over a
// campaign blocked forever on a batch we could not settle.
export const MAX_TRANSIENT_ATTEMPTS = 3;

/** Idempotency key passed to the provider for a batch. */
export function idempotencyKey(claimId: string): string {
  return `dt-newsletter:${claimId}`;
}

/** Exponential backoff after a transient failure (capped at 10 min). */
export function backoffMs(attempt: number, intervalMs: number): number {
  return Math.min(10 * 60 * 1000, intervalMs * 2 ** Math.max(1, attempt));
}
