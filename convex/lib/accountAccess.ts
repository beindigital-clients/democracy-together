import { getAuthSessionId } from '@convex-dev/auth/server';
import type { QueryCtx, MutationCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import { roleRank, type NetworkRole } from './roles';

// ACCESS STATE OF A SESSION (accounts workstream) — the single decision that
// all the guards in convex/lib/rbac.ts read.
//
// An AUTHENTICATED account is not necessarily an account that has access:
//  - `suspended`               : an administrator suspended it (reason
//                                required). NOTHING restricted answers it
//                                anymore, its sessions were invalidated.
//  - `second_factor_required`  : 2FA is active on the account, but THIS
//                                session has not presented a code yet. The
//                                proof is bound to the session: each
//                                new sign-in must redo it.
//  - `enrollment_required`     : the 2FA requirement for moderator roles
//                                and above is enabled, and this account
//                                has not enrolled a device yet.
//  - `active`                  : nothing stands in the way.
//
// Order matters: a suspension overrides everything, then the proof of an
// already active 2FA, then the requirement to enroll one.
export type AccessState =
  'active' | 'suspended' | 'second_factor_required' | 'enrollment_required';

// Rank from which the 2FA requirement applies when enabled:
// the accounts that decide what gets published (moderation), what is edited
// and who has which rights.
export const TWO_FACTOR_STAFF_MIN_ROLE: NetworkRole = 'moderateur';

export type SecurityPolicy = {
  twoFactorRequiredForStaff: boolean;
  updatedAt: number | null;
};

// DISABLED BY DEFAULT, and that is an operational choice, not a security one:
// the shared E2E deployment creates administrator accounts that have
// no device. docs/backlog/comptes.md: it MUST be enabled at go-live,
// and the administration dashboard shows it as long as it
// is not.
export const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  twoFactorRequiredForStaff: false,
  updatedAt: null,
};

export async function readSecurityPolicy(
  ctx: QueryCtx | MutationCtx,
): Promise<SecurityPolicy> {
  const row = await ctx.db
    .query('securitySettings')
    .withIndex('by_key', (q) => q.eq('key', 'default'))
    .unique();
  return row
    ? {
        twoFactorRequiredForStaff: row.twoFactorRequiredForStaff,
        updatedAt: row.updatedAt,
      }
    : DEFAULT_SECURITY_POLICY;
}

export function isSuspended(user: Pick<Doc<'users'>, 'suspendedAt'>): boolean {
  return user.suspendedAt !== undefined;
}

/** Is this account's role subject to the 2FA requirement, if it is active? */
export function roleRequiresTwoFactor(role: string | undefined): boolean {
  return roleRank(role) >= roleRank(TWO_FACTOR_STAFF_MIN_ROLE);
}

export async function activeCredential(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
): Promise<Doc<'twoFactorCredentials'> | null> {
  const cred = await ctx.db
    .query('twoFactorCredentials')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();
  return cred && cred.status === 'active' ? cred : null;
}

/** Identifier of the current session, validated as a table identifier. */
export async function currentSessionId(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<'authSessions'> | null> {
  const raw = await getAuthSessionId(ctx);
  // A simulated (tests) or forged identity may carry a string that is not
  // a session identifier: it then counts as NO proof.
  return raw ? ctx.db.normalizeId('authSessions', raw) : null;
}

export async function sessionHasProof(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
  sessionId: Id<'authSessions'> | null,
): Promise<boolean> {
  if (!sessionId) return false;
  const proof = await ctx.db
    .query('twoFactorSessionProofs')
    .withIndex('by_session', (q) => q.eq('sessionId', sessionId))
    .first();
  return proof !== null && proof.userId === userId;
}

export async function evaluateAccess(
  ctx: QueryCtx | MutationCtx,
  user: Doc<'users'>,
  sessionId: Id<'authSessions'> | null,
): Promise<AccessState> {
  if (isSuspended(user)) return 'suspended';
  if (await activeCredential(ctx, user._id)) {
    return (await sessionHasProof(ctx, user._id, sessionId))
      ? 'active'
      : 'second_factor_required';
  }
  if (roleRequiresTwoFactor(user.role)) {
    const policy = await readSecurityPolicy(ctx);
    if (policy.twoFactorRequiredForStaff) return 'enrollment_required';
  }
  return 'active';
}
