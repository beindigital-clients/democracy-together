import type { MutationCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';
import { isNotificationMuted } from './socialAccess';

// Helper d'émission de notification (F-25/F-51) — appelé DANS une mutation
// (transaction de l'appelant), comme `recordAudit`. Le rendu est i18n côté
// client : `titleKey` est une clé du namespace `notifications`, `params` est
// interpolé, `link` est un chemin interne (sans préfixe de locale).
//
// PRÉFÉRENCES (chantier « social ») : le destinataire peut couper un type de
// notification depuis `/espace-membre/profil`. La garde est posée ICI, au seul
// point d'émission, et non chez chaque appelant : un type coupé n'est jamais
// écrit, donc jamais affiché ni relayé. Renvoie `false` quand rien n'a été
// créé, pour qu'un appelant qui voudrait doubler par un courriel le sache.
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
