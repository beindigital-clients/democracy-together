import { test, expect, type Page } from '@playwright/test';
import {
  E2E_PASSWORD,
  provisionUser,
  seDeconnecter,
  signUpAndVerify,
} from './_helpers';
import { chooseOption } from './_fields';

// COLLABORATIVE SPACES — invitations and shared files (F-24, "communauté"
// workstream), end to end:
//   1. a facilitator creates a PRIVATE space and invites a member by address;
//   2. the invitee sees the invitation, accepts it, enters the space;
//   3. they upload a file there, which appears with its version, its author and its
//      date;
//   4. a network member outside the space cannot find it.
//
// NEW accounts on every run (timestamped addresses): the file holds
// its sessions end to end, it borrows no shared session.
test.use({ locale: 'fr-FR' });

async function signOut(page: Page) {
  await seDeconnecter(page);
  await expect(page).toHaveURL(/\/fr$/);
}

// A real minimal PDF: the server checks the byte SIGNATURE, not
// just the extension.
const PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n',
);

test('l’animatrice invite, l’invité accepte et dépose un fichier', async ({
  page,
}) => {
  const stamp = Date.now();
  const animEmail = `e2e_ws_anim_${stamp}@democracytogether.test`;
  const guestEmail = `e2e_ws_guest_${stamp}@democracytogether.test`;
  const outsiderEmail = `e2e_ws_out_${stamp}@democracytogether.test`;
  const title = `Espace privé E2E ${stamp}`;
  // The invited account EXISTS (network member) before the invitation: that is
  // what earns it a notification. The screen, for its part, responds the same in both
  // cases.
  await provisionUser(guestEmail, 'membre');

  // 1. The facilitator creates the private space and invites.
  await signUpAndVerify(page, animEmail, E2E_PASSWORD, 'membre');
  await page.goto('/fr/espaces');
  await page.getByRole('button', { name: 'Créer un espace' }).click();
  await page.getByLabel('Titre').fill(title);
  await chooseOption(page.getByLabel('Accès'), 'Privé, sur invitation');
  await page
    .getByLabel('Description')
    .fill('Un espace privé pour préparer une note commune.');
  await page.getByRole('button', { name: 'Créer l’espace' }).click();
  await page.getByRole('link').filter({ hasText: title }).click();
  await expect(page).toHaveURL(/\/fr\/espaces\/[a-z0-9]+$/);
  const workspaceUrl = new URL(page.url()).pathname;
  await expect(page.getByText('Privé', { exact: true })).toBeVisible();

  await page.getByLabel('Inviter par adresse e-mail').fill(guestEmail);
  await chooseOption(
    page.getByLabel('Rôle', { exact: true }).first(),
    'Contributeur·rice',
  );
  await page
    .getByRole('button', { name: 'Inviter', exact: true })
    .first()
    .click();
  await expect(
    page.getByText(`Invitation envoyée à ${guestEmail}.`),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Invitations en cours' }),
  ).toBeVisible();
  await expect(page.getByText(guestEmail).first()).toBeVisible();
  await signOut(page);

  // 2. The invitee accepts from the list of spaces.
  await signUpAndVerify(page, guestEmail, E2E_PASSWORD, 'membre');
  await page.goto('/fr/espaces');
  const invitations = page.getByRole('region', { name: 'Vos invitations' });
  await expect(invitations).toContainText(title);
  await invitations
    .getByRole('button', { name: `Accepter l’invitation à « ${title} »` })
    .click();
  await expect(page).toHaveURL(new RegExp(`${workspaceUrl}$`));
  await expect(page.getByText('Votre rôle : Contributeur·rice')).toBeVisible();

  // 3. They upload a file: it appears with version, author and date.
  await page.getByTestId('ws-file-input').setInputFiles({
    name: 'note-commune.pdf',
    mimeType: 'application/pdf',
    buffer: PDF,
  });
  await expect(page.getByText('Fichier déposé.')).toBeVisible();
  const files = page.getByRole('region', { name: 'Fichiers partagés' });
  await expect(files.getByText('note-commune.pdf')).toBeVisible();
  await expect(files.getByText(/^v1 · /)).toBeVisible();
  await expect(
    files.getByRole('button', { name: 'Télécharger « note-commune.pdf »' }),
  ).toBeVisible();

  // A file whose bytes lie is refused, and the screen says so.
  await page.getByTestId('ws-file-input').setInputFiles({
    name: 'faux.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('ceci n’est pas un PDF'),
  });
  await expect(
    page.getByText(/Le contenu du fichier ne correspond pas à son format/),
  ).toBeVisible();
  await signOut(page);

  // 4. A network member outside the space sees it neither in the list, nor
  // through its address.
  await signUpAndVerify(page, outsiderEmail, E2E_PASSWORD, 'membre');
  await page.goto('/fr/espaces');
  await expect(page.getByRole('link').filter({ hasText: title })).toHaveCount(
    0,
  );
  await page.goto(workspaceUrl);
  await expect(page.getByText('Espace introuvable.')).toBeVisible();
  await expect(page.getByText('note-commune.pdf')).toHaveCount(0);
});
