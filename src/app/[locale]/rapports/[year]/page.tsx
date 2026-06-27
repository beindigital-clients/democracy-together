import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { routing } from '@/i18n/routing';
import { getReport } from '@/lib/reports-content';
import { PrintButton } from '@/components/reports/print-button';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

function resolve(locale: string): 'fr' | 'en' {
  return (hasLocale(routing.locales, locale) ? locale : routing.defaultLocale) as
    | 'fr'
    | 'en';
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; year: string }>;
}): Promise<Metadata> {
  const { locale, year } = await params;
  const report = getReport(resolve(locale), Number(year));
  if (!report) return {};
  return {
    title: report.title,
    description: report.intro,
    alternates: {
      canonical: `${SITE}/${locale}/rapports/${report.year}`,
      languages: {
        fr: `${SITE}/fr/rapports/${report.year}`,
        en: `${SITE}/en/rapports/${report.year}`,
        'x-default': `${SITE}/fr/rapports/${report.year}`,
      },
    },
  };
}

export default async function ReportPage({
  params,
}: {
  params: Promise<{ locale: string; year: string }>;
}) {
  const { locale, year } = await params;
  setRequestLocale(locale);
  const y = Number(year);
  const report = Number.isInteger(y) ? getReport(resolve(locale), y) : null;
  if (!report) notFound();

  const t = await getTranslations('reports');

  return (
    <article className="mx-auto max-w-[820px] px-4 py-12 sm:px-6 md:py-16">
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
          <h1 className="mt-3 font-display text-[clamp(30px,4.4vw,48px)] font-medium leading-[1.05] tracking-[-0.02em]">
            {report.title}
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-soft">
            {report.intro}
          </p>
          <div className="mt-6">
            <PrintButton label={t('download')} />
          </div>
        </Reveal>
      </header>

      <RevealGroup className="mt-10 flex flex-col gap-10">
        {report.sections.map((sec) => (
          <RevealItem as="div" key={sec.heading}>
            <h2 className="font-display text-2xl">{sec.heading}</h2>
            <div className="mt-3 flex flex-col gap-3">
              {sec.body.map((p, i) => (
                <p
                  key={i}
                  className="max-w-[70ch] text-[17px] leading-relaxed text-ink-soft"
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
          ← {t('allReports')}
        </Link>
      </footer>
    </article>
  );
}
