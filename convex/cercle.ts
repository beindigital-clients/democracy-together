import { v } from 'convex/values';
import { query } from './_generated/server';
import { getCurrentUser } from './lib/rbac';
import { effectiveRole, hasCercleAccess, isAmi } from './lib/roles';

// CERCLE DES AMIS — entry point of the Cercle's own functions.
//
// The status itself lives on the account (`users.amiSince`, see
// convex/lib/roles.ts for why it is NOT a role). This module only answers
// "what does the current session see of the Cercle", server-side: the
// interface reads it to decide which screen to show, and every Cercle
// function re-checks through `requireCercleAccess`.

export const accessLevel = v.union(
  // Not signed in, suspended, or a visitor without the Ami status.
  v.literal('none'),
  v.literal('ami'),
  // A validated member or above: already part of the network.
  v.literal('member'),
);

/** What the session may see of the Cercle. Never throws, never leaks data. */
export const access = query({
  args: {},
  returns: v.object({ level: accessLevel }),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user || !hasCercleAccess(user)) return { level: 'none' as const };
    // An Ami who also holds a member rank is reported as a member: the rank
    // is what they already had, the status adds nothing on top of it.
    return {
      level:
        isAmi(user) && effectiveRole(user.role) === 'visiteur'
          ? ('ami' as const)
          : ('member' as const),
    };
  },
});
