import { test, expect } from '@playwright/test';

// Le correctif F-05 retire le voile du HTML SERVI. Ce qu'il ne doit pas
// retirer : l'animation d'entrée au défilement, qui est le sujet même du
// composant. Ces trois tests tiennent les deux bouts.

test('le HTML servi ne masque plus rien', async ({ request }) => {
  const html = await (await request.get('/fr/barometre')).text();
  expect(html, 'aucun opacity:0 dans le HTML servi').not.toContain('opacity:0');
});

test('après hydratation, ce qui est HORS écran est bien voilé', async ({
  page,
}) => {
  await page.goto('/fr/barometre');
  await page.waitForTimeout(1200); // laisse le montage poser le voile

  const horsEcran = page.locator('[data-reveal]').last();
  await horsEcran.evaluate((el) => el.scrollIntoView === undefined); // no-op typé
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
  await page.waitForTimeout(1500); // durée de l'animation (0,78 s) + marge
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
