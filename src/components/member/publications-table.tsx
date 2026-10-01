'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { vocabulary } from '@/i18n/vocabulary';
import { formatLongDate } from '@/lib/publications';
import { cn } from '@/lib/utils';
import { ScrollableRegion } from '@/components/ui/scrollable-region';
import { Badge, type BadgeVariant } from '@/components/ui/badge';

// The member's library submissions (F-32), all statuses — shared by the
// dashboard (the latest few) and "Mes publications" (all of them).
//
// A TABLE, and it stays one: title, type, status and date are compared from
// row to row, and the E2E journeys find a submission by its row.

export type MyPublication = {
  _id: string;
  title: string;
  slug: string;
  type: string;
  status: string;
  submittedAt: number;
  reviewNotes: string | null;
};

// Status badges (shadcn `Badge`, barometer tones whose contrast holds in both
// themes). The status is WRITTEN in the badge: the colour only repeats it.
const STATUS_BADGE: Record<string, BadgeVariant> = {
  published: 'good',
  pending: 'pending',
  draft: 'default',
};

const TH =
  'px-4 py-3 text-start font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-muted';

export function PublicationsTable({
  items,
  caption,
}: {
  items: readonly MyPublication[];
  caption: string;
}) {
  const t = useTranslations('library');
  const locale = useLocale();
  return (
    <ScrollableRegion
      label={caption}
      className="rounded-md border border-line bg-surface"
    >
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className={TH}>
              {t('mine.colTitle')}
            </th>
            <th scope="col" className={TH}>
              {t('mine.colStatus')}
            </th>
            <th scope="col" className={cn(TH, 'hidden md:table-cell')}>
              {t('mine.colDate')}
            </th>
            <th scope="col" className={TH}>
              <span className="sr-only">{t('mine.open')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr
              key={p._id}
              className="border-b border-line align-top last:border-0 hover:bg-accent-tint/50"
            >
              <td className="px-4 py-3">
                <span className="block wrap-anywhere font-medium text-ink">
                  {p.title}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {vocabulary(t, 'types.', p.type)}
                  <span className="md:hidden">
                    {' · '}
                    {formatLongDate(p.submittedAt, locale)}
                  </span>
                </span>
                {p.status === 'draft' && p.reviewNotes ? (
                  <span className="mt-1.5 block max-w-[52ch] wrap-anywhere border-s-2 border-line-strong ps-2 text-xs italic text-ink-soft">
                    {p.reviewNotes}
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3">
                <Badge
                  variant={STATUS_BADGE[p.status] ?? STATUS_BADGE.draft}
                  size="label"
                  className="whitespace-nowrap"
                >
                  {vocabulary(t, 'status.', p.status)}
                </Badge>
              </td>
              <td className="hidden whitespace-nowrap px-4 py-3 font-mono text-xs text-muted md:table-cell">
                {formatLongDate(p.submittedAt, locale)}
              </td>
              <td className="px-4 py-3 text-end">
                {p.status === 'published' ? (
                  <Link
                    href={`/bibliotheque/${p.slug}`}
                    className="inline-flex min-h-6 items-center text-[13px] font-medium text-accent-text hover:underline"
                  >
                    {t('mine.open')}
                  </Link>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollableRegion>
  );
}
