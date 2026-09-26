import { test, expect } from '@playwright/test';
import {
  submitApplication,
  provisionUser,
  deleteTestPublications,
  chercherUtilisateur,
} from './_helpers';
import { SESSIONS } from './_sessions';

// GARDE-FOU des actions irréversibles du back-office (issue #38).
//
// Les quatre actions destructrices — rejeter une candidature, rejeter une
// publication, retirer un contenu de la tribune, changer un rôle — partaient au
// PREMIER CLIC. Ce que ces parcours épinglent n'est donc pas « l'action
// fonctionne » (c'est le sujet d'`admin.spec`, `library-submit.spec` et
// `admin-moderation.spec`) mais les trois propriétés du garde-fou :
//
//   1. la boîte s'ouvre et NOMME sa cible — pas un « Confirmer ? » générique ;
//   2. tant qu'elle n'est pas validée, RIEN n'est parti (Échap, annulation, et
//      pour le rôle : un simple choix dans la liste déroulante) ;
//   3. l'action aboutie produit un retour VISIBLE, là où l'écran restait muet.
//
// SESSION DÉDIÉE (et non l'une des sessions par rôle) : deux de ces parcours
// écrivent la donnée puis la modèrent, donc tiennent une session de bout en
// bout. En s'ajoutant aux comptes partagés, ce fichier a fait tomber
// `admin-moderation` puis `admin.spec` sur l'écran de connexion — deux
// contextes sur un même jeton de rafraîchissement ne cohabitent pas
// (cf. `_sessions.ts`). Le compte est de rang administrateur : les gardes du
// back-office étant hiérarchiques, il dépose comme un membre et tranche comme
// un modérateur.
test.use({
  locale: 'fr-FR',
  storageState: SESSIONS.confirmations.state,
});

// LE JETON DE RAFRAÎCHISSEMENT TOURNE — IL FAUT LE RÉÉCRIRE. Chaque test part
// d'un contexte NEUF rechargé depuis le même fichier d'état. Or le premier qui
// s'en sert fait tourner le jeton (Convex Auth le renouvelle et l'invalide) :
// les suivants repartent donc d'un jeton déjà consommé. Tant que la fenêtre de
// tolérance n'est pas dépassée, ça passe ; au-delà, Convex Auth y voit un
// rejeu et coupe la session — le test se réveille sur /connexion au milieu de
// son parcours (le mécanisme est décrit dans `_sessions.ts`, pour le cas de
// deux FICHIERS sur un même compte ; il vaut tout autant pour deux TESTS d'un
// même fichier, simplement plus tard).
//
// Ce fichier est le plus exposé : quatre parcours de back-office à la file,
// donc le quatrième démarre loin du moment où la session a été ouverte. Il est
// tombé deux fois de suite sur l'écran de connexion (PR #79), toujours le
// dernier, pendant que les trois premiers passaient.
//
// On réécrit donc l'état APRÈS CHAQUE TEST : le suivant repart du jeton
// courant, jamais d'un jeton périmé. La session dédiée du fichier
// (cf. `_sessions.ts`) rend l'écriture sûre — aucun autre fichier ne lit ni
// n'écrit ce fichier d'état pendant l'exécution.
test.afterEach(async ({ context }) => {
  await context.storageState({ path: SESSIONS.confirmations.state });
});

// Marqueur des publications créées ici -> nettoyage ciblé du jeu de données
// partagé (comme `library-submit.spec.ts`).
const PUB_MARKER = 'Rejet confirmé E2E';

test.afterAll(async () => {
  await deleteTestPublications(PUB_MARKER);
});

test('rejeter une candidature : confirmation nommant l’organisation, Échap annule (issue #38)', async ({
  page,
}) => {
  const stamp = Date.now();
  const appOrg = `Institut Démo Sahel E2E ${stamp}`;

  await submitApplication({
    type: 'individu',
    organizationName: appOrg,
    contactEmail: `e2e_conf_cand_${stamp}@democracytogether.test`,
    country: 'Sénégal',
  });

  await page.goto('/fr/admin/candidatures');
  const row = page.getByRole('listitem').filter({ hasText: appOrg });
  await expect(row).toBeVisible();

  // 1. La boîte NOMME la candidature visée.
  await row.getByRole('button', { name: 'Rejeter', exact: true }).click();
  const dialog = page.getByRole('dialog', {
    name: `Rejeter la candidature de ${appOrg} ?`,
  });
  await expect(dialog).toBeVisible();

  // 2. Échap ferme sans rien décider — la candidature est toujours en attente
  // (ce qui compte : depuis la machine à états #9, un rejet ne se rejoue pas).
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(row).toBeVisible();
  await expect(row.getByText('En attente')).toBeVisible();

  // 3. Confirmée, l'action part — et l'écran le DIT.
  await row.getByRole('button', { name: 'Rejeter', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Rejeter la candidature' })
    .click();
  await expect(page.getByRole('status')).toContainText(
    `Candidature de ${appOrg} rejetée.`,
  );
  await expect(row).toHaveCount(0);

  await page.getByRole('button', { name: 'Toutes' }).click();
  const decided = page.getByRole('listitem').filter({ hasText: appOrg });
  await expect(decided.getByText('Rejetée')).toBeVisible();
});

test('rejeter une publication : confirmation nommant le titre, annulation sans effet (issue #38)', async ({
  page,
}) => {
  const title = `${PUB_MARKER} ${Date.now()}`;

  // La publication à rejeter doit exister : on la dépose par le chemin réel.
  await page.goto('/fr/espace-membre/deposer');
  await page.getByLabel('Titre', { exact: true }).fill(title);
  await page.getByLabel('Auteur·rice·s').fill('A. Membre E2E');
  await page
    .getByLabel('Résumé', { exact: true })
    .fill(
      'Un dépôt de test destiné à être rejeté depuis la file de modération.',
    );
  await page.getByRole('button', { name: 'Soumettre pour relecture' }).click();
  await expect(
    page.getByRole('heading', { name: 'Soumission reçue' }),
  ).toBeVisible();

  await page.goto('/fr/admin/publications');
  const row = page.getByRole('listitem').filter({ hasText: title });
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: 'Rejeter', exact: true }).click();
  const dialog = page.getByRole('dialog', {
    name: `Rejeter la publication « ${title} » ?`,
  });
  await expect(dialog).toBeVisible();

  // Annuler laisse la publication dans la file en attente.
  await dialog.getByRole('button', { name: 'Annuler' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row.getByText('En attente')).toBeVisible();

  await row.getByRole('button', { name: 'Rejeter', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Rejeter la publication' })
    .click();
  await expect(page.getByRole('status')).toContainText(
    `Publication « ${title} » rejetée.`,
  );
  await expect(row).toHaveCount(0);
});

test('retirer un contenu signalé : confirmation nommant la cible (issue #38)', async ({
  page,
}) => {
  const postTitle = `Prise de parole à retirer E2E ${Date.now()}`;

  // Un contenu publié, puis signalé (tout compte authentifié peut signaler).
  await page.goto('/fr/tribune');
  await page.getByRole('button', { name: 'Prendre la parole' }).click();
  const composer = page
    .locator('form')
    .filter({ hasText: 'Votre prise de parole' });
  await composer.getByLabel('Titre', { exact: true }).fill(postTitle);
  await composer
    .getByLabel('Votre texte')
    .fill(
      'Un court billet de test E2E destiné à être retiré par la modération.',
    );
  await composer.getByRole('button', { name: 'Publier' }).click();

  await page.getByRole('link').filter({ hasText: postTitle }).first().click();
  await expect(page).toHaveURL(/\/fr\/tribune\/[a-z0-9]+$/);
  await page.getByRole('button', { name: 'Signaler' }).first().click();
  await expect(page.getByText('Signalé')).toBeVisible();

  await page.goto('/fr/admin/signalements');
  const row = page.getByRole('listitem').filter({ hasText: postTitle });
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: 'Retirer', exact: true }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Retirer cette prise de parole de la tribune ?',
  });
  await expect(dialog).toBeVisible();
  // La cible est nommée jusqu'à l'extrait signalé : deux lignes de cette file
  // ne se distinguent que par là.
  await expect(dialog).toContainText(postTitle);

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: 'Retirer', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Retirer le contenu' })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'Contenu retiré de la tribune.',
  );
  await expect(row).toHaveCount(0);

  // Le contenu a bien quitté la tribune publique.
  await page.goto('/fr/tribune');
  await expect(
    page.getByRole('link').filter({ hasText: postTitle }),
  ).toHaveCount(0);
});

test('le rôle ne change pas sur un simple choix dans la liste : il faut « Appliquer » puis confirmer (issue #38)', async ({
  page,
}) => {
  const stamp = Date.now();
  const email = `e2e_conf_role_${stamp}@democracytogether.test`;
  await provisionUser(email, 'membre');

  await page.goto('/fr/admin/utilisateurs');
  await chercherUtilisateur(page, email);
  const row = page.getByRole('row').filter({ hasText: email });
  await expect(row).toBeVisible();

  // 1. CHOISIR N'EST PAS APPLIQUER. C'est le cœur de l'issue : un mouvement de
  // molette au-dessus de la liste déroulante en changeait la valeur, et cette
  // valeur partait au serveur. On simule le geste par sa conséquence (la
  // valeur change) et on vérifie qu'après rechargement, rien n'est parti.
  await row.getByLabel(`Rôle ${email}`).selectOption('visiteur');
  await expect(row.getByRole('button', { name: 'Appliquer' })).toBeVisible();
  await page.reload();
  // Le rechargement vide le champ de recherche — c'est un état local. Sans le
  // reposer, la ligne repart hors de la première page dès que la base est
  // peuplée, et l'échec ne dit plus rien du sujet du test.
  await chercherUtilisateur(page, email);
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: email })
      .getByLabel(`Rôle ${email}`),
  ).toHaveValue('membre');

  // 2. « Appliquer » ouvre une confirmation qui nomme le compte, et dit ce qui
  // change.
  const row2 = page.getByRole('row').filter({ hasText: email });
  await row2.getByLabel(`Rôle ${email}`).selectOption('visiteur');
  await row2.getByRole('button', { name: 'Appliquer' }).click();
  const dialog = page.getByRole('dialog', {
    name: `Changer le rôle de ${email} ?`,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('« Membre »');
  await expect(dialog).toContainText('« Visiteur »');

  // Annuler ne touche à rien.
  await dialog.getByRole('button', { name: 'Annuler' }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  // Le rechargement vide le champ de recherche — c'est un état local. Sans le
  // reposer, la ligne repart hors de la première page dès que la base est
  // peuplée, et l'échec ne dit plus rien du sujet du test.
  await chercherUtilisateur(page, email);
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: email })
      .getByLabel(`Rôle ${email}`),
  ).toHaveValue('membre');

  // 3. Confirmée, la bascule part — avec un retour visible.
  const row3 = page.getByRole('row').filter({ hasText: email });
  await row3.getByLabel(`Rôle ${email}`).selectOption('visiteur');
  await row3.getByRole('button', { name: 'Appliquer' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Changer le rôle' })
    .click();
  // Filtré : l'écran des utilisateurs porte une seconde région `status` (le
  // formulaire d'invitation), qui rendrait le sélecteur ambigu.
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: `${email} est désormais « Visiteur »` }),
  ).toBeVisible();

  await page.reload();
  // Le rechargement vide le champ de recherche — c'est un état local. Sans le
  // reposer, la ligne repart hors de la première page dès que la base est
  // peuplée, et l'échec ne dit plus rien du sujet du test.
  await chercherUtilisateur(page, email);
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: email })
      .getByLabel(`Rôle ${email}`),
  ).toHaveValue('visiteur');
});
