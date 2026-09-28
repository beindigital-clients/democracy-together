import { test, expect } from '@playwright/test';
import { getOtp, provisionUser } from './_helpers';

// Passwordless sign-in with a one-time code. (F-01)
//
// The account is PROVISIONED first. This test used to expect the code
// to create the account along the way — that was true before
// self-registration was removed, it no longer is: the `createOrUpdateUser` callback
// now refuses any unknown address (`NO_SELF_SIGNUP`). The test
// could therefore no longer pass, and its title described a behavior the
// product no longer has. What it checks remains intact: on an existing account, a
// one-time code is enough to open a session, without a password.
test('connexion par code (passwordless) sur un compte existant', async ({
  page,
}) => {
  const email = `e2e_otp_${Date.now()}@democracytogether.test`;
  await provisionUser(email);

  await page.goto('/fr/connexion-otp');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: 'Recevoir un code' }).click();

  await expect(
    page.getByRole('heading', { name: 'Saisissez le code' }),
  ).toBeVisible();
  await page.getByLabel('Code de vérification').fill(await getOtp(email));
  await page.getByRole('button', { name: 'Se connecter' }).click();

  await expect(page).toHaveURL(/\/espace-membre$/);
  await expect(page.getByRole('button', { name: 'Déconnexion' })).toBeVisible({
    timeout: 15_000,
  });
});
