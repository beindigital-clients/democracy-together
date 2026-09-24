import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PUBLIQUES } from './_routes';
import { deroulerLesReveals } from './_a11y';

test.skip(
  ({ isMobile }) => !!isMobile,
  'une seule passe suffit : la palette est la même',
);

// MESURE DU CONTRASTE, reprise à zéro (arbitrage client du 23/09).
//
// Les premiers chiffres de l'audit avaient été RÉTRACTÉS : ils comptaient du
// texte à opacité nulle (animations non déroulées) et annonçaient des
// centaines de violations. Repris proprement — Reveals déroulés, un thème à la
// fois, et seulement ce qu'axe attribue à `color-contrast` — il en reste
// quelques dizaines, avec pour chacune les deux couleurs et le ratio.
//
// Ce fichier RAPPORTE, il ne tranche pas : `color-contrast` reste hors du
// verdict (cf. `_a11y.ts`) tant que la palette n'a pas été arbitrée. Sa raison
// d'être est qu'un arbitrage de couleurs se prend sur des paires et des
// ratios, pas sur un nombre global — et que ce nombre global, la première
// fois, était faux.
//
// CE QU'IL A DÉJÀ SERVI À TROUVER : en sombre, l'univers « jeunes » gardait
// ses jetons de thème clair, parce que `[data-theme][data-universe]` exige les
// deux attributs sur le même élément alors qu'ils vivent sur <html> et sur un
// <div> de page. 14 nœuds sur 35 venaient de là. Corrigé dans globals.css.
for (const theme of ['light', 'dark'] as const) {
  test(`contraste réel — thème ${theme}`, async ({ page }) => {
    test.setTimeout(900_000); // 24 routes × (chargement + déroulement + analyse)
    const parPaire = new Map<string, { n: number; ou: Set<string> }>();
    for (const route of PUBLIQUES) {
      await page.goto(`/fr${route}`, { waitUntil: 'domcontentloaded' });
      await page.evaluate((t) => {
        document.documentElement.setAttribute('data-theme', t);
      }, theme);
      await deroulerLesReveals(page);
      const { violations } = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .include('body')
        .analyze();
      for (const v of violations) {
        if (v.id !== 'color-contrast') continue;
        for (const n of v.nodes) {
          const d = (n.any?.[0]?.data ?? {}) as Record<string, unknown>;
          const cle = JSON.stringify({
            fg: d.fgColor,
            bg: d.bgColor,
            ratio: d.contrastRatio,
            exige: d.expectedContrastRatio,
            taille: d.fontSize,
            graisse: d.fontWeight,
          });
          const e = parPaire.get(cle) ?? { n: 0, ou: new Set<string>() };
          e.n += 1;
          e.ou.add(`/fr${route || '/'}`);
          parPaire.set(cle, e);
        }
      }
    }
    const rapport = [...parPaire.entries()]
      .map(([cle, e]) => ({
        ...JSON.parse(cle),
        noeuds: e.n,
        pages: [...e.ou],
      }))
      .sort((a, b) => b.noeuds - a.noeuds);
    console.log(`[contraste ${theme}]`, JSON.stringify(rapport, null, 1));
    expect(true).toBe(true);
  });
}
