import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { ArrowForward } from '@/components/ui/arrow';
import { intlLocale } from '@/i18n/locale';
import type { NewsItem } from '@/lib/news-content';

/** A `YYYY-MM-DD` publication day, in the page's language. */
export function formatNewsDate(day: string, locale: string): string {
  // Read and written in UTC: a calendar day, not an instant — formatted in a
  // time zone west of Greenwich, it would show the day before.
  return new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`));
}

// News card of the /actualites list. headingLevel adapts to the context's
// hierarchy (h2 on the list, h3 under a section).
export function PostCard({
  post,
  locale,
  headingLevel = 3,
}: {
  post: NewsItem;
  locale: string;
  headingLevel?: 2 | 3;
}) {
  const t = useTranslations('news');
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  // Texts not yet translated fall back to another language (French first):
  // they say so, for screen readers and hyphenation (RGAA 8.7).
  const lang = post.lang !== locale ? post.lang : undefined;

  return (
    <Link
      href={`/actualites/${post.slug}`}
      className="group flex h-full flex-col rounded-md border border-line bg-surface p-5 shadow-card transition-colors hover:border-line-strong"
    >
      <time
        dateTime={post.publishedOn}
        className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted"
      >
        {formatNewsDate(post.publishedOn, locale)}
      </time>
      <Heading
        lang={lang}
        className="mt-3 font-display text-xl leading-snug text-ink transition-colors group-hover:text-accent-text"
      >
        {post.title}
      </Heading>
      {post.excerpt ? (
        <p
          lang={lang}
          className="mt-2 line-clamp-3 text-sm leading-relaxed text-ink-soft"
        >
          {post.excerpt}
        </p>
      ) : null}
      <span className="mt-auto pt-4 font-mono text-[11px] uppercase tracking-[0.1em] text-accent-text">
        {t('readMore')} <ArrowForward />
      </span>
    </Link>
  );
}
