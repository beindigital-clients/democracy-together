import { test, expect } from '@playwright/test';

test.use({ locale: 'fr-FR' });

test('événements : liste, filtres serveur, vedette → détail riche (F-23)', async ({
  page,
}) => {
  await page.goto('/fr/evenements');

  await expect(page.getByRole('heading', { level: 1 })).toContainText('Événements');
  // 10 événements à venir par défaut
  await expect(page.getByText('10 événements à venir')).toBeVisible();
  // Vedette
  await expect(
    page.getByRole('heading', {
      level: 2,
      name: 'Conférence inaugurale de Democracy Together',
    }),
  ).toBeVisible();

  // Filtre facette : Webinaire (lien GET) réduit la liste
  await page.getByRole('link', { name: 'Webinaire', exact: true }).click();
  await expect(page).toHaveURL(/[?&]type=webinaire/);
  await expect(page.getByText('5 événements à venir')).toBeVisible();

  // Bascule période → Passés
  await page.goto('/fr/evenements');
  await page.getByRole('link', { name: 'Passés', exact: true }).click();
  await expect(page).toHaveURL(/[?&]period=passes/);
  await expect(page.getByText('4 événements passés')).toBeVisible();

  // Détail riche de la conférence
  await page.goto('/fr/evenements');
  await page
    .getByRole('link', { name: 'Détails' })
    .first()
    .click();
  await expect(page).toHaveURL(/\/fr\/evenements\/conference-inaugurale$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Conférence inaugurale');
  await expect(page.getByRole('heading', { name: 'Programme détaillé' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Intervenants' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Infos pratiques' })).toBeVisible();
  // billetterie : un tarif illustratif
  await expect(page.getByText('45 €')).toBeVisible();
});

test('événements : accès via la nav + version EN (F-03/F-23)', async ({ page }) => {
  await page.goto('/fr');
  await page
    .getByRole('banner')
    .getByRole('link', { name: 'Événements', exact: true })
    .click();
  await expect(page).toHaveURL(/\/fr\/evenements$/);

  await page.goto('/en/evenements');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Events');
  await expect(page.getByText('upcoming events')).toBeVisible();
});
