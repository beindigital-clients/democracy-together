import { test, expect, type Page } from '@playwright/test';
import {
  debordementHorizontal,
  espacerLeTexte,
  revealAll,
  textesRognes,
  zoomerLeTexte,
} from './_a11y';
import { SESSIONS } from './_sessions';

// F-08 — ADAPTATION DE L'AFFICHAGE (audit RGAA du 27/09, critères 10.4, 10.11
// et 10.12) sur l'échantillon de l'audit.
//
//  - 10.11 : à 320 px de large (l'équivalent d'un zoom de 400 % sur un écran
//    de 1 280 px), la page ne défile PAS horizontalement. Les tableaux de
//    données sont une exception prévue : ils défilent DANS leur région
//    (`ScrollableRegion`), la page, elle, reste à la largeur de la fenêtre.
//  - 10.4 : zoom du TEXTE à 200 % — aucun texte rogné.
//  - 10.12 : espacements de texte redéfinis (interligne 1,5, lettres
//    0,12 em, mots 0,16 em, paragraphes 2 em) — aucun texte rogné.
//  - zoom de PAGE à 200 % : une fenêtre de 1 280 px zoomée deux fois est une
//    fenêtre de 640 px CSS — pas de défilement horizontal.

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

// En arabe, le débordement part à GAUCHE : un défaut que l'échantillon
// français ne peut pas voir.
const ECHANTILLON_AR = [
  '/ar',
  '/ar/bibliotheque/etat-democratie-afrique-europe',
  '/ar/barometre',
  '/ar/adhesion',
];

async function ouvrir(page: Page, chemin: string) {
  await page.goto(chemin);
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  // Les révélations au défilement posent un `translateY` : lues en cours
  // d'animation, elles passeraient pour du texte qui sort de son cadre.
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
