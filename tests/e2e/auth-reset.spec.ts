import { test, expect } from '@playwright/test';
import { getOtp, seDeconnecter, signUpAndVerify } from './_helpers';

// Forgot password: reset by code, then sign in with the new password. (F-01)
// One question per screen: address, then code, then new password.
test('mot de passe oublié -> réinitialisation -> connexion', async ({
  page,
}) => {
  const email = `e2e_reset_${Date.now()}@democracytogether.test`;
  await signUpAndVerify(page, email, 'ancienmotdepasse1');

  // sign out
  await seDeconnecter(page);
  await expect(
    page.getByRole('link', { name: 'Connexion' }).first(),
  ).toBeVisible();

  // reset request
  await page.goto('/fr/mot-de-passe-oublie');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: 'Envoyer le code' }).click();

  // the code, on its own: no password field yet
  await expect(
    page.getByRole('heading', { name: 'Saisissez le code' }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Nouveau mot de passe', { exact: true }),
  ).toHaveCount(0);
  await page.getByLabel('Code de vérification').fill(await getOtp(email));
  await page.getByRole('button', { name: 'Continuer', exact: true }).click();

  // then the new password
  await expect(
    page.getByRole('heading', { name: 'Nouveau mot de passe' }),
  ).toBeVisible();
  await page
    .getByLabel('Nouveau mot de passe', { exact: true })
    .fill('nouveaumotdepasse2');
  await page.getByLabel('Confirmer le mot de passe').fill('nouveaumotdepasse2');
  await page
    .getByRole('button', { name: 'Réinitialiser le mot de passe' })
    .click();
  await expect(page).toHaveURL(/\/espace-membre$/);

  // sign in again with the NEW password
  await seDeconnecter(page);
  await page.goto('/fr/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page
    .getByLabel('Mot de passe', { exact: true })
    .fill('nouveaumotdepasse2');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/espace-membre$/);
});
