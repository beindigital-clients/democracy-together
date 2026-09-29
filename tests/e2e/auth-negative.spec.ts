import { test, expect } from '@playwright/test';
import {
  signUpAndVerify,
  provisionUser,
  provisionPassword,
  reachNewPasswordStep,
  getOtp,
  E2E_PASSWORD,
} from './_helpers';

test.use({ locale: 'fr-FR' });

// Coverage of REFUSAL paths (the audit had noted their absence).

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

  // stays on /connexion, error message, never authenticated
  await expect(
    page.getByText('E-mail ou mot de passe incorrect.'),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/fr\/connexion$/);

  // A SERVER REFUSAL clears no field (#37): nothing to retype to try again.
  // The message stays global — saying which of the two is wrong would reveal
  // whether the account exists.
  await expect(page.getByLabel('E-mail')).toHaveValue(email);
  await expect(page.getByLabel('Mot de passe', { exact: true })).toHaveValue(
    'un-mauvais-mot-de-passe',
  );
});

// This test targeted /fr/inscription, which now redirects to /adhesion
// (src/app/[locale]/inscription/page.tsx): self-registration no longer exists.
// The BEHAVIOR checked — a wrong one-time code is refused and
// does not open a session — still exists, on code sign-in. That is where
// it is checked now.
//
// The account is provisioned first: code sign-in refuses an unknown
// address (NO_SELF_SIGNUP), so without this the test would fail at the step
// before the one it wants to exercise.
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

  // deliberately wrong code
  await page.getByLabel('Code de vérification').fill('000000');
  await page.getByRole('button', { name: 'Se connecter' }).click();

  await expect(page.getByText('Code invalide ou expiré.')).toBeVisible();
  await expect(page).not.toHaveURL(/\/espace-membre$/);
});

// Self-registration is closed: the page must not reappear by accident.
test('/inscription redirige vers la demande d’adhésion (F-22)', async ({
  page,
}) => {
  await page.goto('/fr/inscription');
  await expect(page).toHaveURL(/\/fr\/adhesion$/);
});

// Password policy (security — finding M4). A password being too common
// is the ONLY rule the browser cannot check by itself: the
// length, it refuses through `minLength`. This test therefore targets the server refusal, and
// the message the UI derives from it.
//
// The account first gets a password through `provisionPassword`: "forgot
// password" starts with `retrieveAccount` and throws `InvalidAccountId` without
// a prior "password" account (issue #66). A fixture stopping at
// `provisionUser` would therefore die before reaching the targeted field, and the test
// would pass for a policy failure when it would have exercised nothing.
test('changement de mot de passe : un mot de passe trop courant est refusé', async ({
  page,
}) => {
  const email = `e2e_weakpw_${Date.now()}@democracytogether.test`;
  await provisionUser(email);
  await provisionPassword(email, E2E_PASSWORD);

  await reachNewPasswordStep(page, email);
  // 13 characters: length alone would not have stopped it, and the code is
  // valid — it is indeed the policy that refuses.
  await page
    .getByLabel('Nouveau mot de passe', { exact: true })
    .fill('MotDePasse123');
  await page.getByLabel('Confirmer le mot de passe').fill('MotDePasse123');
  await page
    .getByRole('button', { name: 'Réinitialiser le mot de passe' })
    .click();

  // Dedicated message — and above all NOT "Code invalide ou expiré", which would send
  // the person to correct the wrong field.
  await expect(
    page.getByText('Ce mot de passe est trop courant'),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/\/espace-membre$/);
});

// "Forgot password" checks the code ON ITS OWN SCREEN. On the former single
// form, a wrong code only surfaced after the new password had been typed
// twice; it must now be refused before any password field appears — and
// without costing the right code its chance.
test('mot de passe oublié : un code faux est refusé avant le choix du mot de passe', async ({
  page,
}) => {
  const email = `e2e_resetcode_${Date.now()}@democracytogether.test`;
  await provisionUser(email);
  await provisionPassword(email, E2E_PASSWORD);

  await page.goto('/fr/mot-de-passe-oublie');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: 'Envoyer le code' }).click();
  await expect(
    page.getByRole('heading', { name: 'Saisissez le code' }),
  ).toBeVisible();

  const code = await getOtp(email);
  const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0');
  await page.getByLabel('Code de vérification').fill(wrong);
  await page.getByRole('button', { name: 'Continuer', exact: true }).click();

  await expect(page.getByText('Code invalide ou expiré.')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Saisissez le code' }),
  ).toBeVisible();
  await expect(
    page.getByLabel('Nouveau mot de passe', { exact: true }),
  ).toHaveCount(0);

  // A wrong attempt does not burn the pending code: the right one still
  // opens the password screen.
  await page.getByLabel('Code de vérification').fill(code);
  await page.getByRole('button', { name: 'Continuer', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Nouveau mot de passe' }),
  ).toBeVisible();
});
