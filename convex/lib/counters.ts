import type { QueryCtx, MutationCtx } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';

// Denormalized back-office counters (issue #8, audit § 4.3).
//
// WHY. The dashboards (admin.dashboardStats, impact.impactStats,
// newsletter.subscriberCount) counted by loading entire tables then
// reading `.length`. Today the tables are almost empty, so it is
// fast; the day the directory holds a few hundred organizations and
// the library a few thousand publications, the admin screen
// becomes the most expensive point of the product — and Convex bills per byte
// read. The repository guidelines explicitly forbid it
// (convex/_generated/ai/guidelines.md: "Never use `.collect().length`").
//
// HOW. One row per counter in the `counters` table, read in O(1) through
// the `by_key` index, incremented IN THE TRANSACTION that writes the counted
// data. If the write fails, the increment is rolled back with it.
//
// ACCEPTED LIMITATION. A counter is a copy: a write that bypasses the
// mutations (Convex console, direct script, `t.run()` in a test) leaves it
// behind. That is why `counters.recompute` exists — see
// convex/counters.ts.

// CLOSED registry of keys. An unknown key does not compile: the counter read by
// a dashboard and the one set by a mutation cannot diverge over
// a typo.
export const COUNTER = {
  USERS: 'users',
  ORGANIZATIONS_ACTIVE: 'organizations.active',
  MEMBERSHIP_APPLICATIONS: 'membershipApplications',
  MEMBERSHIP_APPLICATIONS_PENDING: 'membershipApplications.pending',
  CONTACT_MESSAGES_UNHANDLED: 'contactMessages.unhandled',
  PUBLICATIONS_PENDING: 'publications.pending',
  PUBLICATIONS_PUBLISHED: 'publications.published',
  EVENT_REGISTRATIONS: 'eventRegistrations',
  NEWSLETTER_SUBSCRIBERS: 'newsletterSubscriptions',
  TRIBUNE_POSTS_PUBLISHED: 'tribunePosts.published',
  TRIBUNE_COMMENTS_PUBLISHED: 'tribuneComments.published',
  YOUTH_APPLICATIONS: 'youthApplications',
  YOUTH_APPLICATIONS_PENDING: 'youthApplications.pending',
  // AI-assisted moderation — three numbers that say, without re-reading the
  // log, what the system actually does: how many analyses, of which
  // how many automatic publications and how many sent back to the queue.
  // The ratio of the last two will tell whether the rubric is too loose
  // (everything passes) or useless (nothing passes).
  AI_REVIEWS: 'aiModerationReviews',
  AI_REVIEWS_PUBLISHED: 'aiModerationReviews.published',
  AI_REVIEWS_ESCALATED: 'aiModerationReviews.escalated',
} as const;

export type CounterKey = (typeof COUNTER)[keyof typeof COUNTER];

export const ALL_COUNTER_KEYS: readonly CounterKey[] = Object.values(COUNTER);

// Increment (or decrement) of a counter. Creates the row on first use.
//
// The counter is FLOORED AT ZERO: a decrement on a counter not yet
// seeded (existing deployment where `recompute` has not run yet) must
// display 0, not a negative number — wrong data is noticeable, absurd
// data discredits the whole screen.
export async function bumpCounter(
  ctx: MutationCtx,
  key: CounterKey,
  delta: number,
): Promise<void> {
  if (delta === 0) return;
  const row = await ctx.db
    .query('counters')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
  if (!row) {
    await ctx.db.insert('counters', { key, value: Math.max(0, delta) });
    return;
  }
  await ctx.db.patch(row._id, { value: Math.max(0, row.value + delta) });
}

// Sets a counter's value (reserved for reconciliation — cf. recompute).
export async function setCounter(
  ctx: MutationCtx,
  key: CounterKey,
  value: number,
): Promise<void> {
  const row = await ctx.db
    .query('counters')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
  if (!row) {
    await ctx.db.insert('counters', { key, value });
    return;
  }
  if (row.value !== value) await ctx.db.patch(row._id, { value });
}

// Reading a counter. A missing row counts as 0: a fresh deployment, or
// a key added later, shows zero rather than failing.
export async function readCounter(
  ctx: QueryCtx,
  key: CounterKey,
): Promise<number> {
  const row = await ctx.db
    .query('counters')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
  return row?.value ?? 0;
}

// Grouped read — one indexed read per key, in parallel.
export async function readCounters<K extends CounterKey>(
  ctx: QueryCtx,
  keys: readonly K[],
): Promise<Record<K, number>> {
  const values = await Promise.all(keys.map((k) => readCounter(ctx, k)));
  const out = {} as Record<K, number>;
  keys.forEach((k, i) => {
    out[k] = values[i];
  });
  return out;
}

// --- State transitions -------------------------------------------------------
//
// Most counters follow a STATUS CHANGE, not a mere
// insertion: an application goes from "pending" to "approved", a
// publication from "submitted" to "published", a Tribune post from
// "published" to "removed". Describing the transition (`from` -> `to`, `null` = the
// row does not exist yet / anymore) rather than writing two `bumpCounter` calls by
// hand at each site: a write site can no longer forget half of the
// movement.

type PublicationStatus = Doc<'publications'>['status'];
type ApplicationStatus = Doc<'membershipApplications'>['status'];
type YouthStatus = Doc<'youthApplications'>['status'];
type ContentStatus = Doc<'tribunePosts'>['status'];
type OrganizationStatus = Doc<'organizations'>['status'];

export async function trackPublicationStatus(
  ctx: MutationCtx,
  from: PublicationStatus | null,
  to: PublicationStatus | null,
): Promise<void> {
  if (from === to) return;
  if (from === 'pending')
    await bumpCounter(ctx, COUNTER.PUBLICATIONS_PENDING, -1);
  if (from === 'published')
    await bumpCounter(ctx, COUNTER.PUBLICATIONS_PUBLISHED, -1);
  if (to === 'pending') await bumpCounter(ctx, COUNTER.PUBLICATIONS_PENDING, 1);
  if (to === 'published')
    await bumpCounter(ctx, COUNTER.PUBLICATIONS_PUBLISHED, 1);
}

export async function trackMembershipApplicationStatus(
  ctx: MutationCtx,
  from: ApplicationStatus | null,
  to: ApplicationStatus | null,
): Promise<void> {
  if (from === to) return;
  if (from === null) await bumpCounter(ctx, COUNTER.MEMBERSHIP_APPLICATIONS, 1);
  if (to === null) await bumpCounter(ctx, COUNTER.MEMBERSHIP_APPLICATIONS, -1);
  if (from === 'pending')
    await bumpCounter(ctx, COUNTER.MEMBERSHIP_APPLICATIONS_PENDING, -1);
  if (to === 'pending')
    await bumpCounter(ctx, COUNTER.MEMBERSHIP_APPLICATIONS_PENDING, 1);
}

export async function trackYouthApplicationStatus(
  ctx: MutationCtx,
  from: YouthStatus | null,
  to: YouthStatus | null,
): Promise<void> {
  if (from === to) return;
  if (from === null) await bumpCounter(ctx, COUNTER.YOUTH_APPLICATIONS, 1);
  if (to === null) await bumpCounter(ctx, COUNTER.YOUTH_APPLICATIONS, -1);
  if (from === 'pending')
    await bumpCounter(ctx, COUNTER.YOUTH_APPLICATIONS_PENDING, -1);
  if (to === 'pending')
    await bumpCounter(ctx, COUNTER.YOUTH_APPLICATIONS_PENDING, 1);
}

export async function trackTribunePostStatus(
  ctx: MutationCtx,
  from: ContentStatus | null,
  to: ContentStatus | null,
): Promise<void> {
  if (from === to) return;
  if (from === 'published')
    await bumpCounter(ctx, COUNTER.TRIBUNE_POSTS_PUBLISHED, -1);
  if (to === 'published')
    await bumpCounter(ctx, COUNTER.TRIBUNE_POSTS_PUBLISHED, 1);
}

export async function trackTribuneCommentStatus(
  ctx: MutationCtx,
  from: ContentStatus | null,
  to: ContentStatus | null,
): Promise<void> {
  if (from === to) return;
  if (from === 'published')
    await bumpCounter(ctx, COUNTER.TRIBUNE_COMMENTS_PUBLISHED, -1);
  if (to === 'published')
    await bumpCounter(ctx, COUNTER.TRIBUNE_COMMENTS_PUBLISHED, 1);
}

export async function trackOrganizationStatus(
  ctx: MutationCtx,
  from: OrganizationStatus | null,
  to: OrganizationStatus | null,
): Promise<void> {
  if (from === to) return;
  if (from === 'active')
    await bumpCounter(ctx, COUNTER.ORGANIZATIONS_ACTIVE, -1);
  if (to === 'active') await bumpCounter(ctx, COUNTER.ORGANIZATIONS_ACTIVE, 1);
}

export async function trackContactHandled(
  ctx: MutationCtx,
  from: boolean | null,
  to: boolean | null,
): Promise<void> {
  if (from === to) return;
  if (from === false)
    await bumpCounter(ctx, COUNTER.CONTACT_MESSAGES_UNHANDLED, -1);
  if (to === false)
    await bumpCounter(ctx, COUNTER.CONTACT_MESSAGES_UNHANDLED, 1);
}
