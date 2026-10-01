import { test, expect, type Page } from '@playwright/test';
import {
  approveTribunePosts,
  E2E_PASSWORD,
  menuCompte,
  seDeconnecter,
  signUpAndVerify,
} from './_helpers';

// TRIBUNE — PRE-moderation, unified queue, in-depth follow-up (F-45, F-48,
// F-49 — "communauté" workstream), end to end and through the real screens:
//   1. a member submits a post: it is PENDING, absent from the public feed,
//      and its author sees its state;
//   2. a moderator opens it in the queue, reads its history, APPROVES it;
//   3. the post is public;
//   4. the author opens a linked IN-DEPTH CONTRIBUTION, itself subject to
//      moderation; once approved, the two texts link to each other.
//
// New accounts on every run: the file holds its sessions.
test.use({ locale: 'fr-FR' });

async function signOut(page: Page) {
  await seDeconnecter(page);
  await expect(page).toHaveURL(/\/fr$/);
}

async function signIn(page: Page, email: string) {
  await page.goto('/fr/connexion');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(E2E_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(menuCompte(page)).toBeVisible({
    timeout: 15_000,
  });
}

// Links of the public FEED (to a /tribune/<id> page): "Mes billets" also lists
// the author's post, but pointing to the member area.
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

  // 1. The member submits.
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

  // Pending: absent from the feed, visible to its author with its state.
  await page.goto('/fr/tribune');
  await expect(feedLink(page, title)).toHaveCount(0);
  const mine = page.getByRole('region', { name: 'Mes billets' });
  await expect(mine).toContainText(title);
  await expect(mine).toContainText('En attente de validation');
  await signOut(page);

  // A visitor cannot find it either.
  await page.goto('/fr/tribune');
  await expect(feedLink(page, title)).toHaveCount(0);

  // 2. The moderator approves from the queue, with the history as support.
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

  // 4. The author follows up in depth: linked in-depth contribution, submitted in turn.
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

  // Its state, in the member area.
  await page.goto('/fr/espace-membre/contributions');
  const row = page.getByRole('listitem').filter({ hasText: deepTitle });
  await expect(row).toContainText('En attente de validation');
  await expect(row).toContainText('Approfondissement');

  // Once approved, it and the post link to each other, publicly.
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
