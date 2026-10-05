'use client';

import { useQuery } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { AuthGateLoading } from '@/components/auth/auth-gate';
import { MemberPageHeader } from '@/components/member/page-header';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { vocabulary } from '@/i18n/vocabulary';
import { useKohopDates } from '@/components/kohop/use-kohop';

// Invitations and analyses of the signed-in reviewer.
export default function KohopReviewsHome() {
  const t = useTranslations('kohop');
  const dates = useKohopDates();
  const me = useQuery(api.users.current);
  // Any signed-in account: an external reviewer is a visitor.
  const member = me !== null && me !== undefined;
  const items = useQuery(api.kohopReviews.mine, member ? {} : 'skip');
  if (me === undefined) return <AuthGateLoading />;

  return (
    <div className="max-w-3xl">
      <MemberPageHeader title={t('reviewsTitle')} lead={t('reviewsLead')} />
      {!member ? (
        <p className="mt-8 rounded-md border border-accent-edge bg-accent-tint p-6 text-ink-soft">
          {t('membersOnly')}
        </p>
      ) : items === undefined ? (
        <p className="mt-8 text-ink-soft" role="status">
          {t('loading')}
        </p>
      ) : items.length === 0 ? (
        <p className="mt-8 max-w-[62ch] rounded-md border border-line bg-surface p-6 text-ink-soft">
          {t('reviewsEmpty')}
        </p>
      ) : (
        <section aria-labelledby="kohop-reviews-list" className="mt-8">
          <h2 id="kohop-reviews-list" className="sr-only">
            {t('reviewsList')}
          </h2>
          <ul className="space-y-3">
            {items.map((r) => (
              <li key={r._id}>
                <Link
                  href={`/espace-membre/relectures/${r._id}`}
                  className="block rounded-md border border-line bg-surface p-4 transition-colors hover:border-ink"
                >
                  <span className="flex flex-wrap items-start justify-between gap-3">
                    <span className="min-w-0 wrap-anywhere font-display text-lg text-ink">
                      {r.title}
                    </span>
                    <Badge
                      variant={
                        r.status === 'submitted'
                          ? 'good'
                          : r.status === 'invited'
                            ? 'pending'
                            : 'default'
                      }
                      size="label"
                    >
                      {vocabulary(t, 'reviewerStatus_', r.status)}
                    </Badge>
                  </span>
                  {r.dueAt ? (
                    <span className="mt-2 block text-sm text-ink-soft">
                      {r.status === 'invited'
                        ? t('replyBy', { date: dates.day(r.dueAt) })
                        : t('analysisBy', { date: dates.day(r.dueAt) })}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
