// Replays de webinaires (F-54).
//
// DEUX SOURCES (chantier « contenus ») : la table `contentReplays`, éditée au
// back-office — lien YouTube, Vimeo ou fichier vidéo, événement lié —, et le
// catalogue codé ci-dessous, servi en REPLI tant que la table est vide ou le
// backend injoignable (`fromConvexReplays` / `getReplays`, même forme).
//
// Repli : page LEAN dérivée des événements PASSÉS.
// AUCUNE fausse vidéo : on ne fait que lister les événements `upcoming:false`
// (avec leur `durationMin`), triés par date DÉCROISSANTE, et on affiche un
// encart honnête « Enregistrement bientôt disponible ». Les libellés (titres,
// types, thématiques, langues) viennent de `getEventsLabels(locale)` — pas de
// duplication.
//
// FILTRES (communauté A-12, 27/09) : la page n'en proposait aucun, alors que
// la liste des événements en a. Type, thématique et langue sont des clés
// NEUTRES portées par l'URL (`?type=webinaire&theme=participation&lang=fr`),
// comme l'annuaire : rendu serveur, liens GET, partageable, sans JavaScript.

import type { FunctionReturnType } from 'convex/server';
import type { api } from '@convex/_generated/api';
import { dateParts } from '@convex/lib/contenus/time';
import { EVENTS, getEventsLabels, langLabel, whenOf } from './events-content';
import type { EventType, ThemeKey } from './events-content';
import type { Locale } from '@/i18n/routing';

export type Replay = {
  slug: string;
  title: string;
  type: string;
  typeKey: EventType;
  theme: string;
  themeKey: ThemeKey;
  langs: string[];
  durationMin?: number;
  y: number;
  mo: number;
  d: number;
  // Fiche de l'événement d'origine (lien « voir l'événement »), s'il y en a.
  eventSlug?: string | null;
  // Vidéo : lecteur intégré (YouTube « nocookie », Vimeo) ou fichier. Absente
  // = « enregistrement bientôt disponible ».
  videoKind?: 'youtube' | 'vimeo' | 'file' | null;
  videoUrl?: string | null;
  embedUrl?: string | null;
  description?: string | null;
};

export type ConvexReplays = FunctionReturnType<
  typeof api.contenus.replays.listPublic
>;

/** Replays de la table, sous la forme que la page lit. */
export function fromConvexReplays(
  rows: ConvexReplays,
  locale: Locale,
): Replay[] {
  const labels = getEventsLabels(locale);
  return rows.map((r) => {
    const { y, mo, d } = dateParts(r.recordedOn);
    const typeKey = r.eventType ?? 'webinaire';
    const themeKey = (r.themes[0] ?? 'vie-reseau') as ThemeKey;
    return {
      slug: r.slug,
      title: r.title,
      type: labels.types[typeKey],
      typeKey,
      theme: labels.themes[themeKey] ?? themeKey,
      themeKey,
      langs: r.langs,
      durationMin: r.durationMin ?? undefined,
      y,
      mo,
      d,
      eventSlug: r.eventSlug,
      videoKind: r.videoKind,
      videoUrl: r.videoUrl,
      embedUrl: r.embedUrl,
      description: r.description,
    };
  });
}

export type ReplayFilters = {
  type?: string;
  theme?: string;
  lang?: string;
};

// Liste des événements passés (`upcoming === false`), du plus récent au plus
// ancien (date décroissante), avec libellés localisés prêts à afficher.
export function getReplays(locale: Locale): Replay[] {
  const labels = getEventsLabels(locale);
  return EVENTS.filter((e) => e.upcoming === false)
    .slice()
    .sort((a, b) => whenOf(b) - whenOf(a))
    .map((e) => ({
      slug: e.slug,
      title: labels.titles[e.slug],
      type: labels.types[e.type],
      typeKey: e.type,
      theme: labels.themes[e.theme],
      themeKey: e.theme,
      langs: e.langs,
      durationMin: e.durationMin,
      y: e.y,
      mo: e.mo,
      d: e.d,
      eventSlug: e.slug,
    }));
}

function param(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.trim() ? v.trim().toLowerCase() : undefined;
}

// Filtres lus depuis l'URL, ASSAINIS contre les valeurs réellement portées
// par les replays : un `?type=zzz` vaut « pas de filtre » (même règle que
// l'annuaire et la bibliothèque), et n'apparaît donc jamais comme une chip
// active fantôme.
export function parseReplayFilters(
  sp: Record<string, string | string[] | undefined>,
  replays: Replay[],
): ReplayFilters {
  const type = param(sp.type);
  const theme = param(sp.theme);
  const lang = param(sp.lang);
  return {
    type: type && replays.some((r) => r.typeKey === type) ? type : undefined,
    theme:
      theme && replays.some((r) => r.themeKey === theme) ? theme : undefined,
    lang:
      lang && replays.some((r) => r.langs.includes(lang)) ? lang : undefined,
  };
}

// Combinaison en ET des trois filtres.
export function filterReplays(replays: Replay[], f: ReplayFilters): Replay[] {
  return replays.filter(
    (r) =>
      (!f.type || r.typeKey === f.type) &&
      (!f.theme || r.themeKey === f.theme) &&
      (!f.lang || r.langs.includes(f.lang)),
  );
}

export function hasReplayFilters(f: ReplayFilters): boolean {
  return Boolean(f.type || f.theme || f.lang);
}

export type ReplayFacet = { value: string; label: string; count: number };

// Facettes = valeurs présentes dans l'ensemble des replays, avec leur nombre
// d'occurrences, dans l'ordre de première apparition (la liste est déjà triée
// par date). Ne propose que des filtres qui donnent des résultats.
export function replayFacets(
  replays: Replay[],
  locale: Locale,
): { types: ReplayFacet[]; themes: ReplayFacet[]; langs: ReplayFacet[] } {
  const labels = getEventsLabels(locale);
  const tally = (
    pick: (r: Replay) => { value: string; label: string }[],
  ): ReplayFacet[] => {
    const out = new Map<string, ReplayFacet>();
    for (const r of replays) {
      for (const { value, label } of pick(r)) {
        const cur = out.get(value);
        if (cur) cur.count += 1;
        else out.set(value, { value, label, count: 1 });
      }
    }
    return [...out.values()];
  };
  return {
    types: tally((r) => [{ value: r.typeKey, label: r.type }]),
    themes: tally((r) => [{ value: r.themeKey, label: r.theme }]),
    langs: tally((r) =>
      r.langs.map((l) => ({
        value: l,
        label: langLabel(labels, l, locale),
      })),
    ),
  };
}

// URL de la page avec un filtre modifié, les autres préservés (`undefined`
// retire le filtre). next-intl ajoute le préfixe de langue.
export function replaysHref(
  filters: ReplayFilters,
  patch: Partial<ReplayFilters>,
): string {
  const next = { ...filters, ...patch };
  const sp = new URLSearchParams();
  if (next.type) sp.set('type', next.type);
  if (next.theme) sp.set('theme', next.theme);
  if (next.lang) sp.set('lang', next.lang);
  const qs = sp.toString();
  return qs ? `/replays?${qs}` : '/replays';
}
