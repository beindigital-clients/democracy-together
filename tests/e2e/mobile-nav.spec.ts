import { test, expect } from '@playwright/test';
import { ouvrirPanneau } from './_panneau';
import { choixLangue, ouvrirSelecteurDeLangue } from './_langue';

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
  const panneau = page.locator('#mobile-nav');
  await ouvrirPanneau(toggle, panneau, 'menu mobile');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  // Bascule FR -> EN depuis le sélecteur DU PANNEAU. La portée est explicite :
  // la grappe desktop reste dans le document sous 1120 px (`hidden`), et un
  // sélecteur non qualifié tomberait sur son sélecteur à elle, invisible.
  await ouvrirSelecteurDeLangue(page, panneau);
  await choixLangue(page, 'en', panneau).click();
  await expect(page).toHaveURL(/\/en$/, { timeout: 20_000 });
  await expect(page.locator(TOGGLE)).toHaveAttribute('aria-expanded', 'false');
});

// DEUX PIÈGES DU MENU IMBRIQUÉ, mesurés sur cette page puis corrigés dans
// `locale-switcher.tsx`. Le sélecteur de langue est devenu un menu, et il vit
// DANS ce panneau : deux calques superposés, dans un conteneur qui défile.
// Aucun des deux ne se voit sur un viewport desktop, où le sélecteur est seul
// dans une barre qui ne défile pas — d'où leur place ici.
test('menu mobile : le menu de langue tient dans le panneau, et Échap ne ferme que lui (F-05)', async ({
  page,
}) => {
  await page.goto('/fr');
  const toggle = page.locator(TOGGLE);
  const panneau = page.locator('#mobile-nav');
  await ouvrirPanneau(toggle, panneau, 'menu mobile');

  const menu = await ouvrirSelecteurDeLangue(page, panneau);

  // 1. LE MENU S'OUVRE VERS LE HAUT. Le sélecteur est sur la dernière ligne du
  // panneau, et le panneau défile (`overflow-y-auto`) : ouvert vers le bas, le
  // menu en sortait de 148 px, et trois des cinq langues n'étaient atteignables
  // qu'en faisant défiler un menu qu'on venait d'ouvrir.
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

  // 2. ÉCHAP FERME LE CALQUE LE PLUS INTÉRIEUR, et lui seul. Les deux
  // composants écoutaient Échap sur `document` : une seule touche fermait le
  // menu de langue ET le panneau autour de lui.
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
