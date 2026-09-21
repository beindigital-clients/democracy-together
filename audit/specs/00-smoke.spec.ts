import { test, expect } from '@playwright/test';

test('le navigateur démarre et sert la page d’accueil', async ({ page }) => {
  const r = await page.goto('/fr');
  expect(r?.status()).toBe(200);
  await expect(page.locator('h1').first()).toBeVisible();
});
