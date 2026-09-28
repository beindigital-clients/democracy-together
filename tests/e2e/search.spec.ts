import { test, expect } from '@playwright/test';
import { seedDirectory } from './_helpers';
import { ouvrirPanneau } from './_panneau';

test.use({ locale: 'fr-FR' });

// Global search (F-06). Relies on the seeded publications (library)
// + the seeded directory. The header entry is now a command palette
// (SearchDialog): live search (reactive Convex query) then "Voir tous les
// résultats" to the exhaustive /recherche page (which adds news).
test.beforeAll(async () => {
  await seedDirectory();
});

test('recherche globale : header -> palette -> page -> résultats', async ({
  page,
}) => {
  await page.goto('/fr');

  // Header entry: the search button opens the command palette.
  const dialog = page.getByRole('dialog', { name: 'Rechercher sur le site' });
  await ouvrirPanneau(
    page.getByRole('banner').getByRole('button', { name: 'Recherche' }),
    dialog,
    'palette de recherche',
  );

  // Live search in the palette: the Publications section appears (term
  // present in the seeded publications).
  await dialog.getByRole('combobox').fill('démocratie');
  // A named option GROUP, no longer a heading: the `listbox` can only
  // contain groups and options (RGAA audit of 27/09, 7.1).
  await expect(
    dialog.getByRole('group', { name: 'Publications' }),
  ).toBeVisible();

  // "Voir tous les résultats" -> exhaustive /recherche page.
  await dialog.getByRole('link', { name: 'Voir tous les résultats' }).click();
  await expect(page).toHaveURL(/\/fr\/recherche\?q=/);
  await expect(
    page.getByRole('heading', { name: 'Publications' }),
  ).toBeVisible();

  // Term with no results via the page's form.
  await page.getByRole('searchbox').fill('zzzxqkw');
  await page.getByRole('button', { name: 'Rechercher' }).click();
  await expect(page.getByText(/Aucun résultat/)).toBeVisible();
});

test('recherche : la palette se ferme à Échap (F-06)', async ({ page }) => {
  await page.goto('/fr');
  const dialog = page.getByRole('dialog', { name: 'Rechercher sur le site' });
  await ouvrirPanneau(
    page.getByRole('banner').getByRole('button', { name: 'Recherche' }),
    dialog,
    'palette de recherche',
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
