// Webinar replays (F-54).
//
// TWO SOURCES ("contenus" workstream): the `contentReplays` table, edited in
// the back office — YouTube, Vimeo or video file link, linked event —, and
// the catalog hard-coded below, served as a FALLBACK while the table is empty
// or the backend unreachable (`fromConvexReplays` / `getReplays`, same shape).
//
// Fallback: a LEAN page derived from PAST events.
// NO fake video: we only list the `upcoming:false` events (with their
// `durationMin`), sorted by DESCENDING date, and show an honest
// "Enregistrement bientôt disponible" notice. The labels (titles, types,
// themes, languages) come from `getEventsLabels(locale)` — no
// duplication.
//
// FILTERS (community A-12, 27/09): the page offered none, whereas the event
// list does. Type, theme and language are NEUTRAL keys carried by the URL
// (`?type=webinaire&theme=participation&lang=fr`), like the directory:
// server rendering, GET links, shareable, no JavaScript.

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
  // Page of the originating event ("voir l'événement" link), if there is one.
  eventSlug?: string | null;
  // Video: embedded player (YouTube "nocookie", Vimeo) or file. Absent
  // = "enregistrement bientôt disponible".
  videoKind?: 'youtube' | 'vimeo' | 'file' | null;
  videoUrl?: string | null;
  embedUrl?: string | null;
  description?: string | null;
};

export type ConvexReplays = FunctionReturnType<
  typeof api.contenus.replays.listPublic
>;

/** Replays from the table, in the shape the page reads. */
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

// List of past events (`upcoming === false`), from most recent to oldest
// (descending date), with localized labels ready to display.
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

// Filters read from the URL, SANITIZED against the values actually carried
// by the replays: a `?type=zzz` counts as "no filter" (same rule as the
// directory and the library), and so never shows up as a phantom active
// chip.
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

// AND combination of the three filters.
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

// Facets = values present across all replays, with their number of
// occurrences, in order of first appearance (the list is already sorted
// by date). Only offers filters that yield results.
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

// Page URL with one filter changed, the others preserved (`undefined`
// removes the filter). next-intl adds the locale prefix.
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
