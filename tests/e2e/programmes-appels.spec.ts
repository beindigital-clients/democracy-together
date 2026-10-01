import { test, expect, type Browser } from '@playwright/test';
import { resetProgrammes } from './_helpers';
import { SESSIONS, type SessionKey } from './_sessions';
import { chooseOption } from './_fields';

// F-60 — Calls for projects, end to end: a moderator publishes a dated
// call and assigns a reviewer; a member applies with an attachment;
// the reviewer scores; the moderator selects; the applicant is notified;
// the moderator puts the selection back under review, and the applicant is
// notified of that too.
//
// Three people, three sessions DEDICATED to this file (see _sessions.ts):
// each is held from start to finish, and its state is rewritten at the end of its
// pass — the refresh token rotates on each opening.
test.use({ locale: 'fr-FR' });

// STABLE marker: `resetProgrammes` deletes the calls from previous
// runs (their title carries it), and the screen does not fill up with test runs.
const MARKER = '[E2E-prog-appels]';

async function as(browser: Browser, key: SessionKey) {
  const context = await browser.newContext({
    storageState: SESSIONS[key].state,
    locale: 'fr-FR',
  });
  const page = await context.newPage();
  return {
    page,
    done: async () => {
      await context.storageState({ path: SESSIONS[key].state });
      await context.close();
    },
  };
}

// `datetime-local` expects the WALL-CLOCK time of the chosen time zone; the call is entered
// in UTC, so the truncated ISO string works.
const wall = (ms: number) => new Date(ms).toISOString().slice(0, 16);

test.describe
  .serial('appel à projets : publication → candidature → évaluation → décision', () => {
  test.beforeAll(async () => {
    await resetProgrammes(
      [SESSIONS.progAppelsMembre.email, SESSIONS.progAppelsEvaluateur.email],
      MARKER,
    );
  });

  test('parcours complet', async ({ browser }) => {
    // Seven passes, five browser contexts: the reopening added two.
    test.setTimeout(240_000);
    const stamp = Date.now();
    const callTitle = `${MARKER} Fonds participation ${stamp}`;
    const projectTitle = `Observatoire citoyen ${stamp}`;

    // 1. The moderator drafts, publishes, assigns the reviewer.
    const admin = await as(browser, 'progAppelsAdmin');
    await admin.page.goto('/fr/admin/projets/appels');
    await admin.page.getByRole('button', { name: 'Nouvel appel' }).click();
    await admin.page.getByLabel('Titre de l’appel').fill(callTitle);
    await admin.page
      .getByLabel('Présentation de l’appel')
      .fill('Soutenir des projets de recherche-action sur la participation.');
    await chooseOption(admin.page.getByLabel('Fuseau de référence'), 'UTC');
    await admin.page.getByLabel('Montant du fonds').fill('10000');
    await admin.page.getByLabel('Devise').fill('EUR');
    await admin.page.getByLabel('Ouverture').fill(wall(Date.now() - 3_600_000));
    await admin.page
      .getByLabel('Clôture')
      .fill(wall(Date.now() + 7 * 24 * 3_600_000));
    await admin.page.getByLabel('Critère 1').fill('Pertinence');
    await admin.page.getByLabel('Pièce 1').fill('Budget');
    await admin.page
      .getByRole('button', { name: 'Enregistrer l’appel' })
      .click();

    const row = admin.page.getByRole('listitem').filter({ hasText: callTitle });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Publier', exact: true }).click();
    await expect(row.getByText('Publié', { exact: true })).toBeVisible();
    await row.getByRole('button', { name: 'Évaluateurs' }).click();
    await row
      .getByLabel('Adresse de l’évaluateur')
      .fill(SESSIONS.progAppelsEvaluateur.email);
    await row.getByRole('button', { name: 'Désigner' }).click();
    await expect(
      row.getByText(SESSIONS.progAppelsEvaluateur.email).first(),
    ).toBeVisible();
    await admin.done();

    // 2. The member finds the open call and submits a complete application.
    const membre = await as(browser, 'progAppelsMembre');
    await membre.page.goto('/fr/appels-a-projets');
    await membre.page.getByRole('link', { name: callTitle }).click();
    await expect(
      membre.page.getByRole('heading', { level: 1, name: callTitle }),
    ).toBeVisible();
    await membre.page.getByRole('link', { name: 'Candidater' }).click();
    await membre.page.getByLabel('Titre du projet').fill(projectTitle);
    await membre.page
      .getByLabel('Résumé')
      .fill('Un observatoire citoyen du budget local, ouvert et documenté.');
    await membre.page
      .getByRole('button', { name: 'Enregistrer le brouillon' })
      .click();
    await expect(membre.page.getByText('Brouillon enregistré.')).toBeVisible();
    await membre.page.getByLabel('Choisir un fichier').setInputFiles({
      name: 'budget.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n% budget E2E\n%%EOF\n'),
    });
    await expect(membre.page.getByText(/budget\.pdf/)).toBeVisible();
    await membre.page
      .getByRole('button', { name: 'Déposer mon dossier' })
      .click();
    await expect(
      membre.page.getByText('Déposé', { exact: true }),
    ).toBeVisible();
    await membre.done();

    // 3. The assigned reviewer scores the application from their member area.
    const evaluateur = await as(browser, 'progAppelsEvaluateur');
    await evaluateur.page.goto('/fr/espace-membre/evaluations');
    const dossier = evaluateur.page
      .getByRole('listitem')
      .filter({ hasText: projectTitle });
    await expect(dossier).toBeVisible();
    await chooseOption(dossier.getByLabel('Pertinence (poids 1)'), '4 / 5');
    await dossier.getByRole('button', { name: 'Enregistrer ma note' }).click();
    await expect(dossier.getByText('Note enregistrée.')).toBeVisible();
    await evaluateur.done();

    // 4. The moderator reads the ranking and selects.
    const admin2 = await as(browser, 'progAppelsAdmin');
    await admin2.page.goto('/fr/admin/projets/appels');
    const row2 = admin2.page
      .getByRole('listitem')
      .filter({ hasText: callTitle })
      .first();
    await row2.getByRole('button', { name: 'Classement et décisions' }).click();
    const ranked = row2.getByRole('listitem').filter({ hasText: projectTitle });
    await expect(ranked.getByText(/moyenne 80 \/ 100/)).toBeVisible();
    await ranked.getByRole('button', { name: 'Sélectionner' }).click();
    await admin2.page
      .getByRole('dialog')
      .getByRole('button', { name: 'Sélectionner' })
      .click();
    await expect(
      ranked.getByText('Sélectionné', { exact: true }),
    ).toBeVisible();
    await admin2.done();

    // 5. The applicant is notified and sees the decision in their area.
    const membre2 = await as(browser, 'progAppelsMembre');
    await membre2.page.goto('/fr/notifications');
    await expect(
      membre2.page.getByText(
        `Appel « ${callTitle} » : votre projet est sélectionné.`,
      ),
    ).toBeVisible();
    await membre2.page.goto('/fr/espace-membre/projets');
    await expect(
      membre2.page
        .getByRole('listitem')
        .filter({ hasText: projectTitle })
        .getByText('Sélectionné', { exact: true }),
    ).toBeVisible();
    await membre2.done();

    // 6. The moderator goes back on the selection (issue #9): the project is
    // put back under review, through a confirmation that names it, and the
    // ranking keeps the previous decision in sight.
    const admin3 = await as(browser, 'progAppelsAdmin');
    await admin3.page.goto('/fr/admin/projets/appels');
    const row3 = admin3.page
      .getByRole('listitem')
      .filter({ hasText: callTitle })
      .first();
    await row3.getByRole('button', { name: 'Classement et décisions' }).click();
    const reconsidered = row3
      .getByRole('listitem')
      .filter({ hasText: projectTitle });
    await reconsidered
      .getByRole('button', { name: 'Remettre en étude' })
      .click();
    await admin3.page
      .getByRole('dialog', {
        name: `Remettre en étude « ${projectTitle} » ?`,
      })
      .getByRole('button', { name: 'Remettre en étude' })
      .click();
    await expect(
      reconsidered.getByText('Déposé', { exact: true }),
    ).toBeVisible();
    await expect(
      reconsidered.getByText(/il avait été sélectionné\.$/),
    ).toBeVisible();
    await admin3.done();

    // 7. The applicant hears of it, and their area no longer shows a selection.
    const membre3 = await as(browser, 'progAppelsMembre');
    await membre3.page.goto('/fr/notifications');
    await expect(
      membre3.page.getByText(
        `Appel « ${callTitle} » : votre dossier est de nouveau à l’étude.`,
      ),
    ).toBeVisible();
    await membre3.page.goto('/fr/espace-membre/projets');
    await expect(
      membre3.page
        .getByRole('listitem')
        .filter({ hasText: projectTitle })
        .getByText('Déposé', { exact: true }),
    ).toBeVisible();
    await membre3.done();
  });
});
