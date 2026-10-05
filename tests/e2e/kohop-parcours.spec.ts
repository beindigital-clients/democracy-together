import { test, expect, type Browser, type Page } from '@playwright/test';
import { provisionUser, seedKohopPilot } from './_helpers';
import { SESSIONS, type SessionKey } from './_sessions';
import { attendreAucuneViolationGrave } from './_a11y';

// KOHOP batches 2 and 3, end to end: an author of the pilot organization writes a
// contribution, designates two reviewers from the directory and submits; the
// review chief — a MODERATOR holding the function — approves the reviewers and
// starts the review; both reviewers accept, read and hand in their analysis, and
// the file moves to the author's revision. Real screens, real server guards.
test.use({ locale: 'fr-FR' });

const REVIEWERS = [
  SESSIONS.kohopRelecteur1.email,
  SESSIONS.kohopRelecteur2.email,
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

  // --- The reviewers -----------------------------------------------------------
  const analysis = `Cette contribution est claire et bien documentée. ${words(180)}`;
  const reviewers: [SessionKey, string][] = [
    ['kohopRelecteur1', 'Favorable'],
    ['kohopRelecteur2', 'Favorable avec réserves'],
  ];
  const pages: Page[] = [];
  for (const [key, recommendation] of reviewers) {
    const reviewer = await as(browser, key);
    pages.push(reviewer);
    await reviewer.goto('/fr/espace-membre/relectures');
    await reviewer.getByRole('link', { name: new RegExp(title) }).click();
    // Before accepting, the text itself is not on screen.
    await expect(
      reviewer.getByRole('heading', { name: 'Le texte à relire' }),
    ).toHaveCount(0);
    await reviewer.getByRole('radio', { name: 'J’accepte de relire' }).click();
    const accept = reviewer.getByRole('button', {
      name: 'Accepter la relecture',
    });
    await expect(accept).toBeDisabled();
    await reviewer.getByRole('checkbox', { name: /aucun conflit/ }).click();
    await reviewer
      .getByRole('checkbox', { name: /publiée avec mon nom/ })
      .click();
    await accept.click();
    await expect(
      reviewer.getByRole('heading', { name: 'Le texte à relire' }),
    ).toBeVisible();
    if (key === 'kohopRelecteur1') {
      await attendreAucuneViolationGrave(reviewer, 'relecture KOHOP');
    }
    await reviewer
      .getByRole('radio', { name: recommendation, exact: true })
      .click();
    await reviewer.getByLabel('Votre analyse (publique)').fill(analysis);
    await reviewer.getByRole('button', { name: 'Rendre mon analyse' }).click();
    await expect(
      reviewer.getByText('Votre analyse est enregistrée'),
    ).toBeVisible();
  }

  // --- Back to the author: the stage followed ---------------------------------
  await author.reload();
  await expect(author.getByText('Les analyses sont arrivées')).toBeVisible();
  // The confidential note of a reviewer is nowhere in the author's file.
  await expect(author.getByText('Note confidentielle')).toHaveCount(0);
  for (const [i, [key]] of reviewers.entries()) await keep(pages[i], key);
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
