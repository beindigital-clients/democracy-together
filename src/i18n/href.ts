// Joins a path and a query string.
//
// `usePathname` from @/i18n/navigation returns the path WITHOUT the query: that is
// what made filters get lost on language change (issue #35). The
// project made the explicit choice of putting facets in the URL — so
// they are shareable and indexable; the language picker was the
// only place breaking that contract, sending to /en/bibliotheque a
// person who was reading /fr/bibliotheque?theme=gouvernance&sort=cited&page=2.
//
// The query is taken as is (string), never rebuilt from an
// object: a repeated parameter (`?theme=a&theme=b`) and the key order
// therefore survive the switch, which a round trip through `Record` would lose.
export function withSearchParams(pathname: string, search: string): string {
  const query = search.startsWith('?') ? search.slice(1) : search;
  return query ? `${pathname}?${query}` : pathname;
}
