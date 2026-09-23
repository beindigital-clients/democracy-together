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
  // `undefined` = la requête a ÉCHOUÉ ; `null` = l'article n'existe pas.
  // Les confondre ferait traiter une panne comme une absence (F-02).
  const post = await fetchOrFallback<Article | null | undefined>(
    'actualites/[slug]:metadata',
    () => client.fetch<Article | null>(postBySlugQuery, { slug }),
    undefined,
  );
  if (post === undefined) {
    // Rendu DÉGRADÉ : on interdit l'indexation. Sans cela, un moteur qui passe
    // pendant la panne remplacerait l'article par le panneau « indisponible »
    // dans son index — c'est la seule objection sérieuse au repli en 200, et
    // elle se traite ici. `follow` reste vrai : les liens gardent leur valeur.
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

  // TROIS issues, et elles ne se confondent pas (audit § 5.1, F-02, F-10) :
  //  - article absent      -> 404 localisée ;
  //  - Sanity indisponible -> 200 + panneau « momentanément indisponible » ;
  //  - article présent     -> l'article.
  //
  // Convertir une panne en 404 resterait un mensonge — l'article existe
  // peut-être, et un 404 indexé coûterait son référencement. Mais la version
  // précédente relançait l'erreur pour atteindre `error.tsx`, et c'est ce que
  // F-10 a mesuré : `error.tsx` est un composant CLIENT, son contenu n'est pas
  // dans le HTML servi. Résultat, 500 avec ZÉRO caractère — page blanche pour
  // qui n'exécute pas JavaScript, quand la même panne sur /fr/bibliotheque/…
  // rendait 671 caractères lisibles. Deux backends, deux comportements, et le
  // pire des deux sur la seule page adossée à Sanity.
  //
  // L'objection SEO au 200 (un moteur indexant le panneau à la place de
  // l'article) est traitée dans `generateMetadata` par un `noindex` posé sur le
  // seul rendu dégradé.
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
          <span aria-hidden="true">←</span> {t('back')}
        </Link>
        <DataUnavailable className="mt-8" />
      </div>
    );
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
