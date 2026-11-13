import { test, expect } from '@playwright/test';
import { cercleContact, getCercleConfirmationLink } from './_helpers';
import { SESSIONS } from './_sessions';

// CERCLE DES AMIS — the mailing list, through the screens.
//
// The president imports contacts who asked for nothing, sends the ONE
// confirmation message, one contact confirms through the link and another
// unsubscribes (and is never re-added by a new import). Sending is simulated on
// the test deployment (AUTH_DEV_OTP): the link "sent" is read from the
// development outbox.
//
// Dedicated session (`cercleAdminListe`): see tests/e2e/_sessions.ts.

test.use({ locale: 'fr-FR' });
test.use({ storageState: SESSIONS.cercleAdminListe.state });
test.describe.configure({ mode: 'serial' });
test.afterEach(async ({ context }) => {
  await context.storageState({ path: SESSIONS.cercleAdminListe.state });
});

const STAMP = Date.now();
const YES = `delivered+e2e-oui-${STAMP}@resend.dev`;
const NO = `delivered+e2e-non-${STAMP}@resend.dev`;
const LABEL = `e2e-${STAMP}`;

async function openList(page: import('@playwright/test').Page) {
  await page.goto('/fr/admin/cercle');
  await page.getByRole('radio', { name: 'Liste de diffusion' }).click();
  await expect(
    page.getByRole('heading', { name: 'Liste de diffusion du Cercle' }),
  ).toBeVisible();
}

test("le président importe des contacts, puis envoie l'unique demande de confirmation", async ({
  page,
}) => {
  await openList(page);
  // The association's name and address are not set on a test deployment: the
  // screen says so, and says nothing real can be sent while that is the case.
  await expect(
    page.getByText("Identité de l'expéditeur à renseigner"),
  ).toBeVisible();

  await page.getByLabel('Nom de la liste importée').fill(LABEL);
  await page
    .getByLabel('Ou collez les adresses ici')
    .fill(`email;langue\n${YES};fr\n${NO};en\nnop`);
  await page.getByRole('button', { name: 'Importer', exact: true }).click();
  const report = page
    .getByRole('status')
    .filter({ hasText: "Résultat de l'import" });
  await expect(report).toContainText('2 ajoutés (en attente de confirmation)');
  await expect(report).toContainText('1 lignes invalides');

  // Importing again adds nobody.
  await page
    .getByLabel('Ou collez les adresses ici')
    .fill(`email\n${YES}\n${NO}`);
  await page.getByRole('button', { name: 'Importer', exact: true }).click();
  await expect(report).toContainText('2 déjà sur la liste');

  expect(cercleContact(YES)).toMatchObject({ status: 'pending' });

  // Sending: confirmation first, one message per contact.
  await page
    .getByRole('button', { name: 'Envoyer la demande de confirmation' })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: "L'envoi est lancé." }),
  ).toBeVisible();
});

test("une personne confirme par le lien, une autre se désinscrit et n'est jamais réajoutée", async ({
  page,
  browser,
}) => {
  // The e-mail's link carries the deployment's SITE_URL, which may point to
  // another host: we follow it like the person, on OUR server.
  const link = new URL(await getCercleConfirmationLink(YES));
  expect(link.pathname).toBe('/fr/cercle/confirmation');
  const visitor = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    locale: 'fr-FR',
  });
  const visitorPage = await visitor.newPage();

  // A garbage link says so.
  await visitorPage.goto('/fr/cercle/confirmation?token=nope');
  await expect(
    visitorPage.getByText("Ce lien n'est pas valide ou a déjà été utilisé."),
  ).toBeVisible();

  // The real one confirms.
  await visitorPage.goto(`${link.pathname}${link.search}`);
  await expect(
    visitorPage.getByText(/Vous recevrez les nouvelles du Cercle des Amis/),
  ).toBeVisible();
  expect(cercleContact(YES)).toMatchObject({ status: 'confirmed' });

  // The other contact follows the unsubscribe link of a message.
  const info = cercleContact(NO);
  expect(info).toMatchObject({ status: 'pending' });
  await visitorPage.goto(`/fr/cercle/desinscription?token=${info!.unsubToken}`);
  await expect(
    visitorPage.getByText(/vous ne recevrez plus de message du Cercle/),
  ).toBeVisible();
  expect(cercleContact(NO)).toMatchObject({ status: 'unsubscribed' });
  await visitor.close();

  // A new import never re-adds who unsubscribed.
  await openList(page);
  await page.getByLabel('Nom de la liste importée').fill(`${LABEL}-bis`);
  await page.getByLabel('Ou collez les adresses ici').fill(`email\n${NO}`);
  await page.getByRole('button', { name: 'Importer', exact: true }).click();
  await expect(
    page.getByRole('status').filter({ hasText: "Résultat de l'import" }),
  ).toContainText('1 désinscrits, jamais réajoutés');
  expect(cercleContact(NO)).toMatchObject({ status: 'unsubscribed' });
});
