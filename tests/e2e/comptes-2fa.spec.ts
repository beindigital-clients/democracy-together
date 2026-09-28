import { test, expect, type Page } from '@playwright/test';
import { getOtp, provisionUser } from './_helpers';
import { base32Decode, hotp, timeStep } from '../../convex/lib/totp';

// TWO-FACTOR AUTHENTICATION ("comptes" workstream) — end to end, through
// the UI: a member enrolls their device (QR code + manual key), signs
// out, signs in again with an email code… and the second factor is
// REQUIRED before any restricted access.
//
// The TOTP code is computed HERE with the repo's function (convex/lib/totp.ts,
// RFC 6238 vectors in convex/totp.test.ts), never copied: the
// test and the server cannot diverge.
//
// NEW account on every run: enabling 2FA on a shared session account
// would make every other spec require it.
//
// The test deployment has no TWO_FACTOR_ENCRYPTION_KEY: secrets there
// are encrypted with the development key, enabled by AUTH_DEV_OTP (see
// convex/lib/secretBox.ts).

test.use({ locale: 'fr-FR' });

async function signInWithOtp(page: Page, email: string) {
  await page.goto('/fr/connexion-otp');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: 'Recevoir un code' }).click();
  await expect(
    page.getByRole('heading', { name: 'Saisissez le code' }),
  ).toBeVisible();
  await page.getByLabel('Code de vérification').fill(await getOtp(email));
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

// A valid and FRESH code: the time step used for enrollment is burned
// (anti-replay). We target the next step as long as the clock has not moved on —
// the ±30 s window accepts it.
async function freshCode(key: Uint8Array, usedStep: number): Promise<string> {
  const step = Math.max(timeStep(Date.now()), usedStep + 1);
  return hotp(key, step);
}

test('un membre active la 2FA ; à la connexion suivante, le code est demandé', async ({
  page,
}) => {
  const email = `e2e_2fa_${Date.now()}@democracytogether.test`;
  await provisionUser(email, 'membre');
  await signInWithOtp(page, email);
  await expect(page).toHaveURL(/\/espace-membre$/);

  // 1. ENROLLMENT from the member area.
  await page
    .getByRole('link', { name: /Sécurité et double authentification/ })
    .click();
  await expect(page).toHaveURL(/\/espace-membre\/securite$/);
  await expect(
    page.getByText('Double authentification inactive', { exact: true }),
  ).toBeVisible();
  await page
    .getByRole('button', { name: 'Activer la double authentification' })
    .click();
  await expect(
    page.getByRole('img', {
      name: "QR code d'inscription à la double authentification",
    }),
  ).toBeVisible();
  const secret = (await page.getByTestId('totp-secret').textContent())!.trim();
  const key = base32Decode(secret);
  const enrolStep = timeStep(Date.now());
  await page
    .getByLabel("Code de l'application")
    .fill(await hotp(key, enrolStep));
  await page.getByRole('button', { name: 'Confirmer et activer' }).click();

  // Backup codes: shown once.
  await expect(
    page.getByRole('heading', { name: 'Vos codes de secours' }),
  ).toBeVisible();
  await expect(
    page.getByTestId('backup-codes').getByRole('listitem'),
  ).toHaveCount(10);
  await page.getByRole('button', { name: "J'ai conservé mes codes" }).click();
  await expect(
    page.getByText('Double authentification active', { exact: true }),
  ).toBeVisible();

  // 2. SIGN OUT, then sign in again with an email code.
  await page.getByRole('button', { name: 'Déconnexion' }).click();
  await expect(page.getByRole('button', { name: 'Déconnexion' })).toHaveCount(
    0,
    { timeout: 15_000 },
  );
  await signInWithOtp(page, email);

  // 3. The second factor is REQUIRED: the member area redirects to its entry,
  //    even when requested directly.
  await expect(page).toHaveURL(/\/connexion\/deux-facteurs/, {
    timeout: 20_000,
  });
  await page.goto('/fr/espace-membre');
  await expect(page).toHaveURL(/\/connexion\/deux-facteurs/, {
    timeout: 20_000,
  });
  await expect(
    page.getByRole('heading', { name: 'Vérification en deux étapes' }),
  ).toBeVisible();

  // A wrong code is refused…
  await page.getByLabel("Code de l'application").fill('000000');
  await page.getByRole('button', { name: 'Vérifier' }).click();
  await expect(
    page.getByText(/Code incorrect|vient déjà d'être utilisé/),
  ).toBeVisible();

  // … the right one grants access, and brings back to the requested page.
  await page
    .getByLabel("Code de l'application")
    .fill(await freshCode(key, enrolStep));
  await page.getByRole('button', { name: 'Vérifier' }).click();
  await expect(page).toHaveURL(/\/espace-membre$/, { timeout: 20_000 });
  await expect(
    page.getByRole('heading', { name: 'Espace membre' }),
  ).toBeVisible();
});
