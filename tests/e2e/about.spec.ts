import { test, expect } from '@playwright/test';

test.use({ locale: 'fr-FR' });

test('à propos : sections + fondateurs (F-11 / F-12)', async ({ page }) => {
  await page.goto('/fr/a-propos');

  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Relier les think tanks',
  );
  await expect(page.getByText('Notre vision')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Philippe Kourilsky' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Pierre Vimont' }),
  ).toBeVisible();
  await expect(page.getByText('Gouvernance & structure')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Rejoindre le réseau' }),
  ).toBeVisible();
});

test('à propos : accessible depuis la nav (F-04)', async ({ page }) => {
  await page.goto('/fr');
  await page.getByRole('link', { name: 'À propos', exact: true }).click();
  await expect(page).toHaveURL(/\/fr\/a-propos$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('à propos en anglais (F-03)', async ({ page }) => {
  await page.goto('/en/a-propos');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Connecting the think tanks',
  );
  await expect(
    page.getByRole('heading', { name: 'The people who carry the network' }),
  ).toBeVisible();
});
