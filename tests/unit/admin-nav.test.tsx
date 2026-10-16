// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr.json';
import {
  AdminNav,
  ADMIN_NAV_GROUPS,
  adminMinRoleForPath,
  adminPathRequiresReviewChief,
  filterAdminNavGroups,
  isAdminNavItemActive,
  type AdminNavGroup,
  visibleAdminNavGroups,
} from '@/components/admin/admin-nav';
import { ROLE_ORDER, type NetworkRole } from '@/lib/roles';

// No global setupFiles in this project: without this cleanup, renders
// accumulate from one test to the next and labels become ambiguous.
afterEach(cleanup);

// BACK-OFFICE NAVIGATION (issue #49).
//
// Two things to uphold, and they do not overlap:
//
//  — the SHAPE changed (fourteen entries in horizontal scrolling -> groups
//    by domain in a column). That is the subject of the issue;
//  — the WIRING must NOT change: `aria-label` on the `<nav>`,
//    `aria-current="page"` on the current entry, and the dashboard handled
//    separately so that it does not light up on its sub-routes. The issue credits
//    this to the existing code; this file is what keeps it from disappearing with
//    the redesign.
//
// Hence tests on both: the rendered structure, and the ARIA invariants.

function renderNav(role: NetworkRole, pathname = '/admin') {
  render(
    <NextIntlClientProvider locale="fr" messages={messages}>
      <AdminNav role={role} pathname={pathname} />
    </NextIntlClientProvider>,
  );
  return screen.getByRole('navigation', { name: 'Administration' });
}

// The issue's fourteen entries, by the label they carry on screen,
// plus the fifteenth added since ("Modération IA", reserved for the
// administrator) and the sixteenth ("Mes relectures", the view for the
// moderator-rank reviewer — 27/09 campaign, A-02), then "Organisations" (the
// review of profiles proposed by organization managers, F-21,
// accounts workstream — a moderation task). The total is reasserted
// below: an entry added without going through here makes the test fail,
// which is the point of this file.
const STAFF_ITEMS = [
  'Tableau de bord',
  'Impact',
  'Candidatures',
  'Publications',
  // Tribune moderation queue (community workstream), moderator rank.
  'File de modération',
  'Signalements',
  // Reported private messages ("social" workstream), moderator rank.
  'Messages signalés',
  'Messages',
  'Organisations',
  'Jeunes',
  'Mentorat',
  'Projets',
  'Événements',
];
// "Contenus" ("contenus" workstream, F-62): editor rank.
const EDITOR_ITEMS = [
  'Rapports annuels',
  'Newsletter',
  'Contenus',
  'Boîte à outils',
];
// "Modération IA" joins the administrator-only entries: what
// it controls is not moderation, it is the decision to do without it
// (see the `automatisation` group in admin-nav.tsx).
const ADMIN_ITEMS = ['Modération IA', 'Finances', 'Utilisateurs', 'Journal'];
// KOHOP's queue is reserved to review chiefs and administrators: an editor
// WITHOUT the function does not see it, an administrator always does.
const KOHOP_ITEMS = ['KOHOP'];

// The entries' accessible NAME specifies the area (RGAA 6.1, see admin-nav.tsx):
// "Publications (Administration)". The VISIBLE text remains the bare
// label — that is what `linkNames` compares.
function linkNames(nav: HTMLElement): string[] {
  return within(nav)
    .getAllByRole('link')
    .map((a) => a.textContent ?? '');
}

// Total number of entries: derived from the three named lists above, so
// that adding a screen forces naming it in ITS list (rank), without having to
// touch a counter at every workstream — the lists themselves remain the
// specification.
// F-43's entries ("Comité de lecture", the reviewer's "Mes relectures") are
// HIDDEN since KOHOP opened (D-13): still in the table, never on the bar.
const LEGACY_HIDDEN = ['Comité de lecture', 'Mes relectures'];
const ALL_COUNT =
  STAFF_ITEMS.length +
  EDITOR_ITEMS.length +
  ADMIN_ITEMS.length +
  KOHOP_ITEMS.length;
const TABLE_COUNT = ALL_COUNT + LEGACY_HIDDEN.length;

describe('Navigation du back-office — entrées selon le rôle (issue #49)', () => {
  it('un modérateur voit les 12 entrées communes, et aucune entrée réservée', () => {
    const nav = renderNav('moderateur');
    expect(linkNames(nav).sort()).toEqual([...STAFF_ITEMS].sort());
    for (const reserved of [...EDITOR_ITEMS, ...ADMIN_ITEMS]) {
      expect(
        within(nav).queryByRole('link', {
          name: `${reserved} (Administration)`,
        }),
      ).toBeNull();
    }
  });

  it('un éditeur ajoute newsletter, contenus et rapports, sans les entrées admin', () => {
    const nav = renderNav('editeur');
    expect(linkNames(nav).sort()).toEqual(
      [...STAFF_ITEMS, ...EDITOR_ITEMS].sort(),
    );
    for (const reserved of ADMIN_ITEMS) {
      expect(
        within(nav).queryByRole('link', {
          name: `${reserved} (Administration)`,
        }),
      ).toBeNull();
    }
  });

  it('un administrateur voit toutes les entrées attendues', () => {
    const nav = renderNav('admin');
    const expected = [
      ...STAFF_ITEMS,
      ...EDITOR_ITEMS,
      ...ADMIN_ITEMS,
      ...KOHOP_ITEMS,
    ];
    expect(expected).toHaveLength(ALL_COUNT);
    expect(linkNames(nav).sort()).toEqual([...expected].sort());
  });

  it("un rôle en dessous de modérateur n'obtient aucune entrée", () => {
    // The `<nav>` itself is not mounted for these roles (the shell refuses
    // earlier), but the visibility rule must not depend on that.
    for (const role of ['visiteur', 'membre'] as const) {
      expect(visibleAdminNavGroups(role)).toEqual([]);
    }
  });

  it('les entrées sont réparties en groupes nommés, chaque groupe nommant sa liste', () => {
    const nav = renderNav('admin');
    const lists = within(nav).getAllByRole('list');
    expect(lists).toHaveLength(ADMIN_NAV_GROUPS.length);

    const labels = [
      'Pilotage',
      'Modération',
      'Programmes',
      'Édition',
      'Automatisation',
      'Trésorerie',
      'Comptes et audit',
    ];
    for (const label of labels) {
      // The group heading is linked to its list via `aria-labelledby`: the name
      // is therefore announced, without introducing an `<h2>` before the screen's `<h1>`.
      expect(within(nav).getByRole('list', { name: label })).toBeTruthy();
    }
    // No entry outside a group: the sum of the lists does yield all the links.
    const grouped = lists.flatMap((l) => within(l).getAllByRole('link'));
    expect(grouped).toHaveLength(ALL_COUNT);
  });

  it('ne défile plus horizontalement : aucun conteneur en overflow-x', () => {
    // This is THE defect the issue describes — most entries off screen
    // with no hint that scrolling is needed. The test targets the class because
    // it is what produced the behavior, and happy-dom does not do
    // layout.
    const nav = renderNav('admin');
    expect(nav.className).not.toMatch(/overflow-x/);
    for (const el of nav.querySelectorAll('*')) {
      expect(el.className.toString()).not.toMatch(/overflow-x/);
    }
    // And the entries wrap instead of lining up endlessly.
    for (const list of within(nav).getAllByRole('list')) {
      expect(list.className).toMatch(/flex-wrap/);
    }
  });
});

describe('Navigation du back-office — entrée courante (issue #49)', () => {
  it("marque l'entrée courante, et elle seule", () => {
    const nav = renderNav('admin', '/admin/utilisateurs');
    const current = within(nav)
      .getAllByRole('link')
      .filter((a) => a.getAttribute('aria-current') === 'page');
    expect(current.map((a) => a.textContent)).toEqual(['Utilisateurs']);
  });

  it('une sous-route allume son entrée de section', () => {
    const nav = renderNav('admin', '/admin/publications/en-attente');
    expect(
      within(nav)
        .getByRole('link', { name: 'Publications (Administration)' })
        .getAttribute('aria-current'),
    ).toBe('page');
  });

  it("le tableau de bord ne s'allume PAS sur les sous-routes", () => {
    // Its path is the prefix of all the others: a `startsWith` would make it
    // current everywhere in the back office. The issue credits this handling
    // to the existing code — it survives the redesign.
    expect(isAdminNavItemActive('/admin', '/admin')).toBe(true);
    expect(isAdminNavItemActive('/admin', '/admin/journal')).toBe(false);
    expect(isAdminNavItemActive('/admin/journal', '/admin/journal')).toBe(true);

    const nav = renderNav('admin', '/admin/journal');
    expect(
      within(nav)
        .getByRole('link', { name: 'Tableau de bord (Administration)' })
        .getAttribute('aria-current'),
    ).toBeNull();
  });

  it('hors du back-office, aucune entrée n’est courante', () => {
    const nav = renderNav('admin', '/espace-membre');
    expect(
      within(nav)
        .getAllByRole('link')
        .filter((a) => a.hasAttribute('aria-current')),
    ).toEqual([]);
  });
});

describe('Navigation du back-office — cohérence de la table (issue #49)', () => {
  it('chaque groupe exige un rôle du vocabulaire partagé, et pointe vers /admin', () => {
    for (const group of ADMIN_NAV_GROUPS) {
      expect(ROLE_ORDER).toContain(group.minRole);
      // The heading key is written out in full (issue #33 guard), and it does
      // derive from the group: no copy that could diverge.
      expect(group.labelKey).toBe(`navGroup_${group.key}`);
      expect(group.items.length).toBeGreaterThan(0);
      for (const item of group.items) {
        expect(item.href.startsWith('/admin')).toBe(true);
      }
    }
  });

  it('aucun chemin ni aucune clé de libellé en double', () => {
    const items = ADMIN_NAV_GROUPS.flatMap((g) => g.items);
    expect(items).toHaveLength(TABLE_COUNT);
    expect(new Set(items.map((i) => i.href)).size).toBe(TABLE_COUNT);
    expect(new Set(items.map((i) => i.key)).size).toBe(TABLE_COUNT);
  });

  it('chaque libellé et chaque titre de groupe est traduit, en français comme en anglais', async () => {
    // A missing label would render the raw key rather than throw: the
    // check is therefore done on the messages themselves, in both
    // languages — it is an everyday working screen, not a showcase page.
    const en = (await import('@/messages/en.json')).default;
    for (const dict of [messages.admin, en.admin] as Record<string, string>[]) {
      for (const group of ADMIN_NAV_GROUPS) {
        expect(dict[group.labelKey]).toBeTruthy();
        for (const item of group.items) expect(dict[item.key]).toBeTruthy();
      }
    }
  });
});

// Minimum rank of a SCREEN, read by the shell before mounting the page. A
// moderator who typed /admin/revue or /admin/newsletter landed on the error
// page ("éditeur" query thrown before any guard) — measured on 27/09.
describe('adminMinRoleForPath', () => {
  it('reprend le rang du groupe de navigation qui porte le chemin', () => {
    expect(adminMinRoleForPath('/admin')).toBe('moderateur');
    expect(adminMinRoleForPath('/admin/candidatures')).toBe('moderateur');
    // The reviewer view is open to moderator rank (27/09, A-02) — the
    // full queue stays with the editor. The two paths are not
    // prefixes of each other.
    expect(adminMinRoleForPath('/admin/mes-relectures')).toBe('moderateur');
    expect(adminMinRoleForPath('/admin/revue')).toBe('editeur');
    expect(adminMinRoleForPath('/admin/newsletter')).toBe('editeur');
    expect(adminMinRoleForPath('/admin/utilisateurs')).toBe('admin');
    expect(adminMinRoleForPath('/admin/journal')).toBe('admin');
    expect(adminMinRoleForPath('/admin/moderation-ia')).toBe('admin');
    expect(adminMinRoleForPath('/admin/finances')).toBe('admin');
    // The rate scale inherits the Finances screen's rank.
    expect(adminMinRoleForPath('/admin/finances/formules')).toBe('admin');
  });

  it('un sous-chemin hérite du rang de son écran ; un chemin inconnu vaut le rang de la coquille', () => {
    expect(adminMinRoleForPath('/admin/utilisateurs/')).toBe('admin');
    expect(adminMinRoleForPath('/admin/revue/abc')).toBe('editeur');
    expect(adminMinRoleForPath('/admin/inconnu')).toBe('moderateur');
  });

  it('est cohérent avec la barre : ce qu’elle cache à un rôle, la coquille le refuse', () => {
    for (const role of ROLE_ORDER) {
      // Rank only: the review-chief condition is exercised below, so every
      // account is treated as holding the function here.
      const visible = new Set(
        visibleAdminNavGroups(role, true).flatMap((g) =>
          g.items.map((i) => i.href),
        ),
      );
      for (const item of ADMIN_NAV_GROUPS.flatMap((g) => g.items)) {
        // Hidden from everyone by decision (D-13), though the shell still guards it.
        if (item.legacyReview) continue;
        const allowed =
          ROLE_ORDER.indexOf(role) >=
          ROLE_ORDER.indexOf(adminMinRoleForPath(item.href));
        expect(allowed).toBe(visible.has(item.href));
      }
    }
  });
});

// REVIEW CHIEF CONDITION (KOHOP). The review chief is a function, not a rank:
// an entry can ask for it IN ADDITION to the group's minimum rank. The rule is
// exercised on a table of its own, then on the real one (KOHOP's queue).
describe('Navigation du back-office — entrées réservées au chef de revue', () => {
  const GROUPS: readonly AdminNavGroup[] = [
    {
      key: 'edition',
      labelKey: 'navGroup_edition',
      minRole: 'moderateur',
      items: [
        { href: '/admin/revue', key: 'review' },
        { href: '/admin/kohop', key: 'kohop', requiresReviewChief: true },
      ],
    },
    {
      key: 'solo',
      labelKey: 'navGroup_comptes',
      minRole: 'moderateur',
      items: [{ href: '/admin/x', key: 'x', requiresReviewChief: true }],
    },
  ];
  const keys = (role: NetworkRole, reviewChief: boolean) =>
    filterAdminNavGroups(GROUPS, role, reviewChief).flatMap((g) =>
      g.items.map((i) => i.key),
    );

  it('un modérateur sans la fonction ne voit pas l’entrée, ni le groupe qu’elle laisserait vide', () => {
    expect(keys('moderateur', false)).toEqual(['review']);
    expect(
      filterAdminNavGroups(GROUPS, 'moderateur', false).map((g) => g.key),
    ).toEqual(['edition']);
  });

  it('un chef de revue la voit, en plus du rang minimal', () => {
    expect(keys('moderateur', true)).toEqual(['review', 'kohop', 'x']);
    expect(keys('editeur', true)).toEqual(['review', 'kohop', 'x']);
  });

  it('l’administrateur la voit sans avoir la fonction', () => {
    expect(keys('admin', false)).toEqual(['review', 'kohop', 'x']);
  });

  it('la fonction ne remplace pas le rang du groupe', () => {
    expect(keys('membre', true)).toEqual([]);
  });

  it('l’entrée KOHOP de la barre réelle est réservée au chef de revue et à l’administrateur', () => {
    const hrefs = (role: NetworkRole, chief: boolean) =>
      visibleAdminNavGroups(role, chief).flatMap((g) =>
        g.items.map((i) => i.href),
      );
    expect(hrefs('moderateur', false)).not.toContain('/admin/kohop');
    expect(hrefs('editeur', false)).not.toContain('/admin/kohop');
    // A moderator holding the function sees it, below the `edition` group's rank.
    expect(hrefs('moderateur', true)).toContain('/admin/kohop');
    expect(hrefs('admin', false)).toContain('/admin/kohop');
    expect(adminPathRequiresReviewChief('/admin/kohop')).toBe(true);
    expect(adminPathRequiresReviewChief('/admin/kohop/abc')).toBe(true);
    expect(adminMinRoleForPath('/admin/kohop')).toBe('moderateur');
    expect(adminPathRequiresReviewChief('/admin/publications')).toBe(false);
    expect(adminPathRequiresReviewChief('/admin/inconnu')).toBe(false);
  });
});
