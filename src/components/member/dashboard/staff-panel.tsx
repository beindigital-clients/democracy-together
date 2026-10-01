'use client';

import { useQuery } from 'convex/react';
import {
  FileClock,
  Inbox,
  Settings2,
  UserRoundCheck,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { isAdmin } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowForward } from '@/components/ui/arrow';

export type StaffStats = {
  pendingApplications: number;
  pendingPublications: number;
  unhandledContacts: number;
  totalUsers: number;
};

type Tile = {
  key: string;
  label: string;
  value: number;
  icon: LucideIcon;
  // `null`: shown without a link — the screen behind it is not open to
  // this role (the users list is reserved for administrators).
  href: string | null;
  // A number that waits for a decision: highlighted as long as it is not 0.
  actionable: boolean;
};

// "Administration" block, for moderators and above: what waits for the
// team's decision, each number leading to the queue where it is handled.
// The admin reaches the back office from here in one click — the old member
// area buried that link in a line of twelve.
export function StaffPanelView({
  stats,
  role,
}: {
  stats: StaffStats | undefined;
  role: string;
}) {
  const t = useTranslations('member');
  const admin = isAdmin(role);
  const tiles: Tile[] = stats
    ? [
        {
          key: 'applications',
          label: t('staffPendingApplications'),
          value: stats.pendingApplications,
          icon: UserRoundCheck,
          href: '/admin/candidatures',
          actionable: true,
        },
        {
          key: 'publications',
          label: t('staffPendingPublications'),
          value: stats.pendingPublications,
          icon: FileClock,
          href: '/admin/publications',
          actionable: true,
        },
        {
          key: 'contacts',
          label: t('staffContacts'),
          value: stats.unhandledContacts,
          icon: Inbox,
          href: '/admin/contact',
          actionable: true,
        },
        {
          key: 'users',
          label: t('staffUsers'),
          value: stats.totalUsers,
          icon: UsersRound,
          href: admin ? '/admin/utilisateurs' : null,
          actionable: false,
        },
      ]
    : [];
  const waiting =
    stats !== undefined &&
    stats.pendingApplications +
      stats.pendingPublications +
      stats.unhandledContacts ===
      0;

  return (
    <section
      aria-labelledby="dash-staff-title"
      className="rounded-md border border-accent-edge bg-[color-mix(in_srgb,var(--accent)_4%,var(--surface))] p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-sm bg-accent text-accent-contrast"
          >
            <Settings2 className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <h2
              id="dash-staff-title"
              className="font-display text-[21px] leading-tight text-ink"
            >
              {t('staffTitle')}
            </h2>
            <p className="mt-0.5 text-sm text-ink-soft">
              {waiting ? t('staffAllClear') : t('staffLead')}
            </p>
          </div>
        </div>
        <Button asChild className="min-h-11">
          <Link href="/admin">
            {t('staffOpen')} <ArrowForward />
          </Link>
        </Button>
      </div>

      <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats === undefined
          ? Array.from({ length: 4 }, (_, i) => (
              <li
                key={i}
                aria-hidden="true"
                className="rounded-md border border-line bg-surface p-4"
              >
                <Skeleton className="h-7 w-10" />
                <Skeleton className="mt-3 h-3.5 w-3/4" />
              </li>
            ))
          : tiles.map((tile) => {
              const hot = tile.actionable && tile.value > 0;
              const body = (
                <>
                  <span className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        'font-mono text-[28px] font-medium leading-none tabular-nums',
                        hot ? 'text-accent-text' : 'text-ink',
                      )}
                    >
                      {tile.value}
                    </span>
                    <tile.icon
                      aria-hidden="true"
                      className={cn(
                        'h-5 w-5',
                        hot ? 'text-accent-text' : 'text-muted',
                      )}
                    />
                  </span>
                  <span className="mt-2 block text-sm leading-snug text-ink-soft">
                    {tile.label}
                  </span>
                </>
              );
              const box = cn(
                'block h-full rounded-md border p-4 transition-colors',
                hot
                  ? 'border-accent-edge bg-surface'
                  : 'border-line bg-surface',
              );
              return (
                <li key={tile.key}>
                  {tile.href ? (
                    <Link
                      href={tile.href}
                      className={cn(
                        box,
                        'hover:border-accent hover:bg-accent-tint',
                      )}
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className={box}>{body}</div>
                  )}
                </li>
              );
            })}
      </ul>
    </section>
  );
}

export function StaffPanel({ role }: { role: string }) {
  const stats = useQuery(api.admin.dashboardStats);
  return <StaffPanelView stats={stats} role={role} />;
}
