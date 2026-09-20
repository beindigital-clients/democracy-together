// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr.json';
import {
  AdminNav,
  ADMIN_NAV_GROUPS,
  isAdminNavItemActive,
  visibleAdminNavGroups,
} from '@/components/admin/admin-nav';
import { ROLE_ORDER, type NetworkRole } from '@/lib/roles';

// Pas de setupFiles global dans ce projet : sans ce cleanup, les rendus
// s'accumulent d'un test à l'autre et les libellés deviennent ambigus.
afterEach(cleanup);

// NAVIGATION DU BACK-OFFICE (issue #49).
//
// Deux choses à tenir, et elles ne se recouvrent pas :
//
//  — la FORME a changé (quatorze entrées en défilement horizontal -> groupes
//    par domaine en colonne). C'est le sujet de l'issue ;
//  — le CÂBLAGE ne doit PAS changer : `aria-label` sur le `<nav>`,
//    `aria-current="page"` sur l'entrée courante, et le tableau de bord traité
//    à part pour ne pas s'allumer sur ses sous-routes. L'issue le porte au
//    crédit de l'existant ; ce fichier est ce qui l'empêche de disparaître avec
//    la refonte.
//
// D'où des tests sur les deux : la structure rendue, et les invariants ARIA.

function renderNav(role: NetworkRole, pathname = '/admin') {
  render(
    <NextIntlClientProvider locale="fr" messages={messages}>
      <AdminNav role={role} pathname={pathname} />
    </NextIntlClientProvider>,
  );
  return screen.getByRole('navigation', { name: 'Administration' });
}

// Les quatorze entrées de l'issue, par le libellé qu'elles portent à l'écran.
const STAFF_ITEMS = [
  'Tableau de bord',
  'Impact',
  'Candidatures',
  'Publications',
  'Signalements',
  'Messages',
  'Jeunes',
  'Mentorat',
  'Projets',
  'Événements',
];
const EDITOR_ITEMS = ['Comité de lecture', 'Newsletter'];
const ADMIN_ITEMS = ['Utilisateurs', 'Journal'];

function linkNames(nav: HTMLElement): string[] {
  return within(nav)
    .getAllByRole('link')
    .map((a) => a.textContent ?? '');
}

describe('Navigation du back-office — entrées selon le rôle (issue #49)', () => {
  it('un modérateur voit les 10 entrées communes, et aucune entrée réservée', () => {
    const nav = renderNav('moderateur');
    expect(linkNames(nav).sort()).toEqual([...STAFF_ITEMS].sort());
    for (const reserved of [...EDITOR_ITEMS, ...ADMIN_ITEMS]) {
      expect(within(nav).queryByRole('link', { name: reserved })).toBeNull();
    }
  });

  it('un éditeur ajoute revue et newsletter, sans les entrées admin', () => {
    const nav = renderNav('editeur');
    expect(linkNames(nav).sort()).toEqual(
      [...STAFF_ITEMS, ...EDITOR_ITEMS].sort(),
    );
    for (const reserved of ADMIN_ITEMS) {
      expect(within(nav).queryByRole('link', { name: reserved })).toBeNull();
    }
  });

  it('un administrateur voit les 14 entrées attendues', () => {
    const nav = renderNav('admin');
    const expected = [...STAFF_ITEMS, ...EDITOR_ITEMS, ...ADMIN_ITEMS];
    expect(expected).toHaveLength(14);
    expect(linkNames(nav).sort()).toEqual([...expected].sort());
  });

  it("un rôle en dessous de modérateur n'obtient aucune entrée", () => {
    // Le `<nav>` lui-même ne se monte pas pour ces rôles (la coquille refuse
    // avant), mais la règle de visibilité ne doit pas en dépendre.
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
      'Comptes et audit',
    ];
    for (const label of labels) {
      // Le titre du groupe est relié à sa liste par `aria-labelledby` : le nom
      // est donc annoncé, sans introduire un `<h2>` avant le `<h1>` de l'écran.
      expect(within(nav).getByRole('list', { name: label })).toBeTruthy();
    }
    // Aucune entrée hors groupe : la somme des listes rend bien les 14 liens.
    const grouped = lists.flatMap((l) => within(l).getAllByRole('link'));
    expect(grouped).toHaveLength(14);
  });

  it('ne défile plus horizontalement : aucun conteneur en overflow-x', () => {
    // C'est LE défaut que l'issue décrit — la majorité des entrées hors écran
    // sans indice qu'il faut faire défiler. Le test porte sur la classe parce
    // que c'est elle qui produisait le comportement, et que happy-dom ne met
    // pas en page.
    const nav = renderNav('admin');
    expect(nav.className).not.toMatch(/overflow-x/);
    for (const el of nav.querySelectorAll('*')) {
      expect(el.className.toString()).not.toMatch(/overflow-x/);
    }
    // Et les entrées reviennent à la ligne au lieu de s'aligner sans fin.
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
        .getByRole('link', { name: 'Publications' })
        .getAttribute('aria-current'),
    ).toBe('page');
  });

  it("le tableau de bord ne s'allume PAS sur les sous-routes", () => {
    // Son chemin est le préfixe de tous les autres : un `startsWith` le
    // rendrait courant partout dans le back-office. L'issue porte ce traitement
    // au crédit de l'existant — il survit à la refonte.
    expect(isAdminNavItemActive('/admin', '/admin')).toBe(true);
    expect(isAdminNavItemActive('/admin', '/admin/journal')).toBe(false);
    expect(isAdminNavItemActive('/admin/journal', '/admin/journal')).toBe(true);

    const nav = renderNav('admin', '/admin/journal');
    expect(
      within(nav)
        .getByRole('link', { name: 'Tableau de bord' })
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
      expect(group.items.length).toBeGreaterThan(0);
      for (const item of group.items) {
        expect(item.href.startsWith('/admin')).toBe(true);
      }
    }
  });

  it('aucun chemin ni aucune clé de libellé en double', () => {
    const items = ADMIN_NAV_GROUPS.flatMap((g) => g.items);
    expect(items).toHaveLength(14);
    expect(new Set(items.map((i) => i.href)).size).toBe(14);
    expect(new Set(items.map((i) => i.key)).size).toBe(14);
  });

  it('chaque libellé et chaque titre de groupe est traduit, en français comme en anglais', async () => {
    // Un libellé manquant ferait rendre la clé brute plutôt que de lever : la
    // vérification se fait donc sur les messages eux-mêmes, dans les deux
    // langues — c'est un écran de travail quotidien, pas une page vitrine.
    const en = (await import('@/messages/en.json')).default;
    for (const dict of [messages.admin, en.admin] as Record<string, string>[]) {
      for (const group of ADMIN_NAV_GROUPS) {
        expect(dict[`navGroup_${group.key}`]).toBeTruthy();
        for (const item of group.items) expect(dict[item.key]).toBeTruthy();
      }
    }
  });
});
