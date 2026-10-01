import { test, expect } from '@playwright/test';

// Protected route: without a session, /espace-membre redirects to /connexion. (F-01)
test('espace-membre redirige vers connexion si non authentifié', async ({
  page,
}) => {
  await page.goto('/fr/espace-membre');
  await expect(page).toHaveURL(/\/connexion$/);
});

// F-25/F-51 — /notifications is protected; the bell does not appear when signed out.
test('notifications : redirige vers connexion + cloche masquée déconnecté', async ({
  page,
}) => {
  await page.goto('/fr/notifications');
  await expect(page).toHaveURL(/\/connexion$/);

  // Both forms of the bell: the button that opens the panel (desktop) and
  // the link to the page (phone).
  await page.goto('/fr');
  await expect(
    page.locator('header [aria-label^="Notifications"]'),
  ).toHaveCount(0);
});
