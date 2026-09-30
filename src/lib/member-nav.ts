import { isMember, isStaff } from '@/lib/roles';

// MEMBER-AREA NAVIGATION — the model, without React.
//
// The member area used to be a single page listing some twenty links in a
// row, with every other screen carrying its own back link. It now has a
// persistent navigation, grouped by what the person comes to do: follow the
// network, publish, take part in a programme, manage the account. This file
// is its single source: the side column (desktop), the disclosure menu
// (mobile) and the tests read the same table.
//
// Kept PURE (no hook, no translation) on purpose, like `admin-nav.tsx`: what
// decides which entry a role sees, and which entry is current, is testable
// without a browser (tests/unit/member-nav.test.ts).

export type MemberNavKey =
  | 'dashboard'
  | 'profile'
  | 'messages'
  | 'network'
  | 'people'
  | 'workspaces'
  | 'publications'
  | 'tribune'
  | 'manuscripts'
  | 'youth'
  | 'mentoring'
  | 'learning'
  | 'projects'
  | 'evaluations'
  | 'payments'
  | 'organization'
  | 'security'
  | 'password'
  | 'data'
  | 'admin';

// Who is offered an entry. The server stays the authority (each screen's
// Convex functions check the role); the navigation only avoids offering a
// door that would open on a refusal.
//  - `all`    any signed-in account, visitors included;
//  - `member` approved members and above (submission, calls, reviews);
//  - `staff`  moderators and above (the back office).
export type MemberNavAccess = 'all' | 'member' | 'staff';

export type MemberNavItem = {
  key: MemberNavKey;
  href: string;
  access: MemberNavAccess;
};

export type MemberNavGroupKey =
  'main' | 'network' | 'contributions' | 'programmes' | 'account' | 'staff';

export type MemberNavGroup = {
  key: MemberNavGroupKey;
  items: readonly MemberNavItem[];
};

export const MEMBER_HOME = '/espace-membre';

export const MEMBER_NAV_GROUPS: readonly MemberNavGroup[] = [
  {
    key: 'main',
    items: [
      { key: 'dashboard', href: MEMBER_HOME, access: 'all' },
      { key: 'profile', href: '/espace-membre/profil', access: 'all' },
      { key: 'messages', href: '/espace-membre/messages', access: 'all' },
    ],
  },
  {
    key: 'network',
    items: [
      { key: 'network', href: '/espace-membre/reseau', access: 'all' },
      // Outside `/espace-membre`, and listed anyway: the people directory
      // and the workspaces are part of what a member does from here, and
      // they had no other entry than the dashboard's list of links.
      { key: 'people', href: '/membres', access: 'all' },
      { key: 'workspaces', href: '/espaces', access: 'all' },
    ],
  },
  {
    key: 'contributions',
    items: [
      {
        key: 'publications',
        href: '/espace-membre/publications',
        access: 'member',
      },
      {
        key: 'tribune',
        href: '/espace-membre/contributions',
        access: 'member',
      },
      {
        key: 'manuscripts',
        href: '/espace-membre/manuscrits',
        access: 'member',
      },
    ],
  },
  {
    key: 'programmes',
    items: [
      { key: 'youth', href: '/espace-membre/jeunes', access: 'all' },
      { key: 'mentoring', href: '/espace-membre/mentorat', access: 'all' },
      { key: 'learning', href: '/espace-membre/parcours', access: 'all' },
      { key: 'projects', href: '/espace-membre/projets', access: 'member' },
      {
        key: 'evaluations',
        href: '/espace-membre/evaluations',
        access: 'member',
      },
    ],
  },
  {
    key: 'account',
    items: [
      { key: 'payments', href: '/espace-membre/cotisations', access: 'all' },
      {
        key: 'organization',
        href: '/espace-membre/organisation',
        access: 'all',
      },
      { key: 'security', href: '/espace-membre/securite', access: 'all' },
      { key: 'password', href: '/espace-membre/mot-de-passe', access: 'all' },
      { key: 'data', href: '/espace-membre/donnees', access: 'all' },
    ],
  },
  {
    key: 'staff',
    items: [{ key: 'admin', href: '/admin', access: 'staff' }],
  },
] as const;

export function canAccess(
  access: MemberNavAccess,
  role: string | null | undefined,
): boolean {
  if (access === 'staff') return isStaff(role);
  if (access === 'member') return isMember(role);
  return true;
}

// Groups offered to a role. An entry the role cannot open is left out, and
// a group left empty disappears with its title — the same rule as the back
// office: never a heading over nothing.
export function visibleMemberNavGroups(
  role: string | null | undefined,
): MemberNavGroup[] {
  return MEMBER_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => canAccess(item.access, role)),
  })).filter((group) => group.items.length > 0);
}

function trimSlash(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

// Current entry. The dashboard is matched EXACTLY: its path is the prefix of
// every other member screen. The others match their own path and what lies
// beneath it (`/espace-membre/contributions/<id>` lights "Tribune"), on a
// whole segment — `/espace-membre/projets` must not light up for a
// hypothetical `/espace-membre/projets-archives`.
export function isMemberNavItemActive(href: string, pathname: string): boolean {
  const path = trimSlash(pathname);
  if (href === MEMBER_HOME) return path === MEMBER_HOME;
  return path === href || path.startsWith(`${href}/`);
}

// The entry matching the current page, if the role is offered one. The
// submission form (`/espace-membre/deposer`) belongs to "Mes publications":
// it is where the button leading to it lives.
export function currentMemberNavItem(
  pathname: string,
  role: string | null | undefined,
): MemberNavItem | null {
  const path = trimSlash(pathname);
  const lookup =
    path === '/espace-membre/deposer' ? '/espace-membre/publications' : path;
  for (const group of visibleMemberNavGroups(role)) {
    for (const item of group.items) {
      if (isMemberNavItemActive(item.href, lookup)) return item;
    }
  }
  return null;
}
