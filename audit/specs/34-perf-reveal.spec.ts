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

// Ce test DISAIT l'inverse : il exigeait `opacity:0` dans le HTML servi, ce
// qui était le diagnostic de F-05 — un élément à opacité nulle n'est pas
// candidat au LCP, d'où les 12 808 ms sur cette page en 3G lente. Le constat
// posé et corrigé, l'affirmation est retournée : elle garde maintenant le
// correctif au lieu de commémorer le défaut. Si quelqu'un remet un voile au
// rendu serveur, le LCP repart à douze secondes — et ce test rougit d'abord.
//
// L'autre moitié du contrat est tenue par 35-reveal-integrite.spec.ts :
// l'animation d'entrée doit TOUJOURS exister. Les deux ensemble interdisent
// les deux façons de se tromper — reposer le voile, ou supprimer l'animation.
test('aucun voile au rendu serveur (garde du correctif F-05)', async ({
  page,
}) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  // Style INLINE que framer-motion écrirait côté serveur, avant hydratation.
  const inline = await page
    .locator('[data-reveal]')
    .first()
    .getAttribute('style');
  console.log(`[reveal] style inline servi : ${JSON.stringify(inline)}`);
  expect(
    (inline ?? '').replace(/\s/g, ''),
    'le HTML servi ne doit plus masquer le contenu',
  ).not.toContain('opacity:0');
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
