import { test, expect } from '@playwright/test';
import { PUBLIQUES } from './_routes';
import { scanA11y } from './_a11y';

// Accessibilité des pages publiques, méthodologie du dépôt (voir `_a11y.ts`).
//
// PÉRIMÈTRE : `PUBLIQUES` déborde la liste PAGES de tests/e2e/a11y.spec.ts —
// c'est l'apport de l'audit. Les pages que la porte du dépôt ne regarde pas
// (connexion, don, presse, replays, partenaires, calendrier…) sont scannées
// ici avec exactement le même instrument.
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
