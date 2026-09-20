'use client';

import { useConvexAuth, useQuery } from 'convex/react';
import { Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api } from '@convex/_generated/api';

// Cloche de notifications (F-25/F-51) — visible seulement connecté. Le compteur
// de non-lues est réactif (Convex temps réel) : il s'incrémente en direct quand
// un modérateur valide une publication / une candidature de l'utilisateur.
export function NotificationBell() {
  const { isAuthenticated } = useConvexAuth();
  const t = useTranslations('notifications');
  // Le serveur plafonne le décompte au seuil d'affichage de la pastille et dit
  // s'il y a plus (`capped`) : il ne relit plus toutes les notifications non
  // lues d'un compte pour n'en afficher que « 9+ » (issue #8).
  const unread = useQuery(
    api.notifications.unreadCount,
    isAuthenticated ? {} : 'skip',
  );

  if (!isAuthenticated) return null;
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
        <span className="absolute -right-0.5 -top-0.5 grid min-h-[16px] min-w-[16px] place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-accent-contrast">
          {capped ? `${n}+` : n}
        </span>
      ) : null}
    </Link>
  );
}
