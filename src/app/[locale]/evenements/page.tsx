import type { Metadata } from 'next';
import { hreflangFor } from '@/lib/seo';
import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { UrlSortSelect } from '@/components/ui/url-sort-select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { resolveLocale, intlLocale } from '@/i18n/locale';
import {
  FEATURED_SLUG,
  EVENT_SORTS,
  type EventFacetKey,
  getEventsLabels,
  langLabel,
  parseEventFilters,
  filterAndSortEvents,
  computeEventFacets,
  buildEventHref,
  toggleEventHref,
  hasActiveEventFilters,
  monthAbbr,
} from '@/lib/events-content';
import { loadAgenda } from '@/lib/contenus/load';
import { featuredEvent, type AgendaEvent } from '@/lib/contenus/agenda';
import { ArrowForward } from '@/components/ui/arrow';
import type { Locale } from '@/i18n/routing';
import { Badge } from '@/components/ui/badge';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const L = getEventsLabels(resolveLocale(locale));
  return {
    title: L.hero.title,
    description: L.hero.lead,
    alternates: {
      canonical: `${SITE}/${locale}/evenements`,
      languages: hreflangFor(`evenements`),
    },
  };
}

const WRAP = 'mx-auto w-full max-w-[1240px] px-4 sm:px-6';

const FACET_OPTIONS: EventFacetKey[] = [
  'types',
  'regions',
  'formats',
  'langs',
  'months',
];

// "novembre 2026": label for a value of the "month" facet.
function monthLabel(ym: string, loc: Locale): string {
  const [y, m] = ym.split('-').map(Number);
  const label = new Intl.DateTimeFormat(intlLocale(loc), {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(Date.UTC(y, m - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default async function EventsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = resolveLocale(locale);
  const L = getEventsLabels(loc);
  const tc = await getTranslations('calendar');
  const ta = await getTranslations('agenda');
  const filters = parseEventFilters(await searchParams);
  // Calendar: the `contentEvents` table, or the hard-coded fallback catalogue
  // (empty table, backend unreachable) — see src/lib/contenus/load.ts.
  const { items: events } = await loadAgenda(loc);
  const results = filterAndSortEvents(filters, L, events);
  const facets = computeEventFacets(filters, L, events);
  const featured = featuredEvent(events);

  const replays = events
    .filter((e) => !e.upcoming && e.status === 'published')
    .sort((a, b) => b.startsAt - a.startsAt);

  const facetLegend: Record<EventFacetKey, string> = {
    types: L.filter.type,
    regions: L.filter.region,
    formats: L.filter.format,
    langs: L.filter.lang,
    months: ta('filterMonth'),
  };
  const facetLabel = (key: EventFacetKey, value: string): string => {
    if (key === 'types') return L.types[value as AgendaEvent['type']] ?? value;
    if (key === 'regions')
      return L.regions[value as AgendaEvent['region']] ?? value;
    if (key === 'formats')
      return L.formats[value as AgendaEvent['format']] ?? value;
    if (key === 'langs') return langLabel(L, value, loc);
    return monthLabel(value, loc);
  };

  const isUpcoming = filters.period === 'venir';
  const countLabel =
    results.length === 1
      ? isUpcoming
        ? L.results.countUpcomingOne
        : L.results.countPastOne
      : isUpcoming
        ? L.results.countUpcomingMany
        : L.results.countPastMany;

  return (
    <div>
      {/* Header */}
      <header className="border-b border-line">
        <div className={`${WRAP} pb-10 pt-12 md:pt-14`}>
          <Reveal>
            <p className="text-[13px] text-muted">
              <Link href="/" className="text-muted hover:text-ink">
                {L.hero.crumbHome}
              </Link>{' '}
              / {L.hero.title}
            </p>
            <p className="mt-3 font-mono text-xs uppercase tracking-[0.14em] text-muted">
              {L.hero.eyebrow}
            </p>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
              <h1 className="font-display text-[clamp(34px,4.4vw,52px)] font-medium leading-[1.05] tracking-[-0.02em]">
                {L.hero.title}
              </h1>
              <Link
                href="/evenements/calendrier"
                className="inline-flex items-center gap-1.5 rounded-sm border border-line-strong px-3 py-1.5 text-[13px] font-semibold text-ink transition-colors hover:border-ink hover:bg-accent-tint"
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 16 16"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                >
                  <rect x="2" y="3" width="12" height="11" rx="1.5" />
                  <path
                    d="M2 6.5h12M5.5 2v2.5M10.5 2v2.5"
                    strokeLinecap="round"
                  />
                </svg>
                {tc('calendarView')}
              </Link>
            </div>
            <p className="mt-4 max-w-[64ch] text-lg leading-relaxed text-ink-soft">
              {L.hero.lead}
            </p>
            <form role="search" className="mt-6 flex max-w-[600px] gap-3">
              {filters.period === 'passes' ? (
                <input type="hidden" name="period" value="passes" />
              ) : null}
              <Input
                type="search"
                name="q"
                defaultValue={filters.q ?? ''}
                placeholder={L.hero.searchPlaceholder}
                aria-label={L.hero.searchPlaceholder}
                // NON-visible label: `title` makes it readable on hover and meets one
                // condition of RGAA 11.1.3 (the placeholder disappears while typing).
                title={L.hero.searchPlaceholder}
                className="flex-1 px-4"
              />
              <Button type="submit" className="shrink-0 px-5">
                {L.hero.searchCta}
              </Button>
            </form>
          </Reveal>
        </div>
      </header>

      {/* Featured event — the rich content hard-coded for the inaugural
          conference, a card drawn from the table for any other "featured"
          event; nothing if there is no upcoming one. */}
      {featured ? (
        <section className={`${WRAP} py-10`}>
          <Reveal className="grid items-stretch gap-0 overflow-hidden rounded-md border border-line bg-surface md:grid-cols-[1.05fr_1fr]">
            <div className="relative min-h-[240px]">
              {featured.image ? (
                <Image
                  src={featured.image.url}
                  alt={featured.image.alt}
                  fill
                  unoptimized
                  sizes="(max-width: 768px) 100vw, 620px"
                  className="object-cover"
                />
              ) : (
                <Image
                  src="/library/paris.jpg"
                  // Decorative illustration (RGAA 1.2, 27/09 audit): the
                  // neighbouring heading would name it twice.
                  alt=""
                  fill
                  sizes="(max-width: 768px) 100vw, 620px"
                  className="object-cover"
                />
              )}
              <Badge
                variant="solid"
                size="label"
                className="absolute start-4 top-4"
              >
                {featured.slug === FEATURED_SLUG
                  ? L.featuredBadge
                  : `${ta('featuredBadge')} · ${L.types[featured.type]}`}
              </Badge>
            </div>
            <div className="p-6 md:p-8">
              {featured.slug === FEATURED_SLUG ? (
                <>
                  <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                    {L.featured.kicker}
                  </p>
                  <h2 className="mt-2 font-display text-2xl leading-snug md:text-3xl">
                    {L.featured.title}
                  </h2>
                  <p className="mt-3 leading-relaxed text-ink-soft">
                    {L.featured.body}
                  </p>
                  <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
                    {L.featured.facts.map((f) => (
                      <div key={f.k}>
                        <dt className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                          {f.k}
                        </dt>
                        <dd className="mt-0.5 text-sm font-medium text-ink">
                          {f.v}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : (
                <>
                  <p className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                    {L.types[featured.type]} · {L.formats[featured.format]}
                  </p>
                  <h2 className="mt-2 font-display text-2xl leading-snug wrap-anywhere md:text-3xl">
                    {featured.title}
                  </h2>
                  {featured.lead ? (
                    <p className="mt-3 leading-relaxed text-ink-soft wrap-anywhere">
                      {featured.lead}
                    </p>
                  ) : null}
                  <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3">
                    <div>
                      <dt className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                        {L.detail.factDate}
                      </dt>
                      <dd className="mt-0.5 text-sm font-medium text-ink">
                        {featured.d} {monthAbbr(featured, loc).toLowerCase()}{' '}
                        {featured.y}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                        {L.detail.factPlace}
                      </dt>
                      <dd className="mt-0.5 text-sm font-medium text-ink wrap-anywhere">
                        {featured.place}
                      </dd>
                    </div>
                  </dl>
                </>
              )}
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={`/evenements/${featured.slug}`}
                  className="inline-flex min-h-11 items-center justify-center rounded-sm bg-accent px-[18px] py-[11px] text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-strong"
                >
                  {L.featured.register}
                </Link>
                <Link
                  href={`/evenements/${featured.slug}`}
                  className="inline-flex min-h-11 items-center justify-center rounded-sm border border-line-strong px-[18px] py-[11px] text-sm font-semibold text-ink transition-colors hover:border-ink hover:bg-accent-tint"
                >
                  {L.featured.details}
                </Link>
              </div>
            </div>
          </Reveal>
        </section>
      ) : null}

      {/* Filterable list */}
      <div
        className={`${WRAP} grid gap-8 pb-16 lg:grid-cols-[260px_1fr] lg:gap-12`}
      >
        <aside
          aria-label={L.filter.title}
          className="lg:sticky lg:top-24 lg:self-start"
        >
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-lg">{L.filter.title}</h2>
            {hasActiveEventFilters(filters) ? (
              <Link
                href={buildEventHref({
                  ...filters,
                  types: [],
                  regions: [],
                  formats: [],
                  langs: [],
                  months: [],
                  q: undefined,
                })}
                className="text-[12.5px] text-accent-text hover:underline"
              >
                {L.filter.reset}
              </Link>
            ) : null}
          </div>

          {/* Period (segmented) */}
          <div className="mb-4 inline-flex w-full overflow-hidden rounded-sm border border-line-strong">
            {(['venir', 'passes'] as const).map((p) => (
              <Link
                key={p}
                href={buildEventHref({
                  ...filters,
                  period: p,
                  sort: 'date-asc',
                })}
                aria-current={filters.period === p ? 'true' : undefined}
                className={`flex-1 px-3 py-2 text-center text-[13px] font-semibold transition-colors ${
                  filters.period === p
                    ? 'bg-accent text-accent-contrast'
                    : 'bg-surface text-ink-soft hover:text-ink'
                }`}
              >
                {p === 'venir' ? L.filter.upcoming : L.filter.past}
              </Link>
            ))}
          </div>

          {FACET_OPTIONS.map((key) => {
            const opts = facets[key];
            if (opts.length === 0) return null;
            return (
              <fieldset key={key} className="border-t border-line py-4">
                <legend className="mb-3 font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
                  {facetLegend[key]}
                </legend>
                <div className="flex flex-col">
                  {opts.map(({ value, count }) => {
                    const active = filters[key].includes(value);
                    const label = facetLabel(key, value);
                    return (
                      <Link
                        key={value}
                        href={toggleEventHref(filters, key, value)}
                        aria-current={active ? 'true' : undefined}
                        className="group flex items-center gap-2.5 py-1 text-sm text-ink-soft transition-colors hover:text-ink"
                      >
                        <span
                          aria-hidden="true"
                          className={`grid h-4 w-4 shrink-0 place-items-center rounded-[3px] border transition-colors ${active ? 'border-accent bg-accent text-accent-contrast' : 'border-line-field bg-surface group-hover:border-ink'}`}
                        >
                          {active ? (
                            <svg
                              viewBox="0 0 12 12"
                              className="h-2.5 w-2.5"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path
                                d="M2.5 6.2 5 8.5 9.5 3.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          ) : null}
                        </span>
                        <span className={active ? 'text-ink' : undefined}>
                          {label}
                        </span>
                        <span className="ms-auto font-mono text-[11px] text-muted">
                          {count}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </aside>

        <section aria-label={L.results.title}>
          <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
            <p className="text-[15px] text-ink-soft">
              <b className="font-mono text-ink">{results.length}</b>{' '}
              {countLabel}
            </p>
            <UrlSortSelect
              label={L.results.sortLabel}
              value={filters.sort}
              defaultValue="date-asc"
              options={EVENT_SORTS.map((s) => ({
                value: s,
                label: L.results.sorts[s],
              }))}
            />
          </div>

          {results.length === 0 ? (
            <div className="rounded-sm border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
              <p className="text-muted">{L.results.empty}</p>
              <Link
                href="/evenements"
                className="mt-4 inline-block text-sm font-medium text-accent-text hover:underline"
              >
                {L.results.emptyReset}
              </Link>
            </div>
          ) : (
            <RevealGroup
              as="ul"
              aria-label={L.hero.title}
              className="grid gap-4 sm:grid-cols-2"
            >
              {results.map((e) => (
                <RevealItem as="li" key={e.slug}>
                  <EventCard
                    event={e}
                    L={L}
                    locale={loc}
                    cancelledLabel={ta('cancelled')}
                  />
                </RevealItem>
              ))}
            </RevealGroup>
          )}
        </section>
      </div>

      {/* Replays */}
      <section className="border-t border-line bg-surface">
        <div className={`${WRAP} py-16`}>
          <Reveal className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
                {L.replays.eyebrow}
              </p>
              <h2 className="mt-2 font-display text-[clamp(24px,3vw,32px)]">
                {L.replays.title}
              </h2>
            </div>
            <Link
              href="/bibliotheque"
              className="text-sm font-semibold text-accent-text hover:underline"
            >
              {L.replays.cta} <ArrowForward />
            </Link>
          </Reveal>
          <RevealGroup
            as="ul"
            className="flex flex-col divide-y divide-line overflow-hidden rounded-md border border-line bg-paper"
          >
            {replays.map((e) => (
              <RevealItem as="li" key={e.slug}>
                <Link
                  href={`/evenements/${e.slug}`}
                  className="flex flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:bg-surface"
                >
                  <span className="w-[92px] shrink-0 font-mono text-[12px] uppercase tracking-[0.04em] text-muted">
                    {e.d} {monthAbbr(e, loc).toLowerCase()} {e.y}
                  </span>
                  <span className="min-w-[200px] flex-1">
                    <span className="block font-display text-[17px] leading-snug wrap-anywhere">
                      {e.title}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] text-muted wrap-anywhere">
                      {L.types[e.type]} · {L.formats[e.format]} ·{' '}
                      {e.langs.map((l) => l.toUpperCase()).join(' / ')} ·{' '}
                      {e.place}
                    </span>
                  </span>
                  <span className="ms-auto text-end">
                    <span className="block text-[13px] font-semibold text-accent-text">
                      {L.replays.watch}
                    </span>
                    {e.durationMin ? (
                      <span className="block font-mono text-[11px] text-muted">
                        {L.replays.durationLabel(e.durationMin)}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </RevealItem>
            ))}
          </RevealGroup>
          <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
            {L.replays.note}
          </p>
        </div>
      </section>
    </div>
  );
}

function EventCard({
  event,
  L,
  locale,
  cancelledLabel,
}: {
  event: AgendaEvent;
  L: ReturnType<typeof getEventsLabels>;
  locale: Locale;
  cancelledLabel: string;
}) {
  return (
    <article className="flex h-full gap-4 rounded-sm border border-line bg-surface p-4">
      <div className="flex w-[60px] shrink-0 flex-col items-center justify-center rounded-sm border border-line bg-paper py-2 text-center">
        <div className="font-mono text-[22px] font-semibold leading-none text-ink">
          {event.d}
        </div>
        <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.04em] text-accent-text">
          {monthAbbr(event, locale)}
        </div>
        <div className="font-mono text-[11px] text-muted">{event.y}</div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
          {L.types[event.type]}
          {event.status === 'cancelled' ? (
            <Badge variant="outline" size="label">
              {cancelledLabel}
            </Badge>
          ) : null}
        </div>
        <h3 className="mt-1 font-display text-[18px] leading-snug wrap-anywhere">
          <Link
            href={`/evenements/${event.slug}`}
            className="text-ink hover:underline"
          >
            {event.title}
          </Link>
        </h3>
        <div className="mt-1.5 text-[13px] text-ink-soft wrap-anywhere">
          {event.place}{' '}
          <span className="text-muted">· {L.formats[event.format]}</span>
        </div>
        <div className="mt-2">
          <Badge variant="accent">{L.themes[event.theme] ?? event.theme}</Badge>
        </div>
        <div className="mt-auto flex items-center justify-between gap-3 pt-3">
          <Link
            href={`/evenements/${event.slug}`}
            className="inline-flex items-center justify-center rounded-sm border border-line-strong px-3 py-1.5 text-[13px] font-semibold text-ink transition-colors hover:border-ink hover:bg-accent-tint"
          >
            {L.results.details}
          </Link>
          <span className="font-mono text-[11px] text-muted">
            {event.langs.map((l) => l.toUpperCase()).join(' / ')}
          </span>
        </div>
      </div>
    </article>
  );
}
