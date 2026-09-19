import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { Badge } from '@/components/ui/badge';
import { routing } from '@/i18n/routing';
import { getReplays } from '@/lib/replays';
import { monthAbbr } from '@/lib/events-content';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

function resolve(locale: string): 'fr' | 'en' {
  return hasLocale(routing.locales, locale) ? locale : routing.defaultLocale;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'replays' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: {
      canonical: `${SITE}/${locale}/replays`,
      languages: {
        fr: `${SITE}/fr/replays`,
        en: `${SITE}/en/replays`,
        'x-default': `${SITE}/fr/replays`,
      },
    },
  };
}

export default async function ReplaysPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = resolve(locale);
  const t = await getTranslations('replays');
  const replays = getReplays(loc);

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

      {replays.length === 0 ? (
        <Reveal>
          <p className="mt-10 rounded-sm border border-line bg-surface p-8 text-center text-ink-soft">
            {t('empty')}
          </p>
        </Reveal>
      ) : (
        <RevealGroup
          as="ul"
          className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3"
        >
          {replays.map((r) => (
            <RevealItem as="li" key={r.slug}>
              <article className="flex h-full flex-col rounded-sm border border-line bg-surface p-6">
                <div className="flex items-center justify-between gap-3">
                  <Badge>{r.type}</Badge>
                  <span className="font-mono text-xs uppercase tracking-[0.06em] text-muted">
                    {r.d} {monthAbbr({ mo: r.mo }, loc)} {r.y}
                    {r.durationMin != null
                      ? ` · ${t('durationLabel', { count: r.durationMin })}`
                      : ''}
                  </span>
                </div>
                <h2 className="mt-3 font-display text-xl leading-snug">
                  {r.title}
                </h2>
                <div className="mt-4 flex items-center gap-2 rounded-sm border border-dashed border-line bg-paper px-3 py-2.5 text-sm text-muted">
                  <span aria-hidden="true">●</span>
                  <span>{t('soon')}</span>
                </div>
                <Link
                  href={`/evenements/${r.slug}`}
                  className="mt-4 text-sm font-semibold text-accent-text hover:underline"
                >
                  {t('viewEvent')} →
                </Link>
              </article>
            </RevealItem>
          ))}
        </RevealGroup>
      )}
    </div>
  );
}
