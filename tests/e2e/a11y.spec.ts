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

// THÈME SOMBRE (lot 3 du 27/09) : la palette sombre a ses propres encres
// (`--bar-5`, `--bar-1`, `--accent-contrast`…) ; `color-contrast` étant
// revenu dans le gate, on le mesure aussi là où les données et les univers
// colorés s'affichent. Sans `dt-theme` en stockage, le thème suit
// `prefers-color-scheme` (cf. `themeInit` dans le layout de langue).
const PAGES_SOMBRE = [
  '/fr',
  '/fr/jeunes',
  '/fr/barometre',
  '/fr/le-reseau',
  '/fr/tribune',
  '/fr/rapports/2026',
  '/fr/adhesion',
];

test.describe('a11y : thème sombre (F-08)', () => {
  test.use({ colorScheme: 'dark' });

  for (const path of PAGES_SOMBRE) {
    test(`a11y sombre : ${path}`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
      await revealAll(page);
      await attendreAucuneViolationGrave(page, `a11y sombre ${path}`);
    });
  }
});
