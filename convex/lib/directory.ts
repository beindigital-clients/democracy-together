// Think tank directory (F-19) — pure logic, shared by the Convex query
// and the unit tests. The vocabulary (regions, themes) is stored as neutral
// *slugs* in Convex; the labels are translated on the Next side
// (`directory.regions` / `directory.themes` messages) and country /
// language names rendered via Intl.DisplayNames. Keep these lists in sync with
// src/messages/*.json.
//
// NB: these themes (a think tank's areas of expertise) are NOT the
// network's themes from convex/lib/themes.ts, which classify publications, posts
// and projects. Two vocabularies, two lists — hence the explicit name, given the
// confusion a bare `THEMES` caused (issue #30).

import { v, type Infer } from 'convex/values';

export const REGIONS = [
  'afrique-ouest',
  'afrique-centrale',
  'afrique-est',
  'afrique-nord',
  'afrique-australe',
  'europe-ouest',
  'europe-est',
] as const;

export const DIRECTORY_THEMES = [
  'gouvernance',
  'elections',
  'droits',
  'paix',
  'medias',
  'jeunesse',
  'genre',
  'numerique',
  'economie',
  'climat',
] as const;

export type DirectoryRegion = (typeof REGIONS)[number];
export type DirectoryTheme = (typeof DIRECTORY_THEMES)[number];

// Argument validators — the directory vocabulary is a CLOSED domain.
export const directoryRegionValidator = v.union(
  ...REGIONS.map((r) => v.literal(r)),
);
export const directoryThemeValidator = v.union(
  ...DIRECTORY_THEMES.map((t) => v.literal(t)),
);

// Type guards — same uses as `isNetworkTheme`: sanitize a URL parameter
// before passing it to a query whose argument is a closed domain.
export function isDirectoryRegion(value: string): value is DirectoryRegion {
  return (REGIONS as readonly string[]).includes(value);
}

export function isDirectoryTheme(value: string): value is DirectoryTheme {
  return (DIRECTORY_THEMES as readonly string[]).includes(value);
}

export type DirectoryFilters = {
  region?: string;
  theme?: string;
  // Country (ISO 3166-1 alpha-2) and working language (ISO 639-1): the two
  // filters F-19 asked for and the interface did not expose (measured on
  // 27/09: region + theme only). OPEN domain on the query side — the
  // codes come from the profiles themselves, not from a list maintained here — hence
  // sanitized upstream (`isCountryCode` / `isLanguageCode`).
  country?: string;
  language?: string;
  q?: string;
};

// A plausible country / language code: two or three letters. Used to pass to
// the query only a URL value that has the expected shape — anything else means "no
// filter", same rule as `region` / `theme`.
const CODE = /^[a-z]{2,3}$/i;
export function isCountryCode(value: string): boolean {
  return CODE.test(value);
}
export function isLanguageCode(value: string): boolean {
  return CODE.test(value);
}

// Languages in which the site is served (mirror of `routing.locales`,
// like `PUB_LANGS`): those in which a visitor may type a country
// name.
const SITE_LOCALES = ['fr', 'en', 'es', 'pt', 'ar'] as const;

// Lowercase WITHOUT diacritics: "senegal" must find "Sénégal", "cote
// d'ivoire" "Côte d'Ivoire" — same rule as the library.
export function fold(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      // Typographic apostrophe ("Côte d’Ivoire" in the ICU data) and the
      // keyboard's straight apostrophe: a single character.
      .replace(/[\u2019\u2018]/g, "'")
      .trim()
      .toLowerCase()
  );
}

// Terms under which a country can be searched: its ISO code AND its name
// in each of the site's languages. Measured on 27/09: "Kenya" found
// no member, the haystack only containing the profile's name and description
// (the country is only stored there as a code, `KE`). `Intl.DisplayNames` serves
// as the name table — on the client side, `src/lib/orgs.ts#countryName` does the same
// — and a runtime without ICU data falls back to the code alone, never to a
// throw: search degrades, it does not break.
const countryTermsCache = new Map<string, string>();
export function countryTerms(code: string): string {
  const cc = code.toUpperCase();
  const cached = countryTermsCache.get(cc);
  if (cached !== undefined) return cached;
  const names = new Set<string>([cc.toLowerCase()]);
  for (const loc of SITE_LOCALES) {
    try {
      const n = new Intl.DisplayNames([loc], {
        type: 'region',
        fallback: 'none',
      }).of(cc);
      if (n && n !== cc) names.add(fold(n));
    } catch {
      // ICU missing or non-standard code: the code alone stays searchable.
    }
  }
  const terms = [...names].join(' ');
  countryTermsCache.set(cc, terms);
  return terms;
}

// Search haystack of a profile: name + description + country (code and localized
// names), folded (`fold`). Shared with global search
// (convex/search.ts) so that "Kenya" finds the same member in the palette
// and in the directory.
export function organizationHaystack(org: {
  name: string;
  country: string;
  description?: string;
}): string {
  return fold(
    `${org.name} ${org.description ?? ''} ${countryTerms(org.country)}`,
  );
}

// Minimal shape read by the filters / facets (compatible with Doc<'organizations'>).
type OrgLike = {
  name: string;
  country: string;
  region: string;
  languages: string[];
  themes: string[];
  description?: string;
};

// A think tank matches the given filters (combined with AND). Full-text
// search covers the name, the description and the country (ISO code and name
// in the site's languages), ignoring case and accents.
// Country and language are compared as codes, case-insensitively: the URL may
// carry `?country=ke` as well as `?country=KE`.
export function matchesFilters(org: OrgLike, f: DirectoryFilters): boolean {
  if (f.region && org.region !== f.region) return false;
  if (f.theme && !org.themes.includes(f.theme)) return false;
  if (f.country && org.country.toLowerCase() !== f.country.toLowerCase()) {
    return false;
  }
  if (f.language) {
    const wanted = f.language.toLowerCase();
    if (!org.languages.some((l) => l.toLowerCase() === wanted)) return false;
  }
  if (f.q) {
    const q = fold(f.q);
    if (q && !organizationHaystack(org).includes(q)) return false;
  }
  return true;
}

// PUBLIC shape of a think tank — allowlist, same pattern as
// publications (issue #30). `status` is not part of it: public queries
// only serve active profiles, so the field teaches the client nothing
// and need not go out. Nor `createdAt` and `_creationTime`.
export const publicOrganizationValidator = v.object({
  _id: v.id('organizations'),
  name: v.string(),
  slug: v.string(),
  country: v.string(),
  region: v.string(),
  languages: v.array(v.string()),
  themes: v.array(v.string()),
  description: v.optional(v.string()),
  websiteUrl: v.optional(v.string()),
});

export type PublicOrganization = Infer<typeof publicOrganizationValidator>;

// Explicit projection (never `{ ...org }`): a field added to the schema
// tomorrow does not leak out on its own.
export function projectOrganization(org: {
  _id: PublicOrganization['_id'];
  name: string;
  slug: string;
  country: string;
  region: string;
  languages: string[];
  themes: string[];
  description?: string;
  websiteUrl?: string;
}): PublicOrganization {
  return {
    _id: org._id,
    name: org.name,
    slug: org.slug,
    country: org.country,
    region: org.region,
    languages: org.languages,
    themes: org.themes,
    description: org.description,
    websiteUrl: org.websiteUrl,
  };
}

export type Facet = { value: string; count: number };

export const facetValidator = v.array(
  v.object({ value: v.string(), count: v.number() }),
);

export const directoryFacetsValidator = v.object({
  regions: facetValidator,
  themes: facetValidator,
  countries: facetValidator,
  languages: facetValidator,
});

// Facets = values present in the given set, with their number of
// occurrences, sorted by decreasing frequency then alphabetically.
// Used to display only filters that yield results.
export function computeFacets(orgs: OrgLike[]) {
  const tally = (pick: (o: OrgLike) => string[]): Facet[] => {
    const counts = new Map<string, number>();
    for (const o of orgs) {
      for (const value of pick(o)) {
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, count }));
  };

  return {
    regions: tally((o) => [o.region]),
    themes: tally((o) => o.themes),
    countries: tally((o) => [o.country]),
    languages: tally((o) => o.languages),
  };
}
