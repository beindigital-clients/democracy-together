import { test, expect } from '@playwright/test';
import { SESSIONS } from './_sessions';

// F-26 — Back office: the 13 screens, reached through the tab bar.
// Until now only one was visited; the other 12 could break (renamed
// query, overly strict role guard, blank page) without any test
// flinching. This file covers access and rendering; the screens that WRITE are
// exercised end to end in `admin-moderation.spec.ts`,
// `admin.spec.ts` (applications) and `library-submit.spec.ts` (publications).
test.use({ locale: 'fr-FR' });

// `nav` = tab label, `h1` = the screen's own title (the two
// often differ), `min` = minimal role to which the tab is offered.
const SCREENS = [
  {
    path: '/fr/admin',
    nav: 'Tableau de bord',
    h1: 'Tableau de bord',
    min: 'moderateur',
  },
  {
    path: '/fr/admin/impact',
    nav: 'Impact',
    h1: "Mesure d'impact",
    min: 'moderateur',
  },
  {
    path: '/fr/admin/candidatures',
    nav: 'Candidatures',
    h1: 'Candidatures',
    min: 'moderateur',
  },
  {
    path: '/fr/admin/publications',
    nav: 'Publications',
    h1: 'Publications',
    min: 'moderateur',
  },
  {
    path: '/fr/admin/evenements',
    nav: 'Événements',
    h1: 'Inscriptions aux événements',
    min: 'moderateur',
  },
  {
    path: '/fr/admin/jeunes',
    nav: 'Jeunes',
    h1: 'Candidatures jeunes',
    min: 'moderateur',
  },
  {
    path: '/fr/admin/mentorat',
    nav: 'Mentorat',
    h1: 'Demandes de mentorat',
    min: 'moderateur',
  },
  {
    path: '/fr/admin/projets',
    nav: 'Projets',
    h1: 'Propositions de projets',
    min: 'moderateur',
  },
  // REVIEWER view (campaign of 27/09, A-02): open at moderator rank,
  // it only renders their assignments — the full queue stays with the editor.
  {
    path: '/fr/admin/mes-relectures',
    nav: 'Mes relectures',
    h1: 'Mes relectures',
    min: 'moderateur',
  },
  {
    path: '/fr/admin/signalements',
    nav: 'Signalements',
    h1: 'Signalements de la tribune',
    min: 'moderateur',
  },
  {
    path: '/fr/admin/revue',
    nav: 'Comité de lecture',
    h1: 'Revue à comité de lecture',
    min: 'editeur',
  },
  {
    path: '/fr/admin/newsletter',
    nav: 'Newsletter',
    h1: 'Newsletter',
    min: 'editeur',
  },
  {
    path: '/fr/admin/moderation-ia',
    nav: 'Modération IA',
    h1: 'Modération assistée par IA',
    min: 'admin',
  },
  {
    path: '/fr/admin/utilisateurs',
    nav: 'Utilisateurs',
    h1: 'Utilisateurs',
    min: 'admin',
  },
  {
    path: '/fr/admin/journal',
    nav: 'Journal',
    h1: "Journal d'activité",
    min: 'admin',
  },
] as const;

test.describe('parcours des onglets (session admin partagée)', () => {
  test.use({ storageState: SESSIONS.admin.state });

  test('back-office : les 13 écrans sont atteignables depuis la barre d’onglets (F-26)', async ({
    page,
  }) => {
    await page.goto('/fr/admin');
    const tabs = page.getByRole('navigation', { name: 'Administration' });

    for (const screen of SCREENS) {
      await tabs
        .getByRole('link', {
          name: `${screen.nav} (Administration)`,
          exact: true,
        })
        .click();
      await expect(page).toHaveURL(
        new RegExp(`${screen.path.replace('/fr', '')}$`),
      );
      await expect(
        page.getByRole('heading', { level: 1, name: screen.h1 }),
      ).toBeVisible();
      // the current tab is indicated (and only it)
      await expect(
        tabs.getByRole('link', {
          name: `${screen.nav} (Administration)`,
          exact: true,
        }),
      ).toHaveAttribute('aria-current', 'page');
    }
  });
});

test.describe('cloisonnement par rôle (session modérateur partagée)', () => {
  test.use({ storageState: SESSIONS.moderateur.state });

  test('back-office : un modérateur ne voit ni ne peut lire les écrans admin/éditeur (F-26/F-63)', async ({
    page,
  }) => {
    await page.goto('/fr/admin');
    const tabs = page.getByRole('navigation', { name: 'Administration' });
    await expect(
      page.getByRole('heading', { level: 1, name: 'Tableau de bord' }),
    ).toBeVisible();

    for (const screen of SCREENS) {
      const tab = tabs.getByRole('link', {
        name: `${screen.nav} (Administration)`,
        exact: true,
      });
      if (screen.min === 'moderateur') {
        await expect(tab).toBeVisible();
      } else {
        await expect(tab).toHaveCount(0); // entry not offered
      }
    }

    // Navigation is GROUPED BY DOMAIN (issue #49), and the split by
    // domain coincides with the split by role: the two reserved groups
    // disappear ENTIRELY, without leaving a heading with no content.
    for (const group of ['Pilotage', 'Modération', 'Programmes']) {
      await expect(tabs.getByRole('list', { name: group })).toBeVisible();
    }
    for (const group of ['Édition', 'Automatisation', 'Comptes et audit']) {
      await expect(tabs.getByRole('list', { name: group })).toHaveCount(0);
    }
    await expect(tabs.getByRole('list')).toHaveCount(3);

    // Defense in depth: a URL typed by hand is not enough either.
    // The SHELL refuses the screen (403, rank read from the navigation table)
    // before mounting it, hence before any query — that is what was missing for
    // /admin/revue and /admin/newsletter, which landed on the error page
    // for a moderator (exploration of 27/09). The Convex query would refuse
    // too; it is no longer issued.
    for (const path of [
      '/fr/admin/utilisateurs',
      '/fr/admin/revue',
      '/fr/admin/newsletter',
    ]) {
      await page.goto(path);
      await expect(
        page.getByRole('heading', { name: 'Accès réservé' }),
      ).toBeVisible();
    }
  });
});
