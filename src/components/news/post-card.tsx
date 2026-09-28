import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { ArrowForward } from '@/components/ui/arrow';
import { intlLocale } from '@/i18n/locale';

export type PostCardData = {
  _id: string;
  title: string;
  slug: string;
  excerpt?: string;
  publishedAt: string;
};

// News card reused by the /actualites list and the home page section.
// headingLevel adapts to the context's hierarchy (h2 on the list, h3 under
// a home page section).
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
  const fmt = new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: 'long',
  });

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
        {t('readMore')} <ArrowForward />
      </span>
    </Link>
  );
}
