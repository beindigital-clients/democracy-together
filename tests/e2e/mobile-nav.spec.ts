import { test, expect } from '@playwright/test';

// Viewport mobile : la nav du header est masquée (hidden md:flex), seul le
// menu hamburger donne accès aux liens.
test.use({ locale: 'fr-FR', viewport: { width: 390, height: 844 } });

// Le bouton change d'aria-label (Ouvrir/Fermer) selon l'état : on le cible par
// aria-controls, stable dans les deux états.
const TOGGLE = 'button[aria-controls="mobile-nav"]';

test('menu mobile : ouvre, navigue, se ferme (F-05)', async ({ page }) => {
  await page.goto('/fr');
  const toggle = page.locator(TOGGLE);
  // exact:true -> ne matche pas le CTA « Rejoindre le réseau » du hero.
  const reseau = page.getByRole('link', { name: 'Le réseau', exact: true });

  // fermé : bouton présent, aucun lien « Le réseau » accessible
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(reseau).toHaveCount(0);

  await toggle.click();
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
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  // bascule FR -> EN depuis le LocaleSwitcher du panneau (bascule segmentée)
  await page.locator('#mobile-nav').getByRole('button', { name: 'EN' }).click();
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.locator(TOGGLE)).toHaveAttribute('aria-expanded', 'false');
});

test('menu mobile : Échap referme (F-05)', async ({ page }) => {
  await page.goto('/fr');
  const toggle = page.locator(TOGGLE);
  await toggle.click();
  const jeunes = page.getByRole('link', { name: 'Jeunes', exact: true });
  await expect(jeunes).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(jeunes).toHaveCount(0);
});
