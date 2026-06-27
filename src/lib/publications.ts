// Bibliothèque (F-32/F-34) — helpers d'affichage côté Next : libellés via i18n
// (namespace `library`), formatage de date, parsing des filtres depuis l'URL et
// construction des citations (APA / BibTeX / RIS). Le vocabulaire de slugs est
// le miroir de convex/lib/publications.ts — garder les deux synchrones.

export const PUB_TYPES = [
  'rapport',
  'policy-brief',
  'working-paper',
  'note',
  'dataset',
] as const;
export const PUB_THEMES = [
  'gouvernance-numerique',
  'participation',
  'anti-corruption',
  'transitions',
  'crises',
] as const;
export const PUB_REGIONS = ['afrique', 'europe', 'mondial'] as const;
export const PUB_LANGS = ['fr', 'en'] as const;
export const PUB_ACCESS = ['open', 'members'] as const;
export const PUB_SORTS = ['recent', 'cited', 'az'] as const;

export const FACET_KEYS = ['themes', 'types', 'regions', 'langs', 'access'] as const;
export type FacetKey = (typeof FACET_KEYS)[number];

// Filtres lus depuis l'URL : une chaîne CSV par facette -> tableau de valeurs.
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

// Parse les searchParams de /bibliotheque en un objet de filtres normalisé.
export function parseFilters(
  sp: Record<string, string | string[] | undefined>,
): LibraryFilters {
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim();
  const sortRaw = Array.isArray(sp.sort) ? sp.sort[0] : sp.sort;
  const sort = (PUB_SORTS as readonly string[]).includes(sortRaw ?? '')
    ? (sortRaw as string)
    : 'recent';
  const pageRaw = Number(Array.isArray(sp.page) ? sp.page[0] : sp.page);
  const page = Number.isFinite(pageRaw) && pageRaw > 1 ? Math.floor(pageRaw) : 1;
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

// Mappe une clé de facette interne -> nom du paramètre d'URL (singulier).
const FACET_PARAM: Record<FacetKey, string> = {
  themes: 'theme',
  types: 'type',
  regions: 'region',
  langs: 'lang',
  access: 'access',
};

// Construit l'URL de la bibliothèque avec une valeur de facette basculée
// (ajoutée si absente, retirée si présente). Préserve les autres filtres ;
// remet la pagination à 1. next-intl ajoute le préfixe de locale.
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

// Mois + année dans la langue courante ("Mai 2026" / "May 2026").
export function formatMonthYear(ts: number, locale: string): string {
  const s = new Intl.DateTimeFormat(locale, {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(ts);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Date longue ("15 mai 2026" / "May 15, 2026").
export function formatLongDate(ts: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(ts);
}

// --- Citations ---------------------------------------------------------------
// Auteurs stockés "Prénom Nom" (ou nom d'organisation). On détecte les
// organisations pour ne pas les inverser, et on formate les personnes en
// "Nom, P." (APA) ou "Nom, Prénom" (BibTeX/RIS).

type Author = { name: string; role?: string };
type CitablePub = {
  title: string;
  authors: Author[];
  year: number;
  doi: string;
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

function joinAuthors(names: string[], conj: string): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} ${conj} ${names[names.length - 1]}`;
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
  const conj = locale === 'en' ? 'and' : 'et';
  const names = pub.authors.map((a) => a.name);
  const apa = `${joinAuthors(names.map(apaName), conj)} (${pub.year}). ${pub.title}. ${PUBLISHER}. https://doi.org/${pub.doi}`;

  const entry = pub.type === 'dataset' ? 'misc' : 'techreport';
  const bibtex = [
    `@${entry}{${bibKey(pub)},`,
    `  author = {${names.map(invertedName).join(' and ')}},`,
    `  title  = {${pub.title}},`,
    `  institution = {${PUBLISHER}},`,
    `  year   = {${pub.year}},`,
    `  doi    = {${pub.doi}}`,
    `}`,
  ].join('\n');

  const ty = pub.type === 'dataset' ? 'DATA' : 'RPRT';
  const ris = [
    `TY  - ${ty}`,
    ...names.map((n) => `AU  - ${invertedName(n)}`),
    `TI  - ${pub.title}`,
    `PY  - ${pub.year}`,
    `PB  - ${PUBLISHER}`,
    `DO  - ${pub.doi}`,
    `ER  - `,
  ].join('\n');

  return { apa, bibtex, ris };
}
