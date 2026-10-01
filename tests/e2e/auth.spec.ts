import { test, expect } from '@playwright/test';
import {
  E2E_PASSWORD,
  getOtp,
  menuCompte,
  provisionPassword,
  provisionUser,
  reachNewPasswordStep,
  seDeconnecter,
  signUpAndVerify,
} from './_helpers';

// Registration (with OTP email verification) -> sign out -> sign in again. (F-01)
test('inscription + vérification, déconnexion, reconnexion par mot de passe', async ({
  page,
}) => {
  const email = `e2e_${Date.now()}@democracytogether.test`;
  const password = E2E_PASSWORD;

  await signUpAndVerify(page, email, password);
  await expect(menuCompte(page)).toBeVisible({
    timeout: 15_000,
  });

  // sign out
  await seDeconnecter(page);
  await expect(
    page.getByRole('link', { name: 'Connexion' }).first(),
  ).toBeVisible();

  // sign in again
  await page.goto('/fr/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/espace-membre$/);
  await expect(menuCompte(page)).toBeVisible({
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

// Accounts store their address in lowercase (`normalizeEmail`), and the
// screens used to send it as typed: one capital letter — a phone keyboard
// adds one on its own — and the password was "incorrect", while the code by
// e-mail never came. The same capitalized address, on the three screens.
test('une adresse saisie avec des majuscules est reconnue par les trois écrans', async ({
  page,
}) => {
  const email = `e2e_casse_${Date.now()}@democracytogether.test`;
  const typed =
    email.charAt(0).toUpperCase() +
    email.slice(1).replace('@democracytogether', '@DemocracyTogether');
  await provisionUser(email);
  await provisionPassword(email, E2E_PASSWORD);

  // Password sign-in.
  await page.goto('/fr/connexion');
  await page.getByLabel('E-mail').fill(typed);
  await page.getByLabel('Mot de passe', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/espace-membre$/);
  await seDeconnecter(page);
  await expect(
    page.getByRole('link', { name: 'Connexion' }).first(),
  ).toBeVisible();

  // Sign-in by code: the code goes to the account's (lowercase) address.
  await page.goto('/fr/connexion-otp');
  await page.getByLabel('E-mail').fill(typed);
  await page.getByRole('button', { name: 'Recevoir un code' }).click();
  await expect(
    page.getByRole('heading', { name: 'Saisissez le code' }),
  ).toBeVisible();
  await page.getByLabel('Code de vérification').fill(await getOtp(email));
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/espace-membre$/);
  await seDeconnecter(page);
  await expect(
    page.getByRole('link', { name: 'Connexion' }).first(),
  ).toBeVisible();

  // Forgot password, up to the new-password screen.
  await page.goto('/fr/mot-de-passe-oublie');
  await page.getByLabel('E-mail').fill(typed);
  await page.getByRole('button', { name: 'Envoyer le code' }).click();
  await expect(
    page.getByRole('heading', { name: 'Saisissez le code' }),
  ).toBeVisible();
  await page.getByLabel('Code de vérification').fill(await getOtp(email));
  await page.getByRole('button', { name: 'Continuer', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Nouveau mot de passe' }),
  ).toBeVisible();
});
