import { test, expect } from '@playwright/test';
import { getOtp, provisionUser, signInWithCode } from './_helpers';

test.use({ locale: 'fr-FR' });

// R-05 / auth A-3 — UN MEMBRE INVITÉ PEUT SE DONNER UN MOT DE PASSE.
//
// L'e-mail d'invitation promet « vous pourrez en définir un depuis votre
// espace membre ». L'écran n'existait pas : « mot de passe oublié » répondait
// « une erreur est survenue » à un compte sans mot de passe (`flow: 'reset'`
// exige un compte mot de passe existant), et `provisionPassword` (E2E)
// passait par l'API faute d'interface. Ce test suit désormais le parcours
// réel : connexion par code (seul chemin d'un invité), lien de l'espace
// membre, mot de passe + confirmation, code de vérification, puis — la
// preuve — une reconnexion PAR MOT DE PASSE.
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

  // La politique s'applique ICI aussi, champ par champ, comme sur « mot de
  // passe oublié » (convex/lib/passwordPolicy.ts).
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

  // LA PREUVE : déconnexion, puis connexion par mot de passe.
  await page.getByRole('button', { name: 'Déconnexion' }).click();
  await expect(page).toHaveURL(/\/fr$/);
  await page.goto('/fr/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/espace-membre$/);
  // Et le rôle n'a pas bougé en chemin (liaison sans réécriture du compte).
  await expect(page.getByText('Membre', { exact: true })).toBeVisible();
});

// Après « Déconnexion », l'URL est celle d'une route PROPRE (auth A-6) : plus
// de formulaire de connexion affiché sous `/espace-membre`, ni d'entrée
// d'historique `/connexion?_rsc=…`.
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
  // Aucun contenu membre ne ressort de l'historique.
  await expect(page.getByRole('button', { name: 'Déconnexion' })).toHaveCount(
    0,
  );
});
