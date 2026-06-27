import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { fetchQuery } from 'convex/nextjs';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import { LibraryFacets } from '@/components/library/library-facets';
import { PublicationCard } from '@/components/library/publication-card';
import { SortSelect } from '@/components/library/sort-select';
import { parseFilters, buildHref, PAGE_SIZE } from '@/lib/publications';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'library' });
  return {
    title: t('metaTitle'),
    description: t('metaDescription'),
    alternates: {
      canonical: `${SITE}/${locale}/bibliotheque`,
      languages: {
        fr: `${SITE}/fr/bibliotheque`,
        en: `${SITE}/en/bibliotheque`,
        'x-default': `${SITE}/fr/bibliotheque`,
      },
    },
  };
}

const WRAP = 'mx-auto w-full max-w-[1240px] px-4 sm:px-6';

export default async function LibraryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const t = await getTranslations('library');

  const { items, facets } = await fetchQuery(api.publications.listPublished, {
    themes: filters.themes,
    types: filters.types,
    regions: filters.regions,
    langs: filters.langs,
    access: filters.access,
    q: filters.q,
    sort: filters.sort as 'recent' | 'cited' | 'az',
  });

  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const page = Math.min(filters.page, pageCount);
  const pageItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      {/* En-tête de page */}
      <header className="border-b border-line">
        <div className={`${WRAP} pb-8 pt-14 md:pt-16`}>
          <Reveal>
            <p className="text-[13px] text-muted">
              <Link href="/" className="text-muted hover:text-ink">
                {t('breadcrumbHome')}
              </Link>{' '}
              / {t('title')}
            </p>
            <h1 className="mt-4 font-display text-[clamp(34px,4.4vw,52px)] font-medium leading-[1.05] tracking-[-0.02em]">
              {t('title')}
            </h1>
            <p className="mt-4 max-w-[60ch] text-lg leading-relaxed text-ink-soft">
              {t('lead')}
            </p>
            <form role="search" className="mt-7 flex max-w-[640px] gap-3">
              {filters.themes.length ? (
                <input type="hidden" name="theme" value={filters.themes.join(',')} />
              ) : null}
              {filters.types.length ? (
                <input type="hidden" name="type" value={filters.types.join(',')} />
              ) : null}
              {filters.regions.length ? (
                <input type="hidden" name="region" value={filters.regions.join(',')} />
              ) : null}
              {filters.langs.length ? (
                <input type="hidden" name="lang" value={filters.langs.join(',')} />
              ) : null}
              {filters.access.length ? (
                <input type="hidden" name="access" value={filters.access.join(',')} />
              ) : null}
              {filters.sort !== 'recent' ? (
                <input type="hidden" name="sort" value={filters.sort} />
              ) : null}
              <input
                type="search"
                name="q"
                defaultValue={filters.q ?? ''}
                placeholder={t('searchPlaceholder')}
                aria-label={t('searchPlaceholder')}
                className="flex-1 rounded-sm border border-line-strong bg-surface px-4 py-3 text-base text-ink placeholder:text-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              />
              <button
                type="submit"
                className="shrink-0 rounded-sm bg-accent px-5 py-3 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-strong"
              >
                {t('searchCta')}
              </button>
            </form>
          </Reveal>
        </div>
      </header>

      {/* Liste */}
      <main className={`${WRAP} grid gap-8 pb-24 pt-10 lg:grid-cols-[264px_1fr] lg:gap-12`}>
        <LibraryFacets facets={facets} filters={filters} />

        <section>
          <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
            <p className="text-[15px] text-ink-soft">
              {t('count', { count: items.length })}
            </p>
            <SortSelect value={filters.sort} />
          </div>

          {pageItems.length === 0 ? (
            <div className="rounded-sm border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
              <p className="text-muted">{t('empty')}</p>
              <Link
                href="/bibliotheque"
                className="mt-4 inline-block text-sm font-medium text-accent-text hover:underline"
              >
                {t('emptyReset')}
              </Link>
            </div>
          ) : (
            <RevealGroup
              as="ul"
              aria-label={t('listLabel')}
              className="grid grid-cols-1 gap-6 sm:grid-cols-2 min-[1080px]:grid-cols-3"
            >
              {pageItems.map((pub) => (
                <RevealItem as="li" key={pub._id} className="h-full">
                  <PublicationCard pub={pub} locale={locale} />
                </RevealItem>
              ))}
            </RevealGroup>
          )}

          {pageCount > 1 ? (
            <nav
              aria-label={t('pageLabel')}
              className="mt-12 flex justify-center gap-1.5"
            >
              {page > 1 ? (
                <Link
                  href={buildHref({ ...filters, page: page - 1 })}
                  rel="prev"
                  className="inline-flex h-9 items-center rounded-sm border border-line px-3 text-sm text-ink-soft hover:border-line-strong hover:text-ink"
                >
                  ← {t('prev')}
                </Link>
              ) : null}
              {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
                <Link
                  key={n}
                  href={buildHref({ ...filters, page: n })}
                  aria-current={n === page ? 'page' : undefined}
                  className={`inline-flex h-9 min-w-9 items-center justify-center rounded-sm border px-3 text-sm ${
                    n === page
                      ? 'border-accent bg-accent text-accent-contrast'
                      : 'border-line text-ink-soft hover:border-line-strong hover:text-ink'
                  }`}
                >
                  {n}
                </Link>
              ))}
              {page < pageCount ? (
                <Link
                  href={buildHref({ ...filters, page: page + 1 })}
                  rel="next"
                  className="inline-flex h-9 items-center rounded-sm border border-line px-3 text-sm font-semibold text-ink hover:border-line-strong"
                >
                  {t('next')} →
                </Link>
              ) : null}
            </nav>
          ) : null}
        </section>
      </main>
    </div>
  );
}
