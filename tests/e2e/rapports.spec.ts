import { test, expect } from '@playwright/test';

// F-41 — Annual reports: index + activity report (web reading + "Enregistrer
// en PDF" button via the print dialog). We do not press the button
// (it would open the browser's print dialog).

test('rapports : index + accès au rapport inaugural (F-41)', async ({
  page,
}) => {
  await page.goto('/fr/rapports');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Rapports annuels' }),
  ).toBeVisible();
  await expect(page.getByText('Édition inaugurale')).toBeVisible();

  const link = page.locator('a[href$="/rapports/2026"]').first();
  await expect(link).toBeVisible();
  await link.click();
  await expect(page).toHaveURL(/\/fr\/rapports\/2026$/);
});

test('rapports : rapport 2026 (sections + bouton PDF) (F-41)', async ({
  page,
}) => {
  await page.goto('/fr/rapports/2026');
  await expect(
    page.getByRole('heading', { level: 1, name: "Rapport d'activité 2026" }),
  ).toBeVisible();
  // a few institutional sections
  await expect(
    page.getByRole('heading', { name: 'Gouvernance' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Perspectives 2026-2027' }),
  ).toBeVisible();
  // A way to get the PDF: the composed PDF once the edition has been migrated to the
  // database (editorial-rapports.spec.ts), the browser print version as long as
  // the edition is served from the coded content. Both files run
  // on the same deployment, in any order.
  await expect(
    page
      .getByRole('link', { name: 'Télécharger le PDF' })
      .or(page.getByRole('button', { name: 'Imprimer / Enregistrer en PDF' })),
  ).toBeVisible();
});

test('rapports : année absente -> 404 (F-41)', async ({ page }) => {
  const res = await page.goto('/fr/rapports/1999');
  expect(res?.status()).toBe(404);
});

test('rapports : version EN + lien pied de page (F-41/F-03)', async ({
  page,
}) => {
  await page.goto('/en/rapports');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Annual reports' }),
  ).toBeVisible();

  await page.goto('/fr');
  const footerLink = page.locator('footer a[href$="/rapports"]');
  await expect(footerLink).toBeVisible();
});
