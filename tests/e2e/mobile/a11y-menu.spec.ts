import { test, expect } from '@playwright/test';
import {
  revealAll,
  attendreAucuneViolationGrave,
  ciblesTropPetites,
} from '../_a11y';

// THE SCREEN NOBODY SCANNED (blind spot 2 of the audit).
//
// The mobile navigation panel was seen by no guard:
//   — `a11y.spec.ts` runs on the `chromium` project, hence on a desktop
//     viewport, where `MobileNav` is hidden by `min-[1120px]:hidden`;
//   — the `mobile-chromium` project existed, but its two specs exercise
//     FLOWS (navigation, touch, overflow) and analyze nothing.
//
// Result: below 1120 px the menu is the site's ONLY navigation path, on
// the platform the scoping document names as the primary use, and its
// accessibility had never been measured. It has been since, and it is
// clean — this file is there so that it stays that way.
test.use({ locale: 'fr-FR' });

const TOGGLE = 'button[aria-controls="mobile-nav"]';

async function ouvrirLeMenu(page: import('@playwright/test').Page) {
  await page.locator(TOGGLE).tap();
  const panneau = page.locator('#mobile-nav');
  await expect(panneau).toBeVisible();
  return panneau;
}

test('a11y : le panneau de navigation mobile OUVERT', async ({ page }) => {
  await page.goto('/fr');
  await revealAll(page);
  const panneau = await ouvrirLeMenu(page);

  // NON-VACUITY: an empty panel would pass every analysis in the world.
  const liens = await panneau.getByRole('link').count();
  expect(liens, 'panneau vide : le scan ne mesurerait rien').toBeGreaterThan(5);
  await expect(panneau).toHaveAttribute('aria-modal', 'true');

  await attendreAucuneViolationGrave(page, 'menu mobile ouvert');
});

test('a11y : le menu mobile en anglais aussi', async ({ page }) => {
  // The language toggle lives INSIDE the panel: if its label or role
  // drifts on the `en` side, no other guard would see it.
  await page.goto('/en');
  await revealAll(page);
  await ouvrirLeMenu(page);
  await attendreAucuneViolationGrave(page, 'menu mobile ouvert (en)');
});

// WCAG 2.2 — 2.5.8 "Target Size (Minimum)", level AA. The criterion is not
// evaluated on size alone: an undersized target is still compliant
// if it is SPACED far enough from its neighbors. `ciblesTropPetites` applies the
// full rule; the control below guarantees it can still fail.
test.describe('cibles tactiles (WCAG 2.5.8)', () => {
  test('le détecteur sait échouer — sinon son zéro ne vaut rien', async ({
    page,
  }) => {
    await page.goto('/fr');
    await page.evaluate(() => {
      const d = document.createElement('div');
      d.id = 'temoin-2-5-8';
      d.style.cssText = 'position:fixed;left:8px;top:300px;z-index:99999';
      d.innerHTML =
        '<a href="#a" style="position:absolute;left:0;top:0;width:16px;height:16px;display:block">a</a>' +
        '<a href="#b" style="position:absolute;left:10px;top:0;width:16px;height:16px;display:block">b</a>';
      document.body.appendChild(d);
    });
    const fautives = await ciblesTropPetites(page, '#temoin-2-5-8');
    expect(
      fautives.length,
      'deux cibles de 16 px à 10 px d’écart passent : le détecteur est vide',
    ).toBe(2);
  });

  test('le menu mobile ouvert est conforme', async ({ page }) => {
    await page.goto('/fr');
    await ouvrirLeMenu(page);
    const fautives = await ciblesTropPetites(page, '#mobile-nav');
    expect(fautives, 'cibles du menu mobile non conformes').toEqual([]);
  });

  test('l’accueil et la connexion sont conformes', async ({ page }) => {
    // Two pages chosen for what they carry: the home page for its link
    // density (header, sections, footer), sign-in because its
    // "Mot de passe oublié ?" link runs alongside an input field — the tightest
    // adjacency measured on the site (29 px for 12 required).
    for (const route of ['/fr', '/fr/connexion']) {
      await page.goto(route);
      await revealAll(page);
      const fautives = await ciblesTropPetites(page);
      expect(fautives, `${route} : cibles non conformes`).toEqual([]);
    }
  });
});
