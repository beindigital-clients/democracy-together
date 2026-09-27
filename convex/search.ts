import { v } from 'convex/values';
import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server';
import { query } from './_generated/server';
import { searchQuery } from './lib/searchText';
import {
  SEARCH_SOURCES,
  searchFiltersValidator,
  searchHitValidator,
  searchSource,
  searchSourceValidator,
  type SearchHit,
} from './lib/searchSources';

// RECHERCHE GLOBALE (F-06) ET PLEIN TEXTE (F-34) — sur les INDEX DE RECHERCHE
// Convex, plus sur des lectures complètes filtrées en mémoire.
//
// Avant (mesuré au rapport de campagne, § 10.2) : chaque frappe dans la palette
// chargeait toutes les publications publiées et tous les membres actifs, puis
// cherchait une sous-chaîne. Correct à vingt documents, linéaire ensuite — et
// la palette interroge à chaque frappe. Désormais chaque source lit SON index
// (`search_text`), sur une meule repliée tenue à l'écriture
// (`lib/searchText.ts`) : « democratie » trouve « démocratie » comme avant,
// mais en une lecture d'index bornée.
//
// Les sources et leurs règles de visibilité vivent dans le REGISTRE
// (`lib/searchSources.ts`). Ce module ne connaît aucune table. Les actualités
// (Sanity) restent cherchées à part par la page /recherche.

// Résultats par source dans la palette : de quoi choisir, pas un inventaire.
const LIMIT = 8;

// `lang` : langue de RÉDACTION de la publication (celle du hit du registre,
// `searchLang ?? languages[0]`, la même règle que la fiche). Les listes de
// résultats en ont besoin pour poser `lang` sur un titre qui n'est pas dans la
// langue de la page (RGAA 8.7) — la forme historique la porte donc aussi.
const legacyPublication = v.object({
  slug: v.string(),
  title: v.string(),
  type: v.string(),
  lang: v.optional(v.string()),
});
const legacyOrganization = v.object({
  slug: v.string(),
  name: v.string(),
  country: v.string(),
});

function lastSegment(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

export const globalSearch = query({
  args: { q: v.string(), filters: v.optional(searchFiltersValidator) },
  returns: v.object({
    // Sections GÉNÉRIQUES, dans l'ordre du registre : une source ajoutée au
    // registre apparaît ici sans toucher à cette fonction ni à son contrat.
    sections: v.array(
      v.object({
        source: searchSourceValidator,
        hits: v.array(searchHitValidator),
        more: v.boolean(),
      }),
    ),
    // Forme historique (palette et page d'avant le registre), conservée pour
    // les appelants existants.
    publications: v.array(legacyPublication),
    organizations: v.array(legacyOrganization),
  }),
  handler: async (ctx, { q, filters }) => {
    const needle = searchQuery(q);
    if (!needle) return { sections: [], publications: [], organizations: [] };
    const f = filters ?? {};

    const sections = await Promise.all(
      SEARCH_SOURCES.map(async (source) => {
        const r = await searchSource(ctx, source, needle, f, {
          numItems: LIMIT,
          cursor: null,
        });
        return { source, hits: r.page.slice(0, LIMIT), more: !r.isDone };
      }),
    );
    const hitsOf = (s: string): SearchHit[] =>
      sections.find((x) => x.source === s)?.hits ?? [];

    return {
      sections: sections.filter((s) => s.hits.length > 0),
      publications: hitsOf('publications').map((h) => ({
        slug: lastSegment(h.path),
        title: h.title,
        type: h.kind ?? '',
        lang: h.lang,
      })),
      organizations: hitsOf('organizations').map((h) => ({
        slug: lastSegment(h.path),
        name: h.title,
        country: h.country ?? '',
      })),
    };
  },
});

// Résultats PAGINÉS d'une source — « voir plus » de la page /recherche.
export const searchBySource = query({
  args: {
    source: searchSourceValidator,
    q: v.string(),
    filters: v.optional(searchFiltersValidator),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(searchHitValidator),
  handler: async (ctx, { source, q, filters, paginationOpts }) => {
    const needle = searchQuery(q);
    if (!needle) return { page: [], isDone: true, continueCursor: '' };
    // Taille de page bornée côté serveur : le client ne fixe pas la borne.
    const opts = {
      ...paginationOpts,
      numItems: Math.max(1, Math.min(50, paginationOpts.numItems)),
    };
    return await searchSource(ctx, source, needle, filters ?? {}, opts);
  },
});
