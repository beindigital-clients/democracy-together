import { v, type Infer } from 'convex/values';
import type { PaginationOptions, PaginationResult } from 'convex/server';
import type { QueryCtx } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';
import { SITE_LOCALES, type SiteLocale } from './locales';
import { foldForSearch } from './searchText';

// REGISTRY OF GLOBAL SEARCH SOURCES (F-06 / F-34).
//
// A SOURCE = a family of searchable public content. Each entry states, for
// its table: how to search (its full-text index, its visibility filter),
// which filters it can honour, and how to project a document into a result.
// `convex/search.ts` only knows this registry: it has no table-specific line.
//
// VISIBILITY RULE — NON-NEGOTIABLE. Each source sets its public status filter
// (`published`, `active`) IN the index read (`.eq('status', …)` on a
// `filterFields`), never after the fact. A draft, a suspended profile, a
// withdrawn post therefore cannot come out, whatever the term or filter
// requested.
//
// ADDING A SOURCE (events, replays… — detailed procedure in
// docs/backlog/diffusion.md § Registre):
//   1. in the table: `searchText: v.optional(v.string())` + a
//      `.searchIndex('search_text', { searchField: 'searchText',
//      filterFields: ['status', …] })`;
//   2. a haystack function in `lib/searchText.ts`, called on EVERY write of
//      the text (insert, correction);
//   3. a `SOURCES.<key>` entry below, and the key in `SEARCH_SOURCES`;
//   4. the table in `searchIndexing.backfill` (backfilling existing data);
//   5. the `search.section_<key>` label in the five catalogues.
// Nothing else: the palette and the /recherche page render any source in the
// registry, in the order of `SEARCH_SOURCES`.

export const SEARCH_SOURCES = [
  'publications',
  'organizations',
  'tribune',
  'experts',
] as const;
export type SearchSourceKey = (typeof SEARCH_SOURCES)[number];
export const searchSourceValidator = v.union(
  ...SEARCH_SOURCES.map((s) => v.literal(s)),
);

// UNIFORM result: the interface does not need to know the shape of tables.
// `path` is the public path WITHOUT a language prefix (the localised link
// prefixes it). Facet fields are neutral slugs, translated on the Next side.
export const searchHitValidator = v.object({
  source: searchSourceValidator,
  id: v.string(),
  title: v.string(),
  path: v.string(),
  kind: v.optional(v.string()),
  theme: v.optional(v.string()),
  lang: v.optional(v.string()),
  region: v.optional(v.string()),
  country: v.optional(v.string()),
  year: v.optional(v.number()),
  count: v.optional(v.number()),
});
export type SearchHit = Infer<typeof searchHitValidator>;

// Results page filters. Each one is an equality carried by a `filterFields`
// of the index — the search remains ONE index read.
export const searchFiltersValidator = v.object({
  type: v.optional(v.string()),
  theme: v.optional(v.string()),
  lang: v.optional(v.string()),
  region: v.optional(v.string()),
  year: v.optional(v.number()),
});
export type SearchFilters = Infer<typeof searchFiltersValidator>;
type FilterKey = keyof SearchFilters;

function isLocale(x: string | undefined): x is SiteLocale {
  return x !== undefined && (SITE_LOCALES as readonly string[]).includes(x);
}

// ONE SINGLE paginated query per function: it is a Convex engine rule ("This
// query or mutation function ran multiple paginated queries"), which
// convex-test does not enforce — measured on 27/09 during the E2E replay: the
// palette no longer rendered anything. The GLOBAL search queries all sources
// in the same query: it therefore reads the first page with `take` (one extra
// row to know whether more remain). Only the page of ONE source ("see more",
// `searchBySource`) truly paginates.
export type SourcePage = PaginationOptions & { firstPageOnly?: boolean };

// ALL WORDS (measured during the E2E replay of 27/09). Convex's full-text
// index returns documents containing AT LEAST ONE of the terms, ranked by
// relevance: "Auto-acceptation E2E 1790…" returned every post containing
// "e2e". The old search required every word; we restore that rule by
// filtering the folded haystack — each term must start a word in it (the
// last one, being typed, like the others). The index is still what bounds
// the read; the filter only removes noise.
export function textMatchesAll(
  searchText: string | undefined,
  needle: string,
): boolean {
  if (!searchText) return false;
  const words = searchText.split(' ');
  return needle
    .split(' ')
    .filter(Boolean)
    .every((t) => words.some((w) => w.startsWith(t)));
}

// Filtered read: we read more rows than the page shows, so that the "all
// words" filter does not empty the first page.
const OVERFETCH = 4;

async function pageOf<T extends { searchText?: string }>(
  q: {
    paginate(p: PaginationOptions): Promise<PaginationResult<T>>;
    take(n: number): Promise<T[]>;
  },
  page: SourcePage,
  needle: string,
): Promise<PaginationResult<T>> {
  const keep = (row: T) => textMatchesAll(row.searchText, needle);
  if (page.firstPageOnly) {
    const want = page.numItems * OVERFETCH + 1;
    const rows = await q.take(want);
    const kept = rows.filter(keep);
    return {
      page: kept.slice(0, page.numItems),
      isDone: kept.length <= page.numItems && rows.length < want,
      continueCursor: '',
    };
  }
  const { firstPageOnly: _ignored, ...opts } = page;
  const r = await q.paginate(opts);
  return { ...r, page: r.page.filter(keep) };
}

type SourceDef = {
  /** Filters the source can honour. A requested filter it does not know
   *  EXCLUDES it from the results: "type = rapport" must not bring back
   *  Tribune posts. */
  filters: readonly FilterKey[];
  search: (
    ctx: QueryCtx,
    needle: string,
    f: SearchFilters,
    page: SourcePage,
  ) => Promise<PaginationResult<SearchHit>>;
};

function mapPage<T>(
  r: PaginationResult<T>,
  f: (x: T) => SearchHit,
): PaginationResult<SearchHit> {
  return { ...r, page: r.page.map(f) };
}

function publicationHit(p: Doc<'publications'>): SearchHit {
  return {
    source: 'publications',
    id: p._id,
    title: p.title,
    path: `/bibliotheque/${p.slug}`,
    kind: p.type,
    theme: p.theme,
    lang: p.searchLang ?? p.languages[0],
    region: p.region,
    year: p.year,
  };
}

// Index read of PUBLISHED publications — shared by the "publications" source
// and the derived "experts" source.
function publicationQuery(ctx: QueryCtx, needle: string, f: SearchFilters) {
  return ctx.db.query('publications').withSearchIndex('search_text', (q) => {
    let s = q.search('searchText', needle).eq('status', 'published');
    if (f.type) s = s.eq('type', f.type as Doc<'publications'>['type']);
    if (f.theme) s = s.eq('theme', f.theme);
    if (f.region) s = s.eq('region', f.region as Doc<'publications'>['region']);
    if (isLocale(f.lang)) s = s.eq('searchLang', f.lang);
    if (f.year !== undefined) s = s.eq('year', f.year);
    return s;
  });
}

// An author name matches if EACH word of the query is the start of one of
// its words ("diop a" finds "Awa Diop") — the same rule as the index.
function nameMatches(name: string, needle: string): boolean {
  const words = foldForSearch(name).split(' ');
  return needle
    .split(' ')
    .filter(Boolean)
    .every((t) => words.some((w) => w.startsWith(t)));
}

const EXPERT_SCAN = 64;
const EXPERT_MAX = 20;

const SOURCES: Record<SearchSourceKey, SourceDef> = {
  publications: {
    filters: ['type', 'theme', 'region', 'lang', 'year'],
    search: async (ctx, needle, f, page) =>
      mapPage(
        await pageOf(publicationQuery(ctx, needle, f), page, needle),
        publicationHit,
      ),
  },

  organizations: {
    filters: ['region'],
    search: async (ctx, needle, f, page) =>
      mapPage(
        await pageOf(
          ctx.db.query('organizations').withSearchIndex('search_text', (q) => {
            const s = q.search('searchText', needle).eq('status', 'active');
            return f.region ? s.eq('region', f.region) : s;
          }),
          page,
          needle,
        ),
        (o) => ({
          source: 'organizations',
          id: o._id,
          title: o.name,
          path: `/le-reseau/${o.slug}`,
          region: o.region,
          country: o.country,
        }),
      ),
  },

  tribune: {
    filters: ['theme', 'lang', 'year'],
    search: async (ctx, needle, f, page) =>
      mapPage(
        await pageOf(
          ctx.db.query('tribunePosts').withSearchIndex('search_text', (q) => {
            let s = q.search('searchText', needle).eq('status', 'published');
            if (f.theme) s = s.eq('theme', f.theme);
            if (isLocale(f.lang)) s = s.eq('lang', f.lang);
            if (f.year !== undefined) s = s.eq('searchYear', f.year);
            return s;
          }),
          page,
          needle,
        ),
        (p) => ({
          source: 'tribune',
          id: p._id,
          title: p.title,
          path: `/tribune/${p._id}`,
          kind: p.format,
          theme: p.theme,
          // WRITING language, for the title's `lang` (RGAA 8.7). A post predating the
          // `lang` field is in French — the fallback used everywhere else (tribune.ts,
          // translation.ts). No effect on the "language" filter, which queries the
          // index, not this field.
          lang: p.lang ?? 'fr',
          year: p.searchYear,
        }),
      ),
  },

  // DERIVED SOURCE. The expert directory (F-23) has no table: an expert is an
  // author of a PUBLISHED publication (convex/experts.ts). We therefore query
  // the publications index — the haystack contains author names — and keep the
  // authors whose name matches. No cursor of its own: a single, bounded page.
  experts: {
    filters: ['theme', 'region', 'year'],
    search: async (ctx, needle, f) => {
      const pubs = await publicationQuery(ctx, needle, f).take(EXPERT_SCAN);
      const byName = new Map<string, { count: number; year: number }>();
      for (const p of pubs) {
        for (const a of p.authors) {
          const name = a.name.trim();
          if (!name || !nameMatches(name, needle)) continue;
          const e = byName.get(name);
          if (e) {
            e.count += 1;
            e.year = Math.max(e.year, p.year);
          } else byName.set(name, { count: 1, year: p.year });
        }
      }
      const page = [...byName.entries()]
        .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
        .slice(0, EXPERT_MAX)
        .map(([name, e]): SearchHit => ({
          source: 'experts',
          id: name,
          title: name,
          path: '/experts',
          count: e.count,
          year: e.year,
        }));
      return { page, isDone: true, continueCursor: '' };
    },
  },
};

/** Can the source honour ALL requested filters? */
export function sourceAccepts(key: SearchSourceKey, f: SearchFilters): boolean {
  const supported = SOURCES[key].filters;
  return (Object.keys(f) as FilterKey[]).every(
    (k) => f[k] === undefined || f[k] === '' || supported.includes(k),
  );
}

export async function searchSource(
  ctx: QueryCtx,
  key: SearchSourceKey,
  needle: string,
  f: SearchFilters,
  page: SourcePage,
): Promise<PaginationResult<SearchHit>> {
  if (!sourceAccepts(key, f)) {
    return { page: [], isDone: true, continueCursor: '' };
  }
  return await SOURCES[key].search(ctx, needle, f, page);
}
