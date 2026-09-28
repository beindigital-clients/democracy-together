import { v } from 'convex/values';
import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server';
import { query } from './_generated/server';
import { searchQuery } from './lib/searchText';
import {
  SEARCH_SOURCES,
  searchFiltersValidator,
  searchHitValidator,
  searchSource,
  searchSourceValidator,
  type SearchHit,
} from './lib/searchSources';

// GLOBAL SEARCH (F-06) AND FULL TEXT (F-34) — on Convex SEARCH
// INDEXES, no longer on full reads filtered in memory.
//
// Before (measured in the campaign report, § 10.2): each keystroke in the palette
// loaded all published publications and all active members, then
// searched for a substring. Fine at twenty documents, linear after that — and
// the palette queries on every keystroke. Now each source reads ITS index
// (`search_text`), on a folded haystack maintained on write
// (`lib/searchText.ts`): "democratie" finds "démocratie" as before,
// but in a bounded index read.
//
// The sources and their visibility rules live in the REGISTRY
// (`lib/searchSources.ts`). This module knows no table. News
// (Sanity) is still searched separately by the /recherche page.

// Results per source in the palette: enough to choose, not an inventory.
const LIMIT = 8;

// `lang`: WRITING language of the publication (that of the registry hit,
// `searchLang ?? languages[0]`, the same rule as the record page). Result
// lists need it to set `lang` on a title that is not in the
// page's language (RGAA 8.7) — so the historical shape carries it too.
const legacyPublication = v.object({
  slug: v.string(),
  title: v.string(),
  type: v.string(),
  lang: v.optional(v.string()),
});
const legacyOrganization = v.object({
  slug: v.string(),
  name: v.string(),
  country: v.string(),
});

function lastSegment(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export const globalSearch = query({
  args: { q: v.string(), filters: v.optional(searchFiltersValidator) },
  returns: v.object({
    // GENERIC sections, in registry order: a source added to the
    // registry appears here without touching this function or its contract.
    sections: v.array(
      v.object({
        source: searchSourceValidator,
        hits: v.array(searchHitValidator),
        more: v.boolean(),
      }),
    ),
    // Historical shape (palette and page from before the registry), kept for
    // existing callers.
    publications: v.array(legacyPublication),
    organizations: v.array(legacyOrganization),
  }),
  handler: async (ctx, { q, filters }) => {
    const needle = searchQuery(q);
    if (!needle) return { sections: [], publications: [], organizations: [] };
    const f = filters ?? {};

    const sections = await Promise.all(
      SEARCH_SOURCES.map(async (source) => {
        const r = await searchSource(ctx, source, needle, f, {
          numItems: LIMIT,
          cursor: null,
          // Several sources in the same query: read via `take`, no
          // pagination (see `pageOf` in convex/lib/searchSources.ts).
          firstPageOnly: true,
        });
        return { source, hits: r.page.slice(0, LIMIT), more: !r.isDone };
      }),
    );
    const hitsOf = (s: string): SearchHit[] =>
      sections.find((x) => x.source === s)?.hits ?? [];

    return {
      sections: sections.filter((s) => s.hits.length > 0),
      publications: hitsOf('publications').map((h) => ({
        slug: lastSegment(h.path),
        title: h.title,
        type: h.kind ?? '',
        lang: h.lang,
      })),
      organizations: hitsOf('organizations').map((h) => ({
        slug: lastSegment(h.path),
        name: h.title,
        country: h.country ?? '',
      })),
    };
  },
});

// PAGINATED results of one source — "voir plus" on the /recherche page.
export const searchBySource = query({
  args: {
    source: searchSourceValidator,
    q: v.string(),
    filters: v.optional(searchFiltersValidator),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(searchHitValidator),
  handler: async (ctx, { source, q, filters, paginationOpts }) => {
    const needle = searchQuery(q);
    if (!needle) return { page: [], isDone: true, continueCursor: '' };
    // Page size bounded server-side: the client does not set the bound.
    const opts = {
      ...paginationOpts,
      numItems: Math.max(1, Math.min(50, paginationOpts.numItems)),
    };
    return await searchSource(ctx, source, needle, filters ?? {}, opts);
  },
});
