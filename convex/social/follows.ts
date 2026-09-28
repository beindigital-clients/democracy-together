import { v, ConvexError } from 'convex/values';
import { mutation, query, type MutationCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import { enforceRateLimit } from '../lib/rateLimit';
import { notify } from '../lib/notify';
import { SOCIAL_NOTIF, SOCIAL_RATE_LIMITS } from '../lib/social';
import {
  isBlockedEitherWay,
  isFollowing,
  loadViewer,
  personCard,
  personCardValidator,
  profileByUserId,
  requireSocialMember,
  viewerCanSee,
} from '../lib/socialAccess';

// FOLLOWING people (and organizations), counters, lists, and the activity
// feed of followed people.
//
// Following requires SEEING: you can only follow someone whose profile is
// visible to you, and the refusal is the same as for a nonexistent profile
// (`NOT_FOUND`) — otherwise `follow` would become an existence oracle for
// private profiles.

// Adjusts a denormalized counter without ever going below zero (a
// manual reconciliation remains possible without producing an absurd value).
async function bump(
  ctx: MutationCtx,
  profile: Doc<'memberProfiles'> | null,
  field: 'followerCount' | 'followingCount',
  delta: number,
) {
  if (!profile) return;
  await ctx.db.patch(profile._id, {
    [field]: Math.max(0, profile[field] + delta),
  });
}

// Deletes a follow link and maintains both counters. Shared with
// blocking and account deletion.
export async function removeFollow(
  ctx: MutationCtx,
  followerId: Id<'users'>,
  followeeId: Id<'users'>,
): Promise<boolean> {
  const row = await ctx.db
    .query('follows')
    .withIndex('by_follower_and_followee', (q) =>
      q.eq('followerId', followerId).eq('followeeId', followeeId),
    )
    .unique();
  if (!row) return false;
  await ctx.db.delete(row._id);
  await bump(ctx, await profileByUserId(ctx, followerId), 'followingCount', -1);
  await bump(ctx, await profileByUserId(ctx, followeeId), 'followerCount', -1);
  return true;
}

export const follow = mutation({
  args: { userId: v.id('users') },
  returns: v.object({ following: v.literal(true) }),
  handler: async (ctx, { userId }) => {
    const viewer = await requireSocialMember(ctx);
    if (userId === viewer.userId) throw new ConvexError('SELF');
    const me = await profileByUserId(ctx, viewer.userId);
    // A profile is required to follow: the followed person is notified, and
    // must be able to know WHO follows them.
    if (!me) throw new ConvexError('PROFILE_REQUIRED');
    const target = await profileByUserId(ctx, userId);
    if (!target || !(await viewerCanSee(ctx, viewer, target))) {
      throw new ConvexError('NOT_FOUND');
    }
    if (await isBlockedEitherWay(ctx, viewer.userId, userId)) {
      throw new ConvexError('BLOCKED');
    }
    if (await isFollowing(ctx, viewer.userId, userId)) {
      return { following: true as const };
    }
    await enforceRateLimit(ctx, {
      key: `social:follow:${viewer.userId}`,
      ...SOCIAL_RATE_LIMITS.follow,
    });
    await ctx.db.insert('follows', {
      followerId: viewer.userId,
      followeeId: userId,
      createdAt: Date.now(),
    });
    await bump(ctx, me, 'followingCount', 1);
    await bump(ctx, target, 'followerCount', 1);
    // Respects preferences: `notify` creates nothing if the type is muted.
    await notify(ctx, {
      userId,
      type: SOCIAL_NOTIF.FOLLOW,
      titleKey: 'socialFollow',
      params: { name: me.displayName },
      link: '/espace-membre/reseau',
    });
    return { following: true as const };
  },
});

export const unfollow = mutation({
  args: { userId: v.id('users') },
  returns: v.object({ following: v.literal(false) }),
  handler: async (ctx, { userId }) => {
    const viewer = await loadViewer(ctx);
    if (!viewer) throw new Error('UNAUTHENTICATED');
    await removeFollow(ctx, viewer.userId, userId);
    return { following: false as const };
  },
});

// --- My following / my followers ---------------------------------------------

const LIST_MAX = 200;

const networkListValidator = v.object({
  items: v.array(personCardValidator),
  // People in the link who are not shown (profile made private,
  // blocking): counted, never named.
  hidden: v.number(),
});

export const myNetwork = query({
  args: {},
  returns: v.union(
    v.object({
      following: networkListValidator,
      followers: networkListValidator,
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const viewer = await loadViewer(ctx);
    if (!viewer) return null;
    const followingRows = await ctx.db
      .query('follows')
      .withIndex('by_follower_and_followee', (q) =>
        q.eq('followerId', viewer.userId),
      )
      .take(LIST_MAX);
    const followerRows = await ctx.db
      .query('follows')
      .withIndex('by_followee', (q) => q.eq('followeeId', viewer.userId))
      .order('desc')
      .take(LIST_MAX);

    const collect = async (ids: Id<'users'>[]) => {
      const items = [];
      let hidden = 0;
      for (const id of ids) {
        const p = await profileByUserId(ctx, id);
        if (
          !p ||
          !(await viewerCanSee(ctx, viewer, p)) ||
          (await isBlockedEitherWay(ctx, viewer.userId, id))
        ) {
          hidden++;
          continue;
        }
        items.push(await personCard(ctx, p));
      }
      return { items, hidden };
    };
    return {
      following: await collect(followingRows.map((r) => r.followeeId)),
      followers: await collect(followerRows.map((r) => r.followerId)),
    };
  },
});

// --- Organizations -----------------------------------------------------------

export const orgFollowState = query({
  args: { orgId: v.id('organizations') },
  returns: v.union(
    v.object({ following: v.boolean(), canFollow: v.boolean() }),
    v.null(),
  ),
  handler: async (ctx, { orgId }) => {
    const viewer = await loadViewer(ctx);
    if (!viewer) return null;
    const row = await ctx.db
      .query('orgFollows')
      .withIndex('by_user_and_org', (q) =>
        q.eq('userId', viewer.userId).eq('orgId', orgId),
      )
      .unique();
    return { following: row !== null, canFollow: viewer.isMember };
  },
});

export const setOrgFollow = mutation({
  args: { orgId: v.id('organizations'), follow: v.boolean() },
  returns: v.object({ following: v.boolean() }),
  handler: async (ctx, { orgId, follow: wanted }) => {
    const viewer = await requireSocialMember(ctx);
    const org = await ctx.db.get(orgId);
    // Only an ACTIVE directory entry can be followed — the same one the public sees.
    if (!org || org.status !== 'active') throw new ConvexError('NOT_FOUND');
    const row = await ctx.db
      .query('orgFollows')
      .withIndex('by_user_and_org', (q) =>
        q.eq('userId', viewer.userId).eq('orgId', orgId),
      )
      .unique();
    if (wanted && !row) {
      await enforceRateLimit(ctx, {
        key: `social:follow:${viewer.userId}`,
        ...SOCIAL_RATE_LIMITS.follow,
      });
      await ctx.db.insert('orgFollows', {
        userId: viewer.userId,
        orgId,
        createdAt: Date.now(),
      });
    } else if (!wanted && row) {
      await ctx.db.delete(row._id);
    }
    return { following: wanted };
  },
});

export const myFollowedOrganizations = query({
  args: {},
  returns: v.array(v.object({ name: v.string(), slug: v.string() })),
  handler: async (ctx) => {
    const viewer = await loadViewer(ctx);
    if (!viewer) return [];
    const rows = await ctx.db
      .query('orgFollows')
      .withIndex('by_user_and_org', (q) => q.eq('userId', viewer.userId))
      .take(LIST_MAX);
    const out = [];
    for (const r of rows) {
      const org = await ctx.db.get(r.orgId);
      if (org && org.status === 'active') {
        out.push({ name: org.name, slug: org.slug });
      }
    }
    return out;
  },
});

// --- Activity feed of followed people ---------------------------------------
//
// Built ONLY from existing public events: PUBLISHED library
// publications and PUBLISHED Tribune posts. A pending submission,
// a draft sent back to the author, a withdrawn post never
// appear — the status filter is applied here, not left to the screen.
//
// Bounded cost: at most `FEED_FOLLOWEES` followed people, `FEED_PER_SOURCE`
// items per source and per person.
const FEED_FOLLOWEES = 100;
const FEED_PER_SOURCE = 5;
const FEED_MAX = 30;

const feedItemValidator = v.object({
  kind: v.union(v.literal('publication'), v.literal('tribune')),
  title: v.string(),
  href: v.string(),
  at: v.number(),
  author: v.object({ handle: v.string(), displayName: v.string() }),
});

export const activityFeed = query({
  args: {},
  returns: v.array(feedItemValidator),
  handler: async (ctx) => {
    const viewer = await loadViewer(ctx);
    if (!viewer?.isMember) return [];
    const rows = await ctx.db
      .query('follows')
      .withIndex('by_follower_and_followee', (q) =>
        q.eq('followerId', viewer.userId),
      )
      .take(FEED_FOLLOWEES);

    const items: Array<{
      kind: 'publication' | 'tribune';
      title: string;
      href: string;
      at: number;
      author: { handle: string; displayName: string };
    }> = [];
    for (const { followeeId } of rows) {
      const p = await profileByUserId(ctx, followeeId);
      // Person who became invisible (private profile, blocking): their activity
      // leaves the feed with them.
      if (!p || !(await viewerCanSee(ctx, viewer, p))) continue;
      if (await isBlockedEitherWay(ctx, viewer.userId, followeeId)) continue;
      const author = { handle: p.handle, displayName: p.displayName };

      const pubs = await ctx.db
        .query('publications')
        .withIndex('by_author', (q) => q.eq('authorUserId', followeeId))
        .order('desc')
        .take(FEED_PER_SOURCE * 4);
      for (const pub of pubs
        .filter((x) => x.status === 'published')
        .slice(0, FEED_PER_SOURCE)) {
        items.push({
          kind: 'publication',
          title: pub.title,
          href: `/bibliotheque/${pub.slug}`,
          at: pub.publishedAt,
          author,
        });
      }

      const posts = await ctx.db
        .query('tribunePosts')
        .withIndex('by_author', (q) => q.eq('authorUserId', followeeId))
        .order('desc')
        .take(FEED_PER_SOURCE * 4);
      for (const post of posts
        .filter((x) => x.status === 'published')
        .slice(0, FEED_PER_SOURCE)) {
        items.push({
          kind: 'tribune',
          title: post.title,
          href: `/tribune/${post._id}`,
          at: post.createdAt,
          author,
        });
      }
    }
    return items.sort((a, b) => b.at - a.at).slice(0, FEED_MAX);
  },
});
