import { countryFlag, countryName } from '@/lib/orgs';
import { vocabulary, type VocabularyTranslator } from '@/i18n/vocabulary';
import { contentLangAttrs } from '@/i18n/content-lang';

// GLOBAL SEARCH RESULTS — rendering shared by the palette and the
// /recherche page (F-06 / F-34, "diffusion" workstream).
//
// The server returns UNIFORM results (`convex/lib/searchSources.ts`):
// path, title, facets as slugs. The UI therefore needs to know nothing about
// a table; a source added to the registry is displayed without any code here,
// its only requirement being its `search.section_<clé>` label.

export type SearchHitLike = {
  source: string;
  title: string;
  path: string;
  kind?: string;
  theme?: string;
  country?: string;
  count?: number;
  lang?: string;
};

type PluralTranslator = (
  key: 'expertCount',
  values: { count: number },
) => string;

/** Small note on the right of a result (type, country, theme, count…). */
export function hitMeta(
  hit: SearchHitLike,
  ctx: {
    library: VocabularyTranslator;
    search: PluralTranslator;
    locale: string;
  },
): string {
  if (hit.source === 'publications' && hit.kind) {
    return vocabulary(ctx.library, 'types.', hit.kind);
  }
  if (hit.source === 'organizations' && hit.country) {
    // The flag is rendered SEPARATELY (`hitFlag`), hidden from assistive technologies.
    return countryName(hit.country, ctx.locale);
  }
  if (hit.source === 'tribune' && hit.theme) {
    return vocabulary(ctx.library, 'themes.', hit.theme);
  }
  if (hit.source === 'experts' && hit.count !== undefined) {
    return ctx.search('expertCount', { count: hit.count });
  }
  return '';
}

/**
 * Flag of a result, to be rendered in an `aria-hidden` next to `hitMeta`:
 * it duplicates the country name, and a screen reader would read it as
 * "drapeau : Sénégal, Sénégal" (RGAA audit of 27/09).
 */
export function hitFlag(hit: SearchHitLike): string {
  return hit.source === 'organizations' && hit.country
    ? countryFlag(hit.country)
    : '';
}

/**
 * `lang`/`dir` of a result's TITLE (RGAA 8.7): an English title in an
 * Arabic page must be read by the English voice and laid out left to right.
 * Only results that have a writing language (publications, posts) carry
 * one; a member's or expert's name is a proper noun, with no language
 * to declare — so we set nothing on it.
 */
export function hitLangAttrs(
  hit: SearchHitLike,
  pageLocale: string,
): { lang?: string; dir?: 'ltr' | 'rtl' } {
  return hit.lang ? contentLangAttrs(hit.lang, pageLocale) : {};
}

// Filters of the results page, read from the URL and SANITIZED: a malformed
// value counts as "no filter" (never an argument error on a public page).
// Closed domains are checked server-side by the index — an unknown value
// simply finds nothing.
export type SearchFiltersParams = {
  type?: string;
  theme?: string;
  lang?: string;
  region?: string;
  year?: number;
};

const SLUG = /^[a-z0-9-]{1,40}$/;

export function parseSearchFilters(
  sp: Record<string, string | string[] | undefined>,
): SearchFiltersParams {
  const one = (k: string) => {
    const v = sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && SLUG.test(s) ? s : undefined;
  };
  const year = Number(one('year'));
  return {
    type: one('type'),
    theme: one('theme'),
    lang: one('lang'),
    region: one('region'),
    year:
      Number.isInteger(year) && year >= 1990 && year <= 2100 ? year : undefined,
  };
}

export function hasFilters(f: SearchFiltersParams): boolean {
  return Object.values(f).some((v) => v !== undefined);
}

/** URL parameters of a search (term, filters, source, cursor). */
export function searchHref(
  q: string,
  f: SearchFiltersParams,
  extra: { source?: string; cursor?: string } = {},
): string {
  const p = new URLSearchParams({ q });
  for (const [k, v] of Object.entries(f)) {
    if (v !== undefined) p.set(k, String(v));
  }
  if (extra.source) p.set('source', extra.source);
  if (extra.cursor) p.set('cursor', extra.cursor);
  return `/recherche?${p.toString()}`;
}
