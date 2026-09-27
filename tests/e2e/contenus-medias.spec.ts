import { test, expect } from '@playwright/test';
import { deleteE2eContent, importCodedContent } from './_helpers';
import { SESSIONS } from './_sessions';

// CHANTIER « CONTENUS » — F-64 (médiathèque) et F-14 (partenaires).
//
// Un éditeur téléverse une image AVEC son texte alternatif, puis la choisit
// comme logo d'un nouveau partenaire ; le logo s'affiche sur /partenaires avec
// ce texte alternatif. Au passage : un média utilisé ne se supprime pas
// (le bouton n'est pas proposé, et la fiche dit par qui il est utilisé).
//
// Le fichier est un vrai PNG (signature + en-tête IHDR) : le serveur relit les
// octets et refuserait une image factice. Son nom et le slug du partenaire
// portent le préfixe `e2e-` que le ménage de fin retire.

test.use({
  locale: 'fr-FR',
  storageState: SESSIONS.contenusMedias.state,
});
test.describe.configure({ mode: 'serial' });
test.afterEach(async ({ context }) => {
  await context.storageState({ path: SESSIONS.contenusMedias.state });
});

const stamp = Date.now();
const FILENAME = `e2e-logo-${stamp}.png`;
const ALT = `Logo de la fondation E2E ${stamp}`;
const PARTNER = `Fondation E2E ${stamp}`;
const SLUG = `e2e-fondation-${stamp}`;

// PNG 1×1 réel.
const PNG = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082',
  'hex',
);

test.beforeAll(async () => {
  await importCodedContent();
});

test.afterAll(async () => {
  await deleteE2eContent(stamp);
});

test('téléverse une image avec texte alternatif, l’utilise comme logo de partenaire', async ({
  page,
}) => {
  // 1. Médiathèque : le texte alternatif est exigé avant l'envoi.
  await page.goto('/fr/admin/contenus/medias');
  const upload = page.getByRole('region', { name: 'Ajouter un média' });
  await upload.getByLabel('Fichier').setInputFiles({
    name: FILENAME,
    mimeType: 'image/png',
    buffer: PNG,
  });
  const send = upload.getByRole('button', { name: 'Téléverser' });
  await expect(send).toBeDisabled();
  await upload.getByLabel('Texte alternatif').fill(ALT);
  await expect(send).toBeEnabled();
  await send.click();
  await expect(
    page.getByText(`« ${FILENAME} » ajouté à la médiathèque.`),
  ).toBeVisible();
  const card = page.getByRole('listitem').filter({ hasText: FILENAME });
  await expect(card).toContainText(ALT);
  await expect(card).toContainText('1 × 1 px');
  await expect(card).toContainText('Non utilisé');

  // 2. Partenaire : le logo se choisit dans la médiathèque.
  await page.goto('/fr/admin/contenus/partenaires');
  await page.getByRole('button', { name: 'Nouveau partenaire' }).click();
  const editor = page.getByRole('region', { name: 'Nouveau partenaire' });
  await editor.getByLabel('Adresse (slug)').fill(SLUG);
  await editor.getByLabel('Nom', { exact: true }).fill(PARTNER);
  await editor.getByLabel('Site du partenaire').fill('https://example.org/');
  await editor
    .getByRole('button', { name: 'Choisir dans la médiathèque' })
    .click();
  await editor.getByLabel('Rechercher dans la médiathèque').fill(`${stamp}`);
  await editor
    .getByRole('button', { name: new RegExp(`Choisir « ${FILENAME} »`) })
    .click();
  await expect(editor.getByRole('img', { name: ALT })).toBeVisible();
  await editor.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText(`« ${PARTNER} » enregistré.`)).toBeVisible();

  const row = page.getByRole('listitem').filter({ hasText: PARTNER });
  await row.getByRole('button', { name: 'Publier' }).click();
  await expect(page.getByText(`« ${PARTNER} » publié.`)).toBeVisible();

  // 3. Le média est désormais utilisé : plus de bouton « Supprimer ».
  await page.goto('/fr/admin/contenus/medias');
  const used = page.getByRole('listitem').filter({ hasText: FILENAME });
  await expect(used).toContainText(`partenaire ${SLUG}`);
  await expect(used.getByRole('button', { name: 'Supprimer' })).toHaveCount(0);

  // 4. Page publique : le logo, avec son texte alternatif, et le lien.
  await page.goto('/fr/partenaires');
  const article = page.locator('article').filter({ hasText: PARTNER });
  await expect(article.getByRole('img', { name: ALT })).toBeVisible();
  await expect(
    article.getByRole('link', { name: /Site du partenaire/ }),
  ).toHaveAttribute('href', 'https://example.org/');
});
