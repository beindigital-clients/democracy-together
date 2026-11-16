import { test, expect, type Page } from '@playwright/test';
import { seedCercleContacts } from './_helpers';
import { SESSIONS } from './_sessions';

// CERCLE DES AMIS — messages to the list, through the screens: a draft, the
// internal test that must come first (with a refusal for an address outside the
// team), then a send in waves that the editor releases. Sending is simulated on
// the test deployment (AUTH_DEV_OTP): nothing leaves.
//
// Dedicated session (`cercleAdminMessages`): see tests/e2e/_sessions.ts.

test.use({ locale: 'fr-FR' });
test.use({ storageState: SESSIONS.cercleAdminMessages.state });
test.afterEach(async ({ context }) => {
  await context.storageState({ path: SESSIONS.cercleAdminMessages.state });
});

const STAMP = Date.now();
const SUBJECT = `Nouvelles e2e ${STAMP}`;

async function openMessages(page: Page) {
  await page.goto('/fr/admin/cercle');
  await page.getByRole('radio', { name: 'Messages' }).click();
  await expect(
    page.getByRole('heading', { name: 'Messages au Cercle' }),
  ).toBeVisible();
}

test('un message passe par le test à l’équipe, puis part par vagues que l’éditeur libère', async ({
  page,
}) => {
  // Three known people on the list, so a wave of 1 really holds the campaign.
  seedCercleContacts(
    [1, 2, 3].map((i) => `delivered+e2e-v${i}-${STAMP}@resend.dev`),
  );

  await openMessages(page);
  await page.getByLabel('Objet').fill(SUBJECT);
  await page
    .getByLabel('Texte du message')
    .fill('Quelques nouvelles du Cercle, pour le test.');
  await page.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: 'Brouillon enregistré.' }),
  ).toBeVisible();

  const card = page.getByRole('listitem').filter({ hasText: SUBJECT });
  await expect(card).toContainText('Brouillon');
  // No test yet: the send to the list is blocked, and the screen says why.
  await expect(card).toContainText(
    'Aucun test envoyé depuis la dernière modification',
  );
  await expect(
    card.getByRole('button', { name: 'Envoyer à la liste' }),
  ).toBeDisabled();

  // A test to someone outside the team is refused.
  await card
    .getByLabel(/Adresses de l.équipe/)
    .fill(`quelquun-${STAMP}@democracytogether.test`);
  await card.getByRole('button', { name: 'Envoyer le test' }).click();
  await expect(
    page.getByRole('alert').filter({
      hasText: "Une des adresses n'est pas celle d'un compte de l'équipe.",
    }),
  ).toBeVisible();

  // Blank: the editor's own address — it is a team account.
  await card.getByLabel(/Adresses de l.équipe/).fill('');
  await card.getByRole('button', { name: 'Envoyer le test' }).click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: /Test envoyé à .*e2e_session_cercle_messages/ }),
  ).toBeVisible();
  // The block lifts, live.
  await expect(
    card.getByRole('button', { name: 'Envoyer à la liste' }),
  ).toBeEnabled();

  // Send in waves of 1: confirmation, then the campaign is held.
  await card.getByLabel(/Par vagues de/).fill('1');
  await card.getByRole('button', { name: 'Envoyer à la liste' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(
    `Envoyer « ${SUBJECT} » à la liste du Cercle ?`,
  );
  await dialog.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await expect(card.getByText('En pause entre deux vagues')).toBeVisible({
    timeout: 20_000,
  });
  await expect(card).toContainText('Vague terminée (1 personnes au plus jusqu');

  // Release the rest.
  await card.getByLabel('Taille de la vague suivante').fill('10000');
  await card.getByRole('button', { name: 'Libérer la vague suivante' }).click();
  await expect(card.getByText('Envoyé', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
});
