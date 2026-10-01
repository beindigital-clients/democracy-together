'use client';

import { useMutation } from 'convex/react';
import {
  BadgeCheck,
  Bell,
  Building2,
  CreditCard,
  FileText,
  FolderKanban,
  GraduationCap,
  Megaphone,
  MessageSquare,
  NotebookPen,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { useRouter } from '@/i18n/navigation';
import { intlLocale } from '@/i18n/locale';
import {
  notificationKind,
  type NotificationKind,
} from '@/lib/notification-kind';
import { relativeTime } from '@/lib/relative-time';
import { cn } from '@/lib/utils';

// ONE NOTIFICATION, as the bell's panel and the notifications page both show
// it: an icon for its kind, its sentence, when it happened, and — unread —
// a tint, a heavier weight and a dot (RGAA 3.1 — not colour alone).

export type Notif = {
  _id: Id<'notifications'>;
  titleKey: string;
  params: Record<string, string>;
  link: string | null;
  read: boolean;
  createdAt: number;
};

// One icon per kind of notification: a list is scanned by its icons first.
export const KIND_ICON: Record<NotificationKind, LucideIcon> = {
  follow: UserPlus,
  message: MessageSquare,
  publication: FileText,
  review: NotebookPen,
  tribune: Megaphone,
  membership: BadgeCheck,
  payment: CreditCard,
  workspace: FolderKanban,
  organization: Building2,
  programme: GraduationCap,
  other: Bell,
};

// Opening a notification marks it read, then follows its link. Reading
// state is secondary: a failed mark never blocks the navigation.
export function useOpenNotification(onOpened?: () => void) {
  const router = useRouter();
  const markRead = useMutation(api.notifications.markRead);
  return async (n: Notif) => {
    if (!n.read) {
      try {
        await markRead({ notificationId: n._id });
      } catch {
        /* navigation goes on */
      }
    }
    onOpened?.();
    if (n.link) router.push(n.link);
  };
}

export function NotificationRow({
  n,
  now,
  onOpen,
  comfortable = false,
}: {
  n: Notif;
  now: number;
  onOpen: (n: Notif) => void;
  // The page's rows breathe more than the panel's.
  comfortable?: boolean;
}) {
  const t = useTranslations('notifications');
  const locale = useLocale();
  // The titles come from the database (`titleKey`): known keys only, the
  // others fall back to a neutral label rather than a raw key.
  const tt = t as unknown as (
    key: string,
    values?: Record<string, string>,
  ) => string;
  const Icon = KIND_ICON[notificationKind(n.titleKey)];
  const exact = new Intl.DateTimeFormat(intlLocale(locale), {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(n.createdAt);

  return (
    <button
      type="button"
      onClick={() => onOpen(n)}
      className={cn(
        'flex w-full items-start gap-3 text-start transition-colors',
        comfortable
          ? 'rounded-md border px-4 py-3.5'
          : 'rounded-sm px-2.5 py-2.5',
        n.read
          ? comfortable
            ? 'border-line bg-surface hover:border-line-strong hover:bg-surface-2'
            : 'hover:bg-surface-2'
          : comfortable
            ? 'border-accent-edge bg-accent-tint/60 hover:bg-accent-tint'
            : 'bg-accent-tint/60 hover:bg-accent-tint',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid shrink-0 place-items-center rounded-full',
          comfortable ? 'h-10 w-10' : 'h-9 w-9',
          n.read
            ? 'bg-surface-2 text-muted'
            : 'bg-accent-tint text-accent-text',
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            'block wrap-anywhere leading-snug',
            comfortable ? 'text-[15px]' : 'text-sm',
            n.read ? 'text-ink-soft' : 'font-medium text-ink',
          )}
        >
          {t.has(n.titleKey) ? tt(n.titleKey, n.params) : t('unknown')}
          {n.read ? null : <span className="sr-only"> {t('unreadMark')}</span>}
        </span>
        <time
          dateTime={new Date(n.createdAt).toISOString()}
          title={exact}
          className="mt-0.5 block font-mono text-[11px] text-muted"
        >
          {relativeTime(n.createdAt, now, locale)}
        </time>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'mt-3 h-2 w-2 shrink-0 rounded-full',
          n.read ? 'bg-transparent' : 'bg-accent',
        )}
      />
    </button>
  );
}
