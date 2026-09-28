import { test, expect, type Page } from '@playwright/test';
import { E2E_PASSWORD, provisionUser, signUpAndVerify } from './_helpers';

// ESPACES COLLABORATIFS — invitations et fichiers partagés (F-24, chantier
// communauté), bout en bout :
//   1. une animatrice crée un espace PRIVÉ et invite un membre par adresse ;
//   2. l'invité voit l'invitation, l'accepte, entre dans l'espace ;
//   3. il y dépose un fichier, qui apparaît avec sa version, son auteur et sa
//      date ;
//   4. un membre du réseau étranger à l'espace ne le trouve pas.
//
// Comptes NEUFS à chaque exécution (adresses horodatées) : le fichier tient
// ses sessions de bout en bout, il n'emprunte aucune session partagée.
test.use({ locale: 'fr-FR' });

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Déconnexion' }).click();
  await expect(page).toHaveURL(/\/fr$/);
}

// Un vrai PDF minimal : le serveur vérifie la SIGNATURE des octets, pas
// seulement l'extension.
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
  // Le compte invité EXISTE (membre du réseau) avant l'invitation : c'est ce
  // qui lui vaut une notification. L'écran, lui, répond pareil dans les deux
  // cas.
  await provisionUser(guestEmail, 'membre');

  // 1. L'animatrice crée l'espace privé et invite.
  await signUpAndVerify(page, animEmail, E2E_PASSWORD, 'membre');
  await page.goto('/fr/espaces');
  await page.getByRole('button', { name: 'Créer un espace' }).click();
  await page.getByLabel('Titre').fill(title);
  await page.getByLabel('Accès').selectOption('private');
  await page
    .getByLabel('Description')
    .fill('Un espace privé pour préparer une note commune.');
  await page.getByRole('button', { name: 'Créer l’espace' }).click();
  await page.getByRole('link').filter({ hasText: title }).click();
  await expect(page).toHaveURL(/\/fr\/espaces\/[a-z0-9]+$/);
  const workspaceUrl = new URL(page.url()).pathname;
  await expect(page.getByText('Privé', { exact: true })).toBeVisible();

  await page.getByLabel('Inviter par adresse e-mail').fill(guestEmail);
  await page
    .getByLabel('Rôle', { exact: true })
    .first()
    .selectOption('contributeur');
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

  // 2. L'invité accepte depuis la liste des espaces.
  await signUpAndVerify(page, guestEmail, E2E_PASSWORD, 'membre');
  await page.goto('/fr/espaces');
  const invitations = page.getByRole('region', { name: 'Vos invitations' });
  await expect(invitations).toContainText(title);
  await invitations
    .getByRole('button', { name: `Accepter l’invitation à « ${title} »` })
    .click();
  await expect(page).toHaveURL(new RegExp(`${workspaceUrl}$`));
  await expect(page.getByText('Votre rôle : Contributeur·rice')).toBeVisible();

  // 3. Il dépose un fichier : il apparaît avec version, auteur et date.
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

  // Un fichier dont les octets mentent est refusé, et l'écran le dit.
  await page.getByTestId('ws-file-input').setInputFiles({
    name: 'faux.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('ceci n’est pas un PDF'),
  });
  await expect(
    page.getByText(/Le contenu du fichier ne correspond pas à son format/),
  ).toBeVisible();
  await signOut(page);

  // 4. Un membre du réseau étranger à l'espace ne le voit ni en liste, ni
  // par son adresse.
  await signUpAndVerify(page, outsiderEmail, E2E_PASSWORD, 'membre');
  await page.goto('/fr/espaces');
  await expect(page.getByRole('link').filter({ hasText: title })).toHaveCount(
    0,
  );
  await page.goto(workspaceUrl);
  await expect(page.getByText('Espace introuvable.')).toBeVisible();
  await expect(page.getByText('note-commune.pdf')).toHaveCount(0);
});
