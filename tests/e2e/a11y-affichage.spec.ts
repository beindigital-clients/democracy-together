import { test, expect, type Page } from '@playwright/test';
import {
  debordementHorizontal,
  espacerLeTexte,
  revealAll,
  textesRognes,
  zoomerLeTexte,
} from './_a11y';
import { SESSIONS } from './_sessions';

// F-08 — DISPLAY ADAPTATION (RGAA audit of 27/09, criteria 10.4, 10.11
// and 10.12) on the audit sample.
//
//  - 10.11: at 320 px wide (the equivalent of a 400 % zoom on a
//    1,280 px screen), the page does NOT scroll horizontally. Data tables
//    are a planned exception: they scroll WITHIN their region
//    (`ScrollableRegion`), while the page stays at the window width.
//  - 10.4: TEXT zoom at 200 % — no clipped text.
//  - 10.12: text spacing overridden (line height 1.5, letters
//    0.12 em, words 0.16 em, paragraphs 2 em) — no clipped text.
//  - PAGE zoom at 200 %: a 1,280 px window zoomed twice is a
//    640 CSS px window — no horizontal scrolling.

test.use({ locale: 'fr-FR' });

const ECHANTILLON = [
  '/fr',
  '/fr/a-propos',
  '/fr/le-reseau',
  '/fr/le-reseau/accra-governance-lab',
  '/fr/bibliotheque',
  '/fr/bibliotheque/etat-democratie-afrique-europe',
  '/fr/evenements',
  '/fr/evenements/atelier-bruxelles-democratie-ue',
  '/fr/tribune',
  '/fr/jeunes',
  '/fr/barometre',
  '/fr/rapports/2026',
  '/fr/adhesion',
  '/fr/contact',
  '/fr/recherche?q=democratie',
  '/fr/connexion',
  '/fr/accessibilite',
];

// In Arabic, the overflow goes to the LEFT: a defect the French sample
// cannot see.
const ECHANTILLON_AR = [
  '/ar',
  '/ar/bibliotheque/etat-democratie-afrique-europe',
  '/ar/barometre',
  '/ar/adhesion',
];

async function ouvrir(page: Page, chemin: string) {
  await page.goto(chemin);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  // Scroll reveals set a `translateY`: read mid-animation, they
  // would pass for text escaping its frame.
  await revealAll(page);
}

test.describe('reflow à 320 px (RGAA 10.11)', () => {
  test.use({ viewport: { width: 320, height: 640 } });

  for (const chemin of [...ECHANTILLON, ...ECHANTILLON_AR]) {
    test(`${chemin} : pas de défilement horizontal`, async ({ page }) => {
      await ouvrir(page, chemin);
      expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('zoom de page à 200 % (1 280 px → 640 px CSS)', () => {
  test.use({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 });

  for (const chemin of ECHANTILLON) {
    test(`${chemin} : pas de défilement horizontal`, async ({ page }) => {
      await ouvrir(page, chemin);
      expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('zoom du texte à 200 % (RGAA 10.4)', () => {
  for (const chemin of ECHANTILLON) {
    test(`${chemin} : aucun texte rogné`, async ({ page }) => {
      await ouvrir(page, chemin);
      await zoomerLeTexte(page, 2);
      expect(await textesRognes(page)).toEqual([]);
    });
  }
});

test.describe('espacement du texte (RGAA 10.12)', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const chemin of [...ECHANTILLON, ...ECHANTILLON_AR]) {
    test(`${chemin} : aucun texte rogné`, async ({ page }) => {
      await ouvrir(page, chemin);
      await espacerLeTexte(page);
      expect(await textesRognes(page)).toEqual([]);
      expect(await debordementHorizontal(page)).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('écrans connectés', () => {
  test.use({
    storageState: SESSIONS.a11yAffichage.state,
    viewport: { width: 320, height: 640 },
  });
  test.afterEach(async ({ context }) => {
    await context.storageState({ path: SESSIONS.a11yAffichage.state });
  });

  test('espace membre et utilisateurs : reflow à 320 px, texte à 200 %', async ({
    page,
  }) => {
    for (const chemin of ['/fr/espace-membre', '/fr/admin/utilisateurs']) {
      await ouvrir(page, chemin);
      expect(
        await debordementHorizontal(page),
        `${chemin} à 320 px`,
      ).toBeLessThanOrEqual(1);
      await zoomerLeTexte(page, 2);
      expect(await textesRognes(page), `${chemin} texte 200 %`).toEqual([]);
    }
  });
});
