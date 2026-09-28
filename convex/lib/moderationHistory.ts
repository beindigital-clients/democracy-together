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

// Writing the moderation history (F-49) and reading the Tribune
// settings. Helpers called WITHIN the caller's transaction (like
// `recordAudit`): a fact is only logged if the write it describes
// actually took place.

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

// Effective settings. A deployment where the administrator never set anything
// has no row: posts A PRIORI (F-45), comments a
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

// Schedules the AI's verdict on a Tribune item (pre-sorting, F-45). A
// mutation has no `fetch`: the model call lives in an action, scheduled
// here. The `off` mode is read so as not to schedule an action we already know
// will have nothing to do — this is not a security guard, the action
// re-reads everything (convex/communityModeration.ts).
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
