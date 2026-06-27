import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

export type PostCardData = {
  _id: string;
  title: string;
  slug: string;
  excerpt?: string;
  publishedAt: string;
};

// Carte d'actualité réutilisée par la liste /actualites et la section accueil.
// headingLevel s'adapte à la hiérarchie du contexte (h2 sur la liste, h3 sous
// une section d'accueil).
export function PostCard({
  post,
  locale,
  headingLevel = 3,
}: {
  post: PostCardData;
  locale: string;
  headingLevel?: 2 | 3;
}) {
  const t = useTranslations('news');
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const fmt = new Intl.DateTimeFormat(locale, { dateStyle: 'long' });

  return (
    <Link
      href={`/actualites/${post.slug}`}
      className="group flex h-full flex-col rounded-md border border-line bg-surface p-5 shadow-card transition-colors hover:border-line-strong"
    >
      <time
        dateTime={post.publishedAt}
        className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted"
      >
        {fmt.format(new Date(post.publishedAt))}
      </time>
      <Heading className="mt-3 font-display text-xl leading-snug text-ink transition-colors group-hover:text-accent-text">
        {post.title}
      </Heading>
      {post.excerpt ? (
        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-soft">
          {post.excerpt}
        </p>
      ) : null}
      <span className="mt-auto pt-4 font-mono text-[11px] uppercase tracking-[0.1em] text-accent-text">
        {t('readMore')} →
      </span>
    </Link>
  );
}
