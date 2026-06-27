import { test, expect } from '@playwright/test';

// F-23 — Annuaire d'experts (public), dérivé des auteurs de publications
// publiées. Test léger : la page répond et le h1 est visible (FR + EN).

test('experts : la page répond + h1 visible (F-23)', async ({ page }) => {
  const res = await page.goto('/fr/experts');
  expect(res?.status()).toBe(200);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Les experts du réseau' }),
  ).toBeVisible();
});

test('experts : version EN (F-23/F-03)', async ({ page }) => {
  await page.goto('/en/experts');
  await expect(
    page.getByRole('heading', { level: 1, name: "The network's experts" }),
  ).toBeVisible();
});

test('experts : accessible depuis le pied de page (F-23)', async ({ page }) => {
  await page.goto('/fr');
  const footerLink = page.locator('footer a[href$="/experts"]');
  await expect(footerLink).toBeVisible();
  await footerLink.click();
  await expect(page).toHaveURL(/\/fr\/experts$/);
});
