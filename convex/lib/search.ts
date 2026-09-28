// Search terms for back-office lists (issue #49).
//
// The term comes from the CLIENT, like `paginationOpts.numItems`: it is
// normalised HERE, once, for all four lists — rather than four times with
// four nuances. Three decisions, all made server-side:
//
//  1. FLOOR. A single-character search returns almost the whole table: it is
//     the read #8 just removed, dressed up as a search. The floor of 2 is the
//     one of `globalSearch` (F-06) — same product, same threshold.
//  2. CEILING. A 100,000-character term splits into as many terms to match.
//     As with the page size, the client does not set the bound.
//  3. EMPTY = ABSENT. A blank string does NOT trigger a search: the list
//     falls back on its usual index (the one carrying its sort order),
//     instead of going through the full-text index to filter nothing. That
//     is what makes `undefined` and `''` strictly equivalent for the caller,
//     so the UI does not have to clear the argument to return to the full
//     list.
export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 100;

export function normalizeSearchTerm(
  raw: string | undefined,
): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  if (trimmed.length < SEARCH_MIN_LENGTH) return undefined;
  return trimmed.slice(0, SEARCH_MAX_LENGTH);
}
