import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { SESSIONS } from './_sessions';

// F-41 — Annual reports: migration of the coded edition from the admin
// area, then DOWNLOAD of the server-composed PDF, in French and Arabic
// (right-to-left, joined letters: verified by the unit tests in
// convex/lib/reportPdf/render.test.ts; here, the real flow).
//
// Idempotent on a long-lived deployment: if the 2026 edition has
// already been migrated, the import button is no longer offered and the flow
// resumes at the download.

test.use({ storageState: SESSIONS.editorialRapports.state });

// PDF composition is SCHEDULED on write (Convex action): the page shows
// the browser print version until it completes. We reload until the link
// appears, within a generous limit.
async function waitForPdfLink(page: Page, url: string, name: string) {
  const link = page.getByRole('link', { name, exact: true });
  await expect(async () => {
    await page.goto(url);
    await expect(link).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 90_000, intervals: [2_000, 5_000] });
  return link;
}

test('F-41 : migrer l’édition 2026 puis télécharger son PDF en français et en arabe', async ({
  page,
}) => {
  test.setTimeout(180_000);

  await page.goto('/fr/admin/rapports');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Rapports annuels' }),
  ).toBeVisible();
  const importButton = page.getByRole('button', {
    name: "Importer l'édition 2026",
  });
  if (await importButton.isVisible()) {
    await importButton.click();
    await expect(
      page.getByText('Édition 2026 importée', { exact: false }),
    ).toBeVisible();
  }
  // The edition is administered, published, in five languages.
  const card = page.getByRole('listitem').filter({ hasText: '2026' }).first();
  await expect(card.getByText('Publiée')).toBeVisible();
  await expect(card.getByRole('cell', { name: 'العربية' })).toBeVisible();

  // --- French ---
  const fr = await waitForPdfLink(
    page,
    '/fr/rapports/2026',
    'Télécharger le PDF',
  );
  // The page says what is being downloaded: format, size, pages, language.
  await expect(page.getByText(/PDF · .+ · \d+ pages · Français/)).toBeVisible();
  const [frDownload] = await Promise.all([
    page.waitForEvent('download'),
    fr.click(),
  ]);
  expect(frDownload.suggestedFilename()).toBe(
    'democracy-together-rapport-2026-fr.pdf',
  );
  const frBytes = readFileSync(await frDownload.path());
  expect(frBytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  // Accessibility metadata in the (uncompressed) catalog: language
  // and tagged PDF.
  expect(frBytes.toString('latin1')).toContain('/Lang (fr)');
  expect(frBytes.toString('latin1')).toContain('/StructTreeRoot');

  // --- Arabic ---
  const ar = await waitForPdfLink(page, '/ar/rapports/2026', 'تنزيل ملف PDF');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(page.getByText('العربية').first()).toBeVisible();
  const [arDownload] = await Promise.all([
    page.waitForEvent('download'),
    ar.click(),
  ]);
  expect(arDownload.suggestedFilename()).toBe(
    'democracy-together-rapport-2026-ar.pdf',
  );
  const arBytes = readFileSync(await arDownload.path());
  expect(arBytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  expect(arBytes.toString('latin1')).toContain('/Lang (ar)');

  // The site route serves the PDF with the right headers.
  const res = await page.request.get('/ar/rapports/2026/rapport.pdf');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('application/pdf');
  expect(res.headers()['content-disposition']).toContain(
    'democracy-together-rapport-2026-ar.pdf',
  );
  // A year with no edition: 404, not an error.
  expect(
    (await page.request.get('/fr/rapports/1999/rapport.pdf')).status(),
  ).toBe(404);
});
