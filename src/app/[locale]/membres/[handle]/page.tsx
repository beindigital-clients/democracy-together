import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { fetchQuery } from 'convex/nextjs';
import { convexAuthNextjsToken } from '@convex-dev/auth/nextjs/server';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { vocabulary } from '@/i18n/vocabulary';
import { alternatesFor, jsonLdScript } from '@/lib/seo';
import { personJsonLd, profileDescription } from '@/lib/social-seo';
import { countryFlag, countryName, languageName } from '@/lib/orgs';
import { safeHref } from '@/lib/safe-href';
import { fetchOrFallback } from '@/lib/convex-fallback';
import { DataUnavailable } from '@/components/ui/data-unavailable';
import { ArrowBack } from '@/components/ui/arrow';
import { PersonAvatar } from '@/components/social/person-avatar';
import { ProfileActions } from '@/components/social/profile-actions';

// PROFILE PAGE OF A PERSON `/membres/<handle>` ("social" workstream).
//
// VISIBILITY is decided by Convex, with the session token passed along:
//  - public  -> page served to everyone, indexable (canonical + hreflang for
//               the five languages, `Person` record) like other public pages;
//  - members -> served only to signed-in members, as `noindex`;
//  - private -> 404, for everyone except the person themselves.
// A profile the reader cannot see renders EXACTLY the same 404 as a handle
// that does not exist: the page never confirms that someone is behind an
// address.

type Params = Promise<{ locale: string; handle: string }>;

async function load(handle: string) {
  const token = await convexAuthNextjsToken();
  return await fetchOrFallback(
    'membres/[handle]',
    () => fetchQuery(api.social.profiles.getByHandle, { handle }, { token }),
    undefined,
  );
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const { locale, handle } = await params;
  const p = await load(handle);
  if (!p) return { robots: { index: false, follow: false } };
  const description = profileDescription(p);
  if (!p.indexable) {
    return {
      title: p.displayName,
      description,
      robots: { index: false, follow: false },
    };
  }
  return {
    title: p.displayName,
    description,
    alternates: alternatesFor(locale, `membres/${p.handle}`),
    openGraph: {
      type: 'profile',
      title: p.displayName,
      description,
    },
  };
}

export default async function PersonPage({ params }: { params: Params }) {
  const { locale, handle } = await params;
  setRequestLocale(locale);
  const p = await load(handle);
  if (p === undefined) {
    return (
      <div className="mx-auto max-w-[1000px] px-4 py-16 sm:px-6">
        <DataUnavailable />
      </div>
    );
  }
  if (!p) notFound();

  const t = await getTranslations('people');
  const tp = await getTranslations('profile');
  const td = await getTranslations('directory');
  const links = p.links
    .map((l) => ({ ...l, href: safeHref(l.url) }))
    .filter((l): l is typeof l & { href: string } => Boolean(l.href));

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-10 sm:px-6 md:py-14">
      {p.indexable ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript(
              personJsonLd({
                locale,
                handle: p.handle,
                displayName: p.displayName,
                jobTitle: p.jobTitle,
                description: profileDescription(p) ?? null,
                organization: p.organization,
                sameAs: links.map((l) => l.href),
              }),
            ),
          }}
        />
      ) : null}
      <Link
        href="/membres"
        className="inline-flex min-h-11 items-center gap-1.5 font-mono text-xs uppercase tracking-[0.12em] text-muted transition-colors hover:text-ink"
      >
        <ArrowBack /> {t('profile.back')}
      </Link>

      <header className="mt-6 flex flex-wrap items-start gap-6 border-b border-line pb-8">
        <PersonAvatar
          name={p.displayName}
          photoUrl={p.photoUrl}
          size={112}
          alt={t('profile.photoAlt', { name: p.displayName })}
        />
        <div className="min-w-0 flex-1">
          <h1 className="wrap-anywhere font-display text-[clamp(28px,4.2vw,44px)] font-medium leading-[1.08] tracking-[-0.01em]">
            {p.displayName}
          </h1>
          {p.jobTitle ? (
            <p className="mt-2 wrap-anywhere text-lg text-ink-soft">
              {p.jobTitle}
            </p>
          ) : null}
          <p className="mt-2 text-sm text-muted">
            {tp('counts', {
              followers: p.followerCount,
              following: p.followingCount,
            })}
          </p>
          {!p.indexable ? (
            <p className="mt-2 text-xs text-muted">
              {t('profile.membersOnlyNote')}
            </p>
          ) : null}
          <div className="mt-4">
            <ProfileActions handle={p.handle} displayName={p.displayName} />
          </div>
        </div>
      </header>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_300px]">
        <div>
          <h2 className="font-display text-2xl">{t('profile.about')}</h2>
          <p className="mt-3 max-w-[68ch] wrap-anywhere whitespace-pre-line leading-relaxed text-ink-soft">
            {p.bio ?? t('profile.noBio')}
          </p>
          {p.themes.length > 0 ? (
            <>
              <h2 className="mt-10 font-display text-2xl">
                {t('profile.themes')}
              </h2>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {p.themes.map((slug) => (
                  <li
                    key={slug}
                    className="rounded-pill border border-accent-edge bg-accent-tint px-3 py-1 text-sm text-accent-text"
                  >
                    {vocabulary(td, 'themes.', slug)}
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>

        <aside className="rounded-md border border-line bg-surface p-5">
          <dl className="space-y-4 text-sm">
            {p.organization ? (
              <div>
                <dt className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                  {t('profile.organization')}
                </dt>
                <dd className="mt-1">
                  <Link
                    href={`/le-reseau/${p.organization.slug}`}
                    className="wrap-anywhere text-accent-text hover:underline"
                  >
                    {p.organization.name}
                  </Link>
                </dd>
              </div>
            ) : null}
            {p.country ? (
              <div>
                <dt className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                  {t('profile.country')}
                </dt>
                <dd className="mt-1">
                  <span aria-hidden="true">{countryFlag(p.country)}</span>{' '}
                  {countryName(p.country, locale)}
                </dd>
              </div>
            ) : null}
            {p.languages.length > 0 ? (
              <div>
                <dt className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                  {t('profile.languages')}
                </dt>
                <dd className="mt-1">
                  {p.languages.map((l) => languageName(l, locale)).join(', ')}
                </dd>
              </div>
            ) : null}
            {links.length > 0 ? (
              <div>
                <dt className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted">
                  {t('profile.links')}
                </dt>
                <dd className="mt-1">
                  <ul className="space-y-1">
                    {links.map((l) => (
                      <li key={l.href}>
                        {/* Address entered by the person: validated as https on
                            write, re-filtered here (safeHref), and marked
                            `nofollow ugc` — a profile is not a link
                            farm. */}
                        <a
                          href={l.href}
                          target="_blank"
                          rel="noopener noreferrer nofollow ugc"
                          className="inline-flex min-h-11 items-center break-all text-accent-text hover:underline"
                        >
                          {vocabulary(tp, 'linkKinds.', l.kind)} ↗
                        </a>
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            ) : null}
          </dl>
        </aside>
      </div>
    </div>
  );
}
