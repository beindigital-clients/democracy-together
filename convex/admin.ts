import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { query } from './_generated/server';
import { requireNetworkRole, effectiveRole } from './lib/rbac';
import { COUNTER, readCounters } from './lib/counters';
import { clampPageSize, paginatedValidator } from './lib/pagination';
import { normalizeSearchTerm } from './lib/search';
import { networkRole } from './schema';

// Back office (F-26 / F-61 / F-63) — all reads are role-gated
// (defense in depth; the UI already hides what the role does not allow).

// Administration dashboard (F-61): key counters.
//
// These six numbers were obtained by LOADING the corresponding tables then
// reading `.length` — the whole of `users` on every dashboard
// display. They now come from denormalized counters (convex/counters.ts),
// maintained in the transaction that writes the counted data: six indexed
// reads of one row each, whatever the size of the network.
export const dashboardStats = query({
  args: {},
  returns: v.object({
    pendingApplications: v.number(),
    totalApplications: v.number(),
    activeMembers: v.number(),
    totalUsers: v.number(),
    unhandledContacts: v.number(),
    pendingPublications: v.number(),
  }),
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'moderateur');
    const c = await readCounters(ctx, [
      COUNTER.MEMBERSHIP_APPLICATIONS_PENDING,
      COUNTER.MEMBERSHIP_APPLICATIONS,
      COUNTER.ORGANIZATIONS_ACTIVE,
      COUNTER.USERS,
      COUNTER.CONTACT_MESSAGES_UNHANDLED,
      COUNTER.PUBLICATIONS_PENDING,
    ]);
    return {
      pendingApplications: c[COUNTER.MEMBERSHIP_APPLICATIONS_PENDING],
      totalApplications: c[COUNTER.MEMBERSHIP_APPLICATIONS],
      activeMembers: c[COUNTER.ORGANIZATIONS_ACTIVE],
      totalUsers: c[COUNTER.USERS],
      unhandledContacts: c[COUNTER.CONTACT_MESSAGES_UNHANDLED],
      pendingPublications: c[COUNTER.PUBLICATIONS_PENDING],
    };
  },
});

// Application moderation queue (F-26 / F-22), most recent first.
//
// PAGINATED + SEARCHABLE (issues #8 and #49). It was the last back-office list
// to load its whole table then sort it in memory; adding
// a search to it without paginating it first would have worsened exactly what #8
// fixes elsewhere. The descending sort now comes from the index: an
// application is inserted with `submittedAt = Date.now()`, so creation order
// IS submission order — no more need for a `sort` on the read table.
const applicationValidator = v.object({
  _id: v.id('membershipApplications'),
  type: v.union(v.literal('organisation'), v.literal('individu')),
  organizationName: v.string(),
  contactEmail: v.string(),
  country: v.string(),
  message: v.union(v.string(), v.null()),
  status: v.union(
    v.literal('pending'),
    v.literal('approved'),
    v.literal('rejected'),
  ),
  reviewNotes: v.union(v.string(), v.null()),
  submittedAt: v.number(),
  // When the decision was taken, and when the approved member's sign-in
  // invitation actually left (`null`: not yet, or its send failed). The queue
  // shows both: an approved member whose invitation never went out cannot
  // know they were approved, and the screen offers to send it again.
  reviewedAt: v.union(v.number(), v.null()),
  invitedAt: v.union(v.number(), v.null()),
  // THE ACCOUNT THAT WILL BE ELEVATED (pentest M-6). Approving an application does not grant
  // a role to `contactEmail`: it grants it to the SIGNED-IN account that submitted
  // the request, and these two addresses are independent — one is typed
  // freely into the form, the other is the session's.
  //
  // The pentest described the gap: a signed-in visitor submits "Institut X —
  // contact@institut-x.org", the moderator approves a plausible
  // organization, and it is the submitter's account that becomes a member. Replayed, that is
  // exactly what happens. It is not a defect in itself — without this
  // link, an invited member would never get their membership — but the
  // moderator was deciding blind: the queue carried NO field designating
  // this account. It now does, and the screen flags the mismatch.
  applicantEmail: v.union(v.string(), v.null()),
  applicantRole: v.union(networkRole, v.null()),
});

export const listApplications = query({
  args: {
    status: v.optional(
      v.union(
        v.literal('pending'),
        v.literal('approved'),
        v.literal('rejected'),
      ),
    ),
    search: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginatedValidator(applicationValidator),
  handler: async (ctx, { status, search, paginationOpts }) => {
    await requireNetworkRole(ctx, 'moderateur');
    const opts = clampPageSize(paginationOpts);
    const term = normalizeSearchTerm(search);

    // Search: full-text index on the organization name, with the status
    // carried by `filterFields` — so ONE index read, filter included.
    // Without search: the status index (or the table in descending order),
    // exactly as before.
    const result = term
      ? await ctx.db
          .query('membershipApplications')
          .withSearchIndex('search_organizationName', (q) => {
            const q2 = q.search('organizationName', term);
            return status ? q2.eq('status', status) : q2;
          })
          .paginate(opts)
      : status
        ? await ctx.db
            .query('membershipApplications')
            .withIndex('by_status', (q) => q.eq('status', status))
            .order('desc')
            .paginate(opts)
        : await ctx.db
            .query('membershipApplications')
            .order('desc')
            .paginate(opts);

    // One read per row of the PAGE (size already bounded by `clampPageSize`)
    // to resolve the linked account — not a scan.
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (a) => {
          const applicant = a.applicantUserId
            ? await ctx.db.get(a.applicantUserId)
            : null;
          return {
            _id: a._id,
            type: a.type,
            organizationName: a.organizationName,
            contactEmail: a.contactEmail,
            country: a.country,
            message: a.message ?? null,
            status: a.status,
            reviewNotes: a.reviewNotes ?? null,
            submittedAt: a.submittedAt,
            reviewedAt: a.reviewedAt ?? null,
            invitedAt: a.invitedAt ?? null,
            applicantEmail: applicant?.email ?? null,
            applicantRole: applicant?.role ?? null,
          };
        }),
      ),
    };
  },
});

// User & role management (F-63) — administrators only.
//
// PAGINATED: the list loaded the whole of `users`, then sorted by email in
// memory. The `email` index already carries that order — so the page comes out sorted from the
// database, without reading a single row more than what is displayed.
const adminUserValidator = v.object({
  _id: v.id('users'),
  name: v.union(v.string(), v.null()),
  email: v.union(v.string(), v.null()),
  role: networkRole,
  // Lifecycle (accounts workstream): suspension and its reason, deletion in
  // progress, two-factor authentication enabled. Read on the displayed row — the
  // suspension is on the document, 2FA costs one indexed read.
  suspended: v.boolean(),
  suspensionReason: v.union(v.string(), v.null()),
  deleting: v.boolean(),
  twoFactor: v.boolean(),
});

// SEARCHABLE AND FILTERABLE (issue #49) — both via index, never in memory.
//
// Three paths, a single index read each time:
//   search (+ role)    -> `search_email`, the role carried by `filterFields`;
//   role only          -> `by_role`;
//   neither            -> `email`, which carries the alphabetical sort.
//
// A NUANCE ON THE ROLE FILTER, and it is accepted: it applies to the STORED
// role. Accounts created before PR #4 have no `role` column; they
// are indexed under `undefined`, which precedes every value — so outside the
// `role = 'visiteur'` range, even though the list DISPLAYS them as "Visiteur"
// (effectiveRole, issue #27). Combining the two would require reading two index
// ranges in a single paginated page, which Convex cannot do: the
// choice is therefore to filter only what an index settles exactly, and to
// leave these accounts visible in the unfiltered list (and via search
// on their address, which does not go through `role`). Pinned by a test.
export const listUsers = query({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    role: v.optional(networkRole),
  },
  returns: paginatedValidator(adminUserValidator),
  handler: async (ctx, { paginationOpts, search, role }) => {
    await requireNetworkRole(ctx, 'admin');
    const opts = clampPageSize(paginationOpts);
    const term = normalizeSearchTerm(search);

    const result = term
      ? await ctx.db
          .query('users')
          .withSearchIndex('search_email', (q) => {
            const q2 = q.search('email', term);
            return role ? q2.eq('role', role) : q2;
          })
          .paginate(opts)
      : role
        ? await ctx.db
            .query('users')
            .withIndex('by_role', (q) => q.eq('role', role))
            .paginate(opts)
        : await ctx.db.query('users').withIndex('email').paginate(opts);

    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (u) => {
          const cred = await ctx.db
            .query('twoFactorCredentials')
            .withIndex('by_user', (q) => q.eq('userId', u._id))
            .unique();
          const deleting = u.suspensionReason === 'deletion';
          return {
            _id: u._id,
            name: u.name ?? null,
            email: u.email ?? null,
            role: effectiveRole(u.role),
            suspended: u.suspendedAt !== undefined,
            suspensionReason: deleting ? null : (u.suspensionReason ?? null),
            deleting,
            twoFactor: cred?.status === 'active',
          };
        }),
      ),
    };
  },
});
