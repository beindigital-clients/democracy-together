import { test, expect } from '@playwright/test';

// F-16 — Espace presse / kit média : page publique sans backend (contenu local
// bilingue). Boilerplate + faits clés + contact presse (vers /contact) +
// ressources (à-propos et données ouvertes du Baromètre).

test('presse : la page répond et affiche le h1 (F-16)', async ({ page }) => {
  await page.goto('/fr/presse');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Espace presse & kit média' }),
  ).toBeVisible();

  // Bloc faits clés : au moins 4 cartes.
  const cards = page.locator('article');
  expect(await cards.count()).toBeGreaterThanOrEqual(4);

  // Contact presse vers /contact.
  await expect(page.locator('a[href$="/contact"]').last()).toBeVisible();

  // Ressources : lien vers /a-propos et vers les données ouvertes du Baromètre.
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
