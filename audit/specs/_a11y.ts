import { type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// THE AUDIT'S ACCESSIBILITY METHODOLOGY — a single one, and it is the repo's.
//
// It is written HERE rather than copied into each spec because the
// first version of the audit used a different one: without playing the
// `Reveal`s, and without setting aside `color-contrast`. It reported hundreds of
// serious violations, almost all of which were (a) text measured at
// opacity:0 — a contrast false positive — and (b) a brand palette
// decision that the repo explicitly deferred and documented
// (`DEFERRED_RULES` in tests/e2e/a11y.spec.ts).
//
// The report was corrected. The spec, however, had stayed on the old
// method: it went red thirty-six times for a decision already made, which
// is the best way to teach a reviewer to ignore red.
// An instrument is only worth anything if it is the same everywhere.
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const DIFFEREES = ['color-contrast'];

/**
 * Brings the `Reveal`s (`once:true`) to their final state before analysis: without
 * this, axe reads the color of text that is still faded.
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
 * Analyzes an open page and separates what BLOCKS from what is DEFERRED.
 *
 * A single axe pass, without `disableRules`: deferred rules are
 * excluded from the verdict but still COUNTED, so that the cost of the palette
 * decision stays visible in the logs instead of disappearing.
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
