import { type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// MÉTHODOLOGIE D'ACCESSIBILITÉ DE L'AUDIT — une seule, et c'est celle du dépôt.
//
// Elle est écrite ICI plutôt que recopiée dans chaque spec parce que la
// première version de l'audit en avait employé une autre : sans dérouler les
// `Reveal`, et sans écarter `color-contrast`. Elle annonçait des centaines de
// violations graves dont la quasi-totalité étaient (a) du texte mesuré à
// opacity:0 — un faux positif de contraste — et (b) un arbitrage de palette de
// marque que le dépôt a explicitement différé et documenté
// (`DEFERRED_RULES` dans tests/e2e/a11y.spec.ts).
//
// Le rapport a été corrigé. La spec, elle, était restée sur l'ancienne
// méthode : elle rougissait trente-six fois pour une décision déjà prise, ce
// qui est la meilleure façon d'apprendre à un relecteur à ignorer le rouge.
// Un instrument ne vaut que s'il est le même partout.
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const DIFFEREES = ['color-contrast'];

/**
 * Amène les `Reveal` (`once:true`) à leur état final avant l'analyse : sans
 * cela, axe lit la couleur d'un texte encore fondu.
 */
export async function deroulerLesReveals(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const pas = window.innerHeight;
    const total = document.body.scrollHeight;
    for (let y = 0; y <= total; y += pas) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 110));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(900);
}

/**
 * Analyse une page ouverte et sépare ce qui BLOQUE de ce qui est DIFFÉRÉ.
 *
 * Un seul passage d'axe, sans `disableRules` : les règles différées sont
 * écartées du verdict mais restent COMPTÉES, pour que le coût de l'arbitrage
 * de palette reste visible dans les journaux au lieu de disparaître.
 */
export async function scanA11y(
  page: Page,
): Promise<{ graves: string[]; differees: string[] }> {
  await deroulerLesReveals(page);
  const { violations } = await new AxeBuilder({ page })
    .withTags(WCAG)
    .analyze();

  const graves = violations
    .filter(
      (v) =>
        (v.impact === 'serious' || v.impact === 'critical') &&
        !DIFFEREES.includes(v.id),
    )
    .flatMap((v) =>
      v.nodes.map((n) => `${v.id} [${v.impact}] ${n.target.join(' ')}`),
    );

  const differees = violations
    .filter((v) => DIFFEREES.includes(v.id))
    .map((v) => `${v.id}(${v.nodes.length})`);

  return { graves, differees };
}
