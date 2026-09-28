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

// Marker present in the title of publications created here -> targeted cleanup
// of the shared dataset afterwards (the test publishes a real publication).
const TEST_MARKER = 'Confiance institutionnelle E2E';

test.afterAll(async () => {
  await deleteTestPublications(TEST_MARKER);
});

// F-32 — Document submission: a member submits a publication (with a file),
// it goes to moderation, a moderator publishes it, it becomes public.
test('un membre dépose une publication, un modérateur la publie (F-32)', async ({
  page,
}) => {
  const stamp = Date.now();
  const email = `e2e_pub_${stamp}@democracytogether.test`;
  const title = `Confiance institutionnelle E2E ${stamp}`;

  await signUpAndVerify(page, email, E2E_PASSWORD); // self-signup -> "visiteur" role

  // Membership model B: only validated members can submit. We elevate the
  // account to the "membre" role (equivalent to a validated membership application).
  await elevateRole(email, 'membre');
  await page.goto('/fr/espace-membre');

  // From the member area -> submission form
  await page
    .getByRole('link', { name: 'Soumettre une publication', exact: true })
    .click();
  await expect(page).toHaveURL(/\/espace-membre\/deposer$/);

  // Fill in the form (type/theme/region/language: default values)
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

  // Back to the member area: the contribution shows as "En revue"
  await page.getByRole('link', { name: 'Retour à mon espace' }).click();
  await expect(page).toHaveURL(/\/espace-membre$/);
  const row = page.getByRole('row').filter({ hasText: title });
  await expect(row).toBeVisible();
  await expect(row.getByText('En revue')).toBeVisible();

  // Elevation to admin -> publication moderation queue
  await elevateRole(email, 'admin');
  await page.goto('/fr/admin/publications');

  const modRow = page.getByRole('listitem').filter({ hasText: title });
  await expect(modRow).toBeVisible();
  await modRow.getByRole('button', { name: 'Approuver' }).click();
  // leaves the "En attente" queue
  await expect(modRow).toHaveCount(0);

  // Published: visible in "Mes contributions" + openable on its page
  await page.goto('/fr/espace-membre');
  const pubRow = page.getByRole('row').filter({ hasText: title });
  await expect(pubRow.getByText('Publié')).toBeVisible();
  await pubRow.getByRole('link', { name: 'Ouvrir' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(title);
});

// The submission page is protected: without a session, redirect to /connexion.
test('dépôt protégé : redirige vers connexion si non authentifié (F-32/F-01)', async ({
  page,
}) => {
  await page.goto('/fr/espace-membre/deposer');
  await expect(page).toHaveURL(/\/connexion$/);
});

// Submission: what the form was missing (issue #37). A member session
// is enough — sign-in is not the subject here.
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
    // The abstract is valid: it is not flagged, and it is intact.
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

    // The test file weighs a few bytes: its upload would be finished before
    // it could be observed. We pass the real storage request through — the document
    // is actually uploaded — then delay its RESPONSE, which leaves the
    // "téléversement" state on screen long enough to observe it.
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

    // It does not survive the submission: the progress is a state, not decoration.
    await expect(
      page.getByRole('heading', { name: 'Soumission reçue' }),
    ).toBeVisible();
    await expect(bar).toHaveCount(0);
  });
});
