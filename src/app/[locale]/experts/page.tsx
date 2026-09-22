import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { fetchQuery } from 'convex/nextjs';
import { api } from '@convex/_generated/api';
import { Badge } from '@/components/ui/badge';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { vocabulary } from '@/i18n/vocabulary';
import { fetchOrFallback, EMPTY_EXPERT_LIST } from '@/lib/convex-fallback';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'experts' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: {
      canonical: `${SITE}/${locale}/experts`,
      languages: {
        fr: `${SITE}/fr/experts`,
        en: `${SITE}/en/experts`,
        'x-default': `${SITE}/fr/experts`,
      },
    },
  };
}

export default async function ExpertsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('experts');
  const tl = await getTranslations('library'); // libellés des axes themes.*
  // Backend injoignable -> l'état vide que la page sait déjà rendre (F-02).
  const experts = await fetchOrFallback(
    'experts',
    () => fetchQuery(api.experts.listExperts, {}),
    EMPTY_EXPERT_LIST,
  );

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 md:py-16">
      <header className="max-w-[62ch]">
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

      {experts.length === 0 ? (
        <Reveal>
          <p className="mt-10 rounded-sm border border-line bg-surface p-6 text-[15px] leading-relaxed text-ink-soft">
            {t('empty')}
          </p>
        </Reveal>
      ) : (
        <RevealGroup
          as="ul"
          className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
        >
          {experts.map((expert) => (
            <RevealItem as="li" key={expert.name}>
              <article className="flex h-full flex-col rounded-sm border border-line bg-surface p-6">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="font-display text-xl leading-tight">
                    {expert.name}
                  </h2>
                  <span className="shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                    {expert.latestYear}
                  </span>
                </div>
                <p className="mt-2 text-sm font-medium text-accent-text">
                  {t('count', { count: expert.count })}
                </p>
                {expert.themes.length > 0 && (
                  <ul className="mt-4 flex flex-wrap gap-2">
                    {expert.themes.map((slug) => (
                      <li key={slug}>
                        <Badge variant="accent">
                          {vocabulary(tl, 'themes.', slug)}
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            </RevealItem>
          ))}
        </RevealGroup>
      )}
    </div>
  );
}
