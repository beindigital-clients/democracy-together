import type { MutationCtx } from '../_generated/server';
import { utcDay } from './newsletterDelivery';

// The daily quota of bulk messages (see convex/lib/newsletterDelivery.ts).

/** Bulk messages already sent today (UTC). */
export async function sentToday(
  ctx: Pick<MutationCtx, 'db'>,
  now = Date.now(),
): Promise<number> {
  const row = await ctx.db
    .query('emailQuota')
    .withIndex('by_day', (q) => q.eq('day', utcDay(now)))
    .unique();
  return row?.sent ?? 0;
}

/** Counts `n` more messages sent today. */
export async function addSent(
  ctx: Pick<MutationCtx, 'db'>,
  n: number,
  now = Date.now(),
): Promise<void> {
  if (n <= 0) return;
  const day = utcDay(now);
  const row = await ctx.db
    .query('emailQuota')
    .withIndex('by_day', (q) => q.eq('day', day))
    .unique();
  if (row) await ctx.db.patch(row._id, { sent: row.sent + n });
  else await ctx.db.insert('emailQuota', { day, sent: n });
}

/**
 * What is left of today's quota, or `undefined` when no cap is set. Reads the
 * counter only when there IS a cap.
 */
export async function dailyRemaining(
  ctx: Pick<MutationCtx, 'db'>,
  limit: number | undefined,
  now = Date.now(),
): Promise<number | undefined> {
  if (limit === undefined) return undefined;
  return Math.max(0, limit - (await sentToday(ctx, now)));
}
