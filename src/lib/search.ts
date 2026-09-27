import { countryFlag, countryName } from '@/lib/orgs';
import { vocabulary, type VocabularyTranslator } from '@/i18n/vocabulary';

// RÉSULTATS DE LA RECHERCHE GLOBALE — rendu partagé par la palette et la page
// /recherche (F-06 / F-34, chantier diffusion).
//
// Le serveur rend des résultats UNIFORMES (`convex/lib/searchSources.ts`) :
// chemin, titre, facettes en slugs. L'interface n'a donc rien à savoir d'une
// table ; une source ajoutée au registre s'affiche sans code ici, avec pour
// seule exigence son libellé `search.section_<clé>`.

export type SearchHitLike = {
  source: string;
  title: string;
  path: string;
  kind?: string;
  theme?: string;
  country?: string;
  count?: number;
};

type PluralTranslator = (
  key: 'expertCount',
  values: { count: number },
) => string;

/** Petite mention à droite d'un résultat (type, pays, thème, nombre…). */
export function hitMeta(
  hit: SearchHitLike,
  ctx: {
    library: VocabularyTranslator;
    search: PluralTranslator;
    locale: string;
  },
): string {
  if (hit.source === 'publications' && hit.kind) {
    return vocabulary(ctx.library, 'types.', hit.kind);
  }
  if (hit.source === 'organizations' && hit.country) {
    return `${countryFlag(hit.country)} ${countryName(hit.country, ctx.locale)}`;
  }
  if (hit.source === 'tribune' && hit.theme) {
    return vocabulary(ctx.library, 'themes.', hit.theme);
  }
  if (hit.source === 'experts' && hit.count !== undefined) {
    return ctx.search('expertCount', { count: hit.count });
  }
  return '';
}

// Filtres de la page de résultats, lus dans l'URL et ASSAINIS : une valeur
// hors forme vaut « pas de filtre » (jamais une erreur d'argument sur une page
// publique). Les domaines fermés sont vérifiés côté serveur par l'index — une
// valeur inconnue ne trouve simplement rien.
export type SearchFiltersParams = {
  type?: string;
  theme?: string;
  lang?: string;
  region?: string;
  year?: number;
};

const SLUG = /^[a-z0-9-]{1,40}$/;

export function parseSearchFilters(
  sp: Record<string, string | string[] | undefined>,
): SearchFiltersParams {
  const one = (k: string) => {
    const v = sp[k];
    const s = Array.isArray(v) ? v[0] : v;
    return s && SLUG.test(s) ? s : undefined;
  };
  const year = Number(one('year'));
  return {
    type: one('type'),
    theme: one('theme'),
    lang: one('lang'),
    region: one('region'),
    year:
      Number.isInteger(year) && year >= 1990 && year <= 2100 ? year : undefined,
  };
}

export function hasFilters(f: SearchFiltersParams): boolean {
  return Object.values(f).some((v) => v !== undefined);
}

/** Paramètres d'URL d'une recherche (terme, filtres, source, curseur). */
export function searchHref(
  q: string,
  f: SearchFiltersParams,
  extra: { source?: string; cursor?: string } = {},
): string {
  const p = new URLSearchParams({ q });
  for (const [k, v] of Object.entries(f)) {
    if (v !== undefined) p.set(k, String(v));
  }
  if (extra.source) p.set('source', extra.source);
  if (extra.cursor) p.set('cursor', extra.cursor);
  return `/recherche?${p.toString()}`;
}
