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

// Invoque une fonction Convex via la CLI — contexte de CONFIANCE, seul moyen
// d'atteindre les internalMutations de test (hors API publique : défense en
// profondeur).
//
// Sélection du déploiement :
// - en local, la CLI relit .env.local elle-même. playwright.config charge ce
//   fichier avec un loader naïf qui garde le commentaire inline de
//   CONVEX_DEPLOYMENT (« dev:xxx # team: … ») -> on retire la variable de
//   l'env pour ne pas lui passer une valeur commentée (dotenv, lui, strip).
// - en CI, `CONVEX_DEPLOY_KEY` est une clé de PRÉVERSION : elle désigne le
//   projet, pas un déploiement. Le nom de la préversion (posé par le workflow
//   dans CONVEX_PREVIEW_NAME) lève l'ambiguïté.
function convexRun(fn: string, args: Record<string, unknown> = {}): void {
  const env = { ...process.env };
  delete env.CONVEX_DEPLOYMENT;
  const preview = process.env.CONVEX_PREVIEW_NAME;
  execFileSync(
    'npx',
    [
      'convex',
      'run',
      ...(preview ? ['--preview-name', preview] : []),
      fn,
      JSON.stringify(args),
    ],
    { stdio: 'pipe', env },
  );
}

// Peuple l'annuaire (F-19) avec les think tanks de démo. Idempotent.
export async function seedDirectory(): Promise<void> {
  convexRun('seed:seedDirectory');
}

type NetworkRole = 'visiteur' | 'membre' | 'moderateur' | 'editeur' | 'admin';

// Élève le rôle d'un utilisateur (DEV, garde AUTH_DEV_OTP) — amorce un admin
// pour les tests du back-office (setRole « réel » exige déjà un admin :
// problème de l'œuf et de la poule).
export async function elevateRole(
  email: string,
  role: NetworkRole,
): Promise<void> {
  convexRun('devAdmin:setRoleByEmail', { email, role });
}

// Retire le rôle d'un compte (DEV, garde AUTH_DEV_OTP) — reproduit un compte
// HÉRITÉ, créé avant que tous les chemins de création ne posent un rôle. C'est
// l'état dans lequel le back-office affichait « Membre » au lieu de
// « Visiteur » (issue #27) ; `provisionUser` ne peut pas le produire, puisqu'il
// pose toujours un rôle.
export async function clearRole(email: string): Promise<void> {
  convexRun('devAdmin:clearRoleByEmail', { email });
}

// Supprime les publications de test (titre contenant `marker`) et leurs
// fichiers — nettoyage du dataset partagé après l'E2E de dépôt (F-32), qui
// publie une vraie publication.
export async function deleteTestPublications(marker: string): Promise<void> {
  convexRun('devAdmin:deleteTestPublications', { marker });
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
  // via .action(). La porte est fail-closed (issue #24) : le déploiement de test
  // doit porter RECAPTCHA_DISABLED=true — posé par .github/workflows/e2e.yml, et
  // à poser une fois sur son déploiement de dev (cf. .env.example).
  await convex().action(api.organizations.submitApplication, args);
}

// Dépose une candidature du hub jeunes (F-40) par le chemin public — pour
// alimenter la file de modération sans passer par le formulaire.
//
// Comme `submitApplication`, c'est une ACTION (porte reCAPTCHA) : le
// déploiement de test doit porter RECAPTCHA_DISABLED=true (cf. ci-dessus).
export async function applyYouth(args: {
  name: string;
  email: string;
  country: string;
  motivation: string;
  themes?: string[];
}): Promise<void> {
  await convex().action(api.youth.applyYouth, args);
}

// --- Oracles de lecture DEV --------------------------------------------------
// Ces fonctions relisent en base ce qu'un formulaire vient d'écrire (code OTP,
// message de contact, inscription…). Ce sont désormais des `internalQuery` et
// non plus des `query` publiques (audit § 4.2 H2) : hors API publique, elles ne
// sont appelables par aucun client, même si AUTH_DEV_OTP fuitait en production.
// On les invoque donc via la CLI Convex — contexte de confiance — exactement
// comme seedDirectory, elevateRole et deleteTestPublications ci-dessus.
function convexRunQuery<T>(
  fn: string,
  args: Record<string, unknown>,
): T | null {
  const env = { ...process.env };
  delete env.CONVEX_DEPLOYMENT;
  const preview = process.env.CONVEX_PREVIEW_NAME;
  const out = execFileSync(
    'npx',
    [
      'convex',
      'run',
      ...(preview ? ['--preview-name', preview] : []),
      fn,
      JSON.stringify(args),
    ],
    { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8', env },
  );
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

// Provisionne un compte ET connecte le navigateur (remplace signUpAndVerify).
//
// L'auto-inscription publique n'existe plus : /inscription redirige vers
// /adhesion, et la connexion refuse un e-mail inconnu. Un test qui a besoin
// d'une session doit donc d'abord faire EXISTER le compte — comme le fait la
// vraie vie, où c'est l'approbation d'une candidature ou une invitation
// d'administrateur qui l'ouvre. On passe par la CLI Convex (contexte de
// confiance) puis par la connexion par code, qui est le parcours réel d'un
// membre invité.
export async function provisionUser(
  email: string,
  role: NetworkRole = 'visiteur',
): Promise<void> {
  await elevateRole(email, role); // upsert : crée le compte s'il n'existe pas
}

export async function signInWithCode(page: Page, email: string) {
  await page.goto('/fr/connexion-otp');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: 'Recevoir un code' }).click();

  await expect(
    page.getByRole('heading', { name: 'Saisissez le code' }),
  ).toBeVisible();
  await page.getByLabel('Code de vérification').fill(await getOtp(email));
  await page.getByRole('button', { name: 'Se connecter' }).click();

  await expect(page).toHaveURL(/\/espace-membre$/);
}

// Donne un MOT DE PASSE à un compte provisionné, par le seul chemin que le
// backend laisse ouvert (issue #66).
//
// Le helper précédent prétendait le faire avec « mot de passe oublié », au
// motif que ce flux ne demande pas l'ancien mot de passe. C'est faux, et c'est
// ce qui cassait 13 specs : `signIn('password', { flow: 'reset' })` commence
// par `retrieveAccount` et lève `InvalidAccountId` quand il n'existe aucun
// compte « password » pour l'adresse. Or `provisionUser` ne crée QUE la ligne
// `users` — pas de ligne `authAccounts`. La page attrapait l'erreur, affichait
// son message générique, et l'écran « Nouveau mot de passe » n'arrivait jamais.
// (Reproduit en une ligne sous convex-test ; cf. le fil de la PR.)
//
// `flow: 'signUp'`, lui, passe : il appelle `createAccount`, donc le callback
// `createOrUpdateUser`, qui ACCEPTE une adresse déjà connue — c'est le cas
// « relier un nouveau moyen de connexion à un compte existant », exactement ce
// que le modèle d'adhésion validée autorise. Comme le provider est configuré
// avec `verify`, l'inscription n'ouvre pas de session : elle envoie un code,
// qu'on relit puis qu'on présente en `email-verification`.
//
// À NOTER, et à traiter ailleurs : aucun écran de l'application ne fait cela.
// L'e-mail d'invitation promet « vous pourrez en définir un depuis votre espace
// membre » — cet écran n'existe pas, et `src/` ne contient aucun `flow:
// 'signUp'`. Un membre invité ne peut donc PAS se donner de mot de passe ;
// seule la connexion par code lui est ouverte. Ce helper passe par l'API parce
// qu'il n'y a pas d'interface à exercer, pas pour contourner une interface.
export async function provisionPassword(
  email: string,
  password: string,
): Promise<void> {
  await convex().action(api.auth.signIn, {
    provider: 'password',
    params: { email, password, flow: 'signUp' },
  });
  const code = await getOtp(email);
  await convex().action(api.auth.signIn, {
    provider: 'password',
    params: { email, code, flow: 'email-verification' },
  });
}

// Réinitialise un mot de passe EXISTANT par le flux « mot de passe oublié ».
// Suppose donc un compte qui a déjà un mot de passe (cf. `provisionPassword`) :
// c'est le sujet d'`auth-reset.spec.ts`, et la raison pour laquelle ce helper
// ne sert plus à en définir un premier.
export async function setPasswordViaReset(
  page: Page,
  email: string,
  password: string,
) {
  await page.goto('/fr/mot-de-passe-oublie');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: 'Envoyer le code' }).click();

  await expect(
    page.getByRole('heading', { name: 'Nouveau mot de passe' }),
  ).toBeVisible();
  await page.getByLabel('Code de vérification').fill(await getOtp(email));
  await page.getByLabel('Nouveau mot de passe', { exact: true }).fill(password);
  await page.getByLabel('Confirmer le mot de passe').fill(password);
  await page
    .getByRole('button', { name: 'Réinitialiser le mot de passe' })
    .click();
}

// Remplaçant direct de l'ancienne fixture : elle naviguait vers
// /fr/inscription, désormais redirigée vers /adhesion, ce qui cassait 5 specs
// (audit § 6.1, commit 8be46bc). Contrat préservé : à la sortie, le compte
// existe, possède ce mot de passe, et la session est ouverte.
//
// RÔLE PAR DÉFAUT = `visiteur`, et non `membre` : c'est ce que produisait
// l'auto-inscription que cette fixture remplace. Un défaut à `membre`
// PROMOUVAIT silencieusement chaque compte de test, ce qui retirait leur sujet
// aux specs qui vérifient justement l'état non-membre — `auth.spec.ts` attend
// « visiteur » et l'invitation à candidater. Les specs qui ont besoin de plus
// passent le rôle, ou appellent `elevateRole` juste après : c'est déjà le cas
// partout (admin, admin-ecrans, admin-moderation, library-submit).
export async function signUpAndVerify(
  page: Page,
  email: string,
  password: string,
  role: NetworkRole = 'visiteur',
) {
  await provisionUser(email, role);
  await provisionPassword(email, password);

  // La session s'ouvre par l'ÉCRAN DE CONNEXION réel : le provisionnement
  // ci-dessus ne fait qu'amener le compte dans l'état où l'invitation le laisse
  // (compte + mot de passe), ce sont les assertions qui doivent passer par
  // l'interface.
  await page.goto('/fr/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/espace-membre$/);

  // L'URL ne suffit pas : elle change dès la redirection côté client, avant que
  // le cookie de session ne soit posé et que l'espace membre n'ait de quoi
  // s'afficher. On attend donc un élément qui n'existe QUE connecté — sinon la
  // navigation suivante de la spec repart vers /connexion, et elle cherche
  // ensuite un lien de l'espace membre sur la page de connexion.
  await expect(page.getByRole('button', { name: 'Déconnexion' })).toBeVisible({
    timeout: 15_000,
  });
}
