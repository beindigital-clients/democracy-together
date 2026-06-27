import { test, expect } from '@playwright/test';
import { signUpAndVerify } from './_helpers';

// Inscription (avec vérification e-mail OTP) -> déconnexion -> reconnexion. (F-01)
test('inscription + vérification, déconnexion, reconnexion par mot de passe', async ({
  page,
}) => {
  const email = `e2e_${Date.now()}@democracytogether.test`;
  const password = 'motdepasse1234';

  await signUpAndVerify(page, email, password);
  await expect(page.getByRole('button', { name: 'Déconnexion' })).toBeVisible({
    timeout: 15_000,
  });

  // déconnexion
  await page.getByRole('button', { name: 'Déconnexion' }).click();
  await expect(page.getByRole('link', { name: 'Connexion' }).first()).toBeVisible();

  // reconnexion
  await page.goto('/fr/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/espace-membre$/);
  await expect(page.getByRole('button', { name: 'Déconnexion' })).toBeVisible({
    timeout: 15_000,
  });
});

// L'espace membre montre l'e-mail et le rôle (donnée Convex authentifiée).
// Modèle d'adhésion B : une auto-inscription donne le rôle « visiteur ».
test("l'espace membre affiche l'utilisateur courant", async ({ page }) => {
  const email = `e2e_me_${Date.now()}@democracytogether.test`;
  await signUpAndVerify(page, email, 'motdepasse1234');
  await expect(page.getByText(email).first()).toBeVisible();
  await expect(page.getByText('visiteur', { exact: true })).toBeVisible();
  // visiteur -> invité à candidater (pas encore membre)
  await expect(
    page.getByRole('heading', { name: 'Devenez membre du réseau' }),
  ).toBeVisible();
});

// Confirmation du mot de passe : saisies différentes -> erreur, pas de création. (F-01)
test('inscription : mots de passe non concordants bloquent la création', async ({
  page,
}) => {
  await page.goto('/fr/inscription');
  await page
    .getByLabel('E-mail')
    .fill(`mismatch_${Date.now()}@democracytogether.test`);
  await page.getByLabel('Mot de passe', { exact: true }).fill('motdepasse1234');
  await page.getByLabel('Confirmer le mot de passe').fill('autremotdepasse5');
  await page.getByRole('button', { name: 'Créer le compte' }).click();

  await expect(
    page.getByText('Les mots de passe ne correspondent pas'),
  ).toBeVisible();
  // toujours à l'étape inscription (pas passé à la vérification)
  await expect(
    page.getByRole('heading', { name: 'Créer un compte' }),
  ).toBeVisible();
});
