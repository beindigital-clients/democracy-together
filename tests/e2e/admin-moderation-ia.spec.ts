import { test, expect, type Page } from '@playwright/test';
import { deleteTestPublications } from './_helpers';
import { SESSIONS } from './_sessions';
import { ouvrirPanneau } from './_panneau';

test.use({ locale: 'fr-FR', storageState: SESSIONS.adminModerationIa.state });

// F-32 — AUTO-ACCEPTATION DES DÉPÔTS : le dispositif, exercé par le navigateur.
//
// La fonctionnalité arrive avec quatre familles de tests qui ne passent par
// aucun navigateur : la table de vérité de la décision, l'orchestration
// Convex, les parcours par les fonctions publiques, et les écrans montés hors
// application. Elles couvrent la DÉCISION. Aucune ne couvre le CÂBLAGE :
// l'écran de réglage sert-il sur une vraie route, l'administrateur y écrit-il
// vraiment, un dépôt déposé par le formulaire réel déclenche-t-il l'analyse,
// et la file en rend-elle compte. C'est ce que la convention de TESTING.md
// appelle la seconde porte, et c'est ce fichier.
//
// LA PROPRIÉTÉ QUE CE FICHIER TIENT, et qui vaut qu'on paie un navigateur :
// rien ne paraît sans humain tant qu'un humain ne l'a pas armé. Le dernier
// test le vérifie là où ça compte — dans un contexte NON AUTHENTIFIÉ, qui est
// la seule place d'où l'on voit ce que voit le public.
//
// CE QUI N'EST PAS ICI, ET POURQUOI.
//
//  - L'APPEL RÉEL À LA PASSERELLE. La CI n'a pas de clé, et une porte qui
//    dépend d'un tiers payant n'est pas une porte. TESTING.md décrit les trois
//    niveaux manuels, dont `scripts/verifier-passerelle-ia.mjs`. Les
//    assertions ci-dessous sont donc choisies pour valoir DANS LES DEUX
//    configurations — clé posée ou non —, sur le modèle de `news.spec.ts` ;
//  - LE MODE AUTO-PUBLICATION. L'armer sur un déploiement partagé ferait
//    paraître les dépôts des AUTRES specs sans relecture. Ce que le mode
//    change est déjà tenu par `convex/aiModeration.test.ts`, qui peut le poser
//    sans conséquence pour personne. Ici on vérifie qu'il s'ANNONCE ;
//  - LE CLOISONNEMENT PAR RÔLE. `admin-ecrans.spec.ts` tient déjà la route et
//    son rang minimal, avec la session qui va avec.
//
// SESSION DÉDIÉE (cf. `_sessions.ts`) : ce fichier règle, dépose, puis relit.
// Il tient sa session d'un bout à l'autre.

const PANNEAU = '/fr/admin/moderation-ia';

// Marqueur porté par le titre du dépôt créé ici -> nettoyage ciblé du jeu de
// données partagé (ce test écrit une vraie publication).
const MARQUEUR = 'Auto-acceptation E2E';

// Un nom de critère improbable : le barème est partagé, et un `getByText`
// large attraperait un critère écrit par quelqu'un d'autre.
const CRITERE = `Critère E2E ${Date.now()}`;

// Le jeton de rafraîchissement tourne au premier test : on réécrit l'état pour
// que le suivant ne reparte pas d'un jeton consommé (même précaution que
// `admin-nav`, `admin-recherche`, `admin-contact` et `admin-confirmations`).
test.afterEach(async ({ context }) => {
  await context.storageState({ path: SESSIONS.adminModerationIa.state });
});

// REMETTRE LE DISPOSITIF AU REPOS. Les réglages sont un singleton : les
// laisser en « Assistance » ferait analyser les dépôts des specs suivantes.
// C'est sans danger — l'assistance ne publie rien — mais une spec ne laisse
// pas le déploiement dans un état qu'elle est seule à comprendre.
test.afterAll(async ({ browser }) => {
  const context = await browser.newContext({
    locale: 'fr-FR',
    storageState: SESSIONS.adminModerationIa.state,
  });
  try {
    const page = await context.newPage();
    await page.goto(PANNEAU);
    await page.getByLabel('Mode', { exact: true }).selectOption('off');
    await page
      .getByRole('button', { name: 'Enregistrer les réglages' })
      .click();
    await expect(page.getByText(/Réglages enregistrés/)).toBeVisible();
  } finally {
    await context.close();
  }
  await deleteTestPublications(MARQUEUR);
});

function bareme(page: Page) {
  return page.getByRole('list', { name: "Barème d'acceptation" });
}

function journal(page: Page) {
  return page.getByRole('list', { name: "Journal des décisions de l'IA" });
}

test('le panneau dit son état avant de proposer de le régler (F-32)', async ({
  page,
}) => {
  await page.goto(PANNEAU);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Modération assistée par IA' }),
  ).toBeVisible();

  // L'ÉTAT DE LA CLÉ, EN PREMIER. Le déploiement décide de la branche — une
  // préversion CI n'a pas de clé, un déploiement de dev peut en avoir une —,
  // et les deux phrasés sont écrits dans le catalogue, donc vérifiables. Ce
  // qu'on refuse est le troisième cas : un écran qui ne dit rien de son état.
  const etat = page.getByText(
    /Passerelle configurée|Aucune clé de passerelle n'est posée/,
  );
  await expect(etat).toBeVisible();
  const cleAbsente = (await etat.textContent())?.includes('Aucune clé');
  console.log(
    `[F-32] passerelle ${cleAbsente ? 'NON configurée' : 'configurée'} sur ce déploiement`,
  );

  // Les trois compteurs portent un NOMBRE. Un intitulé sans valeur est ce que
  // rend une agrégation absente, et il se lit comme un écran en ordre.
  for (const compteur of [
    'Analyses',
    'Publiées automatiquement',
    'Renvoyées en file',
  ]) {
    const valeur = page
      .locator('dl > div')
      .filter({ hasText: compteur })
      .locator('dd');
    await expect(valeur, `compteur sans valeur : ${compteur}`).toHaveText(
      /^\d+$/,
    );
  }

  for (const section of [
    'Réglages',
    "Barème d'acceptation",
    'Socle de sécurité',
    "Banc d'essai",
    'Décisions récentes',
  ]) {
    await expect(
      page.getByRole('heading', { name: section }),
      `section manquante : ${section}`,
    ).toBeVisible();
  }

  // LE SOCLE EST MONTRÉ ET NON DÉSARMABLE. C'est la promesse du panneau : ce
  // qu'on ne peut pas retirer est visible, et aucun bouton ne prétend le
  // retirer. Un socle rendu comme le barème serait la régression à attraper.
  const socle = page.getByRole('list', { name: 'Socle de sécurité' });
  await expect(socle.getByRole('listitem').first()).toBeVisible();
  await expect(socle.getByRole('button')).toHaveCount(0);
});

test('un critère écrit ici survit au rechargement, et sa suppression aussi (F-32)', async ({
  page,
}) => {
  await page.goto(PANNEAU);

  // --- Créer ----------------------------------------------------------------
  await page.getByRole('button', { name: 'Ajouter un critère' }).click();
  await page.getByLabel('Nom du critère').fill(CRITERE);
  await page
    .getByLabel('Énoncé soumis au modèle')
    .fill(
      'Le document cite-t-il ses sources de manière vérifiable ? (critère posé par un test end-to-end)',
    );
  await page.getByLabel('Sévérité').selectOption('warning');
  await page.getByRole('button', { name: 'Créer le critère' }).click();

  const ligne = bareme(page).getByRole('listitem').filter({ hasText: CRITERE });
  await expect(ligne).toHaveCount(1);
  await expect(ligne.getByText('Avertissement')).toBeVisible();

  // LE RECHARGEMENT EST LE SUJET. Sans lui, le test ne distingue pas une
  // écriture acceptée par le serveur d'un état React ajouté à la liste.
  await page.reload();
  await expect(
    bareme(page).getByRole('listitem').filter({ hasText: CRITERE }),
    "le critère n'a pas survécu au rechargement : l'écriture n'a pas porté",
  ).toHaveCount(1);

  // --- Supprimer -------------------------------------------------------------
  // Le dialogue de confirmation est l'un des trois panneaux sur lesquels la CI
  // a vu un clic sans effet (audit F-13) : on passe par le helper, qui
  // re-clique tant qu'il est fermé et imprime le nombre d'essais.
  const apres = bareme(page).getByRole('listitem').filter({ hasText: CRITERE });
  const dialogue = page.getByRole('dialog');
  await ouvrirPanneau(
    apres.getByRole('button', { name: 'Supprimer' }),
    dialogue,
    'confirmation de suppression du critère',
  );
  await expect(dialogue).toContainText(CRITERE);
  await dialogue.getByRole('button', { name: 'Supprimer' }).click();

  await expect(apres).toHaveCount(0);
  await page.reload();
  await expect(
    bareme(page).getByRole('listitem').filter({ hasText: CRITERE }),
    'le critère supprimé est revenu après rechargement',
  ).toHaveCount(0);
});

test('les réglages tiennent après rechargement, et l’auto-publication s’annonce (F-32)', async ({
  page,
}) => {
  await page.goto(PANNEAU);
  const mode = page.getByLabel('Mode', { exact: true });
  const avertissement = page.getByText(/sans qu'un humain les ait lus/);

  // L'AVERTISSEMENT EST PORTÉ PAR LE MODE, AU MOMENT DE LE CHOISIR — pas
  // relégué à une documentation. On le lit sur la route réelle, et SANS
  // enregistrer : armer l'auto-publication sur un déploiement partagé ferait
  // paraître les dépôts des autres specs.
  await expect(avertissement).toHaveCount(0);
  await mode.selectOption('auto');
  await expect(avertissement).toBeVisible();

  // Et il disparaît quand on redescend : c'est un état, pas un décor.
  await mode.selectOption('assist');
  await expect(avertissement).toHaveCount(0);

  const seuil = page.getByLabel(/Confiance minimale pour publier/);
  await seuil.fill('90');
  await page.getByRole('button', { name: 'Enregistrer les réglages' }).click();
  await expect(page.getByText(/Réglages enregistrés/)).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Mode', { exact: true })).toHaveValue('assist');
  await expect(page.getByLabel(/Confiance minimale pour publier/)).toHaveValue(
    '90',
  );
});

test('un dépôt analysé reste en file, et le public ne le voit pas (F-32)', async ({
  page,
  browser,
}) => {
  // Le timeout par défaut du fichier de configuration est de 45 s. Ce parcours
  // enregistre des réglages, téléverse un document, traverse trois écrans PUIS
  // attend une analyse PLANIFIÉE — l'attente du journal à elle seule peut en
  // consommer 60. Le relever ici vaut mieux que le relever pour toutes les
  // specs, où il sert de garde-fou.
  test.setTimeout(150_000);

  const titre = `${MARQUEUR} ${Date.now()}`;

  // --- Armer le dispositif, en ASSISTANCE ------------------------------------
  // Le test précédent l'a déjà posé, mais un fichier de spec ne se lit pas de
  // haut en bas quand une seule ligne échoue : on pose ce dont ce test dépend.
  await page.goto(PANNEAU);
  await page.getByLabel('Mode', { exact: true }).selectOption('assist');
  await page.getByRole('button', { name: 'Enregistrer les réglages' }).click();
  await expect(page.getByText(/Réglages enregistrés/)).toBeVisible();

  // --- Déposer par le formulaire RÉEL ----------------------------------------
  // C'est ce formulaire qui déclenche l'analyse en production ; une écriture
  // par l'API ne prouverait pas que le déclenchement est câblé.
  await page.goto('/fr/espace-membre/deposer');
  await page.getByLabel('Titre', { exact: true }).fill(titre);
  await page.getByLabel('Auteur·rice·s').fill('A. Membre E2E');
  await page
    .getByLabel('Résumé', { exact: true })
    .fill(
      'Note de vérification du dispositif d’auto-acceptation : ce dépôt doit rester en file humaine.',
    );
  await page.getByLabel('Document (PDF)').setInputFiles({
    name: 'auto-acceptation-e2e.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n% fichier de test E2E\n'),
  });
  await page.getByRole('button', { name: 'Soumettre pour relecture' }).click();
  await expect(
    page.getByRole('heading', { name: 'Soumission reçue' }),
  ).toBeVisible();

  // --- Il est dans la file humaine -------------------------------------------
  await page.goto('/fr/admin/publications');
  const file = page.getByRole('list', {
    name: 'Liste des publications à modérer',
  });
  const fiche = file.getByRole('listitem').filter({ hasText: titre });
  await expect(
    fiche,
    'le dépôt ne figure pas dans la file de modération',
  ).toHaveCount(1);
  // Et il n'y porte PAS la mention réservée aux mises en ligne sans humain.
  await expect(fiche.getByText('Publiée sans relecture humaine')).toHaveCount(
    0,
  );

  // --- Le journal rend compte de l'analyse -----------------------------------
  // L'analyse est planifiée : elle n'a pas encore eu lieu au retour du
  // formulaire. `toPass` attend l'effet plutôt qu'une durée choisie au hasard.
  //
  // CES DEUX LIBELLÉS VALENT DANS LES DEUX CONFIGURATIONS. En assistance,
  // `decideApplication` rend `escalated` / `mode_assist` AVANT de regarder le
  // verdict : que la passerelle ait répondu, échoué ou manqué à l'appel, la
  // ligne dit la même chose. C'est ce qui rend ce test jouable en CI.
  await expect(async () => {
    await page.goto(PANNEAU);
    const entree = journal(page)
      .getByRole('listitem')
      .filter({ hasText: titre });
    await expect(entree).toHaveCount(1);
    await expect(entree.getByText('Renvoyée en file')).toBeVisible();
    await expect(entree).toContainText(
      'mode assistance : la décision est humaine',
    );
  }).toPass({ timeout: 60_000 });

  // --- CE QUE VOIT LE PUBLIC --------------------------------------------------
  // La seule place d'où l'on voit ce que voit le public : un contexte SANS
  // session. Depuis l'onglet de l'administrateur, une fuite de statut
  // ressemblerait à un écran qui marche.
  const anonyme = await browser.newContext({ locale: 'fr-FR' });
  try {
    const visiteur = await anonyme.newPage();
    await visiteur.goto(`/fr/recherche?q=${encodeURIComponent(titre)}`);
    // ON CHERCHE LE RÉSULTAT, PAS LE TITRE. La page de recherche REPREND la
    // requête dans son propre message de vacuité — « Aucun résultat pour
    // « … » » —, si bien qu'un `getByText(titre)` trouve un élément dans les
    // DEUX cas : quand le dépôt a fuité, et quand il est absent. Première
    // campagne CI : l'assertion est tombée sur la phrase qui prouvait
    // justement l'absence.
    //
    // Un LIEN portant ce titre, lui, n'existe que si la recherche a rendu une
    // fiche : c'est le seul élément dont la présence signifie ce qu'on croit.
    await expect(
      visiteur.getByRole('link', { name: titre, exact: false }),
      'un dépôt non relu par un humain est visible du public',
    ).toHaveCount(0);
    // Et la vacuité est dite pour de bon : ce message ne s'affiche que lorsque
    // les TROIS sources — bibliothèque, annuaire, actualités — n'ont rien.
    await expect(visiteur.getByText(/Aucun résultat pour/)).toBeVisible();
  } finally {
    await anonyme.close();
  }
});
