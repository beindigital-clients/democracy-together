import { getAuthUserId } from '@convex-dev/auth/server';
import type { QueryCtx, MutationCtx } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';
import { roleRank, type NetworkRole } from './roles';

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

export async function getCurrentUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<'users'> | null> {
  const userId = await getAuthUserId(ctx);
  if (!userId) return null;
  return await ctx.db.get(userId);
}

export async function requireUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<'users'>> {
  const user = await getCurrentUser(ctx);
  if (!user) throw new Error('Non authentifié.');
  return user;
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
