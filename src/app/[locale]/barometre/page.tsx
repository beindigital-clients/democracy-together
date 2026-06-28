import type { Metadata } from 'next';
import { setRequestLocale } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { AnimatedBar } from '@/components/motion/animated-bar';
import { routing } from '@/i18n/routing';
import {
  getBarometerContent,
  CAT_BG,
  CAT_TEXT,
  MAP_DATA,
  type Trend,
} from '@/lib/barometer-content';
import type { RegionMapItem } from '@/components/map/region-map';
import { RegionGlobe } from '@/components/map/region-globe';

// Couleurs de remplissage de la carte par catégorie (1 = plus libre … 5).
const CAT_FILL = [
  'var(--color-bar-1)',
  'var(--color-bar-2)',
  'var(--color-bar-3)',
  'var(--color-bar-4)',
  'var(--color-bar-5)',
];

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

function resolve(locale: string): 'fr' | 'en' {
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
  const c = getBarometerContent(resolve(locale));
  return {
    title: c.hero.title,
    description: c.hero.lead,
    alternates: {
      canonical: `${SITE}/${locale}/barometre`,
      languages: {
        fr: `${SITE}/fr/barometre`,
        en: `${SITE}/en/barometre`,
        'x-default': `${SITE}/fr/barometre`,
      },
    },
  };
}

const WRAP = 'mx-auto w-full max-w-[1240px] px-4 sm:px-6';
const EYEBROW = 'font-mono text-xs uppercase tracking-[0.14em] text-muted';

function TrendCell({ trend }: { trend: Trend }) {
  const glyph = trend.dir === 'up' ? '▲' : trend.dir === 'down' ? '▼' : '▬';
  const color =
    trend.dir === 'up'
      ? 'text-bar-1'
      : trend.dir === 'down'
        ? 'text-bar-5'
        : 'text-muted';
  return (
    <span className={`inline-flex items-center gap-1 font-mono text-[12.5px] ${color}`}>
      <span aria-hidden="true">{glyph}</span> {trend.value}
    </span>
  );
}

function CatDot({ cat, label }: { cat: 1 | 2 | 3 | 4 | 5; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[13px]">
      <i className={`h-2.5 w-2.5 shrink-0 rounded-[3px] ${CAT_BG[cat - 1]}`} aria-hidden="true" />
      {label}
    </span>
  );
}

export default async function BarometrePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = resolve(locale);
  const c = getBarometerContent(loc);
  const catLabel = (cat: 1 | 2 | 3 | 4 | 5) => c.legend[cat - 1].label;

  // F-40 — câblage des téléchargements réels (route /[locale]/barometre/data/*).
  // Une entrée par ligne du tableau « Jeux de données » (même ordre). `formats`
  // mappe chaque badge de format vers un fichier réel ; les formats non produits
  // (XLSX) restent de simples badges. Données d'illustration (cf. en-tête).
  const dataBase = `/${locale}/barometre/data`;
  const dataRows: { primary: string; formats: Record<string, string> }[] = [
    { primary: `${dataBase}/composite.csv`, formats: { CSV: `${dataBase}/composite.csv`, JSON: `${dataBase}/composite.json` } },
    { primary: `${dataBase}/composite.csv`, formats: { CSV: `${dataBase}/composite.csv`, JSON: `${dataBase}/composite.json` } },
    { primary: `${dataBase}/dimensions.csv`, formats: { CSV: `${dataBase}/dimensions.csv` } },
    { primary: `${dataBase}/geometries.json`, formats: { JSON: `${dataBase}/geometries.json` } },
  ];
  const codebookHref = `${dataBase}/codebook.txt`;
  const mapItems: RegionMapItem[] = MAP_DATA.map((d) => ({
    name: d.name,
    region: d.region,
    fill: CAT_FILL[d.cat - 1],
    title: loc === 'en' ? d.en : d.fr,
    rows: [
      { label: c.map.indexLabel, value: d.index },
      {
        label: c.map.categoryLabel,
        value: c.legend[d.cat - 1].label,
        valueClassName: `font-medium ${CAT_TEXT[d.cat - 1]}`,
      },
    ],
  }));

  return (
    <div>
      {/* En-tête */}
      <header className="border-b border-line">
        <div className={`${WRAP} pb-12 pt-12 md:pt-16`}>
          <Reveal>
            <p className="text-[13px] text-muted">
              <Link href="/" className="text-muted hover:text-ink">
                {locale === 'en' ? 'Home' : 'Accueil'}
              </Link>{' '}
              / {c.hero.title}
            </p>
          </Reveal>
          <div className="mt-4 grid gap-10 md:grid-cols-[1.5fr_.9fr] md:items-end">
            <Reveal>
              <p className={EYEBROW}>{c.hero.eyebrow}</p>
              <h1 className="mt-4 max-w-[16ch] font-display text-[clamp(34px,4.6vw,56px)] font-medium leading-[1.05] tracking-[-0.02em]">
                {c.hero.title}
              </h1>
              <p className="mt-4 max-w-[54ch] text-lg leading-relaxed text-ink-soft">
                {c.hero.lead}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href="#methodologie"
                  className="inline-flex items-center justify-center rounded-sm bg-accent px-[18px] py-[11px] text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-strong"
                >
                  {c.hero.ctaMethod}
                </a>
                <a
                  href="#datasets"
                  className="inline-flex items-center justify-center rounded-sm border border-line-strong px-[18px] py-[11px] text-sm font-semibold text-ink transition-colors hover:border-ink hover:bg-accent-tint"
                >
                  {c.hero.ctaData}
                </a>
              </div>
              <p className="mt-4 text-[12px] italic text-muted">{c.hero.disclaimer}</p>
            </Reveal>
            <RevealGroup className="grid gap-4 sm:grid-cols-3 md:grid-cols-1">
              {c.kpis.map((k) => (
                <RevealItem
                  key={k.label}
                  className="rounded-sm border border-line bg-surface px-5 py-4"
                >
                  <div className="font-mono text-[30px] font-semibold tracking-[-0.02em] text-ink">
                    {k.value}
                  </div>
                  <div className="mt-0.5 text-[13px] text-ink-soft">{k.label}</div>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </div>
      </header>

      {/* Carte interactive (F-30) — choroplèthe Afrique-Europe (d3-geo, tracés
          calculés côté serveur). Survol/tap d'un pays -> détail ; chips de
          filtre par région. La donnée reste accessible dans la table en dessous. */}
      <section id="carte" className={`${WRAP} scroll-mt-20 py-14`}>
        <Reveal className="mb-6">
          <h2 className="font-display text-[clamp(26px,3vw,34px)]">{c.map.title}</h2>
          <p className="mt-2 max-w-[60ch] text-lg leading-relaxed text-ink-soft">
            {c.map.lead}
          </p>
        </Reveal>

        <Reveal>
          <RegionGlobe
            items={mapItems}
            hint={c.map.interactiveHint}
            ariaLabel={c.map.tilesLabel}
            chips={{
              all: c.map.chips[0],
              afrique: c.map.chips[1],
              europe: c.map.chips[2],
            }}
          />
        </Reveal>

        <p className="mt-3 text-right font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
          {c.map.note}
        </p>

        <Reveal className="mt-5 grid overflow-hidden rounded-sm border border-line sm:grid-cols-3 lg:grid-cols-5">
          {c.legend.map((lv, i) => (
            <div
              key={lv.label}
              className="flex items-center gap-2.5 border-line px-4 py-3 text-[13px] text-ink-soft [&:not(:first-child)]:border-t sm:[&:not(:first-child)]:border-l sm:[&:not(:first-child)]:border-t-0"
            >
              <i className={`h-3.5 w-3.5 shrink-0 rounded-[3px] ${CAT_BG[i]}`} aria-hidden="true" />
              {lv.label}
              <span className="ml-auto font-mono text-[11px] text-muted">{lv.range}</span>
            </div>
          ))}
        </Reveal>
      </section>

      {/* Classement */}
      <section id="classement" className="scroll-mt-20 border-y border-line bg-surface">
        <div className={`${WRAP} py-16`}>
          <Reveal className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className={EYEBROW}>{c.ranking.eyebrow}</p>
              <h2 className="mt-2 font-display text-[clamp(26px,3vw,34px)]">
                {c.ranking.title}
              </h2>
            </div>
            <a href="#datasets" className="text-sm font-semibold text-accent-text hover:underline">
              {c.ranking.cta} →
            </a>
          </Reveal>
          <Reveal className="overflow-hidden rounded-sm border border-line bg-paper">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <caption className="bg-surface-2 px-5 py-2.5 text-left font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                  {c.ranking.caption}
                </caption>
                <thead>
                  <tr className="border-y border-line text-[12px] uppercase tracking-[0.04em] text-muted">
                    <th scope="col" className="px-4 py-3 font-medium">{c.ranking.headers.rank}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{c.ranking.headers.country}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{c.ranking.headers.index}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{c.ranking.headers.category}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{c.ranking.headers.trend}</th>
                  </tr>
                </thead>
                <tbody>
                  {c.ranking.rows.map((r) => (
                    <tr key={r.country} className="border-b border-line last:border-0">
                      <td className="px-4 py-3 font-mono text-muted">{r.pos}</td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-ink">{r.country}</span>{' '}
                        <span className="font-mono text-[11px] text-muted">{r.region}</span>
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold text-ink">{r.index}</td>
                      <td className="px-4 py-3"><CatDot cat={r.cat} label={catLabel(r.cat)} /></td>
                      <td className="px-4 py-3"><TrendCell trend={r.trend} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Fiches pays */}
      <section className={`${WRAP} py-16`}>
        <Reveal className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className={EYEBROW}>{c.profiles.eyebrow}</p>
            <h2 className="mt-2 font-display text-[clamp(26px,3vw,34px)]">
              {c.profiles.title}
            </h2>
          </div>
        </Reveal>
        <RevealGroup className="grid gap-5 md:grid-cols-3">
          {c.profiles.items.map((p) => (
            <RevealItem
              key={p.country}
              className="flex flex-col rounded-sm border border-line bg-surface p-5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-xl">{p.country}</h3>
                  <div className="mt-0.5 text-[12.5px] text-muted">{p.region}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[34px] font-semibold leading-none tracking-[-0.02em] text-ink">
                    {p.score}
                  </div>
                  <span className={`mt-1 block text-[11px] font-semibold uppercase tracking-[0.06em] ${CAT_TEXT[p.cat - 1]}`}>
                    {catLabel(p.cat)}
                  </span>
                </div>
              </div>
              <div className="mt-5 flex flex-col gap-2.5">
                {p.bars.map((b, bi) => (
                  <div key={b.label} className="flex items-center gap-3 text-[12.5px]">
                    <span className="w-[42%] shrink-0 text-ink-soft">{b.label}</span>
                    <span className="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-2">
                      <AnimatedBar
                        pct={b.value}
                        className={`rounded-pill ${CAT_BG[b.cat - 1]}`}
                        delay={bi * 0.1}
                      />
                    </span>
                    <span className="w-9 shrink-0 text-right font-mono text-ink">
                      {(b.value / 100).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex items-center justify-between border-t border-line pt-3">
                <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                  {c.hero.disclaimer.split('.')[0]}
                </span>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </section>

      {/* Sous-dimensions */}
      <section id="dimensions" className="scroll-mt-20 border-y border-line bg-surface">
        <div className={`${WRAP} py-16`}>
          <Reveal className="mb-8 max-w-[58ch]">
            <p className={EYEBROW}>{c.dimensions.eyebrow}</p>
            <h2 className="mt-2 font-display text-[clamp(26px,3vw,34px)]">
              {c.dimensions.title}
            </h2>
            <p className="mt-3 text-lg leading-relaxed text-ink-soft">
              {c.dimensions.lead}
            </p>
          </Reveal>
          <RevealGroup className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {c.dimensions.items.map((d, di) => (
              <RevealItem
                key={d.ix}
                className="flex flex-col rounded-sm border border-line bg-paper p-5"
              >
                <div className="font-mono text-xs text-accent-text">{d.ix}</div>
                <h3 className="mt-2 font-display text-lg leading-tight">{d.title}</h3>
                <span className="mt-3 h-1.5 overflow-hidden rounded-pill bg-surface-2">
                  <AnimatedBar
                    pct={Math.round(parseFloat(d.mean) * 100)}
                    className={`rounded-pill ${CAT_BG[d.cat - 1]}`}
                    delay={di * 0.08}
                  />
                </span>
                <div className="mt-2 flex justify-between font-mono text-[11px] text-muted">
                  <span>{c.dimensions.meanLabel}</span>
                  <span className="text-ink">{d.mean}</span>
                </div>
                <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">{d.body}</p>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* Méthodologie */}
      <section id="methodologie" className={`${WRAP} scroll-mt-20 py-16`}>
        <Reveal className="mb-8">
          <p className={EYEBROW}>{c.methodology.eyebrow}</p>
          <h2 className="mt-2 font-display text-[clamp(26px,3vw,34px)]">
            {c.methodology.title}
          </h2>
        </Reveal>
        <div className="grid gap-8 lg:grid-cols-[1.4fr_.9fr]">
          <RevealGroup as="ol" className="flex flex-col gap-5">
            {c.methodology.steps.map((s, i) => (
              <RevealItem as="li" key={s.title} className="flex gap-4">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-pill border border-accent-edge bg-accent-tint font-mono text-sm font-semibold text-accent-text">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-display text-lg">{s.title}</h3>
                  <p className="mt-1 max-w-[60ch] text-[15px] leading-relaxed text-ink-soft">
                    {s.body}
                  </p>
                </div>
              </RevealItem>
            ))}
            <li>
              <a
                href="#datasets"
                className="mt-1 inline-flex items-center justify-center rounded-sm bg-accent px-[18px] py-[11px] text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-strong"
              >
                {c.methodology.cta}
              </a>
            </li>
          </RevealGroup>

          <Reveal className="rounded-sm border border-line bg-surface p-6">
            <h3 className="font-display text-xl">{c.methodology.guaranteesTitle}</h3>
            <ul className="mt-4 flex flex-col gap-3.5">
              {c.methodology.guarantees.map((g) => (
                <li key={g.strong} className="flex gap-3 text-[14px] leading-relaxed">
                  <span className="mt-0.5 text-accent-text" aria-hidden="true">✓</span>
                  <span className="text-ink-soft">
                    <b className="font-semibold text-ink">{g.strong}</b>
                    {g.rest}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-5 border-t border-line pt-4 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              {c.methodology.license}
            </p>
          </Reveal>
        </div>
      </section>

      {/* Datasets */}
      <section id="datasets" className="scroll-mt-20 border-y border-line bg-surface">
        <div className={`${WRAP} py-16`}>
          <Reveal className="mb-6 max-w-[52ch]">
            <p className={EYEBROW}>{c.datasets.eyebrow}</p>
            <h2 className="mt-2 font-display text-[clamp(26px,3vw,34px)]">
              {c.datasets.title}
            </h2>
            <p className="mt-3 text-lg leading-relaxed text-ink-soft">
              {c.datasets.lead}
            </p>
          </Reveal>
          <Reveal className="overflow-hidden rounded-sm border border-line bg-paper">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-[12px] uppercase tracking-[0.04em] text-muted">
                    <th scope="col" className="px-4 py-3 font-medium">{c.datasets.headers.dataset}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{c.datasets.headers.formats}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{c.datasets.headers.doi}</th>
                    <th scope="col" className="px-4 py-3 font-medium">{c.datasets.headers.codebook}</th>
                    <th scope="col" className="px-4 py-3"><span className="sr-only">Action</span></th>
                  </tr>
                </thead>
                <tbody>
                  {c.datasets.rows.map((d, i) => {
                    const dl = dataRows[i];
                    return (
                      <tr key={d.doi} className="border-b border-line align-top last:border-0">
                        <td className="px-4 py-3.5">
                          <div className="font-medium text-ink">{d.name}</div>
                          <div className="mt-0.5 text-[12.5px] text-muted">{d.sub}</div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex flex-wrap gap-1.5">
                            {d.formats.map((f) => {
                              const href = dl?.formats[f];
                              return href ? (
                                <a
                                  key={f}
                                  href={href}
                                  download
                                  className="rounded-[3px] border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-ink-soft transition-colors hover:border-ink hover:bg-accent-tint hover:text-ink"
                                >
                                  {f}
                                </a>
                              ) : (
                                <span
                                  key={f}
                                  className="rounded-[3px] border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10.5px] text-ink-soft"
                                >
                                  {f}
                                </span>
                              );
                            })}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 font-mono text-[12px] text-ink-soft">{d.doi}</td>
                        <td className="px-4 py-3.5">
                          <a
                            href={codebookHref}
                            className="text-[13px] text-accent-text hover:underline"
                          >
                            {c.datasets.codebookLabel}
                          </a>
                        </td>
                        <td className="px-4 py-3.5">
                          <a
                            href={dl?.primary ?? '#'}
                            download
                            className="inline-flex items-center justify-center rounded-sm border border-line-strong px-3 py-1.5 text-[13px] font-semibold text-ink transition-colors hover:border-ink hover:bg-accent-tint"
                            aria-label={`${c.datasets.downloadLabel} — ${d.name}`}
                          >
                            {c.datasets.downloadLabel}
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Bande contribution */}
      <section className="bg-accent text-accent-contrast">
        <div className={`${WRAP} py-16`}>
          <Reveal className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-center">
            <div className="max-w-[60ch]">
              <h2 className="font-display text-2xl text-accent-contrast md:text-3xl">
                {c.contrib.title}
              </h2>
              <p className="mt-3 leading-relaxed text-accent-contrast/90">
                {c.contrib.body}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              <Link
                href="/adhesion"
                className="inline-flex items-center justify-center rounded-sm bg-accent-contrast px-5 py-2.5 text-sm font-semibold text-accent transition-opacity hover:opacity-90"
              >
                {c.contrib.ctaPrimary}
              </Link>
              <a
                href="#methodologie"
                className="inline-flex items-center justify-center rounded-sm border border-accent-contrast/40 px-5 py-2.5 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-contrast/10"
              >
                {c.contrib.ctaSecondary}
              </a>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
