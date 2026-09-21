import { test, expect } from '@playwright/test';
import { ouvrirPanneau } from './_panneau';

// Viewport mobile : la nav du header est masquée (hidden md:flex), seul le
// menu hamburger donne accès aux liens.
test.use({ locale: 'fr-FR', viewport: { width: 390, height: 844 } });

// Le bouton change d'aria-label (Ouvrir/Fermer) selon l'état : on le cible par
// aria-controls, stable dans les deux états.
const TOGGLE = 'button[aria-controls="mobile-nav"]';

test('menu mobile : ouvre, navigue, se ferme (F-05)', async ({ page }) => {
  await page.goto('/fr');
  const toggle = page.locator(TOGGLE);
  // Lien de nav « Membres » (-> /le-reseau). exact:true pour ne pas matcher un
  // éventuel CTA contenant « membre ».
  const reseau = page.getByRole('link', { name: 'Membres', exact: true });

  // fermé : bouton présent, aucun lien de nav « Membres » accessible
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(reseau).toHaveCount(0);

  await ouvrirPanneau(toggle, page.locator('#mobile-nav'), 'menu mobile');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  await expect(reseau).toBeVisible();
  await reseau.click();

  await expect(page).toHaveURL(/\/fr\/le-reseau$/);
  // le menu s'est refermé après navigation
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(reseau).toHaveCount(0);
});

test('menu mobile : se ferme au changement de langue (F-05)', async ({
  page,
}) => {
  await page.goto('/fr');
  const toggle = page.locator(TOGGLE);
  await ouvrirPanneau(toggle, page.locator('#mobile-nav'), 'menu mobile');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  // bascule FR -> EN depuis le LocaleSwitcher du panneau (bascule segmentée)
  await page.locator('#mobile-nav').getByRole('button', { name: 'EN' }).click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.locator(TOGGLE)).toHaveAttribute('aria-expanded', 'false');
});

test('menu mobile : Échap referme (F-05)', async ({ page }) => {
  await page.goto('/fr');
  const toggle = page.locator(TOGGLE);
  await ouvrirPanneau(toggle, page.locator('#mobile-nav'), 'menu mobile');
  const jeunes = page.getByRole('link', { name: 'Jeunes', exact: true });
  await expect(jeunes).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(jeunes).toHaveCount(0);
});
