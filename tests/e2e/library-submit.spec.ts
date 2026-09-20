import { test, expect } from '@playwright/test';
import {
  signUpAndVerify,
  elevateRole,
  deleteTestPublications,
  E2E_PASSWORD,
} from './_helpers';
import { SESSIONS } from './_sessions';
import { expectFieldError, expectNoFieldError } from './_fields';

test.use({ locale: 'fr-FR' });

// Marqueur présent dans le titre des publications créées ici -> nettoyage ciblé
// du dataset partagé après coup (le test publie une vraie publication).
const TEST_MARKER = 'Confiance institutionnelle E2E';

test.afterAll(async () => {
  await deleteTestPublications(TEST_MARKER);
});

// F-32 — Dépôt documentaire : un membre dépose une publication (avec fichier),
// elle part en modération, un modérateur la publie, elle devient publique.
test('un membre dépose une publication, un modérateur la publie (F-32)', async ({
  page,
}) => {
  const stamp = Date.now();
  const email = `e2e_pub_${stamp}@democracytogether.test`;
  const title = `Confiance institutionnelle E2E ${stamp}`;

  await signUpAndVerify(page, email, E2E_PASSWORD); // auto-inscription -> rôle « visiteur »

  // Modèle d'adhésion B : seuls les membres validés déposent. On élève le
  // compte au rôle « membre » (équivaut à une candidature d'adhésion validée).
  await elevateRole(email, 'membre');
  await page.goto('/fr/espace-membre');

  // Depuis l'espace membre -> formulaire de dépôt
  await page
    .getByRole('link', { name: 'Soumettre une publication', exact: true })
    .click();
  await expect(page).toHaveURL(/\/espace-membre\/deposer$/);

  // Renseigne le formulaire (type/thème/région/langue : valeurs par défaut)
  await page.getByLabel('Titre', { exact: true }).fill(title);
  await page.getByLabel('Auteur·rice·s').fill('A. Membre E2E');
  await page
    .getByLabel('Résumé', { exact: true })
    .fill(
      'Une enquête comparée sur la confiance dans les institutions démocratiques en Afrique et en Europe.',
    );
  await page.getByLabel('Document (PDF)').setInputFiles({
    name: 'rapport-e2e.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n% fichier de test E2E\n'),
  });

  await page.getByRole('button', { name: 'Soumettre pour relecture' }).click();
  await expect(
    page.getByRole('heading', { name: 'Soumission reçue' }),
  ).toBeVisible();

  // Retour à l'espace membre : la contribution apparaît « En revue »
  await page.getByRole('link', { name: 'Retour à mon espace' }).click();
  await expect(page).toHaveURL(/\/espace-membre$/);
  const row = page.getByRole('row').filter({ hasText: title });
  await expect(row).toBeVisible();
  await expect(row.getByText('En revue')).toBeVisible();

  // Élévation en admin -> file de modération des publications
  await elevateRole(email, 'admin');
  await page.goto('/fr/admin/publications');

  const modRow = page.getByRole('listitem').filter({ hasText: title });
  await expect(modRow).toBeVisible();
  await modRow.getByRole('button', { name: 'Approuver' }).click();
  // quitte la file « En attente »
  await expect(modRow).toHaveCount(0);

  // Publiée : visible dans « Mes contributions » + ouvrable sur sa fiche
  await page.goto('/fr/espace-membre');
  const pubRow = page.getByRole('row').filter({ hasText: title });
  await expect(pubRow.getByText('Publié')).toBeVisible();
  await pubRow.getByRole('link', { name: 'Ouvrir' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(title);
});

// La page de dépôt est protégée : sans session, redirection vers /connexion.
test('dépôt protégé : redirige vers connexion si non authentifié (F-32/F-01)', async ({
  page,
}) => {
  await page.goto('/fr/espace-membre/deposer');
  await expect(page).toHaveURL(/\/connexion$/);
});

// Dépôt : ce qui manquait au formulaire (issue #37). Une session de membre
// suffit — le sujet n'est pas la connexion.
test.describe('dépôt : validation et progression (#37)', () => {
  test.use({ storageState: SESSIONS.membre.state });

  test('un dépôt incomplet désigne les champs fautifs et garde la saisie (F-32)', async ({
    page,
  }) => {
    const abstract =
      'Une enquête comparée sur la confiance dans les institutions, rédigée en une fois.';
    await page.goto('/fr/espace-membre/deposer');

    await page.getByLabel('Titre', { exact: true }).fill('Abc');
    await page.getByLabel('Auteur·rice·s').fill('A. Membre E2E');
    await page.getByLabel('Résumé', { exact: true }).fill(abstract);
    await page
      .getByRole('button', { name: 'Soumettre pour relecture' })
      .click();

    const title = page.getByLabel('Titre', { exact: true });
    await expectFieldError(page, title, /au moins 4 caractères/);
    // Le résumé est valide : il n'est pas mis en cause, et il est intact.
    await expectNoFieldError(page.getByLabel('Résumé', { exact: true }));
    await expect(page.getByLabel('Résumé', { exact: true })).toHaveValue(
      abstract,
    );
    await expect(title).toBeFocused();
    await expect(
      page.getByRole('heading', { name: 'Soumission reçue' }),
    ).toHaveCount(0);
  });

  test('le téléversement affiche sa progression (F-32)', async ({ page }) => {
    const title = `${TEST_MARKER} progression ${Date.now()}`;

    // Le fichier de test pèse quelques octets : son envoi serait terminé avant
    // d'être observable. On relaie la vraie requête de stockage — le document
    // est réellement téléversé — puis on retarde sa RÉPONSE, ce qui laisse
    // l'état « téléversement » à l'écran le temps de le constater.
    await page.route('**/api/storage/upload*', async (route) => {
      const response = await route.fetch();
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.fulfill({ response });
    });

    await page.goto('/fr/espace-membre/deposer');
    await page.getByLabel('Titre', { exact: true }).fill(title);
    await page.getByLabel('Auteur·rice·s').fill('A. Membre E2E');
    await page
      .getByLabel('Résumé', { exact: true })
      .fill('Note de test sur la progression du téléversement d’un document.');
    await page.getByLabel('Document (PDF)').setInputFiles({
      name: 'progression-e2e.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n% fichier de test E2E\n'),
    });
    await page
      .getByRole('button', { name: 'Soumettre pour relecture' })
      .click();

    const bar = page.getByRole('progressbar', {
      name: 'Progression du téléversement',
    });
    await expect(bar).toBeVisible();

    // Elle ne survit pas à l'envoi : la progression est un état, pas un décor.
    await expect(
      page.getByRole('heading', { name: 'Soumission reçue' }),
    ).toBeVisible();
    await expect(bar).toHaveCount(0);
  });
});
