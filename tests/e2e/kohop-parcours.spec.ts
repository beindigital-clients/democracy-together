import { test, expect, type Browser, type Page } from '@playwright/test';
import { provisionUser, seedKohopPilot } from './_helpers';
import { SESSIONS, type SessionKey } from './_sessions';
import { attendreAucuneViolationGrave, revealAll } from './_a11y';

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

const opened: [Page, SessionKey][] = [];

// Whatever the outcome (a failure included), the sessions opened by the test
// are written back: a consumed token must not break the next run.
test.afterEach(async () => {
  for (const [page, key] of opened.splice(0)) {
    try {
      await page.context().storageState({ path: SESSIONS[key].state });
    } catch {
      /* the context may already be closed */
    }
  }
});

async function as(browser: Browser, key: SessionKey): Promise<Page> {
  const context = await browser.newContext({
    storageState: SESSIONS[key].state,
    locale: 'fr-FR',
  });
  const page = await context.newPage();
  opened.push([page, key]);
  return page;
}

test('de l’auteur au chef de revue : dépôt, validation des relecteurs, lancement', async ({
  browser,
}) => {
  // The whole journey (nine screens, three roles, scheduled actions): slower on a
  // shared runner than on a workstation.
  test.setTimeout(360_000);
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

  // Suggestions: a shortlist (possibly empty here), and the way back to search.
  await author
    .getByRole('button', { name: 'Suggérer cinq relecteurs' })
    .click();
  await expect(author.getByText('Des membres dont les thèmes')).toBeVisible();
  await author.getByRole('button', { name: 'Revenir à la recherche' }).click();

  await author.getByLabel('Chercher un membre').fill('Re');
  for (const name of ['Rémi Relecteur', 'Rita Relectrice']) {
    // The list re-renders as the directory answers: open the panel only when it
    // is not open yet (the button toggles), and retry until the designation sticks.
    await expect(async () => {
      const slot = author.getByRole('button', { name: 'Comme titulaire' });
      if (!(await slot.isVisible())) {
        await author
          .getByRole('button', { name: `Désigner ${name} comme relecteur` })
          .first()
          .click({ timeout: 3_000 });
      }
      await slot.click({ timeout: 3_000 });
    }).toPass({ timeout: 30_000 });
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
  const dossierUrl = chief.url();

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
    await reviewer
      .getByLabel('Note confidentielle au chef de revue')
      .fill('Note réservée au chef de revue.');
    await reviewer.getByRole('button', { name: 'Rendre mon analyse' }).click();
    await expect(
      reviewer.getByText('Votre analyse est enregistrée'),
    ).toBeVisible();
  }

  // --- Back to the author: the analyses, the revision, the reply ---------------
  await author.reload();
  await expect(author.getByText('Les analyses sont arrivées')).toBeVisible();
  await expect(
    author.getByRole('heading', { name: 'Les analyses de vos relecteurs' }),
  ).toBeVisible();
  // The confidential note of a reviewer is nowhere in the author's file.
  await expect(author.getByText('Note confidentielle')).toHaveCount(0);

  await attendreAucuneViolationGrave(author, 'révision KOHOP');
  await author
    .getByLabel('Texte de la contribution')
    .fill(
      `## Introduction\n\n${words(280)}\n\n${words(290)} précision ajoutée après la relecture`,
    );
  await expect(author.getByText(/mots ajoutés/)).toBeVisible();
  await author.getByRole('button', { name: 'Voir les changements' }).click();
  await author
    .getByLabel('Votre réponse aux relecteurs')
    .fill('Merci pour ces lectures attentives : la méthode est précisée.');
  await author
    .getByRole('button', { name: 'Envoyer ma révision et ma réponse' })
    .click();
  await author.getByRole('button', { name: 'Envoyer', exact: true }).click();
  await expect(
    author.getByText('Le chef de revue prend sa décision'),
  ).toBeVisible();

  // --- The review chief decides -----------------------------------------------
  await chief.goto(dossierUrl);
  await expect(
    chief.getByText('Présomption d’acceptation').first(),
  ).toBeVisible();
  // The confidential note is for the chief only.
  await expect(
    chief.getByText('Note confidentielle (chef de revue seulement)').first(),
  ).toBeVisible();
  await attendreAucuneViolationGrave(chief, 'décision KOHOP du chef de revue');
  // Originality: the platform report is in, no external provider is configured
  // — acceptance waits for the chief's explicit, audited acknowledgement.
  await expect(chief.getByText('Sur la plateforme')).toBeVisible();
  await expect(
    chief.getByRole('button', { name: 'Accepter la contribution' }),
  ).toBeDisabled();
  await chief
    .getByRole('button', { name: 'Je poursuis sans contrôle externe' })
    .click();
  await chief.getByRole('button', { name: 'Accepter la contribution' }).click();
  await chief.getByRole('button', { name: 'Accepter', exact: true }).click();
  await expect(chief.getByText('En préparation').first()).toBeVisible();

  await author.reload();
  await expect(
    author.getByText('Votre contribution est acceptée'),
  ).toBeVisible();

  // --- Production: copy-editing, proof, approval -----------------------------
  await chief.reload();
  await expect(
    chief.getByRole('heading', { name: 'Préparation et parution' }),
  ).toBeVisible();
  const text = chief.getByLabel('Texte de la contribution');
  await text.fill(
    `${await text.inputValue()}\n\nPhrase ajoutée à la relecture.`,
  );
  await chief
    .getByRole('button', { name: 'Enregistrer la préparation' })
    .click();
  await expect(chief.getByText('Préparation enregistrée.')).toBeVisible();
  // The text changed: a proof is compulsory, "ready without proof" is closed.
  await expect(
    chief.getByRole('button', { name: 'Prêt à publier, sans épreuve' }),
  ).toBeDisabled();
  await chief
    .getByRole('button', { name: 'Envoyer l’épreuve à l’auteur·rice' })
    .click();
  await expect(
    chief
      .getByText('En attente du bon à tirer')
      .or(chief.getByText(/Épreuve envoyée : l’auteur·rice a jusqu’au/)),
  ).toBeVisible();

  await author.reload();
  await expect(
    author.getByRole('heading', { name: 'Épreuve à valider' }),
  ).toBeVisible();
  await attendreAucuneViolationGrave(author, 'épreuve KOHOP');
  await author
    .getByRole('button', { name: 'Bon à tirer : j’approuve' })
    .click();
  await author.getByRole('button', { name: 'Approuver', exact: true }).click();
  await expect(author.getByText('Le texte est prêt')).toBeVisible();

  // --- Publication, then the public page ---------------------------------------
  await chief.reload();
  const publishNow = chief.getByRole('button', { name: 'Publier maintenant' });
  // The last internal originality check runs on the text to publish first.
  await expect(publishNow).toBeEnabled({ timeout: 30_000 });
  await attendreAucuneViolationGrave(chief, 'parution KOHOP du chef de revue');
  await publishNow.click();
  await chief.getByRole('button', { name: 'Publier', exact: true }).click();
  const pageLink = chief.getByRole('link', { name: 'Voir la page publique' });
  await expect(pageLink).toBeVisible();
  const href = await pageLink.getAttribute('href');
  expect(href).toMatch(/\/kohop\/.+/);

  const reader = await browser.newContext({ locale: 'fr-FR' });
  const visitor = await reader.newPage();
  await visitor.goto('/fr/kohop');
  await expect(
    visitor.getByRole('heading', { level: 1, name: /KOHOP/ }),
  ).toBeVisible();
  await visitor.getByRole('link', { name: new RegExp(title) }).click();
  await expect(
    visitor.getByRole('heading', { level: 1, name: title }),
  ).toBeVisible();
  await expect(
    visitor.getByRole('heading', { name: 'Évaluation par les pairs' }),
  ).toBeVisible();
  await expect(visitor.getByText('Analyse de Rémi Relecteur')).toBeVisible();
  await expect(visitor.getByText('Analyse de Rita Relectrice')).toBeVisible();
  await expect(
    visitor.getByText('Merci pour ces lectures attentives'),
  ).toBeVisible();
  // Pilot access: readable, but closed to search engines.
  const served = await (await reader.request.get(visitor.url())).text();
  expect(served).toMatch(/<meta name="robots" content="noindex/);
  expect(served).toContain('name="citation_title"');
  expect(served).toContain('"@type":"ScholarlyArticle"');
  // Nothing private on the page.
  const html = await visitor.content();
  expect(html).not.toContain('Note réservée au chef de revue');
  expect(html).not.toContain('@democracytogether.test');
  await revealAll(visitor);
  await attendreAucuneViolationGrave(visitor, 'page publique KOHOP');
  await visitor.goto('/fr/kohop');
  await revealAll(visitor);
  await attendreAucuneViolationGrave(visitor, 'liste publique KOHOP');
  await reader.close();
});

test('un modérateur sans la fonction ne voit ni l’entrée, ni la file KOHOP', async ({
  browser,
}) => {
  const mod = await as(browser, 'kohopModerateur');
  await mod.goto('/fr/admin');
  await expect(mod.locator('a[href$="/admin/kohop"]')).toHaveCount(0);
  await mod.goto('/fr/admin/kohop');
  await expect(
    mod.getByText(/403|Accès refusé|autorisé/i).first(),
  ).toBeVisible();
});
