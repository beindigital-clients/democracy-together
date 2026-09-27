'use client';

import { useConvexAuth, useQuery } from 'convex/react';
import { MessageSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api } from '@convex/_generated/api';

// Pastille de la messagerie privée (chantier « social »), à côté de la cloche,
// sur bureau ET sur mobile. Même mécanique que `NotificationBell` :
// `connecteAuRendu` vient du serveur et décide de sa présence tant que Convex
// n'a pas répondu — sans quoi elle APPARAÎTRAIT après l'hydratation et
// décalerait la grappe de droite (audit F-13).
//
// Le compteur est celui des CONVERSATIONS non lues, plafonné comme celui de
// la cloche ; il est temps réel (query Convex).
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
