'use client';

import { useConvexAuth, useQuery } from 'convex/react';
import { MessageSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api } from '@convex/_generated/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

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
    <Button
      asChild
      variant="subtle"
      size="icon-md"
      className="relative rounded-full"
    >
      <Link
        href="/espace-membre/messages"
        aria-label={
          n > 0
            ? capped
              ? t('badgeUnreadMany', { count: n })
              : t('badgeUnread', { count: n })
            : t('badge')
        }
      >
        <MessageSquare className="size-[18px]" aria-hidden="true" />
        {n > 0 ? (
          <Badge
            data-testid="messages-unread"
            variant="solid"
            size="count"
            className="absolute -end-0.5 -top-0.5 h-4 min-w-4 px-1"
          >
            {capped ? `${n}+` : n}
          </Badge>
        ) : null}
      </Link>
    </Button>
  );
}
