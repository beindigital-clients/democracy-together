import { test, expect } from '@playwright/test';

// Route protégée : sans session, /espace-membre renvoie vers /connexion. (F-01)
test('espace-membre redirige vers connexion si non authentifié', async ({
  page,
}) => {
  await page.goto('/fr/espace-membre');
  await expect(page).toHaveURL(/\/connexion$/);
});

// F-25/F-51 — /notifications est protégée ; la cloche n'apparaît pas déconnecté.
test('notifications : redirige vers connexion + cloche masquée déconnecté', async ({
  page,
}) => {
  await page.goto('/fr/notifications');
  await expect(page).toHaveURL(/\/connexion$/);

  await page.goto('/fr');
  await expect(
    page.locator('header a[aria-label="Notifications"]'),
  ).toHaveCount(0);
});
