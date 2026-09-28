import { test, expect } from '@playwright/test';

// F-16 — Press area / media kit: public page without a backend (local
// bilingual content). Boilerplate + key facts + press contact (to /contact) +
// resources (about page and the Barometer's open data).

test('presse : la page répond et affiche le h1 (F-16)', async ({ page }) => {
  await page.goto('/fr/presse');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Espace presse & kit média' }),
  ).toBeVisible();

  // Key facts block: at least 4 cards.
  const cards = page.locator('article');
  expect(await cards.count()).toBeGreaterThanOrEqual(4);

  // Press contact to /contact.
  await expect(page.locator('a[href$="/contact"]').last()).toBeVisible();

  // Resources: link to /a-propos and to the Barometer's open data.
  await expect(page.locator('a[href$="/a-propos"]').last()).toBeVisible();
  await expect(
    page.locator('a[href$="/barometre/data/composite.csv"]'),
  ).toBeVisible();
});

test('presse : version EN (F-16/F-03)', async ({ page }) => {
  await page.goto('/en/presse');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Press room & media kit' }),
  ).toBeVisible();
});

test('presse : accessible depuis le pied de page (F-16)', async ({ page }) => {
  await page.goto('/fr');
  const footerLink = page.locator('footer a[href$="/presse"]');
  await expect(footerLink).toBeVisible();
  await footerLink.click();
  await expect(page).toHaveURL(/\/fr\/presse$/);
});
