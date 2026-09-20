import type { Metadata } from 'next';
import Image from 'next/image';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { UrlSortSelect } from '@/components/ui/url-sort-select';
import { resolveLocale } from '@/i18n/locale';
import {
  EVENTS,
  FEATURED_SLUG,
  EVENT_SORTS,
  type EventData,
  type EventFacetKey,
  getEventsLabels,
  parseEventFilters,
  filterAndSortEvents,
  computeEventFacets,
  buildEventHref,
  toggleEventHref,
  hasActiveEventFilters,
  monthAbbr,
} from '@/lib/events-content';

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
      languages: {
        fr: `${SITE}/fr/evenements`,
        en: `${SITE}/en/evenements`,
        'x-default': `${SITE}/fr/evenements`,
      },
    },
  };
}

const WRAP = 'mx-auto w-full max-w-[1240px] px-4 sm:px-6';

const FACET_OPTIONS: {
  key: EventFacetKey;
  dict: 'types' | 'regions' | 'formats' | 'langName';
}[] = [
  { key: 'types', dict: 'types' },
  { key: 'regions', dict: 'regions' },
  { key: 'formats', dict: 'formats' },
  { key: 'langs', dict: 'langName' },
];

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
  const filters = parseEventFilters(await searchParams);
  const results = filterAndSortEvents(filters, L);
  const facets = computeEventFacets(filters, L);

  const replays = EVENTS.filter((e) => !e.upcoming).sort(
    (a, b) => b.y * 10000 + b.mo * 100 + b.d - (a.y * 10000 + a.mo * 100 + a.d),
  );

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
      {/* En-tête */}
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
              <input
                type="search"
                name="q"
                defaultValue={filters.q ?? ''}
                placeholder={L.hero.searchPlaceholder}
                aria-label={L.hero.searchPlaceholder}
                className="flex-1 rounded-sm border border-line-strong bg-surface px-4 py-2.5 text-base text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              />
              <button
                type="submit"
                className="shrink-0 rounded-sm bg-accent px-5 py-2.5 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-strong"
              >
                {L.hero.searchCta}
              </button>
            </form>
          </Reveal>
        </div>
      </header>

      {/* Événement en vedette */}
      <section className={`${WRAP} py-10`}>
        <Reveal className="grid items-stretch gap-0 overflow-hidden rounded-md border border-line bg-surface md:grid-cols-[1.05fr_1fr]">
          <div className="relative min-h-[240px]">
            <Image
              src="/library/paris.jpg"
              alt={L.featured.title}
              fill
              sizes="(max-width: 768px) 100vw, 620px"
              className="object-cover"
            />
            <span className="absolute left-4 top-4 rounded-pill bg-accent px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-accent-contrast">
              {L.featuredBadge}
            </span>
          </div>
          <div className="p-6 md:p-8">
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
                  <dt className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">
                    {f.k}
                  </dt>
                  <dd className="mt-0.5 text-sm font-medium text-ink">{f.v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href={`/evenements/${FEATURED_SLUG}`}
                className="inline-flex items-center justify-center rounded-sm bg-accent px-[18px] py-[11px] text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-strong"
              >
                {L.featured.register}
              </Link>
              <Link
                href={`/evenements/${FEATURED_SLUG}`}
                className="inline-flex items-center justify-center rounded-sm border border-line-strong px-[18px] py-[11px] text-sm font-semibold text-ink transition-colors hover:border-ink hover:bg-accent-tint"
              >
                {L.featured.details}
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Liste filtrable */}
      <main
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
                  q: undefined,
                })}
                className="text-[12.5px] text-accent-text hover:underline"
              >
                {L.filter.reset}
              </Link>
            ) : null}
          </div>

          {/* Période (segmenté) */}
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

          {FACET_OPTIONS.map((g) => {
            const opts = facets[g.key];
            if (opts.length === 0) return null;
            return (
              <fieldset key={g.key} className="border-t border-line py-4">
                <legend className="mb-3 font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
                  {g.key === 'types'
                    ? L.filter.type
                    : g.key === 'regions'
                      ? L.filter.region
                      : g.key === 'formats'
                        ? L.filter.format
                        : L.filter.lang}
                </legend>
                <div className="flex flex-col">
                  {opts.map(({ value, count }) => {
                    const active = filters[g.key].includes(value);
                    const label = (L[g.dict] as Record<string, string>)[value];
                    return (
                      <Link
                        key={value}
                        href={toggleEventHref(filters, g.key, value)}
                        aria-current={active ? 'true' : undefined}
                        className="group flex items-center gap-2.5 py-1 text-sm text-ink-soft transition-colors hover:text-ink"
                      >
                        <span
                          aria-hidden="true"
                          className={`grid h-4 w-4 shrink-0 place-items-center rounded-[3px] border transition-colors ${active ? 'border-accent bg-accent text-accent-contrast' : 'border-line-strong bg-surface group-hover:border-ink'}`}
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
                        <span className="ml-auto font-mono text-[11px] text-muted">
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

        <section aria-label="Résultats">
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
                  <EventCard event={e} L={L} locale={loc} />
                </RevealItem>
              ))}
            </RevealGroup>
          )}
        </section>
      </main>

      {/* Rediffusions */}
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
              {L.replays.cta} →
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
                    <span className="block font-display text-[17px] leading-snug">
                      {L.titles[e.slug]}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] text-muted">
                      {L.types[e.type]} · {L.formats[e.format]} ·{' '}
                      {e.langs.map((l) => l.toUpperCase()).join(' / ')} ·{' '}
                      {L.cities[e.cityKey]}
                    </span>
                  </span>
                  <span className="ml-auto text-right">
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
}: {
  event: EventData;
  L: ReturnType<typeof getEventsLabels>;
  locale: 'fr' | 'en';
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
        <div className="font-mono text-[10px] text-muted">{event.y}</div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
          {L.types[event.type]}
        </div>
        <h3 className="mt-1 font-display text-[18px] leading-snug">
          <Link
            href={`/evenements/${event.slug}`}
            className="text-ink hover:underline"
          >
            {L.titles[event.slug]}
          </Link>
        </h3>
        <div className="mt-1.5 text-[13px] text-ink-soft">
          {L.cities[event.cityKey]}{' '}
          <span className="text-muted">· {L.formats[event.format]}</span>
        </div>
        <div className="mt-2">
          <span className="inline-flex items-center rounded-pill border border-accent-edge bg-accent-tint px-2.5 py-0.5 text-[11.5px] font-medium text-accent-text">
            {L.themes[event.theme]}
          </span>
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
