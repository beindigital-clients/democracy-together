import { test, expect, type Page } from '@playwright/test';

// Projet `mobile-chromium` (playwright.config.ts) : le viewport téléphone et
// `hasTouch` viennent du projet, et non plus du fichier.
//
// `reducedMotion` N'EST PAS une option de `test.use` dans @playwright/test 1.61
// (issue #18) : écrite là, elle était silencieusement ignorée et le test ne
// s'exécutait jamais sous `prefers-reduced-motion`, contrairement à ce qu'il
// annonçait. La voie en vigueur est l'option de CONTEXTE, appliquée dès la
// création du contexte — indispensable ici : le globe lit
// `matchMedia('(prefers-reduced-motion: reduce)')` UNE seule fois, au montage,
// donc une émulation posée après `goto` arriverait trop tard.
test.use({
  locale: 'fr-FR',
  contextOptions: { reducedMotion: 'reduce' },
});

// Nombre de pixels non transparents du canvas : sert à attendre que le globe
// soit VRAIMENT peint avant de comparer deux images (un canvas vierge est
// identique d'une image à l'autre — il ferait passer le test de l'immobilité
// sans rien prouver).
async function paintedPixels(page: Page): Promise<number> {
  return page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('#carte canvas');
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return 0;
    const { data } = ctx.getImageData(0, 0, c.width, c.height);
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) n++;
    return n;
  });
}

// Empreinte du contenu DESSINÉ (et non de la capture d'écran) : lue à même le
// canvas, elle est insensible aux animations d'entrée CSS/framer du conteneur.
async function frame(page: Page): Promise<string> {
  return page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('#carte canvas');
    if (!c) throw new Error('canvas de la carte introuvable');
    return c.toDataURL('image/png');
  });
}

async function showGlobe(page: Page) {
  await page.goto('/fr/barometre');
  const canvas = page.locator('#carte canvas');
  await canvas.scrollIntoViewIfNeeded();
  await expect(canvas).toBeVisible();
  // le fond de carte (topojson) est chargé en différé : on attend le tracé.
  await expect.poll(() => paintedPixels(page), { timeout: 15_000 }).toBeGreaterThan(1_000);
  return canvas;
}

test('carte : un appui sélectionne un pays au tactile (mobile)', async ({
  page,
}) => {
  // Régression mobile — auparavant un tap ouvrait/fermait le « glissé » sans
  // jamais déclencher de sélection (le survol n'existe pas au tactile).
  const canvas = await showGlobe(page);
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

// L'acquis d'accessibilité revendiqué (`prefers-reduced-motion` respecté) est
// ici VÉRIFIÉ, pas supposé : le globe tourne seul de 0,16°/frame tant que
// l'utilisateur ne demande pas la réduction des animations.
test('carte : sous prefers-reduced-motion, le globe ne tourne pas tout seul', async ({
  page,
}) => {
  await showGlobe(page);
  const before = await frame(page);
  // ~36 frames à 60 Hz : une rotation automatique aurait déplacé le tracé de
  // ~6°, largement au-delà du bruit de rendu (il n'y en a aucun : le dessin est
  // déterministe à rotation constante).
  await page.waitForTimeout(600);
  expect(
    await frame(page),
    'le globe s’anime alors que prefers-reduced-motion est demandé',
  ).toBe(before);
});

// Contre-épreuve : sans la préférence, le globe DOIT tourner. Sans elle, le
// test ci-dessus passerait aussi avec un globe cassé (canvas figé pour une tout
// autre raison) — il ne prouverait rien.
test('carte : sans la préférence, le globe tourne (contre-épreuve)', async ({
  page,
}) => {
  // Pose l'émulation AVANT la navigation : le globe lit matchMedia au montage.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await showGlobe(page);
  const before = await frame(page);
  await page.waitForTimeout(600);
  expect(
    await frame(page),
    'le globe devrait tourner en l’absence de prefers-reduced-motion',
  ).not.toBe(before);
});
