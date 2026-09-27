import { test, expect, type Page } from '@playwright/test';
import { chercherUtilisateur, getOtp } from './_helpers';
import { SESSIONS } from './_sessions';

// CYCLE DE VIE D'UN COMPTE (chantier comptes, F-63) — par l'interface :
// l'administrateur CRÉE un compte, ce compte se connecte, l'administrateur le
// SUSPEND (motif obligatoire) : sa session ouverte est fermée et une nouvelle
// connexion est refusée avec un message clair. Puis l'administrateur le
// SUPPRIME, en deux temps.
//
// Session dédiée (`comptes`) : le fichier tient la session administrateur
// d'un bout à l'autre (cf. _sessions.ts).

test.use({ locale: 'fr-FR' });
test.use({ storageState: SESSIONS.comptes.state });

async function signInWithOtp(page: Page, email: string) {
  await page.goto('/fr/connexion-otp');
  await page.getByLabel('E-mail').fill(email);
  await page.getByRole('button', { name: 'Recevoir un code' }).click();
  await expect(
    page.getByRole('heading', { name: 'Saisissez le code' }),
  ).toBeVisible();
  await page.getByLabel('Code de vérification').fill(await getOtp(email));
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

test('l’administrateur crée puis suspend un compte : il ne peut plus se connecter', async ({
  page,
  browser,
}) => {
  const email = `e2e_comptes_${Date.now()}@democracytogether.test`;

  // 1. CRÉATION DIRECTE depuis le back-office.
  await page.goto('/fr/admin/utilisateurs');
  const form = page.locator('form').filter({
    has: page.getByRole('heading', { name: 'Créer un compte' }),
  });
  await form.getByLabel('Adresse e-mail').fill(email);
  await form.getByLabel('Rôle', { exact: true }).selectOption('membre');
  await form.getByRole('button', { name: 'Créer le compte' }).click();
  await expect(form.getByRole('status')).toContainText('Compte créé');

  // 2. Le compte se connecte (contexte séparé : un autre navigateur).
  const userContext = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const userPage = await userContext.newPage();
  await signInWithOtp(userPage, email);
  await expect(userPage).toHaveURL(/\/espace-membre$/);
  await expect(
    userPage.getByRole('button', { name: 'Déconnexion' }),
  ).toBeVisible({ timeout: 15_000 });

  // 3. SUSPENSION, motif obligatoire, confirmation qui nomme le compte.
  await page.reload();
  await chercherUtilisateur(page, email);
  const row = page.getByRole('row').filter({ hasText: email });
  await row.getByRole('button', { name: `Suspendre ${email}` }).click();
  const suspendButton = row.getByRole('button', {
    name: 'Suspendre le compte',
  });
  await expect(suspendButton).toBeDisabled();
  await row
    .getByLabel('Motif de la suspension (obligatoire)')
    .fill('Test E2E : usurpation signalée');
  await suspendButton.click();
  const dialog = page.getByRole('dialog', { name: `Suspendre ${email} ?` });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Suspendre le compte' }).click();
  await expect(
    page.getByRole('status').filter({ hasText: `${email} est suspendu.` }),
  ).toBeVisible();
  await expect(row.getByText('Suspendu', { exact: true })).toBeVisible();
  await expect(row).toContainText('usurpation signalée');

  // 4. La session OUVERTE du compte est fermée : il ne retrouve plus son
  //    espace membre.
  await userPage.goto('/fr/espace-membre');
  await expect(userPage).toHaveURL(/\/connexion/, { timeout: 20_000 });

  // 5. Une NOUVELLE connexion est refusée, avec un message clair.
  await signInWithOtp(userPage, email);
  await expect(userPage.getByText('Ce compte est suspendu.')).toBeVisible();
  await expect(userPage).not.toHaveURL(/\/espace-membre/);
  await userContext.close();

  // 6. SUPPRESSION EN DEUX TEMPS : confirmer, puis retaper l'adresse.
  await row.getByRole('button', { name: `Supprimer ${email}` }).click();
  const step1 = page.getByRole('dialog', {
    name: `Supprimer le compte ${email} ?`,
  });
  await step1.getByRole('button', { name: 'Continuer' }).click();
  const definitive = row.getByRole('button', {
    name: 'Supprimer définitivement',
  });
  await expect(definitive).toBeDisabled();
  await row.getByLabel(`Retapez l'adresse ${email} pour confirmer`).fill(email);
  await definitive.click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: `Suppression de ${email} lancée.` }),
  ).toBeVisible();
  // Le traitement se termine par la suppression de la ligne `users`.
  await expect(page.getByRole('row').filter({ hasText: email })).toHaveCount(
    0,
    { timeout: 20_000 },
  );
});

test('le tableau de bord avertit tant que la 2FA n’est pas obligatoire', async ({
  page,
}) => {
  // Réglage par défaut du déploiement partagé : désactivé (cf.
  // docs/backlog/comptes.md). L'avertissement doit donc être là.
  await page.goto('/fr/admin');
  await expect(
    page.getByText(
      "La double authentification n'est pas obligatoire pour l'encadrement",
      { exact: false },
    ),
  ).toBeVisible();
  await page
    .getByRole('link', { name: 'Régler la sécurité des comptes' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Double authentification obligatoire' }),
  ).toBeVisible();
});
