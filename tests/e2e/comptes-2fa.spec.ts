import { test, expect, type Page } from '@playwright/test';
import { getOtp, provisionUser } from './_helpers';
import { base32Decode, hotp, timeStep } from '../../convex/lib/totp';

// DOUBLE AUTHENTIFICATION (chantier comptes) — de bout en bout, par
// l'interface : un membre inscrit son appareil (QR code + clé manuelle), se
// déconnecte, se reconnecte par code e-mail… et le second facteur lui est
// DEMANDÉ avant tout accès réservé.
//
// Le code TOTP est calculé ICI avec la fonction du dépôt (convex/lib/totp.ts,
// vecteurs de la RFC 6238 dans convex/totp.test.ts), jamais recopiée : le
// test et le serveur ne peuvent pas diverger.
//
// Compte NEUF à chaque exécution : activer la 2FA sur un compte de session
// partagée la ferait exiger à toutes les autres specs.
//
// Le déploiement de test n'a pas de TWO_FACTOR_ENCRYPTION_KEY : les secrets y
// sont chiffrés avec la clé de développement, ouverte par AUTH_DEV_OTP (cf.
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

// Un code valable et NEUF : le pas qui a servi à l'inscription est grillé
// (anti-rejeu). On vise le pas suivant tant que l'horloge n'a pas avancé —
// la fenêtre de ±30 s l'accepte.
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

  // 1. INSCRIPTION depuis l'espace membre.
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

  // Codes de secours : montrés une fois.
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

  // 2. DÉCONNEXION, puis nouvelle connexion par code e-mail.
  await page.getByRole('button', { name: 'Déconnexion' }).click();
  await expect(page.getByRole('button', { name: 'Déconnexion' })).toHaveCount(
    0,
    { timeout: 15_000 },
  );
  await signInWithOtp(page, email);

  // 3. Le second facteur est EXIGÉ : l'espace membre renvoie vers sa saisie,
  //    même demandé directement.
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

  // Un mauvais code est refusé…
  await page.getByLabel("Code de l'application").fill('000000');
  await page.getByRole('button', { name: 'Vérifier' }).click();
  await expect(
    page.getByText(/Code incorrect|vient déjà d'être utilisé/),
  ).toBeVisible();

  // … le bon ouvre l'accès, et ramène à la page demandée.
  await page
    .getByLabel("Code de l'application")
    .fill(await freshCode(key, enrolStep));
  await page.getByRole('button', { name: 'Vérifier' }).click();
  await expect(page).toHaveURL(/\/espace-membre$/, { timeout: 20_000 });
  await expect(
    page.getByRole('heading', { name: 'Espace membre' }),
  ).toBeVisible();
});
