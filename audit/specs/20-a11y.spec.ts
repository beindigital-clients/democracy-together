import { test, expect } from '@playwright/test';
import { PUBLIQUES } from './_routes';
import { scanA11y } from './_a11y';

// Accessibility of public pages, repo methodology (see `_a11y.ts`).
//
// SCOPE: `PUBLIQUES` goes beyond the PAGES list of tests/e2e/a11y.spec.ts —
// that is the audit's contribution. Pages the repo's gate does not look at
// (sign-in, donation, press, replays, partners, calendar…) are scanned
// here with exactly the same instrument.
for (const route of PUBLIQUES) {
  test(`a11y fr${route || '/'}`, async ({ page }) => {
    await page.goto(`/fr${route}`, { waitUntil: 'domcontentloaded' });
    const { graves, differees } = await scanA11y(page);
    console.log(
      `[a11y] /fr${route || '/'} graves=${graves.length} ` +
        `différées=${differees.join(' ') || 'aucune'}`,
    );
    expect(graves, `/fr${route || '/'} : violations graves`).toEqual([]);
  });
}
