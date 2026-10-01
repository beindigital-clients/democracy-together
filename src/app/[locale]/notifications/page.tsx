'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { BellOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { AuthGate } from '@/components/auth/auth-gate';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MemberPageBody,
  MemberPageHeader,
} from '@/components/member/page-header';
import {
  NotificationRow,
  useOpenNotification,
  type Notif,
} from '@/components/notifications/notification-row';
import { useNow } from '@/hooks/use-now';
import { cn } from '@/lib/utils';

type Filter = 'all' | 'unread';

// ALL NOTIFICATIONS — what the bell's panel shows the latest of, in full,
// with the choice every social network offers: all of them, or only the
// unread ones.
function NotificationsScreen() {
  const t = useTranslations('notifications');
  const now = useNow();
  const items = useQuery(api.notifications.myNotifications) as
    Notif[] | undefined;
  const markAllRead = useMutation(api.notifications.markAllRead);
  const open = useOpenNotification();
  const [filter, setFilter] = useState<Filter>('all');

  const unread = items?.filter((n) => !n.read).length ?? 0;
  const shown = filter === 'unread' ? items?.filter((n) => !n.read) : items;

  const tab = (value: Filter, label: string) => (
    <button
      type="button"
      aria-pressed={filter === value}
      onClick={() => setFilter(value)}
      className={cn(
        'min-h-10 rounded-pill px-4 text-sm transition-colors',
        filter === value
          ? 'bg-accent-tint font-medium text-accent-text'
          : 'text-ink-soft hover:bg-surface-2 hover:text-ink',
      )}
    >
      {label}
    </button>
  );

  return (
    <>
      <MemberPageHeader
        title={t('title')}
        lead={t('pageLead')}
        actions={
          unread > 0 ? (
            <Button variant="outline" onClick={() => void markAllRead({})}>
              {t('markAll')}
            </Button>
          ) : null
        }
      />
      <MemberPageBody narrow>
        <div
          role="group"
          aria-label={t('filterLabel')}
          className="inline-flex gap-1 rounded-pill border border-line bg-surface p-1"
        >
          {tab('all', t('filterAll'))}
          {tab('unread', t('filterUnread', { count: unread }))}
        </div>

        {shown === undefined ? (
          <div aria-hidden="true" className="mt-6 space-y-2">
            <Skeleton className="h-[68px] w-full" />
            <Skeleton className="h-[68px] w-full" />
            <Skeleton className="h-[68px] w-full" />
          </div>
        ) : shown.length === 0 ? (
          <div className="mt-6 flex flex-col items-center rounded-md border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
            <BellOff aria-hidden="true" className="h-6 w-6 text-muted" />
            <p className="mt-3 text-sm text-ink-soft">
              {filter === 'unread' ? t('emptyUnread') : t('empty')}
            </p>
          </div>
        ) : (
          <ul className="mt-6 flex flex-col gap-2">
            {shown.map((n) => (
              <li key={n._id}>
                <NotificationRow
                  n={n}
                  now={now}
                  onOpen={(x) => void open(x)}
                  comfortable
                />
              </li>
            ))}
          </ul>
        )}
      </MemberPageBody>
    </>
  );
}

export default function NotificationsPage() {
  return (
    <AuthGate>
      <NotificationsScreen />
    </AuthGate>
  );
}
