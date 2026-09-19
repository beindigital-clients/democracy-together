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

type FacetKey = 'themes' | 'types' | 'regions' | 'langs' | 'access';

// Correspondance à TOUS les filtres SAUF une facette donnée. Sert à compter les
// options d'une facette dans le contexte des AUTRES filtres actifs : la facette
// ignore sa propre sélection (compteur « OU » : combien chaque option
// ajouterait), les autres facettes la contraignent (compteur « ET »). La
// recherche plein texte `q` s'applique toujours.
function matchesExcept(
  pub: PublicationLike,
  f: PublicationFilters,
  except: FacetKey,
): boolean {
  if (except !== 'themes' && !has(f.themes, pub.theme)) return false;
  if (except !== 'types' && !has(f.types, pub.type)) return false;
  if (except !== 'regions' && !has(f.regions, pub.region)) return false;
  if (except !== 'access' && !has(f.access, pub.access)) return false;
  if (except !== 'langs' && f.langs && f.langs.length > 0) {
    if (!f.langs.some((l) => pub.languages.includes(l))) return false;
  }
  if (f.q) {
    const q = f.q.trim().toLowerCase();
    if (q) {
      const authors = pub.authors.map((a) => a.name).join(' ');
      if (!`${pub.title} ${authors}`.toLowerCase().includes(q)) return false;
    }
  }
  return true;
}

// Facettes « contextuelles » (faceted search) : chaque option est comptée sur le
// sous-ensemble correspondant aux AUTRES filtres actifs -> le compteur reflète
// ce qu'on obtient réellement en cochant, et les impasses (0) disparaissent. Les
// valeurs déjà cochées restent listées (même à 0) pour rester décochables.
// Sans filtre actif, on retombe sur les totaux par valeur.
export function computePublicationFacets(
  items: PublicationLike[],
  f: PublicationFilters = {},
) {
  const tally = (
    list: PublicationLike[],
    pick: (p: PublicationLike) => string[],
    selected: string[] | undefined,
  ): Facet[] => {
    const counts = new Map<string, number>();
    for (const v of selected ?? []) counts.set(v, 0);
    for (const p of list) {
      for (const value of pick(p)) {
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, count }));
  };
  const sub = (except: FacetKey) =>
    items.filter((p) => matchesExcept(p, f, except));

  return {
    themes: tally(sub('themes'), (p) => [p.theme], f.themes),
    types: tally(sub('types'), (p) => [p.type], f.types),
    regions: tally(sub('regions'), (p) => [p.region], f.regions),
    languages: tally(sub('langs'), (p) => p.languages, f.langs),
    access: tally(sub('access'), (p) => [p.access], f.access),
  };
}

// --- Gating « réservé aux membres » (F-35) ----------------------------------
// Une publication `access: 'members'` reste DÉCOUVRABLE par tout le monde (titre,
// auteurs, thème, DOI, métadonnées : nécessaire au SEO et à la décision
// d'adhérer) mais son CONTENU ne l'est pas : corps masqué, document non servi,
// résumé réduit à une amorce. Le filtrage vit ici (logique pure, testable) et
// est appliqué par TOUTES les queries publiques de convex/publications.ts —
// jamais chez l'appelant, pour qu'aucun consommateur ne puisse l'oublier.

// Longueur de l'amorce de résumé servie à un non-membre.
export const MEMBERS_TEASER_CHARS = 280;

export function isPublicationLocked(
  access: string,
  isMember: boolean,
): boolean {
  return access === 'members' && !isMember;
}

// Amorce de résumé : coupe sur une frontière de mot (jamais au milieu d'un mot),
// retire la ponctuation de fin, ajoute une ellipse. Un résumé déjà court est
// renvoyé tel quel.
export function truncateAbstract(
  abstract: string,
  max: number = MEMBERS_TEASER_CHARS,
): string {
  const text = abstract.trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  // On ne recule jusqu'à l'espace que s'il reste une amorce substantielle,
  // sinon on coupe net (cas d'un « mot » anormalement long).
  const head = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${head.replace(/[\s,;:.!?–—-]+$/u, '')}…`;
}

export type PublicationAccessView<T> = T & {
  fileUrl: string | null;
  locked: boolean;
};

// Projection servie au client. `locked` est explicite pour que l'UI puisse
// afficher l'appel à l'adhésion au lieu des boutons de téléchargement.
export function projectPublication<
  T extends { access: string; abstract: string; body: string[] },
>(pub: T, fileUrl: string | null, isMember: boolean): PublicationAccessView<T> {
  if (!isPublicationLocked(pub.access, isMember)) {
    return { ...pub, fileUrl, locked: false };
  }
  return {
    ...pub,
    abstract: truncateAbstract(pub.abstract),
    body: [],
    fileUrl: null,
    locked: true,
  };
}

// Slug URL — implémentation partagée (publications ET annuaire des membres).
// Ré-exporté ici pour ne pas casser les imports existants.
export { slugify } from './slug';
