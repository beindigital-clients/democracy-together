import { test, expect } from '@playwright/test';
import { seedDirectory } from './_helpers';

test.use({ locale: 'fr-FR' });

// Recherche globale (F-06). S'appuie sur les publications seedées (bibliothèque)
// + l'annuaire seedé. L'entrée du header est désormais une palette de commande
// (SearchDialog) : recherche live (query Convex réactive) puis « Voir tous les
// résultats » vers la page exhaustive /recherche (qui ajoute les actualités).
test.beforeAll(async () => {
  await seedDirectory();
});

test('recherche globale : header -> palette -> page -> résultats', async ({
  page,
}) => {
  await page.goto('/fr');

  // Entrée header : le bouton recherche ouvre la palette (command palette).
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Recherche' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Rechercher sur le site' });
  await expect(dialog).toBeVisible();

  // Recherche live dans la palette : la section Publications apparaît (terme
  // présent dans les publications seedées).
  await dialog.getByRole('combobox').fill('démocratie');
  await expect(
    dialog.getByRole('heading', { name: 'Publications' }),
  ).toBeVisible();

  // « Voir tous les résultats » -> page exhaustive /recherche.
  await dialog.getByRole('link', { name: 'Voir tous les résultats' }).click();
  await expect(page).toHaveURL(/\/fr\/recherche\?q=/);
  await expect(
    page.getByRole('heading', { name: 'Publications' }),
  ).toBeVisible();

  // Terme sans résultat via le formulaire de la page.
  await page.getByRole('searchbox').fill('zzzxqkw');
  await page.getByRole('button', { name: 'Rechercher' }).click();
  await expect(page.getByText(/Aucun résultat/)).toBeVisible();
});

test('recherche : la palette se ferme à Échap (F-06)', async ({ page }) => {
  await page.goto('/fr');
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'Recherche' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Rechercher sur le site' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
