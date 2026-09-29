import { execFileSync } from 'node:child_process';
import { parseConvexRunOutput } from './_convex-output';
import { expect, type Page } from '@playwright/test';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';
import { retrySync, retryAsync } from './_retry';

// Convex client created ON DEMAND. Instantiated at module level, it made
// `playwright test --list` fail before even displaying the test list whenever
// NEXT_PUBLIC_CONVEX_URL was missing (audit § 6.1). Lazily, only the tests
// that actually use it fail, with an actionable message.
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

// Invokes a Convex function via the CLI — a TRUSTED context, the only way
// to reach the test internalMutations (outside the public API: defense in
// depth).
//
// Deployment selection:
// - locally, the CLI re-reads .env.local itself. playwright.config loads that
//   file with a naive loader that keeps the inline comment of
//   CONVEX_DEPLOYMENT ("dev:xxx # team: …") -> we remove the variable from
//   the env so as not to pass it a commented value (dotenv, for its part, strips it).
// - in CI, `CONVEX_DEPLOY_KEY` is a PREVIEW key: it designates the
//   project, not a deployment. The preview name (set by the workflow
//   in CONVEX_PREVIEW_NAME) removes the ambiguity.
function convexRun(fn: string, args: Record<string, unknown> = {}): void {
  const env = { ...process.env };
  delete env.CONVEX_DEPLOYMENT;
  const preview = process.env.CONVEX_PREVIEW_NAME;
  retrySync(fn, () =>
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
    ),
  );
}

// Populates the directory (F-19) with the demo think tanks. Idempotent.
export async function seedDirectory(): Promise<void> {
  convexRun('seed:seedDirectory');
}

// Copies the hard-coded content (agenda, replays, partners, themes) into the
// tables of the "contenus" workstream. IDEMPOTENT: CI already does it
// (`e2e.yml`); locally, a spec that depends on the agenda calls it so as not
// to depend on the state of the dev deployment.
export async function importCodedContent(): Promise<void> {
  convexRun('contenus/migration:importCodedContent');
}

// Removes the content created by the specs (`e2e-…` slugs and files). Guarded
// by AUTH_DEV_OTP on the Convex side, like the other test helpers.
// `stamp`: the spec's timestamp — the cleanup only touches ITS content
// (the same file runs in parallel on the mobile project).
export async function deleteE2eContent(stamp?: number): Promise<void> {
  convexRun(
    'contenus/devCleanup:deleteE2eContent',
    stamp === undefined ? {} : { stamp: String(stamp) },
  );
}

type NetworkRole = 'visiteur' | 'membre' | 'moderateur' | 'editeur' | 'admin';

// Elevates a user's role (DEV, AUTH_DEV_OTP guard) — bootstraps an admin
// for the back-office tests (the "real" setRole already requires an admin:
// chicken-and-egg problem).
export async function elevateRole(
  email: string,
  role: NetworkRole,
): Promise<void> {
  convexRun('devAdmin:setRoleByEmail', { email, role });
}

// Removes an account's role (DEV, AUTH_DEV_OTP guard) — reproduces a LEGACY
// account, created before every creation path set a role. It is the state in
// which the back office displayed "Membre" instead of
// "Visiteur" (issue #27); `provisionUser` cannot produce it, since it
// always sets a role.
export async function clearRole(email: string): Promise<void> {
  convexRun('devAdmin:clearRoleByEmail', { email });
}

// Deletes the test publications (title containing `marker`) and their
// files — cleanup of the shared dataset after the submission E2E (F-32), which
// publishes a real publication.
export async function deleteTestPublications(marker: string): Promise<void> {
  convexRun('devAdmin:deleteTestPublications', { marker });
}

// Approves the PENDING Tribune posts whose title contains
// `marker` (DEV, AUTH_DEV_OTP guard), as a moderator would.
//
// Since PRE-moderation (F-45, "communauté" workstream), a submitted post
// is visible to the public only after approval. Specs that publish in order to
// test SOMETHING ELSE (reporting, canonical, removal) therefore go through
// approval — without replaying the moderation screen, which has its own spec
// (`communaute-tribune.spec.ts`).
export async function approveTribunePosts(marker: string): Promise<void> {
  convexRun('communityModeration:devApprovePendingByTitle', { marker });
}

// Submits a membership application (F-22) — to feed the moderation queue.
export async function submitApplication(args: {
  type: 'organisation' | 'individu';
  organizationName: string;
  contactEmail: string;
  country: string;
  message?: string;
}): Promise<void> {
  // `submitApplication` is now an ACTION (reCAPTCHA gate): we call it
  // via .action(). The gate is fail-closed (issue #24): the test deployment
  // must carry RECAPTCHA_DISABLED=true — set by .github/workflows/e2e.yml, and
  // to be set once on your dev deployment (see .env.example).
  await retryAsync('organizations:submitApplication', () =>
    convex().action(api.organizations.submitApplication, args),
  );
}

// Submits a youth hub application (F-40) through the public path — to
// feed the moderation queue without going through the form.
//
// Like `submitApplication`, it is an ACTION (reCAPTCHA gate): the
// test deployment must carry RECAPTCHA_DISABLED=true (see above).
export async function applyYouth(args: {
  name: string;
  email: string;
  country: string;
  motivation: string;
  themes?: string[];
}): Promise<void> {
  await retryAsync('youth:applyYouth', () =>
    convex().action(api.youth.applyYouth, args),
  );
}

// --- DEV read oracles ---------------------------------------------------------
// These functions read back from the database what a form just wrote (OTP code,
// contact message, subscription…). They are now `internalQuery`s and
// no longer public `query`s (audit § 4.2 H2): outside the public API, they
// cannot be called by any client, even if AUTH_DEV_OTP leaked into production.
// We therefore invoke them via the Convex CLI — a trusted context — exactly
// like seedDirectory, elevateRole and deleteTestPublications above.
function convexRunQuery<T>(
  fn: string,
  args: Record<string, unknown>,
): T | null {
  const env = { ...process.env };
  delete env.CONVEX_DEPLOYMENT;
  const preview = process.env.CONVEX_PREVIEW_NAME;
  const out = retrySync(fn, () =>
    execFileSync(
      'npx',
      [
        'convex',
        'run',
        ...(preview ? ['--preview-name', preview] : []),
        fn,
        JSON.stringify(args),
      ],
      { stdio: ['pipe', 'pipe', 'pipe'], encoding: 'utf8', env },
    ),
  );
  return parseConvexRunOutput<T>(out);
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

// Unsubscribe token of a subscriber — what the link in the campaign email
// footer carries. Without it, `/newsletter/desinscription` can only be tested
// on its failure branches (audit F-12).
export function newsletterUnsubToken(email: string) {
  return convexRunQuery<string | null>('newsletter:devUnsubToken', { email });
}

// Double opt-in ("diffusion" workstream): subscription state and last
// confirmation link "sent" — read from the DEVELOPMENT outbox
// (`devOutbox`, AUTH_DEV_OTP guard), exactly as `getOtp` reads the codes.
export function newsletterStatus(email: string) {
  return convexRunQuery<'pending' | 'confirmed' | 'legacy' | null>(
    'newsletter:devSubscriptionStatus',
    { email },
  );
}

// The link is written by an action scheduled right after the subscription: a
// small retry, as for the OTP code.
export async function getNewsletterConfirmationLink(
  email: string,
): Promise<string> {
  for (let i = 0; i < 24; i++) {
    const link = convexRunQuery<string | null>(
      'newsletter:devLatestConfirmationLink',
      { email },
    );
    if (link) return link;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Aucun lien de confirmation trouvé pour ${email}`);
}

// Fills the search haystacks of documents seeded before the `search_text`
// indexes (idempotent migration, see convex/searchIndexing.ts).
export async function backfillSearch(): Promise<void> {
  convexRun('searchIndexing:backfill', {});
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

// Reads the latest OTP code in clear (DEV only, AUTH_DEV_OTP guard).
// Small retry: the code is written by an action right after the signIn call.
export async function getOtp(email: string): Promise<string> {
  for (let i = 0; i < 24; i++) {
    const code = convexRunQuery<string | null>('otp:latestDevCode', { email });
    if (code) return code;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Aucun code OTP trouvé pour ${email}`);
}

// Provisions an account AND signs the browser in (replaces signUpAndVerify).
//
// Public self-registration no longer exists: /inscription redirects to
// /adhesion, and sign-in refuses an unknown email. A test that needs a
// session must therefore first make the account EXIST — as happens in
// real life, where it is the approval of an application or an admin
// invitation that opens it. We go through the Convex CLI (trusted
// context) then through code sign-in, which is the real journey of an
// invited member.
export async function provisionUser(
  email: string,
  role: NetworkRole = 'visiteur',
): Promise<void> {
  await elevateRole(email, role); // upsert: creates the account if it does not exist
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

// Password of the test accounts. It goes through the server's POLICY
// (convex/lib/passwordPolicy.ts) like any password set by a human —
// `provisionPassword` below goes through `flow: 'signUp'`, and that is
// exactly the flow `validatePasswordRequirements` guards. "motdepasse123",
// which the fixtures used, is now on the rejected list: a shared value
// keeps the next workaround from hiding in some file.
export const E2E_PASSWORD = 'phrase-de-passe-e2e';

// Gives a PASSWORD to a provisioned account, through the only path the
// backend leaves open (issue #66).
//
// The previous helper claimed to do it with "forgot password", on the
// grounds that this flow does not ask for the old password. That is wrong, and
// it is what broke 13 specs: `signIn('password', { flow: 'reset' })` starts
// with `retrieveAccount` and throws `InvalidAccountId` when there is no
// "password" account for the address. Yet `provisionUser` creates ONLY the
// `users` row — no `authAccounts` row. The page caught the error, showed
// its generic message, and the "Nouveau mot de passe" screen never came.
// (Reproduced in one line under convex-test; see the PR thread.)
//
// `flow: 'signUp'`, on the other hand, goes through: it calls `createAccount`,
// hence the `createOrUpdateUser` callback, which ACCEPTS an already known
// address — the "link a new sign-in method to an existing account" case,
// exactly what the validated-membership model allows. Since the provider is
// configured with `verify`, signing up does not open a session: it sends a
// code, which we read back and then present as `email-verification`.
//
// The `/espace-membre/mot-de-passe` screen does the same thing through the UI
// since batch 3 of 27/09 (`auth-mot-de-passe.spec.ts` exercises it). This helper
// keeps the API path because it provisions accounts BEFORE any session —
// not to bypass a UI.
export async function provisionPassword(
  email: string,
  password: string,
): Promise<void> {
  // Does the account ALREADY have this password? Shared sessions use
  // stable addresses, so on a dev deployment — or when a test is
  // retried — we come back here with an account that already has one AND is
  // already verified. In that case `signUp` sends no new code, `getOtp`
  // returns the previous one, and verification fails on "Could not verify
  // code". So we start by trying to sign in: if that works, there is nothing
  // to provision.
  try {
    await convex().action(api.auth.signIn, {
      provider: 'password',
      params: { email, password, flow: 'signIn' },
    });
    return;
  } catch {
    /* no password account for this address yet: create it */
  }

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

// Walks "forgot password" up to its LAST screen: the address, then the code
// read back from the deployment, each on its own screen. Same assumption as
// below: the account already has a password.
export async function reachNewPasswordStep(page: Page, email: string) {
  await page.goto('/fr/mot-de-passe-oublie');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: 'Envoyer le code' }).click();

  await expect(
    page.getByRole('heading', { name: 'Saisissez le code' }),
  ).toBeVisible();
  await page.getByLabel('Code de vérification').fill(await getOtp(email));
  await page.getByRole('button', { name: 'Continuer', exact: true }).click();

  await expect(
    page.getByRole('heading', { name: 'Nouveau mot de passe' }),
  ).toBeVisible();
}

// Resets an EXISTING password through the "forgot password" flow.
// It therefore assumes an account that already has a password (see
// `provisionPassword`): that is the subject of `auth-reset.spec.ts`, and the
// reason this helper is no longer used to set a first one.
export async function setPasswordViaReset(
  page: Page,
  email: string,
  password: string,
) {
  await reachNewPasswordStep(page, email);
  await page.getByLabel('Nouveau mot de passe', { exact: true }).fill(password);
  await page.getByLabel('Confirmer le mot de passe').fill(password);
  await page
    .getByRole('button', { name: 'Réinitialiser le mot de passe' })
    .click();
}

// Drop-in replacement for the old fixture: it navigated to
// /fr/inscription, now redirected to /adhesion, which broke 5 specs
// (audit § 6.1, commit 8be46bc). Contract preserved: on exit, the account
// exists, has this password, and the session is open.
//
// DEFAULT ROLE = `visiteur`, not `membre`: that is what the self-registration
// this fixture replaces produced. A `membre` default silently PROMOTED
// every test account, which took their subject away from the specs that
// precisely check the non-member state — `auth.spec.ts` expects
// "visiteur" and the invitation to apply. Specs that need more pass
// the role, or call `elevateRole` right after: that is already the case
// everywhere (admin, admin-ecrans, admin-moderation, library-submit).
export async function signUpAndVerify(
  page: Page,
  email: string,
  password: string,
  role: NetworkRole = 'visiteur',
) {
  await provisionUser(email, role);
  await provisionPassword(email, password);

  // The session is opened through the real SIGN-IN SCREEN: the provisioning
  // above only brings the account to the state the invitation leaves it in
  // (account + password); it is the assertions that must go through the
  // UI.
  await page.goto('/fr/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page).toHaveURL(/\/espace-membre$/);

  // The URL is not enough: it changes as soon as the client-side redirect
  // happens, before the session cookie is set and the member area has
  // anything to display. So we wait for an element that exists ONLY when signed
  // in — otherwise the spec's next navigation heads back to /connexion, and it
  // then looks for a member-area link on the sign-in page.
  await expect(page.getByRole('button', { name: 'Déconnexion' })).toBeVisible({
    timeout: 15_000,
  });
}

// FINDING AN ACCOUNT IN `/admin/utilisateurs`, WHATEVER THE VOLUME.
//
// The table is PAGINATED — 50 rows — and sorted by email on the index side.
// Going to the screen and then waiting for the row of an account just created
// therefore only holds on an almost empty database. That is the case of a CI
// preview, which is born empty; it is not that of a development deployment,
// which lives long and accumulates test accounts.
//
// Measured on this project's dev deployment: ~900 rows in `users`, and
// three back-office journeys red because their account was not on the
// first page. The failure says nothing about what they check — "element
// not found" where the subject is confirming a role change.
//
// So we search for the account, as an administrator would. The assertion
// is not weakened: it still waits for the row, and the spec still fails
// if it does not exist. The field is debounced and the search is done
// by the SERVER, hence an assertion that retries.
export async function chercherUtilisateur(
  page: Page,
  email: string,
): Promise<void> {
  await page
    .getByRole('searchbox', { name: 'Rechercher un utilisateur' })
    .fill(email);

  // THIS HELPER DOES NOT WAIT FOR THE FILTER TO BE APPLIED, AND CANNOT.
  //
  // The temptation is real, because "the row exists" is true IN ADVANCE
  // on an almost empty database — that of a CI preview —, where the account
  // appears on the first page without any filter. The DEBOUNCED search then
  // fires during the rest of the journey.
  //
  // But "the filter is applied" cannot be observed here: `admin:listUsers`
  // searches through a FULL-TEXT index, hence tokenized. A test address shares
  // "democracytogether" and "test" with all the others: the filtered list
  // keeps dozens of them. Measured — 50 rows remaining where an
  // assertion of "no more foreign rows" expected one.
  //
  // The race is therefore neutralized AT THE SOURCE, on the product side
  // (`utilisateurs/page.tsx`): the last settled rows stay mounted while a new
  // page loads, so a prepared role survives the search landing, and the list
  // is frozen while a confirmation is open, so a query coming back in the
  // meantime can no longer take the dialog with it. This helper has nothing
  // to compensate for.
  await expect(
    page.getByRole('row').filter({ hasText: email }),
    `compte introuvable après recherche : ${email}`,
  ).toHaveCount(1);
}

// "programmes" workstream (F-56 to F-60): resets the data of the test
// accounts (profiles, pairs, applications, progress) and deletes the
// calls, tracks and resources whose title carries `marker`. Since shared
// sessions use STABLE addresses, a pair left by the previous run
// would prevent re-pairing the same accounts. AUTH_DEV_OTP guard
// on the server side, and only `@democracytogether.test` addresses are touched.
export async function resetProgrammes(
  emails: string[],
  marker?: string,
): Promise<void> {
  convexRun('programmes:devResetProgrammes', { emails, marker });
}
