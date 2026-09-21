import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// MÊME méthodologie que tests/e2e/a11y.spec.ts : on déroule les reveals
// (sinon axe lit des textes à opacity:0 et produit de faux positifs de
// contraste) et on désactive `color-contrast`, écart assumé et documenté par
// le dépôt (palette de marque, arbitrage RGAA annoncé).
// Seule différence : le PÉRIMÈTRE. Ces 10 pages publiques ne figurent pas
// dans la liste PAGES de la spec du dépôt.
async function revealAll(page: Page): Promise<void> {
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

const HORS_PERIMETRE = [
  '/fr/appels-a-projets',
  '/fr/connexion',
  '/fr/connexion-otp',
  '/fr/don',
  '/fr/evenements/calendrier',
  '/fr/mot-de-passe-oublie',
  '/fr/newsletter/desinscription',
  '/fr/partenaires',
  '/fr/presse',
  '/fr/replays',
];

for (const path of HORS_PERIMETRE) {
  test(`a11y (méthodo dépôt) ${path}`, async ({ page }) => {
    await page.goto(path);
    await revealAll(page);
    const { violations } = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .disableRules(['color-contrast'])
      .analyze();
    const graves = violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .flatMap((v) =>
        v.nodes.map((n) => `${v.id} [${v.impact}] ${n.target.join(' ')}`),
      );
    console.log(
      `[a11y-hp] ${path} -> ${graves.length ? graves.join(' | ') : 'RAS'}`,
    );
    expect(graves).toEqual([]);
  });
}
