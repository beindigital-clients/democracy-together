import { test, expect } from '@playwright/test';
import {
  signUpAndVerify,
  elevateRole,
  deleteTestPublications,
} from './_helpers';

test.use({ locale: 'fr-FR' });

const PW = 'motdepasse123';
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

  await signUpAndVerify(page, email, PW); // auto-inscription -> rôle « visiteur »

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

  await page
    .getByRole('button', { name: 'Soumettre pour relecture' })
    .click();
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
