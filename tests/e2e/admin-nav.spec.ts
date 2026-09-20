import { test, expect, type Locator, type Page } from '@playwright/test';
import { SESSIONS } from './_sessions';

test.use({ locale: 'fr-FR' });

// NAVIGATION DU BACK-OFFICE (issue #49) — la forme, mesurée.
//
// Le critère de l'issue est littéralement géométrique : « la navigation reste
// lisible sans défilement horizontal ». Ce n'est pas vérifiable par un test de
// composant (happy-dom ne met pas en page) ni par `toBeVisible()`, qui est vrai
// d'un lien hors écran dans un conteneur à défilement — c'était exactement
// l'état d'avant. Il faut un vrai navigateur et une vraie largeur.
//
// POURQUOI CE FICHIER N'EST PAS DANS `tests/e2e/mobile/`. La convention du
// dépôt (TESTING.md) y place les parcours dont le viewport ET le tactile
// viennent du projet `mobile-chromium`. Or ce projet ne dépend pas de `setup` :
// il n'a pas les sessions partagées, et le back-office exige une session
// admin. Ce qui est mesuré ici est une largeur, pas un geste — le viewport est
// donc posé par le fichier, et la session vient du projet `chromium`.

const PHONE = { width: 412, height: 839 };

// Les quatorze entrées de l'issue, telles qu'elles s'affichent.
const ALL_ITEMS = [
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
  'Comité de lecture',
  'Newsletter',
  'Utilisateurs',
  'Journal',
];

const GROUPS = [
  'Pilotage',
  'Modération',
  'Programmes',
  'Édition',
  'Comptes et audit',
];

function nav(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Administration' });
}

// Aucune entrée hors écran, et aucun conteneur qui défile latéralement.
async function fitsOnScreen(page: Page, width: number) {
  const bar = nav(page);

  const scroll = await bar.evaluate((el) => ({
    scroll: el.scrollWidth,
    client: el.clientWidth,
  }));
  expect(
    scroll.scroll,
    `la navigation défile horizontalement : ${scroll.scroll}px pour ${scroll.client}px`,
  ).toBeLessThanOrEqual(scroll.client + 1);

  for (const item of ALL_ITEMS) {
    const box = await bar
      .getByRole('link', { name: item, exact: true })
      .boundingBox();
    expect(
      box,
      `entrée « ${item} » sans boîte : absente ou masquée`,
    ).not.toBeNull();
    expect(box!.x, `« ${item} » commence hors écran`).toBeGreaterThanOrEqual(
      -1,
    );
    expect(
      box!.x + box!.width,
      `« ${item} » dépasse la largeur de l'écran`,
    ).toBeLessThanOrEqual(width + 1);
  }

  const page_ = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(page_.scroll).toBeLessThanOrEqual(page_.client + 1);
}

test.describe('navigation du back-office sur téléphone (session dédiée)', () => {
  test.use({ storageState: SESSIONS.adminNav.state, viewport: PHONE });

  test('back-office : les 14 entrées tiennent sans défilement horizontal (F-26)', async ({
    page,
  }) => {
    await page.goto('/fr/admin');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Tableau de bord' }),
    ).toBeVisible();
    await fitsOnScreen(page, PHONE.width);
  });

  test('back-office : les entrées sont regroupées par domaine (F-26)', async ({
    page,
  }) => {
    await page.goto('/fr/admin');
    for (const group of GROUPS) {
      // Le titre de groupe nomme sa liste (`aria-labelledby`) : c'est ce qui
      // rend le regroupement perceptible autrement que visuellement.
      await expect(nav(page).getByRole('list', { name: group })).toBeVisible();
    }
  });
});

test.describe('navigation du back-office en large (session dédiée)', () => {
  test.use({ storageState: SESSIONS.adminNav.state });

  test('back-office : colonne latérale, sans défilement horizontal (F-26)', async ({
    page,
    viewport,
  }) => {
    await page.goto('/fr/admin/journal');
    await expect(
      page.getByRole('heading', { level: 1, name: "Journal d'activité" }),
    ).toBeVisible();
    await fitsOnScreen(page, viewport!.width);

    // Les trois acquis que l'issue porte au crédit de l'existant, et qui
    // devaient survivre à la refonte : le nom de la navigation, l'entrée
    // courante signalée — et elle seule —, et le tableau de bord qui ne
    // s'allume pas sur une sous-route.
    const current = nav(page).locator('a[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveText('Journal');
    await expect(
      nav(page).getByRole('link', { name: 'Tableau de bord', exact: true }),
    ).not.toHaveAttribute('aria-current', 'page');
  });
});

// Le REPLI PAR RÔLE — un modérateur ne reçoit que ses trois groupes — est
// vérifié dans `admin-ecrans.spec.ts`, qui tient déjà la session modérateur et
// dont le cloisonnement par rôle est le sujet. Le poser ici ferait de ce
// fichier un TROISIÈME sur cette session, ce que `_sessions.ts` proscrit.
