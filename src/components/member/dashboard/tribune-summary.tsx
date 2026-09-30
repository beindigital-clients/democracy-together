'use client';

import { useQuery } from 'convex/react';
import { Megaphone } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { CardLink, DashCard } from './dash-card';

export type TribuneCounts = {
  published: number;
  pending: number;
  declined: number;
  comments: number;
};

export function tribuneCounts(
  posts: readonly { status: string }[],
  comments: readonly unknown[],
): TribuneCounts {
  let published = 0;
  let pending = 0;
  let declined = 0;
  for (const p of posts) {
    if (p.status === 'published') published++;
    else if (p.status === 'pending') pending++;
    // Rejected by moderation or withdrawn afterwards: both call for the
    // author to read the reason, on the same screen.
    else declined++;
  }
  return { published, pending, declined, comments: comments.length };
}

// Tribune block: where the member's posts stand, in four numbers, and the
// way to the screen that details each one (with the moderation's reasons).
export function TribuneSummaryView({
  counts,
}: {
  counts: TribuneCounts | undefined;
}) {
  const t = useTranslations('member');
  const cells: { key: keyof TribuneCounts; label: string; warn?: boolean }[] = [
    { key: 'published', label: t('tribunePublished') },
    { key: 'pending', label: t('tribunePending') },
    { key: 'declined', label: t('tribuneDeclined'), warn: true },
    { key: 'comments', label: t('tribuneComments') },
  ];
  const empty =
    counts !== undefined &&
    counts.published + counts.pending + counts.declined + counts.comments === 0;
  return (
    <DashCard
      titleId="dash-tribune-title"
      title={t('tribuneTitle')}
      icon={Megaphone}
      lead={empty ? t('tribuneEmpty') : t('tribuneLead')}
    >
      {counts === undefined ? (
        <Skeleton className="h-16 w-full" />
      ) : empty ? (
        <Link
          href="/tribune"
          className="inline-flex min-h-11 items-center rounded-sm border border-line-strong px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-2"
        >
          {t('tribuneWrite')}
        </Link>
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {cells.map((c) => {
              const value = counts[c.key];
              return (
                <div
                  key={c.key}
                  className="rounded-sm border border-line bg-paper/50 px-3 py-2.5"
                >
                  <dt className="text-xs leading-snug text-muted">{c.label}</dt>
                  <dd
                    className={cn(
                      'mt-1 font-mono text-xl tabular-nums',
                      c.warn && value > 0 ? 'text-bar-5' : 'text-ink',
                    )}
                  >
                    {value}
                  </dd>
                </div>
              );
            })}
          </dl>
          <div className="mt-2 flex flex-wrap gap-x-6">
            <CardLink href="/espace-membre/contributions">
              {t('tribuneSeeAll')}
            </CardLink>
            <CardLink href="/tribune">{t('tribuneWrite')}</CardLink>
          </div>
        </>
      )}
    </DashCard>
  );
}

export function TribuneSummary() {
  const posts = useQuery(api.tribune.myPosts);
  const comments = useQuery(api.tribune.myComments);
  return (
    <TribuneSummaryView
      counts={posts && comments ? tribuneCounts(posts, comments) : undefined}
    />
  );
}
