// "FOLDED" SEARCH FIELD (F-06 / F-34) — pure logic, shared by the mutations
// that write content, the backfill migration and the search queries.
//
// WHY A DEDICATED FIELD. Convex's full-text index splits into words and
// ignores case, but NOT accents: "democratie" does not find "démocratie"
// (measured on 27/09 on the palette, and it is what had moved the library to
// the `fold` fallback). We therefore index an already folded copy of the text
// — lowercase, without diacritics, punctuation replaced by spaces — and fold
// the query the same way before passing it to `q.search`. Since both sides go
// through the same function, they cannot diverge.
//
// WHY PUNCTUATION BECOMES A SPACE. "démocratie," must give the word
// "democratie" and not "democratie,": matching is done word by word (and by
// prefix on the last query term). Letters of all scripts (\p{L}, including
// Arabic) and digits are kept.

// Cap on indexed text. An "in-depth" post can reach several thousand
// characters; beyond 8,000, relevance gains nothing more and every write pays
// for reindexing the whole text. The title and summary are at the head of
// the haystack: they are what survives the cut.
export const SEARCH_TEXT_MAX = 8000;

export function foldForSearch(raw: string): string {
  return (
    raw
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      // Apostrophes et traits d'union JOIGNENT des mots (« d'ivoire »,
      // « peer-review ») : on les coupe comme le reste, pour que « ivoire »
      // et « review » soient des mots à part entière.
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** Folded and bounded haystack, ready to be stored in `searchText`. */
export function buildSearchText(parts: Array<string | undefined>): string {
  return foldForSearch(parts.filter(Boolean).join(' ')).slice(
    0,
    SEARCH_TEXT_MAX,
  );
}

// --- Haystacks per table -----------------------------------------------------
// Each searchable table exposes ONE function that says what is searchable. It
// is called on write (insert, text correction) and by the
// `searchIndexing.backfill` migration. Adding a field here without rerunning
// the migration leaves old documents on the old haystack: the migration is
// idempotent, it can be rerun safely.

export function publicationSearchText(p: {
  title: string;
  authors: { name: string }[];
  abstract: string;
  keypoints: string[];
}): string {
  return buildSearchText([
    p.title,
    p.authors.map((a) => a.name).join(' '),
    p.abstract,
    p.keypoints.join(' '),
  ]);
}

// The country is searchable by its NAME in the site's languages ("Kenya"
// finds the `KE` profile): `countryTerms` comes from the directory, which
// already did this in memory. The computation happens once, on write.
export function organizationSearchText(
  o: { name: string; description?: string; country: string },
  countryTerms: (code: string) => string,
): string {
  return buildSearchText([o.name, o.description, countryTerms(o.country)]);
}

export function tribuneSearchText(p: {
  title: string;
  body: string;
  authorName: string;
}): string {
  return buildSearchText([p.title, p.authorName, p.body]);
}

/** Year (UTC) of a timestamp — "date" filter for day-dated content. */
export function yearOf(ms: number): number {
  return new Date(ms).getUTCFullYear();
}

// Query term: same folding as the haystack, bounded. `null` = no search
// (fewer than two useful characters, like the palette and the back office).
export const QUERY_MIN = 2;
export const QUERY_MAX = 100;

export function searchQuery(raw: string | undefined): string | null {
  if (!raw) return null;
  const q = foldForSearch(raw.slice(0, QUERY_MAX * 2)).slice(0, QUERY_MAX);
  return q.replace(/\s/g, '').length >= QUERY_MIN ? q : null;
}
