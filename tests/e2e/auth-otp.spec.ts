import { test, expect } from '@playwright/test';
import { getOtp } from './_helpers';

// Connexion sans mot de passe par code à usage unique (passwordless). (F-01)
test('connexion par code (passwordless) crée le compte et connecte', async ({
  page,
}) => {
  const email = `e2e_otp_${Date.now()}@democracytogether.test`;

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
