import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { NewsletterForm } from '@/components/newsletter/newsletter-form';
import { Badge } from '@/components/ui/badge';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { AnimatedBar } from '@/components/motion/animated-bar';
import { HomeHero } from '@/components/home/home-hero';
import type { RegionMapItem } from '@/components/map/region-map';
import { RegionGlobe } from '@/components/map/region-globe';
import { MAP_DATA } from '@/lib/barometer-content';
import { routing } from '@/i18n/routing';
import { getHomeContent } from '@/lib/home';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

// Couleurs de la carte par catégorie (1 = plus libre … 5).
const CAT_FILL = [
  'var(--color-bar-1)',
  'var(--color-bar-2)',
  'var(--color-bar-3)',
  'var(--color-bar-4)',
  'var(--color-bar-5)',
];

function resolve(locale: string) {
  return (hasLocale(routing.locales, locale) ? locale : routing.defaultLocale) as
    | 'fr'
    | 'en';
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const c = await getHomeContent(resolve(locale));
  return {
    description: c.hero.lead,
    alternates: {
      canonical: `${SITE}/${locale}`,
      languages: { fr: `${SITE}/fr`, en: `${SITE}/en`, 'x-default': `${SITE}/fr` },
    },
  };
}

const WRAP = 'mx-auto max-w-[1200px] px-4 sm:px-6';
const EYEBROW = 'font-mono text-xs uppercase tracking-[0.14em] text-muted';

export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = resolve(locale);
  const c = await getHomeContent(loc);
  const mapItems: RegionMapItem[] = MAP_DATA.map((d) => ({
    name: d.name,
    region: d.region,
    fill: CAT_FILL[d.cat - 1],
    title: loc === 'en' ? d.en : d.fr,
    rows: [{ label: '', value: d.index }],
  }));

  return (
    <div>
      {/* ===== Hero ===== */}
      <section className="border-b border-line">
        <div className={`${WRAP} py-12 md:py-16`}>
          {/* Hero cinématique : entrée séquentielle (titre mot par mot, etc.). */}
          <HomeHero hero={c.hero} />
        </div>
      </section>

      {/* ===== Mission (bento) — `.mission{bg surface}` + grille 6 colonnes ===== */}
      <section className="bg-surface">
        <div className={`${WRAP} py-16 md:py-20`}>
          <Reveal className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="max-w-[18ch] font-display text-[clamp(28px,3.4vw,38px)] font-medium leading-[1.1] tracking-[-0.02em]">
              {c.mission.title}
            </h2>
            <Button asChild variant="ghost">
              <Link href="/a-propos">{c.mission.cta}</Link>
            </Button>
          </Reveal>

          <RevealGroup className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-6">
            {/* 01 — carte vedette pleine largeur, fond accent, horizontale */}
            <RevealItem className="rounded-sm bg-accent p-8 text-accent-contrast md:col-span-6 md:grid md:grid-cols-[1.4fr_1fr] md:items-center md:gap-6">
              <div>
                <p className="font-mono text-xs tracking-[0.08em] text-accent-contrast/85">
                  {c.mission.cells[0].ix}
                </p>
                <h3 className="mt-3 font-display text-[23px] leading-snug text-accent-contrast">
                  {c.mission.cells[0].title}
                </h3>
              </div>
              <p className="mt-3 text-[14.5px] leading-relaxed text-accent-contrast/80 md:mt-0">
                {c.mission.cells[0].body}
              </p>
            </RevealItem>

            {/* 02 (large) · 03 / 04 (petites) — cartes claires */}
            {c.mission.cells.slice(1).map((cell, i) => (
              <RevealItem
                key={cell.ix}
                className={`rounded-sm border border-line bg-paper p-6 ${i === 0 ? 'md:col-span-4' : 'md:col-span-2'}`}
              >
                <p className="font-mono text-xs tracking-[0.08em] text-accent-text">
                  {cell.ix}
                </p>
                <h3 className="mt-3 font-display text-[23px] leading-snug">
                  {cell.title}
                </h3>
                <p className="mt-2 text-[14.5px] leading-relaxed text-ink-soft">
                  {cell.body}
                </p>
              </RevealItem>
            ))}

            {/* Le Baromètre — carte large (span 4) */}
            <RevealItem className="rounded-sm border border-line bg-paper p-6 md:col-span-4">
              <p className="font-mono text-xs tracking-[0.08em] text-accent-text">
                {c.mission.barometer.label}
              </p>
              <h3 className="mt-3 font-display text-[23px] leading-snug">
                {c.mission.barometer.title}
              </h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-ink-soft">
                {c.mission.barometer.body}
              </p>
            </RevealItem>
          </RevealGroup>
        </div>
      </section>

      {/* ===== Dernières analyses — section `paper` ===== */}
      <section>
        <div className={`${WRAP} py-16 md:py-20`}>
          <Reveal className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-display text-3xl md:text-4xl">
              {c.analyses.title}
            </h2>
            <Link
              href="/bibliotheque"
              className="font-mono text-xs uppercase tracking-[0.1em] text-accent-text hover:underline"
            >
              {c.analyses.cta} →
            </Link>
          </Reveal>

          <Reveal className="mt-8 rounded-md border border-line bg-surface p-6 shadow-card md:p-8">
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
              {c.analyses.featured.tag}
            </p>
            <h3 className="mt-3 max-w-[24ch] font-display text-2xl leading-snug md:text-3xl">
              {c.analyses.featured.title}
            </h3>
            <p className="mt-3 max-w-[70ch] leading-relaxed text-ink-soft">
              {c.analyses.featured.body}
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {c.analyses.featured.chips.map((ch) => (
                <Badge key={ch} variant="accent">
                  {ch}
                </Badge>
              ))}
            </div>
          </Reveal>

          <RevealGroup className="mt-4 grid gap-4 md:grid-cols-3">
            {c.analyses.items.map((it) => (
              <RevealItem
                key={it.title}
                className="rounded-md border border-line bg-surface p-5"
              >
                <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-accent-text">
                  {it.tag}
                </p>
                <h3 className="mt-2 font-display text-lg leading-snug">
                  {it.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  {it.body}
                </p>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ===== Baromètre — section `surface` ===== */}
      <section className="bg-surface">
        <div className={`${WRAP} py-16 md:py-20`}>
        <Reveal>
          <p className={EYEBROW}>{c.barometre.eyebrow}</p>
          <h2 className="mt-3 max-w-[20ch] font-display text-3xl md:text-4xl">
            {c.barometre.title}
          </h2>
          <p className="mt-4 max-w-[62ch] leading-relaxed text-ink-soft">
            {c.barometre.body}
          </p>
        </Reveal>

        <div className="mt-8 grid items-start gap-4 lg:grid-cols-2">
          <Reveal className="rounded-md border border-line bg-paper p-6">
            <ul className="space-y-3">
              {c.barometre.countries.map((co, i) => (
                <li key={co.name} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 text-sm">{co.name}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-2">
                    <AnimatedBar
                      pct={Number(co.score) * 100}
                      className="rounded-pill bg-accent"
                      delay={i * 0.1}
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right font-mono text-xs text-ink-soft">
                    {co.score}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-4 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
              {c.barometre.legend.map((l) => (
                <span key={l}>{l}</span>
              ))}
            </div>
          </Reveal>

          <Reveal className="flex min-h-[220px] flex-col rounded-md border border-line bg-paper p-6">
            <div className="flex-1">
              <RegionGlobe
                items={mapItems}
                variant="compact"
                ariaLabel={c.barometre.mapLabel}
                hint={
                  loc === 'en'
                    ? 'Hover or tap a country to see its score.'
                    : 'Survolez ou touchez un pays pour voir son score.'
                }
              />
            </div>
            <p className="mt-3 text-xs text-muted">{c.barometre.note}</p>
          </Reveal>
        </div>

        <Reveal className="mt-6 flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/barometre">{c.barometre.links[0]}</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/barometre">{c.barometre.links[1]}</Link>
          </Button>
        </Reveal>
        </div>
      </section>

      {/* ===== Cinq axes de travail — section `paper` ===== */}
      <section>
        <div className={`${WRAP} py-16 md:py-20`}>
          <Reveal>
            <h2 className="font-display text-3xl md:text-4xl">{c.axes.title}</h2>
          </Reveal>
          <RevealGroup className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {c.axes.items.map((a) => (
              <RevealItem
                key={a.n}
                className="group flex flex-col rounded-md border border-line bg-surface p-5"
              >
                <p className="font-mono text-sm text-accent-text">{a.n}</p>
                <h3 className="mt-3 font-display text-lg">{a.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  {a.body}
                </p>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ===== Événements — section `surface` ===== */}
      <section className="bg-surface">
        <div className={`${WRAP} py-16 md:py-20`}>
        <Reveal className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-display text-3xl md:text-4xl">{c.events.title}</h2>
          <Link
            href="/evenements"
            className="font-mono text-xs uppercase tracking-[0.1em] text-accent-text hover:underline"
          >
            {c.events.cta} →
          </Link>
        </Reveal>

        <div className="mt-8 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <Reveal className="flex flex-col rounded-md border border-accent-edge bg-accent-tint p-6 md:p-8">
            <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-accent-text">
              {c.events.featured.tag}
            </p>
            <h3 className="mt-3 font-display text-2xl leading-snug">
              {c.events.featured.title}
            </h3>
            <p className="mt-3 max-w-[52ch] leading-relaxed text-ink-soft">
              {c.events.featured.body}
            </p>
            <Button asChild className="mt-5 self-start">
              <Link href="/evenements">{c.events.featured.action}</Link>
            </Button>
          </Reveal>

          <RevealGroup className="flex flex-col gap-3">
            {c.events.items.map((ev) => (
              <RevealItem
                key={ev.title}
                className="flex gap-4 rounded-md border border-line bg-paper p-5"
              >
                <span className="shrink-0 font-mono text-sm uppercase text-accent-text">
                  {ev.date}
                </span>
                <span>
                  <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
                    {ev.kind}
                  </span>
                  <span className="mt-1 block font-display text-base leading-snug">
                    {ev.title}
                  </span>
                  <span className="mt-1 block text-xs text-muted">{ev.meta}</span>
                </span>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
        </div>
      </section>

      {/* ===== Hub jeunes (univers safran) ===== */}
      <section data-universe="jeunes" className="bg-accent text-accent-contrast">
        <div className={`${WRAP} py-16 md:py-20`}>
          <Reveal>
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-accent-contrast/80">
              {c.youth.eyebrow}
            </p>
            <h2 className="mt-3 max-w-[20ch] font-display text-3xl text-accent-contrast md:text-4xl">
              {c.youth.title}
            </h2>
            <p className="mt-4 max-w-[58ch] leading-relaxed text-accent-contrast/90">
              {c.youth.body}
            </p>
            <Link
              href="/jeunes"
              className="mt-6 inline-flex items-center justify-center rounded-sm bg-accent-contrast px-4 py-2.5 text-sm font-medium text-accent transition-opacity hover:opacity-90"
            >
              {c.youth.cta}
            </Link>
          </Reveal>

          <RevealGroup className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {c.youth.steps.map((s) => (
              <RevealItem
                key={s.n}
                className="rounded-md border border-accent-contrast/25 bg-accent-contrast/5 p-5"
              >
                <p className="font-mono text-sm text-accent-contrast/80">{s.n}</p>
                <h3 className="mt-2 font-display text-lg text-accent-contrast">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-accent-contrast/85">
                  {s.body}
                </p>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ===== Rejoindre le réseau ===== */}
      <section className={`${WRAP} py-16 md:py-20`}>
        <Reveal className="max-w-[60ch]">
          <h2 className="font-display text-3xl md:text-4xl">{c.join.title}</h2>
          <p className="mt-4 leading-relaxed text-ink-soft">{c.join.body}</p>
        </Reveal>
        <RevealGroup className="mt-8 grid gap-4 md:grid-cols-3">
          {c.join.plans.map((p) => (
            <RevealItem
              key={p.title}
              className="flex h-full flex-col rounded-md border border-line bg-surface p-6"
            >
              <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-accent-text">
                {p.label}
              </p>
              <h3 className="mt-2 font-display text-xl">{p.title}</h3>
              <ul className="mt-4 space-y-2 text-sm text-ink-soft">
                {p.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <span aria-hidden="true" className="text-accent-text">
                      →
                    </span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Button asChild className="mt-6 w-full">
                <Link href="/adhesion">{p.cta}</Link>
              </Button>
            </RevealItem>
          ))}
        </RevealGroup>
      </section>

      {/* ===== Newsletter — section `surface`, bordures haut + bas ===== */}
      <section className="border-y border-line bg-surface">
        <div className={`${WRAP} py-16`}>
          <Reveal className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div className="max-w-[44ch]">
              <h2 className="font-display text-2xl md:text-3xl">
                {c.newsletter.title}
              </h2>
              <p className="mt-2 text-ink-soft">{c.newsletter.body}</p>
            </div>
            <NewsletterForm
              placeholder={c.newsletter.placeholder}
              cta={c.newsletter.cta}
              className="max-w-md"
            />
          </Reveal>
        </div>
      </section>
    </div>
  );
}
