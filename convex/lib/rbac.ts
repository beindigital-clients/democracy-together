import { getAuthUserId } from '@convex-dev/auth/server';
import type { QueryCtx, MutationCtx } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';

// Hiérarchie des rôles réseau (F-02). Un rôle accorde aussi les droits
// des rôles inférieurs. requireNetworkRole(ctx, "moderateur") accepte
// moderateur, editeur et admin.
export const ROLE_ORDER = [
  'visiteur',
  'membre',
  'moderateur',
  'editeur',
  'admin',
] as const;
export type NetworkRole = (typeof ROLE_ORDER)[number];

// Un compte authentifié sans rôle explicite vaut « visiteur » (modèle
// d'adhésion B) : l'auto-inscription donne un compte de base ; les droits
// « membre » (dépôt de publications…) ne sont accordés qu'après validation
// d'une candidature d'adhésion (organizations.reviewApplication).
export function rank(role: NetworkRole | undefined): number {
  return ROLE_ORDER.indexOf(role ?? 'visiteur');
}

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
  if (rank(user.role) < rank(min)) {
    throw new Error(`Accès refusé : rôle « ${min} » requis.`);
  }
  return user;
}
