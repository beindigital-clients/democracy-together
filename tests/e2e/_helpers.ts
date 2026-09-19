import { execFileSync } from 'node:child_process';
import { expect, type Page } from '@playwright/test';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';

// Client Convex créé À LA DEMANDE. Instancié au niveau module, il faisait
// échouer `playwright test --list` avant même d'afficher la liste des tests dès
// que NEXT_PUBLIC_CONVEX_URL manquait (audit § 6.1). En paresseux, seuls les
// tests qui s'en servent réellement échouent, avec un message actionnable.
let convexClientInstance: ConvexHttpClient | null = null;
function convex(): ConvexHttpClient {
  if (!convexClientInstance) {
    const url = process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!url) {
      throw new Error(
        'NEXT_PUBLIC_CONVEX_URL manquant : lancer `npx convex dev` (qui renseigne .env.local) avant les tests E2E.',
      );
    }
    convexClientInstance = new ConvexHttpClient(url);
  }
  return convexClientInstance;
}

// Peuple l'annuaire (F-19) avec les think tanks de démo. Idempotent.
// `seedDirectory` est une internalMutation (hors API publique, défense en
// profondeur) : on l'invoque via la CLI Convex (contexte de confiance), comme
// elevateRole / deleteTestPublications.
export async function seedDirectory(): Promise<void> {
  const env = { ...process.env };
  delete env.CONVEX_DEPLOYMENT;
  execFileSync('npx', ['convex', 'run', 'seed:seedDirectory', '{}'], {
    stdio: 'pipe',
    env,
  });
}

type NetworkRole = 'visiteur' | 'membre' | 'moderateur' | 'editeur' | 'admin';

// Élève le rôle d'un utilisateur (DEV, garde AUTH_DEV_OTP) — amorce un admin
// pour les tests du back-office. `setRoleByEmail` est une internalMutation (hors
// API publique) : on l'invoque via la CLI Convex (contexte de confiance), pas
// via ConvexHttpClient.
export async function elevateRole(
  email: string,
  role: NetworkRole,
): Promise<void> {
  // playwright.config charge .env.local avec un loader naif qui garde le
  // commentaire inline de CONVEX_DEPLOYMENT ("dev:xxx # team: ...") -> on le
  // retire de l'env pour que la CLI relise .env.local elle-meme (dotenv strip
  // les commentaires).
  const env = { ...process.env };
  delete env.CONVEX_DEPLOYMENT;
  execFileSync(
    'npx',
    ['convex', 'run', 'devAdmin:setRoleByEmail', JSON.stringify({ email, role })],
    { stdio: 'pipe', env },
  );
}

// Supprime les publications de test (titre contenant `marker`) et leurs
// fichiers — nettoyage du dataset partagé après l'E2E de dépôt (F-32), qui
// publie une vraie publication. `deleteTestPublications` est une
// internalMutation : invoquée via la CLI Convex (contexte de confiance).
export async function deleteTestPublications(marker: string): Promise<void> {
  const env = { ...process.env };
  delete env.CONVEX_DEPLOYMENT;
  execFileSync(
    'npx',
    [
      'convex',
      'run',
      'devAdmin:deleteTestPublications',
      JSON.stringify({ marker }),
    ],
    { stdio: 'pipe', env },
  );
}

// Dépose une candidature d'adhésion (F-22) — pour alimenter la file de modération.
export async function submitApplication(args: {
  type: 'organisation' | 'individu';
  organizationName: string;
  contactEmail: string;
  country: string;
  message?: string;
}): Promise<void> {
  // `submitApplication` est désormais une ACTION (porte reCAPTCHA) : on l'appelle
  // via .action(). Sans secret sur le déploiement dev, la vérification est un
  // no-op (cf. convex/lib/recaptcha.ts), donc le seed reste inchangé.
  await convex().action(api.organizations.submitApplication, args);
}

// --- Oracles de lecture DEV --------------------------------------------------
// Ces fonctions relisent en base ce qu'un formulaire vient d'écrire (code OTP,
// message de contact, inscription…). Ce sont désormais des `internalQuery` et
// non plus des `query` publiques (audit § 4.2 H2) : hors API publique, elles ne
// sont appelables par aucun client, même si AUTH_DEV_OTP fuitait en production.
// On les invoque donc via la CLI Convex — contexte de confiance — exactement
// comme seedDirectory, elevateRole et deleteTestPublications ci-dessus.
function convexRunQuery<T>(fn: string, args: Record<string, unknown>): T | null {
  const env = { ...process.env };
  delete env.CONVEX_DEPLOYMENT;
  const out = execFileSync('npx', ['convex', 'run', fn, JSON.stringify(args)], {
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf8',
    env,
  });
  // `convex run` peut précéder le résultat de lignes de log : on ne retient que
  // la dernière ligne non vide, qui porte la valeur JSON.
  const last = out.trim().split('\n').filter(Boolean).pop();
  if (!last) return null;
  try {
    return JSON.parse(last) as T;
  } catch {
    return null;
  }
}

export function latestContactForEmail(email: string) {
  return convexRunQuery<{
    name: string;
    subject: string;
    message: string;
    handled: boolean;
  } | null>('contact:latestForEmail', { email });
}

export function isNewsletterSubscribed(email: string) {
  return convexRunQuery<boolean>('newsletter:isSubscribed', { email });
}

export function isEventRegistered(eventSlug: string, email: string) {
  return convexRunQuery<boolean>('events:isRegistered', { eventSlug, email });
}

export function isYouthApplicant(email: string) {
  return convexRunQuery<boolean>('youth:isYouthApplicant', { email });
}

export function latestApplicationForEmail(email: string) {
  return convexRunQuery<{
    status: string;
    type: string;
    organizationName: string;
  } | null>('organizations:latestApplicationForEmail', { email });
}

// Lit le dernier code OTP en clair (DEV seulement, garde AUTH_DEV_OTP).
// Petit retry : le code est écrit par une action juste après l'appel signIn.
export async function getOtp(email: string): Promise<string> {
  for (let i = 0; i < 24; i++) {
    const code = convexRunQuery<string | null>('otp:latestDevCode', { email });
    if (code) return code;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Aucun code OTP trouvé pour ${email}`);
}

// Crée un compte e-mail/mot de passe et valide la vérification e-mail.
export async function signUpAndVerify(
  page: Page,
  email: string,
  password: string,
) {
  await page.goto('/fr/inscription');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByLabel('Confirmer le mot de passe').fill(password);
  await page.getByRole('button', { name: 'Créer le compte' }).click();

  await expect(
    page.getByRole('heading', { name: 'Vérifiez votre e-mail' }),
  ).toBeVisible();
  await page.getByLabel('Code de vérification').fill(await getOtp(email));
  await page.getByRole('button', { name: 'Vérifier' }).click();

  await expect(page).toHaveURL(/\/espace-membre$/);
}
