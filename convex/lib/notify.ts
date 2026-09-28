import type { MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { isNotificationMuted } from './socialAccess';

// Notification emission helper (F-25/F-51) — called WITHIN a mutation
// (the caller's transaction), like `recordAudit`. Rendering is i18n on the
// client side: `titleKey` is a key of the `notifications` namespace, `params` is
// interpolated, `link` is an internal path (without a locale prefix).
//
// PREFERENCES ("social" workstream): the recipient can switch off a notification
// type from `/espace-membre/profil`. The guard is placed HERE, at the single
// emission point, and not at each caller: a switched-off type is never
// written, hence never displayed or relayed. Returns `false` when nothing was
// created, so that a caller wanting to double it with an e-mail knows.
export async function notify(
  ctx: MutationCtx,
  entry: {
    userId: Id<'users'>;
    type: string;
    titleKey: string;
    params?: Record<string, string>;
    link?: string;
  },
): Promise<boolean> {
  if (await isNotificationMuted(ctx, entry.userId, entry.type)) return false;
  await ctx.db.insert('notifications', {
    userId: entry.userId,
    type: entry.type,
    titleKey: entry.titleKey,
    params: entry.params,
    link: entry.link,
    read: false,
    createdAt: Date.now(),
  });
  return true;
}
