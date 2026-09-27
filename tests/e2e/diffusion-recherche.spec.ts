import { test, expect } from '@playwright/test';
import { backfillSearch, seedDirectory } from './_helpers';
import { ouvrirPanneau } from './_panneau';

test.use({ locale: 'fr-FR' });

// RECHERCHE SUR INDEX (F-06 / F-34, chantier diffusion).
//
// S'appuie sur les publications seedées (bibliothèque) et l'annuaire seedé —
// comme `search.spec.ts`. Les documents seedés AVANT les index `search_text`
// n'ont pas de meule : la migration (idempotente) la remplit d'abord, comme
// elle le fait pour un déploiement existant.
test.beforeAll(async () => {
  await seedDirectory();
  await backfillSearch();
});

test('« democratie » (sans accent) trouve « démocratie » — palette et page', async ({
  page,
}) => {
  // Page de résultats : la même liste avec et sans accents.
  await page.goto('/fr/recherche?q=d%C3%A9mocratie');
  const avecAccent = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Publications' }) })
    .first();
  await expect(avecAccent).toBeVisible();
  const titresAvec = await avecAccent.getByRole('link').allInnerTexts();
  expect(titresAvec.length).toBeGreaterThan(0);

  await page.goto('/fr/recherche?q=democratie');
  const sansAccent = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Publications' }) })
    .first();
  await expect(sansAccent).toBeVisible();
  const titresSans = await sansAccent.getByRole('link').allInnerTexts();
  expect(titresSans.slice(0, 3)).toEqual(titresAvec.slice(0, 3));
  // Au moins un titre porte réellement l'accent : c'est bien le repli qui
  // a trouvé, pas une coïncidence de graphie.
  expect(
    [...titresSans, ...titresAvec].some((t) => /d[ée]mocrati/i.test(t)),
  ).toBe(true);

  // Palette (en-tête) : même terme, même résultat.
  await page.goto('/fr');
  const dialog = page.getByRole('dialog', { name: 'Rechercher sur le site' });
  await ouvrirPanneau(
    page.getByRole('banner').getByRole('button', { name: 'Recherche' }),
    dialog,
    'palette de recherche',
  );
  await dialog.getByRole('combobox').fill('democratie');
  // Un GROUPE d'options nommé, et non un titre : le `listbox` ne contient que
  // des groupes et des options (audit RGAA du 27/09, 7.1).
  await expect(
    dialog.getByRole('group', { name: 'Publications' }),
  ).toBeVisible();
  await expect(dialog.getByRole('option').first()).toBeVisible();
});

test('filtres et pagination de /recherche (F-34)', async ({ page }) => {
  // Filtre « type » : seules les publications restent (les membres n'ont pas
  // de type), et l'URL porte le filtre.
  await page.goto('/fr/recherche?q=democratie&type=rapport');
  await expect(
    page.getByRole('heading', { name: 'Membres du réseau' }),
  ).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Type' })).toHaveValue(
    'rapport',
  );

  // Vue d'une section seule : paginée, avec retour à la vue d'ensemble.
  await page.goto('/fr/recherche?q=democratie&source=publications');
  await expect(
    page.getByRole('link', { name: /Toutes les sections/ }),
  ).toBeVisible();
});
