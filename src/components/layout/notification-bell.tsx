'use client';

import { useState } from 'react';
import { useConvexAuth, useMutation, useQuery } from 'convex/react';
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
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { relativeTime } from '@/lib/relative-time';
import {
  notificationKind,
  type NotificationKind,
} from '@/lib/notification-kind';
import { cn } from '@/lib/utils';
import { useNow } from '@/hooks/use-now';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

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
const ICON =
  'relative inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink';

// One icon per kind of notification: the list is scanned by its icons first.
const KIND_ICON: Record<NotificationKind, LucideIcon> = {
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

type Notif = {
  _id: Id<'notifications'>;
  titleKey: string;
  params: Record<string, string>;
  link: string | null;
  read: boolean;
  createdAt: number;
};

function Badge({ n, capped }: { n: number; capped: boolean }) {
  if (n <= 0) return null;
  return (
    <span className="absolute -end-0.5 -top-0.5 grid min-h-[16px] min-w-[16px] place-items-center rounded-full bg-accent px-1 text-[11px] font-semibold leading-none text-accent-contrast">
      {capped ? `${n}+` : n}
    </span>
  );
}

// The latest notifications, in a panel under the bell.
function NotificationsPanel({ onDone }: { onDone: () => void }) {
  const t = useTranslations('notifications');
  // The titles come from the database (`titleKey`): known keys only, the
  // others fall back to a neutral label rather than a raw key.
  const tt = t as unknown as (
    key: string,
    values?: Record<string, string>,
  ) => string;
  const locale = useLocale();
  const router = useRouter();
  const now = useNow();
  const items = useQuery(api.notifications.myNotifications) as
    Notif[] | undefined;
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const hasUnread = Boolean(items?.some((n) => !n.read));

  async function open(n: Notif) {
    if (!n.read) {
      try {
        await markRead({ notificationId: n._id });
      } catch {
        /* reading state is secondary: navigation goes on */
      }
    }
    onDone();
    if (n.link) router.push(n.link);
  }

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
          {items.slice(0, PREVIEW).map((n) => {
            const Icon = KIND_ICON[notificationKind(n.titleKey)];
            return (
              <li key={n._id}>
                <button
                  type="button"
                  onClick={() => void open(n)}
                  className={cn(
                    'flex w-full items-start gap-3 rounded-sm px-2.5 py-2.5 text-start transition-colors hover:bg-surface-2',
                    !n.read && 'bg-accent-tint/60',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'grid h-9 w-9 shrink-0 place-items-center rounded-full',
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
                        'block wrap-anywhere text-sm leading-snug',
                        n.read ? 'text-ink-soft' : 'font-medium text-ink',
                      )}
                    >
                      {t.has(n.titleKey)
                        ? tt(n.titleKey, n.params)
                        : t('unknown')}
                      {n.read ? null : (
                        <span className="sr-only"> {t('unreadMark')}</span>
                      )}
                    </span>
                    <span className="mt-0.5 block font-mono text-[11px] text-muted">
                      {relativeTime(n.createdAt, now, locale)}
                    </span>
                  </span>
                  {/* Unread: a dot at the end of the line, as well as the
                      weight and the tint (RGAA 3.1 — not colour alone). */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mt-3 h-2 w-2 shrink-0 rounded-full',
                      n.read ? 'bg-transparent' : 'bg-accent',
                    )}
                  />
                </button>
              </li>
            );
          })}
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
      <Link href="/notifications" aria-label={label} className={ICON}>
        <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
        <Badge n={n} capped={capped} />
      </Link>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={label}
        className={cn(
          ICON,
          'data-[state=open]:bg-surface-2 data-[state=open]:text-ink',
        )}
      >
        <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
        <Badge n={n} capped={capped} />
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
