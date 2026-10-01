'use client';

import { useQuery } from 'convex/react';
import {
  Bell,
  MessagesSquare,
  UserRoundCheck,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

export type StatValue = { value: number; capped?: boolean } | undefined;

export type StatTilesData = {
  followers: StatValue;
  following: StatValue;
  unreadMessages: StatValue;
  unreadNotifications: StatValue;
};

type Tile = {
  key: keyof StatTilesData;
  label: string;
  href: string;
  icon: LucideIcon;
  // Unread counts are a call to action: highlighted while not zero.
  attention: boolean;
};

// Four numbers at a glance, each leading to where it is acted on. The
// figures are in the data face (Plex Mono, tabular): they align from one
// tile to the next and do not jump as they change.
export function StatTilesView({ data }: { data: StatTilesData }) {
  const t = useTranslations('member');
  const tiles: Tile[] = [
    {
      key: 'unreadMessages',
      label: t('statMessages'),
      href: '/espace-membre/messages',
      icon: MessagesSquare,
      attention: true,
    },
    {
      key: 'unreadNotifications',
      label: t('statNotifications'),
      href: '/notifications',
      icon: Bell,
      attention: true,
    },
    {
      key: 'followers',
      label: t('statFollowers'),
      href: '/espace-membre/reseau',
      icon: UsersRound,
      attention: false,
    },
    {
      key: 'following',
      label: t('statFollowing'),
      href: '/espace-membre/reseau',
      icon: UserRoundCheck,
      attention: false,
    },
  ];
  return (
    <section aria-labelledby="dash-stats-title">
      <h2 id="dash-stats-title" className="sr-only">
        {t('statsTitle')}
      </h2>
      <ul className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {tiles.map((tile) => {
          const stat = data[tile.key];
          const hot = tile.attention && (stat?.value ?? 0) > 0;
          return (
            <li key={tile.key}>
              <Link
                href={tile.href}
                className={cn(
                  'group flex h-full flex-col justify-between gap-3 rounded-md border bg-surface p-4 shadow-card transition-colors hover:border-accent-edge hover:bg-accent-tint',
                  hot ? 'border-accent-edge' : 'border-line',
                )}
              >
                <span className="flex items-start justify-between gap-2">
                  {stat === undefined ? (
                    <Skeleton className="h-8 w-12" />
                  ) : (
                    <span
                      className={cn(
                        'font-mono text-[30px] font-medium leading-none tabular-nums',
                        hot ? 'text-accent-text' : 'text-ink',
                      )}
                    >
                      {stat.value}
                      {stat.capped ? '+' : ''}
                    </span>
                  )}
                  <tile.icon
                    aria-hidden="true"
                    className={cn(
                      'h-5 w-5 shrink-0',
                      hot
                        ? 'text-accent-text'
                        : 'text-muted group-hover:text-accent-text',
                    )}
                  />
                </span>
                <span className="text-sm leading-snug text-ink-soft">
                  {tile.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function StatTiles() {
  const profile = useQuery(api.social.profiles.getMine);
  const messages = useQuery(api.social.messages.unreadSummary);
  const notifications = useQuery(api.notifications.unreadCount);
  return (
    <StatTilesView
      data={{
        followers: profile ? { value: profile.followerCount } : undefined,
        following: profile ? { value: profile.followingCount } : undefined,
        unreadMessages: messages
          ? { value: messages.count, capped: messages.capped }
          : undefined,
        unreadNotifications: notifications
          ? { value: notifications.count, capped: notifications.capped }
          : undefined,
      }}
    />
  );
}
