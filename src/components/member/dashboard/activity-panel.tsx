'use client';

import { useMutation, useQuery } from 'convex/react';
import { Activity, FileText, Megaphone } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Link, useRouter } from '@/i18n/navigation';
import { relativeTime } from '@/lib/relative-time';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { useNow } from '@/hooks/use-now';
import { CardLink, DashCard } from './dash-card';

export const ACTIVITY_ITEMS = 5;

export type ActivityNotification = {
  _id: Id<'notifications'>;
  titleKey: string;
  params: Record<string, string>;
  link: string | null;
  read: boolean;
  createdAt: number;
};

export type FeedItem = {
  kind: 'publication' | 'tribune';
  title: string;
  href: string;
  at: number;
  author: { handle: string; displayName: string };
};

function ListSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-3">
      <Skeleton className="h-9 w-full" />
      <Skeleton className="h-9 w-5/6" />
      <Skeleton className="h-9 w-4/6" />
    </div>
  );
}

// "Pour vous": the latest notifications, unread first in weight. Opening one
// is handed to the container (mark read, then follow its link, as on the
// notifications page): this list stays a pure view.
function Notifications({
  items,
  now,
  onOpen,
}: {
  items: readonly ActivityNotification[] | undefined;
  now: number;
  onOpen: (n: ActivityNotification) => void;
}) {
  const t = useTranslations('member');
  const tn = useTranslations('notifications');
  // The titles come from the database (`titleKey`): known keys only, the
  // others fall back to a neutral label rather than a raw key.
  const tt = tn as unknown as (
    key: string,
    values?: Record<string, string>,
  ) => string;
  const locale = useLocale();

  if (items === undefined) return <ListSkeleton />;
  if (items.length === 0) {
    return <p className="text-sm text-ink-soft">{t('activityEmpty')}</p>;
  }
  return (
    <ul className="-mx-2 flex flex-col">
      {items.slice(0, ACTIVITY_ITEMS).map((n) => (
        <li key={n._id}>
          <button
            type="button"
            onClick={() => onOpen(n)}
            className="flex w-full items-start gap-3 rounded-sm px-2 py-2.5 text-start transition-colors hover:bg-surface-2"
          >
            <span
              aria-hidden="true"
              className={cn(
                'mt-[7px] h-2 w-2 shrink-0 rounded-full',
                n.read ? 'bg-line-strong' : 'bg-accent',
              )}
            />
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  'block wrap-anywhere text-sm leading-snug',
                  n.read ? 'text-ink-soft' : 'font-medium text-ink',
                )}
              >
                {tn.has(n.titleKey)
                  ? tt(n.titleKey, n.params)
                  : t('activityUnknown')}
                {n.read ? null : (
                  <span className="sr-only"> {t('activityUnread')}</span>
                )}
              </span>
              <span className="mt-0.5 block font-mono text-[11px] text-muted">
                {relativeTime(n.createdAt, now, locale)}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

// "Dans votre réseau": what the people one follows have published.
function NetworkFeed({
  items,
  now,
}: {
  items: readonly FeedItem[] | undefined;
  now: number;
}) {
  const t = useTranslations('member');
  const locale = useLocale();
  if (items === undefined) return <ListSkeleton />;
  if (items.length === 0) {
    return (
      <div className="text-sm text-ink-soft">
        <p>{t('activityNetworkEmpty')}</p>
        <CardLink href="/membres">{t('activityNetworkCta')}</CardLink>
      </div>
    );
  }
  return (
    <ul className="-mx-2 flex flex-col">
      {items.slice(0, ACTIVITY_ITEMS).map((item) => {
        const Icon = item.kind === 'publication' ? FileText : Megaphone;
        return (
          <li
            key={`${item.kind}-${item.href}`}
            className="flex items-start gap-3 rounded-sm px-2 py-2.5"
          >
            <Icon
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-muted"
            />
            <span className="min-w-0 flex-1 text-sm leading-snug">
              <Link
                href={item.href}
                className="wrap-anywhere font-medium text-ink hover:text-accent-text hover:underline"
              >
                {item.title}
              </Link>
              <span className="mt-0.5 block text-xs text-muted">
                <Link
                  href={`/membres/${item.author.handle}`}
                  className="wrap-anywhere hover:text-ink hover:underline"
                >
                  {item.author.displayName}
                </Link>
                {' · '}
                {item.kind === 'publication'
                  ? t('feedPublication')
                  : t('feedTribune')}
                {' · '}
                <span className="font-mono">
                  {relativeTime(item.at, now, locale)}
                </span>
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function ActivityPanelView({
  notifications,
  feed,
  showFeed,
  now,
  onOpenNotification,
}: {
  notifications: readonly ActivityNotification[] | undefined;
  feed: readonly FeedItem[] | undefined;
  showFeed: boolean;
  now: number;
  onOpenNotification: (n: ActivityNotification) => void;
}) {
  const t = useTranslations('member');
  return (
    <DashCard
      titleId="dash-activity-title"
      title={t('activityTitle')}
      icon={Activity}
    >
      <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
        {t('activityForYou')}
      </h3>
      <div className="mt-2">
        <Notifications
          items={notifications}
          now={now}
          onOpen={onOpenNotification}
        />
      </div>
      <CardLink href="/notifications">{t('activitySeeAll')}</CardLink>

      {showFeed ? (
        <div className="mt-4 border-t border-line pt-4">
          <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">
            {t('activityNetwork')}
          </h3>
          <div className="mt-2">
            <NetworkFeed items={feed} now={now} />
          </div>
        </div>
      ) : null}
    </DashCard>
  );
}

export function ActivityPanel({ member }: { member: boolean }) {
  const notifications = useQuery(api.notifications.myNotifications);
  const feed = useQuery(api.social.follows.activityFeed, member ? {} : 'skip');
  const now = useNow();
  const router = useRouter();
  const markRead = useMutation(api.notifications.markRead);

  async function open(n: ActivityNotification) {
    if (!n.read) {
      try {
        await markRead({ notificationId: n._id });
      } catch {
        /* reading state is secondary: navigation goes on */
      }
    }
    if (n.link) router.push(n.link);
  }

  return (
    <ActivityPanelView
      notifications={notifications}
      feed={feed}
      showFeed={member}
      now={now}
      onOpenNotification={(n) => void open(n)}
    />
  );
}
