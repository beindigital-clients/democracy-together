import { test, expect, type Browser, type Page } from '@playwright/test';
import { provisionUser, signInWithCode } from './_helpers';

// RÉSEAU SOCIAL — parcours principal à deux membres (chantier « social ») :
//
//   A remplit son profil en PUBLIC ; la page `/membres/<handle>` répond à un
//   visiteur anonyme, indexable ; B trouve A dans l'annuaire des personnes, le
//   suit, lui écrit ; A voit la pastille « non lu » dans l'en-tête, ouvre la
//   conversation et répond ; B reçoit la réponse EN TEMPS RÉEL, sans recharger.
//   Puis A passe son profil en PRIVÉ : la même adresse répond 404.
//
// Deux comptes NEUFS par exécution (adresses horodatées) : le fichier tient
// ses deux sessions d'un bout à l'autre, et aucune session partagée de
// `_sessions.ts` n'est mise en jeu (règle « un fichier, sa session »).

const STAMP = Date.now();
const EMAIL_A = `e2e_social_a_${STAMP}@democracytogether.test`;
const EMAIL_B = `e2e_social_b_${STAMP}@democracytogether.test`;
const NOM_A = `Awa Social ${STAMP}`;
const NOM_B = `Bob Social ${STAMP}`;
const HANDLE_A = `awa-social-${STAMP}`;

test.describe.configure({ mode: 'serial' });

// Contexte neuf AVEC le consentement cookies du projet : sans lui, le bandeau
// F-09 intercepterait les clics.
async function membre(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext({
    locale: 'fr-FR',
    storageState: test.info().project.use.storageState,
  });
  const page = await context.newPage();
  await signInWithCode(page, email);
  return page;
}

async function creerProfil(
  page: Page,
  nom: string,
  visibilite: RegExp,
): Promise<void> {
  await page.goto('/fr/espace-membre/profil');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Mon profil' }),
  ).toBeVisible();
  await page.getByLabel('Nom affiché').fill(nom);
  await page.getByLabel('Fonction').fill('Chercheuse en gouvernance');
  await page.getByRole('radio', { name: visibilite }).check();
  await page
    .getByRole('button', { name: /Créer mon profil|Enregistrer le profil/ })
    .click();
  await expect(page.getByText('Profil enregistré.')).toBeVisible();
}

test('A publie son profil, B le trouve, le suit et lui écrit ; A voit le non-lu et répond', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  await provisionUser(EMAIL_A, 'membre');
  await provisionUser(EMAIL_B, 'membre');

  // --- A : profil public -------------------------------------------------------
  const pageA = await membre(browser, EMAIL_A);
  await creerProfil(pageA, NOM_A, /^Public/);

  // --- Un visiteur ANONYME voit la page, indexable ------------------------------
  const anonyme = await browser.newContext({
    locale: 'fr-FR',
    storageState: test.info().project.use.storageState,
  });
  const visiteur = await anonyme.newPage();
  const reponse = await visiteur.goto(`/fr/membres/${HANDLE_A}`);
  expect(reponse?.status()).toBe(200);
  await expect(
    visiteur.getByRole('heading', { level: 1, name: NOM_A }),
  ).toBeVisible();
  await expect(visiteur.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    new RegExp(`/fr/membres/${HANDLE_A}$`),
  );
  await expect(
    visiteur.locator('link[rel="alternate"][hreflang="ar"]'),
  ).toHaveAttribute('href', new RegExp(`/ar/membres/${HANDLE_A}$`));
  // Aucun bouton d'action pour un anonyme.
  await expect(visiteur.getByRole('button', { name: 'Suivre' })).toHaveCount(0);

  // --- B : profil (réservé aux membres), recherche, suivi, message ---------------
  const pageB = await membre(browser, EMAIL_B);
  await creerProfil(pageB, NOM_B, /^Membres du réseau/);
  await pageB.goto('/fr/membres');
  await pageB.getByLabel('Rechercher une personne').fill(NOM_A);
  await pageB.getByRole('link', { name: new RegExp(NOM_A) }).click();
  await expect(pageB).toHaveURL(new RegExp(`/fr/membres/${HANDLE_A}$`));

  await pageB.getByRole('button', { name: 'Suivre', exact: true }).click();
  await expect(
    pageB.getByRole('button', { name: 'Ne plus suivre' }),
  ).toBeVisible();

  await pageB.getByRole('link', { name: 'Écrire' }).click();
  await expect(pageB).toHaveURL(/\/espace-membre\/messages\?to=/);
  await pageB
    .getByLabel('Votre message')
    .fill('Bonjour Awa, ravi de vous lire.');
  await pageB.getByRole('button', { name: 'Envoyer' }).click();
  await expect(pageB).toHaveURL(/\/espace-membre\/messages\?c=/);
  await expect(
    pageB.getByText('Bonjour Awa, ravi de vous lire.', { exact: true }),
  ).toBeVisible();

  // --- A : pastille non lue dans l'en-tête, lecture, réponse ---------------------
  await pageA.goto('/fr/espace-membre');
  const pastille = pageA.getByRole('link', {
    name: /Messages, 1 conversation non lue/,
  });
  await expect(pastille).toBeVisible({ timeout: 20_000 });
  await pastille.click();
  await pageA
    .getByRole('link', { name: new RegExp(NOM_B) })
    .first()
    .click();
  await expect(
    pageA.getByText('Bonjour Awa, ravi de vous lire.', { exact: true }),
  ).toBeVisible();
  // Ouvrir le fil vaut lecture : la pastille retombe.
  await expect(
    pageA.getByRole('link', { name: 'Messages', exact: true }).first(),
  ).toBeVisible({ timeout: 20_000 });

  await pageA.getByLabel('Votre message').fill('Merci Bob, avec plaisir.');
  await pageA.getByRole('button', { name: 'Envoyer' }).click();

  // --- B reçoit la réponse sans recharger (temps réel) --------------------------
  await expect(
    pageB.getByText('Merci Bob, avec plaisir.', { exact: true }).last(),
  ).toBeVisible({
    timeout: 20_000,
  });

  await anonyme.close();
  await pageA.context().close();
  await pageB.context().close();
});

test('un profil passé en privé répond 404, comme une adresse inconnue', async ({
  browser,
}) => {
  const pageA = await membre(browser, EMAIL_A);
  await creerProfil(pageA, NOM_A, /^Privé/);

  const anonyme = await browser.newContext({ locale: 'fr-FR' });
  const visiteur = await anonyme.newPage();
  const prive = await visiteur.goto(`/fr/membres/${HANDLE_A}`);
  expect(prive?.status()).toBe(404);
  await expect(
    visiteur.getByRole('heading', { name: 'Profil introuvable' }),
  ).toBeVisible();
  const inconnu = await visiteur.goto(`/fr/membres/personne-${STAMP}`);
  expect(inconnu?.status()).toBe(404);

  await anonyme.close();
  await pageA.context().close();
});
