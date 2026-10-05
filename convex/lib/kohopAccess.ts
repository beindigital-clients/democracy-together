import { ConvexError } from 'convex/values';
import type { QueryCtx, MutationCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import { requireNetworkRole } from './rbac';
import {
  KOHOP_DEFAULT_ACCESS,
  nextStage,
  type KohopAccessMode,
  type KohopEvent,
  type KohopEventKind,
  type KohopStage,
} from './kohop';

// KOHOP — access helpers shared by the author's and the review chief's
// functions.

export const SETTINGS_KEY = 'default';

export type KohopSettings = {
  access: KohopAccessMode;
  pilotOrganizations: Id<'organizations'>[];
};

/** The settings row, or the default (pilot access, no organization yet). */
export async function getKohopSettings(
  ctx: QueryCtx | MutationCtx,
): Promise<KohopSettings> {
  const row = await ctx.db
    .query('kohopSettings')
    .withIndex('by_key', (q) => q.eq('key', SETTINGS_KEY))
    .unique();
  return {
    access: row?.access ?? KOHOP_DEFAULT_ACCESS,
    pilotOrganizations: row?.pilotOrganizations ?? [],
  };
}

/**
 * May this account deposit a contribution now? `open`: every member;
 * `pilot`: only the accounts that belong to a listed organization (D-15).
 */
export async function canDeposit(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
): Promise<boolean> {
  const settings = await getKohopSettings(ctx);
  if (settings.access === 'open') return true;
  if (settings.pilotOrganizations.length === 0) return false;
  const memberships = await ctx.db
    .query('organizationMemberships')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .take(20);
  return memberships.some((m) => settings.pilotOrganizations.includes(m.orgId));
}

export async function assertCanDeposit(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
): Promise<void> {
  if (!(await canDeposit(ctx, userId))) throw new ConvexError('PILOT_ONLY');
}

/**
 * The author's own contribution. Someone else's file reads as NON-EXISTENT
 * (`NOT_FOUND`), never as forbidden: it must not confirm that it exists.
 */
export async function requireOwnContribution(
  ctx: MutationCtx | QueryCtx,
  contributionId: Id<'kohopContributions'>,
): Promise<{ user: Doc<'users'>; contribution: Doc<'kohopContributions'> }> {
  const user = await requireNetworkRole(ctx, 'membre');
  const contribution = await ctx.db.get(contributionId);
  if (!contribution || contribution.authorUserId !== user._id) {
    throw new ConvexError('NOT_FOUND');
  }
  return { user, contribution };
}

/** One fact in the history (`kohopEvents`). */
export async function recordKohopEvent(
  ctx: MutationCtx,
  entry: {
    contributionId: Id<'kohopContributions'>;
    kind: KohopEventKind;
    actorId?: Id<'users'>;
    metadata?: unknown;
  },
): Promise<void> {
  await ctx.db.insert('kohopEvents', {
    contributionId: entry.contributionId,
    kind: entry.kind,
    actorId: entry.actorId,
    at: Date.now(),
    metadata: entry.metadata,
  });
}

/** The version row of a contribution, by number. */
export async function versionOf(
  ctx: QueryCtx | MutationCtx,
  contributionId: Id<'kohopContributions'>,
  version: number,
): Promise<Doc<'kohopVersions'> | null> {
  return await ctx.db
    .query('kohopVersions')
    .withIndex('by_contribution_and_version', (q) =>
      q.eq('contributionId', contributionId).eq('version', version),
    )
    .unique();
}

/**
 * The state machine as a business error: the target stage, or a `ConvexError`
 * carrying the stable code (`ALREADY_FINAL`, `INVALID_TRANSITION`) — a plain
 * `Error`'s message is masked in production, a `ConvexError`'s data is not.
 * It throws BEFORE any write, so a refused transition leaves no trace.
 */
export function advance(from: KohopStage, event: KohopEvent): KohopStage {
  try {
    return nextStage(from, event);
  } catch (err) {
    throw new ConvexError(
      err instanceof Error ? err.message : 'INVALID_TRANSITION',
    );
  }
}

/**
 * The reviewer's own assignment. Anyone else's — and a designation the review
 * chief has not yet turned into an invitation — reads as NON-EXISTENT.
 */
export async function requireOwnAssignment(
  ctx: MutationCtx | QueryCtx,
  reviewerId: Id<'kohopReviewers'>,
): Promise<{
  user: Doc<'users'>;
  reviewer: Doc<'kohopReviewers'>;
  contribution: Doc<'kohopContributions'>;
}> {
  const user = await requireNetworkRole(ctx, 'membre');
  const reviewer = await ctx.db.get(reviewerId);
  if (
    !reviewer ||
    reviewer.userId !== user._id ||
    reviewer.status === 'proposed' ||
    reviewer.status === 'approved' ||
    reviewer.status === 'recused'
  ) {
    throw new ConvexError('NOT_FOUND');
  }
  const contribution = await ctx.db.get(reviewer.contributionId);
  if (!contribution) throw new ConvexError('NOT_FOUND');
  return { user, reviewer, contribution };
}
