import { intlLocale } from '@/i18n/locale';
// Library (F-32/F-34) — Next-side display helpers: labels via i18n
// (`library` namespace), date formatting, parsing filters from the URL and
// building citations (APA / BibTeX / RIS). The slug vocabulary mirrors
// convex/lib/publications.ts — keep both in sync, EXCEPT the themes, which
// are now imported from their single declaration.

export const PUB_TYPES = [
  'rapport',
  'policy-brief',
  'working-paper',
  'note',
  'dataset',
] as const;
// The network's 5 themes are NO LONGER copied here: they come from the
// single declaration, on the Convex side (issue #30). The `@convex` alias
// resolves the pure modules of convex/lib from Next as well as from Vitest —
// the back-office directory form already does this.
export { NETWORK_THEMES as PUB_THEMES } from '@convex/lib/themes';
export const PUB_REGIONS = ['afrique', 'europe', 'mondial'] as const;
// Same pattern as PUB_THEMES just above: the language list is no longer
// copied here, it comes from its single declaration on the Convex side (issue #30).
export { PUB_LANGS } from '@convex/lib/publications';
export const PUB_ACCESS = ['open', 'members'] as const;
export const PUB_SORTS = ['recent', 'cited', 'az'] as const;

export const FACET_KEYS = [
  'themes',
  'types',
  'regions',
  'langs',
  'access',
] as const;
export type FacetKey = (typeof FACET_KEYS)[number];

// Filters read from the URL: one CSV string per facet -> array of values.
export type LibraryFilters = {
  themes: string[];
  types: string[];
  regions: string[];
  langs: string[];
  access: string[];
  q?: string;
  sort: string;
  page: number;
};

export const PAGE_SIZE = 9;

function csv(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// Parses the searchParams of /bibliotheque into a normalized filters object.
export function parseFilters(
  sp: Record<string, string | string[] | undefined>,
): LibraryFilters {
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim();
  const sortRaw = Array.isArray(sp.sort) ? sp.sort[0] : sp.sort;
  const sort = (PUB_SORTS as readonly string[]).includes(sortRaw ?? '')
    ? (sortRaw as string)
    : 'recent';
  const pageRaw = Number(Array.isArray(sp.page) ? sp.page[0] : sp.page);
  const page =
    Number.isFinite(pageRaw) && pageRaw > 1 ? Math.floor(pageRaw) : 1;
  return {
    themes: csv(sp.theme),
    types: csv(sp.type),
    regions: csv(sp.region),
    langs: csv(sp.lang),
    access: csv(sp.access),
    q: q || undefined,
    sort,
    page,
  };
}

// Maps an internal facet key -> URL parameter name (singular).
const FACET_PARAM: Record<FacetKey, string> = {
  themes: 'theme',
  types: 'type',
  regions: 'region',
  langs: 'lang',
  access: 'access',
};

// Builds the library URL with one facet value toggled
// (added if absent, removed if present). Preserves the other filters;
// resets pagination to 1. next-intl adds the locale prefix.
export function toggleHref(
  filters: LibraryFilters,
  key: FacetKey,
  value: string,
): string {
  const current = filters[key];
  const next = current.includes(value)
    ? current.filter((v) => v !== value)
    : [...current, value];
  const patched: LibraryFilters = { ...filters, [key]: next, page: 1 };
  return buildHref(patched);
}

export function buildHref(f: LibraryFilters): string {
  const sp = new URLSearchParams();
  for (const key of FACET_KEYS) {
    if (f[key].length) sp.set(FACET_PARAM[key], f[key].join(','));
  }
  if (f.q) sp.set('q', f.q);
  if (f.sort && f.sort !== 'recent') sp.set('sort', f.sort);
  if (f.page > 1) sp.set('page', String(f.page));
  const qs = sp.toString();
  return qs ? `/bibliotheque?${qs}` : '/bibliotheque';
}

export function hasActiveFilters(f: LibraryFilters): boolean {
  return Boolean(
    f.themes.length ||
    f.types.length ||
    f.regions.length ||
    f.langs.length ||
    f.access.length ||
    f.q,
  );
}

// Month + year in the current language ("Mai 2026" / "May 2026").
export function formatMonthYear(ts: number, locale: string): string {
  const s = new Intl.DateTimeFormat(intlLocale(locale), {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(ts);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Long date ("15 mai 2026" / "May 15, 2026").
export function formatLongDate(ts: number, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(ts);
}

// --- Author list -------------------------------------------------------------
// "A, B et C" in French, "A, B, and C" in English: the conjunction is not
// the only thing that changes — English also takes a comma before the last
// item. That rule cannot be written by hand: the code that guessed it with a
// ternary on the locale (issue #34) held for two languages at best, and was
// already wrong for one of them. `Intl.ListFormat` handles it for all of
// them, including those the site does not have yet.

function authorListFormat(locale: string): Intl.ListFormat {
  return new Intl.ListFormat(intlLocale(locale), {
    style: 'long',
    type: 'conjunction',
  });
}

// Author list as a single string — for citations.
export function formatAuthorList(names: string[], locale: string): string {
  return authorListFormat(locale).format(names);
}

// Same list, split up: the `element` segments are the names, the `literal`
// segments the separators the language imposes. The publication page puts the
// NAMES in bold and leaves the separators as plain text — hence the need for
// the parts rather than the assembled string.
export function formatAuthorParts(
  names: string[],
  locale: string,
): ReturnType<Intl.ListFormat['formatToParts']> {
  return authorListFormat(locale).formatToParts(names);
}

// --- DOI -----------------------------------------------------------------------
// The library stores an INTERNAL identifier shaped like a DOI
// (`10.59000/dt.<slug>`) but no DOI has been registered with an agency: it must
// never be presented as one, nor linked to doi.org (audit A-2, D-12).
//
// `isRegisteredDoi` is the ONE gate for every place that shows a DOI. The list
// of registered prefixes is empty for now; once the association has registered
// a prefix with a DOI agency, adding it here re-enables the display.
export const REGISTERED_DOI_PREFIXES: readonly string[] = [];

export function isRegisteredDoi(
  doi: string | null | undefined,
  prefixes: readonly string[] = REGISTERED_DOI_PREFIXES,
): doi is string {
  if (!doi) return false;
  return prefixes.some((prefix) => doi.startsWith(`${prefix}/`));
}

// --- Citations ---------------------------------------------------------------
// Authors stored as "First Last" (or an organization name). We detect
// organizations so as not to invert them, and format people as
// "Last, F." (APA) or "Last, First" (BibTeX/RIS).

type Author = { name: string; role?: string };
type CitablePub = {
  title: string;
  authors: Author[];
  year: number;
  doi?: string | null;
  // Permanent link of the publication's page: what a citation points to while
  // there is no registered DOI.
  url: string;
  type: string;
};

const PUBLISHER = 'Democracy Together';

function isOrganisation(name: string): boolean {
  return (
    /équipe|equipe|team|collectif|réseau|reseau|institut|center|centre|observatoire|forum|lab/i.test(
      name,
    ) || name.trim().split(/\s+/).length > 3
  );
}

function splitName(name: string): { surname: string; given: string } {
  const parts = name.trim().split(/\s+/);
  const surname = parts.pop() ?? name;
  return { surname, given: parts.join(' ') };
}

function apaName(name: string): string {
  if (isOrganisation(name)) return name;
  const { surname, given } = splitName(name);
  const initials = given
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => `${p[0].toUpperCase()}.`)
    .join(' ');
  return initials ? `${surname}, ${initials}` : surname;
}

function invertedName(name: string): string {
  if (isOrganisation(name)) return name;
  const { surname, given } = splitName(name);
  return given ? `${surname}, ${given}` : surname;
}

function bibKey(pub: CitablePub): string {
  const titleWord =
    pub.title
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/^(l'|d'|le |la |les |the |a |an )/, '')
      .replace(/[^a-z0-9 ]/g, '')
      .trim()
      .split(/\s+/)[0] || 'pub';
  return `dt${pub.year}${titleWord}`;
}

export type Citations = { apa: string; bibtex: string; ris: string };

export function buildCitations(pub: CitablePub, locale: string): Citations {
  const names = pub.authors.map((a) => a.name);
  // The list punctuation comes from the language the page is READ in, not
  // from the publication's language: it is the sentence around the citation.
  const article = pub.type === 'article';
  const registered = isRegisteredDoi(pub.doi);
  const link = registered ? `https://doi.org/${pub.doi}` : pub.url;
  const apa = article
    ? `${formatAuthorList(names.map(apaName), locale)} (${pub.year}). ${pub.title}. KOHOP, ${PUBLISHER}. ${link}`
    : `${formatAuthorList(names.map(apaName), locale)} (${pub.year}). ${pub.title}. ${PUBLISHER}. ${link}`;

  const entry = article
    ? 'article'
    : pub.type === 'dataset'
      ? 'misc'
      : 'techreport';
  const bibtex = [
    `@${entry}{${bibKey(pub)},`,
    `  author = {${names.map(invertedName).join(' and ')}},`,
    `  title  = {${pub.title}},`,
    article
      ? `  journal = {KOHOP — ${PUBLISHER}},`
      : `  institution = {${PUBLISHER}},`,
    `  year   = {${pub.year}},`,
    registered ? `  doi    = {${pub.doi}}` : `  url    = {${pub.url}}`,
    `}`,
  ].join('\n');

  const ty = article ? 'JOUR' : pub.type === 'dataset' ? 'DATA' : 'RPRT';
  const ris = [
    `TY  - ${ty}`,
    ...names.map((n) => `AU  - ${invertedName(n)}`),
    `TI  - ${pub.title}`,
    `PY  - ${pub.year}`,
    article ? `JO  - KOHOP — ${PUBLISHER}` : `PB  - ${PUBLISHER}`,
    registered ? `DO  - ${pub.doi}` : `UR  - ${pub.url}`,
    `ER  - `,
  ].join('\n');

  return { apa, bibtex, ris };
}
