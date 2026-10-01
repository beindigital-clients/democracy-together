'use client';

import { useState } from 'react';
import { useQuery } from 'convex/react';
import { BadgeCheck } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDay } from '@/components/payments/format';
import { DashCard } from './dash-card';

export type DuesState =
  { status: 'none' } | { status: 'upToDate' | 'expired'; periodEnd: number };

// The time handed to the query is rounded to the hour, like on the payments
// screen: a value changing at each render would restart the subscription in
// a loop, and "up to date / lapsed" does not need the minute.
function currentHour(): number {
  return Math.floor(Date.now() / 3_600_000) * 3_600_000;
}

const TONE: Record<DuesState['status'], string> = {
  upToDate:
    'border-[color-mix(in_srgb,var(--color-bar-1)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-bar-1)_9%,transparent)] text-bar-1',
  expired:
    'border-[color-mix(in_srgb,var(--color-bar-4)_48%,transparent)] bg-[color-mix(in_srgb,var(--color-bar-4)_10%,transparent)] text-bar-4-ink',
  none: 'border-line-strong bg-surface-2 text-ink-soft',
};

// Membership block: is the fee paid, until when, and the one link that
// settles it. The detail (history, receipts, monthly donations) stays on the
// payments screen.
export function MembershipView({ dues }: { dues: DuesState | undefined }) {
  const t = useTranslations('member');
  const locale = useLocale();
  return (
    <DashCard
      titleId="dash-membership-title"
      title={t('membershipTitle')}
      icon={BadgeCheck}
    >
      {dues === undefined ? (
        <Skeleton className="h-14 w-full" />
      ) : (
        <>
          <p className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-block rounded-pill border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.06em]',
                TONE[dues.status],
              )}
            >
              {dues.status === 'upToDate'
                ? t('membershipStatusActive')
                : dues.status === 'expired'
                  ? t('membershipStatusLate')
                  : t('membershipStatusNone')}
            </span>
          </p>
          <p className="mt-3 text-sm leading-relaxed text-ink-soft">
            {dues.status === 'upToDate'
              ? t('membershipUpToDate', {
                  date: formatDay(dues.periodEnd, locale),
                })
              : dues.status === 'expired'
                ? t('membershipExpired', {
                    date: formatDay(dues.periodEnd, locale),
                  })
                : t('membershipNone')}
          </p>
          <Button
            asChild
            variant={dues.status === 'upToDate' ? 'outline' : 'default'}
            className="mt-4 min-h-11"
          >
            <Link href="/espace-membre/cotisations">
              {dues.status === 'upToDate'
                ? t('membershipManage')
                : t('membershipPay')}
            </Link>
          </Button>
        </>
      )}
    </DashCard>
  );
}

export function MembershipCard() {
  const [now] = useState(currentHour);
  const data = useQuery(api.payments.member.overview, { now });
  const dues: DuesState | undefined =
    data === undefined
      ? undefined
      : data.dues === null
        ? { status: 'none' }
        : {
            status: data.dues.upToDate ? 'upToDate' : 'expired',
            periodEnd: data.dues.periodEnd,
          };
  return <MembershipView dues={dues} />;
}
