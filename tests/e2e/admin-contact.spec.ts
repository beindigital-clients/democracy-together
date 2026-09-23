import { test, expect, type Page } from '@playwright/test';
import { latestContactForEmail } from './_helpers';
import { SESSIONS } from './_sessions';

test.use({ locale: 'fr-FR', storageState: SESSIONS.adminContact.state });

// F-12 — `/fr/admin/contact` n'était citée par AUCUNE spec E2E.
//
// C'est l'écran que le constat F-17 / F-26 avait fait naître : sans lui, les
// messages du formulaire public s'accumulaient en base sans que personne ne
// puisse les lire ni les marquer traités. Il n'avait pourtant aucune garde de
// bout en bout — `contact.spec.ts` s'arrête à l'écriture, et les tests
// unitaires de `convex/contact-admin.test.ts` ne voient pas l'écran.
//
// CE QUE CE FICHIER EXERCE, et qui n'est vérifiable qu'ici : le cycle complet
// d'un message, du formulaire public jusqu'à son classement, en passant par
// le FILTRE. C'est ce filtre qui rend le test non trivial — la requête étant
// réactive, marquer « traité » sous « En attente » fait DISPARAÎTRE la fiche
// de la liste au lieu d'y changer un badge. Un test qui attendrait le badge
// sur place échouerait, et un test qui ne regarderait que le badge sous
// « Toutes » ne verrait pas que la file se vide.
//
// SESSION DÉDIÉE (cf. `_sessions.ts`) : ce fichier écrit la donnée PUIS la
// modère, donc il tient sa session d'un bout à l'autre. Rang modérateur, le
// minimum qu'exigent `listMessages` et `setHandled`.
//
// CE QUI N'EST PAS ICI. Le cloisonnement par rôle — un visiteur n'atteint pas
// cet écran — appartient à `middleware-gating.spec.ts` et `admin-ecrans.spec.ts`,
// qui tiennent déjà les sessions correspondantes. Le poser ici ajouterait un
// second compte à ce fichier, ce que `_sessions.ts` proscrit.

// Le jeton de rafraîchissement tourne au premier test : on réécrit l'état pour
// que le second ne reparte pas d'un jeton consommé (même précaution que
// `admin-nav`, `admin-recherche` et `admin-confirmations`).
test.afterEach(async ({ context }) => {
  await context.storageState({ path: SESSIONS.adminContact.state });
});

const CORPS =
  'Bonjour, ceci est un message de vérification de la file de contact du back-office.';

// Dépose un message par le formulaire PUBLIC — le chemin réel d'un visiteur.
// On ne passe pas par l'API : ce qui remplit la file en production, c'est ce
// formulaire, et c'est donc lui qui doit la remplir ici.
async function deposerUnMessage(
  page: Page,
  email: string,
  sujet: string,
): Promise<void> {
  await page.goto('/fr/contact');
  await page.getByLabel('Nom').fill('Awa Diop');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Sujet').fill(sujet);
  await page.getByLabel('Message').fill(CORPS);
  await page.getByRole('button', { name: 'Envoyer le message' }).click();
  await expect(
    page.getByRole('heading', { name: 'Message envoyé' }),
  ).toBeVisible();
}

function ficheDe(page: Page, sujet: string) {
  return page.getByRole('listitem').filter({ hasText: sujet });
}

function filtre(page: Page, nom: 'En attente' | 'Toutes') {
  return page.getByRole('button', { name: nom, exact: true });
}

test('admin/contact : un message public traverse la file jusqu’à « traité » (F-12)', async ({
  page,
}) => {
  const tampon = Date.now();
  const email = `e2e_admin_contact_${tampon}@democracytogether.test`;
  const sujet = `Demande de partenariat ${tampon}`;

  await deposerUnMessage(page, email, sujet);

  // NON-VACUITÉ : si l'écriture n'avait pas eu lieu, tout ce qui suit
  // chercherait une fiche absente et le test dirait « introuvable » au lieu de
  // « non traité ». On sépare les deux.
  expect(
    latestContactForEmail(email),
    "le message n'a pas été écrit : la suite serait un test de l'absence",
  ).not.toBeNull();
  expect(latestContactForEmail(email)?.handled).toBe(false);

  await page.goto('/fr/admin/contact');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Messages de contact' }),
  ).toBeVisible();

  // --- Sous « En attente », le filtre par défaut -----------------------------
  await expect(filtre(page, 'En attente')).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  const fiche = ficheDe(page, sujet);
  await expect(fiche, 'le message ne figure pas dans la file').toHaveCount(1);
  await expect(fiche).toContainText('Awa Diop');
  await expect(fiche).toContainText(email);
  await expect(fiche).toContainText(CORPS);
  await expect(fiche.getByText('À traiter')).toBeVisible();

  // « Répondre par e-mail » doit ouvrir un brouillon PRÉ-REMPLI : adresse de
  // l'expéditeur et objet en « Re: ». Un mailto nu serait un lien décoratif.
  expect(
    await fiche
      .getByRole('link', { name: 'Répondre par e-mail' })
      .getAttribute('href'),
  ).toBe(`mailto:${email}?subject=${encodeURIComponent(`Re: ${sujet}`)}`);

  // --- Traitement ------------------------------------------------------------
  await fiche.getByRole('button', { name: 'Marquer comme traité' }).click();

  // La requête étant réactive, la fiche QUITTE la file d'attente. C'est le
  // comportement attendu, et c'est aussi la preuve que le serveur a accepté :
  // la liste ne se redessine que sur une donnée revenue du backend.
  await expect(
    ficheDe(page, sujet),
    'la fiche traitée est restée dans la file « En attente »',
  ).toHaveCount(0);

  expect(latestContactForEmail(email)?.handled).toBe(true);

  // --- Sous « Toutes », elle est là, et marquée --------------------------
  await filtre(page, 'Toutes').click();
  await expect(filtre(page, 'Toutes')).toHaveAttribute('aria-pressed', 'true');
  await expect(filtre(page, 'En attente')).toHaveAttribute(
    'aria-pressed',
    'false',
  );

  const ficheTraitee = ficheDe(page, sujet);
  await expect(ficheTraitee).toHaveCount(1);
  await expect(ficheTraitee.getByText('Traité')).toBeVisible();

  // --- Rouvrir : le classement est RÉVERSIBLE -------------------------------
  // Un message rouvert par erreur doit pouvoir repasser dans la file ; c'est
  // écrit dans `contact.setHandled`, donc c'est vérifiable.
  await ficheTraitee.getByRole('button', { name: 'Rouvrir' }).click();
  await expect(ficheTraitee.getByText('À traiter')).toBeVisible();
  expect(latestContactForEmail(email)?.handled).toBe(false);

  // Et elle est revenue dans la file d'attente.
  await filtre(page, 'En attente').click();
  await expect(ficheDe(page, sujet)).toHaveCount(1);
});

test('admin/contact : « Toutes » montre au moins ce que montre « En attente » (F-12)', async ({
  page,
}) => {
  const tampon = Date.now();
  const email = `e2e_admin_contact_f_${tampon}@democracytogether.test`;
  const sujet = `Question sur le réseau ${tampon}`;

  await deposerUnMessage(page, email, sujet);
  await page.goto('/fr/admin/contact');

  // On attend que la liste soit peuplée avant de compter : `undefined` rend
  // l'écran « Chargement… », et compter à ce moment-là donnerait 0 partout.
  await expect(ficheDe(page, sujet)).toHaveCount(1);
  await expect(page.getByText('Chargement…')).toHaveCount(0);
  const enAttente = await page.getByRole('listitem').count();

  await filtre(page, 'Toutes').click();
  await expect(ficheDe(page, sujet)).toHaveCount(1);
  const toutes = await page.getByRole('listitem').count();

  // Invariant de filtre : « En attente » est un SOUS-ENSEMBLE de « Toutes ».
  // C'est vrai quel que soit le contenu du jeu de données partagé, donc ce
  // test ne dépend pas de ce que les autres specs y ont laissé.
  expect(
    toutes,
    '« Toutes » montre moins de messages que « En attente »',
  ).toBeGreaterThanOrEqual(enAttente);
  expect(
    enAttente,
    'la file d’attente est vide alors qu’on vient d’y écrire',
  ).toBeGreaterThan(0);
});
