import { test, expect } from '@playwright/test';

// F-44/F-47/F-50 — Tribune : page publique, code de conduite, filtre par axe,
// écriture réservée aux membres (déconnecté -> invitation à adhérer).

test('tribune : page publique, code de conduite, filtre, accès réservé', async ({
  page,
}) => {
  await page.goto('/fr/tribune');
  await expect(
    page.getByRole('heading', { level: 1, name: 'La tribune démocratique' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Code de conduite' }),
  ).toBeVisible();

  // écriture réservée aux membres (déconnecté)
  await expect(
    page.getByText('La prise de parole est réservée aux membres du réseau.'),
  ).toBeVisible();

  // filtre par thématique -> querystring
  await page.getByRole('link', { name: 'Transitions démocratiques' }).click();
  await expect(page).toHaveURL(/\/tribune\?theme=transitions$/);
});

test('tribune : version EN + lien pied de page (F-03)', async ({ page }) => {
  await page.goto('/en/tribune');
  await expect(
    page.getByRole('heading', { level: 1, name: 'The democratic forum' }),
  ).toBeVisible();

  await page.goto('/fr');
  await expect(page.locator('footer a[href$="/tribune"]')).toBeVisible();
});
