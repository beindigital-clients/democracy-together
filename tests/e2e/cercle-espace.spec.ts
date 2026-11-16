import { test, expect, type Browser } from '@playwright/test';
import { provisionUser, setAmi, signInWithCode } from './_helpers';

// CERCLE DES AMIS — the private contributions space, through the screens.
//
// An Ami (a visitor account with the status) sees the Cercle entry and its
// space, writes several contributions, reads another Ami's, and removes their
// own. A plain visitor finds a closed door, and no entry in the navigation.
// Accounts are created fresh for each run and sign in by one-time code.

test.use({ locale: 'fr-FR' });
test.describe.configure({ mode: 'serial' });

const STAMP = Date.now();
const AMI_1 = `e2e_cercle_ami1_${STAMP}@democracytogether.test`;
const AMI_2 = `e2e_cercle_ami2_${STAMP}@democracytogether.test`;
const VISITOR = `e2e_cercle_visiteur_${STAMP}@democracytogether.test`;

async function signedIn(browser: Browser, email: string) {
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    locale: 'fr-FR',
  });
  const page = await context.newPage();
  await signInWithCode(page, email);
  return { context, page };
}

test('un visiteur sans le statut trouve une porte fermée et aucune entrée', async ({
  browser,
}) => {
  await provisionUser(VISITOR, 'visiteur');
  const { context, page } = await signedIn(browser, VISITOR);
  const nav = page.getByRole('navigation', {
    name: /Espace membre|Mon espace/,
  });
  await expect(nav.getByRole('link', { name: 'Cercle des Amis' })).toHaveCount(
    0,
  );

  await page.goto('/fr/espace-membre/cercle');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Espace réservé' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Demander à rejoindre le Cercle' }),
  ).toBeVisible();
  // No form, no contribution.
  await expect(page.getByLabel('Votre contribution')).toHaveCount(0);
  await context.close();
});

test('un Ami écrit plusieurs contributions et lit celles d’un autre Ami', async ({
  browser,
}) => {
  await provisionUser(AMI_1, 'visiteur');
  await provisionUser(AMI_2, 'visiteur');
  await setAmi(AMI_1, true);
  await setAmi(AMI_2, true);

  const first = await signedIn(browser, AMI_1);
  // The entry is in the navigation and leads to the space.
  const nav = first.page.getByRole('navigation', {
    name: /Espace membre|Mon espace/,
  });
  await nav.getByRole('link', { name: 'Cercle des Amis' }).click();
  await expect(
    first.page.getByRole('heading', {
      level: 1,
      name: 'Espace privé du Cercle',
    }),
  ).toBeVisible();

  // Validation on the client…
  await first.page.getByRole('button', { name: 'Ajouter au Cercle' }).click();
  await expect(
    first.page.getByText('Écrivez au moins 10 caractères.'),
  ).toBeVisible();

  // …then two submissions.
  const field = first.page.getByLabel('Votre contribution');
  await field.fill(`Première piste de l’Ami 1 (${STAMP}).`);
  await first.page.getByRole('button', { name: 'Ajouter au Cercle' }).click();
  await expect(
    first.page.getByRole('status').filter({ hasText: 'Contribution ajoutée.' }),
  ).toBeVisible();
  await field.fill(`Seconde piste, sur deux lignes.\nLigne deux (${STAMP}).`);
  await first.page.getByRole('button', { name: 'Ajouter au Cercle' }).click();

  const list = first.page.getByRole('list', {
    name: 'Contributions du Cercle',
  });
  // The deployment lives long: the list holds earlier runs' contributions
  // too, so the two of THIS run are found by their text, not counted.
  await expect(
    list.getByText(`Première piste de l’Ami 1 (${STAMP}).`),
  ).toBeVisible({ timeout: 15_000 });
  await expect(list.getByText(`Ligne deux (${STAMP}).`)).toBeVisible();
  await expect(list.getByText('Vous').first()).toBeVisible();

  // The other Ami reads them — as "a Friend of the Circle", never by address.
  const second = await signedIn(browser, AMI_2);
  await second.page.goto('/fr/espace-membre/cercle');
  const list2 = second.page.getByRole('list', {
    name: 'Contributions du Cercle',
  });
  await expect(
    list2.getByText(`Première piste de l’Ami 1 (${STAMP}).`),
  ).toBeVisible();
  await expect(list2.getByText('Un Ami du Cercle').first()).toBeVisible();
  await expect(second.page.getByText(AMI_1)).toHaveCount(0);
  // Someone else's contribution has no removal button.
  await expect(
    list2.getByRole('button', { name: 'Retirer cette contribution' }),
  ).toHaveCount(0);
  await second.context.close();

  // The author removes one of theirs, after a confirmation.
  await first.page
    .getByRole('listitem')
    .filter({ hasText: 'Première piste' })
    .getByRole('button', { name: 'Retirer cette contribution' })
    .click();
  const dialog = first.page.getByRole('dialog', {
    name: 'Retirer cette contribution ?',
  });
  await dialog.getByRole('button', { name: 'Retirer', exact: true }).click();
  await expect(
    first.page.getByRole('status').filter({ hasText: 'Contribution retirée.' }),
  ).toBeVisible();
  await first.context.close();
});

test('retirer le statut Ami referme l’espace', async ({ browser }) => {
  const { context, page } = await signedIn(browser, AMI_2);
  await page.goto('/fr/espace-membre/cercle');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Espace privé du Cercle' }),
  ).toBeVisible();
  await setAmi(AMI_2, false);
  // Live: the open page notices without a reload.
  await expect(
    page.getByRole('heading', { level: 1, name: 'Espace réservé' }),
  ).toBeVisible({ timeout: 15_000 });
  await context.close();
});
