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

export type DeliveryConfig = {
  batchSize: number;
  ratePerMinute: number;
  /** Pause between two batches, derived from the rate. */
  intervalMs: number;
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
    200,
    Math.round((batchSize / ratePerMinute) * 60_000),
  );
  return { batchSize, ratePerMinute, intervalMs };
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
