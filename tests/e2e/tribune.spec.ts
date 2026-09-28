import { test, expect } from '@playwright/test';

// F-44/F-47/F-50 — Tribune: public page, code of conduct, filter by axis,
// writing reserved for members (signed out -> invitation to join).

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

  // writing reserved for members (signed out)
  await expect(
    page.getByText('La prise de parole est réservée aux membres du réseau.'),
  ).toBeVisible();

  // filter by theme -> querystring. `exact`: the accessible name of a
  // post CARD starts with its theme, so as soon as a published post
  // carries that theme, the locator without `exact` finds two (measured on 27/09
  // on a long-lived deployment; a fresh preview does not see it).
  await page
    .getByRole('link', { name: 'Transitions démocratiques', exact: true })
    .click();
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
