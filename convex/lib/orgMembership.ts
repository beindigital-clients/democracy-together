import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Id } from '../_generated/dataModel';

// Account ↔ organization affiliation (F-21, accounts workstream) — read
// shared by publication submission (convex/publications.ts) and
// organization management (convex/orgAdmin.ts).

/** Organization on whose behalf an account submits (the first one affiliated). */
export async function organizationOfAuthor(
  ctx: QueryCtx | MutationCtx,
  userId: Id<'users'>,
): Promise<Id<'organizations'> | null> {
  const memberships = await ctx.db
    .query('organizationMemberships')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .take(10);
  // An organization one is RESPONSIBLE for comes before a mere
  // membership: it is usually one's own.
  const owner = memberships.find((m) => m.orgRole === 'owner');
  return (owner ?? memberships[0])?.orgId ?? null;
}
