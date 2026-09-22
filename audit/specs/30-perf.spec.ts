import { test, expect } from '@playwright/test';

// 3 pages représentatives × 3 mesures, médiane retenue.
// Convex étant injoignable ici, on prend des pages qui n'en dépendent pas :
// accueil (hero animé), barometre (data-viz + d3/topojson), adhesion (formulaire).
const PAGES = ['/fr', '/fr/barometre', '/fr/adhesion'];
const MESURES = 3;

type Mesure = {
  lcp: number;
  cls: number;
  octets: number;
  requetes: number;
  domContentLoaded: number;
};

function mediane(xs: number[]): number {
  const t = [...xs].sort((a, b) => a - b);
  return t[Math.floor(t.length / 2)];
}

for (const route of PAGES) {
  test(`perf ${route}`, async ({ page }) => {
    const mesures: Mesure[] = [];

    for (let i = 0; i < MESURES; i++) {
      let octets = 0;
      let requetes = 0;
      const onResp = async (r: import('@playwright/test').Response) => {
        requetes++;
        try {
          const l = (await r.headerValue('content-length')) ?? '0';
          octets += parseInt(l, 10) || 0;
        } catch {
          /* réponse disparue */
        }
      };
      page.on('response', onResp);

      await page.goto(route, { waitUntil: 'load' });
      await page.waitForTimeout(2500); // laisse LCP/CLS se stabiliser

      const vitals = await page.evaluate(
        () =>
          new Promise<{ lcp: number; cls: number; dcl: number }>((resolve) => {
            let lcp = 0;
            let cls = 0;
            new PerformanceObserver((l) => {
              for (const e of l.getEntries()) lcp = Math.max(lcp, e.startTime);
            }).observe({ type: 'largest-contentful-paint', buffered: true });
            new PerformanceObserver((l) => {
              for (const e of l.getEntries()) {
                const s = e as PerformanceEntry & {
                  value: number;
                  hadRecentInput: boolean;
                };
                if (!s.hadRecentInput) cls += s.value;
              }
            }).observe({ type: 'layout-shift', buffered: true });
            const nav = performance.getEntriesByType(
              'navigation',
            )[0] as PerformanceNavigationTiming;
            setTimeout(
              () =>
                resolve({ lcp, cls, dcl: nav?.domContentLoadedEventEnd ?? 0 }),
              400,
            );
          }),
      );

      page.off('response', onResp);
      mesures.push({
        lcp: vitals.lcp,
        cls: vitals.cls,
        octets,
        requetes,
        domContentLoaded: vitals.dcl,
      });
    }

    const r = {
      route,
      lcp_ms: Math.round(mediane(mesures.map((m) => m.lcp))),
      cls: +mediane(mesures.map((m) => m.cls)).toFixed(4),
      dcl_ms: Math.round(mediane(mesures.map((m) => m.domContentLoaded))),
      ko_transferes: Math.round(mediane(mesures.map((m) => m.octets)) / 1024),
      requetes: mediane(mesures.map((m) => m.requetes)),
      lcp_brut: mesures.map((m) => Math.round(m.lcp)),
    };
    console.log(`[perf] ${JSON.stringify(r)}`);

    // Seuils annoncés : LCP < 2500 ms, CLS < 0.1.
    expect(r.lcp_ms, `${route} : LCP`).toBeLessThan(2500);
    expect(r.cls, `${route} : CLS`).toBeLessThan(0.1);
  });
}
