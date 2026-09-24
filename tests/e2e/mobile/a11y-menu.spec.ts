import { test, expect } from '@playwright/test';
import {
  revealAll,
  attendreAucuneViolationGrave,
  ciblesTropPetites,
} from '../_a11y';

// L'ÉCRAN QUE PERSONNE NE SCANNAIT (angle mort 2 de l'audit).
//
// Le panneau de navigation mobile n'était vu par aucune garde :
//   — `a11y.spec.ts` tourne sur le projet `chromium`, donc sur un viewport de
//     bureau, où `MobileNav` est masqué par `min-[1120px]:hidden` ;
//   — le projet `mobile-chromium` existait, mais ses deux specs exercent des
//     PARCOURS (navigation, tactile, débordement) et n'analysent rien.
//
// Résultat : sous 1120 px le menu est le SEUL chemin de navigation du site, sur
// la plateforme que le cadrage annonce comme premier usage, et son
// accessibilité n'avait jamais été mesurée. Elle l'est depuis, et elle est
// propre — ce fichier est là pour qu'elle le reste.
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

  // NON-VACUITÉ : un panneau vide passerait toutes les analyses du monde.
  const liens = await panneau.getByRole('link').count();
  expect(liens, 'panneau vide : le scan ne mesurerait rien').toBeGreaterThan(5);
  await expect(panneau).toHaveAttribute('aria-modal', 'true');

  await attendreAucuneViolationGrave(page, 'menu mobile ouvert');
});

test('a11y : le menu mobile en anglais aussi', async ({ page }) => {
  // La bascule de langue vit DANS le panneau : si son libellé ou son rôle
  // dérive côté `en`, aucune autre garde ne le verrait.
  await page.goto('/en');
  await revealAll(page);
  await ouvrirLeMenu(page);
  await attendreAucuneViolationGrave(page, 'menu mobile ouvert (en)');
});

// WCAG 2.2 — 2.5.8 « Taille de cible (minimum) », niveau AA. Le critère ne
// s'évalue pas sur la seule taille : une cible sous-dimensionnée reste conforme
// si elle est assez ESPACÉE de ses voisines. `ciblesTropPetites` applique la
// règle entière ; le témoin ci-dessous garantit qu'elle peut encore échouer.
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
    // Deux pages choisies pour ce qu'elles portent : l'accueil pour sa densité
    // de liens (en-tête, sections, pied de page), la connexion parce que son
    // lien « Mot de passe oublié ? » longe un champ de saisie — l'adjacence la
    // plus serrée mesurée sur le site (29 px pour 12 exigés).
    for (const route of ['/fr', '/fr/connexion']) {
      await page.goto(route);
      await revealAll(page);
      const fautives = await ciblesTropPetites(page);
      expect(fautives, `${route} : cibles non conformes`).toEqual([]);
    }
  });
});
