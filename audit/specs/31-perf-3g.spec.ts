import { test, expect } from '@playwright/test';

// Réseau dégradé : le cadrage annonce un premier usage en Afrique, à faible
// débit. Les chiffres localhost ne disent rien de cette cible.
// Slow 3G : 400 kbit/s descendants, 400 ms de latence aller-retour.
const PAGES = ['/fr', '/fr/barometre'];

for (const route of PAGES) {
  test(`perf Slow-3G ${route}`, async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: (400 * 1024) / 8,
      uploadThroughput: (400 * 1024) / 8,
      latency: 400,
    });

    const t0 = Date.now();
    await page.goto(route, { waitUntil: 'load', timeout: 120_000 });
    const chargement = Date.now() - t0;

    const lcp = await page.evaluate(
      () =>
        new Promise<number>((resolve) => {
          let v = 0;
          new PerformanceObserver((l) => {
            for (const e of l.getEntries()) v = Math.max(v, e.startTime);
          }).observe({ type: 'largest-contentful-paint', buffered: true });
          setTimeout(() => resolve(v), 1500);
        }),
    );

    const texte = (await page.locator('body').innerText()).trim().length;
    console.log(
      `[perf3g] ${route} load=${chargement}ms lcp=${Math.round(lcp)}ms texte=${texte}`,
    );
    expect(texte, `${route} : page vide en 3G`).toBeGreaterThan(100);
  });
}
