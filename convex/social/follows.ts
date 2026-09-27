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

// SUIVI de personnes (et d'organisations), compteurs, listes, et fil
// d'activité des personnes suivies.
//
// Suivre suppose de VOIR : on ne suit que quelqu'un dont le profil nous est
// visible, et le refus est le même que pour un profil inexistant
// (`NOT_FOUND`) — sans quoi `follow` deviendrait un oracle d'existence des
// profils privés.

// Ajuste un compteur dénormalisé sans jamais passer sous zéro (une
// réconciliation manuelle reste possible sans produire de valeur absurde).
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

// Supprime un lien de suivi et tient les deux compteurs. Partagé avec le
// blocage et la suppression de compte.
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
    // Un profil est exigé pour suivre : la personne suivie est notifiée, et
    // doit pouvoir savoir QUI la suit.
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
    // Respecte les préférences : `notify` ne crée rien si le type est coupé.
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

// --- Mes abonnements / mes abonnés ---------------------------------------------

const LIST_MAX = 200;

const networkListValidator = v.object({
  items: v.array(personCardValidator),
  // Personnes du lien qui ne sont pas montrées (profil devenu privé,
  // blocage) : comptées, jamais nommées.
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

// --- Organisations -----------------------------------------------------------

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
    // Seule une fiche ACTIVE de l'annuaire se suit — la même que le public voit.
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

// --- Fil d'activité des personnes suivies ---------------------------------------
//
// Construit à partir des SEULS événements publics existants : publications
// PUBLIÉES de la bibliothèque et billets de Tribune PUBLIÉS. Un dépôt en
// attente, un brouillon renvoyé à l'auteur, un billet retiré ne figurent
// jamais — le filtre de statut est posé ici, pas confié à l'écran.
//
// Coût borné : au plus `FEED_FOLLOWEES` personnes suivies, `FEED_PER_SOURCE`
// éléments par source et par personne.
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
      // Personne devenue invisible (profil privé, blocage) : son activité
      // sort du fil avec elle.
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
