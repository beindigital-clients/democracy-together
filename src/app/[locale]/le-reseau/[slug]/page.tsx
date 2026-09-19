import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { fetchQuery } from 'convex/nextjs';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { countryName, countryFlag, languageName } from '@/lib/orgs';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const org = await fetchQuery(api.organizations.getBySlug, { slug });
  if (!org) return {};
  return {
    title: org.name,
    description: org.description,
    alternates: {
      canonical: `${SITE}/${locale}/le-reseau/${slug}`,
      languages: {
        fr: `${SITE}/fr/le-reseau/${slug}`,
        en: `${SITE}/en/le-reseau/${slug}`,
        'x-default': `${SITE}/fr/le-reseau/${slug}`,
      },
    },
  };
}

export default async function OrgProfilePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const org = await fetchQuery(api.organizations.getBySlug, { slug });
  // `getBySlug` ne renvoie QUE des fiches actives (et ne sert plus `status`) :
  // une fiche pending/suspended est ici indistinguable d'une fiche absente.
  if (!org) notFound();

  const t = await getTranslations('directory.profile');
  const td = await getTranslations('directory');

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6 md:py-14">
      <Link
        href="/le-reseau"
        className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.12em] text-muted transition-colors hover:text-ink"
      >
        <span aria-hidden="true">←</span> {t('back')}
      </Link>

      <header className="mt-6 border-b border-line pb-8">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs uppercase tracking-[0.1em] text-muted">
          <span aria-hidden="true">{countryFlag(org.country)}</span>
          <span>{countryName(org.country, locale)}</span>
          <span className="text-line-strong">·</span>
          <span>{td(`regions.${org.region}`)}</span>
        </div>
        <h1 className="mt-3 font-display text-[clamp(30px,4.5vw,48px)] font-medium leading-[1.05] tracking-[-0.02em]">
          {org.name}
        </h1>
        <div className="mt-5 flex flex-wrap gap-1.5">
          {org.themes.map((theme) => (
            <Badge key={theme} variant="accent">
              {td(`themes.${theme}`)}
            </Badge>
          ))}
        </div>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_300px]">
        <main>
          <h2 className="font-display text-2xl">{t('about')}</h2>
          <p className="mt-3 max-w-[68ch] leading-relaxed text-ink-soft">
            {org.description ?? '—'}
          </p>

          <h2 className="mt-10 font-display text-2xl">{t('publications')}</h2>
          <div className="mt-3 rounded-md border border-dashed border-line-strong bg-surface px-5 py-8 text-sm text-ink-soft">
            {t('publicationsSoon')}
          </div>
        </main>

        <aside className="space-y-6">
          <div className="rounded-md border border-line bg-surface p-5">
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                  {t('region')}
                </dt>
                <dd className="mt-1">{td(`regions.${org.region}`)}</dd>
              </div>
              <div>
                <dt className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                  {t('country')}
                </dt>
                <dd className="mt-1">
                  <span aria-hidden="true">{countryFlag(org.country)}</span>{' '}
                  {countryName(org.country, locale)}
                </dd>
              </div>
              <div>
                <dt className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                  {t('languages')}
                </dt>
                <dd className="mt-1">
                  {org.languages.map((l) => languageName(l, locale)).join(', ')}
                </dd>
              </div>
              {org.websiteUrl ? (
                <div>
                  <dt className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                    {t('website')}
                  </dt>
                  <dd className="mt-1">
                    <a
                      href={org.websiteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-words text-accent-text hover:underline"
                    >
                      {t('visitWebsite')} ↗
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>

          <div className="rounded-md border border-accent-edge bg-accent-tint p-5">
            <p className="text-sm text-accent-text">{t('joinCta')}</p>
            <Button asChild className="mt-3 w-full">
              <Link href="/adhesion">{t('joinLink')}</Link>
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
