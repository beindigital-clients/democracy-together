'use client';

import { useState } from 'react';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api } from '@convex/_generated/api';
import { useNow } from '@/hooks/use-now';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  NotificationRow,
  useOpenNotification,
  type Notif,
} from '@/components/notifications/notification-row';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';

// Notification bell (F-25/F-51) — visible only when signed in. The unread
// counter is reactive (Convex real time): it increments live when a
// moderator approves one of the user's publications / applications.
// `connecteAuRendu` comes from the SERVER (`isAuthenticatedNextjs()`, read in
// `site-header.tsx`): until Convex has responded, it decides whether the
// bell is there. Without it, the bell APPEARED after the fact for a signed-in
// visitor, pushing everything before it in a right-anchored cluster by
// 36 px — the second half of the F-13 shift, the signed-in case.
//
// TWO FORMS. On a desktop header the bell OPENS the latest notifications in
// place, as social networks do: one reads, opens, marks read without leaving
// the page. On a phone it stays a link to the notifications page — a panel
// the width of the screen would only be a worse page.

const PREVIEW = 6;

function CountBadge({ n, capped }: { n: number; capped: boolean }) {
  if (n <= 0) return null;
  return (
    <Badge
      variant="solid"
      size="count"
      className="absolute -end-0.5 -top-0.5 h-4 min-w-4 px-1"
    >
      {capped ? `${n}+` : n}
    </Badge>
  );
}

// The latest notifications, in a panel under the bell.
function NotificationsPanel({ onDone }: { onDone: () => void }) {
  const t = useTranslations('notifications');
  const now = useNow();
  const items = useQuery(api.notifications.myNotifications) as
    Notif[] | undefined;
  const markAllRead = useMutation(api.notifications.markAllRead);
  const open = useOpenNotification(onDone);
  const hasUnread = Boolean(items?.some((n) => !n.read));

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <p id="cloche-titre" className="font-display text-lg text-ink">
          {t('title')}
        </p>
        {hasUnread ? (
          <button
            type="button"
            onClick={() => void markAllRead({})}
            className="min-h-9 rounded-sm px-2 text-xs font-medium text-accent-text hover:bg-accent-tint"
          >
            {t('markAll')}
          </button>
        ) : null}
      </div>
      {items === undefined ? (
        <div aria-hidden="true" className="space-y-3 p-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-5/6" />
        </div>
      ) : items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ink-soft">
          {t('empty')}
        </p>
      ) : (
        <ul className="max-h-[min(24rem,60dvh)] overflow-y-auto p-1.5">
          {items.slice(0, PREVIEW).map((n) => (
            <li key={n._id}>
              <NotificationRow n={n} now={now} onOpen={(x) => void open(x)} />
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-line p-1.5">
        <Link
          href="/notifications"
          onClick={onDone}
          className="flex min-h-10 items-center justify-center rounded-sm text-sm font-medium text-accent-text hover:bg-accent-tint"
        >
          {t('seeAll')}
        </Link>
      </div>
    </>
  );
}

export function NotificationBell({
  connecteAuRendu,
  variant = 'link',
}: {
  connecteAuRendu?: boolean;
  variant?: 'link' | 'popover';
} = {}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const t = useTranslations('notifications');
  const [open, setOpen] = useState(false);
  const connecte = isLoading ? (connecteAuRendu ?? false) : isAuthenticated;
  // The server caps the count at the badge's display threshold and says
  // whether there are more (`capped`): it no longer rereads all of an
  // account's unread notifications only to display "9+" (issue #8).
  const unread = useQuery(
    api.notifications.unreadCount,
    connecte ? {} : 'skip',
  );

  if (!connecte) return null;
  const n = unread?.count ?? 0;
  const capped = unread?.capped ?? false;
  const label =
    n > 0
      ? capped
        ? t('bellUnreadMany', { count: n })
        : t('bellUnread', { count: n })
      : t('bell');

  if (variant === 'link') {
    return (
      <Button
        asChild
        variant="subtle"
        size="icon-md"
        className="relative rounded-full"
      >
        <Link href="/notifications" aria-label={label}>
          <Bell className="size-[18px]" aria-hidden="true" />
          <CountBadge n={n} capped={capped} />
        </Link>
      </Button>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="subtle"
          size="icon-md"
          aria-label={label}
          className="relative rounded-full"
        >
          <Bell className="size-[18px]" aria-hidden="true" />
          <CountBadge n={n} capped={capped} />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        aria-labelledby="cloche-titre"
        className="w-[22rem] max-w-[calc(100vw-2rem)] p-0"
      >
        {/* Mounted when open only: its read of the latest notifications
            starts when someone looks. */}
        {isAuthenticated ? (
          <NotificationsPanel onDone={() => setOpen(false)} />
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
