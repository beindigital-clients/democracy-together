'use client';

import { LEGACY_PEER_REVIEW_UI } from '@/lib/legacy-review';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import { roleRank, isReviewChief, type NetworkRole } from '@/lib/roles';

// BACK-OFFICE NAVIGATION (issue #49).
//
// WHAT DOES NOT CHANGE, and was already right: the `<nav>` has an
// `aria-label`, the current entry has `aria-current="page"`, and the
// dashboard is detected separately so it does not light up on all its
// sub-routes. These three points are kept as is — it was the FORM that was
// the problem, not the wiring.
//
// WHAT CHANGES, and why. The fourteen entries lived in a single
// `overflow-x-auto` row: on mobile most of them were off screen without
// any hint that one had to scroll, and content, moderation, network and
// administration were mixed in the order the array had been written.
//
// The chosen answer is a GROUPING BY DOMAIN rendered as a side column
// from `lg` up, and as stacked groups that WRAP below that.
// Three reasons to prefer this to the issue's two other options:
//
//  1. nothing is hidden. Collapsing (dropdown menus, closed `<details>`)
//     reduces height but swaps one flaw for another: an entry behind a
//     click is as invisible as an off-screen entry, and it stops being
//     reachable by keyboard in a single tab press.
//  2. the split by domain coincides with the split by ROLE. The last two
//     groups are exactly those the issue describes as restricted
//     (editors: review + newsletter; administrators: users +
//     log). The proposed "collapse by role" is thus already achieved: a
//     moderator sees three groups, an editor four, an administrator
//     five — with no collapse mechanism to maintain.
//  3. in a column, the available width no longer depends on the number of
//     entries: a fifteenth entry lengthens the list instead of pushing the
//     others off screen.
//
// The order follows usage: what one opens every session (steering), then
// what awaits a decision (moderation), then the programmes, then editing,
// then account administration.

export type AdminNavItem = {
  href: string;
  key: string;
  // The entry is ALSO reserved to review chiefs and administrators, on top of
  // the group's minimum rank (KOHOP): the review chief is a function, not a
  // rank, so no rank threshold can express it.
  requiresReviewChief?: boolean;
  // Minimum rank of THIS entry when it differs from its group's: a review chief
  // may hold the `moderateur` rank, below the `edition` group's `editeur`.
  minRole?: NetworkRole;
  // Belongs to the legacy F-43 review, hidden since KOHOP (D-13).
  legacyReview?: boolean;
};
export type AdminNavGroup = {
  key: string;
  // Group title key, WRITTEN IN FULL rather than composed at render time
  // (`navGroup_${key}`). The guard from issue #33 rejects a key built at
  // runtime being passed to the translator, and `vocabulary()` does not fit
  // here: these titles are hard-coded in this file, so a missing key is a
  // bug, not vocabulary coming from the database that deserves a fallback. It
  // is checked in both languages by tests/unit/admin-nav.test.tsx.
  labelKey: string;
  // MINIMUM role to which the group is offered. The rank comes from the shared
  // hierarchy (`@convex/lib/roles`), never from a boolean copied here: that is
  // what guarantees the UI and `requireNetworkRole` read the same order.
  minRole: NetworkRole;
  items: readonly AdminNavItem[];
};

export const ADMIN_NAV_GROUPS: readonly AdminNavGroup[] = [
  {
    key: 'pilotage',
    labelKey: 'navGroup_pilotage',
    minRole: 'moderateur',
    items: [
      { href: '/admin', key: 'dashboard' },
      { href: '/admin/impact', key: 'impact' },
    ],
  },
  {
    key: 'moderation',
    labelKey: 'navGroup_moderation',
    minRole: 'moderateur',
    items: [
      { href: '/admin/candidatures', key: 'applications' },
      { href: '/admin/publications', key: 'publications' },
      // "Mes relectures" (27/09 campaign, A-02): the REVIEWER's view,
      // open from moderator rank because `submitReview` is. It only
      // shows their assignments; the full queue and the decisions
      // stay in "Comité de lecture", reserved for editors. Filed with
      // moderation: that is where a moderator works.
      { href: '/admin/mes-relectures', key: 'myReviews', legacyReview: true },
      // Unified tribune queue (community workstream, F-45/F-49): posts
      // and comments pending, approved, rejected, withdrawn, reported, with
      // each one's history. A path distinct from `/admin/moderation-ia` —
      // the active entry is decided by prefix, and `/admin/moderation` would
      // have lit it up (and lowered its minimum rank).
      { href: '/admin/file-moderation', key: 'fileModeration' },
      { href: '/admin/signalements', key: 'reports' },
      // Reported private messages ("social" workstream): same rank as the
      // Tribune queue, the one required by `social.messages.listReports`.
      { href: '/admin/messages-signales', key: 'messageReports' },
      { href: '/admin/contact', key: 'contactMessages' },
      // Directory entries proposed by organization managers
      // (F-21, accounts workstream): this is moderation, at the rank of
      // `orgAdmin.reviewRevision`.
      { href: '/admin/organisations', key: 'organizations' },
    ],
  },
  {
    key: 'programmes',
    labelKey: 'navGroup_programmes',
    minRole: 'moderateur',
    items: [
      { href: '/admin/jeunes', key: 'youth' },
      { href: '/admin/mentorat', key: 'mentorship' },
      { href: '/admin/projets', key: 'projects' },
      { href: '/admin/evenements', key: 'events' },
    ],
  },
  {
    key: 'edition',
    labelKey: 'navGroup_edition',
    minRole: 'editeur',
    items: [
      { href: '/admin/revue', key: 'review', legacyReview: true },
      // KOHOP queue (batch 2): the review chief's screen, whatever their rank
      // (moderator or above) — the function, not the rank, opens it.
      {
        href: '/admin/kohop',
        key: 'kohop',
        requiresReviewChief: true,
        minRole: 'moderateur',
      },
      // Annual reports (F-41, editorial workstream): the Convex guard is at
      // editor rank (`annualReports.*`), like the review.
      { href: '/admin/rapports', key: 'annualReports' },
      { href: '/admin/newsletter', key: 'newsletter' },
      // Editorial content (F-62/F-64): events, replays, partners,
      // press, themes, media library. Editor rank, like the `requireEditor`
      // guard in convex/lib/contenus/access.ts. Event REGISTRATIONS
      // stay under "Programmes", at moderator rank.
      { href: '/admin/contenus', key: 'contents' },
      // Toolbox and learning paths (F-56, F-57): editorial content, hence
      // editor rank — that of `toolbox.saveResource` and `savePath`.
      { href: '/admin/boite-a-outils', key: 'toolbox' },
    ],
  },
  // Automation is a separate group, reserved for administrators.
  //
  // Two splits were debated: filing "Modération IA" under
  // "Modération", where moderators work, or giving it its own
  // group. The first would have shown a moderator an entry that the
  // server refuses them — the navigation would stop telling the truth about
  // what one can open. And what this screen configures is not moderation:
  // it is the decision to do without it. The AI's OPINION, however, stays where
  // moderation happens — in the /admin/publications queue, seen by all staff.
  {
    key: 'automatisation',
    labelKey: 'navGroup_automatisation',
    minRole: 'admin',
    items: [{ href: '/admin/moderation-ia', key: 'aiModeration' }],
  },
  // Treasury (F-31): amounts, payer identities and refunds —
  // reserved for administrators, like the guard on the functions in
  // convex/payments/finances.ts. The price list (/admin/finances/formules)
  // inherits the screen's rank by prefix.
  {
    key: 'finances',
    labelKey: 'navGroup_finances',
    minRole: 'admin',
    items: [{ href: '/admin/finances', key: 'finances' }],
  },
  {
    key: 'comptes',
    labelKey: 'navGroup_comptes',
    minRole: 'admin',
    items: [
      { href: '/admin/utilisateurs', key: 'users' },
      { href: '/admin/journal', key: 'journal' },
    ],
  },
] as const;

// Groups offered to a role. A whole group disappears, not an entry
// inside it: that is what avoids a group with a title and no content.
// Minimum rank for a back-office PATH, read from the same table as the
// navigation: a screen the bar hides from a role must not open via a
// direct URL. Measured on 27/09: a moderator typing /admin/revue or
// /admin/newsletter landed on "Une erreur est survenue", the page's
// "editor" query having thrown before any screen guard. A path outside
// the table (unknown page under /admin) gets the shell's rank: moderator.
export function adminMinRoleForPath(pathname: string): NetworkRole {
  const path = pathname.replace(/\/+$/, '') || '/';
  for (const group of ADMIN_NAV_GROUPS) {
    for (const item of group.items) {
      if (
        item.href === '/admin'
          ? path === '/admin'
          : isAdminNavItemActive(item.href, path)
      ) {
        return item.minRole ?? group.minRole;
      }
    }
  }
  return 'moderateur';
}

/**
 * Does the back-office PATH require the review chief function (or the
 * administrator) on top of its minimum rank? Read from the same table as the
 * navigation, like `adminMinRoleForPath`.
 */
export function adminPathRequiresReviewChief(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  for (const group of ADMIN_NAV_GROUPS) {
    for (const item of group.items) {
      if (
        item.href === '/admin'
          ? path === '/admin'
          : isAdminNavItemActive(item.href, path)
      ) {
        return item.requiresReviewChief === true;
      }
    }
  }
  return false;
}

/**
 * Label key of the current screen (`admin.<key>`), or `null` outside the menu.
 *
 * Used for the PAGE TITLE (RGAA 8.6): the back-office screens are
 * client components, without `generateMetadata`; measured in the 27/09 audit,
 * all sixteen had the same title. The menu label is the one the person
 * has just chosen — so it is the safest screen name to announce.
 */
export function adminScreenKey(pathname: string): string | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  for (const group of ADMIN_NAV_GROUPS) {
    for (const item of group.items) {
      if (
        item.href === '/admin'
          ? path === '/admin'
          : isAdminNavItemActive(item.href, path)
      ) {
        return item.key;
      }
    }
  }
  return null;
}

export function visibleAdminNavGroups(
  role: NetworkRole,
  reviewChief = false,
): readonly AdminNavGroup[] {
  return filterAdminNavGroups(ADMIN_NAV_GROUPS, role, reviewChief);
}

// The rule on its own, over any table: a group needs its minimum rank, an
// entry flagged `requiresReviewChief` also needs the function (or the
// administrator rank), and a group left without entries disappears.
export function filterAdminNavGroups(
  groups: readonly AdminNavGroup[],
  role: NetworkRole,
  reviewChief = false,
): readonly AdminNavGroup[] {
  const allowed = isReviewChief({ role, reviewChief });
  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter(
        (item) =>
          roleRank(role) >= roleRank(item.minRole ?? group.minRole) &&
          (!item.requiresReviewChief || allowed) &&
          (!item.legacyReview || LEGACY_PEER_REVIEW_UI),
      ),
    }))
    .filter((group) => group.items.length > 0);
}

// Current entry. The dashboard is handled separately: its path is the
// prefix of ALL the others, so a `startsWith` would light it up on every
// back-office sub-route. Behaviour carried over as is from the tab bar
// it replaces.
export function isAdminNavItemActive(href: string, pathname: string): boolean {
  return href === '/admin' ? pathname === '/admin' : pathname.startsWith(href);
}

// WORK WAITING, per entry (membership applications, publications, contact
// messages). A moderator used to learn of a new application only by opening
// the dashboard; the menu they use on every screen now says where something
// waits. The count is a DESCRIPTION of the link, not part of its name: the
// name stays "Candidatures (Administration)" — what the entry is, whatever
// the queue holds — and the pill itself is hidden from assistive technology,
// which reads the description instead.
export type AdminNavCounts = Partial<Record<string, number>>;

export function AdminNav({
  role,
  reviewChief = false,
  pathname,
  counts = {},
}: {
  role: NetworkRole;
  reviewChief?: boolean;
  pathname: string;
  counts?: AdminNavCounts;
}) {
  const t = useTranslations('admin');
  return (
    <nav
      aria-label={t('title')}
      className="space-y-5 border-b border-line pb-5 lg:sticky lg:top-8 lg:self-start lg:space-y-6 lg:border-b-0 lg:pb-0"
    >
      {visibleAdminNavGroups(role, reviewChief).map((group) => {
        const labelId = `admin-nav-${group.key}`;
        return (
          <div key={group.key}>
            {/* Group title carried by a `<span>` linked to the list via
                `aria-labelledby`, and not by an `<h2>`: the navigation precedes
                the screen's `<h1>`, a level-2 heading there would break the page's
                heading order. The group name is announced anyway. */}
            <span
              id={labelId}
              className="block font-mono text-[11px] uppercase tracking-[0.14em] text-muted"
            >
              {t(group.labelKey)}
            </span>
            <ul
              aria-labelledby={labelId}
              className="mt-2 flex flex-wrap gap-1 lg:flex-col lg:gap-0.5"
            >
              {group.items.map(({ href, key }) => {
                const active = isAdminNavItemActive(href, pathname);
                const waiting = counts[key] ?? 0;
                const countId = `admin-nav-count-${key}`;
                return (
                  <li key={key}>
                    <Link
                      href={href}
                      aria-current={active ? 'page' : undefined}
                      // EXPLICIT LINK (RGAA 6.1). "Événements", "Jeunes",
                      // "Newsletter" ALSO exist in the public header, pointing to
                      // other pages: measured in the 27/09 audit, a list of the
                      // links of `/admin/utilisateurs` showed two of each,
                      // with nothing to tell them apart (the landmark name is not
                      // context in the RGAA sense). The name starts with the visible
                      // text (WCAG 2.5.3) and states the targeted area.
                      aria-label={`${t(key)} (${t('title')})`}
                      aria-describedby={waiting > 0 ? countId : undefined}
                      className={`flex items-center justify-between gap-2 rounded-sm px-2.5 py-1.5 text-sm transition-colors ${
                        active
                          ? 'bg-accent-tint font-medium text-accent-text'
                          : 'text-ink-soft hover:bg-surface-2 hover:text-ink'
                      }`}
                    >
                      {t(key)}
                      {waiting > 0 ? (
                        <Badge aria-hidden="true" variant="solid" size="count">
                          {waiting > 99 ? '99+' : waiting}
                        </Badge>
                      ) : null}
                    </Link>
                    {waiting > 0 ? (
                      <span id={countId} className="sr-only">
                        {t('navWaiting', { count: waiting })}
                      </span>
                    ) : null}
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
