import { getAuthSessionId } from '@convex-dev/auth/server';
import type { QueryCtx, MutationCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import { roleRank, type NetworkRole } from './roles';

// ÉTAT D'ACCÈS D'UNE SESSION (chantier comptes) — la seule décision que
// lisent toutes les gardes de convex/lib/rbac.ts.
//
// Un compte AUTHENTIFIÉ n'est pas pour autant un compte qui a accès :
//  - `suspended`               : un administrateur l'a suspendu (motif
//                                obligatoire). Plus RIEN de réservé ne lui
//                                répond, ses sessions ont été invalidées.
//  - `second_factor_required`  : la 2FA est active sur le compte, mais CETTE
//                                session n'a pas encore présenté de code. La
//                                preuve est liée à la session : chaque
//                                nouvelle connexion doit la refaire.
//  - `enrollment_required`     : l'obligation de 2FA pour les rôles
//                                modérateur et plus est activée, et ce compte
//                                n'a pas encore inscrit d'appareil.
//  - `active`                  : rien ne s'y oppose.
//
// L'ordre compte : une suspension l'emporte sur tout, puis la preuve d'une
// 2FA déjà active, puis l'obligation d'en inscrire une.
export type AccessState =
  'active' | 'suspended' | 'second_factor_required' | 'enrollment_required';

// Rang à partir duquel l'obligation de 2FA s'applique quand elle est activée :
// les comptes qui décident de ce qui paraît (modération), de ce qui est édité
// et de qui a quels droits.
export const TWO_FACTOR_STAFF_MIN_ROLE: NetworkRole = 'moderateur';

export type SecurityPolicy = {
  twoFactorRequiredForStaff: boolean;
  updatedAt: number | null;
};

// DÉSACTIVÉE PAR DÉFAUT, et c'est un choix d'exploitation, pas de sécurité :
// le déploiement partagé des E2E crée des comptes administrateur qui n'ont
// aucun appareil. docs/backlog/comptes.md : elle DOIT être activée à la mise
// en service, et le tableau de bord d'administration l'affiche tant qu'elle
// ne l'est pas.
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

/** Le rôle de ce compte est-il soumis à l'obligation de 2FA, si elle est active ? */
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

/** Identifiant de la session courante, validé comme identifiant de table. */
export async function currentSessionId(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<'authSessions'> | null> {
  const raw = await getAuthSessionId(ctx);
  // Une identité simulée (tests) ou forgée peut porter une chaîne qui n'est
  // pas un identifiant de session : elle ne vaut alors AUCUNE preuve.
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
