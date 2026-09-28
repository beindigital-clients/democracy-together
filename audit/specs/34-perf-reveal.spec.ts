import { test, expect } from '@playwright/test';

// Rerun of the "without Reveal veil" isolation test, with a method whose
// effect we VERIFY. The first version injected a <style> on
// documentElement before <head> existed; nothing proved it survived
// React's render. Here the rule is added to the STYLESHEET itself,
// intercepted in flight, and the test refuses to conclude without having observed it.
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

// This test USED TO SAY the opposite: it required `opacity:0` in the served HTML, which
// was the F-05 diagnosis — a zero-opacity element is not an
// LCP candidate, hence the 12,808 ms on this page on slow 3G. With the finding
// established and fixed, the assertion is reversed: it now guards the
// fix instead of commemorating the defect. If someone puts a veil back in the
// server render, the LCP goes back to twelve seconds — and this test goes red first.
//
// The other half of the contract is held by 35-reveal-integrite.spec.ts:
// the entrance animation must ALWAYS exist. Together, the two forbid
// both ways of getting it wrong — putting the veil back, or removing the animation.
test('aucun voile au rendu serveur (garde du correctif F-05)', async ({
  page,
}) => {
  await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
  // INLINE style that framer-motion would write server-side, before hydration.
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

// THE GUARD ONLY LOOKED AT ONE ROUTE (blind spot 2).
//
// `/fr/barometre` was the F-05 finding's page, so the one that was guarded. The
// mobile sweep showed that the fix does NOT cover the home page: `/fr`
// still serves 7 `opacity:0` in its HTML. The reason is clear once seen —
// `HomeHero` does not use `Reveal`. It sets its own `motion.p` with
// `initial={{ opacity: 0 }}`, i.e. exactly the pattern F-05
// removed everywhere else. Fixing `Reveal` therefore could do nothing there, and
// a guard on a single route could not say so.
//
// Why it didn't show on desktop: the largest element there is the
// `<h1>`, revealed word by word from 0.18 s — it paints early, and the LCP is good
// (312 ms). At 412 px wide the `<h1>` shrinks, the tagline PARAGRAPH
// becomes the largest, and it waits for the end of the title sequence:
// `delay = 0.18 + 6 words × 0.075 + 0.05`, then a 0.85 s fade. Measured:
// zero opacity until 1,153 ms, full at 2,011 ms, median LCP 2,000 ms.
// Six times desktop, on the platform announced as the primary use.
const ROUTES_SERVIES = ['/fr/barometre', '/fr/a-propos', '/fr'];

for (const route of ROUTES_SERVIES) {
  // `/fr` is EXPECTED TO FAIL: the fix would require giving up the entrance
  // fade of the home page's first screen, which F-05 accepted for `Reveal`
  // but which, on a deliberately choreographed hero, is a product trade-off
  // and not an engineering one. This marker documents the finding without
  // painting the suite green: the day the home page is fixed, this test
  // passes "unexpectedly" and asks to be removed.
  const attendu = route === '/fr';
  test(`aucun opacity:0 dans le HTML servi de ${route}`, async ({
    request,
  }) => {
    test.fail(
      attendu,
      'accueil : arbitrage produit, cf. commentaire ci-dessus',
    );
    const html = await (await request.get(route)).text();
    const n = (html.match(/opacity:0/g) ?? []).length;
    console.log(`[reveal] ${route} : ${n} opacity:0 servis`);
    expect(n, `${route} masque du contenu dans le HTML servi`).toBe(0);
  });
}

test('LCP avec le voile retiré — méthode vérifiée', async ({ page }) => {
  await brider(page);
  // The rule is added to the served stylesheet: it cannot be
  // lost when React mounts.
  await page.route('**/*.css', async (route) => {
    const res = await route.fetch();
    const css = await res.text();
    await route.fulfill({
      response: res,
      body: `${css}\n[data-reveal]{opacity:1 !important;transform:none !important}`,
    });
  });
  await page.goto(ROUTE, { waitUntil: 'load', timeout: 180_000 });

  // We OBSERVE the effect before measuring anything.
  const opacite = await page
    .locator('[data-reveal]')
    .first()
    .evaluate((el) => getComputedStyle(el).opacity);
  console.log(`[reveal] opacité calculée après injection : ${opacite}`);
  expect(opacite, 'la règle injectée doit bien s’appliquer').toBe('1');

  await page.waitForTimeout(4000);
  console.log(`[reveal] LCP sans voile : ${await lcp(page)}ms`);
});
