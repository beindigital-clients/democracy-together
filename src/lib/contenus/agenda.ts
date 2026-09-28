import type { FunctionReturnType } from 'convex/server';
import type { api } from '@convex/_generated/api';
import type { Locale } from '@/i18n/routing';
import {
  CODED_CITY_TIMEZONES,
  CODED_EVENTS,
  CODED_EVENT_CITIES,
  CODED_EVENT_TITLES,
  CODED_FEATURED_SLUG,
  type EventData,
} from '@convex/lib/contenus/coded/events';
import {
  dateParts,
  isoDate,
  scheduleInstants,
} from '@convex/lib/contenus/time';

// L'AGENDA TEL QUE LES PAGES LE LISENT — une seule forme, deux sources.
//
// Source 1, la table `contentEvents` (chantier « contenus ») ; source 2, le
// catalogue codé (`convex/lib/contenus/coded/events.ts`), servi en REPLI tant
// que la table est vide ou le backend injoignable. Les pages ne savent pas
// laquelle des deux elles affichent : c'est le principe du repli, et c'est ce
// qui garde les URL publiques inchangées pendant la bascule.
//
// La forme étend `EventData` — celle que les pages, la grille du calendrier et
// les filtres lisaient déjà — de ce que la table apporte : titre et lieu DÉJÀ
// traduits, chapô, statut, instants UTC, fuseau, capacité, visuel.
//
// PASSÉ OU À VENIR : c'est la DATE qui décide (`endsAt` comparé à l'instant de
// la requête), dans les deux sources. L'indicateur `upcoming` du catalogue
// codé était posé à la main et avait pris du retard sur le calendrier ; il est
// désormais recalculé ici, et c'est la même règle que le serveur applique pour
// fermer les inscriptions (`EVENT_CLOSED`).

export type AgendaImage = {
  url: string;
  alt: string;
  altLang: string;
  width: number | null;
  height: number | null;
};

export type AgendaEvent = EventData & {
  title: string;
  place: string;
  lead: string | null;
  status: 'published' | 'cancelled';
  startDate: string;
  startTime: string | null;
  endDate: string | null;
  endTime: string | null;
  timezone: string;
  startsAt: number;
  endsAt: number;
  capacity: number | null;
  // Commencé (début passé) : plus de rappel possible, même si l'événement
  // n'est pas terminé. Calculé au chargement, comme `upcoming`.
  started: boolean;
  hasVisio: boolean;
  featured: boolean;
  image: AgendaImage | null;
  source: 'convex' | 'code';
};

export type ConvexAgenda = FunctionReturnType<
  typeof api.contenus.events.listPublic
>;

/** Un événement est « à venir » tant qu'il n'est pas terminé. */
export function isUpcoming(e: { endsAt: number }, now: number): boolean {
  return e.endsAt > now;
}

export function fromConvex(rows: ConvexAgenda, now: number): AgendaEvent[] {
  return rows.map((r) => {
    const { y, mo, d } = dateParts(r.startDate);
    return {
      slug: r.slug,
      type: r.type,
      region: r.region,
      format: r.format,
      langs: r.langs,
      // Le thème est un slug d'axe (ou `vie-reseau`) : la saisie l'a validé.
      theme: r.theme as EventData['theme'],
      cityKey: r.cityKey ?? '',
      y,
      mo,
      d,
      upcoming: isUpcoming(r, now),
      durationMin: r.durationMin ?? undefined,
      title: r.title,
      place: r.place,
      lead: r.summary,
      status: r.status,
      startDate: r.startDate,
      startTime: r.startTime,
      endDate: r.endDate,
      endTime: r.endTime,
      timezone: r.timezone,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      capacity: r.capacity,
      started: r.startsAt <= now,
      hasVisio: r.hasVisio,
      featured: r.featured,
      image: r.image,
      source: 'convex' as const,
    };
  });
}

/** Le catalogue codé, sous la même forme (repli). */
export function codedAgenda(locale: Locale, now: number): AgendaEvent[] {
  return CODED_EVENTS.map((e) => {
    const startDate = isoDate(e.y, e.mo, e.d);
    const timezone = CODED_CITY_TIMEZONES[e.cityKey] ?? 'Europe/Paris';
    const { startsAt, endsAt } = scheduleInstants({ startDate, timezone });
    return {
      ...e,
      upcoming: isUpcoming({ endsAt }, now),
      title: CODED_EVENT_TITLES[locale][e.slug] ?? e.slug,
      place: CODED_EVENT_CITIES[locale][e.cityKey] ?? '',
      lead: null,
      status: 'published' as const,
      startDate,
      startTime: null,
      endDate: null,
      endTime: null,
      timezone,
      startsAt,
      endsAt,
      capacity: null,
      started: startsAt <= now,
      hasVisio: false,
      featured: e.slug === CODED_FEATURED_SLUG,
      image: null,
      source: 'code' as const,
    };
  });
}

/**
 * L'événement mis en avant : le premier événement « à la une » à venir et
 * publié ; à défaut, aucun (le bloc vedette disparaît plutôt que de pousser
 * une date passée).
 */
export function featuredEvent(events: AgendaEvent[]): AgendaEvent | null {
  return (
    events
      .filter((e) => e.featured && e.upcoming && e.status === 'published')
      .sort((a, b) => a.startsAt - b.startsAt)[0] ?? null
  );
}
