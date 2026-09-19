import { test, expect } from '@playwright/test';
import {
  signUpAndVerify,
  provisionUser,
  provisionPassword,
  getOtp,
  E2E_PASSWORD,
} from './_helpers';

test.use({ locale: 'fr-FR' });

// Couverture des chemins de REFUS (l'audit avait relevé leur absence).

test('connexion : mauvais mot de passe refusé, pas de session (F-01)', async ({
  page,
}) => {
  const email = `e2e_wrongpw_${Date.now()}@democracytogether.test`;
  await signUpAndVerify(page, email, E2E_PASSWORD);
  await page.getByRole('button', { name: 'Déconnexion' }).click();

  await page.goto('/fr/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page
    .getByLabel('Mot de passe', { exact: true })
    .fill('un-mauvais-mot-de-passe');
  await page.getByRole('button', { name: 'Se connecter' }).click();

  // reste sur /connexion, message d'erreur, jamais authentifié
  await expect(
    page.getByText('E-mail ou mot de passe incorrect.'),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/fr\/connexion$/);
});

// Ce test visait /fr/inscription, qui redirige désormais vers /adhesion
// (src/app/[locale]/inscription/page.tsx) : l'auto-inscription n'existe plus.
// Le COMPORTEMENT vérifié — un code à usage unique erroné est refusé et
// n'ouvre pas de session — existe toujours, sur la connexion par code. C'est là
// qu'il est vérifié maintenant.
//
// Le compte est provisionné d'abord : la connexion par code refuse une adresse
// inconnue (NO_SELF_SIGNUP), donc sans cela le test échouerait à l'étape
// précédant celle qu'il veut éprouver.
test('connexion par code : code invalide refusé, pas de session (F-01)', async ({
  page,
}) => {
  const email = `e2e_badotp_${Date.now()}@democracytogether.test`;
  await provisionUser(email);

  await page.goto('/fr/connexion-otp');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: 'Recevoir un code' }).click();

  await expect(
    page.getByRole('heading', { name: 'Saisissez le code' }),
  ).toBeVisible();

  // code volontairement faux
  await page.getByLabel('Code de vérification').fill('000000');
  await page.getByRole('button', { name: 'Se connecter' }).click();

  await expect(page.getByText('Code invalide ou expiré.')).toBeVisible();
  await expect(page).not.toHaveURL(/\/espace-membre$/);
});

// L'auto-inscription est fermée : la page ne doit pas réapparaître par accident.
test('/inscription redirige vers la demande d’adhésion (F-22)', async ({
  page,
}) => {
  await page.goto('/fr/inscription');
  await expect(page).toHaveURL(/\/fr\/adhesion$/);
});

// Politique de mot de passe (sécurité — constat M4). La banalité d'un mot de
// passe est la SEULE règle que le navigateur ne peut pas vérifier lui-même : la
// longueur, il la refuse par `minLength`. Ce test vise donc le refus serveur, et
// le message que l'interface en tire.
//
// Le compte reçoit d'abord un mot de passe par `provisionPassword` : « mot de
// passe oublié » commence par `retrieveAccount` et lève `InvalidAccountId` sans
// compte « password » préalable (issue #66). Une fixture qui s'arrêterait à
// `provisionUser` mourrait donc avant d'atteindre le champ visé, et le test
// passerait pour un échec de politique alors qu'il n'aurait rien exercé.
test('changement de mot de passe : un mot de passe trop courant est refusé', async ({
  page,
}) => {
  const email = `e2e_weakpw_${Date.now()}@democracytogether.test`;
  await provisionUser(email);
  await provisionPassword(email, E2E_PASSWORD);

  await page.goto('/fr/mot-de-passe-oublie');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: 'Envoyer le code' }).click();

  await expect(
    page.getByRole('heading', { name: 'Nouveau mot de passe' }),
  ).toBeVisible();
  await page.getByLabel('Code de vérification').fill(await getOtp(email));
  // 13 caractères : la longueur seule ne l'aurait pas arrêté, et le code est
  // valide — c'est bien la politique qui refuse.
  await page
    .getByLabel('Nouveau mot de passe', { exact: true })
    .fill('MotDePasse123');
  await page.getByLabel('Confirmer le mot de passe').fill('MotDePasse123');
  await page
    .getByRole('button', { name: 'Réinitialiser le mot de passe' })
    .click();

  // Message dédié — et surtout PAS « Code invalide ou expiré », qui enverrait
  // la personne corriger le mauvais champ.
  await expect(
    page.getByText('Ce mot de passe est trop courant'),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/\/espace-membre$/);
});
