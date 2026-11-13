import { test, expect } from '@playwright/test';
import { chercherUtilisateur, provisionUser } from './_helpers';
import { SESSIONS } from './_sessions';

// CERCLE DES AMIS — the Ami status, from the back office.
//
// The administrator opens /admin/utilisateurs, turns the "Ami du Cercle"
// switch on for a plain visitor account, and the status survives a reload
// (written server-side, not only in React state). The rank selector is not
// touched: the status is independent of it.
//
// Dedicated session (`cercleAdmin`): see tests/e2e/_sessions.ts.

test.use({ locale: 'fr-FR' });
test.use({ storageState: SESSIONS.cercleAdmin.state });
test.afterEach(async ({ context }) => {
  await context.storageState({ path: SESSIONS.cercleAdmin.state });
});

test('l’administrateur donne puis retire le statut Ami, sans toucher au rang', async ({
  page,
}) => {
  const email = `e2e_cercle_ami_${Date.now()}@democracytogether.test`;
  await provisionUser(email, 'visiteur');

  await page.goto('/fr/admin/utilisateurs');
  await chercherUtilisateur(page, email);
  const row = page.getByRole('row').filter({ hasText: email });
  const toggle = row.getByRole('switch', { name: `Ami du Cercle : ${email}` });
  await expect(toggle).not.toBeChecked();

  await toggle.click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: `${email} est maintenant Ami du Cercle.` }),
  ).toBeVisible();

  // The status is on the server: it survives a reload.
  await page.reload();
  await chercherUtilisateur(page, email);
  const reloaded = page.getByRole('row').filter({ hasText: email });
  await expect(
    reloaded.getByRole('switch', { name: `Ami du Cercle : ${email}` }),
  ).toBeChecked();
  // The rank stays "Visiteur": the status never raises it.
  await expect(reloaded).toContainText('Visiteur');

  await reloaded
    .getByRole('switch', { name: `Ami du Cercle : ${email}` })
    .click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: `${email} n'est plus Ami du Cercle.` }),
  ).toBeVisible();
});
