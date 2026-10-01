import { fetchQuery } from 'convex/nextjs';
import type { FunctionReturnType } from 'convex/server';
import { api } from '@convex/_generated/api';
import type { Locale } from '@/i18n/routing';
import { fetchOrFallback } from '@/lib/convex-fallback';
import { codedAgenda, fromConvex, type AgendaEvent } from './agenda';
import { fromConvexReplays, getReplays, type Replay } from '@/lib/replays';
import { getPartners } from '@/lib/partners-content';
import { getThemeSyntheses } from '@/lib/themes-content';
import {
  codedNews,
  codedNewsArticle,
  type NewsArticle,
  type NewsItem,
} from '@/lib/news-content';

// SERVER-SIDE LOADING OF EDITORIAL CONTENT — Convex first, repository as
// fallback ("contenus" workstream).
//
// The rule is that of `convex-fallback.ts`: an unavailable source must not
// take down the page. It is EXTENDED here with one
// case: an EMPTY table (a deployment where the import of hard-coded content has not yet
// been run) also serves the hard-coded content — otherwise putting the
// back-office into production would empty the agenda for the duration of a command. As soon as a table
// holds at least one published item, it is authoritative, entirely: we
// NEVER MIX the two sources, otherwise an event deleted in the
// back-office would reappear from the repository.
//
// `source` is returned with the data so that the page (and its tests) know
// what they are displaying — useful for diagnostics, never shown to the visitor.

export type Loaded<T> = { items: T; source: 'convex' | 'code' };

export async function loadAgenda(
  locale: Locale,
  now: number = Date.now(),
): Promise<Loaded<AgendaEvent[]>> {
  const rows = await fetchOrFallback(
    'contenus/agenda',
    () => fetchQuery(api.contenus.events.listPublic, { locale }),
    null,
  );
  if (rows && rows.length > 0)
    return { items: fromConvex(rows, now), source: 'convex' };
  return { items: codedAgenda(locale, now), source: 'code' };
}

export type EventDetail = {
  event: AgendaEvent;
  others: AgendaEvent[];
  full: boolean;
  replayUrl: string | null;
  source: 'convex' | 'code';
};

/** An event page, with the agenda for "other events". */
export async function loadEvent(
  slug: string,
  locale: Locale,
  now: number = Date.now(),
): Promise<EventDetail | null> {
  const agenda = await loadAgenda(locale, now);
  const event = agenda.items.find((e) => e.slug === slug);
  if (!event) return null;
  let full = false;
  let replayUrl: string | null = null;
  if (agenda.source === 'convex') {
    const detail = await fetchOrFallback(
      'contenus/evenement',
      () => fetchQuery(api.contenus.events.getPublic, { slug, locale }),
      null,
    );
    full = detail?.full ?? false;
    replayUrl = detail?.replay?.videoUrl ?? null;
  }
  return {
    event,
    others: agenda.items.filter((e) => e.slug !== slug),
    full,
    replayUrl,
    source: agenda.source,
  };
}

export async function loadReplays(locale: Locale): Promise<Loaded<Replay[]>> {
  const rows = await fetchOrFallback(
    'contenus/replays',
    () => fetchQuery(api.contenus.replays.listPublic, { locale }),
    null,
  );
  if (rows && rows.length > 0)
    return { items: fromConvexReplays(rows, locale), source: 'convex' };
  return { items: getReplays(locale), source: 'code' };
}

// --- Partenaires -----------------------------------------------------------------

export type PartnerView = {
  slug: string;
  name: string;
  kicker: string | null;
  summary: string | null;
  gives: string | null;
  gets: string | null;
  url: string | null;
  logo: FunctionReturnType<
    typeof api.contenus.partners.listPublic
  >[number]['logo'];
};

export async function loadPartners(
  locale: Locale,
): Promise<Loaded<PartnerView[]>> {
  const rows = await fetchOrFallback(
    'contenus/partenaires',
    () => fetchQuery(api.contenus.partners.listPublic, { locale }),
    null,
  );
  if (rows && rows.length > 0) return { items: rows, source: 'convex' };
  return {
    items: getPartners(locale).map((c) => ({
      slug: c.slug,
      name: c.title,
      kicker: c.kicker,
      summary: c.summary,
      gives: c.gives,
      gets: c.gets,
      url: null,
      logo: null,
    })),
    source: 'code',
  };
}

// --- Press review ----------------------------------------------------------------

export type PressItem = FunctionReturnType<
  typeof api.contenus.press.listPublic
>[number];

/** The press review: no hard-coded source, hence an empty list as fallback. */
export async function loadPress(locale: Locale): Promise<PressItem[]> {
  return await fetchOrFallback(
    'contenus/presse',
    () => fetchQuery(api.contenus.press.listPublic, { locale }),
    [],
  );
}

// --- Themes -----------------------------------------------------------------------

export type ThemeView = {
  slug: string;
  // `null`: title to be read from the `library.themes.*` vocabulary (hard-coded fallback).
  title: string | null;
  lead: string;
  stance: string[];
  questions: string[];
  dimension: string | null;
};

export async function loadThemes(locale: Locale): Promise<Loaded<ThemeView[]>> {
  const rows = await fetchOrFallback(
    'contenus/thematiques',
    () => fetchQuery(api.contenus.themes.listPublic, { locale }),
    null,
  );
  if (rows && rows.length > 0) return { items: rows, source: 'convex' };
  return {
    items: getThemeSyntheses(locale).map((s) => ({
      slug: s.slug,
      title: null,
      lead: s.lead,
      stance: s.stance,
      questions: s.questions,
      dimension: s.dimension,
    })),
    source: 'code',
  };
}

export async function loadTheme(
  slug: string,
  locale: Locale,
): Promise<ThemeView | null> {
  const { items } = await loadThemes(locale);
  return items.find((t) => t.slug === slug) ?? null;
}

// --- News -------------------------------------------------------------------------

export async function loadNews(locale: Locale): Promise<Loaded<NewsItem[]>> {
  const rows = await fetchOrFallback(
    'contenus/actualites',
    () => fetchQuery(api.contenus.news.listPublic, { locale }),
    null,
  );
  if (rows && rows.length > 0) return { items: rows, source: 'convex' };
  return { items: codedNews(locale), source: 'code' };
}

// THREE outcomes, which the article page must not conflate (F-02, F-10):
// the article, its absence (a localized 404), and an outage that leaves us
// unable to say (200 + "momentanément indisponible", `noindex`). Turning an
// outage into a 404 would tell search engines that an existing article is
// gone. The coded articles answer while the table is empty — and during an
// outage, for their own slugs.
export type NewsArticleResult =
  | { status: 'found'; article: NewsArticle; source: 'convex' | 'code' }
  | { status: 'missing' }
  | { status: 'unavailable' };

export async function loadNewsArticle(
  slug: string,
  locale: Locale,
): Promise<NewsArticleResult> {
  const res = await fetchOrFallback(
    'contenus/actualite',
    () => fetchQuery(api.contenus.news.getPublic, { slug, locale }),
    undefined,
  );
  if (res?.article)
    return { status: 'found', article: res.article, source: 'convex' };
  // The table holds a published article: it is authoritative, entirely.
  if (res?.anyPublished) return { status: 'missing' };
  const coded = codedNewsArticle(slug, locale);
  if (coded) return { status: 'found', article: coded, source: 'code' };
  return { status: res === undefined ? 'unavailable' : 'missing' };
}
