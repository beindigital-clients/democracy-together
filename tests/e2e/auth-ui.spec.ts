import { test, expect } from '@playwright/test';

test('connexion : lien OTP reformulé + champ mot de passe affichable/masquable', async ({
  page,
}) => {
  await page.goto('/fr/connexion');

  // libellé du lien passwordless revu
  await expect(
    page.getByRole('link', { name: 'Se connecter sans mot de passe' }),
  ).toBeVisible();

  // bascule afficher / masquer
  const pwd = page.getByLabel('Mot de passe', { exact: true });
  await pwd.fill('secret1234');
  await expect(pwd).toHaveAttribute('type', 'password');

  await page.getByRole('button', { name: 'Afficher le mot de passe' }).click();
  await expect(pwd).toHaveAttribute('type', 'text');

  await page.getByRole('button', { name: 'Masquer le mot de passe' }).click();
  await expect(pwd).toHaveAttribute('type', 'password');
});
