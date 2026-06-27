import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { hasLocale } from 'next-intl';
import { fetchQuery } from 'convex/nextjs';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { routing } from '@/i18n/routing';
import { getThemeSynthesis } from '@/lib/themes-content';
import { PublicationCard } from '@/components/library/publication-card';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

function resolve(locale: string): 'fr' | 'en' {
  return (hasLocale(routing.locales, locale) ? locale : routing.defaultLocale) as
    | 'fr'
    | 'en';
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const s = getThemeSynthesis(resolve(locale), slug);
  if (!s) return {};
  const tl = await getTranslations({ locale, namespace: 'library' });
  return {
    title: tl(`themes.${slug}`),
    description: s.lead,
    alternates: {
      canonical: `${SITE}/${locale}/thematiques/${slug}`,
      languages: {
        fr: `${SITE}/fr/thematiques/${slug}`,
        en: `${SITE}/en/thematiques/${slug}`,
        'x-default': `${SITE}/fr/thematiques/${slug}`,
      },
    },
  };
}

export default async function ThemeSynthesisPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const loc = resolve(locale);
  const s = getThemeSynthesis(loc, slug);
  if (!s) notFound();

  const t = await getTranslations('thematiques');
  const tl = await getTranslations('library');
  const label = tl(`themes.${slug}`);
  const { items } = await fetchQuery(api.publications.listPublished, {
    themes: [slug],
    sort: 'recent',
  });

  return (
    <div>
      <header className="border-b border-line">
        <div className="mx-auto max-w-[1100px] px-4 pb-12 pt-12 sm:px-6 md:pt-16">
          <Reveal>
            <p className="text-[13px] text-muted">
              <Link href="/" className="text-muted hover:text-ink">
                {t('home')}
              </Link>{' '}
              /{' '}
              <Link href="/thematiques" className="text-muted hover:text-ink">
                {t('title')}
              </Link>{' '}
              / {label}
            </p>
          </Reveal>
          <Reveal>
            <p className="mt-4 font-mono text-xs uppercase tracking-[0.14em] text-muted">
              {t('eyebrow')} · {s.dimension}
            </p>
            <h1 className="mt-3 max-w-[18ch] font-display text-[clamp(32px,4.4vw,52px)] font-medium leading-[1.05] tracking-[-0.02em]">
              {label}
            </h1>
            <p className="mt-4 max-w-[60ch] text-lg leading-relaxed text-ink-soft">
              {s.lead}
            </p>
          </Reveal>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1100px] gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.6fr_.9fr]">
        <div>
          <RevealGroup className="flex flex-col gap-4">
            {s.stance.map((p, i) => (
              <RevealItem
                as="div"
                key={i}
                className="max-w-[68ch] text-[17px] leading-relaxed text-ink-soft"
              >
                {p}
              </RevealItem>
            ))}
          </RevealGroup>

          <Reveal className="mt-10">
            <h2 className="font-display text-2xl">{t('questionsTitle')}</h2>
          </Reveal>
          <RevealGroup as="ul" className="mt-4 flex flex-col gap-3">
            {s.questions.map((q, i) => (
              <RevealItem
                as="li"
                key={i}
                className="flex gap-3 rounded-sm border border-line bg-surface p-4 text-[15px] leading-relaxed text-ink"
              >
                <span
                  className="font-mono text-sm text-accent-text"
                  aria-hidden="true"
                >
                  {String(i + 1).padStart(2, '0')}
                </span>
                {q}
              </RevealItem>
            ))}
          </RevealGroup>
        </div>

        <aside>
          <Reveal className="flex flex-col gap-3 rounded-sm border border-line bg-surface p-5">
            <h2 className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
              {t('dimension')} · {s.dimension}
            </h2>
            <a
              href={`/${locale}/barometre#dimensions`}
              className="text-sm font-semibold text-accent-text hover:underline"
            >
              {t('barometer')} →
            </a>
            <Link
              href={{ pathname: '/bibliotheque', query: { theme: slug } }}
              className="text-sm font-semibold text-accent-text hover:underline"
            >
              {t('pubsAll')} →
            </Link>
          </Reveal>
        </aside>
      </div>

      <section className="border-t border-line bg-surface">
        <div className="mx-auto max-w-[1100px] px-4 py-14 sm:px-6">
          <Reveal className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <h2 className="font-display text-[clamp(24px,3vw,32px)]">
              {t('pubsTitle')}
            </h2>
            {items.length ? (
              <Link
                href={{ pathname: '/bibliotheque', query: { theme: slug } }}
                className="text-sm font-semibold text-accent-text hover:underline"
              >
                {t('pubsAll')} →
              </Link>
            ) : null}
          </Reveal>
          {items.length === 0 ? (
            <p className="text-ink-soft">{t('pubsEmpty')}</p>
          ) : (
            <RevealGroup
              as="ul"
              className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
            >
              {items.map((pub) => (
                <RevealItem as="li" key={pub._id}>
                  <PublicationCard pub={pub} locale={locale} variant="compact" />
                </RevealItem>
              ))}
            </RevealGroup>
          )}
        </div>
      </section>

      <section className="bg-accent text-accent-contrast">
        <div className="mx-auto max-w-[1100px] px-4 py-14 sm:px-6">
          <Reveal className="flex flex-col items-start gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-[58ch]">
              <h2 className="font-display text-2xl text-accent-contrast md:text-3xl">
                {t('ctaTitle')}
              </h2>
              <p className="mt-3 leading-relaxed text-accent-contrast/90">
                {t('ctaBody')}
              </p>
            </div>
            <Link
              href="/espace-membre/deposer"
              className="inline-flex shrink-0 items-center justify-center rounded-sm bg-accent-contrast px-5 py-2.5 text-sm font-semibold text-accent transition-opacity hover:opacity-90"
            >
              {t('ctaPrimary')}
            </Link>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
