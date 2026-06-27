// Bibliothèque (F-32/F-33/F-34) — logique pure partagée par la query Convex et
// les tests unitaires. Le vocabulaire (types, thématiques, régions) est stocké
// en *slugs* neutres dans Convex ; les libellés sont traduits côté Next
// (messages `library.types` / `library.themes` / `library.regions`). Garder ces
// listes synchrones avec src/messages/*.json.

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

export type PubSort = (typeof PUB_SORTS)[number];

// Filtres multi-sélection (un tableau par facette, combinés en OU à l'intérieur
// d'une facette et en ET entre facettes — comme la maquette à cases à cocher).
export type PublicationFilters = {
  themes?: string[];
  types?: string[];
  regions?: string[];
  langs?: string[];
  access?: string[];
  q?: string;
};

// Forme minimale lue par les filtres / facettes (compatible Doc<'publications'>).
export type PublicationLike = {
  title: string;
  type: string;
  theme: string;
  region: string;
  languages: string[];
  access: string;
  authors: { name: string }[];
  year: number;
  publishedAt: number;
  downloads: number;
  citations: number;
};

function has(list: string[] | undefined, value: string): boolean {
  return !list || list.length === 0 || list.includes(value);
}

// Une publication correspond aux filtres fournis. La recherche plein texte porte
// sur le titre + les auteurs, sans tenir compte de la casse.
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
  if (f.q) {
    const q = f.q.trim().toLowerCase();
    if (q) {
      const authors = pub.authors.map((a) => a.name).join(' ');
      const haystack = `${pub.title} ${authors}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
  }
  return true;
}

// Tri stable : plus récentes (année puis téléchargements), plus citées, ou A→Z.
export function sortPublications<T extends PublicationLike>(
  items: T[],
  sort: PubSort,
): T[] {
  const out = [...items];
  out.sort((a, b) => {
    if (sort === 'cited') return b.citations - a.citations || b.year - a.year;
    if (sort === 'az') return a.title.localeCompare(b.title, 'fr');
    // 'recent' (défaut)
    return b.year - a.year || b.publishedAt - a.publishedAt || b.downloads - a.downloads;
  });
  return out;
}

export type Facet = { value: string; count: number };

// Facettes = valeurs présentes dans l'ensemble fourni (toutes les publications
// publiées, pas le sous-ensemble filtré) avec leur nombre d'occurrences, triées
// par fréquence décroissante puis alphabétiquement.
export function computePublicationFacets(items: PublicationLike[]) {
  const tally = (pick: (p: PublicationLike) => string[]): Facet[] => {
    const counts = new Map<string, number>();
    for (const p of items) {
      for (const value of pick(p)) {
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, count }));
  };

  return {
    themes: tally((p) => [p.theme]),
    types: tally((p) => [p.type]),
    regions: tally((p) => [p.region]),
    languages: tally((p) => p.languages),
    access: tally((p) => [p.access]),
  };
}

// Slug URL à partir d'un titre (dépôt membre, F-32) : sans accents, minuscules,
// alphanumérique + tirets, borné à ~72 caractères. Pur -> testable. L'unicité
// (suffixe -2, -3…) est gérée par la mutation au moment de l'insertion.
export function slugify(title: string): string {
  const base = title
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72)
    .replace(/-+$/g, '');
  return base || 'publication';
}
