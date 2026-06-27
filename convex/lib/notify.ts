import type { MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';

// Helper d'émission de notification (F-25/F-51) — appelé DANS une mutation
// (transaction de l'appelant), comme `recordAudit`. Le rendu est i18n côté
// client : `titleKey` est une clé du namespace `notifications`, `params` est
// interpolé, `link` est un chemin interne (sans préfixe de locale).
export async function notify(
  ctx: MutationCtx,
  entry: {
    userId: Id<'users'>;
    type: string;
    titleKey: string;
    params?: Record<string, string>;
    link?: string;
  },
) {
  await ctx.db.insert('notifications', {
    userId: entry.userId,
    type: entry.type,
    titleKey: entry.titleKey,
    params: entry.params,
    link: entry.link,
    read: false,
    createdAt: Date.now(),
  });
}
