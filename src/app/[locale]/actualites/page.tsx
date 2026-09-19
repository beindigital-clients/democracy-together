import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { client } from '@dt-sanity/lib/client';
import { postsQuery } from '@dt-sanity/lib/queries';
import { PostCard, type PostCardData } from '@/components/news/post-card';
import { Reveal, RevealGroup, RevealItem } from '@/components/motion/reveal';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'news' });
  return {
    title: t('metaTitle'),
    description: t('subtitle'),
    alternates: {
      canonical: `${SITE}/${locale}/actualites`,
      languages: {
        fr: `${SITE}/fr/actualites`,
        en: `${SITE}/en/actualites`,
        'x-default': `${SITE}/fr/actualites`,
      },
    },
  };
}

export default async function NewsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('news');
  // Repli si Sanity est indisponible (audit § 5.1) : la page rendait un 500
  // générique faute de try/catch, contrairement à src/lib/home.ts et about.ts
  // qui replient déjà. Ici, la dégradation gracieuse est le bon comportement :
  // la liste se vide et le reste du site continue de fonctionner.
  let posts: PostCardData[] = [];
  try {
    posts = (await client.fetch<PostCardData[]>(postsQuery, {
      language: locale,
    })) ?? [];
  } catch (err) {
    console.error('[actualites] Sanity indisponible :', err);
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-12 sm:px-6 md:py-16">
      <header className="max-w-[60ch]">
        <Reveal>
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
            {t('eyebrow')}
          </p>
          <h1 className="mt-3 font-display text-[clamp(30px,4vw,46px)] font-medium leading-[1.08] tracking-[-0.02em]">
            {t('title')}
          </h1>
          <p className="mt-4 text-lg leading-relaxed text-ink-soft">
            {t('subtitle')}
          </p>
        </Reveal>
      </header>

      {posts.length === 0 ? (
        <Reveal className="mt-10 rounded-md border border-dashed border-line-strong bg-surface px-6 py-16 text-center text-ink-soft">
          {t('empty')}
        </Reveal>
      ) : (
        <RevealGroup
          as="ul"
          aria-label={t('title')}
          className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {posts.map((p) => (
            <RevealItem as="li" key={p._id}>
              <PostCard post={p} locale={locale} headingLevel={2} />
            </RevealItem>
          ))}
        </RevealGroup>
      )}
    </div>
  );
}
