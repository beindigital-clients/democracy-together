import { test, expect, type Page } from '@playwright/test';
import { PUBLIQUES } from './_routes';
import { scanA11y, deroulerLesReveals } from './_a11y';

// BLIND SPOT 2 — the mobile viewport, never measured.
//
// The audit config declared a `mobile` project (Pixel 7) from the start; it
// had never been run. Replayed as-is on it, the suite passes: 159
// tests, 0 failures. That is a result, but it doesn't say much —
// most of the suite (SEO, headers, robots, no-JS rendering, i18n) reads
// tags and HTTP responses, which the window width does not change.
//
// This file covers ONLY what differs, and it starts by checking the
// instrument: a green suite on a viewport it had never seen
// deserves asking first whether it saw it this time.
test.skip(({ isMobile }) => !isMobile, 'projet mobile seulement');

// ---------------------------------------------------------------------------
// WCAG 2.2, success criterion 2.5.8 "Target Size (Minimum)", level AA.
//
// A target is at least 24 × 24 CSS px, UNLESS:
//   — "Spacing": a 24 px diameter circle centered on it does not
//     intersect the RECTANGLE of another target, nor the CIRCLE of another
//     undersized target;
//   — "Inline": the target is in a sentence;
//   — the control is left to the browser, or the presentation is essential.
//
// The spacing exception is not a formality: a naive sweep, which only
// looks at size, returns 568 targets across 24 pages here. Publishing that number
// would repeat the mistake this report denounces elsewhere — a noisy scan does
// not just overestimate, it HIDES. Once the rule is actually applied,
// zero remain.
function detecteur(page: Page) {
  return page
    .locator('a, button, [role="button"], input:not([type="hidden"]), select')
    .evaluateAll((els) => {
      const cibles = els
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            el,
            // Center AND corner. Mixing them up shifts each rectangle by
            // half a width: the first version of this detector thus
            // reported a non-conformity at −6 px on /fr/connexion that did not
            // exist — measured by hand, the real distance was 29 px.
            cx: r.x + r.width / 2,
            cy: r.y + r.height / 2,
            gauche: r.x,
            haut: r.y,
            w: r.width,
            h: r.height,
            quoi: `${el.tagName.toLowerCase()}:${(el.textContent || el.getAttribute('aria-label') || '?').trim().slice(0, 30)}`,
          };
        })
        .filter((c) => c.w > 0 && c.h > 0);

      const distanceAuRect = (
        px: number,
        py: number,
        r: { gauche: number; haut: number; w: number; h: number },
      ) =>
        Math.hypot(
          Math.max(r.gauche - px, 0, px - (r.gauche + r.w)),
          Math.max(r.haut - py, 0, py - (r.haut + r.h)),
        );

      return cibles
        .filter((c) => c.w < 24 || c.h < 24)
        .map((c) => {
          let marge = Infinity;
          let voisine = '';
          for (const o of cibles) {
            if (o.el === c.el) continue;
            const petite = o.w < 24 || o.h < 24;
            // Remaining margin before violation: > 0 = compliant with respect
            // to that particular neighbor.
            const m = petite
              ? Math.hypot(c.cx - o.cx, c.cy - o.cy) - 24
              : distanceAuRect(c.cx, c.cy, o) - 12;
            if (m < marge) {
              marge = m;
              voisine = o.quoi;
            }
          }
          return {
            quoi: c.quoi,
            taille: `${Math.round(c.w)}x${Math.round(c.h)}`,
            margeManquante: Math.round(marge * 10) / 10,
            voisine,
          };
        })
        .filter((c) => c.margeManquante < 0);
    });
}

test("l'instrument est bien un téléphone", async ({ page }) => {
  await page.goto('/fr');
  const vu = await page.evaluate(() => ({
    largeur: window.innerWidth,
    pointeurGrossier: window.matchMedia('(pointer: coarse)').matches,
    pointsTactiles: navigator.maxTouchPoints,
    ua: navigator.userAgent,
    dpr: window.devicePixelRatio,
  }));
  console.log('[mobile] instrument', JSON.stringify(vu));

  // Without these four, everything that follows would measure a desktop browser
  // in a narrow window — which is not the same thing.
  expect(vu.largeur, 'largeur de viewport').toBeLessThanOrEqual(480);
  expect(vu.pointeurGrossier, 'media query (pointer: coarse)').toBe(true);
  expect(vu.pointsTactiles, 'points tactiles').toBeGreaterThan(0);
  expect(vu.ua, 'user-agent').toMatch(/Android/);
});

test('sous 1120 px, le menu est le SEUL chemin de navigation', async ({
  page,
}) => {
  await page.goto('/fr');

  // If the desktop navigation stayed visible here, the 24 accessibility
  // analyses of the mobile project would in fact have scanned a desktop
  // bar — and the mobile panel would have been seen by no one: neither on desktop
  // (hidden), nor on mobile (closed).
  const menu = page.locator('button[aria-controls="mobile-nav"]');
  await expect(menu).toBeVisible();
  await expect(page.locator('#mobile-nav')).toHaveCount(0);

  await menu.click();
  const panneau = page.locator('#mobile-nav');
  await expect(panneau).toBeVisible();
  await expect(panneau).toHaveAttribute('aria-modal', 'true');
  await expect(menu).toHaveAttribute('aria-expanded', 'true');

  const liens = await panneau.getByRole('link').count();
  console.log('[mobile] liens dans le panneau =', liens);
  expect(liens, 'panneau vide : le test ne mesurerait rien').toBeGreaterThan(5);
});

test("a11y du menu mobile OUVERT — l'écran que personne n'avait scanné", async ({
  page,
}) => {
  await page.goto('/fr', { waitUntil: 'domcontentloaded' });
  await deroulerLesReveals(page);
  await page.locator('button[aria-controls="mobile-nav"]').click();
  await expect(page.locator('#mobile-nav')).toBeVisible();

  const { graves, differees } = await scanA11y(page);
  console.log(
    `[mobile] a11y menu ouvert graves=${graves.length} ` +
      `différées=${differees.join(' ') || 'aucune'}`,
  );
  if (graves.length) console.log('[mobile] graves:', graves.join(' | '));
  expect(graves, 'menu mobile ouvert : violations graves').toEqual([]);
});

test('le détecteur 2.5.8 sait ÉCHOUER (non-vacuité)', async ({ page }) => {
  await page.goto('/fr');
  // Two 16 px targets placed 10 px from each other: non-compliant in
  // both possible ways (too small AND too close). A detector that
  // lets them through measures nothing, and its zero is worthless.
  await page.evaluate(() => {
    const d = document.createElement('div');
    d.style.cssText = 'position:fixed;left:8px;top:300px;z-index:99999';
    d.innerHTML =
      '<a href="#a" style="position:absolute;left:0;top:0;width:16px;height:16px;display:block">a</a>' +
      '<a href="#b" style="position:absolute;left:10px;top:0;width:16px;height:16px;display:block">b</a>';
    document.body.appendChild(d);
  });
  const fautives = await detecteur(page);
  console.log('[mobile] témoin injecté ->', JSON.stringify(fautives));
  expect(fautives.length, 'le détecteur laisse passer un cas évident').toBe(2);
});

test('2.5.8 sur les 24 pages publiques, exception d’espacement appliquée', async ({
  page,
}) => {
  const resultat: Record<string, unknown> = {};
  for (const route of PUBLIQUES) {
    await page.goto(`/fr${route}`, { waitUntil: 'domcontentloaded' });
    await deroulerLesReveals(page);
    const fautives = await detecteur(page);
    if (fautives.length) resultat[`/fr${route || '/'}`] = fautives;
  }
  console.log('[mobile] 2.5.8 non conformes :', JSON.stringify(resultat));
  expect(resultat, 'cibles tactiles non conformes à WCAG 2.5.8').toEqual({});
});

test('2.5.8 dans le menu mobile ouvert', async ({ page }) => {
  await page.goto('/fr');
  await page.locator('button[aria-controls="mobile-nav"]').click();
  await expect(page.locator('#mobile-nav')).toBeVisible();
  const fautives = await detecteur(page);
  console.log('[mobile] 2.5.8 menu ouvert :', JSON.stringify(fautives));
  expect(fautives, 'cibles du menu non conformes à WCAG 2.5.8').toEqual([]);
});
