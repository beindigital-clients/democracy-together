import { test, expect } from '@playwright/test';
import { signUpAndVerify } from './_helpers';

test.use({ locale: 'fr-FR' });

// Couverture des chemins de REFUS (l'audit avait relevé leur absence).

test('connexion : mauvais mot de passe refusé, pas de session (F-01)', async ({
  page,
}) => {
  const email = `e2e_wrongpw_${Date.now()}@democracytogether.test`;
  await signUpAndVerify(page, email, 'bonmotdepasse1');
  await page.getByRole('button', { name: 'Déconnexion' }).click();

  await page.goto('/fr/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page
    .getByLabel('Mot de passe', { exact: true })
    .fill('mauvaismotdepasse');
  await page.getByRole('button', { name: 'Se connecter' }).click();

  // reste sur /connexion, message d'erreur, jamais authentifié
  await expect(
    page.getByText('E-mail ou mot de passe incorrect.'),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/fr\/connexion$/);
});

test('inscription : code de vérification invalide refusé (F-01)', async ({
  page,
}) => {
  const email = `e2e_badotp_${Date.now()}@democracytogether.test`;
  await page.goto('/fr/inscription');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill('motdepasse123');
  await page.getByLabel('Confirmer le mot de passe').fill('motdepasse123');
  await page.getByRole('button', { name: 'Créer le compte' }).click();

  await expect(
    page.getByRole('heading', { name: 'Vérifiez votre e-mail' }),
  ).toBeVisible();

  // code volontairement faux
  await page.getByLabel('Code de vérification').fill('000000');
  await page.getByRole('button', { name: 'Vérifier' }).click();

  await expect(page.getByText('Code invalide ou expiré.')).toBeVisible();
  await expect(page).not.toHaveURL(/\/espace-membre$/);
});
