import { v, ConvexError } from 'convex/values';
import { internalMutation, type MutationCtx } from './_generated/server';
import {
  COUNTER,
  ALL_COUNTER_KEYS,
  setCounter,
  type CounterKey,
} from './lib/counters';

// Reconciliation of denormalized counters (issue #8).
//
// WHAT IT IS FOR. Back-office counters are maintained on write
// (convex/lib/counters.ts). Two situations leave them behind:
//
//  1. BOOTSTRAPPING — a deployment that existed BEFORE this split already has
//     users, publications, subscribers… and no `counters` row.
//     `recompute` is the backfill: to run ONCE after deployment,
//     `npx convex run counters:recompute '{}'`.
//  2. DIRECT WRITE — a row inserted from the Convex console, a recovery
//     script, or `t.run()` in a unit test, goes through no
//     mutation and therefore increments nothing.
//
// internalMutation: OUTSIDE the public API, invocable only from the server
// or the CLI. Recounting is an operations task, not a read.
//
// TRANSACTION BOUND. Recounting means scanning. A Convex mutation has a
// limit on documents read: the scan is therefore capped, and exceeding it
// FAILS instead of writing a wrong count — a dashboard that lies is worse
// than a dashboard in error. On a large database, recounting key by
// key (`'{"key":"users"}'`) stays within the limit.
const SCAN_CAP = 8000;

async function countRows(
  rows: AsyncIterable<unknown>,
  key: CounterKey,
): Promise<number> {
  let n = 0;
  for await (const _row of rows) {
    void _row;
    if (++n > SCAN_CAP) {
      throw new ConvexError(
        `COUNTER_SCAN_TOO_LARGE:${key} (> ${SCAN_CAP} lignes) — recomptez cette clé seule, ou tenez-la uniquement à l'écriture.`,
      );
    }
  }
  return n;
}

// Recounts ONE key from the tables. Each source uses the narrowest
// available index: we only read the rows that count.
async function recomputeKey(
  ctx: MutationCtx,
  key: CounterKey,
): Promise<number> {
  switch (key) {
    case COUNTER.USERS:
      return await countRows(ctx.db.query('users'), key);
    case COUNTER.ORGANIZATIONS_ACTIVE:
      return await countRows(
        ctx.db
          .query('organizations')
          .withIndex('by_status', (q) => q.eq('status', 'active')),
        key,
      );
    case COUNTER.MEMBERSHIP_APPLICATIONS:
      return await countRows(ctx.db.query('membershipApplications'), key);
    case COUNTER.MEMBERSHIP_APPLICATIONS_PENDING:
      return await countRows(
        ctx.db
          .query('membershipApplications')
          .withIndex('by_status', (q) => q.eq('status', 'pending')),
        key,
      );
    case COUNTER.CONTACT_MESSAGES_UNHANDLED:
      return await countRows(
        ctx.db
          .query('contactMessages')
          .withIndex('by_handled', (q) => q.eq('handled', false)),
        key,
      );
    case COUNTER.PUBLICATIONS_PENDING:
      return await countRows(
        ctx.db
          .query('publications')
          .withIndex('by_status', (q) => q.eq('status', 'pending')),
        key,
      );
    case COUNTER.PUBLICATIONS_PUBLISHED:
      return await countRows(
        ctx.db
          .query('publications')
          .withIndex('by_status', (q) => q.eq('status', 'published')),
        key,
      );
    case COUNTER.EVENT_REGISTRATIONS:
      return await countRows(ctx.db.query('eventRegistrations'), key);
    case COUNTER.NEWSLETTER_SUBSCRIBERS:
      // CONFIRMED subscribers only (double opt-in, distribution workstream):
      // those a campaign reaches. Pending ones and unmigrated legacy
      // subscribers are not included.
      return await countRows(
        ctx.db
          .query('newsletterSubscriptions')
          .withIndex('by_status_and_expiry', (q) =>
            q.eq('status', 'confirmed'),
          ),
        key,
      );
    case COUNTER.TRIBUNE_POSTS_PUBLISHED:
      return await countRows(
        ctx.db
          .query('tribunePosts')
          .withIndex('by_status', (q) => q.eq('status', 'published')),
        key,
      );
    case COUNTER.TRIBUNE_COMMENTS_PUBLISHED: {
      // `tribuneComments` has no status index (the application always reads
      // a thread, never "all comments"). An index added for
      // reconciliation alone would cost on every comment write:
      // we scan here, under the cap, rather than tax the hot path.
      let n = 0;
      let scanned = 0;
      for await (const c of ctx.db.query('tribuneComments')) {
        if (++scanned > SCAN_CAP) {
          throw new ConvexError(
            `COUNTER_SCAN_TOO_LARGE:${key} (> ${SCAN_CAP} lignes) — recomptez cette clé seule, ou tenez-la uniquement à l'écriture.`,
          );
        }
        if (c.status === 'published') n++;
      }
      return n;
    }
    case COUNTER.YOUTH_APPLICATIONS:
      return await countRows(ctx.db.query('youthApplications'), key);
    case COUNTER.YOUTH_APPLICATIONS_PENDING:
      return await countRows(
        ctx.db
          .query('youthApplications')
          .withIndex('by_status', (q) => q.eq('status', 'pending')),
        key,
      );
    case COUNTER.AI_REVIEWS:
      return await countRows(ctx.db.query('aiModerationReviews'), key);
    case COUNTER.AI_REVIEWS_PUBLISHED:
      return await countRows(
        ctx.db
          .query('aiModerationReviews')
          .withIndex('by_applied', (q) => q.eq('applied', 'published')),
        key,
      );
    case COUNTER.AI_REVIEWS_ESCALATED:
      return await countRows(
        ctx.db
          .query('aiModerationReviews')
          .withIndex('by_applied', (q) => q.eq('applied', 'escalated')),
        key,
      );
  }
}

const counterKeyValidator = v.union(
  ...ALL_COUNTER_KEYS.map((k) => v.literal(k)),
);

export const recompute = internalMutation({
  args: { key: v.optional(counterKeyValidator) },
  returns: v.object({
    counters: v.array(v.object({ key: v.string(), value: v.number() })),
  }),
  handler: async (ctx, { key }) => {
    const keys = key ? [key] : ALL_COUNTER_KEYS;
    const counters: { key: string; value: number }[] = [];
    for (const k of keys) {
      const value = await recomputeKey(ctx, k);
      await setCounter(ctx, k, value);
      counters.push({ key: k, value });
    }
    return { counters };
  },
});
