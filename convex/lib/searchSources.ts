import { v, type Infer } from 'convex/values';
import type { PaginationOptions, PaginationResult } from 'convex/server';
import type { QueryCtx } from '../_generated/server';
import type { Doc } from '../_generated/dataModel';
import { SITE_LOCALES, type SiteLocale } from './locales';
import { foldForSearch } from './searchText';

// REGISTRE DES SOURCES DE LA RECHERCHE GLOBALE (F-06 / F-34).
//
// Une SOURCE = une famille de contenus publics cherchables. Chaque entrée dit,
// pour sa table : comment chercher (son index plein texte, son filtre de
// visibilité), quels filtres elle sait honorer, et comment projeter un
// document en résultat. `convex/search.ts` ne connaît que ce registre : il
// n'a aucune ligne propre à une table.
//
// RÈGLE DE VISIBILITÉ — NON NÉGOCIABLE. Chaque source fixe son filtre de
// statut public (`published`, `active`) DANS la lecture d'index
// (`.eq('status', …)` d'un `filterFields`), jamais après coup. Un brouillon,
// une fiche suspendue, un billet retiré ne peuvent donc pas sortir, quel que
// soit le terme ou le filtre demandé.
//
// AJOUTER UNE SOURCE (événements, replays… — procédure détaillée dans
// docs/backlog/diffusion.md § Registre) :
//   1. dans la table : `searchText: v.optional(v.string())` + un
//      `.searchIndex('search_text', { searchField: 'searchText',
//      filterFields: ['status', …] })` ;
//   2. une fonction de meule dans `lib/searchText.ts`, appelée à CHAQUE
//      écriture du texte (insertion, correction) ;
//   3. une entrée `SOURCES.<clé>` ci-dessous, et la clé dans `SEARCH_SOURCES` ;
//   4. la table dans `searchIndexing.backfill` (remplissage de l'existant) ;
//   5. le libellé `search.section_<clé>` dans les cinq catalogues.
// Rien d'autre : la palette et la page /recherche rendent toute source du
// registre, dans l'ordre de `SEARCH_SOURCES`.

export const SEARCH_SOURCES = [
  'publications',
  'organizations',
  'tribune',
  'experts',
] as const;
export type SearchSourceKey = (typeof SEARCH_SOURCES)[number];
export const searchSourceValidator = v.union(
  ...SEARCH_SOURCES.map((s) => v.literal(s)),
);

// Résultat UNIFORME : l'interface n'a pas à connaître la forme des tables.
// `path` est le chemin public SANS préfixe de langue (le lien localisé le
// préfixe). Les champs de facette sont des slugs neutres, traduits côté Next.
export const searchHitValidator = v.object({
  source: searchSourceValidator,
  id: v.string(),
  title: v.string(),
  path: v.string(),
  kind: v.optional(v.string()),
  theme: v.optional(v.string()),
  lang: v.optional(v.string()),
  region: v.optional(v.string()),
  country: v.optional(v.string()),
  year: v.optional(v.number()),
  count: v.optional(v.number()),
});
export type SearchHit = Infer<typeof searchHitValidator>;

// Filtres de la page de résultats. Chacun est une égalité portée par un
// `filterFields` de l'index — la recherche reste UNE lecture d'index.
export const searchFiltersValidator = v.object({
  type: v.optional(v.string()),
  theme: v.optional(v.string()),
  lang: v.optional(v.string()),
  region: v.optional(v.string()),
  year: v.optional(v.number()),
});
export type SearchFilters = Infer<typeof searchFiltersValidator>;
type FilterKey = keyof SearchFilters;

function isLocale(x: string | undefined): x is SiteLocale {
  return x !== undefined && (SITE_LOCALES as readonly string[]).includes(x);
}

// UNE SEULE requête paginée par fonction : c'est une règle du moteur Convex
// (« This query or mutation function ran multiple paginated queries »), que
// convex-test n'applique pas — mesuré le 27/09 au rejeu E2E : la palette ne
// rendait plus rien. La recherche GLOBALE interroge toutes les sources dans
// la même query : elle lit donc la première page par `take` (une ligne de
// plus pour savoir s'il en reste). Seule la page d'UNE source (« voir
// plus », `searchBySource`) pagine vraiment.
export type SourcePage = PaginationOptions & { firstPageOnly?: boolean };

// TOUS LES MOTS (mesuré au rejeu E2E du 27/09). L'index plein texte de
// Convex rend les documents qui contiennent AU MOINS UN des termes, classés
// par pertinence : « Auto-acceptation E2E 1790… » ramenait tout billet
// contenant « e2e ». L'ancienne recherche exigeait chaque mot ; on rétablit
// cette règle en filtrant la meule pliée — chaque terme doit y commencer un
// mot (le dernier, en cours de frappe, comme les autres). L'index reste ce
// qui borne la lecture ; le filtre ne fait que retirer le bruit.
export function textMatchesAll(
  searchText: string | undefined,
  needle: string,
): boolean {
  if (!searchText) return false;
  const words = searchText.split(' ');
  return needle
    .split(' ')
    .filter(Boolean)
    .every((t) => words.some((w) => w.startsWith(t)));
}

// Lecture filtrée : on lit davantage de lignes que la page n'en montre, pour
// que le filtre « tous les mots » ne vide pas la première page.
const OVERFETCH = 4;

async function pageOf<T extends { searchText?: string }>(
  q: {
    paginate(p: PaginationOptions): Promise<PaginationResult<T>>;
    take(n: number): Promise<T[]>;
  },
  page: SourcePage,
  needle: string,
): Promise<PaginationResult<T>> {
  const keep = (row: T) => textMatchesAll(row.searchText, needle);
  if (page.firstPageOnly) {
    const want = page.numItems * OVERFETCH + 1;
    const rows = await q.take(want);
    const kept = rows.filter(keep);
    return {
      page: kept.slice(0, page.numItems),
      isDone: kept.length <= page.numItems && rows.length < want,
      continueCursor: '',
    };
  }
  const { firstPageOnly: _ignored, ...opts } = page;
  const r = await q.paginate(opts);
  return { ...r, page: r.page.filter(keep) };
}

type SourceDef = {
  /** Filtres que la source sait honorer. Un filtre demandé qu'elle ne
   *  connaît pas l'EXCLUT des résultats : « type = rapport » ne doit pas
   *  ramener de billets de la Tribune. */
  filters: readonly FilterKey[];
  search: (
    ctx: QueryCtx,
    needle: string,
    f: SearchFilters,
    page: SourcePage,
  ) => Promise<PaginationResult<SearchHit>>;
};

function mapPage<T>(
  r: PaginationResult<T>,
  f: (x: T) => SearchHit,
): PaginationResult<SearchHit> {
  return { ...r, page: r.page.map(f) };
}

function publicationHit(p: Doc<'publications'>): SearchHit {
  return {
    source: 'publications',
    id: p._id,
    title: p.title,
    path: `/bibliotheque/${p.slug}`,
    kind: p.type,
    theme: p.theme,
    lang: p.searchLang ?? p.languages[0],
    region: p.region,
    year: p.year,
  };
}

// Lecture d'index des publications PUBLIÉES — partagée par la source
// « publications » et la source dérivée « experts ».
function publicationQuery(ctx: QueryCtx, needle: string, f: SearchFilters) {
  return ctx.db.query('publications').withSearchIndex('search_text', (q) => {
    let s = q.search('searchText', needle).eq('status', 'published');
    if (f.type) s = s.eq('type', f.type as Doc<'publications'>['type']);
    if (f.theme) s = s.eq('theme', f.theme);
    if (f.region) s = s.eq('region', f.region as Doc<'publications'>['region']);
    if (isLocale(f.lang)) s = s.eq('searchLang', f.lang);
    if (f.year !== undefined) s = s.eq('year', f.year);
    return s;
  });
}

// Un nom d'auteur correspond si CHAQUE mot de la requête est le début d'un
// de ses mots (« diop a » trouve « Awa Diop ») — la même règle que l'index.
function nameMatches(name: string, needle: string): boolean {
  const words = foldForSearch(name).split(' ');
  return needle
    .split(' ')
    .filter(Boolean)
    .every((t) => words.some((w) => w.startsWith(t)));
}

const EXPERT_SCAN = 64;
const EXPERT_MAX = 20;

const SOURCES: Record<SearchSourceKey, SourceDef> = {
  publications: {
    filters: ['type', 'theme', 'region', 'lang', 'year'],
    search: async (ctx, needle, f, page) =>
      mapPage(
        await pageOf(publicationQuery(ctx, needle, f), page, needle),
        publicationHit,
      ),
  },

  organizations: {
    filters: ['region'],
    search: async (ctx, needle, f, page) =>
      mapPage(
        await pageOf(
          ctx.db.query('organizations').withSearchIndex('search_text', (q) => {
            const s = q.search('searchText', needle).eq('status', 'active');
            return f.region ? s.eq('region', f.region) : s;
          }),
          page,
          needle,
        ),
        (o) => ({
          source: 'organizations',
          id: o._id,
          title: o.name,
          path: `/le-reseau/${o.slug}`,
          region: o.region,
          country: o.country,
        }),
      ),
  },

  tribune: {
    filters: ['theme', 'lang', 'year'],
    search: async (ctx, needle, f, page) =>
      mapPage(
        await pageOf(
          ctx.db.query('tribunePosts').withSearchIndex('search_text', (q) => {
            let s = q.search('searchText', needle).eq('status', 'published');
            if (f.theme) s = s.eq('theme', f.theme);
            if (isLocale(f.lang)) s = s.eq('lang', f.lang);
            if (f.year !== undefined) s = s.eq('searchYear', f.year);
            return s;
          }),
          page,
          needle,
        ),
        (p) => ({
          source: 'tribune',
          id: p._id,
          title: p.title,
          path: `/tribune/${p._id}`,
          kind: p.format,
          theme: p.theme,
          // Langue de RÉDACTION, pour le `lang` du titre (RGAA 8.7). Un billet
          // antérieur au champ `lang` est en français — le repli retenu
          // partout ailleurs (tribune.ts, translation.ts). Sans effet sur le
          // filtre « langue », qui interroge l'index, pas ce champ.
          lang: p.lang ?? 'fr',
          year: p.searchYear,
        }),
      ),
  },

  // SOURCE DÉRIVÉE. L'annuaire d'experts (F-23) n'a pas de table : un expert
  // est un auteur de publication PUBLIÉE (convex/experts.ts). On interroge
  // donc l'index des publications — la meule contient les noms d'auteurs —
  // et on garde les auteurs dont le nom correspond. Pas de curseur propre :
  // une seule page, bornée.
  experts: {
    filters: ['theme', 'region', 'year'],
    search: async (ctx, needle, f) => {
      const pubs = await publicationQuery(ctx, needle, f).take(EXPERT_SCAN);
      const byName = new Map<string, { count: number; year: number }>();
      for (const p of pubs) {
        for (const a of p.authors) {
          const name = a.name.trim();
          if (!name || !nameMatches(name, needle)) continue;
          const e = byName.get(name);
          if (e) {
            e.count += 1;
            e.year = Math.max(e.year, p.year);
          } else byName.set(name, { count: 1, year: p.year });
        }
      }
      const page = [...byName.entries()]
        .sort((a, b) => b[1].count - a[1].count || a[0].localeCompare(b[0]))
        .slice(0, EXPERT_MAX)
        .map(([name, e]): SearchHit => ({
          source: 'experts',
          id: name,
          title: name,
          path: '/experts',
          count: e.count,
          year: e.year,
        }));
      return { page, isDone: true, continueCursor: '' };
    },
  },
};

/** La source sait-elle honorer TOUS les filtres demandés ? */
export function sourceAccepts(key: SearchSourceKey, f: SearchFilters): boolean {
  const supported = SOURCES[key].filters;
  return (Object.keys(f) as FilterKey[]).every(
    (k) => f[k] === undefined || f[k] === '' || supported.includes(k),
  );
}

export async function searchSource(
  ctx: QueryCtx,
  key: SearchSourceKey,
  needle: string,
  f: SearchFilters,
  page: SourcePage,
): Promise<PaginationResult<SearchHit>> {
  if (!sourceAccepts(key, f)) {
    return { page: [], isDone: true, continueCursor: '' };
  }
  return await SOURCES[key].search(ctx, needle, f, page);
}
