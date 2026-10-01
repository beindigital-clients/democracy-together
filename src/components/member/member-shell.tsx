'use client';

import { useState, type ReactNode } from 'react';
import { useConvexAuth, useQuery } from 'convex/react';
import { ChevronDown, Menu, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link, usePathname } from '@/i18n/navigation';
import { vocabulary } from '@/i18n/vocabulary';
import { isMember } from '@/lib/roles';
import { cn } from '@/lib/utils';
import { memberName } from '@/lib/member-identity';
import { currentMemberNavItem } from '@/lib/member-nav';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PersonAvatar } from '@/components/social/person-avatar';
import { MemberNav, useMemberNavLabels } from '@/components/member/member-nav';
import { WidgetBoundary } from '@/components/member/widget-boundary';

// MEMBER-AREA SHELL — the frame every `/espace-membre` screen now shares.
//
// Before: each of the twenty screens drew its own container, its own
// "← Espace membre" link and its own breadcrumb, and the only way to go from
// one to another was back through the dashboard's wall of links. Now: a side
// column on desktop (who you are, where you are, where you can go), folded
// into a menu button on small screens.
//
// The column's reads are isolated in a boundary: if one of them fails, the
// screen itself stays usable and the column falls back to the entries every
// account is offered.

const NAV_ID = 'member-nav';

function SidebarSkeleton() {
  return (
    <div aria-hidden="true" className="space-y-5">
      <div className="flex items-center gap-3 rounded-md border border-line bg-surface p-3">
        <Skeleton className="h-11 w-11 rounded-full" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <div className="hidden space-y-2 lg:block">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    </div>
  );
}

function Identity({
  name,
  photoUrl,
  role,
}: {
  name: string;
  photoUrl: string | null;
  role: string;
}) {
  const t = useTranslations('auth');
  const tm = useTranslations('member');
  return (
    <div className="flex min-w-0 items-center gap-3">
      <PersonAvatar name={name} photoUrl={photoUrl} size={44} />
      <div className="min-w-0">
        <p className="wrap-anywhere text-[15px] font-medium leading-snug text-ink">
          {name}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          <span className="sr-only">{tm('roleSr')} </span>
          {vocabulary(t, 'role_', role)}
        </p>
      </div>
    </div>
  );
}

function Sidebar() {
  const t = useTranslations('member');
  const tl = useTranslations('library');
  const labels = useMemberNavLabels();
  const pathname = usePathname();
  const { isAuthenticated } = useConvexAuth();
  const skip = isAuthenticated ? {} : 'skip';
  const me = useQuery(api.users.current, skip);
  const profile = useQuery(api.social.profiles.getMine, skip);
  const unread = useQuery(api.social.messages.unreadSummary, skip);
  const unreadNotifications = useQuery(api.notifications.unreadCount, skip);
  // The mobile menu is open FOR a path: following a link changes the path,
  // which closes it without an effect to write.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname;

  if (!me) return <SidebarSkeleton />;

  const name =
    memberName({
      profileExists: Boolean(profile?.exists),
      profileName: profile?.displayName,
      accountName: me.name,
    }) ??
    me.email ??
    '';
  const current = currentMemberNavItem(pathname, me.role);

  return (
    <div className="space-y-4">
      {/* Desktop only: on a phone the column folds into the button below,
          and the dashboard's own header already says who is signed in. */}
      <div className="hidden rounded-md border border-line bg-surface p-3 lg:block">
        <Identity
          name={name}
          photoUrl={profile?.photoUrl ?? null}
          role={me.role}
        />
      </div>

      {/* Small screens: the navigation folds into this button. The current
          screen is named on it, so the folded menu still says where one is. */}
      <Button
        type="button"
        variant="outline"
        aria-expanded={open}
        aria-controls={NAV_ID}
        onClick={() => setOpenFor(open ? null : pathname)}
        className="min-h-12 w-full justify-start gap-3 whitespace-normal rounded-md px-3 py-2 text-start lg:hidden"
      >
        <PersonAvatar
          name={name}
          photoUrl={profile?.photoUrl ?? null}
          size={32}
        />
        <span className="min-w-0 flex-1">
          {t('menuButton')}
          {current ? (
            <span className="block text-xs font-normal text-muted">
              {labels[current.key]}
            </span>
          ) : null}
        </span>
        <Menu aria-hidden="true" className="size-[18px] text-muted" />
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'size-4 text-muted transition-transform',
            open && 'rotate-180',
          )}
        />
      </Button>

      <div className={cn('space-y-5', open ? 'block' : 'hidden lg:block')}>
        <MemberNav
          id={NAV_ID}
          role={me.role}
          pathname={pathname}
          unreadMessages={unread}
          unreadNotifications={unreadNotifications}
          onNavigate={() => setOpenFor(null)}
          className="rounded-md border border-line bg-surface p-2 lg:border-0 lg:bg-transparent lg:p-0"
        />
        {isMember(me.role) ? (
          <Button asChild className="w-full min-h-11">
            <Link href="/espace-membre/deposer">
              <Plus aria-hidden="true" />
              {tl('mine.submitCta')}
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// If the column's reads fail, the entries offered to every account remain.
function SidebarFallback() {
  const pathname = usePathname();
  return <MemberNav role={null} pathname={pathname} />;
}

export function MemberShell({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[1200px] px-4 pb-16 pt-6 sm:px-6 lg:pt-10">
      <div className="lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start lg:gap-10">
        {/* NOT sticky, on purpose: with every entry listed, the column is
            taller than a laptop screen, and a sticky column that tall needs
            its own scroll — a second scrollbar nobody finds, hiding the
            account entries at its bottom. It scrolls with the page. */}
        <aside className="print:hidden">
          <WidgetBoundary fallback={<SidebarFallback />}>
            <Sidebar />
          </WidgetBoundary>
        </aside>
        <div className="mt-6 min-w-0 lg:mt-0">{children}</div>
      </div>
    </div>
  );
}
