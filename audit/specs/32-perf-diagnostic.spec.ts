import { test, expect } from '@playwright/test';

// Diagnostic F-05 : QUEL élément est le LCP, et qu'est-ce qui le retient ?
// Sans cette réponse, toute « optimisation » est une supposition.
const CIBLES = ['/fr/barometre', '/fr'];

for (const route of CIBLES) {
  test(`diagnostic ${route}`, async ({ page }) => {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: (400 * 1024) / 8,
      uploadThroughput: (400 * 1024) / 8,
      latency: 400,
    });

    const ressources: { url: string; ko: number; fin: number }[] = [];
    page.on('response', async (r) => {
      try {
        const len = parseInt(
          (await r.headerValue('content-length')) ?? '0',
          10,
        );
        ressources.push({
          url: new URL(r.url()).pathname.slice(-58),
          ko: Math.round((len || 0) / 1024),
          fin: Date.now(),
        });
      } catch {
        /* réponse disparue */
      }
    });

    const t0 = Date.now();
    await page.goto(route, { waitUntil: 'load', timeout: 180_000 });
    await page.waitForTimeout(4000);

    const lcp = await page.evaluate(
      () =>
        new Promise<{
          ms: number;
          tag: string;
          cls: string;
          taille: string;
          texte: string;
        }>((resolve) => {
          let best: { ms: number; el: Element | null } = { ms: 0, el: null };
          new PerformanceObserver((l) => {
            for (const e of l.getEntries()) {
              const lc = e as PerformanceEntry & {
                element?: Element;
                size?: number;
              };
              if (e.startTime >= best.ms)
                best = { ms: e.startTime, el: lc.element ?? null };
            }
          }).observe({ type: 'largest-contentful-paint', buffered: true });
          setTimeout(() => {
            const el = best.el;
            const r = el?.getBoundingClientRect();
            resolve({
              ms: Math.round(best.ms),
              tag: el?.tagName ?? '(aucun)',
              cls: (el?.className ?? '').toString().slice(0, 70),
              taille: r
                ? `${Math.round(r.width)}×${Math.round(r.height)}`
                : '—',
              texte: (el?.textContent ?? '').trim().slice(0, 60),
            });
          }, 500);
        }),
    );

    const lourdes = ressources
      .filter((r) => r.ko > 0)
      .sort((a, b) => b.ko - a.ko)
      .slice(0, 8)
      .map((r) => `${r.ko}Ko ${r.url} @+${r.fin - t0}ms`);

    console.log(`[diag] ${route}`);
    console.log(
      `  LCP ${lcp.ms}ms -> <${lcp.tag}> ${lcp.taille} "${lcp.texte}"`,
    );
    console.log(`  classe: ${lcp.cls}`);
    console.log(
      `  requêtes: ${ressources.length}, total ${Math.round(ressources.reduce((s, r) => s + r.ko, 0))}Ko`,
    );
    for (const l of lourdes) console.log(`    ${l}`);
    expect(lcp.ms).toBeGreaterThan(0);
  });
}
