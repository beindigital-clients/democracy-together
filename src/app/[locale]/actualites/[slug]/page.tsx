import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PortableText } from 'next-sanity';
import { Link } from '@/i18n/navigation';
import { client } from '@dt-sanity/lib/client';
import { postBySlugQuery } from '@dt-sanity/lib/queries';

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

const ptComponents = {
  block: {
    normal: ({ children }: { children?: ReactNode }) => (
      <p className="mt-4 max-w-[68ch] leading-relaxed text-ink-soft">
        {children}
      </p>
    ),
    h2: ({ children }: { children?: ReactNode }) => (
      <h2 className="mt-8 font-display text-2xl">{children}</h2>
    ),
  },
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  // Une panne Sanity ne doit pas faire échouer le rendu ENTIER de la page :
  // les métadonnées sont accessoires, on les abandonne silencieusement et on
  // laisse le composant de page décider du sort de la requête.
  let post: Article | null;
  try {
    post = await client.fetch<Article | null>(postBySlugQuery, { slug });
  } catch {
    return {};
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
  // Distinction volontaire (audit § 5.1) :
  //  - article absent            -> 404 localisée (not-found.tsx) ;
  //  - Sanity indisponible       -> page d'erreur localisée (error.tsx).
  // Convertir une panne en 404 serait un mensonge : l'article existe peut-être,
  // et un 404 indexé par les moteurs coûterait le référencement de l'article.
  let post: Article | null;
  try {
    post = await client.fetch<Article | null>(postBySlugQuery, { slug });
  } catch (err) {
    console.error('[actualites/slug] Sanity indisponible :', err);
    throw err;
  }
  if (!post || post.language !== locale) notFound();
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'long' });

  return (
    <article className="mx-auto max-w-[760px] px-4 py-10 sm:px-6 md:py-14">
      <Link
        href="/actualites"
        className="inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.12em] text-muted transition-colors hover:text-ink"
      >
        <span aria-hidden="true">←</span> {t('back')}
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
