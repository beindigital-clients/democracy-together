import { test, expect, type Page } from '@playwright/test';

// `mobile-chromium` project (playwright.config.ts): the phone viewport and
// `hasTouch` come from the project, no longer from the file.
//
// `reducedMotion` IS NOT a `test.use` option in @playwright/test 1.61
// (issue #18): written there, it was silently ignored and the test never
// ran under `prefers-reduced-motion`, contrary to what it
// claimed. The current way is the CONTEXT option, applied as soon as the
// context is created — essential here: the globe reads
// `matchMedia('(prefers-reduced-motion: reduce)')` only ONCE, on mount,
// so an emulation set after `goto` would come too late.
test.use({
  locale: 'fr-FR',
  contextOptions: { reducedMotion: 'reduce' },
});

// Number of non-transparent pixels on the canvas: used to wait until the globe
// is REALLY painted before comparing two frames (a blank canvas is
// identical from one frame to the next — it would make the stillness test pass
// without proving anything).
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

// Fingerprint of the DRAWN content (not of the screenshot): read straight from the
// canvas, it is insensitive to the container's CSS/framer entrance animations.
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
  // the base map (topojson) is lazy-loaded: we wait for the drawing.
  await expect
    .poll(() => paintedPixels(page), { timeout: 15_000 })
    .toBeGreaterThan(1_000);
  return canvas;
}

test('carte : un appui sélectionne un pays au tactile (mobile)', async ({
  page,
}) => {
  // Mobile regression — previously a tap toggled the "drag" without
  // ever triggering a selection (hover does not exist on touch).
  const canvas = await showGlobe(page);
  const b = await canvas.boundingBox();
  if (!b) throw new Error('canvas de la carte introuvable');

  // Detail panel (aria-live): an <h3> only appears once a country is chosen.
  const heading = page.locator('#carte [aria-live="polite"] h3');
  await expect(heading).toHaveCount(0); // at rest: no country selected

  // Sweep of taps over the globe: at least one lands on a rated country
  // (Africa-Europe illustration data). Frozen globe -> stable result.
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

// The claimed accessibility feature (`prefers-reduced-motion` respected) is
// VERIFIED here, not assumed: the globe spins on its own by 0.16°/frame as long as
// the user does not request reduced motion.
test('carte : sous prefers-reduced-motion, le globe ne tourne pas tout seul', async ({
  page,
}) => {
  await showGlobe(page);
  const before = await frame(page);
  // ~36 frames at 60 Hz: an automatic rotation would have moved the drawing by
  // ~6°, far beyond rendering noise (there is none: the drawing is
  // deterministic at constant rotation).
  await page.waitForTimeout(600);
  expect(
    await frame(page),
    'le globe s’anime alors que prefers-reduced-motion est demandé',
  ).toBe(before);
});

// Control: without the preference, the globe MUST spin. Without it, the
// test above would also pass with a broken globe (canvas frozen for an entirely
// different reason) — it would prove nothing.
test('carte : sans la préférence, le globe tourne (contre-épreuve)', async ({
  page,
}) => {
  // Set the emulation BEFORE navigating: the globe reads matchMedia on mount.
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await showGlobe(page);
  const before = await frame(page);
  await page.waitForTimeout(600);
  expect(
    await frame(page),
    'le globe devrait tourner en l’absence de prefers-reduced-motion',
  ).not.toBe(before);
});
