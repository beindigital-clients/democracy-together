import { test, expect } from '@playwright/test';

// The F-05 fix removes the veil from the SERVED HTML. What it must not
// remove: the on-scroll entrance animation, which is the very purpose of the
// component. These three tests hold both ends.

test('le HTML servi ne masque plus rien', async ({ request }) => {
  const html = await (await request.get('/fr/barometre')).text();
  expect(html, 'aucun opacity:0 dans le HTML servi').not.toContain('opacity:0');
});

test('après hydratation, ce qui est HORS écran est bien voilé', async ({
  page,
}) => {
  await page.goto('/fr/barometre');
  await page.waitForTimeout(1200); // let mounting set the veil

  const horsEcran = page.locator('[data-reveal]').last();
  await horsEcran.evaluate((el) => el.scrollIntoView === undefined); // typed no-op
  const opacite = await horsEcran.evaluate(
    (el) => getComputedStyle(el).opacity,
  );
  console.log(`[reveal] opacité d'un bloc hors écran : ${opacite}`);
  expect(
    Number(opacite),
    'un bloc hors écran doit être voilé, sinon il n’a plus rien à révéler',
  ).toBeLessThan(1);
});

test('le défilement révèle bien le bloc', async ({ page }) => {
  await page.goto('/fr/barometre');
  await page.waitForTimeout(1200);
  const cible = page.locator('[data-reveal]').last();
  await cible.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500); // animation duration (0.78 s) + margin
  const opacite = await cible.evaluate((el) => getComputedStyle(el).opacity);
  console.log(`[reveal] opacité après défilement : ${opacite}`);
  expect(Number(opacite)).toBe(1);
});

test('le premier écran est lisible immédiatement, sans JavaScript', async ({
  browser,
}) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto(
    `${process.env.AUDIT_BASE_URL ?? 'http://localhost:3000'}/fr/barometre`,
  );
  const texte = (await page.locator('body').innerText()).trim();
  await ctx.close();
  expect(texte.length).toBeGreaterThan(400);
});
