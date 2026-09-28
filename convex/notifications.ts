import { v } from 'convex/values';
// The current account goes through the common guard: a suspended account, or a
// session that has not presented its second factor, has no notifications.
import { getActiveUserId } from './lib/rbac';
import { mutation, query } from './_generated/server';

// Notifications of the current user (F-25/F-51), most recent first.
// Reactive: the header bell and this list update live when
// a moderator approves a publication / an application.
export const myNotifications = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getActiveUserId(ctx);
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

// Header bell badge (F-25/F-51).
//
// The count used to load ALL of the user's unread notifications to
// read the length. The read is indexed by (user, read), so
// never a table scan — but it remains unbounded: an account left
// without checking its notifications for months re-reads them all, on every
// header render, on every page.
//
// The badge already does not show an exact number beyond nine ("9+"): so we
// read one row more than that threshold and return `capped`. The cost is
// constant, and the display is exactly the same as before.
export const UNREAD_BADGE_CAP = 9;

export const unreadCount = query({
  args: {},
  returns: v.object({ count: v.number(), capped: v.boolean() }),
  handler: async (ctx) => {
    const userId = await getActiveUserId(ctx);
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
    const userId = await getActiveUserId(ctx);
    if (!userId) throw new Error('UNAUTHENTICATED');
    const n = await ctx.db.get(notificationId);
    // One can only mark ONE'S OWN notifications.
    if (!n || n.userId !== userId) throw new Error('NOT_FOUND');
    if (!n.read) await ctx.db.patch(notificationId, { read: true });
    return { ok: true };
  },
});

// "Mark all as read". A Convex mutation is a transaction bounded in
// documents written: marking without limit is a guaranteed failure on an
// account with many overdue notifications. We process one batch, and say
// whether any remain — a second call continues.
const MARK_ALL_BATCH = 200;

export const markAllRead = mutation({
  args: {},
  returns: v.object({ count: v.number(), remaining: v.boolean() }),
  handler: async (ctx) => {
    const userId = await getActiveUserId(ctx);
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
