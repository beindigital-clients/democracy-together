import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { fetchQuery } from 'convex/nextjs';
import { api } from '@convex/_generated/api';
import { KOHOP_LICENCE } from '@convex/lib/kohop';
import { Link } from '@/i18n/navigation';
import { Reveal } from '@/components/motion/reveal';
import { Badge, type BadgeVariant } from '@/components/ui/badge';
import { DataUnavailable } from '@/components/ui/data-unavailable';
import { KohopText } from '@/components/kohop/kohop-text';
import { PublicCite } from '@/components/kohop/public-cite';
import { fetchOrFallback } from '@/lib/convex-fallback';
import {
  alternatesFor,
  jsonLdScript,
  scholarlyArticleJsonLd,
  SITE_URL,
} from '@/lib/seo';
import { buildCitations, formatLongDate } from '@/lib/publications';
import { vocabulary } from '@/i18n/vocabulary';

const WRAP = 'mx-auto w-full max-w-[1180px] px-4 sm:px-6';
const LICENCE_URL = 'https://creativecommons.org/licenses/by/4.0/';
const REC_VARIANT: Record<string, BadgeVariant> = {
  favorable: 'good',
  reserves: 'pending',
  defavorable: 'bad',
};

async function load(slug: string) {
  return await fetchOrFallback(
    'kohop/[slug]',
    () => fetchQuery(api.kohopPublic.bySlug, { slug }),
    undefined,
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const page = await load(slug);
  if (!page) return {};
  const indexable = await fetchOrFallback(
    'kohop:indexable',
    () => fetchQuery(api.kohopPublic.indexable, {}),
    false,
  );
  const published = new Date(page.publishedAt);
  const day = `${published.getUTCFullYear()}/${String(published.getUTCMonth() + 1).padStart(2, '0')}/${String(published.getUTCDate()).padStart(2, '0')}`;
  const url = `${SITE_URL}/${locale}/kohop/${slug}`;
  return {
    title: page.title,
    description: page.standfirst,
    alternates: alternatesFor(locale, `kohop/${slug}`),
    // Open to readers while the pilot lasts, closed to search engines.
    ...(indexable ? {} : { robots: { index: false, follow: true } }),
    // Google Scholar style tags: one `citation_author` per author.
    other: {
      citation_title: page.title,
      citation_author: page.authors.map((a) => a.name),
      citation_publication_date: day,
      citation_journal_title: 'KOHOP — Democracy Together',
      citation_language: page.lang,
      citation_abstract_html_url: url,
      ...(page.keywords.length
        ? { citation_keywords: page.keywords.join('; ') }
        : {}),
    },
  };
}

export default async function KohopArticlePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const page = await load(slug);
  if (page === undefined) {
    return (
      <div className={`${WRAP} py-16`}>
        <DataUnavailable />
      </div>
    );
  }
  if (!page) notFound();

  const t = await getTranslations('kohopPublic');
  const tk = await getTranslations('kohop');
  const permalink = `${SITE_URL}/${locale}/kohop/${page.slug}`;
  const year = new Date(page.publishedAt).getUTCFullYear();
  const citations = buildCitations(
    {
      title: page.title,
      authors: page.authors.map((a) => ({ name: a.name })),
      year,
      doi: null,
      url: permalink,
      type: 'article',
    },
    locale,
  );
  const authorLine = page.authors.map((a) => a.name).join(', ');
  const iso = new Date(page.publishedAt).toISOString().slice(0, 10);
  const jsonLd = scholarlyArticleJsonLd({
    headline: page.title,
    slug: page.slug,
    locale,
    description: page.standfirst,
    datePublished: iso,
    inLanguage: page.lang,
    authors: page.authors,
    keywords: page.keywords,
    licenceUrl: LICENCE_URL,
  });

  return (
    <div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />
      <div className={`${WRAP} pt-8`}>
        <p className="text-[13px] text-muted">
          <Link href="/" className="text-muted hover:text-ink">
            {t('breadcrumbHome')}
          </Link>{' '}
          /{' '}
          <Link href="/kohop" className="text-muted hover:text-ink">
            KOHOP
          </Link>
        </p>
      </div>

      <header className="border-b border-line">
        <div className={`${WRAP} pb-10 pt-6`}>
          <Reveal>
            {page.retraction ? (
              <div
                role="note"
                className="mb-6 rounded-md border border-bar-5 bg-surface-2 p-4"
              >
                <p className="font-medium text-ink">{t('retractedTitle')}</p>
                <p className="mt-1 text-ink-soft">{page.retraction.notice}</p>
                <p className="mt-1 text-sm text-muted">
                  {t('retractedOn', {
                    date: formatLongDate(page.retraction.at, locale),
                  })}
                </p>
              </div>
            ) : null}
            <div className="mb-4 flex flex-wrap items-center gap-2.5">
              {page.fields.map((f) => (
                <Badge key={f} variant="accent" size="label">
                  {vocabulary(tk, 'field_', f)}
                </Badge>
              ))}
              <span className="font-mono text-[11.5px] uppercase tracking-[0.06em] text-muted">
                {page.lang.toUpperCase()}
              </span>
            </div>
            <h1
              lang={page.lang}
              className="max-w-[26ch] font-display text-[clamp(30px,4.2vw,48px)] font-medium leading-[1.08] tracking-[-0.015em]"
            >
              {page.title}
            </h1>
            <p
              lang={page.lang}
              className="mt-5 max-w-[68ch] font-display text-xl leading-relaxed text-ink-soft"
            >
              {page.standfirst}
            </p>
            <p className="mt-5 text-[15px] text-ink-soft">
              {t('by', { authors: authorLine })}
              {page.organization ? ` · ${page.organization.name}` : ''}
            </p>
            <p className="mt-1.5 text-sm text-muted">
              {t('publishedOn', {
                date: formatLongDate(page.publishedAt, locale),
              })}
              {' · '}
              {t('readingTime', { minutes: page.minutes })}
            </p>
          </Reveal>
        </div>
      </header>

      <div
        className={`${WRAP} grid grid-cols-[minmax(0,1fr)] gap-12 pb-24 pt-12 lg:grid-cols-[minmax(0,1fr)_340px]`}
      >
        <article className="min-w-0">
          <div className="max-w-[68ch]">
            <KohopText markdown={page.body} lang={page.lang} />
          </div>

          {page.links.length > 0 ? (
            <section aria-labelledby="kohop-further" className="mt-12">
              <h2 id="kohop-further" className="font-display text-2xl">
                {t('furtherReading')}
              </h2>
              <ul className="mt-3 list-disc space-y-1.5 ps-5">
                {page.links.map((l, i) => (
                  <li key={i} className="wrap-anywhere">
                    {l.publicationSlug ? (
                      <Link
                        href={`/bibliotheque/${l.publicationSlug}`}
                        className="text-accent-text underline underline-offset-2 hover:no-underline"
                      >
                        {l.label}
                      </Link>
                    ) : l.url ? (
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer nofollow ugc"
                        className="text-accent-text underline underline-offset-2 hover:no-underline"
                      >
                        {l.label}
                      </a>
                    ) : (
                      l.label
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section aria-labelledby="kohop-review" className="mt-14">
            <h2 id="kohop-review" className="font-display text-2xl">
              {t('peerReview')}
            </h2>
            <p className="mt-2 max-w-[68ch] text-ink-soft">
              {t('peerReviewLead')}
            </p>

            {page.path.length > 0 ? (
              <div className="mt-6">
                <h3 className="font-medium text-ink">{t('pathTitle')}</h3>
                <ol className="mt-3 space-y-2 border-s-2 border-line ps-4">
                  {page.path.map((p, i) => (
                    <li key={`${p.kind}-${p.at}-${i}`} className="text-sm">
                      <span className="font-medium text-ink">
                        {vocabulary(tk, 'event_', p.kind)}
                      </span>
                      <span className="ms-2 text-muted">
                        {formatLongDate(p.at, locale)}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            <ul className="mt-8 space-y-5">
              {page.reviews.map((r, i) => (
                <li
                  key={`${r.displayName}-${i}`}
                  className="rounded-md border border-line bg-surface p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="wrap-anywhere font-medium text-ink">
                        {t('reviewBy', { name: r.displayName })}
                      </h3>
                      {r.affiliation ? (
                        <p className="text-sm text-ink-soft">{r.affiliation}</p>
                      ) : null}
                    </div>
                    <Badge
                      variant={REC_VARIANT[r.recommendation] ?? 'default'}
                      size="label"
                    >
                      {vocabulary(tk, 'rec_', r.recommendation)}
                    </Badge>
                  </div>
                  <div className="mt-3">
                    <KohopText markdown={r.analysis} lang={page.lang} />
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    {formatLongDate(r.submittedAt, locale)}
                  </p>
                </li>
              ))}
            </ul>

            {page.response ? (
              <div className="mt-8 rounded-md border border-accent-edge bg-accent-tint p-5">
                <h3 className="font-medium text-ink">{t('authorReply')}</h3>
                <div className="mt-2">
                  <KohopText markdown={page.response} lang={page.lang} />
                </div>
              </div>
            ) : null}

            {page.submitted ? (
              <details className="mt-8 rounded-md border border-line bg-surface p-5">
                <summary className="cursor-pointer font-medium text-accent-text">
                  {t('submittedVersion')}
                </summary>
                <p className="mt-2 text-sm text-muted">
                  {t('submittedVersionNote')}
                </p>
                <h3 lang={page.lang} className="mt-4 font-display text-xl">
                  {page.submitted.title}
                </h3>
                <div className="mt-3 max-w-[68ch]">
                  <KohopText markdown={page.submitted.body} lang={page.lang} />
                </div>
              </details>
            ) : null}
          </section>
        </article>

        <aside className="space-y-6">
          <PublicCite
            citations={citations}
            labels={{
              title: t('cite'),
              copy: t('citeCopy'),
              copied: t('citeCopied'),
              ris: t('citeRis'),
              risCopied: t('risCopied'),
            }}
          />
          <section
            aria-labelledby="kohop-meta"
            className="rounded-md border border-line bg-surface p-5 text-sm"
          >
            <h2 id="kohop-meta" className="sr-only">
              {t('licenceLabel')}
            </h2>
            <p className="font-medium text-ink">{t('licenceLabel')}</p>
            <p className="mt-1 text-ink-soft">
              {t('licenceText', { licence: page.licence || KOHOP_LICENCE })}{' '}
              <a
                href={LICENCE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-text underline"
              >
                CC BY 4.0
              </a>
            </p>
            <p className="mt-4 font-medium text-ink">{t('permalink')}</p>
            <p className="mt-1 break-all font-mono text-xs text-ink-soft">
              {permalink}
            </p>
          </section>
          <p>
            <Link
              href="/kohop"
              className="text-sm font-medium text-accent-text hover:underline"
            >
              ← {t('backToList')}
            </Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
