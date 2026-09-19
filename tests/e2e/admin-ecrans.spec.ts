import { test, expect } from '@playwright/test';
import { signUpAndVerify, elevateRole, E2E_PASSWORD } from './_helpers';

// F-26 — Back-office : les 13 écrans, atteints par la barre d'onglets.
// Jusqu'ici un seul était parcouru ; les 12 autres pouvaient tomber (requête
// renommée, garde de rôle trop stricte, page blanche) sans qu'aucun test ne
// bronche. Ce fichier couvre l'accès et le rendu ; les écrans qui ÉCRIVENT sont
// exercés bout en bout dans `admin-moderation.spec.ts`,
// `admin.spec.ts` (candidatures) et `library-submit.spec.ts` (publications).
test.use({ locale: 'fr-FR' });

// `nav` = libellé de l'onglet, `h1` = titre propre de l'écran (les deux
// diffèrent souvent), `min` = rôle minimal auquel l'onglet est proposé.
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

test('back-office : les 13 écrans sont atteignables depuis la barre d’onglets (F-26)', async ({
  page,
}) => {
  const email = `e2e_bo_tour_${Date.now()}@democracytogether.test`;
  await signUpAndVerify(page, email, E2E_PASSWORD);
  await elevateRole(email, 'admin');

  await page.goto('/fr/admin');
  const tabs = page.getByRole('navigation', { name: 'Administration' });

  for (const screen of SCREENS) {
    await tabs.getByRole('link', { name: screen.nav, exact: true }).click();
    await expect(page).toHaveURL(
      new RegExp(`${screen.path.replace('/fr', '')}$`),
    );
    await expect(
      page.getByRole('heading', { level: 1, name: screen.h1 }),
    ).toBeVisible();
    // l'onglet courant est signalé (et lui seul)
    await expect(
      tabs.getByRole('link', { name: screen.nav, exact: true }),
    ).toHaveAttribute('aria-current', 'page');
  }
});

test('back-office : un modérateur ne voit ni ne peut lire les écrans admin/éditeur (F-26/F-63)', async ({
  page,
}) => {
  const email = `e2e_bo_mod_${Date.now()}@democracytogether.test`;
  await signUpAndVerify(page, email, E2E_PASSWORD);
  await elevateRole(email, 'moderateur');

  await page.goto('/fr/admin');
  const tabs = page.getByRole('navigation', { name: 'Administration' });
  await expect(
    page.getByRole('heading', { level: 1, name: 'Tableau de bord' }),
  ).toBeVisible();

  for (const screen of SCREENS) {
    const tab = tabs.getByRole('link', { name: screen.nav, exact: true });
    if (screen.min === 'moderateur') {
      await expect(tab).toBeVisible();
    } else {
      await expect(tab).toHaveCount(0); // onglet non proposé
    }
  }

  // Défense en profondeur : l'URL saisie à la main ne suffit pas non plus —
  // l'écran refuse de rendre la liste (et la requête Convex la refuserait aussi).
  await page.goto('/fr/admin/utilisateurs');
  await expect(page.getByText('Réservé aux administrateurs.')).toBeVisible();
});
