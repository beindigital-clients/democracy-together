import { v } from 'convex/values';
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from '../_generated/server';
import { internal } from '../_generated/api';
import type { Id } from '../_generated/dataModel';
import {
  linkKindValidator,
  messagePolicyValidator,
  profileVisibilityValidator,
} from '../lib/social';
import {
  isMemberRole,
  photoUrl,
  profileByUserId,
  viewerCanSee,
} from '../lib/socialAccess';
import { removeFollow } from './follows';

// CYCLE DE VIE DES DONNÉES SOCIALES : suppression de compte et export RGPD.
//
// Le chantier « comptes » appelle `deleteUserDataSocial(ctx, userId)` depuis
// sa propre suppression de compte (fonction INTERNE, sans `ctx.auth`), et
// `exportUserDataSocial(ctx, userId)` depuis son export.
//
// DÉCISION — SUPPRESSION, PAS ANONYMISATION, pour tout ce qui est social :
//
//  - Profil, photo, liens de suivi, blocages : données de la personne, sans
//    valeur pour autrui une fois la personne partie. Supprimés. Les compteurs
//    d'abonnés des AUTRES profils sont décrémentés dans la même opération.
//
//  - Messages privés : SUPPRIMÉS, dans les deux sens, avec la conversation.
//    L'anonymisation a été écartée pour trois raisons :
//      1. un message privé est un texte libre ; remplacer le nom de
//         l'expéditeur par « compte supprimé » n'anonymise pas un corps qui
//         dit « c'est Awa, de l'institut X » — ce serait une pseudonymisation
//         affichée comme une anonymisation ;
//      2. contrairement à un billet de Tribune, une conversation 1:1 n'a
//         aucune valeur collective à préserver : elle n'a qu'un lecteur ;
//      3. la moitié restante (les messages de l'interlocuteur) est
//         inintelligible sans l'autre, et resterait liée à une personne qui a
//         demandé l'effacement.
//    Le prix, assumé et documenté (docs/backlog/social.md) : l'interlocuteur
//    perd la conversation. Il peut l'exporter avant, comme toute donnée.
//
//  - Signalements où la personne est signalée OU signalante : supprimés
//    (le message transmis disparaît avec le compte ; la décision éventuelle
//    reste au journal d'audit, qui ne porte que des identifiants).
//
// La suppression est PAR LOTS : une transaction Convex est bornée en écritures,
// et un compte ancien peut porter des milliers de messages. La fonction rend
// `{ done }` ; `deleteUserDataSocialStep` la relance jusqu'au bout.

const DELETE_BUDGET = 400;

export async function deleteUserDataSocial(
  ctx: MutationCtx,
  userId: Id<'users'>,
): Promise<{ done: boolean }> {
  let budget = DELETE_BUDGET;

  // 1. Conversations (les deux participants, tous les messages).
  const CONV_BATCH = 20;
  const convIds = new Set<Id<'conversations'>>();
  const own = await ctx.db
    .query('conversationMembers')
    .withIndex('by_user_and_lastMessageAt', (q) => q.eq('userId', userId))
    .take(CONV_BATCH);
  const theirs = await ctx.db
    .query('conversationMembers')
    .withIndex('by_otherUserId', (q) => q.eq('otherUserId', userId))
    .take(CONV_BATCH);
  for (const m of [...own, ...theirs]) convIds.add(m.conversationId);
  for (const conversationId of convIds) {
    const msgs = await ctx.db
      .query('directMessages')
      .withIndex('by_conversation', (q) =>
        q.eq('conversationId', conversationId),
      )
      .take(budget);
    for (const msg of msgs) await ctx.db.delete(msg._id);
    budget -= msgs.length;
    if (budget <= 0) return { done: false };
    const members = await ctx.db
      .query('conversationMembers')
      .withIndex('by_conversation', (q) =>
        q.eq('conversationId', conversationId),
      )
      .take(10);
    for (const row of members) await ctx.db.delete(row._id);
    if (await ctx.db.get(conversationId)) await ctx.db.delete(conversationId);
    budget -= members.length + 1;
    if (budget <= 0) return { done: false };
  }
  // Un lot plein : il peut en rester, on reprend au passage suivant.
  if (own.length === CONV_BATCH || theirs.length === CONV_BATCH) {
    return { done: false };
  }

  // Messages envoyés hors d'une conversation encore rattachée (données
  // incohérentes, par exemple une conversation effacée à la main).
  const stray = await ctx.db
    .query('directMessages')
    .withIndex('by_sender', (q) => q.eq('senderId', userId))
    .take(budget);
  for (const msg of stray) await ctx.db.delete(msg._id);
  budget -= stray.length;
  if (budget <= 0) return { done: false };

  // 2. Signalements (signalant ou signalé).
  for (const idx of ['by_reporter', 'by_reportedUser'] as const) {
    const rows =
      idx === 'by_reporter'
        ? await ctx.db
            .query('messageReports')
            .withIndex('by_reporter', (q) => q.eq('reporterId', userId))
            .take(budget)
        : await ctx.db
            .query('messageReports')
            .withIndex('by_reportedUser', (q) => q.eq('reportedUserId', userId))
            .take(budget);
    for (const r of rows) await ctx.db.delete(r._id);
    budget -= rows.length;
    if (budget <= 0) return { done: false };
  }

  // 3. Suivis, dans les deux sens (compteurs d'autrui tenus par removeFollow).
  const following = await ctx.db
    .query('follows')
    .withIndex('by_follower_and_followee', (q) => q.eq('followerId', userId))
    .take(Math.max(1, Math.floor(budget / 4)));
  for (const f of following) await removeFollow(ctx, userId, f.followeeId);
  budget -= following.length * 4;
  if (budget <= 0) return { done: false };
  const followers = await ctx.db
    .query('follows')
    .withIndex('by_followee', (q) => q.eq('followeeId', userId))
    .take(Math.max(1, Math.floor(budget / 4)));
  for (const f of followers) await removeFollow(ctx, f.followerId, userId);
  budget -= followers.length * 4;
  if (budget <= 0) return { done: false };

  // 4. Organisations suivies, blocages dans les deux sens.
  const orgs = await ctx.db
    .query('orgFollows')
    .withIndex('by_user_and_org', (q) => q.eq('userId', userId))
    .take(budget);
  for (const r of orgs) await ctx.db.delete(r._id);
  budget -= orgs.length;
  const blocking = await ctx.db
    .query('blocks')
    .withIndex('by_blocker_and_blocked', (q) => q.eq('blockerId', userId))
    .take(Math.max(1, budget));
  for (const r of blocking) await ctx.db.delete(r._id);
  budget -= blocking.length;
  const blockedBy = await ctx.db
    .query('blocks')
    .withIndex('by_blocked', (q) => q.eq('blockedId', userId))
    .take(Math.max(1, budget));
  for (const r of blockedBy) await ctx.db.delete(r._id);
  budget -= blockedBy.length;
  if (budget <= 0) return { done: false };

  // 5. Le profil en DERNIER (les étapes précédentes relisent les compteurs),
  //    et sa photo dans le stockage.
  const profile = await profileByUserId(ctx, userId);
  if (profile) {
    if (profile.photoId) await ctx.storage.delete(profile.photoId);
    await ctx.db.delete(profile._id);
  }
  return { done: true };
}

// Enveloppe planifiable : relance le lot suivant tant qu'il en reste. Le
// chantier « comptes » peut appeler la fonction directement dans sa
// transaction, ou planifier celle-ci pour les comptes volumineux.
export const deleteUserDataSocialStep = internalMutation({
  args: { userId: v.id('users') },
  returns: v.object({ done: v.boolean() }),
  handler: async (ctx, { userId }) => {
    const result = await deleteUserDataSocial(ctx, userId);
    if (!result.done) {
      await ctx.scheduler.runAfter(
        0,
        internal.social.account.deleteUserDataSocialStep,
        { userId },
      );
    }
    return result;
  },
});

// --- Export RGPD -------------------------------------------------------------------

export const socialExportValidator = v.object({
  profile: v.union(
    v.object({
      handle: v.string(),
      displayName: v.string(),
      photoUrl: v.union(v.string(), v.null()),
      bio: v.union(v.string(), v.null()),
      jobTitle: v.union(v.string(), v.null()),
      country: v.union(v.string(), v.null()),
      themes: v.array(v.string()),
      languages: v.array(v.string()),
      links: v.array(v.object({ kind: linkKindValidator, url: v.string() })),
      visibility: profileVisibilityValidator,
      messagePolicy: messagePolicyValidator,
      mutedNotificationTypes: v.array(v.string()),
      messageEmail: v.boolean(),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  following: v.array(
    v.object({
      displayName: v.string(),
      handle: v.union(v.string(), v.null()),
      since: v.number(),
    }),
  ),
  // Les abonnés sont des TIERS : on exporte ceux dont le profil est visible
  // de la personne, et le nombre des autres — jamais leur identité.
  followers: v.array(
    v.object({
      displayName: v.string(),
      handle: v.string(),
      since: v.number(),
    }),
  ),
  hiddenFollowers: v.number(),
  organizationsFollowed: v.array(
    v.object({ name: v.string(), slug: v.string(), since: v.number() }),
  ),
  blocked: v.array(v.object({ displayName: v.string(), since: v.number() })),
  // SA copie des conversations : messages envoyés ET reçus (une
  // correspondance adressée à la personne la concerne), hors messages qu'elle
  // a supprimés de sa copie.
  conversations: v.array(
    v.object({
      with: v.string(),
      messages: v.array(
        v.object({ fromMe: v.boolean(), body: v.string(), at: v.number() }),
      ),
    }),
  ),
  reportsMade: v.array(
    v.object({
      at: v.number(),
      reason: v.union(v.string(), v.null()),
      resolved: v.boolean(),
    }),
  ),
});

const EXPORT_LIST_MAX = 1000;
const EXPORT_MESSAGES_MAX = 5000;

export async function exportUserDataSocial(ctx: QueryCtx, userId: Id<'users'>) {
  const p = await profileByUserId(ctx, userId);
  const user = await ctx.db.get(userId);
  const viewer = user
    ? { userId, user, isMember: isMemberRole(user.role) }
    : null;
  const nameOf = async (id: Id<'users'>) => {
    const other = await profileByUserId(ctx, id);
    if (other) return other.displayName;
    return (await ctx.db.get(id))?.name?.trim() ?? '';
  };

  const following = [];
  for (const f of await ctx.db
    .query('follows')
    .withIndex('by_follower_and_followee', (q) => q.eq('followerId', userId))
    .take(EXPORT_LIST_MAX)) {
    const other = await profileByUserId(ctx, f.followeeId);
    following.push({
      displayName: other?.displayName ?? (await nameOf(f.followeeId)),
      handle:
        other && viewer && (await viewerCanSee(ctx, viewer, other))
          ? other.handle
          : null,
      since: f.createdAt,
    });
  }

  const followers = [];
  let hiddenFollowers = 0;
  for (const f of await ctx.db
    .query('follows')
    .withIndex('by_followee', (q) => q.eq('followeeId', userId))
    .take(EXPORT_LIST_MAX)) {
    const other = await profileByUserId(ctx, f.followerId);
    if (other && viewer && (await viewerCanSee(ctx, viewer, other))) {
      followers.push({
        displayName: other.displayName,
        handle: other.handle,
        since: f.createdAt,
      });
    } else {
      hiddenFollowers++;
    }
  }

  const organizationsFollowed = [];
  for (const r of await ctx.db
    .query('orgFollows')
    .withIndex('by_user_and_org', (q) => q.eq('userId', userId))
    .take(EXPORT_LIST_MAX)) {
    const org = await ctx.db.get(r.orgId);
    if (org) {
      organizationsFollowed.push({
        name: org.name,
        slug: org.slug,
        since: r.createdAt,
      });
    }
  }

  const blocked = [];
  for (const r of await ctx.db
    .query('blocks')
    .withIndex('by_blocker_and_blocked', (q) => q.eq('blockerId', userId))
    .take(EXPORT_LIST_MAX)) {
    blocked.push({
      displayName: await nameOf(r.blockedId),
      since: r.createdAt,
    });
  }

  const conversations = [];
  let budget = EXPORT_MESSAGES_MAX;
  for (const mine of await ctx.db
    .query('conversationMembers')
    .withIndex('by_user_and_lastMessageAt', (q) => q.eq('userId', userId))
    .order('desc')
    .take(EXPORT_LIST_MAX)) {
    if (budget <= 0) break;
    const msgs = await ctx.db
      .query('directMessages')
      .withIndex('by_conversation', (q) =>
        q.eq('conversationId', mine.conversationId),
      )
      .take(budget);
    budget -= msgs.length;
    const kept = msgs
      .filter(
        (m) =>
          !m.hiddenFor.includes(userId) &&
          !m.removed &&
          (mine.clearedAt === undefined || m.createdAt > mine.clearedAt),
      )
      .map((m) => ({
        fromMe: m.senderId === userId,
        body: m.body,
        at: m.createdAt,
      }));
    if (kept.length > 0) {
      conversations.push({
        with: await nameOf(mine.otherUserId),
        messages: kept,
      });
    }
  }

  const reportsMade = (
    await ctx.db
      .query('messageReports')
      .withIndex('by_reporter', (q) => q.eq('reporterId', userId))
      .take(EXPORT_LIST_MAX)
  ).map((r) => ({
    at: r.createdAt,
    reason: r.reason ?? null,
    resolved: r.resolved,
  }));

  return {
    profile: p
      ? {
          handle: p.handle,
          displayName: p.displayName,
          photoUrl: await photoUrl(ctx, p),
          bio: p.bio ?? null,
          jobTitle: p.jobTitle ?? null,
          country: p.country ?? null,
          themes: p.themes,
          languages: p.languages,
          links: p.links,
          visibility: p.visibility,
          messagePolicy: p.messagePolicy,
          mutedNotificationTypes: p.mutedNotificationTypes,
          messageEmail: p.messageEmail,
          updatedAt: p.updatedAt,
        }
      : null,
    following,
    followers,
    hiddenFollowers,
    organizationsFollowed,
    blocked,
    conversations,
    reportsMade,
  };
}

// Enveloppe interne pour l'export du chantier « comptes » (sans `ctx.auth`).
export const exportUserDataSocialQuery = internalQuery({
  args: { userId: v.id('users') },
  returns: socialExportValidator,
  handler: async (ctx, { userId }) => await exportUserDataSocial(ctx, userId),
});
