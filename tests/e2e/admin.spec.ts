import { test, expect } from '@playwright/test';
import {
  signUpAndVerify,
  elevateRole,
  submitApplication,
  provisionUser,
  clearRole,
} from './_helpers';

test.use({ locale: 'fr-FR' });

const PW = 'motdepasse123';

test('back-office : un membre ordinaire est refusé (F-26)', async ({
  page,
}) => {
  const email = `e2e_bo_membre_${Date.now()}@democracytogether.test`;
  // Rôle explicite : ce test vérifie qu'un MEMBRE (et pas un visiteur) est
  // refusé au back-office — c'est le cas intéressant, un visiteur l'étant a
  // fortiori. Le défaut de la fixture est `visiteur`.
  await signUpAndVerify(page, email, PW, 'membre');

  await page.goto('/fr/admin');
  await expect(
    page.getByRole('heading', { name: 'Accès réservé' }),
  ).toBeVisible();
});

test('back-office : admin modère une candidature et voit les utilisateurs (F-26/F-61/F-63)', async ({
  page,
}) => {
  const stamp = Date.now();
  const adminEmail = `e2e_bo_admin_${stamp}@democracytogether.test`;
  const appOrg = `Institut E2E ${stamp}`;

  // une candidature à modérer
  await submitApplication({
    type: 'organisation',
    organizationName: appOrg,
    contactEmail: `cand_${stamp}@democracytogether.test`,
    country: 'Sénégal',
  });

  await signUpAndVerify(page, adminEmail, PW);
  await elevateRole(adminEmail, 'admin');

  // point d'entrée staff depuis l'espace membre
  await page.goto('/fr/espace-membre');
  await page.getByRole('link', { name: /Espace d.administration/ }).click();
  await expect(page).toHaveURL(/\/fr\/admin$/);
  await expect(
    page.getByRole('heading', { name: 'Tableau de bord' }),
  ).toBeVisible();

  // vers la file de modération
  await page.getByRole('link', { name: /Traiter les candidatures/ }).click();
  await expect(page).toHaveURL(/\/admin\/candidatures$/);

  // la candidature est en attente ; on l'approuve
  const row = page.getByRole('listitem').filter({ hasText: appOrg });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Approuver' }).click();
  // elle quitte la file « En attente »
  await expect(row).toHaveCount(0);

  // en « Toutes » elle réapparaît, statut Approuvée
  await page.getByRole('button', { name: 'Toutes' }).click();
  const approved = page.getByRole('listitem').filter({ hasText: appOrg });
  await expect(approved).toBeVisible();
  await expect(approved.getByText('Approuvée')).toBeVisible();

  // gestion des utilisateurs (admin)
  await page.getByRole('link', { name: 'Utilisateurs', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/utilisateurs$/);
  await expect(page.getByText(adminEmail)).toBeVisible();
});

// Rôle affiché dans /admin/utilisateurs (F-63, issue #27).
//
// Le back-office substituait « membre » à l'absence de rôle, là où le RBAC
// serveur substitue « visiteur ». Sur l'écran même où l'administrateur décide
// qui a accès à quoi, un compte sans aucun droit s'annonçait donc membre — et
// comme le <Select> est CONTRÔLÉ sur cette valeur, laisser la ligne telle
// quelle ne changeait rien : l'écart ne se voyait pas.
//
// Le cas n'est pas théorique : les comptes créés avant la PR #4 n'ont pas de
// colonne `role`. `clearRole` reproduit exactement cet état.
test('back-office : un compte sans rôle est affiché « Visiteur » (F-63)', async ({
  page,
}) => {
  const stamp = Date.now();
  const adminEmail = `e2e_role_admin_${stamp}@democracytogether.test`;
  const legacyEmail = `e2e_role_sansrole_${stamp}@democracytogether.test`;

  await provisionUser(legacyEmail);
  await clearRole(legacyEmail);

  await signUpAndVerify(page, adminEmail, PW);
  await elevateRole(adminEmail, 'admin');

  await page.goto('/fr/admin/utilisateurs');
  const roleSelect = page.getByLabel(`Rôle ${legacyEmail}`);
  await expect(roleSelect).toBeVisible();
  // La VALEUR, pas seulement le libellé : c'est elle que le <Select> contrôlé
  // renverrait au serveur si l'administrateur validait sans rien changer.
  await expect(roleSelect).toHaveValue('visiteur');
});
