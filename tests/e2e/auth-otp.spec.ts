import { test, expect } from '@playwright/test';
import { getOtp, provisionUser } from './_helpers';

// Connexion sans mot de passe par code à usage unique (passwordless). (F-01)
//
// Le compte est PROVISIONNÉ d'abord. Ce test attendait auparavant que le code
// crée le compte au passage — c'était vrai avant la suppression de
// l'auto-inscription, ça ne l'est plus : le callback `createOrUpdateUser`
// refuse désormais toute adresse inconnue (`NO_SELF_SIGNUP`). Le test ne
// pouvait donc plus passer, et son intitulé décrivait un comportement que le
// produit n'a plus. Ce qu'il vérifie reste entier : sur un compte existant, un
// code à usage unique suffit à ouvrir une session, sans mot de passe.
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
