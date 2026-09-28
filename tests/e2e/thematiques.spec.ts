import { test, expect } from '@playwright/test';

// F-36 — Thematic syntheses: index of the 5 axes + synthesis page per axis
// (network position + related publications + cross-links).

test('thématiques : index liste les 5 axes (F-36)', async ({ page }) => {
  await page.goto('/fr/thematiques');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Nos axes de travail' }),
  ).toBeVisible();

  // 5 cards -> 5 links to an axis synthesis.
  const cards = page.locator('a[href*="/thematiques/"]');
  await expect(cards).toHaveCount(5);
  await expect(
    page.locator('a[href$="/thematiques/gouvernance-numerique"]'),
  ).toBeVisible();
});

test('thématiques : page de synthèse (position + liens) (F-36)', async ({
  page,
}) => {
  await page.goto('/fr/thematiques/transitions');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Transitions démocratiques' }),
  ).toBeVisible();

  // "Questions de travail" + "Publications du réseau" sections.
  await expect(
    page.getByRole('heading', { name: 'Questions de travail' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Publications du réseau' }),
  ).toBeVisible();

  // Cross-link to the library filtered on the axis.
  await expect(
    page.locator('a[href*="/bibliotheque?theme=transitions"]').first(),
  ).toBeVisible();
});

test('thématiques : version EN (F-36/F-03)', async ({ page }) => {
  await page.goto('/en/thematiques');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Our pillars of work' }),
  ).toBeVisible();
});

test('thématiques : axe inconnu -> 404 (F-36)', async ({ page }) => {
  const res = await page.goto('/fr/thematiques/axe-inexistant');
  expect(res?.status()).toBe(404);
});

test('thématiques : accessible depuis le pied de page (F-36)', async ({
  page,
}) => {
  await page.goto('/fr');
  const footerLink = page.locator('footer a[href$="/thematiques"]');
  await expect(footerLink).toBeVisible();
  await footerLink.click();
  await expect(page).toHaveURL(/\/fr\/thematiques$/);
});
