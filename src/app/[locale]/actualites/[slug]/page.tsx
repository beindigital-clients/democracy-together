import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PortableText } from 'next-sanity';
import { Link } from '@/i18n/navigation';
import { client } from '@dt-sanity/lib/client';
import { postBySlugQuery } from '@dt-sanity/lib/queries';
import { fetchOrFallback } from '@/lib/convex-fallback';
import { DataUnavailable } from '@/components/ui/data-unavailable';
import { ptComponents } from '@/components/news/portable-text';
import { articleJsonLd, jsonLdScript } from '@/lib/seo';
import { ArrowBack } from '@/components/ui/arrow';
import { intlLocale } from '@/i18n/locale';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

type Article = {
  _id: string;
  title: string;
  slug: string;
  language: string;
  excerpt?: string;
  publishedAt: string;
  body?: unknown;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  // `undefined` = the request FAILED; `null` = the article does not exist.
  // Conflating them would treat an outage as an absence (F-02).
  const post = await fetchOrFallback<Article | null | undefined>(
    'actualites/[slug]:metadata',
    () => client.fetch<Article | null>(postBySlugQuery, { slug }),
    undefined,
  );
  if (post === undefined) {
    // DEGRADED rendering: we forbid indexing. Otherwise, a search engine passing by
    // during the outage would replace the article with the "indisponible" panel
    // in its index — that is the only serious objection to the 200 fallback, and
    // it is handled here. `follow` stays true: the links keep their value.
    return { robots: { index: false, follow: true } };
  }
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `${SITE}/${locale}/actualites/${slug}` },
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('news');

  // THREE outcomes, and they must not be conflated (audit § 5.1, F-02, F-10):
  //  - article missing     -> localized 404;
  //  - Sanity unavailable  -> 200 + "momentanément indisponible" panel;
  //  - article present     -> the article.
  //
  // Converting an outage into a 404 would remain a lie — the article may
  // exist, and an indexed 404 would cost it its ranking. But the previous
  // version rethrew the error to reach `error.tsx`, and that is what
  // F-10 measured: `error.tsx` is a CLIENT component, its content is not
  // in the served HTML. Result: 500 with ZERO characters — a blank page for
  // anyone not running JavaScript, whereas the same outage on /fr/bibliotheque/…
  // rendered 671 readable characters. Two backends, two behaviors, and the
  // worse of the two on the only page backed by Sanity.
  //
  // The SEO objection to the 200 (a search engine indexing the panel instead of
  // the article) is handled in `generateMetadata` by a `noindex` set on the
  // degraded rendering only.
  const post = await fetchOrFallback<Article | null | undefined>(
    'actualites/[slug]',
    () => client.fetch<Article | null>(postBySlugQuery, { slug }),
    undefined,
  );

  if (post === undefined) {
    return (
      <div className="mx-auto max-w-[760px] px-4 py-10 sm:px-6 md:py-14">
        <Link
          href="/actualites"
          className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.12em] text-muted transition-colors hover:text-ink"
        >
          <ArrowBack /> {t('back')}
        </Link>
        <DataUnavailable className="mt-8" />
      </div>
    );
  }

  if (!post || post.language !== locale) notFound();
  const fmt = new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: 'long',
  });

  // `Article` structured data (F-03, P1 no. 4 of the action plan), set ONLY HERE:
  // the degraded rendering above displays no article and already carries a
  // `noindex` — structured data there would describe content the page does not serve.
  //
  // `post.title` and `post.excerpt` come from the CMS: their serialization goes
  // through `jsonLdScript`, which prevents a title containing `</script>` from escaping
  // the block.
  const fiche = articleJsonLd({
    headline: post.title,
    slug,
    locale,
    description: post.excerpt,
    datePublished: post.publishedAt,
    inLanguage: post.language,
  });

  return (
    <article className="mx-auto max-w-[760px] px-4 py-10 sm:px-6 md:py-14">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(fiche) }}
      />
      <Link
        href="/actualites"
        className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.12em] text-muted transition-colors hover:text-ink"
      >
        <ArrowBack /> {t('back')}
      </Link>

      <header className="mt-6 border-b border-line pb-8">
        <time
          dateTime={post.publishedAt}
          className="font-mono text-[11px] uppercase tracking-[0.12em] text-accent-text"
        >
          {fmt.format(new Date(post.publishedAt))}
        </time>
        <h1 className="mt-3 font-display text-[clamp(28px,4vw,44px)] font-medium leading-[1.1] tracking-[-0.02em]">
          {post.title}
        </h1>
        {post.excerpt ? (
          <p className="mt-4 max-w-[68ch] text-lg leading-relaxed text-ink-soft">
            {post.excerpt}
          </p>
        ) : null}
      </header>

      <div className="mt-2">
        {post.body ? (
          <PortableText value={post.body as never} components={ptComponents} />
        ) : null}
      </div>
    </article>
  );
}
