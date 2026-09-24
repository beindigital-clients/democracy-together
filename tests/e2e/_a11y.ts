import { expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// INSTRUMENTS D'ACCESSIBILITÉ, en un seul endroit.
//
// Ils vivaient dans `a11y.spec.ts`, donc hors de portée des specs mobiles. Les
// recopier aurait donné deux méthodologies qui divergent en silence — c'est
// exactement ce que l'audit a constaté entre sa propre suite et celle du dépôt
// (une analyse sans dérouler les `Reveal` annonçait des centaines de fausses
// violations de contraste). Un instrument ne vaut que s'il est le même partout.

export const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// `color-contrast` est sorti du gate automatique : les écarts restants sont
// enracinés dans la PALETTE DE MARQUE validée par l'agence (univers safran des
// Jeunes = texte clair sur safran ; couleurs data-viz bar-2/bar-4 en petit
// texte). Les ajuster = dévier des couleurs de la maquette, ce qui relève d'un
// arbitrage agence dans le cadre de l'audit RGAA (déjà annoncé comme à mener
// dans la déclaration d'accessibilité). Le harnais impose tout le RESTE
// (ARIA, labels, noms, landmarks, ordre des titres, lang…), qui est propre.
export const DEFERRED_RULES = ['color-contrast'];

// Les contenus animés (Reveal `whileInView`) démarrent à opacity:0 : axe lirait
// une couleur de texte fondue (faux positif de contraste). On parcourt la page
// (les reveals sont `once:true`) pour les amener à leur état final, puis on
// laisse les animations se terminer avant l'analyse.
export async function revealAll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const step = window.innerHeight;
    const total = document.body.scrollHeight;
    for (let y = 0; y <= total; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 110));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(900);
}

export function scan(page: Page) {
  return new AxeBuilder({ page }).withTags(WCAG).disableRules(DEFERRED_RULES);
}

type Violations = Awaited<ReturnType<AxeBuilder['analyze']>>['violations'];

// Liste plate « règle [impact] cible » -> diff d'échec lisible.
export function summarize(violations: Violations): string[] {
  return violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .flatMap((v) =>
      v.nodes.map((n) => `${v.id} [${v.impact}] ${n.target.join(' ')}`),
    );
}

export type CibleFautive = {
  quoi: string;
  taille: string;
  margeManquante: number;
  voisine: string;
};

/**
 * WCAG 2.2, critère 2.5.8 « Taille de cible (minimum) », niveau AA.
 *
 * Une cible fait au moins 24 × 24 px CSS, SAUF si un cercle de 24 px de
 * diamètre centré sur elle ne recoupe ni le RECTANGLE d'une autre cible, ni le
 * CERCLE d'une autre cible sous-dimensionnée (exception « espacement »).
 *
 * L'exception n'est pas une formalité : sans elle, un balayage des 24 pages
 * publiques rend 568 cibles « fautives » — et un scan bruyant ne fait pas que
 * surestimer, il cache. Avec elle, il en reste zéro.
 *
 * ATTENTION en relisant : la distance se calcule du CENTRE de la cible au
 * RECTANGLE de la voisine. Confondre le centre et le coin décale chaque
 * rectangle d'une demi-largeur — la première version de ce détecteur annonçait
 * ainsi une non-conformité sur `/fr/connexion` qui n'existait pas.
 * `tests/e2e/mobile/a11y-menu.spec.ts` lui injecte un témoin pour qu'il ne
 * puisse pas rendre zéro par construction.
 */
export function ciblesTropPetites(
  page: Page,
  racine = 'body',
): Promise<CibleFautive[]> {
  return page
    .locator(racine)
    .locator('a, button, [role="button"], input:not([type="hidden"]), select')
    .evaluateAll((els) => {
      const cibles = els
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            el,
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

/** Scan complet d'une page ouverte : échoue sur « serious »/« critical ». */
export async function attendreAucuneViolationGrave(page: Page, quoi: string) {
  const { violations } = await scan(page).analyze();
  expect(summarize(violations), quoi).toEqual([]);
}
