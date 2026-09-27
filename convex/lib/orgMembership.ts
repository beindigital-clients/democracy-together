import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';

// Rattachement compte ↔ organisation (F-21, chantier comptes) — lecture
// partagée par le dépôt de publication (convex/publications.ts) et la gestion
// des organisations (convex/orgAdmin.ts).

/** Organisation au nom de laquelle un compte dépose (la première rattachée). */
export async function organizationOfAuthor(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
): Promise<Id<'organizations'> | null> {
  const memberships = await ctx.db
    .query('organizationMemberships')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .take(10);
  // Une organisation dont on est RESPONSABLE passe avant une simple
  // appartenance : c'est d'ordinaire la sienne.
  const owner = memberships.find((m) => m.orgRole === 'owner');
  return (owner ?? memberships[0])?.orgId ?? null;
}
