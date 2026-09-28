import { test, expect } from '@playwright/test';

test.use({ locale: 'fr-FR' });

test('adhésion : sections maquette + estimateur solidaire (F-20)', async ({
  page,
}) => {
  await page.goto('/fr/adhesion');

  // Header kept + pills
  await expect(
    page.getByRole('heading', { level: 1, name: 'Rejoindre le réseau' }),
  ).toBeVisible();
  await expect(
    page.getByText('Cotisation solidaire', { exact: true }),
  ).toBeVisible();

  // Intro + estimator
  await expect(
    page.getByRole('heading', { name: "Choisir un type d'adhésion" }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Estimateur de tarif solidaire' }),
  ).toBeVisible();
  // default: organization, high income -> 1,200 EUR (EUR payment only)
  // (FR thousands separator = U+202F; \s covers it)
  await expect(page.getByText(/^1\s?200$/)).toBeVisible();
  // switch to low income (org, low) -> 1200 * 0.25 = 300 EUR
  await page.getByText('Revenu modeste').click();
  await expect(page.getByText(/^300$/)).toBeVisible();

  // Comparison + FAQ
  await expect(
    page.getByRole('heading', { name: 'Ce qui est inclus, par type' }),
  ).toBeVisible();
  await expect(
    page.getByRole('rowheader', { name: /Profil public sur l'annuaire/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Questions fréquentes' }),
  ).toBeVisible();
  // FAQ: expand the first question
  await page.getByText('Comment fonctionne la cotisation solidaire ?').click();
  await expect(
    page.getByText(/contribuent à la hauteur de leurs moyens/),
  ).toBeVisible();
});

test('adhésion : version EN (F-03/F-20)', async ({ page }) => {
  await page.goto('/en/adhesion');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Join the network' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Solidarity pricing estimator' }),
  ).toBeVisible();
});
