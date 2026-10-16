import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { fetchQuery } from 'convex/nextjs';
import { convexAuthNextjsToken } from '@convex-dev/auth/nextjs/server';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { Reveal } from '@/components/motion/reveal';
import { AuthorList } from '@/components/library/author-list';
import { CiteBlock } from '@/components/library/cite-block';
import { CopyButton } from '@/components/library/copy-button';
import { PublicationCard } from '@/components/library/publication-card';
import { ViewCounter, ViewsCount } from '@/components/library/view-counter';
import { DownloadLink } from '@/components/library/download-link';
import {
  buildCitations,
  formatLongDate,
  isRegisteredDoi,
} from '@/lib/publications';
import { alternatesFor, SITE_URL } from '@/lib/seo';
import { resolveLocale } from '@/i18n/locale';
import { vocabulary } from '@/i18n/vocabulary';
import {
  TranslationNotice,
  textAttrs,
} from '@/components/i18n/translation-notice';
import { resolveArticleDisplay } from '@/lib/article-translation';
import {
  fetchOrFallback,
  EMPTY_RELATED_PUBLICATIONS,
} from '@/lib/convex-fallback';
import { DataUnavailable } from '@/components/ui/data-unavailable';
import { intlLocale } from '@/i18n/locale';
import { Badge } from '@/components/ui/badge';

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  // Deliberately NOT authenticated: the metadata must be identical
  // for everyone (SEO, CDN cache). For a restricted publication, Convex already returns
  // the truncated summary teaser — nothing restricted leaks here (F-35).
  // Silent backend -> no metadata rather than a throw: `generateMetadata`
  // runs BEFORE rendering, so an exception here takes down the entire page
  // whatever the page body does (F-02).
  const pub = await fetchOrFallback(
    'bibliotheque/[slug]:metadata',
    () => fetchQuery(api.publications.getBySlug, { slug }),
    null,
  );
  if (!pub) return {};
  return {
    title: pub.title,
    description: pub.abstract,
    // `alternatesFor` derives the hreflang from `routing.locales`. The table was
    // hand-written with fr and en: the three added languages would never have
    // appeared in it, and /es/bibliotheque/<slug> would have remained invisible to
    // search engines. The sitemap already declares these same alternates through the same
    // function — that was the contract announced in its header.
    alternates: alternatesFor(locale, `bibliotheque/${slug}`),
  };
}

const WRAP = 'mx-auto w-full max-w-[1180px] px-4 sm:px-6';

export default async function PublicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  // The session token is passed to Convex: it is what decides whether the
  // reader has "membre" rights and therefore whether restricted content is served
  // (F-35). Without a token, Convex locks — gating is never client-side.
  const token = await convexAuthNextjsToken();
  // `undefined` = the request FAILED; `null` = the publication does not exist.
  // Conflating them would turn an outage into a 404, and would tell search engines that
  // the page has disappeared when it still exists (F-02).
  const pub = await fetchOrFallback(
    'bibliotheque/[slug]',
    () => fetchQuery(api.publications.getBySlug, { slug }, { token }),
    undefined,
  );
  if (pub === undefined) {
    return (
      <div className={`${WRAP} py-16`}>
        <DataUnavailable />
      </div>
    );
  }
  if (!pub) notFound();

  const t = await getTranslations('library');
  const td = await getTranslations('library.detail');
  const tTrad = await getTranslations('translation');
  // Related publications are a complement: their absence does not justify
  // losing the already loaded entry.
  const related = await fetchOrFallback(
    'bibliotheque/[slug]:related',
    () =>
      fetchQuery(
        api.publications.relatedByTheme,
        { theme: pub.theme, excludeSlug: pub.slug, limit: 3 },
        { token },
      ),
    EMPTY_RELATED_PUBLICATIONS,
  );

  // TRANSLATION ON READ (cf. convex/translation.ts). The writing language
  // is the FIRST of `languages`; if the reader shares it, no banner.
  // The cache read is outage-tolerant: a missing translation must
  // not take down an already loaded entry.
  const sp = await searchParams;
  const loc = resolveLocale(locale);
  const pubLang = resolveLocale(pub.languages[0]);
  const cached =
    pubLang === loc
      ? null
      : await fetchOrFallback(
          'bibliotheque/[slug]:traduction',
          () =>
            fetchQuery(
              api.translation.getTranslation,
              {
                sourceType: 'publication',
                sourceId: pub._id,
                targetLocale: loc,
              },
              { token },
            ),
          null,
        );
  const display = resolveArticleDisplay(
    pubLang,
    loc,
    cached,
    sp.original === '1',
  );
  // The displayed text and its language go together. `keypoints` and `body` keep
  // their segmentation: the translation output schema imposes the SAME
  // number of items, which makes the pairing safe.
  const shown =
    display.kind === 'translated'
      ? {
          title: display.fields.title,
          abstract: display.fields.abstract ?? pub.abstract,
          keypoints: display.fields.keypoints ?? pub.keypoints,
          body: display.fields.body,
          lang: loc,
        }
      : {
          title: pub.title,
          abstract: pub.abstract,
          keypoints: pub.keypoints,
          body: pub.body,
          lang: pubLang,
        };
  const attrs = textAttrs(shown.lang, loc);

  // Permanent link of THIS page. The stored `10.59000/dt.<slug>` identifier is
  // not a registered DOI (audit A-2): it is neither displayed nor linked to
  // doi.org until `isRegisteredDoi` accepts its prefix.
  const permalink = `${SITE_URL}/${locale}/bibliotheque/${pub.slug}`;
  const doiRegistered = isRegisteredDoi(pub.doi);
  const citations = buildCitations({ ...pub, url: permalink }, locale);
  // Uploaded document (F-32) if present. Without one there is NO download
  // button (it used to fall back to a DOI record that does not exist) — only
  // a note saying so.
  const fileHref = pub.fileUrl;
  const langNames = pub.languages
    .map((l) => vocabulary(t, 'langs.', l))
    .join(', ');
  const langCodes = pub.languages.map((l) => l.toUpperCase()).join(', ');

  const subParts = [
    td('publishedOn', { date: formatLongDate(pub.publishedAt, locale) }),
    ...(pub.pages ? [td('pages', { count: pub.pages })] : []),
    langNames,
    ...(doiRegistered ? [`DOI ${pub.doi}`] : []),
  ];

  return (
    <ViewCounter slug={pub.slug} initial={pub.views}>
      {/* View counter (F-37): records the current view and holds
          the displayed number (cf. view-counter.tsx). */}
      <div>
        {/* Breadcrumb */}
        <div className={`${WRAP} pt-8`}>
          <p className="text-[13px] text-muted">
            <Link href="/" className="text-muted hover:text-ink">
              {t('breadcrumbHome')}
            </Link>{' '}
            /{' '}
            <Link href="/bibliotheque" className="text-muted hover:text-ink">
              {t('title')}
            </Link>{' '}
            / {vocabulary(t, 'themes.', pub.theme)}
          </p>
        </div>

        {/* Publication header */}
        <header className="border-b border-line">
          <div className={`${WRAP} pb-12 pt-6`}>
            <Reveal>
              <div className="mb-4 flex flex-wrap items-center gap-2.5">
                <span className="font-mono text-[11.5px] uppercase tracking-[0.06em] text-muted">
                  {vocabulary(t, 'types.', pub.type)}
                </span>
                <Badge variant="accent">
                  {vocabulary(t, 'themes.', pub.theme)}
                </Badge>
                <Badge variant="good" size="label">
                  {vocabulary(t, 'accessShort.', pub.access)}
                </Badge>
              </div>
              <h1
                {...attrs}
                className="max-w-[22ch] font-display text-[clamp(30px,4.2vw,48px)] font-medium leading-[1.08] tracking-[-0.015em]"
              >
                {shown.title}
              </h1>
              <p className="mt-5 text-[15px] text-ink-soft">
                {td('by')}{' '}
                <AuthorList
                  names={pub.authors.map((a) => a.name)}
                  locale={locale}
                />
              </p>
              <p className="mt-1.5 text-sm text-muted">
                {subParts.join(' · ')}
              </p>
              {/* View counter (F-37) — `pub.views` at server render,
                then the current view added once counted. */}
              <p className="mt-1 text-[13px] text-muted">
                <ViewsCount format="sentence" />
              </p>
            </Reveal>
          </div>
        </header>

        {/* Body */}
        {/* `minmax(0, 1fr)` and not the implicit `auto` track (RGAA 10.11):
            an `auto` track widens to the MINIMUM width of its content,
            and an unbreakable word in the article (DOI, citation URL) pushed it
            to 331 px in a 320 window — horizontal scrolling measured in
            the 27/09 audit, in French as well as Arabic. */}
        <div
          className={`${WRAP} grid grid-cols-[minmax(0,1fr)] gap-12 pb-24 pt-12 lg:grid-cols-[minmax(0,1fr)_340px]`}
        >
          {/* Article */}
          <article className="min-w-0">
            <TranslationNotice
              display={display}
              readerLocale={loc}
              sourceType="publication"
              sourceId={pub._id}
              pathname={`/bibliotheque/${slug}`}
            />

            <Reveal className="mt-8 block" as="div">
              <h2 className="font-display text-2xl">{td('abstract')}</h2>
              <p
                {...attrs}
                className="mt-4 max-w-[68ch] font-display text-xl leading-relaxed text-ink"
              >
                {shown.abstract}
              </p>
            </Reveal>

            {shown.keypoints.length ? (
              <Reveal className="mt-12">
                <h2 className="font-display text-2xl">{td('keypoints')}</h2>
                <ul {...attrs} className="mt-4 flex flex-col gap-3">
                  {shown.keypoints.map((kp) => (
                    <li
                      key={kp}
                      className="relative max-w-[68ch] ps-7 text-base leading-relaxed text-ink-soft before:absolute before:start-0 before:top-2.5 before:h-2 before:w-2 before:rounded-full before:bg-accent"
                    >
                      {kp}
                    </li>
                  ))}
                </ul>
              </Reveal>
            ) : null}

            {pub.image ? (
              <Reveal className="my-8 block" as="div">
                {/* Captioned image (RGAA 1.9): cf. `home-hero.tsx`. */}
                <figure
                  role="figure"
                  aria-label={`${vocabulary(t, 'types.', pub.type)} · ${vocabulary(t, 'themes.', pub.theme)} · Democracy Together`}
                  className="my-6"
                >
                  <div className="relative aspect-[16/9] overflow-hidden rounded-sm border border-line bg-surface-2">
                    <Image
                      src={pub.image}
                      alt=""
                      fill
                      sizes="(max-width: 880px) 100vw, 760px"
                      className="object-cover"
                    />
                  </div>
                  <figcaption className="mt-2 text-[12.5px] text-muted">
                    {vocabulary(t, 'types.', pub.type)} ·{' '}
                    {vocabulary(t, 'themes.', pub.theme)} · Democracy Together
                  </figcaption>
                </figure>
              </Reveal>
            ) : null}

            {shown.body.length ? (
              <Reveal>
                <h2 className="font-display text-2xl">{td('extract')}</h2>
                <div {...attrs} className="mt-4">
                  {shown.body.map((para) => (
                    <p
                      key={para.slice(0, 24)}
                      className="mb-4 max-w-[68ch] font-display text-lg leading-[1.7] text-ink"
                    >
                      {para}
                    </p>
                  ))}
                </div>
              </Reveal>
            ) : null}

            <CiteBlock citations={citations} />

            {/* Authors */}
            <div className="mt-12 flex flex-wrap gap-6 border-t border-line pt-8">
              {pub.authors.map((a) => (
                <div key={a.name} className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="grid h-12 w-12 place-items-center rounded-full bg-accent-tint font-mono font-semibold text-accent-text"
                  >
                    {initials(a.name)}
                  </span>
                  <div>
                    <b className="text-[14.5px]">{a.name}</b>
                    {a.role ? (
                      <span className="block text-[12.5px] text-muted">
                        {a.role}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </article>

          {/* Sidebar */}
          <aside className="flex flex-col gap-6 lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-sm border border-line bg-surface p-5">
              {/* Members-only publication (F-35): `locked` is decided by
                Convex, never by the client. No document URL is served
                here — we offer membership instead of the download. */}
              {pub.locked ? (
                <div className="flex flex-col gap-3">
                  <h2 className="font-display text-lg leading-snug">
                    {td('lockedTitle')}
                  </h2>
                  <p className="text-[13.5px] leading-relaxed text-ink-soft">
                    {td('lockedBody')}
                  </p>
                  <Link
                    href="/adhesion"
                    className="inline-flex w-full items-center justify-center rounded-sm bg-accent px-4 py-3 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-strong"
                  >
                    {td('lockedCta')}
                  </Link>
                  <Link
                    href="/connexion"
                    className="inline-flex w-full items-center justify-center rounded-sm border border-line-strong px-4 py-3 text-sm font-semibold text-ink transition-colors hover:border-ink hover:bg-accent-tint"
                  >
                    {td('lockedSignIn')}
                  </Link>
                  <a
                    href="#cite"
                    className="inline-flex w-full items-center justify-center rounded-sm px-4 py-3 text-sm font-semibold text-accent-text transition-colors hover:bg-accent-tint"
                  >
                    {td('cite')}
                  </a>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {fileHref ? (
                    <DownloadLink
                      slug={pub.slug}
                      href={fileHref}
                      className="inline-flex w-full items-center justify-center rounded-sm bg-accent px-4 py-3 text-sm font-semibold text-accent-contrast transition-colors hover:bg-accent-strong"
                    >
                      {td('download')}
                    </DownloadLink>
                  ) : (
                    <p className="text-[12.5px] leading-relaxed text-ink-soft">
                      {td('noFileNote')}
                    </p>
                  )}
                  {/* The attached document, rebuilt in the reader's language
                    (images preserved). Offered ONLY when there is a
                    file: without a PDF, the document view would have nothing to
                    show and the link would lead to an empty page. */}
                  {fileHref ? (
                    <Link
                      href={`/bibliotheque/${slug}/document`}
                      className="inline-flex w-full items-center justify-center rounded-sm border border-line-strong bg-surface px-4 py-3 text-sm font-medium text-ink-soft transition-colors hover:text-ink"
                    >
                      {tTrad('docTitle')}
                    </Link>
                  ) : null}
                  {/* "Lire en ligne" only makes sense with a document. */}
                  {fileHref ? (
                    <DownloadLink
                      slug={pub.slug}
                      href={fileHref}
                      className="inline-flex w-full items-center justify-center rounded-sm border border-line-strong px-4 py-3 text-sm font-semibold text-ink transition-colors hover:border-ink hover:bg-accent-tint"
                    >
                      {td('readOnline')}
                    </DownloadLink>
                  ) : null}
                  <a
                    href="#cite"
                    className="inline-flex w-full items-center justify-center rounded-sm px-4 py-3 text-sm font-semibold text-accent-text transition-colors hover:bg-accent-tint"
                  >
                    {td('cite')}
                  </a>
                </div>
              )}
              <div className="mt-4 flex items-center gap-2 rounded-sm border border-line bg-surface-2 px-2.5 py-2 font-mono text-xs text-ink-soft">
                <span className="overflow-hidden text-ellipsis whitespace-nowrap">
                  {doiRegistered
                    ? `doi.org/${pub.doi}`
                    : permalink.replace(/^https?:\/\//, '')}
                </span>
                <CopyButton
                  text={
                    doiRegistered ? `https://doi.org/${pub.doi}` : permalink
                  }
                  copiedLabel={td('copied')}
                  size="xs"
                  className="ms-auto"
                >
                  {td('copy')}
                </CopyButton>
              </div>
            </div>

            <div className="rounded-sm border border-line bg-surface p-5">
              <h2 className="mb-4 font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
                {td('metadata')}
              </h2>
              <dl className="flex flex-col">
                <MetaRow
                  k={td('metaType')}
                  v={vocabulary(t, 'types.', pub.type)}
                  first
                />
                <MetaRow
                  k={td('metaPublished')}
                  v={formatLongDate(pub.publishedAt, locale)}
                />
                <MetaRow k={td('metaLanguages')} v={langCodes} />
                <MetaRow
                  k={td('metaRegion')}
                  v={vocabulary(t, 'regions.', pub.region)}
                />
                <MetaRow
                  k={td('metaTheme')}
                  v={vocabulary(t, 'themes.', pub.theme)}
                />
                {pub.pages ? (
                  <MetaRow k={td('metaPages')} v={String(pub.pages)} />
                ) : null}
                {pub.license ? (
                  <MetaRow k={td('metaLicense')} v={pub.license} />
                ) : null}
              </dl>
            </div>

            <div className="rounded-sm border border-line bg-surface p-5">
              <h2 className="mb-4 font-mono text-[12px] uppercase tracking-[0.08em] text-muted">
                {td('impact')}
              </h2>
              <div className="grid grid-cols-3 gap-3 text-center">
                <Metric n={<ViewsCount format="number" />} l={td('views')} />
                <Metric
                  n={pub.downloads.toLocaleString(intlLocale(locale))}
                  l={td('downloadsShort')}
                />
                <Metric n={String(pub.citations)} l={td('citationsShort')} />
              </div>
            </div>
          </aside>
        </div>

        {/* Related */}
        {related.length ? (
          <section className="border-t border-line">
            <div className={`${WRAP} py-16`}>
              <Reveal>
                <h2 className="mb-6 font-display text-2xl">{td('related')}</h2>
              </Reveal>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {related.map((rp) => (
                  <PublicationCard
                    key={rp._id}
                    pub={rp}
                    locale={locale}
                    variant="compact"
                  />
                ))}
              </div>
            </div>
          </section>
        ) : null}
      </div>
    </ViewCounter>
  );
}

function MetaRow({ k, v, first }: { k: string; v: string; first?: boolean }) {
  return (
    <div
      className={`flex justify-between gap-4 py-2.5 text-[13.5px] ${
        first ? '' : 'border-t border-line'
      }`}
    >
      <dt className="text-muted">{k}</dt>
      <dd className="text-end font-medium text-ink">{v}</dd>
    </div>
  );
}

function Metric({ n, l }: { n: React.ReactNode; l: string }) {
  return (
    <div>
      <div className="font-mono text-[22px] font-semibold text-ink">{n}</div>
      <div className="mt-0.5 text-[11px] text-muted">{l}</div>
    </div>
  );
}
