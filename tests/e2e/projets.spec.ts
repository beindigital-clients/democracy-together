import { test, expect } from '@playwright/test';

// F-60 — Appels à projets collaboratifs : page publique qui présente le
// dispositif et invite les membres à proposer un projet. (Test léger : la page
// répond et affiche le bon h1. Le gating membre est couvert par les tests Convex.)

test('appels à projets : la page publique répond (FR)', async ({ page }) => {
  const res = await page.goto('/fr/appels-a-projets');
  expect(res?.status()).toBe(200);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Appels à projets collaboratifs',
    }),
  ).toBeVisible();

  // Un visiteur (non connecté) est invité à adhérer, pas de formulaire ouvert.
  await expect(
    page.getByRole('link', { name: 'Adhérer' }).first(),
  ).toBeVisible();
});

test('appels à projets : version EN (F-03)', async ({ page }) => {
  await page.goto('/en/appels-a-projets');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Collaborative project calls' }),
  ).toBeVisible();
});

test('appels à projets : accessible depuis le pied de page', async ({
  page,
}) => {
  await page.goto('/fr');
  const footerLink = page.locator('footer a[href$="/appels-a-projets"]');
  await expect(footerLink).toBeVisible();
  await footerLink.click();
  await expect(page).toHaveURL(/\/fr\/appels-a-projets$/);
});
