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

// THE AGENDA AS THE PAGES READ IT — a single shape, two sources.
//
// Source 1, the `contentEvents` table ("contenus" workstream); source 2, the
// hard-coded catalogue (`convex/lib/contenus/coded/events.ts`), served as a FALLBACK as long
// as the table is empty or the backend unreachable. The pages don't know
// which of the two they display: that is the point of the fallback, and it is what
// keeps public URLs unchanged during the switchover.
//
// The shape extends `EventData` — the one the pages, the calendar grid and
// the filters already read — with what the table adds: title and venue ALREADY
// translated, standfirst, status, UTC instants, time zone, capacity, image.
//
// PAST OR UPCOMING: the DATE decides (`endsAt` compared with the time of
// the request), in both sources. The hard-coded catalogue's `upcoming` flag
// was set by hand and had fallen behind the calendar; it is
// now recomputed here, and it is the same rule the server applies to
// close registrations (`EVENT_CLOSED`).

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
  // Started (start in the past): no more reminders possible, even if the event
  // is not over. Computed at load time, like `upcoming`.
  started: boolean;
  hasVisio: boolean;
  featured: boolean;
  image: AgendaImage | null;
  source: 'convex' | 'code';
};

export type ConvexAgenda = FunctionReturnType<
  typeof api.contenus.events.listPublic
>;

/** An event is "upcoming" as long as it is not over. */
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
      // The theme is a theme slug (or `vie-reseau`): input validation has checked it.
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

/** The hard-coded catalogue, in the same shape (fallback). */
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
 * The featured event: the first upcoming, published "featured"
 * event; failing that, none (the featured block disappears rather than promoting
 * a past date).
 */
export function featuredEvent(events: AgendaEvent[]): AgendaEvent | null {
  return (
    events
      .filter((e) => e.featured && e.upcoming && e.status === 'published')
      .sort((a, b) => a.startsAt - b.startsAt)[0] ?? null
  );
}
