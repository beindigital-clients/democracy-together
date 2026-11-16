import { test, expect } from '@playwright/test';
import {
  chercherUtilisateur,
  getOtp,
  provisionUser,
  setAmi,
  signInWithCode,
} from './_helpers';
import { SESSIONS } from './_sessions';

// CERCLE DES AMIS — suspending an Ami cuts the Cercle at once, through the
// screens: the Ami is reading the private space, the administrator suspends the
// account from /admin/utilisateurs, and the Ami's open session no longer opens
// the space — nor does a new sign-in.
//
// Dedicated session (`cercleAdminSecurity`): see tests/e2e/_sessions.ts.

test.use({ locale: 'fr-FR' });
test.use({ storageState: SESSIONS.cercleAdminSecurity.state });
test.afterEach(async ({ context }) => {
  await context.storageState({ path: SESSIONS.cercleAdminSecurity.state });
});

test('suspendre un Ami lui ferme le Cercle immédiatement', async ({
  page,
  browser,
}) => {
  const email = `e2e_cercle_susp_${Date.now()}@democracytogether.test`;
  await provisionUser(email, 'visiteur');
  await setAmi(email, true);

  // The Ami reads the private space.
  const ctx = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    locale: 'fr-FR',
  });
  const ami = await ctx.newPage();
  await signInWithCode(ami, email);
  await ami.goto('/fr/espace-membre/cercle');
  await expect(
    ami.getByRole('heading', { level: 1, name: 'Espace privé du Cercle' }),
  ).toBeVisible();

  // The administrator suspends the account, reason required.
  await page.goto('/fr/admin/utilisateurs');
  await chercherUtilisateur(page, email);
  const row = page.getByRole('row').filter({ hasText: email });
  await row.getByRole('button', { name: `Suspendre ${email}` }).click();
  await row
    .getByLabel('Motif de la suspension (obligatoire)')
    .fill('Test E2E : comportement abusif');
  await row.getByRole('button', { name: 'Suspendre le compte' }).click();
  const dialog = page.getByRole('dialog', { name: `Suspendre ${email} ?` });
  await dialog.getByRole('button', { name: 'Suspendre le compte' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: `${email} est suspendu.` }),
  ).toBeVisible();

  // The open session is closed: the space does not open any more.
  await ami.goto('/fr/espace-membre/cercle');
  await expect(ami).toHaveURL(/\/connexion/, { timeout: 20_000 });
  await expect(
    ami.getByRole('heading', { name: 'Espace privé du Cercle' }),
  ).toHaveCount(0);

  // A new sign-in is refused.
  await ami.goto('/fr/connexion-otp');
  await ami.getByLabel('E-mail').fill(email);
  await ami.getByRole('button', { name: 'Recevoir un code' }).click();
  await expect(
    ami.getByRole('heading', { name: 'Saisissez le code' }),
  ).toBeVisible();
  await ami.getByLabel('Code de vérification').fill(await getOtp(email));
  await ami.getByRole('button', { name: 'Se connecter' }).click();
  await expect(ami.getByText('Ce compte est suspendu.')).toBeVisible();
  await expect(ami).not.toHaveURL(/\/espace-membre/);
  await ctx.close();
});
