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

export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return 0;
    const unread = await ctx.db
      .query('notifications')
      .withIndex('by_user_and_read', (q) =>
        q.eq('userId', userId).eq('read', false),
      )
      .collect();
    return unread.length;
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

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error('UNAUTHENTICATED');
    const unread = await ctx.db
      .query('notifications')
      .withIndex('by_user_and_read', (q) =>
        q.eq('userId', userId).eq('read', false),
      )
      .collect();
    for (const n of unread) await ctx.db.patch(n._id, { read: true });
    return { count: unread.length };
  },
});
