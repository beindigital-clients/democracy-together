import { fetchQuery } from 'convex/nextjs';
import type { FunctionReturnType } from 'convex/server';
import { api } from '@convex/_generated/api';
import type { Locale } from '@/i18n/routing';
import { fetchOrFallback } from '@/lib/convex-fallback';
import { codedAgenda, fromConvex, type AgendaEvent } from './agenda';
import { fromConvexReplays, getReplays, type Replay } from '@/lib/replays';
import { getPartners } from '@/lib/partners-content';
import { getThemeSyntheses } from '@/lib/themes-content';

// CHARGEMENT DES CONTENUS ÉDITORIAUX CÔTÉ SERVEUR — Convex d'abord, dépôt en
// repli (chantier « contenus »).
//
// La règle est celle de `convex-fallback.ts` et des actualités Sanity : une
// source indisponible ne doit pas emporter la page. Elle est ÉTENDUE ici d'un
// cas : une table VIDE (déploiement où l'import du contenu codé n'a pas encore
// été lancé) sert aussi le contenu codé — sans quoi la mise en production du
// back-office viderait l'agenda le temps d'une commande. Dès qu'une table
// porte au moins un contenu publié, c'est elle qui fait foi, entièrement : on
// ne MÉLANGE jamais les deux sources, sans quoi un événement supprimé au
// back-office réapparaîtrait depuis le dépôt.
//
// `source` est rendu avec les données pour que la page (et ses tests) sachent
// ce qu'elles affichent — utile au diagnostic, jamais montré au visiteur.

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

/** Une fiche d'événement, avec l'agenda pour « autres rendez-vous ». */
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

// --- Revue de presse -------------------------------------------------------------

export type PressItem = FunctionReturnType<
  typeof api.contenus.press.listPublic
>[number];

/** La revue de presse : aucune source codée, donc une liste vide en repli. */
export async function loadPress(locale: Locale): Promise<PressItem[]> {
  return await fetchOrFallback(
    'contenus/presse',
    () => fetchQuery(api.contenus.press.listPublic, { locale }),
    [],
  );
}

// --- Thématiques ------------------------------------------------------------------

export type ThemeView = {
  slug: string;
  // `null` : titre à lire dans le vocabulaire `library.themes.*` (repli codé).
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
