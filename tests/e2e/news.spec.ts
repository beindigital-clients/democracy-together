import { test, expect } from '@playwright/test';

test.use({ locale: 'fr-FR' });

function cards(page: import('@playwright/test').Page) {
  return page
    .getByRole('list', { name: 'Actualités du réseau' })
    .getByRole('listitem');
}

test('actualités : liste depuis Sanity + article (F-15)', async ({ page }) => {
  await page.goto('/fr/actualites');

  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Actualités du réseau',
  );
  await expect(
    page.getByRole('heading', { name: /collectif fondateur/i }),
  ).toBeVisible();
  expect(await cards(page).count()).toBeGreaterThanOrEqual(3);

  // ouvrir un article -> rendu PortableText
  await page.getByRole('link', { name: /collectif fondateur/i }).click();
  await expect(page).toHaveURL(/\/fr\/actualites\/collectif-fondateur$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'collectif fondateur',
  );
  await expect(page.getByText(/quatre axes de la mission/i)).toBeVisible();
});

test('actualités : accessible depuis la nav, version EN (F-03/F-15)', async ({
  page,
}) => {
  await page.goto('/fr');
  await page.getByRole('link', { name: 'Actualités', exact: true }).click();
  await expect(page).toHaveURL(/\/fr\/actualites$/);

  await page.goto('/en/actualites');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Network news',
  );
  await expect(
    page.getByRole('heading', { name: /founding collective/i }),
  ).toBeVisible();
});
