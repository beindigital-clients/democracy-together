import type { QueryCtx, MutationCtx } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';
import { canValidatePublications } from './roles';

// Upper bound per read: administrators and review chiefs are a handful of
// accounts, like the rest of the staff.
const RECIPIENTS_MAX = 100;

/**
 * The accounts that receive the editorial notifications (new deposits,
 * manuscripts, alerts): the review chiefs and the administrators.
 *
 * Two indexed reads (`by_role`, `by_reviewChief`), never a table scan.
 * Suspended accounts read nothing and are left out. The result is
 * deduplicated and filtered through `canValidatePublications`, so a stale
 * flag on a lowered account never receives an alert it cannot act on.
 */
export async function reviewChiefRecipients(
  ctx: QueryCtx | MutationCtx,
): Promise<Doc<'users'>[]> {
  const [admins, chiefs] = await Promise.all([
    ctx.db
      .query('users')
      .withIndex('by_role', (q) => q.eq('role', 'admin'))
      .take(RECIPIENTS_MAX),
    ctx.db
      .query('users')
      .withIndex('by_reviewChief', (q) => q.eq('reviewChief', true))
      .take(RECIPIENTS_MAX),
  ]);
  const seen = new Set<string>();
  const out: Doc<'users'>[] = [];
  for (const user of [...admins, ...chiefs]) {
    if (seen.has(user._id)) continue;
    seen.add(user._id);
    if (user.suspendedAt !== undefined) continue;
    if (!canValidatePublications(user)) continue;
    out.push(user);
  }
  return out;
}
