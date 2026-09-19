import { test, expect } from '@playwright/test';

test.use({ locale: 'fr-FR' });

test('jeunes : toutes les sections du hub (F-40)', async ({ page }) => {
  await page.goto('/fr/jeunes');

  await expect(page.getByRole('heading', { level: 1 })).toContainText('agir');
  // Parcours : 4 étapes
  await expect(
    page.getByRole('heading', { name: 'Quatre étapes, à ton rythme' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Découvrir' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mentorer' })).toBeVisible();
  // Gamification
  await expect(
    page.getByRole('heading', { name: 'Ta progression compte' }),
  ).toBeVisible();
  // Programmes
  await expect(
    page.getByRole('heading', { name: 'Les programmes' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Mentorat', exact: true }),
  ).toBeVisible();
  // Mentorat + témoignage + stats
  await expect(
    page.getByRole('heading', { name: 'Un binôme, pas un formulaire' }),
  ).toBeVisible();
  await expect(page.getByText('Jeunes engagés')).toBeVisible();
  // CTA → /adhesion
  await expect(
    page.getByRole('heading', { name: 'Prêt à rejoindre le hub ?' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Créer mon profil' }).click();
  await expect(page).toHaveURL(/\/fr\/adhesion$/);
});

test('jeunes : accès via la nav + version EN (F-03/F-40)', async ({ page }) => {
  await page.goto('/fr');
  await page
    .getByRole('banner')
    .getByRole('link', { name: 'Jeunes', exact: true })
    .click();
  await expect(page).toHaveURL(/\/fr\/jeunes$/);

  await page.goto('/en/jeunes');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('act');
  await expect(
    page.getByRole('heading', { name: 'Four steps, at your own pace' }),
  ).toBeVisible();
});
