import type { Metadata } from 'next';
import { hreflangFor } from '@/lib/seo';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { fetchQuery } from 'convex/nextjs';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { DirectoryFilters } from '@/components/directory/directory-filters';
import { OrgCard } from '@/components/directory/org-card';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';
import type { RegionMapItem } from '@/components/map/types';
import { RegionGlobeLazy } from '@/components/map/region-globe-lazy';
import { mapNameForIso } from '@/lib/country-map';
import { countryName } from '@/lib/orgs';
import {
  isCountryCode,
  isDirectoryRegion,
  isDirectoryTheme,
  isLanguageCode,
} from '@convex/lib/directory';
import { fetchOrFallback, EMPTY_DIRECTORY_LIST } from '@/lib/convex-fallback';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'directory' });
  return {
    title: t('metaTitle'),
    description: t('subtitle'),
    alternates: {
      canonical: `${SITE}/${locale}/le-reseau`,
      languages: hreflangFor(`le-reseau`),
    },
  };
}

function param(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v && v.trim() ? v.trim() : undefined;
}

export default async function NetworkPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  // Same rule as the Tribune: `region` and `theme` are closed domains
  // on the query side, so a URL value outside the vocabulary means "no filter".
  // `hasFilters` reads the SANITIZED values: a `?region=xyz` therefore no
  // longer shows an "active filters" banner that nothing justifies.
  const region = param(sp.region);
  const theme = param(sp.theme);
  // Country and language (F-19): ISO codes, an open domain on the query side;
  // only the FORM is checked here, a `?country=<script>` means "no filter".
  const country = param(sp.country)?.toLowerCase();
  const language = param(sp.language)?.toLowerCase();
  const filters = {
    region: region && isDirectoryRegion(region) ? region : undefined,
    theme: theme && isDirectoryTheme(theme) ? theme : undefined,
    country: country && isCountryCode(country) ? country : undefined,
    language: language && isLanguageCode(language) ? language : undefined,
    q: param(sp.q),
  };
  const hasFilters = Boolean(
    filters.region ||
    filters.theme ||
    filters.country ||
    filters.language ||
    filters.q,
  );

  const t = await getTranslations('directory');
  // Backend unreachable -> empty directory and map without countries, not a 500 (F-02).
  const { items, facets } = await fetchOrFallback(
    'le-reseau',
    () => fetchQuery(api.organizations.listDirectory, filters),
    EMPTY_DIRECTORY_LIST,
  );

  // Members map (F-19): one highlighted country per country represented in the
  // network (`countries` facet, over the active set, independent of filters).
  const memberItems: RegionMapItem[] = facets.countries.flatMap((f) => {
    const name = mapNameForIso(f.value);
    return name
      ? [
          {
            name,
            // brand orange: stands out on the navy globe (the navy accent
            // shade would blend into the ocean).
            fill: '#f58b1a',
            title: countryName(f.value, locale),
            rows: [{ label: t('mapMembers'), value: String(f.count) }],
          },
        ]
      : [];
  });

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6 md:py-16">
      <header className="max-w-[60ch]">
        <Reveal>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
            {t('eyebrow')}
          </p>
          <h1 className="mt-3 font-display text-[clamp(30px,4vw,46px)] font-medium leading-[1.08] tracking-[-0.02em]">
            {t('title')}
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-soft">
            {t('subtitle')}
          </p>
        </Reveal>
      </header>

      {memberItems.length ? (
        <section className="mt-10" aria-label={t('mapTitle')}>
          <Reveal>
            <h2 className="font-display text-2xl">{t('mapTitle')}</h2>
            <div className="mt-4">
              <RegionGlobeLazy
                items={memberItems}
                hint={t('mapHint')}
                ariaLabel={t('mapTitle')}
                fallback={t('mapNoScript')}
              />
            </div>
          </Reveal>
        </section>
      ) : null}

      <div className="mt-10">
        <DirectoryFilters facets={facets} filters={filters} />
      </div>

      <div className="mt-7 flex items-center justify-between gap-4">
        <p className="font-mono text-xs uppercase tracking-[0.12em] text-muted">
          {t('count', { count: items.length })}
        </p>
        {hasFilters ? (
          <Link
            href="/le-reseau"
            className="shrink-0 text-sm text-accent-text hover:underline"
          >
            {t('reset')}
          </Link>
        ) : null}
      </div>

      {items.length === 0 ? (
        <div className="mt-8 rounded-md border border-dashed border-line-strong bg-surface px-6 py-16 text-center">
          <p className="text-ink-soft">{t('empty')}</p>
          <Link
            href="/le-reseau"
            className="mt-4 inline-block text-sm font-medium text-accent-text hover:underline"
          >
            {t('emptyReset')}
          </Link>
        </div>
      ) : (
        <RevealGroup
          as="ul"
          aria-label={t('listLabel')}
          className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {items.map((org) => (
            <RevealItem as="li" key={org._id}>
              <OrgCard org={org} locale={locale} />
            </RevealItem>
          ))}
        </RevealGroup>
      )}
    </div>
  );
}
