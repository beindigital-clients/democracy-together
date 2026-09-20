import { test, expect, type Locator, type Page } from '@playwright/test';
import { provisionUser, submitApplication } from './_helpers';
import { SESSIONS } from './_sessions';

test.use({ locale: 'fr-FR' });

// RECHERCHE ET FILTRES DU BACK-OFFICE (issue #49) — bout en bout, contre le
// vrai Convex.
//
// Pourquoi ce parcours ne double pas les tests unitaires : `convex-test`
// implémente les index plein texte avec sa propre tokenisation (préfixes de
// mots découpés sur les espaces), là où Convex découpe aussi sur la ponctuation
// et classe par pertinence. Le seul endroit où la VRAIE recherche est exercée,
// c'est ici — sur un déploiement Convex, à travers l'écran.
//
// Les données sont horodatées par exécution : le déploiement de dev vit
// longtemps et porte déjà des comptes et des candidatures. Un terme unique est
// ce qui rend « la ligne apparaît SEULE » vérifiable ailleurs que sur une base
// vide.
//
// SESSION DÉDIÉE (cf. _sessions.ts) : ce fichier écrit une donnée puis la
// cherche, donc il tient sa session d'un bout à l'autre. La partager avec un
// autre fichier l'a fait mourir en CI — deux contextes, un seul jeton de
// rafraîchissement — et le dernier parcours s'est réveillé sur /connexion.

const stamp = () => Date.now().toString(36);

async function search(page: Page, label: string, term: string) {
  await page.getByRole('searchbox', { name: label }).fill(term);
}

// Le champ est TEMPORISÉ et la recherche est faite par le serveur : entre la
// frappe et la liste restreinte, il s'écoule un délai puis un aller-retour
// Convex. Toute vérification de ce qui reste affiché doit donc être une
// assertion qui RÉESSAIE — `allTextContents()` lit une fois, et lit la liste
// d'avant. Ces deux aides ne rendent la main que lorsque plus aucune ligne ne
// contredit le filtre, et qu'il en reste au moins une.
async function onlyRowsMatching(cells: Locator, expected: string | RegExp) {
  await expect(cells.filter({ hasNotText: expected })).toHaveCount(0);
  await expect(cells.first()).toBeVisible();
}

// L'écran du back-office est monté derrière deux requêtes (session, puis
// liste) : cliquer sur `goto` sans attendre son titre, c'est viser un bouton
// que le rendu peut encore remplacer — « element was detached from the DOM ».
async function openScreen(page: Page, path: string, heading: string) {
  await page.goto(path);
  await expect(
    page.getByRole('heading', { level: 1, name: heading }),
  ).toBeVisible();
}

test.describe('recherche des listes (session dédiée)', () => {
  test.use({ storageState: SESSIONS.adminRecherche.state });

  test('utilisateurs : un fragment d’adresse fait apparaître le compte SEUL (F-63)', async ({
    page,
  }) => {
    // Le local-part est un seul bloc alphanumérique : le terme cherché est donc
    // un mot entier pour l'index, quelle que soit la façon dont il découpe la
    // ponctuation d'une adresse.
    const token = `recherche${stamp()}`;
    const email = `${token}@democracytogether.test`;
    await provisionUser(email);

    await openScreen(page, '/fr/admin/utilisateurs', 'Utilisateurs');
    // Sans recherche, la liste est paginée : rien ne garantit que le compte
    // tout juste créé soit dans la première page — c'est précisément ce que la
    // recherche sert à retrouver.
    await search(page, 'Rechercher un utilisateur', token);

    const rows = page.getByRole('row').filter({ hasText: token });
    await expect(rows).toHaveCount(1);
    // SEUL : la table ne contient plus que l'en-tête et cette ligne.
    await expect(page.getByRole('row')).toHaveCount(2);

    // Effacer rend la liste : la recherche n'a rien perdu en route.
    await page.getByRole('button', { name: 'Effacer' }).click();
    await expect(page.getByRole('row').nth(2)).toBeVisible();
  });

  test('utilisateurs : le filtre par rôle s’applique par-dessus la recherche (F-63)', async ({
    page,
  }) => {
    const token = `roles${stamp()}`;
    const email = `${token}@democracytogether.test`;
    // Le rôle est DEMANDÉ explicitement : `provisionUser` crée un « visiteur »
    // par défaut, et un test qui filtre sur « membre » doit dire de quel compte
    // il parle plutôt que d'hériter d'un défaut.
    await provisionUser(email, 'membre');

    await openScreen(page, '/fr/admin/utilisateurs', 'Utilisateurs');
    await search(page, 'Rechercher un utilisateur', token);
    await expect(page.getByText(email)).toBeVisible();

    // Le compte est membre : filtrer sur « Éditeur » doit le faire disparaître,
    // alors que la recherche, elle, continue de correspondre. C'est ce qui
    // montre que les deux conditions sont appliquées ensemble, côté serveur.
    await page.getByLabel('Filtrer par rôle').selectOption('editeur');
    await expect(page.getByText(email)).toHaveCount(0);
    await expect(
      page.getByText('Aucun résultat pour cette recherche.'),
    ).toBeVisible();

    // …et sur son propre rôle, il revient.
    await page.getByLabel('Filtrer par rôle').selectOption('membre');
    await expect(page.getByText(email)).toBeVisible();
  });

  test('candidatures : recherche par nom d’organisation (F-22/F-26)', async ({
    page,
  }) => {
    const token = `InstitutCherche${stamp()}`;
    await submitApplication({
      type: 'organisation',
      organizationName: `${token} du Sahel`,
      contactEmail: `cand_${stamp()}@democracytogether.test`,
      country: 'Sénégal',
    });

    await openScreen(page, '/fr/admin/candidatures', 'Candidatures');
    await search(page, 'Rechercher une candidature', token);

    // Liste NOMMÉE : la navigation groupée rend elle aussi des `<li>`, un
    // `getByRole('listitem')` non cadré compterait ses quatorze entrées.
    const queue = page
      .getByRole('list', { name: 'Liste des candidatures' })
      .getByRole('listitem');
    await expect(queue.filter({ hasText: token })).toHaveCount(1);
    await expect(queue).toHaveCount(1);

    // Un terme qui ne correspond à rien le DIT, au lieu d'afficher une file
    // vide qu'on prendrait pour « plus rien à modérer ».
    await search(page, 'Rechercher une candidature', 'zzz-aucune-candidature');
    await expect(
      page.getByText('Aucun résultat pour cette recherche.'),
    ).toBeVisible();
  });

  test('journal : recherche par action, puis filtre sur l’acteur d’une ligne (F-67)', async ({
    page,
  }) => {
    // On produit une entrée d'audit par le produit lui-même : changer un rôle
    // écrit `user.role_changed`, signée par la session admin courante. Rien
    // n'est inséré à la main, donc ce que le journal montre est bien ce que le
    // back-office écrit.
    const token = `journal${stamp()}`;
    const email = `${token}@democracytogether.test`;
    await provisionUser(email);

    await openScreen(page, '/fr/admin/utilisateurs', 'Utilisateurs');
    await search(page, 'Rechercher un utilisateur', token);

    // Le changement de rôle se fait en DEUX TEMPS depuis l'issue #38 : choisir
    // ne prépare que le brouillon, « Appliquer » ouvre la confirmation.
    const row = page.getByRole('row').filter({ hasText: token });
    await expect(row).toHaveCount(1);
    await row.getByLabel(`Rôle ${email}`).selectOption('moderateur');
    await row.getByRole('button', { name: 'Appliquer' }).click();
    await page
      .getByRole('dialog', { name: `Changer le rôle de ${email} ?` })
      .getByRole('button', { name: 'Changer le rôle' })
      .click();
    await expect(page.getByLabel(`Rôle ${email}`)).toHaveValue('moderateur');

    await openScreen(page, '/fr/admin/journal', "Journal d'activité");

    // Recherche par famille d'action : l'index découpe le slug pointé, donc
    // « user » remonte `user.role_changed` (et `user.invited`).
    await search(page, 'Rechercher une action', 'user');
    const actionCells = page.locator('tbody tr td:nth-child(2)');
    await onlyRowsMatching(actionCells, /^user\./);

    // Filtre par acteur : on le prend là où il est affiché, en cliquant
    // l'acteur d'une ligne.
    //
    // L'acteur visé est CONNU — c'est la session qui vient de changer le rôle,
    // donc l'entrée créée à l'instant. Lire à la place l'acteur « de la
    // première ligne » ouvrirait une course : le journal est alimenté en
    // parallèle par les autres parcours, et la ligne de tête peut changer
    // entre la lecture et le clic.
    await page.getByRole('button', { name: 'Effacer' }).click();
    const actor = SESSIONS.adminRecherche.email;
    const actorCells = page.locator('tbody tr td:nth-child(3)');
    await page
      .getByRole('button', { name: `Acteur : ${actor}` })
      .first()
      .click();

    // L'étiquette NOMME ce qui est filtré — sans elle, une liste restreinte
    // serait indistinguable d'un journal presque vide. `exact` : les boutons
    // du tableau portent la même chaîne en `aria-label`, mais pas en texte.
    await expect(
      page.getByText(`Acteur : ${actor}`, { exact: true }),
    ).toBeVisible();
    await onlyRowsMatching(actorCells, actor);

    // Et on peut y renoncer.
    await page
      .getByRole('button', { name: "Retirer le filtre d'acteur" })
      .click();
    await expect(
      page.getByText(`Acteur : ${actor}`, { exact: true }),
    ).toHaveCount(0);
  });

  test('publications : recherche par titre dans la file de modération (F-32)', async ({
    page,
  }) => {
    // Cette file dépend des seeds (`seedPublications`, cf. TESTING.md) : on ne
    // suppose donc pas une ligne précise, on vérifie la PROPRIÉTÉ — tout ce qui
    // reste affiché correspond au terme, et un terme absent le dit.
    await openScreen(page, '/fr/admin/publications', 'Publications');
    // Le titre paraît avant la première page de la file : cliquer à cet
    // instant, c'est viser un bouton que le rendu suivant remplace (« element
    // was detached from the DOM »). On attend donc que la file ait tranché —
    // une liste, ou le message de file vide.
    const queue = page
      .getByRole('list', { name: 'Liste des publications à modérer' })
      .getByRole('listitem');
    const settled = page
      .getByRole('list', { name: 'Liste des publications à modérer' })
      .or(page.getByText('Aucune publication à modérer.'));
    await expect(settled).toBeVisible();

    await page.getByRole('button', { name: 'Toutes' }).click();
    await expect(settled).toBeVisible();

    await search(page, 'Rechercher une publication', 'zzz-aucun-titre');
    await expect(
      page.getByText('Aucun résultat pour cette recherche.'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Effacer' }).click();
    const firstTitle = queue.first().getByRole('heading');
    await expect(firstTitle).toBeVisible();
    // Un MOT ENTIER du premier titre, assez long pour être discriminant : un
    // terme court (« l' » d'une élision, par exemple) correspondrait par
    // préfixe à presque tout, et l'assertion ci-dessous ne prouverait rien.
    const word = (await firstTitle.innerText())
      .split(/[^\p{L}\p{N}]+/u)
      .find((w) => w.length >= 5);
    test.skip(!word, 'aucun mot assez long dans le premier titre');

    await search(page, 'Rechercher une publication', word!);
    await onlyRowsMatching(
      queue.getByRole('heading'),
      new RegExp(word!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
    );
  });
});
