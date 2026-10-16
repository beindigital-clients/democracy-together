import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { vocabulary } from '@/i18n/vocabulary';
import { formatLongDate } from '@/lib/publications';

// A published contribution in a list (server component): title, standfirst,
// author, organization, field, date, reading time.
export type PublicCardData = {
  slug: string;
  title: string;
  standfirst: string;
  lang: string;
  fields: string[];
  authors: { name: string }[];
  organization: { name: string; slug: string } | null;
  publishedAt: number;
  minutes: number;
};

export async function PublicCard({
  item,
  locale,
}: {
  item: PublicCardData;
  locale: string;
}) {
  const t = await getTranslations('kohopPublic');
  const tk = await getTranslations('kohop');
  return (
    <article className="rounded-md border border-line bg-surface p-5 transition-colors focus-within:border-ink hover:border-ink sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        {item.fields.map((f) => (
          <Badge key={f} variant="accent" size="label">
            {vocabulary(tk, 'field_', f)}
          </Badge>
        ))}
        <span className="font-mono text-[11.5px] uppercase tracking-[0.06em] text-muted">
          {item.lang.toUpperCase()}
        </span>
      </div>
      <h2 className="mt-3 font-display text-2xl leading-snug">
        <Link
          href={`/kohop/${item.slug}`}
          lang={item.lang}
          className="wrap-anywhere text-ink after:absolute after:inset-0 hover:underline"
        >
          {item.title}
        </Link>
      </h2>
      <p lang={item.lang} className="mt-2 max-w-[68ch] text-ink-soft">
        {item.standfirst}
      </p>
      <p className="mt-3 text-sm text-ink-soft">
        {t('by', { authors: item.authors.map((a) => a.name).join(', ') })}
        {item.organization ? ` · ${item.organization.name}` : ''}
      </p>
      <p className="mt-1 text-[13px] text-muted">
        {t('publishedOn', { date: formatLongDate(item.publishedAt, locale) })}
        {' · '}
        {t('readingTime', { minutes: item.minutes })}
      </p>
    </article>
  );
}
