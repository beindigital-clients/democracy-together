import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { resolveLocale, intlLocale } from '@/i18n/locale';
import {
  FEATURED_SLUG,
  getEventsLabels,
  langLabel,
  monthAbbr,
  type EventData,
} from '@/lib/events-content';
import { loadEvent } from '@/lib/contenus/load';
import type { AgendaEvent } from '@/lib/contenus/agenda';
import { VisioAccess } from '@/components/events/visio-access';
import { eventJsonLd, jsonLdScript, hreflangFor } from '@/lib/seo';
import { EventRegisterForm } from '@/components/events/event-register-form';
import { ReminderForm } from '@/components/events/reminder-form';
import type { Locale } from '@/i18n/routing';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

function longDate(e: EventData, loc: Locale): string {
  return new Intl.DateTimeFormat(intlLocale(loc), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(Date.UTC(e.y, e.mo - 1, e.d));
}

// Time of a timed event, in the time zone of its VENUE, zone named:
// "14:00 – 15:30 (UTC+2)". `null` for an all-day event.
function timeRange(e: AgendaEvent, loc: Locale): string | null {
  if (!e.startTime) return null;
  const fmt = (ms: number, withZone: boolean) =>
    new Intl.DateTimeFormat(intlLocale(loc), {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: e.timezone,
      ...(withZone ? { timeZoneName: 'short' as const } : {}),
    }).format(ms);
  return e.endTime
    ? `${fmt(e.startsAt, false)} – ${fmt(e.endsAt, true)}`
    : fmt(e.startsAt, true);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const loc = resolveLocale(locale);
  const L = getEventsLabels(loc);
  const detail = await loadEvent(slug, loc);
  if (!detail) return {};
  return {
    title: detail.event.title,
    description: detail.event.lead ?? L.hero.lead,
    alternates: {
      canonical: `${SITE}/${locale}/evenements/${slug}`,
      languages: hreflangFor(`evenements/${slug}`),
    },
  };
}

const WRAP = 'mx-auto w-full max-w-[1180px] px-4 sm:px-6';

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const loc = resolveLocale(locale);
  const L = getEventsLabels(loc);
  const tAgenda = await getTranslations({ locale, namespace: 'agenda' });
  const tReminder = await getTranslations({ locale, namespace: 'reminder' });
  // The page comes from the `contentEvents` table, or from the hard-coded
  // fallback catalogue (empty table, backend unreachable) — same URL either way.
  const detail = await loadEvent(slug, loc);
  if (!detail) notFound();
  const { event, full } = detail;

  const d = L.detail;
  // The RICH content (programme, speakers, ticketing) is hard-coded for the
  // inaugural conference only; any other page is built from its fields.
  const isFeatured = event.slug === FEATURED_SLUG;
  const conf = d.conf;
  const lead = isFeatured ? conf.lead : (event.lead ?? d.leadFallback);
  const cancelled = event.status === 'cancelled';
  // Registrations open: upcoming, published, not full. Same rule as the
  // server (`requireOpenEvent` + capacity) — the UI merely states it.
  const open = event.upcoming && !cancelled && !full;
  const replayUrl = detail.replayUrl ?? event.replayUrl ?? null;
  const hours = timeRange(event, loc);
  const related = detail.others
    .filter((e) => e.upcoming && e.status === 'published')
    .sort((a, b) => a.startsAt - b.startsAt)
    .slice(0, 3);

  // `Event` record (F-03, P1 no. 4 of the action plan). It reuses the
  // DISPLAYED standfirst (`lead`), not the list page's one that
  // `generateMetadata` serves as description: a record must describe the
  // page it is on.
  const fiche = eventJsonLd({
    name: event.title,
    slug: event.slug,
    locale,
    description: lead,
    start: { y: event.y, mo: event.mo, d: event.d },
    format: event.format,
    placeName: event.place,
    inLanguage: event.langs,
  });

  return (
    <div>
      {/* Structured data: placed in the SERVED HTML, hence readable by a
          crawler that does not run JavaScript. The organization itself is
          declared once by the layout and simply referenced here. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(fiche) }}
      />
      <div className={`${WRAP} pt-8`}>
        <p className="text-[13px] text-muted">
          <Link href="/" className="text-muted hover:text-ink">
            {L.hero.crumbHome}
          </Link>{' '}
          /{' '}
          <Link href="/evenements" className="text-muted hover:text-ink">
            {L.hero.title}
          </Link>{' '}
          / <span className="wrap-anywhere">{event.title}</span>
        </p>
      </div>

      {/* Hero */}
      <header className={`${WRAP} pb-10 pt-6`}>
        <Reveal className="grid gap-8 lg:grid-cols-[1.3fr_1fr] lg:items-center">
          <div>
            <div className="flex flex-wrap gap-2">
              {d.badges(event).map((b, i) => (
                <span
                  key={b}
                  className={`inline-flex items-center rounded-pill px-3 py-1 text-[12.5px] font-medium ${
                    i === 0
                      ? 'border border-accent-edge bg-accent-tint text-accent-text'
                      : 'border border-line bg-surface-2 text-ink-soft'
                  }`}
                >
                  {b}
                </span>
              ))}
            </div>
            <p className="mt-4 font-mono text-xs uppercase tracking-[0.12em] text-muted">
              {d.eyebrow}
            </p>
            <h1 className="mt-2 font-display text-[clamp(30px,4.2vw,48px)] font-medium leading-[1.08] tracking-[-0.015em] wrap-anywhere">
              {event.title}
            </h1>
            {cancelled ? (
              <p
                role="status"
                className="mt-4 max-w-[60ch] rounded-sm border border-line-strong bg-surface-2 px-4 py-3 text-sm font-semibold text-ink"
              >
                {tAgenda('cancelledNotice')}
              </p>
            ) : null}
            <p className="mt-4 max-w-[60ch] text-lg leading-relaxed text-ink-soft wrap-anywhere">
              {lead}
            </p>
            <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-3 border-y border-line py-4">
              <div>
                <dt className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                  {d.factDate}
                </dt>
                <dd className="mt-0.5 font-mono text-sm font-medium text-ink">
                  {longDate(event, loc)}
                </dd>
              </div>
              {hours ? (
                <div>
                  <dt className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                    {tAgenda('factTime')}
                  </dt>
                  <dd className="mt-0.5 font-mono text-sm font-medium text-ink">
                    {hours}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                  {d.factPlace}
                </dt>
                <dd className="mt-0.5 text-sm font-medium text-ink wrap-anywhere">
                  {event.place}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                  {d.factFormat}
                </dt>
                <dd className="mt-0.5 text-sm font-medium text-ink">
                  {L.formats[event.format]}
                </dd>
              </div>
            </dl>
            <div className="mt-6 flex flex-wrap gap-3">
              {/* A PAST event no longer has a form: the hero button pointed to
                  an anchor that no longer exists (cross-check of
                  27/09). */}
              {open || (isFeatured && event.upcoming && !cancelled) ? (
                <a
                  href={isFeatured ? '#billetterie' : '#inscription'}
                  className="inline-flex items-center justify-center rounded-sm bg-accent px-[18px] py-[11px] text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-strong"
                >
                  {d.register}
                </a>
              ) : null}
              {isFeatured ? (
                <a
                  href="#programme"
                  className="inline-flex items-center justify-center rounded-sm border border-line-strong px-[18px] py-[11px] text-sm font-semibold text-ink transition-colors hover:border-ink hover:bg-accent-tint"
                >
                  {d.seeProgramme}
                </a>
              ) : null}
              <a
                href={`/${locale}/evenements/${event.slug}/agenda.ics`}
                download
                className="inline-flex items-center justify-center rounded-sm border border-line-strong px-[18px] py-[11px] text-sm font-semibold text-ink transition-colors hover:border-ink hover:bg-accent-tint"
              >
                {tAgenda('addToCalendar')}
              </a>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-md border border-line">
            {event.image ? (
              <div className="relative aspect-[4/3]">
                <Image
                  src={event.image.url}
                  alt={event.image.alt}
                  lang={event.image.altLang}
                  fill
                  unoptimized
                  sizes="(max-width: 1024px) 100vw, 460px"
                  className="object-cover"
                />
              </div>
            ) : (
              <>
                <span className="absolute start-3 top-3 z-10 rounded-pill bg-ink/85 px-2.5 py-1 font-mono text-[11px] text-paper">
                  {d.visualPin}
                </span>
                <div className="relative aspect-[4/3]">
                  {/* ILLUSTRATION photo (the same for several pieces of content):
                    decorative, ignored by assistive technologies (RGAA 1.2, 27/09 audit). */}
                  <Image
                    src="/library/paris.jpg"
                    alt=""
                    fill
                    sizes="(max-width: 1024px) 100vw, 460px"
                    className="object-cover"
                  />
                </div>
                <p className="bg-surface px-3 py-2 text-[12px] text-muted">
                  {d.visualCap}
                </p>
              </>
            )}
          </div>
        </Reveal>
      </header>

      {/* Body */}
      <div className={`${WRAP} grid gap-12 pb-16 lg:grid-cols-[1fr_330px]`}>
        <div>
          {/* The day */}
          <Reveal as="section" id="presentation">
            <h2 className="font-display text-2xl">{d.sections.day}</h2>
            <div className="mt-4">
              {(isFeatured
                ? conf.dayIntro
                : [event.lead ?? d.leadFallback]
              ).map((p, i) => (
                <p
                  key={i}
                  className={`mb-4 max-w-[68ch] leading-relaxed text-ink-soft wrap-anywhere ${i === 0 ? 'font-display text-lg text-ink' : ''}`}
                >
                  {p}
                </p>
              ))}
            </div>
          </Reveal>

          {isFeatured ? (
            <>
              {/* Programme */}
              <Reveal
                as="section"
                id="programme"
                className="mt-12 scroll-mt-24"
              >
                <h2 className="font-display text-2xl">
                  {d.sections.programme}
                </h2>
                <p className="mt-2 max-w-[68ch] text-[15px] text-muted">
                  {conf.progIntro}
                </p>
                <RevealGroup as="ol" className="mt-6 flex flex-col">
                  {conf.programme.map((s) => (
                    <RevealItem
                      as="li"
                      key={s.time + s.title}
                      className="flex gap-5 border-t border-line py-5 first:border-t-0"
                    >
                      <div className="w-[64px] shrink-0">
                        <div className="font-mono text-[15px] font-semibold text-ink">
                          {s.time}
                        </div>
                        <div className="mt-0.5 font-mono text-[11px] text-muted">
                          {s.dur}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-accent-text">
                          {s.kind}
                        </span>
                        <h3 className="mt-1 font-display text-lg leading-snug">
                          {s.title}
                        </h3>
                        <p className="mt-1 max-w-[60ch] text-[15px] leading-relaxed text-ink-soft">
                          {s.body}
                        </p>
                        {s.who ? (
                          <p className="mt-1.5 text-[13px] italic text-muted">
                            {s.who}
                          </p>
                        ) : null}
                      </div>
                    </RevealItem>
                  ))}
                </RevealGroup>
              </Reveal>

              {/* Speakers */}
              <Reveal as="section" id="intervenants" className="mt-12">
                <h2 className="font-display text-2xl">{d.sections.speakers}</h2>
                <p className="mt-2 max-w-[68ch] text-[15px] text-muted">
                  {conf.speakersIntro}
                </p>
                <RevealGroup as="ul" className="mt-6 grid gap-4 sm:grid-cols-2">
                  {conf.speakers.map((sp) => (
                    <RevealItem
                      as="li"
                      key={sp.name}
                      className="flex gap-3.5 rounded-sm border border-line bg-surface p-4"
                    >
                      <span
                        aria-hidden="true"
                        className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent-tint font-mono font-semibold text-accent-text"
                      >
                        {sp.initials}
                      </span>
                      <div>
                        <h3 className="font-display text-[17px] leading-tight">
                          {sp.name}
                        </h3>
                        <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
                          {sp.role}
                        </p>
                        {sp.founder ? (
                          <span className="mt-1.5 inline-block rounded-pill border border-accent-edge bg-accent-tint px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.06em] text-accent-text">
                            {d.founderBadge}
                          </span>
                        ) : null}
                      </div>
                    </RevealItem>
                  ))}
                </RevealGroup>
              </Reveal>

              {/* Practical information */}
              <Reveal as="section" id="infos" className="mt-12 scroll-mt-24">
                <h2 className="font-display text-2xl">{d.sections.infos}</h2>
                <RevealGroup className="mt-6 grid gap-4 sm:grid-cols-2">
                  {conf.infos.map((info) => (
                    <RevealItem
                      key={info.title}
                      className="rounded-sm border border-line bg-surface p-5"
                    >
                      <div className="font-mono text-[11px] uppercase tracking-[0.06em] text-accent-text">
                        {info.ic}
                      </div>
                      <h3 className="mt-1.5 font-display text-lg leading-snug">
                        {info.title}
                      </h3>
                      <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">
                        {info.body}
                      </p>
                    </RevealItem>
                  ))}
                </RevealGroup>
              </Reveal>
            </>
          ) : (
            <Reveal as="section" id="infos" className="mt-10 scroll-mt-24">
              <h2 className="font-display text-2xl">{d.sections.infos}</h2>
              <dl className="mt-4 grid max-w-[60ch] grid-cols-[auto_1fr] gap-x-8 gap-y-3 text-sm">
                <dt className="text-muted">{d.factDate}</dt>
                <dd className="font-medium text-ink">{longDate(event, loc)}</dd>
                <dt className="text-muted">{d.factPlace}</dt>
                <dd className="font-medium text-ink wrap-anywhere">
                  {event.place}
                </dd>
                <dt className="text-muted">{d.factFormat}</dt>
                <dd className="font-medium text-ink">
                  {L.formats[event.format]}
                </dd>
                <dt className="text-muted">{L.filter.lang}</dt>
                <dd className="font-medium text-ink">
                  {event.langs.map((l) => langLabel(L, l, loc)).join(' / ')}
                </dd>
              </dl>
            </Reveal>
          )}
        </div>

        {/* Sidebar: ticketing (conference) or simple registration */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          {isFeatured && !cancelled && event.upcoming ? (
            <div
              id="billetterie"
              className="scroll-mt-24 overflow-hidden rounded-md border border-line bg-surface"
            >
              <div className="border-b border-line px-5 py-4">
                <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                  {conf.ticket.eyebrow}
                </p>
                <h2 className="mt-1 font-display text-xl">
                  {conf.ticket.title}
                </h2>
              </div>
              <div className="p-5">
                <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                  {conf.ticket.legend}
                </p>
                <ul className="flex flex-col gap-2.5">
                  {conf.ticket.tiers.map((t, i) => (
                    <li
                      key={t.name}
                      className={`flex items-center gap-3 rounded-sm border p-3 ${i === 0 ? 'border-accent-edge bg-accent-tint' : 'border-line'}`}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[14px] font-medium text-ink">
                          {t.name}
                        </span>
                        <span className="block text-[12px] text-muted">
                          {t.desc}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[14px] font-semibold text-ink">
                        {t.price}
                      </span>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/adhesion"
                  className="mt-4 flex w-full items-center justify-center rounded-sm bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-strong"
                >
                  {conf.ticket.reserve}
                </Link>
                <p className="mt-3 text-[11px] leading-relaxed text-muted">
                  {conf.ticket.disclaimer}
                </p>
              </div>
            </div>
          ) : cancelled ? (
            <div
              id="annulation"
              className="scroll-mt-24 rounded-md border border-line bg-surface p-5"
            >
              <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                {tAgenda('cancelled')}
              </p>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
                {tAgenda('cancelledNotice')}
              </p>
            </div>
          ) : event.upcoming && full ? (
            <div
              id="complet"
              className="scroll-mt-24 rounded-md border border-line bg-surface p-5"
            >
              <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                {tAgenda('full')}
              </p>
              <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
                {tAgenda('fullNotice')}
              </p>
            </div>
          ) : event.upcoming ? (
            <div
              id="inscription"
              className="scroll-mt-24 rounded-md border border-line bg-surface p-5"
            >
              <h2 className="font-display text-lg">{d.register}</h2>
              <div className="mt-4">
                <EventRegisterForm
                  eventSlug={event.slug}
                  eventTitle={event.title}
                />
              </div>
            </div>
          ) : (
            // PAST event: the registration form was rendered anyway, and the
            // registration accepted and stored (measured on 27/09).
            // Instead: the REPLAY block (A-10) — the link to the published
            // replay if there is one, otherwise an honest note and the way to
            // the replays page.
            <div
              id="rediffusion"
              className="scroll-mt-24 rounded-md border border-line bg-surface p-5"
            >
              <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                {L.filter.past}
              </p>
              <h2 className="mt-1 font-display text-lg">{d.replay.title}</h2>
              {replayUrl ? (
                <a
                  href={replayUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 flex w-full items-center justify-center rounded-sm bg-accent px-4 py-2.5 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-strong"
                >
                  {d.replay.available}
                </a>
              ) : (
                <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">
                  {d.replay.soon}
                </p>
              )}
              <Link
                href="/replays"
                className="mt-3 inline-block text-sm font-semibold text-accent-text hover:underline"
              >
                {d.replay.seeAll}
              </Link>
            </div>
          )}

          {/* Video conference (A-10, F-54) — UPCOMING online or hybrid
              event. The link is NEVER rendered here by the server: it is
              reserved for registrants, and it is `VisioAccess` that requests it
              for the signed-in account. */}
          {event.upcoming && !cancelled && event.format !== 'presentiel' ? (
            <div className="mt-5 rounded-md border border-line bg-surface p-5">
              <h2 className="font-display text-lg">{d.replay.visioTitle}</h2>
              {event.hasVisio ? (
                <VisioAccess
                  slug={event.slug}
                  defaultText={d.replay.visioSent}
                />
              ) : (
                <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
                  {d.replay.visioSent}
                </p>
              )}
            </div>
          ) : null}

          {isFeatured ? (
            <dl className="mt-5 overflow-hidden rounded-md border border-line bg-surface">
              {conf.recap.map((r, i) => (
                <div
                  key={r.k}
                  className={`flex justify-between gap-4 px-5 py-3 text-[13.5px] ${i === 0 ? '' : 'border-t border-line'}`}
                >
                  <dt className="text-muted">{r.k}</dt>
                  <dd className="text-end font-medium text-ink">{r.v}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          {/* E-mail reminder (F-55) — upcoming events only. */}
          {event.upcoming && !cancelled && !event.started ? (
            <div className="mt-5 rounded-md border border-line bg-surface p-5">
              <h2 className="font-display text-lg">{tReminder('title')}</h2>
              <div className="mt-4">
                <ReminderForm eventSlug={event.slug} />
              </div>
            </div>
          ) : null}
        </aside>
      </div>

      {/* Resources (conference) */}
      {isFeatured ? (
        <section className="border-t border-line bg-surface">
          <div className={`${WRAP} py-14`}>
            <Reveal>
              <h2 className="font-display text-[clamp(24px,3vw,32px)]">
                {d.resources}
              </h2>
            </Reveal>
            <RevealGroup className="mt-6 grid gap-4 md:grid-cols-3">
              {conf.resources.map((r) => (
                <RevealItem
                  key={r.title}
                  className="rounded-sm border border-line bg-paper p-5"
                >
                  <h3 className="font-display text-lg">{r.title}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
                    {r.body}
                  </p>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </section>
      ) : null}

      {/* Other events */}
      {related.length ? (
        <section className={`${WRAP} py-14`}>
          <Reveal>
            <h2 className="mb-6 font-display text-[clamp(24px,3vw,32px)]">
              {d.related}
            </h2>
          </Reveal>
          <RevealGroup className="grid gap-4 sm:grid-cols-3">
            {related.map((e) => (
              <RevealItem key={e.slug}>
                <Link
                  href={`/evenements/${e.slug}`}
                  className="flex h-full flex-col rounded-sm border border-line bg-surface p-5 transition-colors hover:border-line-strong"
                >
                  <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                    {e.d} {monthAbbr(e, loc).toLowerCase()} {e.y} ·{' '}
                    {L.types[e.type]}
                  </span>
                  <h3 className="mt-2 font-display text-[17px] leading-snug wrap-anywhere">
                    {e.title}
                  </h3>
                  <span className="mt-2 text-[13px] text-ink-soft wrap-anywhere">
                    {e.place} · {L.formats[e.format]}
                  </span>
                </Link>
              </RevealItem>
            ))}
          </RevealGroup>
        </section>
      ) : null}
    </div>
  );
}
