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

// LA GARDE NE REGARDAIT QU'UNE ROUTE (angle mort 2).
//
// `/fr/barometre` était la page du constat F-05, donc celle qu'on a gardée. Le
// balayage mobile a montré que le correctif ne couvre PAS l'accueil : `/fr`
// sert encore 7 `opacity:0` dans son HTML. La raison est nette une fois vue —
// `HomeHero` n'utilise pas `Reveal`. Il pose ses propres `motion.p` avec
// `initial={{ opacity: 0 }}`, c'est-à-dire exactement le motif que F-05 a
// retiré partout ailleurs. Corriger `Reveal` ne pouvait donc rien y faire, et
// une garde sur une seule route ne pouvait pas le dire.
//
// Pourquoi ça ne se voyait pas en desktop : le plus grand élément y est le
// `<h1>`, révélé mot à mot dès 0,18 s — il peint tôt, et le LCP est bon
// (312 ms). Sur 412 px de large le `<h1>` rétrécit, le PARAGRAPHE d'accroche
// devient le plus grand, et lui attend la fin de la séquence du titre :
// `delay = 0,18 + 6 mots × 0,075 + 0,05`, puis 0,85 s de fondu. Mesuré :
// opacité nulle jusqu'à 1 153 ms, pleine à 2 011 ms, LCP médian 2 000 ms.
// Six fois le desktop, sur la plateforme annoncée comme premier usage.
const ROUTES_SERVIES = ['/fr/barometre', '/fr/a-propos', '/fr'];

for (const route of ROUTES_SERVIES) {
  // `/fr` est ATTENDU EN ÉCHEC : le correctif demanderait de renoncer au fondu
  // d'entrée du premier écran de l'accueil, ce que F-05 a assumé pour `Reveal`
  // mais qui, sur un hero chorégraphié volontairement, est un arbitrage de
  // produit et non d'ingénierie. Ce marqueur documente le constat sans
  // maquiller la suite en vert : le jour où l'accueil est corrigé, ce test
  // passe « de façon inattendue » et demande qu'on le retire.
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
