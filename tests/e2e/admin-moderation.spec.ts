import { test, expect } from '@playwright/test';
import { signUpAndVerify, elevateRole, applyYouth } from './_helpers';
import { SESSIONS } from './_sessions';

// Les écrans de back-office qui ÉCRIVENT, bout en bout : une donnée réelle
// arrive par le chemin public, le staff la traite depuis l'écran, et l'effet
// est vérifié sur la file (elle en sort, et réapparaît avec le bon statut).
// Un « la page répond » ne dirait rien de la mutation, qui est justement ce
// qui casse.
//
// Déjà couverts ailleurs : candidatures d'adhésion (`admin.spec.ts`) et
// publications (`library-submit.spec.ts`).
test.use({ locale: 'fr-FR' });

const PW = 'motdepasse123';

test.describe('file des candidatures jeunes (session modérateur partagée)', () => {
  test.use({ storageState: SESSIONS.moderateur.state });

  test('back-office : un modérateur approuve une candidature jeune (F-58/F-26)', async ({
    page,
  }) => {
    const stamp = Date.now();
    const applicant = `Awa Jeunesse E2E ${stamp}`;

    // Candidature déposée par le chemin public (action ouverte, comme le
    // formulaire de /jeunes).
    await applyYouth({
      name: applicant,
      email: `e2e_youth_bo_${stamp}@democracytogether.test`,
      country: 'Sénégal',
      motivation:
        'Je souhaite contribuer aux travaux du réseau sur la participation citoyenne.',
    });

    await page.goto('/fr/admin/jeunes');

    const row = page.getByRole('listitem').filter({ hasText: applicant });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Approuver' }).click();
    await expect(row).toHaveCount(0); // quitte la file « En attente »

    await page.getByRole('button', { name: 'Toutes' }).click();
    const decided = page.getByRole('listitem').filter({ hasText: applicant });
    await expect(decided).toBeVisible();
    await expect(decided.getByText('Approuvée')).toBeVisible();

    // Une décision prise ne se retranche pas (issue #9) : l'écran n'offre plus
    // « Rejeter », mais « Rouvrir » — la transition arrière NOMMÉE, qui
    // renvoie la candidature dans la file au lieu d'écraser la décision
    // précédente. Le serveur tient la même règle si on appelle la mutation
    // directement (cf. convex/youth.test.ts).
    await expect(decided.getByRole('button', { name: 'Rejeter' })).toHaveCount(
      0,
    );
    await decided.getByRole('button', { name: 'Rouvrir' }).click();
    await expect(decided.getByText('En attente')).toBeVisible();
    await expect(
      decided.getByRole('button', { name: 'Approuver' }),
    ).toBeVisible();
  });
});

test('back-office : un modérateur accepte une proposition de projet (F-60/F-26)', async ({
  page,
}) => {
  const stamp = Date.now();
  const projectTitle = `Observatoire commun E2E ${stamp}`;

  // 1. Un MEMBRE propose depuis la page publique (le formulaire est réservé
  // aux membres : c'est aussi une vérification du gate).
  const email = `e2e_prj_${stamp}@democracytogether.test`;
  await signUpAndVerify(page, email, PW);
  await elevateRole(email, 'membre');

  await page.goto('/fr/appels-a-projets');
  await page.getByLabel('Axe de travail').selectOption('participation');
  await page.getByLabel('Titre du projet').fill(projectTitle);
  await page
    .getByLabel('Résumé', { exact: true })
    .fill(
      'Un observatoire commun des pratiques de participation citoyenne, mené avec trois membres du réseau en Afrique de l’Ouest et en Europe.',
    );
  await page.getByRole('button', { name: 'Envoyer la proposition' }).click();
  await expect(page.getByText('Proposition envoyée. Merci !')).toBeVisible();

  // 2. Le staff la traite depuis le back-office.
  await elevateRole(email, 'moderateur');
  await page.goto('/fr/admin/projets');

  const row = page.getByRole('listitem').filter({ hasText: projectTitle });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Accepter' }).click();
  await expect(row).toHaveCount(0);

  await page.getByRole('button', { name: 'Toutes' }).click();
  const decided = page.getByRole('listitem').filter({ hasText: projectTitle });
  await expect(decided).toBeVisible();
  await expect(decided.getByText('Accepté')).toBeVisible();
});

test('back-office : un modérateur traite un signalement de la tribune (F-50/F-26)', async ({
  page,
}) => {
  const stamp = Date.now();
  const postTitle = `Prise de parole E2E ${stamp}`;
  const email = `e2e_sig_${stamp}@democracytogether.test`;

  // 1. Un membre publie sur la tribune...
  await signUpAndVerify(page, email, PW);
  await elevateRole(email, 'membre');
  await page.goto('/fr/tribune');
  await page.getByRole('button', { name: 'Prendre la parole' }).click();

  const composer = page
    .locator('form')
    .filter({ hasText: 'Votre prise de parole' });
  await composer.getByLabel('Titre', { exact: true }).fill(postTitle);
  await composer
    .getByLabel('Votre texte')
    .fill(
      'Un court billet de test E2E sur la participation citoyenne et ses limites.',
    );
  await composer.getByRole('button', { name: 'Publier' }).click();

  // 2. ...puis signale le contenu depuis la fiche (tout compte authentifié peut).
  await page.getByRole('link').filter({ hasText: postTitle }).first().click();
  await expect(page).toHaveURL(/\/fr\/tribune\/[a-z0-9]+$/);
  await page.getByRole('button', { name: 'Signaler' }).first().click();
  await expect(page.getByText('Signalé')).toBeVisible();

  // 3. Le signalement arrive dans la file de modération et en sort une fois traité.
  await elevateRole(email, 'moderateur');
  await page.goto('/fr/admin/signalements');

  const row = page.getByRole('listitem').filter({ hasText: postTitle });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Ignorer' }).click();
  await expect(row).toHaveCount(0);
  // la prise de parole reste publiée : « Ignorer » ne retire pas le contenu
  await page.goto('/fr/tribune');
  await expect(
    page.getByRole('link').filter({ hasText: postTitle }).first(),
  ).toBeVisible();
});
