import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { fetchQuery } from 'convex/nextjs';
import { convexAuthNextjsToken } from '@convex-dev/auth/nextjs/server';
import {
  Building2,
  ExternalLink,
  FileText,
  Globe,
  Languages,
  Link2,
  MapPin,
  Megaphone,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { vocabulary } from '@/i18n/vocabulary';
import { alternatesFor, jsonLdScript } from '@/lib/seo';
import { personJsonLd, profileDescription } from '@/lib/social-seo';
import { countryFlag, countryName, languageName } from '@/lib/orgs';
import { formatLongDate } from '@/lib/publications';
import { safeHref } from '@/lib/safe-href';
import { fetchOrFallback } from '@/lib/convex-fallback';
import { DataUnavailable } from '@/components/ui/data-unavailable';
import { ArrowBack } from '@/components/ui/arrow';
import { PersonAvatar } from '@/components/social/person-avatar';
import { ProfileActions } from '@/components/social/profile-actions';
import { ProfileCounts } from '@/components/social/profile-counts';

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
//
// The layout is that of a network profile: a header card (cover, photo,
// name, role, where they work and from which country, their reach and the
// actions), then what they say about themselves and what they have
// published, with the details and links in a side column.

type Params = Promise<{ locale: string; handle: string }>;

async function load(handle: string) {
  const token = await convexAuthNextjsToken();
  return await fetchOrFallback(
    'membres/[handle]',
    () => fetchQuery(api.social.profiles.getByHandle, { handle }, { token }),
    undefined,
  );
}

// The person's published contributions. A failure here costs the section,
// never the page: the profile itself was already read.
async function loadContributions(handle: string) {
  const token = await convexAuthNextjsToken();
  return await fetchOrFallback(
    'membres/[handle] contributions',
    () => fetchQuery(api.social.profiles.contributions, { handle }, { token }),
    null,
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

// Host shown under a link ("linkedin.com"): the reader sees where a link
// leads before following it.
function hostOf(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return href;
  }
}

// One fact of the header line (organisation, country, languages): a
// key-value pair whose key is read by screen readers only — the icon says it
// to the eye.
function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <dt className="sr-only">{label}</dt>
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-muted" />
      <dd className="min-w-0 wrap-anywhere">{children}</dd>
    </div>
  );
}

export default async function PersonPage({ params }: { params: Params }) {
  const { locale, handle } = await params;
  setRequestLocale(locale);
  const p = await load(handle);
  if (p === undefined) {
    return (
      <div className="mx-auto max-w-[1100px] px-4 py-16 sm:px-6">
        <DataUnavailable />
      </div>
    );
  }
  if (!p) notFound();
  const contributions = await loadContributions(p.handle);

  const t = await getTranslations('people');
  const tp = await getTranslations('profile');
  const td = await getTranslations('directory');
  const tl = await getTranslations('library');
  const tt = await getTranslations('tribune');
  const links = p.links
    .map((l) => ({ ...l, href: safeHref(l.url) }))
    .filter((l): l is typeof l & { href: string } => Boolean(l.href));
  const hasContributions =
    contributions !== null &&
    contributions.publications.length + contributions.tribune.length > 0;

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6 md:py-12">
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

      <header className="mt-4 rounded-md border border-line bg-surface shadow-card">
        {/* Cover: the accent, fading into the surface, with a faint dotted
            grid. Decorative, it carries nothing. */}
        <div
          aria-hidden="true"
          className="h-28 rounded-t-md bg-[radial-gradient(circle_at_1px_1px,color-mix(in_srgb,var(--accent-contrast)_22%,transparent)_1px,transparent_0),linear-gradient(120deg,var(--accent),color-mix(in_srgb,var(--accent)_55%,var(--surface)))] bg-[length:18px_18px,auto] sm:h-36"
        />
        {/* A grid, so the actions sit beside the photo on wider screens
            while coming AFTER the name in the page — which is also where a
            phone shows them, instead of pushing the name below the fold. */}
        <div className="grid gap-x-6 px-5 pb-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-8 sm:pb-8">
          <div className="-mt-14 sm:-mt-16">
            <PersonAvatar
              name={p.displayName}
              photoUrl={p.photoUrl}
              size={120}
              alt={t('profile.photoAlt', { name: p.displayName })}
              className="border-4 border-surface bg-surface-2 shadow-card"
            />
          </div>
          <div className="min-w-0 sm:col-span-2">
            <h1 className="mt-4 wrap-anywhere font-display text-[clamp(28px,4.2vw,44px)] font-medium leading-[1.08] tracking-[-0.01em]">
              {p.displayName}
            </h1>
            {p.jobTitle ? (
              <p className="mt-2 wrap-anywhere text-lg text-ink-soft">
                {p.jobTitle}
              </p>
            ) : null}

            <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-soft">
              {p.organization ? (
                <Fact icon={Building2} label={t('profile.organization')}>
                  <Link
                    href={`/le-reseau/${p.organization.slug}`}
                    className="text-accent-text hover:underline"
                  >
                    {p.organization.name}
                  </Link>
                </Fact>
              ) : null}
              {p.country ? (
                <Fact icon={MapPin} label={t('profile.country')}>
                  <span aria-hidden="true">{countryFlag(p.country)}</span>{' '}
                  {countryName(p.country, locale)}
                </Fact>
              ) : null}
              {p.languages.length > 0 ? (
                <Fact icon={Languages} label={t('profile.languages')}>
                  {p.languages.map((l) => languageName(l, locale)).join(', ')}
                </Fact>
              ) : null}
            </dl>

            <ProfileCounts
              handle={p.handle}
              followers={p.followerCount}
              following={p.followingCount}
            />
            {!p.indexable ? (
              <p className="mt-2 text-xs text-muted">
                {t('profile.membersOnlyNote')}
              </p>
            ) : null}
          </div>
          <div className="mt-5 sm:col-start-2 sm:row-start-1 sm:mt-0 sm:self-end sm:pb-1">
            <ProfileActions handle={p.handle} displayName={p.displayName} />
          </div>
        </div>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="min-w-0 space-y-8">
          <section
            aria-labelledby="personne-apropos"
            className="rounded-md border border-line bg-surface p-5 sm:p-7"
          >
            <h2 id="personne-apropos" className="font-display text-2xl">
              {t('profile.about')}
            </h2>
            <p className="mt-3 max-w-[68ch] wrap-anywhere whitespace-pre-line leading-relaxed text-ink-soft">
              {p.bio ?? t('profile.noBio')}
            </p>
          </section>

          {contributions !== null ? (
            <section
              aria-labelledby="personne-contributions"
              className="rounded-md border border-line bg-surface p-5 sm:p-7"
            >
              <h2 id="personne-contributions" className="font-display text-2xl">
                {t('profile.contributionsTitle')}
              </h2>
              {!hasContributions ? (
                <p className="mt-3 text-ink-soft">
                  {t('profile.contributionsEmpty')}
                </p>
              ) : (
                <div className="mt-4 space-y-6">
                  {contributions.publications.length > 0 ? (
                    <div>
                      <h3 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                        <FileText aria-hidden="true" className="h-3.5 w-3.5" />
                        {t('profile.contributionsLibrary')}
                      </h3>
                      <ul className="mt-2 divide-y divide-line">
                        {contributions.publications.map((pub) => (
                          <li key={pub.slug} className="py-3">
                            <Link
                              href={`/bibliotheque/${pub.slug}`}
                              className="wrap-anywhere font-medium text-ink hover:text-accent-text hover:underline"
                            >
                              {pub.title}
                            </Link>
                            <p className="mt-0.5 text-xs text-muted">
                              {vocabulary(tl, 'types.', pub.type)} ·{' '}
                              {formatLongDate(pub.publishedAt, locale)}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {contributions.tribune.length > 0 ? (
                    <div>
                      <h3 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
                        <Megaphone aria-hidden="true" className="h-3.5 w-3.5" />
                        {t('profile.contributionsTribune')}
                      </h3>
                      <ul className="mt-2 divide-y divide-line">
                        {contributions.tribune.map((post) => (
                          <li key={post._id} className="py-3">
                            <Link
                              href={`/tribune/${post._id}`}
                              className="wrap-anywhere font-medium text-ink hover:text-accent-text hover:underline"
                            >
                              {post.title}
                            </Link>
                            <p className="mt-0.5 text-xs text-muted">
                              {vocabulary(tt, 'format_', post.format)} ·{' '}
                              {formatLongDate(post.createdAt, locale)}
                            </p>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}
            </section>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-6">
          {p.themes.length > 0 ? (
            <section
              aria-labelledby="personne-themes"
              className="rounded-md border border-line bg-surface p-5"
            >
              <h2
                id="personne-themes"
                className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted"
              >
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
            </section>
          ) : null}
          {links.length > 0 ? (
            <section
              aria-labelledby="personne-liens"
              className="rounded-md border border-line bg-surface p-5"
            >
              <h2
                id="personne-liens"
                className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted"
              >
                {t('profile.links')}
              </h2>
              <ul className="mt-3 space-y-1">
                {links.map((l) => (
                  <li key={l.href}>
                    {/* Address entered by the person: validated as https on
                        write, re-filtered here (safeHref), and marked
                        `nofollow ugc` — a profile is not a link farm. */}
                    <a
                      href={l.href}
                      target="_blank"
                      rel="noopener noreferrer nofollow ugc"
                      className="group -mx-2 flex min-h-11 items-center gap-3 rounded-sm px-2 py-1.5 transition-colors hover:bg-surface-2"
                    >
                      <span
                        aria-hidden="true"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-sm bg-accent-tint text-accent-text"
                      >
                        {l.kind === 'website' ? (
                          <Globe className="h-4 w-4" />
                        ) : (
                          <Link2 className="h-4 w-4" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-ink group-hover:text-accent-text">
                          {vocabulary(tp, 'linkKinds.', l.kind)}
                        </span>
                        <span className="block break-all text-xs text-muted">
                          {hostOf(l.href)}
                        </span>
                      </span>
                      <ExternalLink
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 text-muted"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
