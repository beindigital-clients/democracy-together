'use client';

import {
  Bell,
  BookUser,
  Building2,
  ClipboardCheck,
  CreditCard,
  Database,
  FileText,
  FolderKanban,
  GraduationCap,
  Handshake,
  KeyRound,
  LayoutDashboard,
  Megaphone,
  MessagesSquare,
  Rocket,
  ScrollText,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  type LucideIcon,
  BookOpenCheck,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  currentMemberNavItem,
  visibleMemberNavGroups,
  type MemberNavGroupKey,
  type MemberNavKey,
} from '@/lib/member-nav';

const ICONS: Record<MemberNavKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  profile: UserRound,
  messages: MessagesSquare,
  notifications: Bell,
  network: UsersRound,
  people: BookUser,
  workspaces: FolderKanban,
  publications: FileText,
  tribune: Megaphone,
  kohop: BookOpenCheck,
  manuscripts: ScrollText,
  youth: Sparkles,
  mentoring: Handshake,
  learning: GraduationCap,
  projects: Rocket,
  evaluations: ClipboardCheck,
  payments: CreditCard,
  organization: Building2,
  security: ShieldCheck,
  password: KeyRound,
  data: Database,
  admin: Settings2,
};

// Labels, each key WRITTEN IN FULL: the guard of issue #33
// (tests/unit/i18n-keys.test.ts) only checks literal keys, and a label
// requested through a variable would escape it.
export function useMemberNavLabels(): Record<MemberNavKey, string> {
  const t = useTranslations('member');
  return {
    dashboard: t('navDashboard'),
    profile: t('navProfile'),
    messages: t('navMessages'),
    notifications: t('navNotifications'),
    network: t('navNetwork'),
    people: t('navPeople'),
    workspaces: t('navWorkspaces'),
    publications: t('navPublications'),
    tribune: t('navTribune'),
    kohop: t('navKohop'),
    manuscripts: t('navManuscripts'),
    youth: t('navYouth'),
    mentoring: t('navMentoring'),
    learning: t('navLearning'),
    projects: t('navProjects'),
    evaluations: t('navEvaluations'),
    payments: t('navPayments'),
    organization: t('navOrganization'),
    security: t('navSecurity'),
    password: t('navPassword'),
    data: t('navData'),
    admin: t('navAdmin'),
  };
}

function useGroupLabels(): Record<MemberNavGroupKey, string | null> {
  const t = useTranslations('member');
  return {
    // The first group (dashboard, profile, messages) needs no title: it is
    // the top of the column, and a heading there would only repeat
    // "Mon espace", the name of the navigation itself.
    main: null,
    network: t('groupNetwork'),
    contributions: t('groupContributions'),
    programmes: t('groupProgrammes'),
    account: t('groupAccount'),
    staff: t('groupStaff'),
  };
}

export type UnreadCount = { count: number; capped: boolean };

/**
 * The member-area navigation (pure view: role and path come as props).
 *
 * One `<nav>` for every screen size: the side column shows it on desktop,
 * the disclosure menu shows the SAME element on mobile — never two copies of
 * each link in the page, which would double every entry for a screen reader.
 */
export function MemberNav({
  id,
  role,
  pathname,
  unreadMessages,
  unreadNotifications,
  className,
  onNavigate,
}: {
  id?: string;
  role: string | null | undefined;
  pathname: string;
  unreadMessages?: UnreadCount;
  unreadNotifications?: UnreadCount;
  className?: string;
  onNavigate?: () => void;
}) {
  const t = useTranslations('member');
  const labels = useMemberNavLabels();
  const groupLabels = useGroupLabels();
  const current = currentMemberNavItem(pathname, role);

  return (
    <nav id={id} aria-label={t('navLabel')} className={className}>
      {visibleMemberNavGroups(role).map((group) => {
        const title = groupLabels[group.key];
        const titleId = `member-nav-${group.key}`;
        return (
          <div key={group.key} className="mt-5 first:mt-0">
            {/* Group title in a `<span>` tied to its list, not an `<h2>`: the
                navigation precedes the page's `<h1>` — same choice, and same
                reason, as the back-office navigation. */}
            {title ? (
              <span
                id={titleId}
                className="block px-3 pb-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-muted"
              >
                {title}
              </span>
            ) : null}
            <ul
              aria-labelledby={title ? titleId : undefined}
              className="flex flex-col gap-0.5"
            >
              {group.items.map((item) => {
                const Icon = ICONS[item.key];
                const active = current?.key === item.key;
                const counted =
                  item.key === 'messages'
                    ? unreadMessages
                    : item.key === 'notifications'
                      ? unreadNotifications
                      : undefined;
                const unread = counted?.count ? counted : null;
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      onClick={onNavigate}
                      className={cn(
                        'group relative flex min-h-10 items-center gap-3 rounded-sm px-3 py-2 text-[14px] leading-snug transition-colors',
                        active
                          ? 'bg-accent-tint font-medium text-accent-text before:absolute before:inset-y-2 before:start-0 before:w-[3px] before:rounded-full before:bg-accent'
                          : 'text-ink-soft hover:bg-surface-2 hover:text-ink',
                      )}
                    >
                      <Icon
                        aria-hidden="true"
                        className={cn(
                          'h-[18px] w-[18px] shrink-0',
                          active
                            ? 'text-accent-text'
                            : 'text-muted group-hover:text-ink-soft',
                        )}
                      />
                      <span className="min-w-0 flex-1 wrap-anywhere">
                        {labels[item.key]}
                        {/* The count, spelled out for screen readers INSIDE
                            the label (the visual badge below is hidden from
                            them): "Messages (2 conversations non lues)". */}
                        {unread ? (
                          <span className="sr-only">
                            {' '}
                            {item.key === 'notifications'
                              ? unread.capped
                                ? t('navNotificationsUnreadMany', {
                                    count: unread.count,
                                  })
                                : t('navNotificationsUnread', {
                                    count: unread.count,
                                  })
                              : unread.capped
                                ? t('navUnreadMany', { count: unread.count })
                                : t('navUnread', { count: unread.count })}
                          </span>
                        ) : null}
                      </span>
                      {unread ? (
                        <Badge aria-hidden="true" variant="solid" size="count">
                          {unread.capped ? `${unread.count}+` : unread.count}
                        </Badge>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
