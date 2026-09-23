import { test, expect, type Page } from '@playwright/test';
import { PUBLIQUES } from './_routes';
import { scanA11y, deroulerLesReveals } from './_a11y';

// ANGLE MORT 2 — le viewport mobile, jamais mesuré.
//
// La config d'audit déclarait un projet `mobile` (Pixel 7) depuis le début ; il
// n'avait jamais été joué. Rejouée telle quelle dessus, la suite passe : 159
// tests, 0 échec. C'est un résultat, mais il ne dit pas grand-chose —
// l'essentiel de la suite (SEO, en-têtes, robots, rendu sans JS, i18n) lit des
// balises et des réponses HTTP, que la largeur de la fenêtre ne change pas.
//
// Ce fichier ne porte QUE sur ce qui diffère, et il commence par vérifier
// l'instrument : une suite verte sur un viewport qu'elle n'avait jamais vu
// mérite qu'on se demande d'abord si elle l'a vu cette fois.
test.skip(({ isMobile }) => !isMobile, 'projet mobile seulement');

// ---------------------------------------------------------------------------
// WCAG 2.2, critère 2.5.8 « Taille de cible (minimum) », niveau AA.
//
// Une cible fait au moins 24 × 24 px CSS, SAUF si :
//   — « Espacement » : un cercle de 24 px de diamètre centré sur elle ne
//     recoupe ni le RECTANGLE d'une autre cible, ni le CERCLE d'une autre
//     cible sous-dimensionnée ;
//   — « En ligne » : la cible est dans une phrase ;
//   — le contrôle est laissé au navigateur, ou la présentation est essentielle.
//
// L'exception d'espacement n'est pas une formalité : un balayage naïf, qui ne
// regarde que la taille, rend 568 cibles sur 24 pages ici. Publier ce nombre
// serait refaire l'erreur que ce rapport dénonce ailleurs — un scan bruyant ne
// fait pas que surestimer, il CACHE. Une fois la règle réellement appliquée,
// il en reste zéro.
function detecteur(page: Page) {
  return page
    .locator('a, button, [role="button"], input:not([type="hidden"]), select')
    .evaluateAll((els) => {
      const cibles = els
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            el,
            // Centre ET coin. Les confondre décale chaque rectangle d'une
            // demi-largeur : la première version de ce détecteur annonçait
            // ainsi une non-conformité à −6 px sur /fr/connexion qui n'existait
            // pas — mesurée à la main, la distance réelle était de 29 px.
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
            // Marge restante avant violation : > 0 = conforme vis-à-vis
            // de cette voisine-là.
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

  // Sans ces quatre-là, tout ce qui suit mesurerait un navigateur de bureau
  // dans une fenêtre étroite — ce qui n'est pas la même chose.
  expect(vu.largeur, 'largeur de viewport').toBeLessThanOrEqual(480);
  expect(vu.pointeurGrossier, 'media query (pointer: coarse)').toBe(true);
  expect(vu.pointsTactiles, 'points tactiles').toBeGreaterThan(0);
  expect(vu.ua, 'user-agent').toMatch(/Android/);
});

test('sous 1120 px, le menu est le SEUL chemin de navigation', async ({
  page,
}) => {
  await page.goto('/fr');

  // Si la navigation de bureau restait visible ici, les 24 analyses
  // d'accessibilité du projet mobile auraient en fait scanné une barre de
  // bureau — et le panneau mobile n'aurait été vu par personne : ni en desktop
  // (masqué), ni en mobile (fermé).
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
  // Deux cibles de 16 px posées à 10 px l'une de l'autre : non conformes des
  // deux façons possibles (trop petites ET trop proches). Un détecteur qui les
  // laisse passer ne mesure rien, et son zéro ne vaut rien.
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
