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
  q?: string;
};

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
// plein texte porte sur le nom + la description, sans tenir compte de la casse.
export function matchesFilters(org: OrgLike, f: DirectoryFilters): boolean {
  if (f.region && org.region !== f.region) return false;
  if (f.theme && !org.themes.includes(f.theme)) return false;
  if (f.q) {
    const q = f.q.trim().toLowerCase();
    if (q) {
      const haystack = `${org.name} ${org.description ?? ''}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
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
