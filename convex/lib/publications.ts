// Library (F-32/F-33/F-34) — pure logic shared by the Convex query and the
// unit tests. The vocabulary (types, themes, regions) is stored as neutral
// *slugs* in Convex; labels are translated on the Next side
// (`library.types` / `library.themes` / `library.regions` messages). Keep
// these lists in sync with src/messages/*.json.

import { v, type Infer } from 'convex/values';

export const PUB_TYPES = [
  'rapport',
  'policy-brief',
  'working-paper',
  'note',
  'dataset',
] as const;

// The network's 5 axes live in ./themes (single declaration, issue #30).
// Re-exported under their historical name so as not to break existing imports
// — same pattern as `slugify`, further down.
export { NETWORK_THEMES as PUB_THEMES } from './themes';

export const PUB_REGIONS = ['afrique', 'europe', 'mondial'] as const;

// Publication languages offered as a facet. MIRROR of `routing.locales`
// (src/i18n/routing.ts), like `locale` in schema.ts: a publication can be
// submitted in any language the site serves.
// `tests/unit/i18n-locales.test.ts` compares the two lists.
export const PUB_LANGS = ['fr', 'en', 'es', 'pt', 'ar'] as const;

export const PUB_ACCESS = ['open', 'members'] as const;

export const PUB_SORTS = ['recent', 'cited', 'az'] as const;

export type PubSort = (typeof PUB_SORTS)[number];

// Multi-select filters (one array per facet, combined with OR within a facet
// and AND across facets — like the checkbox mockup).
export type PublicationFilters = {
  themes?: string[];
  types?: string[];
  regions?: string[];
  langs?: string[];
  access?: string[];
  q?: string;
};

// Minimal shape read by filters / facets (compatible with Doc<'publications'>).
export type PublicationLike = {
  title: string;
  type: string;
  theme: string;
  region: string;
  languages: string[];
  access: string;
  authors: { name: string }[];
  // Summary and key points: searchable since 27/09 (measured: "institutions",
  // present in the summaries, found nothing while the cross-site search
  // /recherche found it there). Optional so that the tests' minimal fixtures
  // remain valid.
  abstract?: string;
  keypoints?: string[];
  year: number;
  publishedAt: number;
  downloads: number;
  citations: number;
};

function has(list: string[] | undefined, value: string): boolean {
  return !list || list.length === 0 || list.includes(value);
}

// Whether a publication matches the given filters. Full-text search covers
// the title, authors, summary and key points, ignoring case, accents and
// quotation marks.
export function matchesPublication(
  pub: PublicationLike,
  f: PublicationFilters,
): boolean {
  if (!has(f.themes, pub.theme)) return false;
  if (!has(f.types, pub.type)) return false;
  if (!has(f.regions, pub.region)) return false;
  if (!has(f.access, pub.access)) return false;
  if (f.langs && f.langs.length > 0) {
    if (!f.langs.some((l) => pub.languages.includes(l))) return false;
  }
  return textMatches(pub, f.q);
}

// Lowercase WITHOUT diacritics: "democratie" must find "démocratie"
// (measured on 27/09: 0 results without the accent, 2 with it). A reader on a
// keyboard without accents — the common case on mobile — must not be
// penalised.
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

// Straight quotes, curly quotes and guillemets: a reader used to search
// engines types `"démocratie"` to search for the exact phrase. Measured on
// 27/09: the quotes were searched LITERALLY, hence zero results. They are
// stripped — substring search is already an exact-phrase search.
const QUOTES = /["'«»“”„‟‹›]/g;

// Search term ready for comparison: folded, without quotes, without
// superfluous whitespace. Empty string = no search.
export function normalizeQuery(raw: string | undefined): string {
  return raw ? fold(raw.replace(QUOTES, ' ')).replace(/\s+/g, ' ').trim() : '';
}

// ONE single haystack for the list and for the facets: the two used to read
// different fields (folded title + authors on one side, unfolded on the
// other), and the facet counters no longer matched the list.
function textMatches(pub: PublicationLike, raw: string | undefined): boolean {
  const q = normalizeQuery(raw);
  if (!q) return true;
  const authors = pub.authors.map((a) => a.name).join(' ');
  const haystack = fold(
    `${pub.title} ${authors} ${pub.abstract ?? ''} ${(pub.keypoints ?? []).join(' ')}`,
  );
  return haystack.includes(q);
}

// Stable sort: most recent (year then downloads), most cited, or A→Z.
export function sortPublications<T extends PublicationLike>(
  items: T[],
  sort: PubSort,
): T[] {
  const out = [...items];
  out.sort((a, b) => {
    if (sort === 'cited') return b.citations - a.citations || b.year - a.year;
    if (sort === 'az') return a.title.localeCompare(b.title, 'fr');
    // 'recent' (default)
    return (
      b.year - a.year ||
      b.publishedAt - a.publishedAt ||
      b.downloads - a.downloads
    );
  });
  return out;
}

export type Facet = { value: string; count: number };

type FacetKey = 'themes' | 'types' | 'regions' | 'langs' | 'access';

// Match on ALL filters EXCEPT a given facet. Used to count a facet's options
// in the context of the OTHER active filters: the facet ignores its own
// selection ("OR" counter: how many each option would add), the other facets
// constrain it ("AND" counter). Full-text search `q` always applies.
function matchesExcept(
  pub: PublicationLike,
  f: PublicationFilters,
  except: FacetKey,
): boolean {
  if (except !== 'themes' && !has(f.themes, pub.theme)) return false;
  if (except !== 'types' && !has(f.types, pub.type)) return false;
  if (except !== 'regions' && !has(f.regions, pub.region)) return false;
  if (except !== 'access' && !has(f.access, pub.access)) return false;
  if (except !== 'langs' && f.langs && f.langs.length > 0) {
    if (!f.langs.some((l) => pub.languages.includes(l))) return false;
  }
  return textMatches(pub, f.q);
}

// "Contextual" facets (faceted search): each option is counted on the subset
// matching the OTHER active filters -> the counter reflects what you actually
// get by ticking it, and dead ends (0) disappear. Values already ticked stay
// listed (even at 0) so they can be unticked — PROVIDED they exist in the
// corpus: a value coming from the URL and unknown to every publication
// (`?theme=zzz`, measured on 27/09: option "Zzz 0" rendered ticked) is not a
// facet, it is ignored.
// With no active filter, we fall back to totals per value.
export function computePublicationFacets(
  items: PublicationLike[],
  f: PublicationFilters = {},
) {
  const tally = (
    list: PublicationLike[],
    pick: (p: PublicationLike) => string[],
    selected: string[] | undefined,
  ): Facet[] => {
    const known = new Set(items.flatMap(pick));
    const counts = new Map<string, number>();
    for (const v of selected ?? []) if (known.has(v)) counts.set(v, 0);
    for (const p of list) {
      for (const value of pick(p)) {
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, count }));
  };
  const sub = (except: FacetKey) =>
    items.filter((p) => matchesExcept(p, f, except));

  return {
    themes: tally(sub('themes'), (p) => [p.theme], f.themes),
    types: tally(sub('types'), (p) => [p.type], f.types),
    regions: tally(sub('regions'), (p) => [p.region], f.regions),
    languages: tally(sub('langs'), (p) => p.languages, f.langs),
    access: tally(sub('access'), (p) => [p.access], f.access),
  };
}

// --- "Members only" gating (F-35) -------------------------------------------
// A publication with `access: 'members'` stays DISCOVERABLE by everyone
// (title, authors, theme, DOI, metadata: needed for SEO and for the decision
// to join) but its CONTENT does not: body hidden, document not served,
// summary cut down to a teaser. The filtering lives here (pure, testable
// logic) and is applied by ALL public queries in convex/publications.ts —
// never by the caller, so that no consumer can forget it.

// Length of the summary teaser served to a non-member.
export const MEMBERS_TEASER_CHARS = 280;

export function isPublicationLocked(
  access: string,
  isMember: boolean,
): boolean {
  return access === 'members' && !isMember;
}

// Summary teaser: cuts on a word boundary (never in the middle of a word),
// strips trailing punctuation, adds an ellipsis. An already short summary is
// returned as is.
export function truncateAbstract(
  abstract: string,
  max: number = MEMBERS_TEASER_CHARS,
): string {
  const text = abstract.trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  // We only back up to the space if a substantial teaser remains, otherwise we
  // cut sharply (case of an abnormally long "word").
  const head = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${head.replace(/[\s,;:.!?–—-]+$/u, '')}…`;
}

// PUBLIC shape of a publication — the only one that leaves the public queries.
//
// It is an ALLOW LIST: any field absent from here cannot leave. That is the
// point of issue #30. The H1 fix (PR #4) had plugged the "members only"
// gating, but `projectPublication` still returned `{ ...pub }`: an OPEN
// publication therefore still served the whole document, including moderation
// notes (`reviewNotes`), internal identifiers (`authorUserId`, `reviewedBy`)
// and the blob identifier (`fileId`). Declaring the fields here makes those
// disappear, and a field added to the schema tomorrow does not leak on its
// own.
//
// The validator is the single source: the TypeScript type is DERIVED from it
// (`Infer`), so the two cannot diverge.
export const publicPublicationValidator = v.object({
  _id: v.id('publications'),
  slug: v.string(),
  title: v.string(),
  type: v.union(
    v.literal('rapport'),
    v.literal('policy-brief'),
    v.literal('working-paper'),
    v.literal('note'),
    v.literal('dataset'),
  ),
  // `theme` stays `v.string()`: the schema itself does not constrain it (seed
  // publications carry themes outside the vocabulary). Tightening it here would
  // make the query FAIL on those documents — this validator's role is to bound
  // the set of FIELDS, not to second-guess the schema's flexibility.
  theme: v.string(),
  region: v.union(
    v.literal('afrique'),
    v.literal('europe'),
    v.literal('mondial'),
  ),
  // Copies the `locale` vocabulary (convex/schema.ts): a publication can be
  // submitted in any language the site serves. This validator BOUNDS the public
  // projection — so it must accept what the schema accepts, otherwise a
  // publication in Spanish would not come out of the query.
  languages: v.array(
    v.union(
      v.literal('fr'),
      v.literal('en'),
      v.literal('es'),
      v.literal('pt'),
      v.literal('ar'),
    ),
  ),
  access: v.union(v.literal('open'), v.literal('members')),
  authors: v.array(
    v.object({ name: v.string(), role: v.optional(v.string()) }),
  ),
  year: v.number(),
  publishedAt: v.number(),
  abstract: v.string(),
  keypoints: v.array(v.string()),
  body: v.array(v.string()),
  doi: v.string(),
  image: v.optional(v.string()),
  license: v.optional(v.string()),
  pages: v.optional(v.number()),
  downloads: v.number(),
  citations: v.number(),
  // Normalised to 0 by the projection: `views` is optional in the database
  // (seed and older data), but the client always expects a number.
  views: v.number(),
  // Added by the projection, absent from the document.
  fileUrl: v.union(v.string(), v.null()),
  locked: v.boolean(),
});

export type PublicPublication = Infer<typeof publicPublicationValidator>;

// Fields the projection READS. Deliberately structural rather than
// `Doc<'publications'>`: unit tests build a document by hand, and lib/ stays
// a pure module.
export type ProjectablePublication = Omit<
  PublicPublication,
  'fileUrl' | 'locked' | 'views'
> & { views?: number };

// Projection served to the client. `locked` is explicit so the UI can show
// the call to join instead of the download buttons.
//
// Explicit enumeration, NEVER `{ ...pub }`: that spread is what leaked the
// whole document. Adding a public field is done here AND in the validator
// above — an omission does not leak, it does not compile.
// `views`: total views to display. Since the counter was isolated
// (`publicationViews` table, issue #8), `pub.views` only carries the legacy
// value — views counted before the split, demo values. A caller that read
// the aggregate passes it here; the others (lists, "same theme" block, where
// the count is not shown) let the projection fall back on it.
export function projectPublication(
  pub: ProjectablePublication,
  fileUrl: string | null,
  isMember: boolean,
  views?: number,
): PublicPublication {
  const base = {
    _id: pub._id,
    slug: pub.slug,
    title: pub.title,
    type: pub.type,
    theme: pub.theme,
    region: pub.region,
    languages: pub.languages,
    access: pub.access,
    authors: pub.authors,
    year: pub.year,
    publishedAt: pub.publishedAt,
    keypoints: pub.keypoints,
    doi: pub.doi,
    image: pub.image,
    license: pub.license,
    pages: pub.pages,
    downloads: pub.downloads,
    citations: pub.citations,
    views: views ?? pub.views ?? 0,
  };
  if (!isPublicationLocked(pub.access, isMember)) {
    return {
      ...base,
      abstract: pub.abstract,
      body: pub.body,
      fileUrl,
      locked: false,
    };
  }
  return {
    ...base,
    abstract: truncateAbstract(pub.abstract),
    body: [],
    fileUrl: null,
    locked: true,
  };
}

// Facets served with the list — same pattern: declared, hence bounded.
export const facetValidator = v.array(
  v.object({ value: v.string(), count: v.number() }),
);

export const publicationFacetsValidator = v.object({
  themes: facetValidator,
  types: facetValidator,
  regions: facetValidator,
  languages: facetValidator,
  access: facetValidator,
});

// URL slug — shared implementation (publications AND member directory).
// Re-exported here so as not to break existing imports.
export { slugify } from './slug';
