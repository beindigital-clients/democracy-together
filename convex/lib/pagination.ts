import { v, type Validator } from 'convex/values';
import type { PaginationOptions } from 'convex/server';

// Pagination of back-office lists (issue #8).
//
// `paginationOpts.numItems` comes from the CLIENT: without a server cap, a caller
// asks for 100,000 rows and the query becomes exactly the table scan
// it replaces again. We bound it here, once, for all lists.
export const PAGE_SIZE_MAX = 100;
export const PAGE_SIZE_DEFAULT = 50;

export function clampPageSize(
  opts: PaginationOptions,
  max: number = PAGE_SIZE_MAX,
): PaginationOptions {
  const asked = Number.isFinite(opts.numItems)
    ? Math.floor(opts.numItems)
    : PAGE_SIZE_DEFAULT;
  return { ...opts, numItems: Math.min(Math.max(asked, 1), max) };
}

// Return validator for a paginated query: the shape of `PaginationResult`,
// parameterized by that of a page row. Declaring what goes out remains the
// repository's rule (cf. publications.listPublished) — including on a paginated list.
export function paginatedValidator<
  T extends Validator<unknown, 'required', string>,
>(item: T) {
  return v.object({
    page: v.array(item),
    isDone: v.boolean(),
    continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(
      v.union(
        v.literal('SplitRecommended'),
        v.literal('SplitRequired'),
        v.null(),
      ),
    ),
  });
}
