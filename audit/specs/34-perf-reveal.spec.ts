import { test, expect } from '@playwright/test';

// Reprise du test d'isolation « sans voile Reveal », avec une méthode dont on
// VÉRIFIE l'effet. La première version injectait un <style> sur
// documentElement avant que <head> n'existe ; rien ne prouvait qu'il survivait
// au rendu de React. Ici la règle est ajoutée à la FEUILLE DE STYLE elle-même,
// interceptée en vol, et le test refuse de conclure sans l'avoir constatée.
const ROUTE = '/fr/barometre';

async function brider(page: import('@playwright/test').Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: (400 * 1024) / 8,
    uploadThroughput: (400 * 1024) / 8,
    latency: 400,
  });
}

async function lcp(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let v = 0;
        new PerformanceObserver((l) => {
          for (const e of l.getEntries()) v = Math.max(v, e.startTime);
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        setTimeout(() => resolve(Math.round(v)), 500);
      }),
  );
}

test('le voile des Reveal est-il bien posé au départ ?', async ({ page }) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  // Style INLINE posé par framer-motion côté serveur, avant toute hydratation.
  const inline = await page
    .locator('[data-reveal]')
    .first()
    .getAttribute('style');
  console.log(`[reveal] style inline servi : ${inline}`);
  expect(inline ?? '', 'framer pose bien opacity:0 dans le HTML').toContain(
    'opacity:0',
  );
});

test('LCP avec le voile retiré — méthode vérifiée', async ({ page }) => {
  await brider(page);
  // La règle est ajoutée à la feuille de style servie : elle ne peut pas être
  // perdue au montage de React.
  await page.route('**/*.css', async (route) => {
    const res = await route.fetch();
    const css = await res.text();
    await route.fulfill({
      response: res,
      body: `${css}\n[data-reveal]{opacity:1 !important;transform:none !important}`,
    });
  });
  await page.goto(ROUTE, { waitUntil: 'load', timeout: 180_000 });

  // On CONSTATE l'effet avant de mesurer quoi que ce soit.
  const opacite = await page
    .locator('[data-reveal]')
    .first()
    .evaluate((el) => getComputedStyle(el).opacity);
  console.log(`[reveal] opacité calculée après injection : ${opacite}`);
  expect(opacite, 'la règle injectée doit bien s’appliquer').toBe('1');

  await page.waitForTimeout(4000);
  console.log(`[reveal] LCP sans voile : ${await lcp(page)}ms`);
});
