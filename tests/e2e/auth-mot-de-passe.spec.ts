import { test, expect } from '@playwright/test';
import { getOtp, provisionUser, signInWithCode } from './_helpers';

test.use({ locale: 'fr-FR' });

// R-05 / auth A-3 — AN INVITED MEMBER CAN SET THEMSELVES A PASSWORD.
//
// The invitation email promises "vous pourrez en définir un depuis votre
// espace membre". The screen did not exist: "forgot password" answered
// "an error occurred" for an account without a password (`flow: 'reset'`
// requires an existing password account), and `provisionPassword` (E2E)
// went through the API for lack of a UI. This test now follows the real
// journey: code sign-in (an invitee's only path), member-area
// link, password + confirmation, verification code, then — the
// proof — signing in again WITH THE PASSWORD.
test('membre invité : définit un mot de passe depuis l’espace membre, puis se connecte avec (R-05)', async ({
  page,
}) => {
  const email = `e2e_setpw_${Date.now()}@democracytogether.test`;
  const password = 'une-phrase-de-passe-choisie';
  await provisionUser(email, 'membre');
  await signInWithCode(page, email);

  await page
    .getByRole('link', { name: 'Définir ou changer mon mot de passe' })
    .click();
  await expect(page).toHaveURL(/\/fr\/espace-membre\/mot-de-passe$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Mon mot de passe' }),
  ).toBeVisible();

  // The policy applies HERE too, field by field, as on "forgot
  // password" (convex/lib/passwordPolicy.ts).
  await page.getByLabel('Nouveau mot de passe', { exact: true }).fill('court');
  await page.getByLabel('Confirmer le mot de passe').fill('court');
  await page
    .getByRole('button', { name: 'Envoyer le code de vérification' })
    .click();
  await expect(page.getByText(/12 caractères minimum/)).toBeVisible();

  await page.getByLabel('Nouveau mot de passe', { exact: true }).fill(password);
  await page.getByLabel('Confirmer le mot de passe').fill(password);
  await page
    .getByRole('button', { name: 'Envoyer le code de vérification' })
    .click();

  await expect(
    page.getByRole('heading', { name: 'Confirmez votre mot de passe' }),
  ).toBeVisible();
  await page.getByLabel('Code de vérification').fill(await getOtp(email));
  await page
    .getByRole('button', { name: 'Enregistrer le mot de passe' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Mot de passe enregistré' }),
  ).toBeVisible();

  // THE PROOF: sign out, then sign in with the password.
  await page.getByRole('button', { name: 'Déconnexion' }).click();
  await expect(page).toHaveURL(/\/fr$/);
  await page.goto('/fr/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/espace-membre$/);
  // And the role did not change along the way (linking without rewriting the account).
  await expect(page.getByText('Membre', { exact: true })).toBeVisible();
});

// After "Déconnexion", the URL is that of a CLEAN route (auth A-6): no more
// sign-in form displayed under `/espace-membre`, nor a
// `/connexion?_rsc=…` history entry.
test('déconnexion : navigue vers l’accueil, sans URL interne dans l’historique (A-6)', async ({
  page,
}) => {
  const email = `e2e_signout_${Date.now()}@democracytogether.test`;
  await provisionUser(email);
  await signInWithCode(page, email);

  await page.getByRole('button', { name: 'Déconnexion' }).click();
  await expect(page).toHaveURL(/\/fr$/);
  await expect(
    page.getByRole('link', { name: 'Connexion' }).first(),
  ).toBeVisible();

  await page.goBack();
  await expect(page).not.toHaveURL(/_rsc=/);
  // No member content resurfaces from the history.
  await expect(page.getByRole('button', { name: 'Déconnexion' })).toHaveCount(
    0,
  );
});
