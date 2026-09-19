import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Reveal } from '@/components/motion/reveal';
import { routing } from '@/i18n/routing';
import {
  getEventsLabels,
  monthAbbr,
  type EventData,
} from '@/lib/events-content';
import {
  buildMonthGrid,
  monthShift,
  parseYm,
  formatYm,
} from '@/lib/calendar';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

function resolve(locale: string): 'fr' | 'en' {
  return (hasLocale(routing.locales, locale) ? locale : routing.defaultLocale);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'calendar' });
  return {
    title: t('title'),
    description: t('lead'),
    alternates: {
      canonical: `${SITE}/${locale}/evenements/calendrier`,
      languages: {
        fr: `${SITE}/fr/evenements/calendrier`,
        en: `${SITE}/en/evenements/calendrier`,
        'x-default': `${SITE}/fr/evenements/calendrier`,
      },
    },
  };
}

const WRAP = 'mx-auto w-full max-w-[1240px] px-4 sm:px-6';
const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

// Nom du mois localisé (ex. « novembre 2026 » / « November 2026 »).
function monthTitle(year: number, month: number, loc: 'fr' | 'en'): string {
  const label = new Intl.DateTimeFormat(loc === 'en' ? 'en-GB' : 'fr-FR', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export default async function CalendrierPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = resolve(locale);
  const t = await getTranslations('calendar');
  const L = getEventsLabels(loc);

  // Mois affiché : ?ym=YYYY-MM si valide, sinon le mois courant (page dynamique,
  // donc on peut lire l'horloge ici — la lib de grille, elle, reste pure).
  const now = new Date();
  const ym = parseYm((await searchParams).ym) ?? {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  };
  const grid = buildMonthGrid(ym.year, ym.month);
  const prev = monthShift(ym.year, ym.month, -1);
  const next = monthShift(ym.year, ym.month, 1);

  // Marqueur « aujourd'hui » (seulement si le mois affiché contient ce jour).
  const todayDay =
    now.getFullYear() === ym.year && now.getMonth() + 1 === ym.month
      ? now.getDate()
      : null;

  const monthEventCount = grid.weeks
    .flat()
    .reduce((sum, cell) => sum + cell.events.length, 0);

  return (
    <div>
      {/* En-tête */}
      <header className="border-b border-line">
        <div className={`${WRAP} pb-8 pt-12 md:pt-14`}>
          <Reveal>
            <p className="text-[13px] text-muted">
              <Link href="/" className="text-muted hover:text-ink">
                {L.hero.crumbHome}
              </Link>{' '}
              / <Link href="/evenements" className="text-muted hover:text-ink">{L.hero.title}</Link> /{' '}
              {t('calendarView')}
            </p>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
                  {L.hero.eyebrow}
                </p>
                <h1 className="mt-3 font-display text-[clamp(30px,4vw,46px)] font-medium leading-[1.06] tracking-[-0.02em]">
                  {t('title')}
                </h1>
              </div>
              {/* Bascule liste / calendrier */}
              <div className="inline-flex overflow-hidden rounded-sm border border-line-strong">
                <Link
                  href="/evenements"
                  className="bg-surface px-3 py-2 text-[13px] font-semibold text-ink-soft transition-colors hover:text-ink"
                >
                  {t('listView')}
                </Link>
                <span
                  aria-current="true"
                  className="bg-accent px-3 py-2 text-[13px] font-semibold text-accent-contrast"
                >
                  {t('calendarView')}
                </span>
              </div>
            </div>
            <p className="mt-4 max-w-[64ch] text-lg leading-relaxed text-ink-soft">
              {t('lead')}
            </p>
          </Reveal>
        </div>
      </header>

      <main className={`${WRAP} py-10`}>
        {/* Barre de navigation mensuelle */}
        <Reveal className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <h2 className="font-display text-2xl md:text-[28px]">
              {monthTitle(ym.year, ym.month, loc)}
            </h2>
            <span className="font-mono text-[12px] text-muted">
              {t('eventsCount', { count: monthEventCount })}
            </span>
          </div>
          <nav aria-label={t('title')} className="flex items-center gap-2">
            <Link
              href={{ pathname: '/evenements/calendrier', query: { ym: formatYm(prev.year, prev.month) } }}
              aria-label={t('prevMonth')}
              rel="prev"
              className="inline-flex items-center gap-1.5 rounded-sm border border-line-strong px-3 py-1.5 text-[13px] font-semibold text-ink transition-colors hover:border-ink hover:bg-accent-tint"
            >
              <span aria-hidden="true">←</span>
              <span className="hidden sm:inline">{t('prevMonth')}</span>
            </Link>
            <Link
              href="/evenements/calendrier"
              className="rounded-sm border border-line-strong px-3 py-1.5 text-[13px] font-semibold text-ink transition-colors hover:border-ink hover:bg-accent-tint"
            >
              {t('today')}
            </Link>
            <Link
              href={{ pathname: '/evenements/calendrier', query: { ym: formatYm(next.year, next.month) } }}
              aria-label={t('nextMonth')}
              rel="next"
              className="inline-flex items-center gap-1.5 rounded-sm border border-line-strong px-3 py-1.5 text-[13px] font-semibold text-ink transition-colors hover:border-ink hover:bg-accent-tint"
            >
              <span className="hidden sm:inline">{t('nextMonth')}</span>
              <span aria-hidden="true">→</span>
            </Link>
          </nav>
        </Reveal>

        {/* Grille calendrier (7 colonnes) */}
        <Reveal
          as="section"
          aria-label={monthTitle(ym.year, ym.month, loc)}
          className="overflow-hidden rounded-md border border-line bg-surface"
        >
          {/* En-têtes des jours */}
          <div className="grid grid-cols-7 border-b border-line bg-paper">
            {WEEKDAY_KEYS.map((key) => (
              <div
                key={key}
                className="px-2 py-2.5 text-center font-mono text-[11px] uppercase tracking-[0.08em] text-muted"
              >
                {t(`weekdays.${key}`)}
              </div>
            ))}
          </div>

          {/* Semaines */}
          <div className="grid grid-cols-7">
            {grid.weeks.flat().map((cell, i) => {
              const isToday = cell.day !== null && cell.day === todayDay;
              return (
                <div
                  key={i}
                  className={`min-h-[104px] border-b border-r border-line p-1.5 last:border-r-0 sm:min-h-[120px] ${
                    cell.day === null ? 'bg-paper/50' : 'bg-surface'
                  } ${i % 7 === 6 ? 'border-r-0' : ''}`}
                >
                  {cell.day === null ? null : (
                    <>
                      <div className="flex items-center justify-end px-1">
                        <span
                          className={`grid h-6 min-w-6 place-items-center rounded-full px-1 font-mono text-[12px] ${
                            isToday
                              ? 'bg-accent font-semibold text-accent-contrast'
                              : 'text-ink-soft'
                          }`}
                        >
                          {cell.day}
                        </span>
                      </div>
                      <ul className="mt-1 flex flex-col gap-1">
                        {cell.events.map((e) => (
                          <li key={e.slug}>
                            <CalendarEvent event={e} L={L} loc={loc} />
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </Reveal>

        {monthEventCount === 0 ? (
          <p className="mt-5 text-center text-sm text-muted">
            {t('noEventsThisMonth')}
          </p>
        ) : null}
      </main>
    </div>
  );
}

// Pastille-lien d'un événement dans une case du calendrier. La couleur de la
// barre latérale dépend du type (réutilise la palette accent/muted).
const TYPE_BAR: Record<EventData['type'], string> = {
  sommet: 'border-l-accent',
  webinaire: 'border-l-accent-edge',
  atelier: 'border-l-line-strong',
};

function CalendarEvent({
  event,
  L,
  loc,
}: {
  event: EventData;
  L: ReturnType<typeof getEventsLabels>;
  loc: 'fr' | 'en';
}) {
  return (
    <Link
      href={`/evenements/${event.slug}`}
      title={`${L.titles[event.slug]} — ${L.types[event.type]} · ${L.cities[event.cityKey]}`}
      className={`block rounded-[3px] border-l-2 bg-accent-tint px-1.5 py-1 text-[11.5px] leading-tight text-ink transition-colors hover:bg-accent-edge/40 ${TYPE_BAR[event.type]}`}
    >
      <span className="block truncate font-medium">{L.titles[event.slug]}</span>
      <span className="block truncate font-mono text-[10px] uppercase tracking-[0.04em] text-muted">
        {L.types[event.type]} · {monthAbbr(event, loc).toLowerCase()}
      </span>
    </Link>
  );
}
