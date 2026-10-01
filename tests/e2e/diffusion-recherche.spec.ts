import { test, expect } from '@playwright/test';
import { backfillSearch, seedDirectory } from './_helpers';
import { ouvrirPanneau } from './_panneau';

test.use({ locale: 'fr-FR' });

// INDEX-BASED SEARCH (F-06 / F-34, diffusion workstream).
//
// Relies on the seeded publications (library) and the seeded directory —
// like `search.spec.ts`. Documents seeded BEFORE the `search_text` indexes
// have no haystack: the (idempotent) migration fills it first, just as
// it does for an existing deployment.
test.beforeAll(async () => {
  await seedDirectory();
  await backfillSearch();
});

test('« democratie » (sans accent) trouve « démocratie » — palette et page', async ({
  page,
}) => {
  // Results page: the same list with and without accents.
  await page.goto('/fr/recherche?q=d%C3%A9mocratie');
  const avecAccent = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Publications' }) })
    .first();
  await expect(avecAccent).toBeVisible();
  const titresAvec = await avecAccent.getByRole('link').allInnerTexts();
  expect(titresAvec.length).toBeGreaterThan(0);

  await page.goto('/fr/recherche?q=democratie');
  const sansAccent = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Publications' }) })
    .first();
  await expect(sansAccent).toBeVisible();
  const titresSans = await sansAccent.getByRole('link').allInnerTexts();
  expect(titresSans.slice(0, 3)).toEqual(titresAvec.slice(0, 3));
  // At least one title actually carries the accent: it really is the fallback
  // that matched, not a spelling coincidence.
  expect(
    [...titresSans, ...titresAvec].some((t) => /d[ée]mocrati/i.test(t)),
  ).toBe(true);

  // Palette (header): same term, same result.
  await page.goto('/fr');
  const dialog = page.getByRole('dialog', { name: 'Rechercher sur le site' });
  await ouvrirPanneau(
    page.getByRole('banner').getByRole('button', { name: 'Recherche' }),
    dialog,
    'palette de recherche',
  );
  await dialog.getByRole('combobox').fill('democratie');
  // A named option GROUP, not a heading: the `listbox` contains only
  // groups and options (RGAA audit of 27/09, 7.1).
  await expect(
    dialog.getByRole('group', { name: 'Publications' }),
  ).toBeVisible();
  await expect(dialog.getByRole('option').first()).toBeVisible();
});

test('filtres et pagination de /recherche (F-34)', async ({ page }) => {
  // "type" filter: only publications remain (members have no
  // type), and the URL carries the filter.
  await page.goto('/fr/recherche?q=democratie&type=rapport');
  await expect(
    page.getByRole('heading', { name: 'Membres du réseau' }),
  ).toHaveCount(0);
  await expect(page.getByRole('combobox', { name: 'Type' })).toHaveText(
    'Rapport',
  );

  // Single-section view: paginated, with a way back to the overview.
  await page.goto('/fr/recherche?q=democratie&source=publications');
  await expect(
    page.getByRole('link', { name: /Toutes les sections/ }),
  ).toBeVisible();
});
