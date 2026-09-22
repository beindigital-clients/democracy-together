'use client';

import { useConvexAuth, useQuery } from 'convex/react';
import { Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { api } from '@convex/_generated/api';

// Cloche de notifications (F-25/F-51) — visible seulement connecté. Le compteur
// de non-lues est réactif (Convex temps réel) : il s'incrémente en direct quand
// un modérateur valide une publication / une candidature de l'utilisateur.
// `connecteAuRendu` vient du SERVEUR (`isAuthenticatedNextjs()`, lu dans
// `site-header.tsx`) : tant que Convex n'a pas répondu, c'est lui qui décide
// si la cloche est là. Sans cela, elle APPARAISSAIT après coup chez un visiteur
// connecté, poussant de 36 px tout ce qui la précède dans une grappe ancrée à
// droite — la seconde moitié du décalage de F-13, celle du cas connecté.
export function NotificationBell({
  connecteAuRendu,
}: {
  connecteAuRendu?: boolean;
} = {}) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const t = useTranslations('notifications');
  const connecte = isLoading ? (connecteAuRendu ?? false) : isAuthenticated;
  // Le serveur plafonne le décompte au seuil d'affichage de la pastille et dit
  // s'il y a plus (`capped`) : il ne relit plus toutes les notifications non
  // lues d'un compte pour n'en afficher que « 9+ » (issue #8).
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
        <span className="absolute -right-0.5 -top-0.5 grid min-h-[16px] min-w-[16px] place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-accent-contrast">
          {capped ? `${n}+` : n}
        </span>
      ) : null}
    </Link>
  );
}
