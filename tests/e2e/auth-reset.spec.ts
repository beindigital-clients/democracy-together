import { test, expect } from '@playwright/test';
import { getOtp, signUpAndVerify } from './_helpers';

// Mot de passe oublié : reset par code, puis connexion avec le nouveau mot de passe. (F-01)
test('mot de passe oublié -> réinitialisation -> connexion', async ({
  page,
}) => {
  const email = `e2e_reset_${Date.now()}@democracytogether.test`;
  await signUpAndVerify(page, email, 'ancienmotdepasse1');

  // déconnexion
  await page.getByRole('button', { name: 'Déconnexion' }).click();
  await expect(
    page.getByRole('link', { name: 'Connexion' }).first(),
  ).toBeVisible();

  // demande de reset
  await page.goto('/fr/mot-de-passe-oublie');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: 'Envoyer le code' }).click();
  await expect(
    page.getByRole('heading', { name: 'Nouveau mot de passe' }),
  ).toBeVisible();

  // saisie code + nouveau mot de passe
  await page.getByLabel('Code de vérification').fill(await getOtp(email));
  await page.getByLabel('Nouveau mot de passe').fill('nouveaumotdepasse2');
  await page.getByLabel('Confirmer le mot de passe').fill('nouveaumotdepasse2');
  await page
    .getByRole('button', { name: 'Réinitialiser le mot de passe' })
    .click();
  await expect(page).toHaveURL(/\/espace-membre$/);

  // reconnexion avec le NOUVEAU mot de passe
  await page.getByRole('button', { name: 'Déconnexion' }).click();
  await page.goto('/fr/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page
    .getByLabel('Mot de passe', { exact: true })
    .fill('nouveaumotdepasse2');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/espace-membre$/);
});
