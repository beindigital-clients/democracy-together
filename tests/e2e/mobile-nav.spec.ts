import { test, expect } from '@playwright/test';
import { ouvrirPanneau } from './_panneau';
import { choixLangue, ouvrirSelecteurDeLangue } from './_langue';

// Mobile viewport: the header nav is hidden (hidden md:flex), only the
// hamburger menu gives access to the links.
test.use({ locale: 'fr-FR', viewport: { width: 390, height: 844 } });

// The button changes aria-label (Ouvrir/Fermer) depending on state: we target it by
// aria-controls, stable in both states.
const TOGGLE = 'button[aria-controls="mobile-nav"]';

test('menu mobile : ouvre, navigue, se ferme (F-05)', async ({ page }) => {
  await page.goto('/fr');
  const toggle = page.locator(TOGGLE);
  // "Membres" nav link (-> /le-reseau). exact:true so as not to match a
  // possible CTA containing "membre".
  const reseau = page.getByRole('link', { name: 'Membres', exact: true });

  // closed: button present, no accessible "Membres" nav link
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(reseau).toHaveCount(0);

  await ouvrirPanneau(toggle, page.locator('#mobile-nav'), 'menu mobile');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  await expect(reseau).toBeVisible();
  await reseau.click();

  await expect(page).toHaveURL(/\/fr\/le-reseau$/);
  // the menu closed after navigation
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(reseau).toHaveCount(0);
});

test('menu mobile : se ferme au changement de langue (F-05)', async ({
  page,
}) => {
  await page.goto('/fr');
  const toggle = page.locator(TOGGLE);
  const panneau = page.locator('#mobile-nav');
  await ouvrirPanneau(toggle, panneau, 'menu mobile');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  // FR -> EN toggle from the PANEL's selector. The scope is explicit:
  // the desktop cluster stays in the document below 1120 px (`hidden`), and an
  // unqualified selector would land on its own selector, invisible.
  await ouvrirSelecteurDeLangue(page, panneau);
  await choixLangue(page, 'en', panneau).click();
  await expect(page).toHaveURL(/\/en$/, { timeout: 20_000 });
  await expect(page.locator(TOGGLE)).toHaveAttribute('aria-expanded', 'false');
});

// TWO PITFALLS OF THE NESTED MENU, measured on this page then fixed in
// `locale-switcher.tsx`. The language selector became a menu, and it lives
// INSIDE this panel: two stacked layers, in a scrolling container.
// Neither shows up on a desktop viewport, where the selector stands alone
// in a bar that does not scroll — hence their place here.
test('menu mobile : le menu de langue tient dans le panneau, et Échap ne ferme que lui (F-05)', async ({
  page,
}) => {
  await page.goto('/fr');
  const toggle = page.locator(TOGGLE);
  const panneau = page.locator('#mobile-nav');
  await ouvrirPanneau(toggle, panneau, 'menu mobile');

  const menu = await ouvrirSelecteurDeLangue(page, panneau);

  // 1. THE MENU OPENS UPWARDS. The selector is on the panel's last row,
  // and the panel scrolls (`overflow-y-auto`): opened downwards, the
  // menu overflowed it by 148 px, and three of the five languages were only reachable
  // by scrolling a menu that had just been opened.
  const boiteMenu = await menu.boundingBox();
  const boitePanneau = await panneau.boundingBox();
  if (!boiteMenu || !boitePanneau) {
    throw new Error('menu ou panneau non mesurable');
  }
  const debord =
    boiteMenu.y + boiteMenu.height - (boitePanneau.y + boitePanneau.height);
  expect(
    Math.round(debord),
    'le menu de langue sort du panneau qui le contient',
  ).toBeLessThanOrEqual(0);

  // 2. ESCAPE CLOSES THE INNERMOST LAYER, and it alone. Both
  // components listened for Escape on `document`: a single keypress closed the
  // language menu AND the panel around it.
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
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
