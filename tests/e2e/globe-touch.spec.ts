import { test, expect } from '@playwright/test';

// La carte interactive (globe) doit être utilisable au tactile : un *appui* sur
// un pays le sélectionne et affiche son score. Régression mobile — auparavant un
// tap ouvrait/fermait le « glissé » sans jamais déclencher de sélection (le
// survol n'existe pas au tactile).
test.use({
  locale: 'fr-FR',
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  reducedMotion: 'reduce', // fige le globe -> appuis déterministes
});

test('carte : un appui sélectionne un pays au tactile (mobile)', async ({
  page,
}) => {
  await page.goto('/fr/barometre');
  const canvas = page.locator('#carte canvas');
  await canvas.scrollIntoViewIfNeeded();
  await expect(canvas).toBeVisible();
  const b = await canvas.boundingBox();
  if (!b) throw new Error('canvas de la carte introuvable');

  // Panneau de détail (aria-live) : un <h3> n'apparaît qu'une fois un pays choisi.
  const heading = page.locator('#carte [aria-live="polite"] h3');
  await expect(heading).toHaveCount(0); // au repos : aucun pays sélectionné

  // Balayage d'appuis sur le globe : au moins un tombe sur un pays noté
  // (données d'illustration Afrique-Europe). Globe figé -> résultat stable.
  const N = 7;
  let selected = false;
  for (let iy = 1; iy < N && !selected; iy++) {
    for (let ix = 1; ix < N && !selected; ix++) {
      await page.touchscreen.tap(
        b.x + (b.width * ix) / N,
        b.y + (b.height * iy) / N,
      );
      if (await heading.isVisible().catch(() => false)) selected = true;
    }
  }

  expect(selected, 'un appui aurait dû sélectionner un pays').toBe(true);
  await expect(heading).toBeVisible();
});
