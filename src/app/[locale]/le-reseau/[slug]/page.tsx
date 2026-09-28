import type { Metadata } from 'next';
import { hreflangFor } from '@/lib/seo';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { fetchQuery } from 'convex/nextjs';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { countryName, countryFlag, languageName } from '@/lib/orgs';
import { vocabulary } from '@/i18n/vocabulary';
import { contentLangAttrs, ORG_DESCRIPTION_LOCALE } from '@/i18n/content-lang';
import { fetchOrFallback } from '@/lib/convex-fallback';
import { DataUnavailable } from '@/components/ui/data-unavailable';
import { safeHref } from '@/lib/safe-href';
import { ArrowBack } from '@/components/ui/arrow';
import { OrgFollowButton } from '@/components/social/org-follow-button';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  // See bibliotheque/[slug]: a throw in `generateMetadata` takes down the page
  // before it even renders (F-02).
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
      languages: hreflangFor(`le-reseau/${slug}`),
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
  // `undefined` = the request failed; `null` = no entry. Confusing them
  // would turn an outage into a 404 (F-02).
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
  // `getBySlug` returns ONLY active entries (and no longer serves `status`):
  // a pending/suspended entry is indistinguishable here from a missing one.
  if (!org) notFound();

  const t = await getTranslations('directory.profile');
  const td = await getTranslations('directory');
  const to = await getTranslations('orgAdmin');
  const tl = await getTranslations('library');
  const websiteHref = safeHref(org.websiteUrl);
  // Entry supplement (F-21, accounts workstream): logo, publications by its
  // accounts, members if the organization chose so. A failure of this
  // second read must not take down the entry: it returns `null`, and the
  // page makes do with what it has.
  const details = await fetchOrFallback(
    'le-reseau/[slug]:details',
    () => fetchQuery(api.orgAdmin.publicDetails, { slug }),
    null,
  );

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6 md:py-14">
      <Link
        href="/le-reseau"
        className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.12em] text-muted transition-colors hover:text-ink"
      >
        <ArrowBack /> {t('back')}
      </Link>

      <header className="mt-6 border-b border-line pb-8">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs uppercase tracking-[0.1em] text-muted">
          <span aria-hidden="true">{countryFlag(org.country)}</span>
          <span>{countryName(org.country, locale)}</span>
          <span className="text-line-strong">·</span>
          <span>{vocabulary(td, 'regions.', org.region)}</span>
        </div>
        <div className="mt-3 flex items-center gap-4">
          {details?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- signed Convex storage URL, outside Next's image loader
            <img
              src={details.logoUrl}
              alt={to('logoAlt', { org: org.name })}
              width={64}
              height={64}
              className="h-16 w-16 shrink-0 rounded-sm border border-line bg-paper object-contain"
            />
          ) : null}
          <h1 className="min-w-0 wrap-anywhere font-display text-[clamp(30px,4.5vw,48px)] font-medium leading-[1.05] tracking-[-0.02em]">
            {org.name}
          </h1>
        </div>
        <div className="mt-5 flex flex-wrap gap-1.5">
          {org.themes.map((theme) => (
            <Badge key={theme} variant="accent">
              {vocabulary(td, 'themes.', theme)}
            </Badge>
          ))}
        </div>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_300px]">
        <div>
          <h2 className="font-display text-2xl">{t('about')}</h2>
          <p
            {...(org.description
              ? contentLangAttrs(ORG_DESCRIPTION_LOCALE, locale)
              : {})}
            className="mt-3 max-w-[68ch] leading-relaxed text-ink-soft"
          >
            {org.description ?? '—'}
          </p>

          <h2 className="mt-10 font-display text-2xl">{t('publications')}</h2>
          {details && details.publications.length > 0 ? (
            <ul className="mt-3 divide-y divide-line rounded-md border border-line bg-surface">
              {details.publications.map((p) => (
                <li key={p.slug}>
                  <Link
                    href={`/bibliotheque/${p.slug}`}
                    className="flex min-h-11 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3 hover:bg-accent-tint/60"
                  >
                    <span className="wrap-anywhere font-medium text-ink">
                      {p.title}
                    </span>
                    <span className="font-mono text-xs text-muted">
                      {vocabulary(tl, 'types.', p.type)} · {p.year}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="mt-3 rounded-md border border-dashed border-line-strong bg-surface px-5 py-8 text-sm text-ink-soft">
              {to('publicPublicationsEmpty')}
            </div>
          )}

          {details?.members && details.members.length > 0 ? (
            <>
              <h2 className="mt-10 font-display text-2xl">
                {to('publicMembersTitle')}
              </h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {details.members.map((m, i) => (
                  <li
                    key={`${m.name}-${i}`}
                    className="wrap-anywhere rounded-pill border border-line bg-surface px-3 py-1 text-sm"
                  >
                    {m.name}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>

        <aside className="space-y-6">
          {/* Following the organization ("social" workstream): client island,
              absent for an anonymous or non-member visitor. */}
          <OrgFollowButton orgId={org._id} />
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
              {/* ADDRESS SUPPLIED BY THE ENTRY, hence by a third party (pentest
                  M-9): filled in at membership, reviewed by a moderator who
                  judges an organization, not a character string. The
                  scheme is now refused on write
                  (convex/lib/onboarding.ts); this filter covers entries
                  ALREADY stored, which no validation has ever seen. A
                  refused scheme removes the whole block: there is nothing to
                  offer the visitor, and certainly not an inert link. */}
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
