import { getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError } from 'convex/values';
import type { QueryCtx, MutationCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import { roleRank, canValidatePublications, type NetworkRole } from './roles';
import {
  currentSessionId,
  evaluateAccess,
  type AccessState,
} from './accountAccess';

// Hierarchy of network roles (F-02). The vocabulary, rank and default value
// live in ./roles.ts — a pure module, shared with the UI, so that the
// decision "no role = visitor" is written in one place only.
// A role also grants the rights of lower roles:
// requireNetworkRole(ctx, "moderateur") accepts moderateur, editeur and admin.
export {
  ROLE_ORDER,
  DEFAULT_ROLE,
  effectiveRole,
  isNetworkRole,
  roleRank as rank,
} from './roles';
export type { NetworkRole } from './roles';
export type { AccessState } from './accountAccess';

// ACCOUNT STATE (accounts workstream). All guards below go through
// `evaluateAccess`: a SUSPENDED account, a session that has not presented its
// second factor, or a staff account required to enrol a 2FA it does not have
// yet gets NOTHING restricted — neither reads nor writes. It lives here and
// not in each module, so that no guard can forget it.

// Refusal codes, read by the interface (translated screens): `ConvexError`,
// whose data reaches the client even in production.
export const ACCESS_ERROR: Record<Exclude<AccessState, 'active'>, string> = {
  suspended: 'ACCOUNT_SUSPENDED',
  second_factor_required: 'TWO_FACTOR_REQUIRED',
  enrollment_required: 'TWO_FACTOR_ENROLLMENT_REQUIRED',
};

/**
 * The session's account, WITHOUT judging its state (suspension, 2FA).
 *
 * Reserved for the screens whose very purpose is to GET OUT of those states:
 * TOTP code entry, device enrolment, session state. Everything else goes
 * through `getCurrentUser` / `requireUser`.
 */
export async function getSessionUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<'users'> | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  return await ctx.db.get(userId);
}

/** Access state of the current session, or `null` if anonymous. */
export async function getAccessState(
  ctx: QueryCtx | MutationCtx,
): Promise<{ user: Doc<'users'>; state: AccessState } | null> {
  const user = await getSessionUser(ctx);
  if (!user) return null;
  const state = await evaluateAccess(ctx, user, await currentSessionId(ctx));
  return { user, state };
}

// Current user — `null` if anonymous OR if their state denies them access:
// a public query that personalises its response ("my notifications") then
// treats them as a visitor.
export async function getCurrentUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<'users'> | null> {
  const access = await getAccessState(ctx);
  return access && access.state === 'active' ? access.user : null;
}

/** Identifier of the current account if it has access, otherwise `null`. */
export async function getActiveUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<'users'> | null> {
  return (await getCurrentUser(ctx))?._id ?? null;
}

export async function requireUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<'users'>> {
  const access = await getAccessState(ctx);
  if (!access) throw new Error('Non authentifié.');
  if (access.state !== 'active') {
    throw new ConvexError(ACCESS_ERROR[access.state]);
  }
  return access.user;
}

/**
 * The session's account, not suspended — its second factor MAY be missing.
 *
 * Only for the functions that allow presenting or enrolling it.
 */
export async function requireSessionUser(
  ctx: QueryCtx | MutationCtx,
): Promise<{ user: Doc<'users'>; state: AccessState }> {
  const access = await getAccessState(ctx);
  if (!access) throw new Error('Non authentifié.');
  if (access.state === 'suspended') {
    throw new ConvexError(ACCESS_ERROR.suspended);
  }
  return access;
}

// Defence in depth: call at the top of every sensitive mutation, even if the
// UI already hides the button.
export async function requireNetworkRole(
  ctx: QueryCtx | MutationCtx,
  min: NetworkRole,
): Promise<Doc<'users'>> {
  const user = await requireUser(ctx);
  if (roleRank(user.role) < roleRank(min)) {
    throw new Error(`Accès refusé : rôle « ${min} » requis.`);
  }
  return user;
}

/**
 * Guard of the publication decisions (library, F-43 manuscripts, KOHOP): the
 * review chief and the administrator only. Built on `requireUser`, so a
 * suspended account or a session without its second factor is refused first.
 */
export async function requireReviewChief(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<'users'>> {
  const user = await requireUser(ctx);
  if (!canValidatePublications(user)) {
    throw new Error('Accès refusé : fonction « chef de revue » requise.');
  }
  return user;
}

/**
 * Re-reads an account designated by its identifier (already resolved by an
 * action) and refuses it if it does not have access.
 *
 * Actions (`documents.prepareDocument`, `translation.request`) resolve the
 * caller then pass its identifier to an internal query. The action's identity
 * is propagated to that query: when it designates the same account, the
 * session is judged in full (2FA included); otherwise — internal call without
 * identity —, only suspension can be checked.
 */
export async function getActiveUserById(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
): Promise<Doc<'users'> | null> {
  const sessionUserId = await getAuthUserId(ctx);
  if (sessionUserId === userId) return await getCurrentUser(ctx);
  const user = await ctx.db.get(userId);
  return user && user.suspendedAt === undefined ? user : null;
}
