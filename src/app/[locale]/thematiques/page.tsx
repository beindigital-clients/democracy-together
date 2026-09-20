import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { fetchQuery } from 'convex/nextjs';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { resolveLocale } from '@/i18n/locale';
import { getThemeSyntheses } from '@/lib/themes-content';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'thematiques' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: {
      canonical: `${SITE}/${locale}/thematiques`,
      languages: {
        fr: `${SITE}/fr/thematiques`,
        en: `${SITE}/en/thematiques`,
        'x-default': `${SITE}/fr/thematiques`,
      },
    },
  };
}

export default async function ThematiquesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = resolveLocale(locale);
  const t = await getTranslations('thematiques');
  const tl = await getTranslations('library'); // libellés themes.*
  const syntheses = getThemeSyntheses(loc);
  const { facets } = await fetchQuery(api.publications.listPublished, {
    sort: 'recent',
  });
  const counts = new Map(facets.themes.map((f) => [f.value, f.count]));

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

      <RevealGroup as="ul" className="mt-10 grid gap-5 md:grid-cols-2">
        {syntheses.map((s, i) => (
          <RevealItem as="li" key={s.slug}>
            <Link
              href={`/thematiques/${s.slug}`}
              className="group flex h-full flex-col rounded-sm border border-line bg-surface p-6 transition-colors hover:border-ink"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-accent-text">
                  {String(i + 1).padStart(2, '0')} · {s.dimension}
                </span>
                <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                  {t('count', { count: counts.get(s.slug) ?? 0 })}
                </span>
              </div>
              <h2 className="mt-3 font-display text-2xl leading-tight">
                {tl(`themes.${s.slug}`)}
              </h2>
              <p className="mt-2 flex-1 text-[15px] leading-relaxed text-ink-soft">
                {s.lead}
              </p>
              <span className="mt-4 text-sm font-semibold text-accent-text group-hover:underline">
                {t('explore')} →
              </span>
            </Link>
          </RevealItem>
        ))}
      </RevealGroup>
    </div>
  );
}
