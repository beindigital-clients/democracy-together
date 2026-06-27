import { test, expect } from '@playwright/test';
import { seedDirectory } from './_helpers';

// Navigateur FR : rend la détection Accept-Language déterministe.
test.use({ locale: 'fr-FR' });

test.beforeAll(async () => {
  await seedDirectory();
});

function cards(page: import('@playwright/test').Page) {
  return page
    .getByRole('list', { name: 'Liste des think tanks' })
    .getByRole('listitem');
}

test('annuaire : liste + filtre par région (F-19)', async ({ page }) => {
  await page.goto('/fr/le-reseau');

  await expect(page.getByRole('heading', { level: 1 })).toContainText('réseau');
  await expect(
    page.getByRole('heading', { name: 'Institut Sahel pour la Gouvernance' }),
  ).toBeVisible();
  expect(await cards(page).count()).toBeGreaterThanOrEqual(8);

  // filtrer sur l'Europe de l'Ouest
  await page.getByRole('link', { name: /Europe de l.Ouest/ }).first().click();
  await expect(page).toHaveURL(/region=europe-ouest/);
  await expect(
    page.getByRole('heading', { name: 'Institut Européen pour la Démocratie' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Institut Sahel pour la Gouvernance' }),
  ).toHaveCount(0);
  await expect(cards(page)).toHaveCount(3);

  // réinitialiser
  await page.getByRole('link', { name: 'Réinitialiser les filtres' }).click();
  await expect(page).toHaveURL(/\/fr\/le-reseau$/);
});

test('annuaire : recherche puis fiche membre (F-21)', async ({ page }) => {
  await page.goto('/fr/le-reseau');

  await page.getByRole('searchbox').fill('Nairobi');
  await page.getByRole('button', { name: 'Rechercher' }).click();
  await expect(page).toHaveURL(/q=Nairobi/);
  await expect(cards(page)).toHaveCount(1);

  // ouvrir la fiche
  await page.getByRole('link', { name: /Nairobi Institute/ }).click();
  await expect(page).toHaveURL(/\/fr\/le-reseau\/nairobi-democratic-futures$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Nairobi Institute',
  );
  await expect(page.getByText('Numérique & démocratie').first()).toBeVisible();
  await expect(
    page.getByRole('link', { name: /Visiter le site/ }),
  ).toBeVisible();

  // retour à l'annuaire
  await page.getByRole('link', { name: /Retour à l.annuaire/ }).click();
  await expect(page).toHaveURL(/\/fr\/le-reseau$/);
});

test('annuaire : état vide (F-19)', async ({ page }) => {
  await page.goto('/fr/le-reseau?q=zzzznexistepas');
  await expect(page.getByText(/Aucun think tank ne correspond/)).toBeVisible();
});

test('fiche : slug inconnu renvoie 404 (F-21)', async ({ page }) => {
  const res = await page.goto('/fr/le-reseau/slug-inconnu-xyz');
  expect(res?.status()).toBe(404);
  await expect(
    page.getByRole('heading', { name: 'Membre introuvable' }),
  ).toBeVisible();
});

test('annuaire en anglais (F-03)', async ({ page }) => {
  await page.goto('/en/le-reseau');
  await expect(
    page.getByRole('link', { name: /Western Europe/ }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Institut Sahel pour la Gouvernance' }),
  ).toBeVisible();
});
