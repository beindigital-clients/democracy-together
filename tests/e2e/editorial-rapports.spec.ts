import { readFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import { SESSIONS } from './_sessions';

// F-41 — Rapports annuels : migration de l'édition codée depuis
// l'administration, puis TÉLÉCHARGEMENT du PDF composé côté serveur, en
// français et en arabe (droite à gauche, lettres liées : vérifié par les tests
// unitaires de convex/lib/reportPdf/render.test.ts ; ici, le parcours réel).
//
// Idempotent sur un déploiement qui vit longtemps : si l'édition 2026 est
// déjà migrée, le bouton d'import n'est plus proposé et le parcours reprend
// au téléchargement.

test.use({ storageState: SESSIONS.editorialRapports.state });

// La composition du PDF est PLANIFIÉE à l'écriture (action Convex) : la page
// affiche l'impression du navigateur le temps qu'elle aboutisse. On recharge
// jusqu'à voir le lien, dans une limite généreuse.
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
  // L'édition est administrée, publiée, en cinq langues.
  const card = page.getByRole('listitem').filter({ hasText: '2026' }).first();
  await expect(card.getByText('Publiée')).toBeVisible();
  await expect(card.getByRole('cell', { name: 'العربية' })).toBeVisible();

  // --- Français ---
  const fr = await waitForPdfLink(
    page,
    '/fr/rapports/2026',
    'Télécharger le PDF',
  );
  // La page dit ce qu'on télécharge : format, taille, pages, langue.
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
  // Métadonnées d'accessibilité dans le catalogue (non compressé) : langue
  // et PDF balisé.
  expect(frBytes.toString('latin1')).toContain('/Lang (fr)');
  expect(frBytes.toString('latin1')).toContain('/StructTreeRoot');

  // --- Arabe ---
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

  // La route du site sert le PDF avec les bons en-têtes.
  const res = await page.request.get('/ar/rapports/2026/rapport.pdf');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toBe('application/pdf');
  expect(res.headers()['content-disposition']).toContain(
    'democracy-together-rapport-2026-ar.pdf',
  );
  // Une année sans édition : 404, pas une erreur.
  expect(
    (await page.request.get('/fr/rapports/1999/rapport.pdf')).status(),
  ).toBe(404);
});
