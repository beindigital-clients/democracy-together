import { test, expect } from '@playwright/test';

test.use({ locale: 'fr-FR' });

function grid(page: import('@playwright/test').Page) {
  return page
    .getByRole('list', { name: 'Liste des publications' })
    .getByRole('listitem');
}

test('bibliothèque : liste, facettes serveur et détail (F-32/F-34)', async ({
  page,
}) => {
  await page.goto('/fr/bibliotheque');

  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Bibliothèque',
  );
  // >= 14 seeded publications. The library now also hosts published
  // member submissions (F-32), so the total is no longer fixed: we check
  // the seed floor rather than an exact number (avoids any coupling with
  // the submission E2E, which publishes a real publication).
  const countLabel = page.getByText(/\d+ publications/).first();
  await expect(countLabel).toBeVisible();
  const total = Number((await countLabel.textContent())!.replace(/\D/g, ''));
  expect(total).toBeGreaterThanOrEqual(14);
  // page 1 = 9 cards (PAGE_SIZE)
  expect(await grid(page).count()).toBe(9);
  await expect(
    page.getByRole('link', { name: /état de la démocratie entre/i }),
  ).toBeVisible();

  // Multi-select facet (GET link): filter by theme
  await page
    .getByRole('link', { name: /Transitions démocratiques/ })
    .first()
    .click();
  await expect(page).toHaveURL(/[?&]theme=transitions/);
  await expect(page.getByText('3 publications')).toBeVisible();
  // the active option is marked current (aria-current on a filter link)
  await expect(
    page.getByRole('link', { name: /Transitions démocratiques/ }).first(),
  ).toHaveAttribute('aria-current', 'true');

  // Open the featured publication's detail
  await page
    .getByRole('link', { name: /état de la démocratie entre/i })
    .click();
  await expect(page).toHaveURL(
    /\/fr\/bibliotheque\/etat-democratie-afrique-europe$/,
  );
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    "L'état de la démocratie",
  );
  await expect(page.getByRole('heading', { name: 'Résumé' })).toBeVisible();

  // Citation block: APA by default, BibTeX toggle
  await expect(page.getByText(/Wade, A\..*Vandenberghe/)).toBeVisible();
  await page.getByRole('radio', { name: 'BibTeX' }).click();
  await expect(page.getByText('@techreport{dt2026etat')).toBeVisible();
});

test('bibliothèque : accès via la nav « Analyses » + version EN (F-03/F-32)', async ({
  page,
}) => {
  await page.goto('/fr');
  await page.getByRole('link', { name: 'Analyses', exact: true }).click();
  await expect(page).toHaveURL(/\/fr\/bibliotheque$/);

  // The old /analyses URL redirects to the library
  await page.goto('/fr/analyses');
  await expect(page).toHaveURL(/\/fr\/bibliotheque$/);

  await page.goto('/en/bibliotheque');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Library',
  );
  await expect(page.getByText(/open access and citable/i)).toBeVisible();
});
