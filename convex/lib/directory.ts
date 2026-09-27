// Annuaire des think tanks (F-19) — logique pure, partagée par la query Convex
// et les tests unitaires. Le vocabulaire (régions, thématiques) est stocké en
// *slugs* neutres dans Convex ; les libellés sont traduits côté Next
// (messages `directory.regions` / `directory.themes`) et les noms de pays /
// langues rendus via Intl.DisplayNames. Garder ces listes synchrones avec
// src/messages/*.json.
//
// NB : ces thématiques (domaines d'expertise d'un think tank) ne sont PAS les
// axes du réseau de convex/lib/themes.ts, qui classent publications, billets
// et projets. Deux vocabulaires, deux listes — d'où le nom explicite, le temps
// qu'un `THEMES` nu a coûté en confusion (issue #30).

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

// Validateurs d'arguments — le vocabulaire de l'annuaire est un domaine FERMÉ.
export const directoryRegionValidator = v.union(
  ...REGIONS.map((r) => v.literal(r)),
);
export const directoryThemeValidator = v.union(
  ...DIRECTORY_THEMES.map((t) => v.literal(t)),
);

// Gardes de type — mêmes usages que `isNetworkTheme` : assainir un paramètre
// d'URL avant de le passer à une query dont l'argument est un domaine fermé.
export function isDirectoryRegion(value: string): value is DirectoryRegion {
  return (REGIONS as readonly string[]).includes(value);
}

export function isDirectoryTheme(value: string): value is DirectoryTheme {
  return (DIRECTORY_THEMES as readonly string[]).includes(value);
}

export type DirectoryFilters = {
  region?: string;
  theme?: string;
  // Pays (ISO 3166-1 alpha-2) et langue de travail (ISO 639-1) : les deux
  // filtres que F-19 demandait et que l'interface n'exposait pas (mesuré le
  // 27/09 : région + thématique seulement). Domaine OUVERT côté query — les
  // codes viennent des fiches elles-mêmes, pas d'une liste tenue ici — donc
  // assainis en amont (`isCountryCode` / `isLanguageCode`).
  country?: string;
  language?: string;
  q?: string;
};

// Un code pays / langue plausible : deux ou trois lettres. Sert à ne passer à
// la query qu'une valeur d'URL qui a la forme attendue — le reste vaut « pas
// de filtre », même règle que `region` / `theme`.
const CODE = /^[a-z]{2,3}$/i;
export function isCountryCode(value: string): boolean {
  return CODE.test(value);
}
export function isLanguageCode(value: string): boolean {
  return CODE.test(value);
}

// Langues dans lesquelles le site est servi (miroir de `routing.locales`,
// comme `PUB_LANGS`) : celles dans lesquelles un visiteur peut taper un nom
// de pays.
const SITE_LOCALES = ['fr', 'en', 'es', 'pt', 'ar'] as const;

// Minuscules SANS diacritiques : « senegal » doit trouver « Sénégal », « cote
// d'ivoire » « Côte d'Ivoire » — même règle que la bibliothèque.
export function fold(s: string): string {
  return (
    s
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      // Apostrophe typographique (« Côte d’Ivoire » dans les données ICU) et
      // apostrophe droite du clavier : un seul signe.
      .replace(/[\u2019\u2018]/g, "'")
      .trim()
      .toLowerCase()
  );
}

// Termes sous lesquels un pays peut être cherché : son code ISO ET son nom
// dans chacune des langues du site. Mesuré le 27/09 : « Kenya » ne trouvait
// aucun membre, la meule ne contenant que le nom et la description de la
// fiche (le pays n'y est stocké qu'en code, `KE`). `Intl.DisplayNames` sert
// de table de noms — côté client, `src/lib/orgs.ts#countryName` fait de même
// — et un runtime sans données ICU retombe sur le seul code, jamais sur un
// jet : la recherche dégrade, elle ne casse pas.
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
      // ICU absent ou code hors norme : le code seul reste cherchable.
    }
  }
  const terms = [...names].join(' ');
  countryTermsCache.set(cc, terms);
  return terms;
}

// Meule de recherche d'une fiche : nom + description + pays (code et noms
// localisés), repliée (`fold`). Partagée avec la recherche globale
// (convex/search.ts) pour que « Kenya » trouve le même membre dans la palette
// et dans l'annuaire.
export function organizationHaystack(org: {
  name: string;
  country: string;
  description?: string;
}): string {
  return fold(
    `${org.name} ${org.description ?? ''} ${countryTerms(org.country)}`,
  );
}

// Forme minimale lue par les filtres / facettes (compatible avec Doc<'organizations'>).
type OrgLike = {
  name: string;
  country: string;
  region: string;
  languages: string[];
  themes: string[];
  description?: string;
};

// Un think tank correspond aux filtres fournis (combinés en ET). La recherche
// plein texte porte sur le nom, la description et le pays (code ISO et nom
// dans les langues du site), sans tenir compte de la casse ni des accents.
// Pays et langue se comparent en codes, insensibles à la casse : l'URL peut
// porter `?country=ke` comme `?country=KE`.
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

// Forme PUBLIQUE d'un think tank — liste blanche, même motif que les
// publications (issue #30). `status` n'en fait pas partie : les queries
// publiques ne servent que des fiches actives, donc le champ n'apprend rien au
// client et n'a pas à sortir. `createdAt` et `_creationTime` non plus.
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

// Projection explicite (jamais `{ ...org }`) : un champ ajouté au schéma
// demain ne sort pas tout seul.
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

// Facettes = valeurs présentes dans l'ensemble fourni, avec leur nombre
// d'occurrences, triées par fréquence décroissante puis alphabétiquement.
// Sert à n'afficher que des filtres qui donnent des résultats.
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
