import { test, expect, type Page } from '@playwright/test';
import { menuCompte, signInWithCode } from './_helpers';
import { SESSIONS } from './_sessions';

// CERCLE DES AMIS — request to join, through the screens.
//
// A visitor fills the public form (CV in PDF, charter, notice) and gets a
// confirmation; nothing opens for them. The president (administrator session
// `cercleAdminDecision`) then accepts one request — the person can sign in —
// and refuses another, which deletes its CV.

test.use({ locale: 'fr-FR' });
test.use({ storageState: SESSIONS.cercleAdminDecision.state });
test.describe.configure({ mode: 'serial' });
test.afterEach(async ({ context }) => {
  await context.storageState({ path: SESSIONS.cercleAdminDecision.state });
});

const STAMP = Date.now();
const ACCEPTED = {
  name: `Amie Acceptée ${STAMP}`,
  email: `e2e_cercle_ok_${STAMP}@democracytogether.test`,
};
const REFUSED = {
  name: `Ami Refusé ${STAMP}`,
  email: `e2e_cercle_ko_${STAMP}@democracytogether.test`,
};

const PDF = {
  name: 'cv.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n% fictitious cv for tests\n'),
};

async function fillRequest(page: Page, who: { name: string; email: string }) {
  await page.getByLabel('Nom et prénom').fill(who.name);
  await page.getByLabel('Adresse e-mail').fill(who.email);
  await page
    .getByLabel('Pourquoi souhaitez-vous rejoindre le Cercle ?')
    .fill('Animer une base territoriale (test E2E).');
  await page.getByLabel(/CV court/).setInputFiles(PDF);
  await page
    .getByRole('checkbox', { name: /J’ai lu la charte|J'ai lu la charte/ })
    .click();
  await page
    .getByRole('checkbox', { name: /J’ai compris|J'ai compris/ })
    .click();
}

test('le formulaire public exige le CV, la charte et la notice', async ({
  browser,
}) => {
  const ctx = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    locale: 'fr-FR',
  });
  const page = await ctx.newPage();
  await page.goto('/fr/cercle');
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Rejoindre le Cercle des Amis',
    }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Envoyer ma demande' }).click();
  await expect(
    page.getByText('Indiquez votre nom (2 caractères au moins).'),
  ).toBeVisible();
  await expect(
    page.getByText('Indiquez une adresse e-mail valide.'),
  ).toBeVisible();
  await expect(page.getByText('Joignez votre CV au format PDF.')).toBeVisible();
  await expect(
    page.getByText('Vous devez accepter la charte pour continuer.'),
  ).toBeVisible();
  await expect(
    page.getByText(/Vous devez confirmer avoir compris/),
  ).toBeVisible();
  await ctx.close();
});

for (const who of [ACCEPTED, REFUSED]) {
  test(`un visiteur envoie sa demande (${who === ACCEPTED ? 'acceptée' : 'refusée'} ensuite)`, async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      locale: 'fr-FR',
    });
    const page = await ctx.newPage();
    await page.goto('/fr/cercle');
    await fillRequest(page, who);
    await page.getByRole('button', { name: 'Envoyer ma demande' }).click();
    await expect(
      page.getByRole('heading', { name: 'Demande reçue' }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(who.email)).toBeVisible();
    await ctx.close();
  });
}

test('le président accepte une demande : la personne peut se connecter', async ({
  page,
  browser,
}) => {
  await page.goto('/fr/admin/cercle');
  const row = page.getByRole('listitem').filter({ hasText: ACCEPTED.email });
  await expect(row).toBeVisible();
  await expect(
    row.getByRole('button', { name: `Ouvrir le CV de ${ACCEPTED.name}` }),
  ).toBeVisible();

  await row.getByRole('button', { name: `Accepter ${ACCEPTED.name}` }).click();
  const dialog = page.getByRole('dialog', {
    name: `Accepter ${ACCEPTED.name} ?`,
  });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Accepter la demande' }).click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: `${ACCEPTED.name} est maintenant Ami du Cercle.` }),
  ).toBeVisible();

  // The request moves to the "Acceptées" list.
  await page.getByRole('radio', { name: 'Acceptées' }).click();
  await expect(
    page.getByRole('listitem').filter({ hasText: ACCEPTED.email }),
  ).toBeVisible();

  // The person now has an account and can sign in with a one-time code.
  const ctx = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    locale: 'fr-FR',
  });
  const amiPage = await ctx.newPage();
  await signInWithCode(amiPage, ACCEPTED.email);
  await expect(menuCompte(amiPage)).toBeVisible({ timeout: 15_000 });
  await ctx.close();
});

test('le président refuse une demande : le CV est supprimé et rien ne s’ouvre', async ({
  page,
  browser,
}) => {
  await page.goto('/fr/admin/cercle');
  const row = page.getByRole('listitem').filter({ hasText: REFUSED.email });
  await row.getByRole('button', { name: `Refuser ${REFUSED.name}` }).click();
  const dialog = page.getByRole('dialog', {
    name: `Refuser ${REFUSED.name} ?`,
  });
  await dialog.getByRole('button', { name: 'Refuser la demande' }).click();
  await expect(
    page.getByRole('status').filter({
      hasText: `La demande de ${REFUSED.name} est refusée et son CV supprimé.`,
    }),
  ).toBeVisible();

  await page.getByRole('radio', { name: 'Refusées' }).click();
  const refused = page.getByRole('listitem').filter({ hasText: REFUSED.email });
  await expect(refused).toContainText('CV supprimé.');

  // No account exists for the refused person: sign-in finds nothing.
  const ctx = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    locale: 'fr-FR',
  });
  const refusedPage = await ctx.newPage();
  await refusedPage.goto('/fr/connexion-otp');
  await refusedPage.getByLabel('E-mail').fill(REFUSED.email);
  await refusedPage.getByRole('button', { name: 'Recevoir un code' }).click();
  await expect(
    refusedPage.getByRole('heading', { name: 'Saisissez le code' }),
  ).toBeVisible();
  await expect(refusedPage).not.toHaveURL(/espace-membre/);
  await ctx.close();
});
