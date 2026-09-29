import { test, expect } from '@playwright/test';
import {
  signUpAndVerify,
  provisionUser,
  provisionPassword,
  reachNewPasswordStep,
  E2E_PASSWORD,
} from './_helpers';

// Registration (with OTP email verification) -> sign out -> sign in again. (F-01)
test('inscription + vérification, déconnexion, reconnexion par mot de passe', async ({
  page,
}) => {
  const email = `e2e_${Date.now()}@democracytogether.test`;
  const password = E2E_PASSWORD;

  await signUpAndVerify(page, email, password);
  await expect(page.getByRole('button', { name: 'Déconnexion' })).toBeVisible({
    timeout: 15_000,
  });

  // sign out
  await page.getByRole('button', { name: 'Déconnexion' }).click();
  await expect(
    page.getByRole('link', { name: 'Connexion' }).first(),
  ).toBeVisible();

  // sign in again
  await page.goto('/fr/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/espace-membre$/);
  await expect(page.getByRole('button', { name: 'Déconnexion' })).toBeVisible({
    timeout: 15_000,
  });
});

// The member area shows the email and the role (authenticated Convex data).
// Membership model B: self-registration grants the "visiteur" role.
test("l'espace membre affiche l'utilisateur courant", async ({ page }) => {
  const email = `e2e_me_${Date.now()}@democracytogether.test`;
  await signUpAndVerify(page, email, E2E_PASSWORD);
  await expect(page.getByText(email).first()).toBeVisible();
  // The role is displayed by its LABEL (`auth.role_*`), no longer by its raw
  // value "visiteur" (auth A-7).
  await expect(page.getByText('Visiteur', { exact: true })).toBeVisible();
  // visitor -> invited to apply (not a member yet)
  await expect(
    page.getByRole('heading', { name: 'Devenez membre du réseau' }),
  ).toBeVisible();
});

// Password confirmation: different entries -> error, no write.
//
// This test targeted the registration form, whose page now redirects
// to /adhesion. Password confirmation still exists — when setting
// the password through "forgot password", which is precisely the
// journey of an invited member (see `setPasswordViaReset` in `_helpers`). So
// that is where the guard is checked. (F-01)
test('définition du mot de passe : saisies non concordantes refusées', async ({
  page,
}) => {
  const email = `mismatch_${Date.now()}@democracytogether.test`;
  await provisionUser(email);
  // The reset screen requires an account that ALREADY has a password: without it,
  // `flow: 'reset'` throws `InvalidAccountId` and the screen does not appear (#66).
  await provisionPassword(email, 'motdepassedepart1');

  await reachNewPasswordStep(page, email);
  await page
    .getByLabel('Nouveau mot de passe', { exact: true })
    .fill(E2E_PASSWORD);
  await page.getByLabel('Confirmer le mot de passe').fill('autremotdepasse5');
  await page
    .getByRole('button', { name: 'Réinitialiser le mot de passe' })
    .click();

  await expect(
    page.getByText('Les mots de passe ne correspondent pas'),
  ).toBeVisible();
  // still at the entry step: the reset did not happen
  await expect(
    page.getByRole('heading', { name: 'Nouveau mot de passe' }),
  ).toBeVisible();
});
