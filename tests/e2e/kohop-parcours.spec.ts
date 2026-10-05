import { test, expect, type Browser, type Page } from '@playwright/test';
import { provisionUser, seedKohopPilot } from './_helpers';
import { SESSIONS, type SessionKey } from './_sessions';
import { attendreAucuneViolationGrave } from './_a11y';

// KOHOP batch 2, end to end: an author of the pilot organization writes a
// contribution, designates two reviewers from the directory and submits; the
// review chief — a MODERATOR holding the function — approves the reviewers and
// starts the review. Real screens, real server guards.
test.use({ locale: 'fr-FR' });

const REVIEWERS = [
  'e2e_kohop_rev1@democracytogether.test',
  'e2e_kohop_rev2@democracytogether.test',
];
const word = (i: number) =>
  ['participation', 'citoyenne', 'budget', 'démocratie', 'local', 'réseau'][
    i % 6
  ];
const words = (n: number) =>
  Array.from({ length: n }, (_, i) => word(i)).join(' ');

// The refresh token rotates on use: the state is rewritten at the end of the
// test so the next run does not start from a consumed token (same precaution
// as `admin-moderation.spec.ts`).
async function keep(page: Page, key: SessionKey): Promise<void> {
  await page.context().storageState({ path: SESSIONS[key].state });
}

async function as(browser: Browser, key: SessionKey): Promise<Page> {
  const context = await browser.newContext({
    storageState: SESSIONS[key].state,
    locale: 'fr-FR',
  });
  return await context.newPage();
}

test('de l’auteur au chef de revue : dépôt, validation des relecteurs, lancement', async ({
  browser,
}) => {
  test.setTimeout(150_000);
  for (const email of REVIEWERS) await provisionUser(email, 'membre');
  await seedKohopPilot(SESSIONS.kohopAuteur.email, REVIEWERS);
  const title = `Participation locale ${Date.now()}`;

  // --- The author --------------------------------------------------------------
  const author = await as(browser, 'kohopAuteur');
  await author.goto('/fr/espace-membre/kohop');
  await author.getByRole('button', { name: 'Commencer un brouillon' }).click();
  await author.getByLabel('Texte de la contribution').waitFor();

  await author
    .getByLabel('Texte de la contribution')
    .fill(`## Introduction\n\n${words(280)}\n\n${words(280)}`);
  await author.getByLabel('Titre', { exact: true }).fill(title);
  await author
    .getByLabel('Chapô')
    .fill(
      'Un chapô de cent caractères au moins, qui résume la contribution en une ou deux phrases claires et utiles au lecteur.',
    );
  await author
    .getByRole('checkbox', { name: 'Participation citoyenne' })
    .click();

  // RGAA: no serious or critical axe violation on the editor.
  await attendreAucuneViolationGrave(author, 'éditeur KOHOP');

  // The checklist says what is still missing, and the button is disabled.
  await expect(
    author.getByRole('button', { name: 'Déposer ma contribution' }),
  ).toBeDisabled();

  await author.getByLabel('Chercher un membre').fill('Re');
  for (const name of ['Rémi Relecteur', 'Rita Relectrice']) {
    await author
      .getByRole('button', { name: `Désigner ${name} comme relecteur` })
      .first()
      .click();
    await author.getByRole('button', { name: 'Comme titulaire' }).click();
    await expect(author.getByText(name).first()).toBeVisible();
  }
  const boxes = author.locator(
    'section[aria-labelledby="kohop-commitments"] [role=checkbox]',
  );
  for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).click();

  const submit = author.getByRole('button', {
    name: 'Déposer ma contribution',
  });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(
    author.getByText('Le chef de revue examine votre dépôt'),
  ).toBeVisible();

  // --- The review chief --------------------------------------------------------
  const chief = await as(browser, 'kohopChef');
  await chief.goto('/fr/admin/kohop');
  await chief.getByRole('link', { name: new RegExp(title) }).click();
  await expect(
    chief.getByRole('heading', { name: title }).first(),
  ).toBeVisible();

  await attendreAucuneViolationGrave(chief, 'dossier KOHOP du chef de revue');

  // Review cannot start before two reviewers are approved.
  await expect(
    chief.getByRole('button', { name: 'Lancer la relecture' }),
  ).toBeDisabled();
  for (const b of await chief
    .getByRole('button', { name: 'Valider ce relecteur' })
    .all()) {
    await b.click();
  }
  await chief.getByRole('button', { name: 'Lancer la relecture' }).click();
  await expect(chief.getByText('En relecture').first()).toBeVisible();

  // --- Back to the author: the stage followed ---------------------------------
  await author.reload();
  await expect(
    author.getByText('Vos relecteurs lisent votre texte'),
  ).toBeVisible();
  await keep(author, 'kohopAuteur');
  await keep(chief, 'kohopChef');
});

test('un modérateur sans la fonction ne voit ni l’entrée, ni la file KOHOP', async ({
  browser,
}) => {
  const mod = await as(browser, 'moderateur');
  await mod.goto('/fr/admin');
  await expect(mod.getByRole('link', { name: /^KOHOP/ })).toHaveCount(0);
  await mod.goto('/fr/admin/kohop');
  await expect(
    mod.getByText(/403|Accès refusé|autorisé/i).first(),
  ).toBeVisible();
  await keep(mod, 'moderateur');
});
