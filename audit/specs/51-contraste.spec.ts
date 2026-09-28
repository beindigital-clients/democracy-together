import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PUBLIQUES } from './_routes';
import { deroulerLesReveals } from './_a11y';

test.skip(
  ({ isMobile }) => !!isMobile,
  'une seule passe suffit : la palette est la même',
);

// CONTRAST MEASUREMENT, redone from scratch (client decision of 23/09).
//
// The audit's first numbers had been RETRACTED: they counted
// zero-opacity text (animations not played) and reported
// hundreds of violations. Redone properly — Reveals played, one theme at a
// time, and only what axe attributes to `color-contrast` — a few dozen
// remain, each with its two colors and ratio.
//
// This file REPORTS, it does not decide: `color-contrast` stays out of the
// verdict (see `_a11y.ts`) until the palette has been decided. Its reason
// for being is that a color decision is made on pairs and
// ratios, not on a global number — and that global number, the first
// time, was wrong.
//
// WHAT IT HAS ALREADY HELPED FIND: in dark mode, the "jeunes" universe kept
// its light-theme tokens, because `[data-theme][data-universe]` requires both
// attributes on the same element whereas they live on <html> and on a
// page <div>. 14 nodes out of 35 came from there. Fixed in globals.css.
for (const theme of ['light', 'dark'] as const) {
  test(`contraste réel — thème ${theme}`, async ({ page }) => {
    test.setTimeout(900_000); // 24 routes × (load + scroll-through + analysis)
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
