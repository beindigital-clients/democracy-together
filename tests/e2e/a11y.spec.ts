import { test, expect } from '@playwright/test';
import { revealAll, attendreAucuneViolationGrave } from './_a11y';

test.use({ locale: 'fr-FR' });

// The instruments (unrolling the Reveals, WCAG tags, deferred rules,
// violation summary) live in `_a11y.ts` since the mobile specs
// need them too: two copies would have diverged.

// F-08 — Accessibility: axe scan (WCAG 2.0/2.1 A & AA) of the key public
// pages. We block on violations with "serious" or "critical" impact (the
// most penalizing); node details are shown on failure.
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

// The consent banner (blank state) must also be accessible.
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

// DARK THEME (batch 3 of 27/09): the dark palette has its own inks
// (`--bar-5`, `--bar-1`, `--accent-contrast`…); since `color-contrast` is
// back in the gate, we also measure it where the data and the colored
// universes are displayed. Without `dt-theme` in storage, the theme follows
// `prefers-color-scheme` (see `themeInit` in the locale layout).
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
