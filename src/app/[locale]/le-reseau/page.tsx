import type { Metadata } from 'next';
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
import { isDirectoryRegion, isDirectoryTheme } from '@convex/lib/directory';

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
      languages: {
        fr: `${SITE}/fr/le-reseau`,
        en: `${SITE}/en/le-reseau`,
        'x-default': `${SITE}/fr/le-reseau`,
      },
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
  // Même règle que la Tribune : `region` et `theme` sont des domaines fermés
  // côté query, donc une valeur d'URL hors vocabulaire vaut « pas de filtre ».
  // `hasFilters` lit les valeurs ASSAINIES : un `?region=xyz` n'affiche donc
  // plus un bandeau « filtres actifs » que rien ne justifie.
  const region = param(sp.region);
  const theme = param(sp.theme);
  const filters = {
    region: region && isDirectoryRegion(region) ? region : undefined,
    theme: theme && isDirectoryTheme(theme) ? theme : undefined,
    q: param(sp.q),
  };
  const hasFilters = Boolean(filters.region || filters.theme || filters.q);

  const t = await getTranslations('directory');
  const { items, facets } = await fetchQuery(
    api.organizations.listDirectory,
    filters,
  );

  // Carte des membres (F-19) : un pays mis en avant par pays représenté dans le
  // réseau (facette `countries`, sur l'ensemble actif, indépendante des filtres).
  const memberItems: RegionMapItem[] = facets.countries.flatMap((f) => {
    const name = mapNameForIso(f.value);
    return name
      ? [
          {
            name,
            // orange de marque : ressort sur le globe marine (la teinte accent
            // marine se fondrait dans l'océan).
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
