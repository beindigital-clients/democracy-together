import { test, expect, type Page } from '@playwright/test';
import { E2E_PASSWORD, approveTribunePosts, signUpAndVerify } from './_helpers';

// TRIBUNE — modération A PRIORI, file unifiée, approfondissement (F-45, F-48,
// F-49 — chantier communauté), bout en bout et par les écrans réels :
//   1. un membre soumet un billet : il est EN ATTENTE, absent du fil public,
//      et son auteur en voit l'état ;
//   2. un modérateur l'ouvre dans la file, lit son historique, le VALIDE ;
//   3. le billet est public ;
//   4. l'auteur ouvre une CONTRIBUTION DE FOND liée, elle-même soumise à la
//      modération ; validée, les deux textes se renvoient l'un à l'autre.
//
// Comptes neufs à chaque exécution : le fichier tient ses sessions.
test.use({ locale: 'fr-FR' });

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Déconnexion' }).click();
  await expect(page).toHaveURL(/\/fr$/);
}

async function signIn(page: Page, email: string) {
  await page.goto('/fr/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('button', { name: 'Déconnexion' })).toBeVisible({
    timeout: 15_000,
  });
}

// Liens du FIL public (vers une fiche /tribune/<id>) : « Mes billets » liste
// aussi le billet de son auteur, mais vers l'espace membre.
function feedLink(page: Page, title: string) {
  return page.locator('a[href*="/tribune/"]').filter({ hasText: title });
}

test('un billet soumis attend la validation, puis s’approfondit en contribution de fond', async ({
  page,
}) => {
  const stamp = Date.now();
  const authorEmail = `e2e_trib_auteur_${stamp}@democracytogether.test`;
  const modEmail = `e2e_trib_mod_${stamp}@democracytogether.test`;
  const title = `Billet a priori E2E ${stamp}`;
  const deepTitle = `Approfondissement E2E ${stamp}`;

  // 1. Le membre soumet.
  await signUpAndVerify(page, authorEmail, E2E_PASSWORD, 'membre');
  await page.goto('/fr/tribune');
  await page.getByRole('button', { name: 'Prendre la parole' }).click();
  const composer = page
    .locator('form')
    .filter({ hasText: 'Votre prise de parole' });
  await expect(
    composer.getByText(/relu par un modérateur avant de paraître/),
  ).toBeVisible();
  await composer.getByLabel('Titre', { exact: true }).fill(title);
  await composer
    .getByLabel('Votre texte')
    .fill(
      'Une prise de parole courte, soumise à la validation des modérateurs.',
    );
  await composer
    .getByRole('button', { name: 'Soumettre à la modération' })
    .click();
  await expect(page.getByText(/soumise à la modération/)).toBeVisible();

  // En attente : absent du fil, visible de son auteur avec son état.
  await page.goto('/fr/tribune');
  await expect(feedLink(page, title)).toHaveCount(0);
  const mine = page.getByRole('region', { name: 'Mes billets' });
  await expect(mine).toContainText(title);
  await expect(mine).toContainText('En attente de validation');
  await signOut(page);

  // Un visiteur ne le trouve pas davantage.
  await page.goto('/fr/tribune');
  await expect(feedLink(page, title)).toHaveCount(0);

  // 2. Le modérateur valide depuis la file, historique à l'appui.
  await signUpAndVerify(page, modEmail, E2E_PASSWORD, 'moderateur');
  await page.goto('/fr/admin/file-moderation');
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'File de modération de la tribune',
    }),
  ).toBeVisible();
  await page.getByRole('button').filter({ hasText: title }).click();
  const history = page.getByRole('region', { name: 'Historique' });
  await expect(history).toContainText('Soumis');
  await page.getByRole('button', { name: 'Valider', exact: true }).click();
  await expect(page.getByText(`« ${title} » validé`)).toBeVisible();
  await expect(history).toContainText('Validé');
  await signOut(page);

  // 3. Public.
  await page.goto('/fr/tribune');
  await feedLink(page, title).first().click();
  await expect(
    page.getByRole('heading', { level: 1, name: title }),
  ).toBeVisible();

  // 4. L'auteur approfondit : contribution de fond liée, soumise à son tour.
  await signIn(page, authorEmail);
  await page.goto('/fr/tribune');
  await feedLink(page, title).first().click();
  await page.getByRole('button', { name: 'Approfondir ce billet' }).click();
  const deep = page
    .locator('form')
    .filter({ hasText: 'Contribution de fond sur' });
  await deep.getByLabel('Titre', { exact: true }).fill(deepTitle);
  await deep
    .getByLabel('Votre texte')
    .fill('Une contribution de fond qui prolonge le billet court. '.repeat(6));
  await deep.getByRole('button', { name: 'Soumettre à la modération' }).click();
  await expect(page.getByText(/soumise à la modération/)).toBeVisible();

  // Son état, dans l'espace membre.
  await page.goto('/fr/espace-membre/contributions');
  const row = page.getByRole('listitem').filter({ hasText: deepTitle });
  await expect(row).toContainText('En attente de validation');
  await expect(row).toContainText('Approfondissement');

  // Validée, elle et le billet se renvoient l'un à l'autre, publiquement.
  await approveTribunePosts(deepTitle);
  await signOut(page);
  await page.goto('/fr/tribune');
  await feedLink(page, title).first().click();
  const linked = page.getByRole('region', {
    name: 'Contribution de fond qui prolonge ce billet',
  });
  await linked.getByRole('link', { name: deepTitle }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: deepTitle }),
  ).toBeVisible();
  await expect(
    page.getByText('Cette contribution de fond prolonge le billet'),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: title })).toBeVisible();
});
