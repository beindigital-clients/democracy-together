// Bibliothèque (F-32/F-33/F-34) — logique pure partagée par la query Convex et
// les tests unitaires. Le vocabulaire (types, thématiques, régions) est stocké
// en *slugs* neutres dans Convex ; les libellés sont traduits côté Next
// (messages `library.types` / `library.themes` / `library.regions`). Garder ces
// listes synchrones avec src/messages/*.json.

import { v, type Infer } from 'convex/values';

export const PUB_TYPES = [
  'rapport',
  'policy-brief',
  'working-paper',
  'note',
  'dataset',
] as const;

// Les 5 axes du réseau vivent dans ./themes (déclaration unique, issue #30).
// Ré-exportés sous leur nom historique pour ne pas casser les imports existants
// — même motif que `slugify`, plus bas.
export { NETWORK_THEMES as PUB_THEMES } from './themes';

export const PUB_REGIONS = ['afrique', 'europe', 'mondial'] as const;

// Langues de publication proposées en facette. MIROIR de `routing.locales`
// (src/i18n/routing.ts), comme `locale` dans schema.ts : une publication peut
// être déposée dans n'importe quelle langue servie par le site.
// `tests/unit/i18n-locales.test.ts` compare les deux listes.
export const PUB_LANGS = ['fr', 'en', 'es', 'pt', 'ar'] as const;

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
  // Résumé et points clés : cherchables depuis le 27/09 (mesuré :
  // « institutions », présent dans les résumés, ne trouvait rien alors que la
  // recherche transverse /recherche l'y trouvait). Optionnels pour que les
  // fixtures minimales des tests restent valides.
  abstract?: string;
  keypoints?: string[];
  year: number;
  publishedAt: number;
  downloads: number;
  citations: number;
};

function has(list: string[] | undefined, value: string): boolean {
  return !list || list.length === 0 || list.includes(value);
}

// Une publication correspond aux filtres fournis. La recherche plein texte porte
// sur le titre, les auteurs, le résumé et les points clés, sans tenir compte
// de la casse, des accents ni des guillemets.
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
  return textMatches(pub, f.q);
}

// Minuscules SANS diacritiques : « democratie » doit trouver « démocratie »
// (mesuré le 27/09 : 0 résultat sans l'accent, 2 avec). Un lecteur sur un
// clavier sans accents — le cas courant en mobile — ne doit pas être puni.
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

// Guillemets droits, typographiques et chevrons : un lecteur habitué aux
// moteurs tape `"démocratie"` pour chercher l'expression exacte. Mesuré le
// 27/09 : les guillemets étaient cherchés LITTÉRALEMENT, donc zéro résultat.
// Ils sont retirés — la recherche par sous-chaîne est déjà une recherche
// d'expression exacte.
const QUOTES = /["'«»“”„‟‹›]/g;

// Terme de recherche prêt à comparer : replié, sans guillemets, sans blancs
// superflus. Chaîne vide = pas de recherche.
export function normalizeQuery(raw: string | undefined): string {
  return raw ? fold(raw.replace(QUOTES, ' ')).replace(/\s+/g, ' ').trim() : '';
}

// UNE seule meule pour la liste et pour les facettes : les deux lisaient des
// champs différents (titre + auteurs repliés d'un côté, sans repli de
// l'autre), et les compteurs de facettes ne correspondaient plus à la liste.
function textMatches(pub: PublicationLike, raw: string | undefined): boolean {
  const q = normalizeQuery(raw);
  if (!q) return true;
  const authors = pub.authors.map((a) => a.name).join(' ');
  const haystack = fold(
    `${pub.title} ${authors} ${pub.abstract ?? ''} ${(pub.keypoints ?? []).join(' ')}`,
  );
  return haystack.includes(q);
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
    return (
      b.year - a.year ||
      b.publishedAt - a.publishedAt ||
      b.downloads - a.downloads
    );
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
  return textMatches(pub, f.q);
}

// Facettes « contextuelles » (faceted search) : chaque option est comptée sur le
// sous-ensemble correspondant aux AUTRES filtres actifs -> le compteur reflète
// ce qu'on obtient réellement en cochant, et les impasses (0) disparaissent. Les
// valeurs déjà cochées restent listées (même à 0) pour rester décochables —
// À CONDITION d'exister dans le corpus : une valeur venue de l'URL et
// inconnue de toute publication (`?theme=zzz`, mesuré le 27/09 : option
// « Zzz 0 » rendue cochée) n'est pas une facette, elle est ignorée.
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
    const known = new Set(items.flatMap(pick));
    const counts = new Map<string, number>();
    for (const v of selected ?? []) if (known.has(v)) counts.set(v, 0);
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

// Forme PUBLIQUE d'une publication — la seule qui sorte des queries publiques.
//
// C'est une liste BLANCHE : tout champ absent d'ici ne peut pas sortir. C'est le
// point de l'issue #30. Le correctif H1 (PR #4) avait bouché le gating « réservé
// aux membres », mais `projectPublication` renvoyait toujours `{ ...pub }` : une
// publication OUVERTE servait donc encore le document entier, notes de
// modération (`reviewNotes`), identifiants internes (`authorUserId`,
// `reviewedBy`) et identifiant de blob (`fileId`) compris. Les déclarer ici les
// fait disparaître, et un champ ajouté demain au schéma ne sort pas tout seul.
//
// Le validateur est la source unique : le type TypeScript en est DÉDUIT
// (`Infer`), donc les deux ne peuvent pas diverger.
export const publicPublicationValidator = v.object({
  _id: v.id('publications'),
  slug: v.string(),
  title: v.string(),
  type: v.union(
    v.literal('rapport'),
    v.literal('policy-brief'),
    v.literal('working-paper'),
    v.literal('note'),
    v.literal('dataset'),
  ),
  // `theme` reste `v.string()` : le schéma lui-même ne le contraint pas (des
  // publications de seed portent des thèmes hors vocabulaire). Resserrer ici
  // ferait ÉCHOUER la query sur ces documents — le rôle de ce validateur est de
  // borner l'ensemble des CHAMPS, pas de rejuger la souplesse du schéma.
  theme: v.string(),
  region: v.union(
    v.literal('afrique'),
    v.literal('europe'),
    v.literal('mondial'),
  ),
  // Recopie le vocabulaire de `locale` (convex/schema.ts) : une publication
  // peut être déposée dans n'importe quelle langue servie par le site. Ce
  // validateur BORNE la projection publique — il doit donc accepter ce que le
  // schéma accepte, sans quoi une publication en espagnol ne sortirait pas de
  // la query.
  languages: v.array(
    v.union(
      v.literal('fr'),
      v.literal('en'),
      v.literal('es'),
      v.literal('pt'),
      v.literal('ar'),
    ),
  ),
  access: v.union(v.literal('open'), v.literal('members')),
  authors: v.array(
    v.object({ name: v.string(), role: v.optional(v.string()) }),
  ),
  year: v.number(),
  publishedAt: v.number(),
  abstract: v.string(),
  keypoints: v.array(v.string()),
  body: v.array(v.string()),
  doi: v.string(),
  image: v.optional(v.string()),
  license: v.optional(v.string()),
  pages: v.optional(v.number()),
  downloads: v.number(),
  citations: v.number(),
  // Normalisé à 0 par la projection : `views` est optionnel en base (seed et
  // données anciennes), mais le client compte toujours sur un nombre.
  views: v.number(),
  // Ajoutés par la projection, absents du document.
  fileUrl: v.union(v.string(), v.null()),
  locked: v.boolean(),
});

export type PublicPublication = Infer<typeof publicPublicationValidator>;

// Champs que la projection LIT. Volontairement structurel plutôt que
// `Doc<'publications'>` : les tests unitaires construisent un document à la
// main, et lib/ reste un module pur.
export type ProjectablePublication = Omit<
  PublicPublication,
  'fileUrl' | 'locked' | 'views'
> & { views?: number };

// Projection servie au client. `locked` est explicite pour que l'UI puisse
// afficher l'appel à l'adhésion au lieu des boutons de téléchargement.
//
// Énumération explicite, JAMAIS `{ ...pub }` : c'est ce spread qui faisait
// sortir le document entier. Ajouter un champ public se fait ici ET dans le
// validateur ci-dessus — un oubli ne fuite pas, il ne compile pas.
// `views` : total de consultations à afficher. Depuis l'isolement du compteur
// (table `publicationViews`, issue #8), `pub.views` ne porte plus que l'héritage
// — vues comptées avant le découpage, valeurs de démonstration. L'appelant qui
// a lu l'agrégat le passe ici ; les autres (listes, bloc « même thématique »,
// où le décompte n'est pas affiché) laissent la projection retomber dessus.
export function projectPublication(
  pub: ProjectablePublication,
  fileUrl: string | null,
  isMember: boolean,
  views?: number,
): PublicPublication {
  const base = {
    _id: pub._id,
    slug: pub.slug,
    title: pub.title,
    type: pub.type,
    theme: pub.theme,
    region: pub.region,
    languages: pub.languages,
    access: pub.access,
    authors: pub.authors,
    year: pub.year,
    publishedAt: pub.publishedAt,
    keypoints: pub.keypoints,
    doi: pub.doi,
    image: pub.image,
    license: pub.license,
    pages: pub.pages,
    downloads: pub.downloads,
    citations: pub.citations,
    views: views ?? pub.views ?? 0,
  };
  if (!isPublicationLocked(pub.access, isMember)) {
    return {
      ...base,
      abstract: pub.abstract,
      body: pub.body,
      fileUrl,
      locked: false,
    };
  }
  return {
    ...base,
    abstract: truncateAbstract(pub.abstract),
    body: [],
    fileUrl: null,
    locked: true,
  };
}

// Facettes servies avec la liste — même motif : déclarées, donc bornées.
export const facetValidator = v.array(
  v.object({ value: v.string(), count: v.number() }),
);

export const publicationFacetsValidator = v.object({
  themes: facetValidator,
  types: facetValidator,
  regions: facetValidator,
  languages: facetValidator,
  access: facetValidator,
});

// Slug URL — implémentation partagée (publications ET annuaire des membres).
// Ré-exporté ici pour ne pas casser les imports existants.
export { slugify } from './slug';
