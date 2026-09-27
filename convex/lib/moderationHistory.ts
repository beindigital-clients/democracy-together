import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import { internal } from '../_generated/api';
import { loadSettings as loadAiSettings } from '../aiModeration';
import {
  DEFAULT_COMMUNITY_MODERATION,
  type ContentStatus,
  type ModerationEventKind,
  type ModerationMode,
  type ModerationTarget,
} from './communaute';

// Écriture de l'historique de modération (F-49) et lecture des réglages de la
// Tribune. Helpers appelés DANS la transaction de l'appelant (comme
// `recordAudit`) : un fait n'est journalisé que si l'écriture qu'il décrit a
// réellement eu lieu.

export type ModerationEventInput = {
  targetType: ModerationTarget;
  targetId: string;
  postId?: Id<'tribunePosts'>;
  kind: ModerationEventKind;
  actorId?: Id<'users'>;
  statusFrom?: ContentStatus;
  statusTo?: ContentStatus;
  reason?: string;
  ai?: Doc<'moderationEvents'>['ai'];
};

export async function logModerationEvent(
  ctx: MutationCtx,
  event: ModerationEventInput,
): Promise<void> {
  await ctx.db.insert('moderationEvents', {
    targetType: event.targetType,
    targetId: event.targetId,
    ...(event.postId ? { postId: event.postId } : {}),
    kind: event.kind,
    ...(event.actorId ? { actorId: event.actorId } : {}),
    ...(event.statusFrom ? { statusFrom: event.statusFrom } : {}),
    ...(event.statusTo ? { statusTo: event.statusTo } : {}),
    ...(event.reason ? { reason: event.reason } : {}),
    ...(event.ai ? { ai: event.ai } : {}),
    createdAt: Date.now(),
  });
}

export type CommunityModerationSettings = {
  postMode: ModerationMode;
  commentMode: ModerationMode;
};

// Réglages effectifs. Un déploiement où l'administrateur n'a jamais rien
// réglé n'a pas de ligne : billets A PRIORI (F-45), commentaires a
// posteriori.
export async function loadCommunitySettings(
  ctx: QueryCtx,
): Promise<CommunityModerationSettings> {
  const doc = await ctx.db
    .query('communityModerationConfig')
    .withIndex('by_key', (q) => q.eq('key', 'default'))
    .unique();
  return doc
    ? { postMode: doc.postMode, commentMode: doc.commentMode }
    : { ...DEFAULT_COMMUNITY_MODERATION };
}

// Planifie l'avis de l'IA sur un contenu de la Tribune (pré-tri, F-45). Une
// mutation n'a pas `fetch` : l'appel au modèle vit dans une action, planifiée
// ici. Le mode `off` est lu pour ne pas planifier une action dont on sait déjà
// qu'elle n'aura rien à faire — ce n'est pas une garde de sécurité, l'action
// relit tout (convex/communityModeration.ts).
export async function scheduleTribuneAiReview(
  ctx: MutationCtx,
  targetType: ModerationTarget,
  targetId: string,
): Promise<void> {
  const settings = await loadAiSettings(ctx);
  if (settings.mode === 'off') return;
  await ctx.scheduler.runAfter(
    0,
    internal.communityModeration.runTribuneReview,
    { targetType, targetId },
  );
}
