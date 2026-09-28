import { test, expect } from '@playwright/test';

// F-60 — Collaborative calls for projects: public page presenting the
// scheme and inviting members to propose a project. (Lightweight test: the page
// responds and shows the right h1. Member gating is covered by the Convex tests.)

test('appels à projets : la page publique répond (FR)', async ({ page }) => {
  const res = await page.goto('/fr/appels-a-projets');
  expect(res?.status()).toBe(200);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Appels à projets collaboratifs',
    }),
  ).toBeVisible();

  // A (signed-out) visitor is invited to join, no form is open.
  await expect(
    page.getByRole('link', { name: 'Adhérer' }).first(),
  ).toBeVisible();
});

test('appels à projets : version EN (F-03)', async ({ page }) => {
  await page.goto('/en/appels-a-projets');
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Collaborative project calls',
    }),
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
