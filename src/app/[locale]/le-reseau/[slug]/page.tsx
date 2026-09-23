import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { fetchQuery } from 'convex/nextjs';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { countryName, countryFlag, languageName } from '@/lib/orgs';
import { vocabulary } from '@/i18n/vocabulary';
import { fetchOrFallback } from '@/lib/convex-fallback';
import { DataUnavailable } from '@/components/ui/data-unavailable';
import { safeHref } from '@/lib/safe-href';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  // Voir bibliotheque/[slug] : un jet dans `generateMetadata` emporte la page
  // avant même son rendu (F-02).
  const org = await fetchOrFallback(
    'le-reseau/[slug]:metadata',
    () => fetchQuery(api.organizations.getBySlug, { slug }),
    null,
  );
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
  // `undefined` = la requête a échoué ; `null` = aucune fiche. Les confondre
  // transformerait une panne en 404 (F-02).
  const org = await fetchOrFallback(
    'le-reseau/[slug]',
    () => fetchQuery(api.organizations.getBySlug, { slug }),
    undefined,
  );
  if (org === undefined) {
    return (
      <div className="mx-auto max-w-[1100px] px-4 py-16 sm:px-6">
        <DataUnavailable />
      </div>
    );
  }
  // `getBySlug` ne renvoie QUE des fiches actives (et ne sert plus `status`) :
  // une fiche pending/suspended est ici indistinguable d'une fiche absente.
  if (!org) notFound();

  const t = await getTranslations('directory.profile');
  const td = await getTranslations('directory');
  const websiteHref = safeHref(org.websiteUrl);

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
          <span>{vocabulary(td, 'regions.', org.region)}</span>
        </div>
        <h1 className="mt-3 font-display text-[clamp(30px,4.5vw,48px)] font-medium leading-[1.05] tracking-[-0.02em]">
          {org.name}
        </h1>
        <div className="mt-5 flex flex-wrap gap-1.5">
          {org.themes.map((theme) => (
            <Badge key={theme} variant="accent">
              {vocabulary(td, 'themes.', theme)}
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
                <dd className="mt-1">
                  {vocabulary(td, 'regions.', org.region)}
                </dd>
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
              {/* ADRESSE FOURNIE PAR LA FICHE, donc par un tiers (pentest
                  M-9) : renseignée à l'adhésion, relue par un modérateur qui
                  juge une organisation, pas une chaîne de caractères. Le
                  schéma est désormais refusé à l'écriture
                  (convex/lib/onboarding.ts) ; ce filtre-ci couvre les fiches
                  DÉJÀ enregistrées, qu'aucune validation n'a jamais vues. Un
                  schéma refusé retire le bloc entier : il n'y a rien à
                  proposer au visiteur, et surtout pas un lien inerte. */}
              {websiteHref ? (
                <div>
                  <dt className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                    {t('website')}
                  </dt>
                  <dd className="mt-1">
                    <a
                      href={websiteHref}
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
