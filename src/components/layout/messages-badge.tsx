'use client';

import { useConvexAuth, useQuery } from 'convex/react';
import { MessageSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api } from '@convex/_generated/api';

// Private messaging badge ("social" workstream), next to the bell,
// on desktop AND on mobile. Same mechanism as `NotificationBell`:
// `connecteAuRendu` comes from the server and decides its presence until
// Convex has responded — otherwise it WOULD APPEAR after hydration and
// shift the right-hand cluster (audit F-13).
//
// The counter is that of unread CONVERSATIONS, capped like the bell's;
// it is real-time (Convex query).
export function MessagesBadge({
  connecteAuRendu,
}: {
  connecteAuRendu?: boolean;
} = {}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const t = useTranslations('messages');
  const connecte = isLoading ? (connecteAuRendu ?? false) : isAuthenticated;
  const unread = useQuery(
    api.social.messages.unreadSummary,
    connecte ? {} : 'skip',
  );

  if (!connecte) return null;
  const n = unread?.count ?? 0;
  const capped = unread?.capped ?? false;

  return (
    <Link
      href="/espace-membre/messages"
      aria-label={
        n > 0
          ? capped
            ? t('badgeUnreadMany', { count: n })
            : t('badgeUnread', { count: n })
          : t('badge')
      }
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-sm text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
    >
      <MessageSquare className="h-[18px] w-[18px]" aria-hidden="true" />
      {n > 0 ? (
        <span
          data-testid="messages-unread"
          className="absolute -end-0.5 -top-0.5 grid min-h-[16px] min-w-[16px] place-items-center rounded-full bg-accent px-1 text-[11px] font-semibold leading-none text-accent-contrast"
        >
          {capped ? `${n}+` : n}
        </span>
      ) : null}
    </Link>
  );
}
