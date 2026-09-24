import { test, expect } from '@playwright/test';
import { revealAll, attendreAucuneViolationGrave } from './_a11y';

test.use({ locale: 'fr-FR' });

// Les instruments (déroulement des Reveal, tags WCAG, règles différées,
// résumé des violations) vivent dans `_a11y.ts` depuis que les specs
// mobiles en ont besoin elles aussi : deux copies auraient divergé.

// F-08 — Accessibilité : scan axe (WCAG 2.0/2.1 A & AA) des pages publiques
// clés. On bloque sur les violations à impact « serious » ou « critical » (les
// plus pénalisantes) ; le détail des nœuds est affiché en cas d'échec.
const PAGES = [
  '/fr',
  '/fr/a-propos',
  '/fr/bibliotheque',
  '/fr/bibliotheque/etat-democratie-afrique-europe',
  '/fr/le-reseau',
  '/fr/evenements',
  '/fr/evenements/webinaire-gouvernance-plateformes',
  '/fr/jeunes',
  '/fr/barometre',
  '/fr/thematiques',
  '/fr/thematiques/transitions',
  '/fr/rapports',
  '/fr/rapports/2026',
  '/fr/tribune',
  '/fr/actualites',
  '/fr/contact',
  '/fr/adhesion',
  '/fr/newsletter',
  '/fr/recherche',
  '/fr/mentions-legales',
  '/fr/confidentialite',
  '/fr/accessibilite',
];

for (const path of PAGES) {
  test(`a11y : ${path} (F-08)`, async ({ page }) => {
    await page.goto(path);
    await revealAll(page);
    await attendreAucuneViolationGrave(page, `a11y ${path}`);
  });
}

// Le bandeau de consentement (état vierge) doit aussi être accessible.
test.describe('a11y : bandeau de consentement (F-08)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('/fr avec bandeau cookies', async ({ page }) => {
    await page.goto('/fr');
    await expect(
      page.getByRole('region', { name: 'Gestion des cookies' }),
    ).toBeVisible();
    await revealAll(page);
    await attendreAucuneViolationGrave(page, 'a11y bandeau de consentement');
  });
});
