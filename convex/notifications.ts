import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query } from './_generated/server';

// Notifications de l'utilisateur courant (F-25/F-51), les plus récentes d'abord.
// Réactif : la cloche d'en-tête et cette liste se mettent à jour en direct quand
// un modérateur valide une publication / une candidature.
export const myNotifications = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query('notifications')
      .withIndex('by_user_and_read', (q) => q.eq('userId', userId))
      .collect();
    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 50)
      .map((n) => ({
        _id: n._id,
        type: n.type,
        titleKey: n.titleKey,
        params: (n.params ?? {}) as Record<string, string>,
        link: n.link ?? null,
        read: n.read,
        createdAt: n.createdAt,
      }));
  },
});

// Pastille de la cloche d'en-tête (F-25/F-51).
//
// Le décompte chargeait TOUTES les notifications non lues de l'utilisateur pour
// en lire la longueur. La lecture est indexée par (utilisateur, lu), donc
// jamais un parcours de table — mais elle reste non bornée : un compte laissé
// sans consulter ses notifications pendant des mois les relit toutes, à chaque
// rendu de l'en-tête, sur chaque page.
//
// La pastille n'affiche déjà pas un nombre exact au-delà de neuf (« 9+ ») : on
// lit donc une ligne de plus que ce seuil et on renvoie `capped`. Le coût est
// constant, et l'affichage est exactement celui d'avant.
export const UNREAD_BADGE_CAP = 9;

export const unreadCount = query({
  args: {},
  returns: v.object({ count: v.number(), capped: v.boolean() }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { count: 0, capped: false };
    const unread = await ctx.db
      .query('notifications')
      .withIndex('by_user_and_read', (q) =>
        q.eq('userId', userId).eq('read', false),
      )
      .take(UNREAD_BADGE_CAP + 1);
    return {
      count: Math.min(unread.length, UNREAD_BADGE_CAP),
      capped: unread.length > UNREAD_BADGE_CAP,
    };
  },
});

export const markRead = mutation({
  args: { notificationId: v.id('notifications') },
  handler: async (ctx, { notificationId }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('UNAUTHENTICATED');
    const n = await ctx.db.get(notificationId);
    // On ne peut marquer que SES propres notifications.
    if (!n || n.userId !== userId) throw new Error('NOT_FOUND');
    if (!n.read) await ctx.db.patch(notificationId, { read: true });
    return { ok: true };
  },
});

// « Tout marquer comme lu ». Une mutation Convex est une transaction bornée en
// documents écrits : marquer sans limite, c'est une panne garantie sur un
// compte qui a beaucoup de notifications en retard. On traite un lot, et on dit
// s'il en reste — un second appel poursuit.
const MARK_ALL_BATCH = 200;

export const markAllRead = mutation({
  args: {},
  returns: v.object({ count: v.number(), remaining: v.boolean() }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('UNAUTHENTICATED');
    const unread = await ctx.db
      .query('notifications')
      .withIndex('by_user_and_read', (q) =>
        q.eq('userId', userId).eq('read', false),
      )
      .take(MARK_ALL_BATCH + 1);
    const batch = unread.slice(0, MARK_ALL_BATCH);
    for (const n of batch) await ctx.db.patch(n._id, { read: true });
    return { count: batch.length, remaining: unread.length > MARK_ALL_BATCH };
  },
});
