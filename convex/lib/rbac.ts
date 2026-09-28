import { getAuthUserId } from '@convex-dev/auth/server';
import { ConvexError } from 'convex/values';
import type { QueryCtx, MutationCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import { roleRank, type NetworkRole } from './roles';
import {
  currentSessionId,
  evaluateAccess,
  type AccessState,
} from './accountAccess';

// Hiérarchie des rôles réseau (F-02). Le vocabulaire, le rang et la valeur par
// défaut vivent dans ./roles.ts — module pur, partagé avec l'UI, pour que la
// décision « pas de rôle = visiteur » ne soit écrite qu'à un seul endroit.
// Un rôle accorde aussi les droits des rôles inférieurs :
// requireNetworkRole(ctx, "moderateur") accepte moderateur, editeur et admin.
export {
  ROLE_ORDER,
  DEFAULT_ROLE,
  effectiveRole,
  isNetworkRole,
  roleRank as rank,
} from './roles';
export type { NetworkRole } from './roles';
export type { AccessState } from './accountAccess';

// ÉTAT DU COMPTE (chantier comptes). Toutes les gardes ci-dessous passent par
// `evaluateAccess` : un compte SUSPENDU, une session qui n'a pas présenté son
// second facteur, ou un compte d'encadrement tenu d'inscrire une 2FA qu'il n'a
// pas encore n'obtiennent RIEN de réservé — ni lecture, ni écriture. C'est ici
// et non dans chaque module, pour qu'aucune garde ne puisse l'oublier.

// Codes de refus, lus par l'interface (écrans traduits) : `ConvexError`, dont
// la donnée traverse jusqu'au client même en production.
export const ACCESS_ERROR: Record<Exclude<AccessState, 'active'>, string> = {
  suspended: 'ACCOUNT_SUSPENDED',
  second_factor_required: 'TWO_FACTOR_REQUIRED',
  enrollment_required: 'TWO_FACTOR_ENROLLMENT_REQUIRED',
};

/**
 * Le compte de la session, SANS juger son état (suspension, 2FA).
 *
 * Réservé aux écrans qui servent précisément à SORTIR de ces états : saisie du
 * code TOTP, inscription d'un appareil, état de session. Tout le reste passe
 * par `getCurrentUser` / `requireUser`.
 */
export async function getSessionUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<'users'> | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  return await ctx.db.get(userId);
}

/** État d'accès de la session courante, ou `null` si anonyme. */
export async function getAccessState(
  ctx: QueryCtx | MutationCtx,
): Promise<{ user: Doc<'users'>; state: AccessState } | null> {
  const user = await getSessionUser(ctx);
  if (!user) return null;
  const state = await evaluateAccess(ctx, user, await currentSessionId(ctx));
  return { user, state };
}

// Utilisateur courant — `null` si anonyme OU si son état lui refuse l'accès :
// une query publique qui personnalise sa réponse (« mes notifications »)
// le traite alors comme un visiteur.
export async function getCurrentUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<'users'> | null> {
  const access = await getAccessState(ctx);
  return access && access.state === 'active' ? access.user : null;
}

/** Identifiant du compte courant s'il a accès, sinon `null`. */
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
 * Compte de la session, non suspendu — son second facteur PEUT manquer.
 *
 * Pour les seules fonctions qui permettent de le présenter ou de l'inscrire.
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

// Défense en profondeur : à appeler en tête de chaque mutation sensible,
// même si l'UI masque déjà le bouton.
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
 * Relit un compte désigné par son identifiant (déjà résolu par une action) et
 * le refuse s'il n'a pas accès.
 *
 * Les actions (`documents.prepareDocument`, `translation.request`) résolvent
 * l'appelant puis passent son identifiant à une query interne. L'identité de
 * l'action est propagée à cette query : quand elle désigne le même compte, la
 * session est jugée entière (2FA comprise) ; sinon — appel interne sans
 * identité —, seule la suspension est vérifiable.
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
