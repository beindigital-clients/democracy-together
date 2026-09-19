import { test, expect } from '@playwright/test';

// F-14 — Partenaires & soutiens : page publique sans backend (contenu local
// bilingue), grille de catégories de partenariat + bande CTA « Devenir
// partenaire » vers /contact.

test('partenaires : la page répond et affiche le h1 (F-14)', async ({
  page,
}) => {
  await page.goto('/fr/partenaires');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Partenaires & soutiens' }),
  ).toBeVisible();

  // Au moins 4 cartes de catégories.
  const cards = page.locator('article');
  expect(await cards.count()).toBeGreaterThanOrEqual(4);

  // Bande CTA vers /contact.
  await expect(page.locator('a[href$="/contact"]').last()).toBeVisible();
});

test('partenaires : version EN (F-14/F-03)', async ({ page }) => {
  await page.goto('/en/partenaires');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Partners & supporters' }),
  ).toBeVisible();
});

test('partenaires : accessible depuis le pied de page (F-14)', async ({
  page,
}) => {
  await page.goto('/fr');
  const footerLink = page.locator('footer a[href$="/partenaires"]');
  await expect(footerLink).toBeVisible();
  await footerLink.click();
  await expect(page).toHaveURL(/\/fr\/partenaires$/);
});
