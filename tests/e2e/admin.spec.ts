import { test, expect } from '@playwright/test';
import {
  submitApplication,
  provisionUser,
  clearRole,
  chercherUtilisateur,
} from './_helpers';
import { SESSIONS } from './_sessions';

test.use({ locale: 'fr-FR' });

test.describe('accès refusé (session membre partagée)', () => {
  // A MEMBER's session (and not a visitor's): that is the interesting case, a
  // visitor being refused all the more so.
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

    // an application to moderate
    await submitApplication({
      type: 'organisation',
      organizationName: appOrg,
      contactEmail: `cand_${stamp}@democracytogether.test`,
      country: 'Sénégal',
    });

    // staff entry point from the member area
    await page.goto('/fr/espace-membre');
    await page.getByRole('link', { name: /Espace d.administration/ }).click();
    await expect(page).toHaveURL(/\/fr\/admin$/);
    await expect(
      page.getByRole('heading', { name: 'Tableau de bord' }),
    ).toBeVisible();

    // to the moderation queue
    await page.getByRole('link', { name: /Traiter les candidatures/ }).click();
    await expect(page).toHaveURL(/\/admin\/candidatures$/);

    // the application is pending; we approve it
    const row = page.getByRole('listitem').filter({ hasText: appOrg });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Approuver' }).click();

    // Approving an ORGANIZATION does not decide right away: the screen first
    // asks for the directory entry (F-19/F-22), because that is when
    // the organization is created. The test clicked "Approuver" and waited for
    // the row to leave the queue — it stayed there, since nothing had been
    // decided yet. That is indeed what the product does, and this step deserves to be
    // pinned down rather than silently bypassed.
    await expect(
      row.getByRole('heading', { name: 'Fiche annuaire' }),
    ).toBeVisible();

    // This test is about moderation and users (F-26/F-61/F-63): we
    // take the exit provided for that — the account is created, the entry remains to be
    // completed. Publishing the entry (F-19) belongs to another journey.
    await row
      .getByRole('button', { name: 'Approuver sans publier la fiche' })
      .click();

    // it leaves the "En attente" queue
    await expect(row).toHaveCount(0);

    // under "Toutes" it reappears, with status Approuvée
    await page.getByRole('button', { name: 'Toutes' }).click();
    const approved = page.getByRole('listitem').filter({ hasText: appOrg });
    await expect(approved).toBeVisible();
    await expect(approved.getByText('Approuvée')).toBeVisible();

    // user management (admin)
    await page
      .getByRole('link', {
        name: 'Utilisateurs (Administration)',
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/\/admin\/utilisateurs$/);
    await chercherUtilisateur(page, adminEmail);
    await expect(page.getByText(adminEmail)).toBeVisible();
  });

  // Role displayed in /admin/utilisateurs (F-63, issue #27).
  //
  // The back office substituted "membre" for a missing role, whereas the server
  // RBAC substitutes "visiteur". On the very screen where the administrator decides
  // who has access to what, an account with no rights at all thus showed as a member — and
  // since the <Select> is CONTROLLED on this value, leaving the row as
  // is changed nothing: the discrepancy did not show.
  //
  // The case is not theoretical: accounts created before PR #4 have no
  // `role` column. `clearRole` reproduces exactly that state.
  test('back-office : un compte sans rôle est affiché « Visiteur » (F-63)', async ({
    page,
  }) => {
    const stamp = Date.now();
    const legacyEmail = `e2e_role_sansrole_${stamp}@democracytogether.test`;

    // The LEGACY account is still created ad hoc: it is the state the shared
    // session cannot produce (it always carries a role).
    await provisionUser(legacyEmail);
    await clearRole(legacyEmail);

    await page.goto('/fr/admin/utilisateurs');
    await chercherUtilisateur(page, legacyEmail);
    const roleSelect = page.getByLabel(`Rôle ${legacyEmail}`);
    await expect(roleSelect).toBeVisible();
    // The role the controlled select holds — what it would send back to the
    // server if the administrator confirmed without changing anything.
    await expect(roleSelect).toHaveText('Visiteur');
  });
});
