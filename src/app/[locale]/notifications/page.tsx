'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { BellOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { AuthGate } from '@/components/auth/auth-gate';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
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
        <ToggleGroup
          type="single"
          value={filter}
          onValueChange={(v) => {
            if (v === 'all' || v === 'unread') setFilter(v);
          }}
          aria-label={t('filterLabel')}
        >
          <ToggleGroupItem value="all">{t('filterAll')}</ToggleGroupItem>
          <ToggleGroupItem value="unread">
            {t('filterUnread', { count: unread })}
          </ToggleGroupItem>
        </ToggleGroup>

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
