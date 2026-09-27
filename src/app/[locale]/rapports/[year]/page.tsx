import type { Metadata } from 'next';
import { hreflangFor } from '@/lib/seo';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { fetchQuery } from 'convex/nextjs';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { resolveLocale } from '@/i18n/locale';
import { direction } from '@/i18n/direction';
import type { Locale } from '@/i18n/routing';
import { getReport } from '@/lib/reports-content';
import { fetchOrFallback } from '@/lib/convex-fallback';
import {
  ReportDownloads,
  type ReportPdfInfo,
} from '@/components/reports/report-downloads';
import { ArrowBack } from '@/components/ui/arrow';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

type ReportView = {
  year: number;
  inaugural: boolean;
  /** Langue du TEXTE servi (le français quand la langue demandée manque). */
  locale: Locale;
  title: string;
  intro: string;
  chapters: { heading: string; body: string[] }[];
  keyFigures: { value: string; label: string }[];
  pdfs: ReportPdfInfo[];
};

// Une édition administrée (Convex) si la base la connaît ; sinon le contenu
// codé, à l'identique — mêmes URL, même texte (F-41, migration fidèle). Une
// année que la base connaît mais ne publie pas est introuvable : le repli
// codé ne ressuscite pas une édition dépubliée.
async function loadReport(
  locale: Locale,
  year: number,
): Promise<ReportView | null> {
  if (!Number.isInteger(year)) return null;
  const fromDb = await fetchOrFallback(
    'rapports',
    () => fetchQuery(api.annualReports.getPublic, { year, locale }),
    { known: false, report: null },
  );
  if (fromDb.report) return fromDb.report;
  if (fromDb.known) return null;
  const coded = getReport(locale, year);
  return coded ? { ...coded, locale, pdfs: [] } : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; year: string }>;
}): Promise<Metadata> {
  const { locale, year } = await params;
  const report = await loadReport(resolveLocale(locale), Number(year));
  if (!report) return {};
  return {
    title: report.title,
    description: report.intro,
    alternates: {
      canonical: `${SITE}/${locale}/rapports/${report.year}`,
      languages: hreflangFor(`rapports/${report.year}`),
    },
  };
}

export default async function ReportPage({
  params,
}: {
  params: Promise<{ locale: string; year: string }>;
}) {
  const { locale: rawLocale, year } = await params;
  setRequestLocale(rawLocale);
  const locale = resolveLocale(rawLocale);
  const report = await loadReport(locale, Number(year));
  if (!report) notFound();

  const t = await getTranslations('reports');
  const translated = report.locale === locale;

  return (
    <article
      className="mx-auto max-w-[820px] px-4 py-12 sm:px-6 md:py-16"
      lang={translated ? undefined : report.locale}
      dir={translated ? undefined : direction(report.locale)}
    >
      <Reveal>
        <p className="text-[13px] text-muted print:hidden">
          <Link href="/" className="text-muted hover:text-ink">
            {t('home')}
          </Link>{' '}
          /{' '}
          <Link href="/rapports" className="text-muted hover:text-ink">
            {t('title')}
          </Link>{' '}
          / {report.year}
        </p>
      </Reveal>

      {!translated ? (
        <p
          lang={locale}
          dir={direction(locale)}
          className="mt-4 rounded-sm border border-line bg-surface-2 px-4 py-3 text-sm text-ink-soft"
        >
          {t('translationMissing')}
        </p>
      ) : null}

      <header className="mt-4 border-b border-line pb-8">
        <Reveal>
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
              {t('eyebrow')} · {report.year}
            </p>
            {report.inaugural ? (
              <span className="rounded-pill border border-accent-edge bg-accent-tint px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-accent-text">
                {t('inaugural')}
              </span>
            ) : null}
          </div>
          <h1 className="mt-3 wrap-anywhere font-display text-[clamp(30px,4.4vw,48px)] font-medium leading-[1.05] tracking-[-0.02em]">
            {report.title}
          </h1>
          <p className="mt-4 wrap-anywhere text-lg leading-relaxed text-ink-soft">
            {report.intro}
          </p>
          <div className="mt-6" lang={locale} dir={direction(locale)}>
            <ReportDownloads
              year={report.year}
              locale={locale}
              pdfs={report.pdfs}
            />
          </div>
        </Reveal>
      </header>

      {report.keyFigures.length > 0 ? (
        <section aria-labelledby="report-key-figures" className="mt-10">
          <h2 id="report-key-figures" className="font-display text-2xl">
            {t('keyFigures')}
          </h2>
          <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {report.keyFigures.map((f, i) => (
              <div
                key={i}
                className="flex flex-col-reverse rounded-sm border border-line bg-surface p-4"
              >
                <dt className="mt-1 wrap-anywhere text-sm text-ink-soft">
                  {f.label}
                </dt>
                <dd className="wrap-anywhere font-display text-3xl text-accent-text">
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <RevealGroup className="mt-10 flex flex-col gap-10">
        {report.chapters.map((sec, i) => (
          <RevealItem as="div" key={`${i}-${sec.heading}`}>
            <h2 className="wrap-anywhere font-display text-2xl">
              {sec.heading}
            </h2>
            <div className="mt-3 flex flex-col gap-3">
              {sec.body.map((p, j) => (
                <p
                  key={j}
                  className="max-w-[70ch] wrap-anywhere text-[17px] leading-relaxed text-ink-soft"
                >
                  {p}
                </p>
              ))}
            </div>
          </RevealItem>
        ))}
      </RevealGroup>

      <footer className="mt-12 border-t border-line pt-6 print:hidden">
        <Link
          href="/rapports"
          className="text-sm font-semibold text-accent-text hover:underline"
        >
          <ArrowBack /> {t('allReports')}
        </Link>
      </footer>
    </article>
  );
}
