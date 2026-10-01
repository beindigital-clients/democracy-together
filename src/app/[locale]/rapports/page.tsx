import type { Metadata } from 'next';
import { hreflangFor } from '@/lib/seo';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { fetchQuery } from 'convex/nextjs';
import { api } from '@convex/_generated/api';
import { resolveLocale } from '@/i18n/locale';
import { mergeReportList } from '@/lib/reports-content';
import { fetchOrFallback } from '@/lib/convex-fallback';
import { ArrowForward } from '@/components/ui/arrow';
import { Badge } from '@/components/ui/badge';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

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
      languages: hreflangFor(`rapports`),
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
  const loc = resolveLocale(locale);
  // Administered editions (Convex) + hard-coded editions the database does not
  // know yet (F-41). Database unreachable: the hard-coded content is still served.
  const fromDb = await fetchOrFallback(
    'rapports',
    () => fetchQuery(api.annualReports.listPublic, { locale: loc }),
    { reports: [], knownYears: [] },
  );
  const reports = mergeReportList(loc, fromDb);

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
              {/* `min-w-0` and the wrapping row: at 320 px, the year and its
                  badge pushed "Lire le rapport" out of the card (RGAA 10.11). */}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-mono text-2xl font-semibold text-ink">
                    {r.year}
                  </span>
                  {r.inaugural ? (
                    <Badge variant="accent" size="label">
                      {t('inaugural')}
                    </Badge>
                  ) : null}
                </div>
                <h2 className="mt-2 wrap-anywhere font-display text-xl">
                  {r.title}
                </h2>
                <p className="mt-1 max-w-[68ch] wrap-anywhere text-[15px] leading-relaxed text-ink-soft">
                  {r.intro}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold text-accent-text group-hover:underline">
                {t('read')} <ArrowForward />
              </span>
            </Link>
          </RevealItem>
        ))}
      </RevealGroup>
    </div>
  );
}
