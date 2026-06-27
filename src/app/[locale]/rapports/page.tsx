import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { routing } from '@/i18n/routing';
import { getReports } from '@/lib/reports-content';

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
  const t = await getTranslations({ locale, namespace: 'reports' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: {
      canonical: `${SITE}/${locale}/rapports`,
      languages: {
        fr: `${SITE}/fr/rapports`,
        en: `${SITE}/en/rapports`,
        'x-default': `${SITE}/fr/rapports`,
      },
    },
  };
}

export default async function ReportsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('reports');
  const reports = getReports(resolve(locale));

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-12 sm:px-6 md:py-16">
      <header className="max-w-[60ch]">
        <Reveal>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
            {t('eyebrow')}
          </p>
          <h1 className="mt-3 font-display text-[clamp(30px,4vw,46px)] font-medium leading-[1.08] tracking-[-0.02em]">
            {t('title')}
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-soft">
            {t('lead')}
          </p>
        </Reveal>
      </header>

      <RevealGroup as="ul" className="mt-10 flex flex-col gap-4">
        {reports.map((r) => (
          <RevealItem as="li" key={r.year}>
            <Link
              href={`/rapports/${r.year}`}
              className="group flex items-center justify-between gap-4 rounded-sm border border-line bg-surface p-6 transition-colors hover:border-ink"
            >
              <div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-2xl font-semibold text-ink">
                    {r.year}
                  </span>
                  {r.inaugural ? (
                    <span className="rounded-pill border border-accent-edge bg-accent-tint px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-accent-text">
                      {t('inaugural')}
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-2 font-display text-xl">{r.title}</h2>
                <p className="mt-1 max-w-[68ch] text-[15px] leading-relaxed text-ink-soft">
                  {r.intro}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-accent-text group-hover:underline">
                {t('read')} →
              </span>
            </Link>
          </RevealItem>
        ))}
      </RevealGroup>
    </div>
  );
}
