import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';
import { normalizeEmail } from './onboarding';

// WHAT A MEMBERSHIP APPROVAL GRANTS, AND WHAT TAKING IT BACK WITHDRAWS
// (F-22 / F-26).
//
// Approving an application raises an account to `membre` — creating it when
// the applicant had none — and, for an organization, creates its directory
// profile with that account as its manager. Putting the decision back under
// review (`organizations.reopenApplication`) takes back exactly that, and no
// more:
//
//   - the `membre` role, only when the account owes it to THIS approval: the
//     approval created or raised it (`roleRaised`), it is still exactly
//     `membre` — a staff role given since is an administrator's choice, and
//     stands — and nothing else makes it a member: another organization that
//     is not suspended, another approved application;
//   - the directory profile, SUSPENDED rather than deleted: it leaves the
//     directory and the search, its manager can no longer edit it nor invite
//     anyone through it (orgAdmin.requireOrgOwner), and a new approval brings
//     it back as it was — no second profile, no new slug.
//
// The accounts stay. One created by the approval may have been used since
// (sign-ins, publications, messages): deleting it belongs to its holder or to
// an administrator, through the deletion workflow, never to the side effect
// of a review. The colleagues the manager attached to the organization keep
// their role as well: the confirmation names them, and staff decide for each.
//
// The same reading serves the confirmation (`reopenImpact`: what WILL be
// withdrawn) and the mutation (what IS withdrawn): the screen cannot announce
// one thing while the server does another.

type Ctx = QueryCtx | MutationCtx;
type Application = Doc<'membershipApplications'>;

// Bound on the "member elsewhere" reads: an account belongs to a handful of
// organizations, and applies once or twice.
const ELSEWHERE_READ_MAX = 20;

/**
 * The account an approval ELEVATES (pentest M-6): the signed-in account that
 * submitted the application, otherwise the account of its contact address.
 * `null`: there is none, and approving creates it.
 */
export async function accountToElevate(
  ctx: Ctx,
  application: Application,
): Promise<Doc<'users'> | null> {
  const linked = application.applicantUserId
    ? await ctx.db.get(application.applicantUserId)
    : null;
  if (linked) return linked;
  const email = normalizeEmail(application.contactEmail);
  return await ctx.db
    .query('users')
    .withIndex('email', (q) => q.eq('email', email))
    .first();
}

/**
 * The account an approval MADE a member: recorded by the approval since it
 * keeps track of it (`memberUserId`), found again the way the approval found
 * it for older ones. `null`: that account has been deleted since.
 */
export async function approvedMember(
  ctx: Ctx,
  application: Application,
): Promise<Doc<'users'> | null> {
  return application.memberUserId !== undefined
    ? await ctx.db.get(application.memberUserId)
    : await accountToElevate(ctx, application);
}

/** Is the account a member through something other than this application? */
async function memberElsewhere(
  ctx: Ctx,
  account: Doc<'users'>,
  application: Application,
): Promise<boolean> {
  // Another organization, not suspended, still counts it among its accounts.
  const links = await ctx.db
    .query('organizationMemberships')
    .withIndex('by_user', (q) => q.eq('userId', account._id))
    .take(ELSEWHERE_READ_MAX);
  for (const link of links) {
    if (link.orgId === application.createdOrgId) continue;
    const org = await ctx.db.get(link.orgId);
    if (org && org.status !== 'suspended') return true;
  }
  // Another application, approved, made it a member: through the record
  // approvals now keep, or — approved earlier — as the account that applied.
  const approvedOther = (rows: Application[]) =>
    rows.some((a) => a._id !== application._id && a.status === 'approved');
  const asMember = await ctx.db
    .query('membershipApplications')
    .withIndex('by_member', (q) => q.eq('memberUserId', account._id))
    .take(ELSEWHERE_READ_MAX);
  if (approvedOther(asMember)) return true;
  const asApplicant = await ctx.db
    .query('membershipApplications')
    .withIndex('by_applicant', (q) => q.eq('applicantUserId', account._id))
    .take(ELSEWHERE_READ_MAX);
  return approvedOther(asApplicant);
}

export type ApprovalWithdrawal = {
  // The account the approval made a member (`null`: deleted since).
  member: Doc<'users'> | null;
  // Whether that account loses its `membre` role.
  withdrawRole: boolean;
  // The profile the approval created, when it is still to be suspended
  // (`null`: none was created, or it is already suspended).
  organization: Doc<'organizations'> | null;
};

/** What taking an approval back withdraws — read before doing it. */
export async function planWithdrawal(
  ctx: Ctx,
  application: Application,
): Promise<ApprovalWithdrawal> {
  const member = await approvedMember(ctx, application);
  const withdrawRole =
    member !== null &&
    member.role === 'membre' &&
    // `false`: the account was a member before this approval. Missing — an
    // approval older than the record: an account that is exactly `membre` is
    // taken to owe it to the approval.
    application.roleRaised !== false &&
    !(await memberElsewhere(ctx, member, application));
  const created = application.createdOrgId
    ? await ctx.db.get(application.createdOrgId)
    : null;
  return {
    member,
    withdrawRole,
    organization: created && created.status !== 'suspended' ? created : null,
  };
}
