// Annuaire des think tanks (F-19) — logique pure, partagée par la query Convex
// et les tests unitaires. Le vocabulaire (régions, thématiques) est stocké en
// *slugs* neutres dans Convex ; les libellés sont traduits côté Next
// (messages `directory.regions` / `directory.themes`) et les noms de pays /
// langues rendus via Intl.DisplayNames. Garder ces listes synchrones avec
// src/messages/*.json.

export const REGIONS = [
  'afrique-ouest',
  'afrique-centrale',
  'afrique-est',
  'afrique-nord',
  'afrique-australe',
  'europe-ouest',
  'europe-est',
] as const;

export const THEMES = [
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

export type Facet = { value: string; count: number };

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
