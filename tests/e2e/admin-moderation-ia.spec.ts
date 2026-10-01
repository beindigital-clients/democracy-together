import { test, expect, type Page } from '@playwright/test';
import { deleteTestPublications } from './_helpers';
import { SESSIONS } from './_sessions';
import { ouvrirPanneau } from './_panneau';
import { chooseOption } from './_fields';

test.use({ locale: 'fr-FR', storageState: SESSIONS.adminModerationIa.state });

// F-32 — AUTO-ACCEPTANCE OF SUBMISSIONS: the mechanism, exercised through the browser.
//
// The feature comes with four families of tests that go through no
// browser: the decision truth table, the Convex orchestration,
// the journeys through the public functions, and the screens mounted outside
// the application. They cover the DECISION. None covers the WIRING:
// is the settings screen served on a real route, does the administrator
// really write to it, does a submission made through the real form trigger the analysis,
// and does the queue reflect it. That is what the TESTING.md convention
// calls the second gate, and it is this file.
//
// THE PROPERTY THIS FILE HOLDS, and which is worth paying for a browser:
// nothing appears without a human as long as a human has not armed it. The last
// test checks it where it matters — in an UNAUTHENTICATED context, which is
// the only place from which one sees what the public sees.
//
// WHAT IS NOT HERE, AND WHY.
//
//  - THE REAL CALL TO THE GATEWAY. CI has no key, and a gate that
//    depends on a paid third party is not a gate. TESTING.md describes the three
//    manual levels, including `scripts/verifier-passerelle-ia.mjs`. The
//    assertions below are therefore chosen to hold IN BOTH
//    configurations — key set or not —, on the model of `news.spec.ts`;
//  - THE AUTO-PUBLISH MODE. Arming it on a shared deployment would make
//    the OTHER specs' submissions appear without review. What the mode
//    changes is already held by `convex/aiModeration.test.ts`, which can set it
//    with no consequence for anyone. Here we check that it ANNOUNCES itself;
//  - ROLE PARTITIONING. `admin-ecrans.spec.ts` already holds the route and
//    its minimal rank, with the session that goes with it.
//
// DEDICATED SESSION (see `_sessions.ts`): this file configures, submits, then re-reads.
// It holds its session from one end to the other.

const PANNEAU = '/fr/admin/moderation-ia';

// Marker carried by the title of the submission created here -> targeted cleanup of the
// shared dataset (this test writes a real publication).
const MARQUEUR = 'Auto-acceptation E2E';

// An unlikely criterion name: the rubric is shared, and a broad `getByText`
// would catch a criterion written by someone else.
const CRITERE = `Critère E2E ${Date.now()}`;

// The refresh token rotates on the first test: we rewrite the state so that
// the next one does not start again from a consumed token (same precaution as
// `admin-nav`, `admin-recherche`, `admin-contact` and `admin-confirmations`).
test.afterEach(async ({ context }) => {
  await context.storageState({ path: SESSIONS.adminModerationIa.state });
});

// PUT THE MECHANISM BACK AT REST. The settings are a singleton: leaving
// them on "Assistance" would have the following specs' submissions analyzed.
// This is harmless — assistance publishes nothing — but a spec does not leave
// the deployment in a state only it understands.
test.afterAll(async ({ browser }) => {
  const context = await browser.newContext({
    locale: 'fr-FR',
    storageState: SESSIONS.adminModerationIa.state,
  });
  try {
    const page = await context.newPage();
    await page.goto(PANNEAU);
    await chooseOption(page.getByLabel('Mode', { exact: true }), 'Désactivé');
    await page
      .getByRole('button', { name: 'Enregistrer les réglages' })
      .click();
    await expect(page.getByText(/Réglages enregistrés/)).toBeVisible();
  } finally {
    await context.close();
  }
  await deleteTestPublications(MARQUEUR);
});

function bareme(page: Page) {
  return page.getByRole('list', { name: "Barème d'acceptation" });
}

function journal(page: Page) {
  return page.getByRole('list', { name: "Journal des décisions de l'IA" });
}

test('le panneau dit son état avant de proposer de le régler (F-32)', async ({
  page,
}) => {
  await page.goto(PANNEAU);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Modération assistée par IA' }),
  ).toBeVisible();

  // THE KEY STATE, FIRST. The deployment decides the branch — a
  // CI preview has no key, a dev deployment may have one —,
  // and both wordings are written in the catalog, hence verifiable. What
  // we refuse is the third case: a screen that says nothing about its state.
  const etat = page.getByText(
    /Passerelle configurée|Aucune clé de passerelle n'est posée/,
  );
  await expect(etat).toBeVisible();
  const cleAbsente = (await etat.textContent())?.includes('Aucune clé');
  console.log(
    `[F-32] passerelle ${cleAbsente ? 'NON configurée' : 'configurée'} sur ce déploiement`,
  );

  // The three counters carry a NUMBER. A heading without a value is what
  // a missing aggregation renders, and it reads like a screen in working order.
  for (const compteur of [
    'Analyses',
    'Publiées automatiquement',
    'Renvoyées en file',
  ]) {
    const valeur = page
      .locator('dl > div')
      .filter({ hasText: compteur })
      .locator('dd');
    await expect(valeur, `compteur sans valeur : ${compteur}`).toHaveText(
      /^\d+$/,
    );
  }

  for (const section of [
    'Réglages',
    "Barème d'acceptation",
    'Socle de sécurité',
    "Banc d'essai",
    'Décisions récentes',
  ]) {
    await expect(
      page.getByRole('heading', { name: section }),
      `section manquante : ${section}`,
    ).toBeVisible();
  }

  // THE BASELINE IS SHOWN AND CANNOT BE DISARMED. That is the panel's promise: what
  // cannot be removed is visible, and no button claims to
  // remove it. A baseline rendered like the rubric would be the regression to catch.
  const socle = page.getByRole('list', { name: 'Socle de sécurité' });
  await expect(socle.getByRole('listitem').first()).toBeVisible();
  await expect(socle.getByRole('button')).toHaveCount(0);
});

test('un critère écrit ici survit au rechargement, et sa suppression aussi (F-32)', async ({
  page,
}) => {
  await page.goto(PANNEAU);

  // --- Create ----------------------------------------------------------------
  await page.getByRole('button', { name: 'Ajouter un critère' }).click();
  await page.getByLabel('Nom du critère').fill(CRITERE);
  await page
    .getByLabel('Énoncé soumis au modèle')
    .fill(
      'Le document cite-t-il ses sources de manière vérifiable ? (critère posé par un test end-to-end)',
    );
  await chooseOption(page.getByLabel('Sévérité'), 'Avertissement');
  await page.getByRole('button', { name: 'Créer le critère' }).click();

  const ligne = bareme(page).getByRole('listitem').filter({ hasText: CRITERE });
  await expect(ligne).toHaveCount(1);
  await expect(ligne.getByText('Avertissement')).toBeVisible();

  // THE RELOAD IS THE SUBJECT. Without it, the test cannot tell a
  // write accepted by the server from React state added to the list.
  await page.reload();
  await expect(
    bareme(page).getByRole('listitem').filter({ hasText: CRITERE }),
    "le critère n'a pas survécu au rechargement : l'écriture n'a pas porté",
  ).toHaveCount(1);

  // --- Delete -------------------------------------------------------------
  // The confirmation dialog is one of the three panels on which CI
  // saw a click with no effect (audit F-13): we go through the helper, which
  // re-clicks while it is closed and prints the number of attempts.
  const apres = bareme(page).getByRole('listitem').filter({ hasText: CRITERE });
  const dialogue = page.getByRole('dialog');
  await ouvrirPanneau(
    apres.getByRole('button', { name: 'Supprimer' }),
    dialogue,
    'confirmation de suppression du critère',
  );
  await expect(dialogue).toContainText(CRITERE);
  await dialogue.getByRole('button', { name: 'Supprimer' }).click();

  await expect(apres).toHaveCount(0);
  await page.reload();
  await expect(
    bareme(page).getByRole('listitem').filter({ hasText: CRITERE }),
    'le critère supprimé est revenu après rechargement',
  ).toHaveCount(0);
});

test('les réglages tiennent après rechargement, et l’auto-publication s’annonce (F-32)', async ({
  page,
}) => {
  await page.goto(PANNEAU);
  const mode = page.getByLabel('Mode', { exact: true });
  const avertissement = page.getByText(/sans qu'un humain les ait lus/);

  // THE WARNING IS CARRIED BY THE MODE, AT THE MOMENT IT IS CHOSEN — not
  // relegated to documentation. We read it on the real route, and WITHOUT
  // saving: arming auto-publish on a shared deployment would make
  // the other specs' submissions appear.
  await expect(avertissement).toHaveCount(0);
  await chooseOption(mode, 'Auto-publication');
  await expect(avertissement).toBeVisible();

  // And it disappears when stepping back down: it is a state, not decoration.
  await chooseOption(mode, 'Assistance');
  await expect(avertissement).toHaveCount(0);

  const seuil = page.getByLabel(/Confiance minimale pour publier/);
  await seuil.fill('90');
  await page.getByRole('button', { name: 'Enregistrer les réglages' }).click();
  await expect(page.getByText(/Réglages enregistrés/)).toBeVisible();

  await page.reload();
  await expect(page.getByLabel('Mode', { exact: true })).toHaveText(
    'Assistance',
  );
  await expect(page.getByLabel(/Confiance minimale pour publier/)).toHaveValue(
    '90',
  );
});

test('un dépôt analysé reste en file, et le public ne le voit pas (F-32)', async ({
  page,
  browser,
}) => {
  // The configuration file's default timeout is 45 s. This journey
  // saves settings, uploads a document, goes through three screens THEN
  // waits for a SCHEDULED analysis — waiting for the log alone can
  // consume 60. Raising it here is better than raising it for all the
  // specs, where it serves as a safeguard.
  test.setTimeout(150_000);

  const titre = `${MARQUEUR} ${Date.now()}`;

  // --- Arm the mechanism, in ASSISTANCE ------------------------------------
  // The previous test already set it, but a spec file is not read from
  // top to bottom when a single line fails: we set what this test depends on.
  await page.goto(PANNEAU);
  await chooseOption(page.getByLabel('Mode', { exact: true }), 'Assistance');
  await page.getByRole('button', { name: 'Enregistrer les réglages' }).click();
  await expect(page.getByText(/Réglages enregistrés/)).toBeVisible();

  // --- Submit through the REAL form ----------------------------------------
  // It is this form that triggers the analysis in production; a write
  // through the API would not prove that the trigger is wired.
  await page.goto('/fr/espace-membre/deposer');
  await page.getByLabel('Titre', { exact: true }).fill(titre);
  await page.getByLabel('Auteur·rice·s').fill('A. Membre E2E');
  await page
    .getByLabel('Résumé', { exact: true })
    .fill(
      'Note de vérification du dispositif d’auto-acceptation : ce dépôt doit rester en file humaine.',
    );
  await page.getByLabel('Document (PDF)').setInputFiles({
    name: 'auto-acceptation-e2e.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n% fichier de test E2E\n'),
  });
  await page.getByRole('button', { name: 'Soumettre pour relecture' }).click();
  await expect(
    page.getByRole('heading', { name: 'Soumission reçue' }),
  ).toBeVisible();

  // --- It is in the human queue -------------------------------------------
  await page.goto('/fr/admin/publications');
  const file = page.getByRole('list', {
    name: 'Liste des publications à modérer',
  });
  const fiche = file.getByRole('listitem').filter({ hasText: titre });
  await expect(
    fiche,
    'le dépôt ne figure pas dans la file de modération',
  ).toHaveCount(1);
  // And it does NOT carry the mention reserved for publications without a human.
  await expect(fiche.getByText('Publiée sans relecture humaine')).toHaveCount(
    0,
  );

  // --- The log reports the analysis -----------------------------------
  // The analysis is scheduled: it has not happened yet when the
  // form returns. `toPass` waits for the effect rather than a randomly chosen duration.
  //
  // THESE TWO LABELS HOLD IN BOTH CONFIGURATIONS. In assistance mode,
  // `decideApplication` returns `escalated` / `mode_assist` BEFORE looking at the
  // verdict: whether the gateway answered, failed or did not respond, the
  // row says the same thing. That is what makes this test playable in CI.
  await expect(async () => {
    await page.goto(PANNEAU);
    const entree = journal(page)
      .getByRole('listitem')
      .filter({ hasText: titre });
    await expect(entree).toHaveCount(1);
    await expect(entree.getByText('Renvoyée en file')).toBeVisible();
    await expect(entree).toContainText(
      'mode assistance : la décision est humaine',
    );
  }).toPass({ timeout: 60_000 });

  // --- WHAT THE PUBLIC SEES --------------------------------------------------
  // The only place from which one sees what the public sees: a context WITHOUT
  // a session. From the administrator's tab, a status leak
  // would look like a working screen.
  const anonyme = await browser.newContext({ locale: 'fr-FR' });
  try {
    const visiteur = await anonyme.newPage();
    await visiteur.goto(`/fr/recherche?q=${encodeURIComponent(titre)}`);
    // WE LOOK FOR THE RESULT, NOT THE TITLE. The search page ECHOES the
    // query in its own empty-state message — "Aucun résultat pour
    // « … »" —, so that a `getByText(titre)` finds an element in
    // BOTH cases: when the submission leaked, and when it is absent. First
    // CI campaign: the assertion landed on the very sentence that proved
    // the absence.
    //
    // A LINK carrying this title, on the other hand, only exists if the search returned an
    // entry: it is the only element whose presence means what we think.
    await expect(
      visiteur.getByRole('link', { name: titre, exact: false }),
      'un dépôt non relu par un humain est visible du public',
    ).toHaveCount(0);
    // And the empty state is stated for real: this message only shows when
    // the THREE sources — library, directory, news — have nothing.
    await expect(visiteur.getByText(/Aucun résultat pour/)).toBeVisible();
  } finally {
    await anonyme.close();
  }
});
