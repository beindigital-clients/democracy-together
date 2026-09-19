import { test, expect } from '@playwright/test';

test.use({ locale: 'fr-FR' });

test('baromètre : toutes les sections de la maquette (F-30)', async ({
  page,
}) => {
  await page.goto('/fr/barometre');

  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Baromètre',
  );
  // KPI illustration
  await expect(page.getByText('pays couverts (illustration)')).toBeVisible();
  // Carte : tuiles + légende (5 niveaux)
  await expect(
    page.getByRole('heading', { name: "L'indice, pays par pays" }),
  ).toBeVisible();
  await expect(page.getByText('Libre', { exact: true }).first()).toBeVisible();
  // Classement : tête de tableau + 1re ligne (Belgique)
  await expect(
    page.getByRole('heading', { name: "Classement de l'indice composite" }),
  ).toBeVisible();
  await expect(page.getByRole('cell', { name: 'Belgique' })).toBeVisible();
  // Fiches pays
  await expect(page.getByRole('heading', { name: 'France' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sénégal' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tunisie' })).toBeVisible();
  // Sous-dimensions (5) + méthodologie + datasets + contrib
  await expect(
    page.getByRole('heading', {
      name: 'Cinq sous-dimensions, alignées sur nos axes',
    }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: "Comment l'indice est construit" }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Télécharger et citer' }),
  ).toBeVisible();
  await expect(page.getByText('10.59000/dt.bar.2026')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Contribuer aux données' }),
  ).toBeVisible();

  // Le CTA de contribution mène à l'adhésion
  await page.getByRole('link', { name: 'Contribuer aux données' }).click();
  await expect(page).toHaveURL(/\/fr\/adhesion$/);
});

test('baromètre : accès via la nav + version EN (F-03/F-30)', async ({
  page,
}) => {
  await page.goto('/fr');
  await page
    .getByRole('banner')
    .getByRole('link', { name: 'Baromètre', exact: true })
    .click();
  await expect(page).toHaveURL(/\/fr\/barometre$/);

  await page.goto('/en/barometre');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Democracy Barometer',
  );
  await expect(
    page.getByText('countries covered (illustration)'),
  ).toBeVisible();
});
