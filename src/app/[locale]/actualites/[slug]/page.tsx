import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { resolveLocale } from '@/i18n/locale';
import { loadNewsArticle } from '@/lib/contenus/load';
import { DataUnavailable } from '@/components/ui/data-unavailable';
import { formatNewsDate } from '@/components/news/post-card';
import { articleJsonLd, hreflangFor, jsonLdScript } from '@/lib/seo';
import { ArrowBack } from '@/components/ui/arrow';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const res = await loadNewsArticle(slug, resolveLocale(locale));
  if (res.status === 'unavailable') {
    // DEGRADED rendering: we forbid indexing. Otherwise, a search engine passing by
    // during the outage would replace the article with the "indisponible" panel
    // in its index — that is the only serious objection to the 200 fallback, and
    // it is handled here. `follow` stays true: the links keep their value.
    return { robots: { index: false, follow: true } };
  }
  if (res.status === 'missing') return {};
  return {
    title: res.article.title,
    description: res.article.excerpt || undefined,
    // One article, one slug, five languages: each page names the others.
    alternates: {
      canonical: `${SITE}/${locale}/actualites/${slug}`,
      languages: hreflangFor(`actualites/${slug}`),
    },
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
  //  - article missing      -> localized 404;
  //  - backend unavailable  -> 200 + "momentanément indisponible" panel;
  //  - article present      -> the article.
  //
  // Converting an outage into a 404 would remain a lie — the article may
  // exist, and an indexed 404 would cost it its ranking. Rethrowing the error to
  // `error.tsx` is no better: it is a CLIENT component, its content is not in the
  // served HTML (F-10 measured a 500 with ZERO characters). The outage only
  // reaches this panel for an article the coded fallback does not carry
  // (`loadNewsArticle`).
  //
  // The SEO objection to the 200 (a search engine indexing the panel instead of
  // the article) is handled in `generateMetadata` by a `noindex` set on the
  // degraded rendering only.
  const res = await loadNewsArticle(slug, resolveLocale(locale));

  if (res.status === 'unavailable') {
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

  if (res.status === 'missing') notFound();
  const post = res.article;
  // An article not yet translated is served in its fallback language
  // (French first), and says so (RGAA 8.7).
  const lang = post.lang !== locale ? post.lang : undefined;

  // `Article` structured data (F-03, P1 no. 4 of the action plan), set ONLY HERE:
  // the degraded rendering above displays no article and already carries a
  // `noindex` — structured data there would describe content the page does not serve.
  //
  // `post.title` and `post.excerpt` are entered in the back office: their
  // serialization goes through `jsonLdScript`, which prevents a title containing
  // `</script>` from escaping the block.
  const fiche = articleJsonLd({
    headline: post.title,
    slug,
    locale,
    description: post.excerpt || undefined,
    datePublished: post.publishedOn,
    inLanguage: post.lang,
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
          dateTime={post.publishedOn}
          className="font-mono text-[11px] uppercase tracking-[0.12em] text-accent-text"
        >
          {formatNewsDate(post.publishedOn, locale)}
        </time>
        <h1
          lang={lang}
          className="mt-3 font-display text-[clamp(28px,4vw,44px)] font-medium leading-[1.1] tracking-[-0.02em]"
        >
          {post.title}
        </h1>
        {post.excerpt ? (
          <p
            lang={lang}
            className="mt-4 max-w-[68ch] text-lg leading-relaxed text-ink-soft"
          >
            {post.excerpt}
          </p>
        ) : null}
      </header>

      {/* Paragraphs as entered: plain text, rendered as text. */}
      <div lang={lang} className="mt-2">
        {post.body.map((paragraph, i) => (
          <p
            key={i}
            className="mt-4 max-w-[68ch] leading-relaxed text-ink-soft"
          >
            {paragraph}
          </p>
        ))}
      </div>
    </article>
  );
}
