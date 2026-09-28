import { test, expect } from '@playwright/test';
import { choixLangue, ouvrirSelecteurDeLangue } from './_langue';

// Issue #35 — the language selector did switch /fr/… to /en/…, but
// dropped the query string: a visitor who had filtered the library
// landed back on /en/bibliotheque, all their filters lost.
//
// This is not a UX detail: the project deliberately puts facets
// in the URL so that they are shareable and indexable. The language selector
// was the only place on the site that broke that contract.
//
// THE GESTURE CHANGED SHAPE, NOT STAKES. The selector became a menu
// (see `_langue.ts`): it must be opened before choosing. What these tests
// check is unchanged — the landing address, query string included.
//
// WHY THE F-13 GUARD MOVED TO A DIFFERENT CLICK.
// The language toggle is the gesture that audit F-13 measured as losing
// its click: fired right after `page.goto()`, it NEVER succeeds under 4x CPU
// throttling (0/6), whereas it always succeeds once the page has settled.
// The exposed click is now the one that OPENS the menu, and it is
// `ouvrirSelecteurDeLangue` that protects it.
//
// The click on the language itself stays bare — and it is better founded than before. The
// menu only opens via `useState`: a VISIBLE menu proves that React has
// taken over, hence that the page is hydrated. That is precisely the
// condition whose absence made the click get lost. Nor can we
// protect it with `cliquerJusqua`: choosing a language CLOSES the menu, so
// re-clicking would target a detached element — the gesture is no longer idempotent.
//
// What remains of the risk is the WAIT: `router.replace` triggers a
// server navigation, and an assertion's default timeout (5 s) is short
// for a loaded runner. The URL assertions therefore keep the generous budget that
// `cliquerJusqua` gave them — we wait as long as before, without re-clicking.
const NAVIGATION = { timeout: 20_000 };

test('bibliothèque filtrée : la bascule de langue garde les filtres (#35)', async ({
  page,
}) => {
  const query = 'theme=participation&type=rapport&sort=cited&page=2';
  await page.goto(`/fr/bibliotheque?${query}`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

  await ouvrirSelecteurDeLangue(page);
  await choixLangue(page, 'en').click();
  await expect(page).toHaveURL(`/en/bibliotheque?${query}`, NAVIGATION);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  // ...and switching back does not lose them either.
  await ouvrirSelecteurDeLangue(page);
  await choixLangue(page, 'fr').click();
  await expect(page).toHaveURL(`/fr/bibliotheque?${query}`, NAVIGATION);
});

test('recherche : la bascule de langue garde la requête saisie (#35)', async ({
  page,
}) => {
  await page.goto('/fr/recherche?q=participation');

  await ouvrirSelecteurDeLangue(page);
  await choixLangue(page, 'en').click();
  await expect(page).toHaveURL('/en/recherche?q=participation', NAVIGATION);
});

test('page sans filtre : la bascule ne laisse pas de « ? » orphelin (#35)', async ({
  page,
}) => {
  await page.goto('/fr/le-reseau');

  await ouvrirSelecteurDeLangue(page);
  await choixLangue(page, 'en').click();
  await expect(page).toHaveURL('/en/le-reseau', NAVIGATION);
});
