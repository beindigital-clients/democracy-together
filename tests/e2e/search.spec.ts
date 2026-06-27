import { test, expect } from '@playwright/test';
import { seedDirectory } from './_helpers';

test.use({ locale: 'fr-FR' });

// Recherche globale (F-06). S'appuie sur les publications seedées (bibliothèque)
// + l'annuaire seedé.
test.beforeAll(async () => {
  await seedDirectory();
});

test('recherche globale : entrée header -> page -> résultats', async ({
  page,
}) => {
  await page.goto('/fr');

  // icône recherche du header -> /recherche
  await page.getByRole('banner').getByRole('link', { name: 'Recherche' }).click();
  await expect(page).toHaveURL(/\/fr\/recherche$/);

  // un terme présent dans les publications seedées (thème démocratie)
  await page.getByRole('searchbox').fill('démocratie');
  await page.getByRole('button', { name: 'Rechercher' }).click();
  await expect(page).toHaveURL(/[?&]q=/);

  // au moins la section Publications
  await expect(
    page.getByRole('heading', { name: 'Publications' }),
  ).toBeVisible();

  // un terme sans résultat
  await page.getByRole('searchbox').fill('zzzxqkw');
  await page.getByRole('button', { name: 'Rechercher' }).click();
  await expect(page.getByText(/Aucun résultat/)).toBeVisible();
});
