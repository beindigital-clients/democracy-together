import { test, expect } from '@playwright/test';
import { submitApplication, provisionUser, clearRole } from './_helpers';
import { SESSIONS } from './_sessions';

test.use({ locale: 'fr-FR' });

test.describe('accès refusé (session membre partagée)', () => {
  // Session d'un MEMBRE (et pas d'un visiteur) : c'est le cas intéressant, un
  // visiteur étant refusé a fortiori.
  test.use({ storageState: SESSIONS.membre.state });

  test('back-office : un membre ordinaire est refusé (F-26)', async ({
    page,
  }) => {
    await page.goto('/fr/admin');
    await expect(
      page.getByRole('heading', { name: 'Accès réservé' }),
    ).toBeVisible();
  });
});

test.describe('modération et utilisateurs (session admin partagée)', () => {
  test.use({ storageState: SESSIONS.admin.state });

  test('back-office : admin modère une candidature et voit les utilisateurs (F-26/F-61/F-63)', async ({
    page,
  }) => {
    const stamp = Date.now();
    const adminEmail = SESSIONS.admin.email;
    const appOrg = `Institut E2E ${stamp}`;

    // une candidature à modérer
    await submitApplication({
      type: 'organisation',
      organizationName: appOrg,
      contactEmail: `cand_${stamp}@democracytogether.test`,
      country: 'Sénégal',
    });

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
    const legacyEmail = `e2e_role_sansrole_${stamp}@democracytogether.test`;

    // Le compte HÉRITÉ reste créé sur mesure : c'est l'état que la session
    // partagée ne peut pas produire (elle porte toujours un rôle).
    await provisionUser(legacyEmail);
    await clearRole(legacyEmail);

    await page.goto('/fr/admin/utilisateurs');
    const roleSelect = page.getByLabel(`Rôle ${legacyEmail}`);
    await expect(roleSelect).toBeVisible();
    // La VALEUR, pas seulement le libellé : c'est elle que le <Select> contrôlé
    // renverrait au serveur si l'administrateur validait sans rien changer.
    await expect(roleSelect).toHaveValue('visiteur');
  });
});
