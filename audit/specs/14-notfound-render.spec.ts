import { test, expect } from '@playwright/test';

// Décisif : la 404 LOCALISÉE affiche-t-elle quelque chose à l'écran ?
// /fr/rapports/9999 ne dépend PAS de Convex (contenu servi par
// src/lib/reports-content.ts) : ce qu'on observe ici n'est donc pas une
// retombée du backend injoignable.
const CIBLE = '/fr/rapports/9999';

test('404 localisée : avec JavaScript, après hydratation', async ({ page }) => {
  const r = await page.goto(CIBLE, { waitUntil: 'networkidle' });
  expect(r?.status()).toBe(404);
  await page.waitForTimeout(2000); // laisse toute sa chance à l'hydratation
  const texte = (await page.locator('body').innerText()).trim();
  await page.screenshot({
    path: '/home/user/democracy-together/audit/screenshots/404-localisee-avec-js.png',
    fullPage: true,
  });
  console.log(
    `[404 avec JS] ${texte.length} caractères visibles : ${JSON.stringify(texte.slice(0, 200))}`,
  );
  expect(
    texte.length,
    'la 404 localisée doit dire quelque chose',
  ).toBeGreaterThan(20);
});

test('404 localisée : sans JavaScript', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  const r = await page.goto(`http://localhost:3000${CIBLE}`);
  expect(r?.status()).toBe(404);
  const texte = (await page.locator('body').innerText()).trim();
  await page.screenshot({
    path: '/home/user/democracy-together/audit/screenshots/404-localisee-sans-js.png',
    fullPage: true,
  });
  console.log(
    `[404 sans JS] ${texte.length} caractères visibles : ${JSON.stringify(texte.slice(0, 200))}`,
  );
  await ctx.close();
  expect(texte.length, 'sans JS, la 404 doit rester lisible').toBeGreaterThan(
    20,
  );
});

test('contre-épreuve : une page publique normale rend bien du texte', async ({
  page,
}) => {
  await page.goto('/fr/mentions-legales', { waitUntil: 'networkidle' });
  const texte = (await page.locator('body').innerText()).trim();
  console.log(`[mentions-legales] ${texte.length} caractères visibles`);
  expect(texte.length).toBeGreaterThan(200);
});
