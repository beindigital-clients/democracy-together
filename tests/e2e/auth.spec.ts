import { test, expect } from '@playwright/test';
import { signUpAndVerify, provisionUser, getOtp } from './_helpers';

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
  await expect(
    page.getByRole('link', { name: 'Connexion' }).first(),
  ).toBeVisible();

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

// Confirmation du mot de passe : saisies différentes -> erreur, pas d'écriture.
//
// Ce test visait le formulaire d'inscription, dont la page redirige désormais
// vers /adhesion. La confirmation du mot de passe existe toujours — sur la
// définition du mot de passe par « mot de passe oublié », qui est justement le
// parcours d'un membre invité (cf. `setPasswordViaReset` dans `_helpers`). C'est
// donc là que la garde est vérifiée. (F-01)
test('définition du mot de passe : saisies non concordantes refusées', async ({
  page,
}) => {
  const email = `mismatch_${Date.now()}@democracytogether.test`;
  await provisionUser(email);

  await page.goto('/fr/mot-de-passe-oublie');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: 'Envoyer le code' }).click();

  await expect(
    page.getByRole('heading', { name: 'Nouveau mot de passe' }),
  ).toBeVisible();
  await page.getByLabel('Code de vérification').fill(await getOtp(email));
  await page
    .getByLabel('Nouveau mot de passe', { exact: true })
    .fill('motdepasse1234');
  await page.getByLabel('Confirmer le mot de passe').fill('autremotdepasse5');
  await page
    .getByRole('button', { name: 'Réinitialiser le mot de passe' })
    .click();

  await expect(
    page.getByText('Les mots de passe ne correspondent pas'),
  ).toBeVisible();
  // toujours à l'étape de saisie : la réinitialisation n'a pas eu lieu
  await expect(
    page.getByRole('heading', { name: 'Nouveau mot de passe' }),
  ).toBeVisible();
});
