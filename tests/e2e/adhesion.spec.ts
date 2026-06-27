import { test, expect } from '@playwright/test';

test.use({ locale: 'fr-FR' });

test('adhésion : sections maquette + estimateur solidaire (F-20)', async ({
  page,
}) => {
  await page.goto('/fr/adhesion');

  // En-tête conservé + pills
  await expect(
    page.getByRole('heading', { level: 1, name: 'Rejoindre le réseau' }),
  ).toBeVisible();
  await expect(page.getByText('Cotisation solidaire', { exact: true })).toBeVisible();

  // Intro + estimateur
  await expect(
    page.getByRole('heading', { name: "Choisir un type d'adhésion" }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Estimateur de tarif solidaire' }),
  ).toBeVisible();
  // défaut : organisation, revenu élevé, EUR -> 1 200 EUR
  // (séparateur de milliers FR = U+202F ; \s le couvre)
  await expect(page.getByText(/^1\s?200$/)).toBeVisible();
  // bascule devise XOF -> 786 000
  await page.getByText("Franc CFA (Afrique de l'Ouest)").click();
  await expect(page.getByText(/^786\s?000$/)).toBeVisible();
  // bascule revenu faible (org, low, XOF) -> 300 * 655 = 196 500
  await page.getByText('Revenu modeste').click();
  await expect(page.getByText(/^196\s?500$/)).toBeVisible();

  // Comparatif + FAQ
  await expect(
    page.getByRole('heading', { name: 'Ce qui est inclus, par type' }),
  ).toBeVisible();
  await expect(
    page.getByRole('rowheader', { name: /Profil public sur l'annuaire/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Questions fréquentes' }),
  ).toBeVisible();
  // FAQ : déplier la première question
  await page.getByText('Comment fonctionne la cotisation solidaire ?').click();
  await expect(page.getByText(/contribuent à la hauteur de leurs moyens/)).toBeVisible();
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
