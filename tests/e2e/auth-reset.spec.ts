import { test, expect } from '@playwright/test';
import { getOtp, signUpAndVerify } from './_helpers';

// Forgot password: reset by code, then sign in with the new password. (F-01)
test('mot de passe oublié -> réinitialisation -> connexion', async ({
  page,
}) => {
  const email = `e2e_reset_${Date.now()}@democracytogether.test`;
  await signUpAndVerify(page, email, 'ancienmotdepasse1');

  // sign out
  await page.getByRole('button', { name: 'Déconnexion' }).click();
  await expect(
    page.getByRole('link', { name: 'Connexion' }).first(),
  ).toBeVisible();

  // reset request
  await page.goto('/fr/mot-de-passe-oublie');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: 'Envoyer le code' }).click();
  await expect(
    page.getByRole('heading', { name: 'Nouveau mot de passe' }),
  ).toBeVisible();

  // enter code + new password
  await page.getByLabel('Code de vérification').fill(await getOtp(email));
  await page.getByLabel('Nouveau mot de passe').fill('nouveaumotdepasse2');
  await page.getByLabel('Confirmer le mot de passe').fill('nouveaumotdepasse2');
  await page
    .getByRole('button', { name: 'Réinitialiser le mot de passe' })
    .click();
  await expect(page).toHaveURL(/\/espace-membre$/);

  // sign in again with the NEW password
  await page.getByRole('button', { name: 'Déconnexion' }).click();
  await page.goto('/fr/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page
    .getByLabel('Mot de passe', { exact: true })
    .fill('nouveaumotdepasse2');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/espace-membre$/);
});
