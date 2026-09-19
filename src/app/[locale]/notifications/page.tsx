'use client';

import { AuthGate } from '@/components/auth/auth-gate';
import { useQuery, useMutation } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { useRouter } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
type Notif = {
  _id: Id<'notifications'>;
  titleKey: string;
  params: Record<string, string>;
  link: string | null;
  read: boolean;
  createdAt: number;
};

function NotificationsList() {
  const t = useTranslations('notifications');
  // next-intl type ses clés ; les titres sont dynamiques (issus de la base).
  const tt = t as unknown as (
    key: string,
    values?: Record<string, string>,
  ) => string;
  const locale = useLocale();
  const router = useRouter();
  const items = useQuery(api.notifications.myNotifications) as
    Notif[] | undefined;
  const markRead = useMutation(api.notifications.markRead);
  const markAllRead = useMutation(api.notifications.markAllRead);

  const fmt = (ms: number) =>
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(ms);

  async function open(n: Notif) {
    if (!n.read) {
      try {
        await markRead({ notificationId: n._id });
      } catch {
        /* sans incidence sur la navigation */
      }
    }
    if (n.link) router.push(n.link);
  }

  const hasUnread = Boolean(items?.some((n) => !n.read));

  return (
    <div className="mx-auto max-w-[760px] px-4 py-12 sm:px-6 md:py-16">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-display text-[clamp(28px,4vw,40px)]">
          {t('title')}
        </h1>
        {hasUnread ? (
          <Button variant="outline" size="sm" onClick={() => markAllRead({})}>
            {t('markAll')}
          </Button>
        ) : null}
      </div>

      {items === undefined ? (
        <p className="mt-6 text-ink-soft">{t('loading')}</p>
      ) : items.length === 0 ? (
        <p className="mt-6 text-ink-soft">{t('empty')}</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {items.map((n) => (
            <li key={n._id}>
              <button
                type="button"
                onClick={() => open(n)}
                className={`flex w-full items-start gap-3 rounded-md border p-4 text-left transition-colors ${
                  n.read
                    ? 'border-line bg-surface hover:border-line-strong'
                    : 'border-accent-edge bg-accent-tint hover:bg-accent-tint/70'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    n.read ? 'bg-transparent' : 'bg-accent'
                  }`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] leading-relaxed text-ink">
                    {tt(n.titleKey, n.params)}
                  </span>
                  <span className="mt-1 block font-mono text-[11px] text-muted">
                    {fmt(n.createdAt)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function NotificationsPage() {
  return (
    <AuthGate className="max-w-[760px]">
      <NotificationsList />
    </AuthGate>
  );
}
