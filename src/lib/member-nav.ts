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
// without a browser (tests/unit/member-area-rules.test.ts).

export type MemberNavKey =
  | 'dashboard'
  | 'profile'
  | 'messages'
  | 'notifications'
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

// WHO AN ENTRY IS FOR, by role. The server stays the authority (each
// screen's Convex functions check the role); the navigation offers each
// person what their role is for, and nothing that would open on a refusal
// or on a space meant for someone else.
//
//  - `everyone`      every signed-in account: the account itself, messages,
//                    notifications, the person's own network;
//  - `members`       approved members AND the team (`membre` and above):
//                    the people directory, the workspaces, what one
//                    publishes — the team belongs to the network and
//                    writes in it too;
//  - `network`       approved members, NOT the team: what a member does as a
//                    participant of the network — calls for projects,
//                    evaluations, the reading committee, the organisation,
//                    the dues. The team runs these from the back office;
//  - `participants`  visitors and members, NOT the team: the programmes open
//                    before membership (youth space, mentoring, learning
//                    paths) and payments (a visitor is offered membership
//                    and donations there). An administrator does not need a
//                    youth space;
//  - `team`          moderators and above: the back office.
export type MemberNavAudience =
  'everyone' | 'members' | 'network' | 'participants' | 'team';

export type MemberNavItem = {
  key: MemberNavKey;
  href: string;
  audience: MemberNavAudience;
};

export type MemberNavGroupKey =
  'main' | 'network' | 'contributions' | 'programmes' | 'account' | 'staff';

export type MemberNavGroup = {
  key: MemberNavGroupKey;
  items: readonly MemberNavItem[];
};

export const MEMBER_HOME = '/espace-membre';

// Order of the groups: where one comes every day first (dashboard,
// profile, messages, notifications), then — for the team — the back office,
// their place of work, before the network, what one publishes, the
// programmes and the account.
export const MEMBER_NAV_GROUPS: readonly MemberNavGroup[] = [
  {
    key: 'main',
    items: [
      { key: 'dashboard', href: MEMBER_HOME, audience: 'everyone' },
      { key: 'profile', href: '/espace-membre/profil', audience: 'everyone' },
      {
        key: 'messages',
        href: '/espace-membre/messages',
        audience: 'everyone',
      },
      // Outside `/espace-membre` (the bell links there), rendered inside the
      // same frame (`notifications/layout.tsx`).
      { key: 'notifications', href: '/notifications', audience: 'everyone' },
    ],
  },
  {
    key: 'staff',
    items: [{ key: 'admin', href: '/admin', audience: 'team' }],
  },
  {
    key: 'network',
    items: [
      { key: 'network', href: '/espace-membre/reseau', audience: 'everyone' },
      // Outside `/espace-membre` too, and inside the same frame
      // (`membres/page.tsx`, `espaces/layout.tsx`): both are reserved to
      // members, a visitor would only find a closed door there.
      { key: 'people', href: '/membres', audience: 'members' },
      { key: 'workspaces', href: '/espaces', audience: 'members' },
    ],
  },
  {
    key: 'contributions',
    items: [
      {
        key: 'publications',
        href: '/espace-membre/publications',
        audience: 'members',
      },
      {
        key: 'tribune',
        href: '/espace-membre/contributions',
        audience: 'members',
      },
      // The AUTHOR's side of peer review; reviewers and editors work from
      // the back office (`/admin/mes-relectures`, `/admin/revue`).
      {
        key: 'manuscripts',
        href: '/espace-membre/manuscrits',
        audience: 'network',
      },
    ],
  },
  {
    key: 'programmes',
    items: [
      {
        key: 'projects',
        href: '/espace-membre/projets',
        audience: 'network',
      },
      {
        key: 'evaluations',
        href: '/espace-membre/evaluations',
        audience: 'network',
      },
      { key: 'youth', href: '/espace-membre/jeunes', audience: 'participants' },
      {
        key: 'mentoring',
        href: '/espace-membre/mentorat',
        audience: 'participants',
      },
      {
        key: 'learning',
        href: '/espace-membre/parcours',
        audience: 'participants',
      },
    ],
  },
  {
    key: 'account',
    items: [
      {
        key: 'payments',
        href: '/espace-membre/cotisations',
        audience: 'participants',
      },
      {
        key: 'organization',
        href: '/espace-membre/organisation',
        audience: 'network',
      },
      {
        key: 'security',
        href: '/espace-membre/securite',
        audience: 'everyone',
      },
      {
        key: 'password',
        href: '/espace-membre/mot-de-passe',
        audience: 'everyone',
      },
      { key: 'data', href: '/espace-membre/donnees', audience: 'everyone' },
    ],
  },
] as const;

// Is an entry offered to this role? An UNKNOWN role (`null`: the column's
// reads failed) is offered the entries every account has, and only those.
export function isOfferedTo(
  audience: MemberNavAudience,
  role: string | null | undefined,
): boolean {
  if (!role) return audience === 'everyone';
  switch (audience) {
    case 'everyone':
      return true;
    case 'members':
      return isMember(role);
    case 'network':
      return isMember(role) && !isStaff(role);
    case 'participants':
      return !isStaff(role);
    case 'team':
      return isStaff(role);
  }
}

// Groups offered to a role. An entry the role is not offered is left out,
// and a group left empty disappears with its title — the same rule as the
// back office: never a heading over nothing.
export function visibleMemberNavGroups(
  role: string | null | undefined,
): MemberNavGroup[] {
  return MEMBER_NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => isOfferedTo(item.audience, role)),
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
