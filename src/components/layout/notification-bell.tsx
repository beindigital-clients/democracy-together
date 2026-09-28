'use client';

import { useConvexAuth, useQuery } from 'convex/react';
import { Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api } from '@convex/_generated/api';

// Notification bell (F-25/F-51) — visible only when signed in. The unread
// counter is reactive (Convex real time): it increments live when a
// moderator approves one of the user's publications / applications.
// `connecteAuRendu` comes from the SERVER (`isAuthenticatedNextjs()`, read in
// `site-header.tsx`): until Convex has responded, it decides whether the
// bell is there. Without it, the bell APPEARED after the fact for a signed-in
// visitor, pushing everything before it in a right-anchored cluster by
// 36 px — the second half of the F-13 shift, the signed-in case.
export function NotificationBell({
  connecteAuRendu,
}: {
  connecteAuRendu?: boolean;
} = {}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const t = useTranslations('notifications');
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

  return (
    <Link
      href="/notifications"
      aria-label={
        n > 0
          ? capped
            ? t('bellUnreadMany', { count: n })
            : t('bellUnread', { count: n })
          : t('bell')
      }
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-sm text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
    >
      <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
      {n > 0 ? (
        <span className="absolute -end-0.5 -top-0.5 grid min-h-[16px] min-w-[16px] place-items-center rounded-full bg-accent px-1 text-[11px] font-semibold leading-none text-accent-contrast">
          {capped ? `${n}+` : n}
        </span>
      ) : null}
    </Link>
  );
}
