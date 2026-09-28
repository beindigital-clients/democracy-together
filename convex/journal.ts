import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { query } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { requireNetworkRole } from './lib/rbac';
import { clampPageSize, paginatedValidator } from './lib/pagination';
import { normalizeSearchTerm } from './lib/search';

// Activity log & export (F-67) — back office. The `auditLog` table is
// populated by recordAudit (cf. convex/lib/audit.ts) on every sensitive action.
// Read RESTRICTED to administrators (sensitive data: who did what).

const auditRowValidator = v.object({
  action: v.string(),
  createdAt: v.number(),
  targetId: v.union(v.string(), v.null()),
  // The ACTOR now comes out with its identifier (issue #49): that is what
  // the screen sends back as an argument to filter "everything this person
  // did". The name alone would not suffice — two accounts can share it,
  // and an account may only have its address.
  actorId: v.union(v.id('users'), v.null()),
  actorName: v.union(v.string(), v.null()),
  actorEmail: v.union(v.string(), v.null()),
});

// HARD cap on the page size. `limit` had none (issue #8): a
// caller asked for `limit: 1e6` and the query re-read the entire log — the
// fastest-growing table in the product, since a row is written to it on
// every sensitive action.
const AUDIT_PAGE_MAX = 100;

// SEARCHABLE AND FILTERABLE BY ACTOR (issue #49).
//
// The log had no way to find an entry: on a table whose nature
// is only ever to grow, "everything, from newest to
// oldest" is the only available angle. Two entry points now, both
// via indexes:
//
//   `search` — full-text index on the action. The dotted slug is tokenized
//     there, so "publication" brings up the whole family and "reviewed" all
//     the decisions. It also stands in for the issue's filter by action:
//     the list of DISTINCT actions in a log cannot be obtained without
//     walking it — exactly the read that #8 removed.
//   `actorId` — the `by_actor` index, or `filterFields` when a search is
//     in progress. The screen supplies it when a row's actor is clicked:
//     actors are not all staff (`publication.submitted` is written
//     by the submitting member), so a staff drop-down would miss
//     some of them, and enumerating the actors present would require the same scan.
//
// ORDER. Without a search, the list stays in reverse chronological order (including
// when filtered by actor: `by_actor` then `.order('desc')`). WITH a search,
// the order is by relevance — that is how a Convex full-text index
// orders, and each row carries its date.
export const listAuditLog = query({
  args: {
    paginationOpts: paginationOptsValidator,
    search: v.optional(v.string()),
    actorId: v.optional(v.id('users')),
  },
  returns: paginatedValidator(auditRowValidator),
  handler: async (ctx, { paginationOpts, search, actorId }) => {
    await requireNetworkRole(ctx, 'admin');
    const opts = clampPageSize(paginationOpts, AUDIT_PAGE_MAX);
    const term = normalizeSearchTerm(search);

    const result = term
      ? await ctx.db
          .query('auditLog')
          .withSearchIndex('search_action', (q) => {
            const q2 = q.search('action', term);
            return actorId ? q2.eq('actorId', actorId) : q2;
          })
          .paginate(opts)
      : actorId
        ? await ctx.db
            .query('auditLog')
            .withIndex('by_actor', (q) => q.eq('actorId', actorId))
            .order('desc')
            .paginate(opts)
        : await ctx.db.query('auditLog').order('desc').paginate(opts);

    // The actor was resolved row by row: one round trip per entry, whereas
    // a handful of back-office accounts sign most of the log.
    // We deduplicate first, then read each actor ONCE.
    const actorIds = [
      ...new Set(
        result.page
          .map((e) => e.actorId)
          .filter((id): id is Id<'users'> => id !== undefined),
      ),
    ];
    const actors = new Map<Id<'users'>, Doc<'users'>>();
    await Promise.all(
      actorIds.map(async (id) => {
        // null if the account has vanished: the entry stays readable, without an actor.
        const actor = await ctx.db.get(id);
        if (actor) actors.set(id, actor);
      }),
    );

    return {
      ...result,
      page: result.page.map((e) => {
        const actor = e.actorId ? actors.get(e.actorId) : undefined;
        return {
          action: e.action,
          createdAt: e.createdAt,
          targetId: e.targetId ?? null,
          actorId: e.actorId ?? null,
          actorName: actor?.name ?? null,
          actorEmail: actor?.email ?? null,
        };
      }),
    };
  },
});
