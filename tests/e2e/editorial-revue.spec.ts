import {
  test,
  expect,
  type Browser,
  type Locator,
  type Page,
} from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { deleteTestPublications } from './_helpers';
import { SESSIONS, type SessionKey } from './_sessions';
import { chooseOption } from './_fields';

// F-43 — Peer-reviewed journal, full DOUBLE-BLIND flow:
// manuscript submitted → two reviewers (conflict of interest declared, reviews) →
// revision requested (reason) → new version with response letter →
// new round → accepted, and published in the library.
//
// Four people, four contexts: the author (member), the editor, two
// moderator-rank reviewers. The state machine, the refusals and the
// data-level double blind are covered by convex/peerReview.test.ts;
// this file checks that the interface actually supports the flow, and that
// the reviewer's screen does not show the author.

test.use({ locale: 'fr-FR' });

const MARKER = 'Manuscrit E2E comite';

test.afterAll(async () => {
  await deleteTestPublications(MARKER);
});

async function as(browser: Browser, key: SessionKey): Promise<Page> {
  const context = await browser.newContext({
    storageState: SESSIONS[key].state,
    locale: 'fr-FR',
  });
  return await context.newPage();
}

// A PDF that NAMES its author in its metadata — the real case that
// anonymization must handle.
async function manuscriptPdf(label: string): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([400, 400]).drawText(`Manuscrit anonyme ${label}`, {
    x: 40,
    y: 300,
    size: 14,
  });
  doc.setAuthor(SESSIONS.editorialAuteur.email);
  return Buffer.from(await doc.save());
}

function card(page: Page, title: string): Locator {
  return page.getByRole('listitem').filter({ hasText: title }).first();
}

async function review(
  page: Page,
  title: string,
  recommendation: string,
  comment: string,
  declare = true,
) {
  await page.goto('/fr/admin/mes-relectures');
  const item = card(page, title);
  await expect(item).toBeVisible();
  // Double blind: nothing on the reviewer's screen names the author.
  await expect(page.getByText(SESSIONS.editorialAuteur.email)).toHaveCount(0);
  await item.getByRole('button', { name: 'Ouvrir le manuscrit' }).click();
  if (declare) {
    await item.getByLabel("Je n'ai aucun conflit d'intérêts").check();
    await item
      .getByRole('button', { name: 'Enregistrer ma déclaration' })
      .click();
  }
  await expect(
    item.getByRole('link', { name: /Télécharger le manuscrit anonymisé/ }),
  ).toBeVisible({ timeout: 30_000 });
  await chooseOption(item.getByLabel('Recommandation'), recommendation);
  await item
    .getByLabel("Avis argumenté (transmis anonymement à l'auteur)")
    .fill(comment);
  await item.getByRole('button', { name: "Déposer l'avis" }).click();
  await expect(item.getByText('Avis rendu.')).toBeVisible();
}

async function assign(editor: Page, title: string, reviewer: SessionKey) {
  const item = card(editor, title);
  await chooseOption(
    item.getByLabel('Assigner un relecteur'),
    SESSIONS[reviewer].email,
  );
  await item.getByRole('button', { name: 'Assigner', exact: true }).click();
  // The reviewer's row, in the manuscript's reviewer list.
  await expect(
    item.getByRole('listitem').filter({ hasText: SESSIONS[reviewer].email }),
  ).toBeVisible();
}

async function decide(
  editor: Page,
  title: string,
  decision: string,
  reason: string,
) {
  const item = card(editor, title);
  await chooseOption(item.getByLabel('Décision', { exact: true }), decision);
  await item.getByLabel("Motif, transmis à l'auteur").fill(reason);
  await item.getByRole('button', { name: 'Rendre la décision' }).click();
}

test('F-43 : soumis → deux relecteurs → révision demandée → v2 → accepté', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const title = `${MARKER} ${Date.now()}`;

  // --- The author uploads, then submits to the committee -------------------
  const author = await as(browser, 'editorialAuteur');
  await author.goto('/fr/espace-membre/deposer');
  await author.getByLabel('Titre', { exact: true }).fill(title);
  await author.getByLabel('Auteur·rice·s').fill('Autrice E2E');
  await author
    .getByLabel('Résumé', { exact: true })
    .fill('Une comparaison des dispositifs de participation citoyenne locale.');
  await author.getByLabel('Document (PDF)').setInputFiles({
    name: 'autrice-e2e-v1.pdf',
    mimeType: 'application/pdf',
    buffer: await manuscriptPdf('v1'),
  });
  await author
    .getByRole('button', { name: 'Soumettre pour relecture' })
    .click();
  await expect(
    author.getByRole('heading', { name: 'Soumission reçue' }),
  ).toBeVisible();

  await author.goto('/fr/espace-membre');
  // The member-area navigation names the author's screen as the screen
  // itself does.
  // F-43's entries left the navigation when KOHOP opened (D-13); the screen
  // itself is kept and reached by its address.
  await author.goto('/fr/espace-membre/manuscrits');
  await expect(author).toHaveURL(/\/espace-membre\/manuscrits$/);
  await card(author, title)
    .getByRole('button', { name: 'Soumettre au comité de lecture' })
    .click();
  const mine = author
    .getByRole('region', { name: 'Manuscrits en revue' })
    .getByRole('listitem')
    .filter({ hasText: title });
  await expect(mine.getByText('Soumis', { exact: true })).toBeVisible();

  // --- The editor assigns two reviewers -------------------------------------
  const editor = await as(browser, 'editorialEditeur');
  await editor.goto('/fr/admin/revue');
  await expect(card(editor, title)).toBeVisible();
  // The editor, for their part, sees the author.
  await expect(
    card(editor, title).getByText(SESSIONS.editorialAuteur.email, {
      exact: false,
    }),
  ).toBeVisible();
  await assign(editor, title, 'editorialRelecteur1');
  await assign(editor, title, 'editorialRelecteur2');
  await expect(card(editor, title).getByText('En évaluation')).toBeVisible();

  // --- Both reviewers declare no conflict, then review ----------------------
  const r1 = await as(browser, 'editorialRelecteur1');
  await review(
    r1,
    title,
    'Modifications majeures',
    'La méthode de sélection des cas doit être explicitée.',
  );
  const r2 = await as(browser, 'editorialRelecteur2');
  await review(
    r2,
    title,
    'Modifications mineures',
    'Quelques références récentes manquent en section 3.',
  );

  // --- Revision requested, with a reason ------------------------------------
  await editor.reload();
  await decide(
    editor,
    title,
    'Révision demandée',
    'Les deux avis convergent : la méthode de sélection doit être explicitée.',
  );
  await expect(
    card(editor, title).getByText('Révision demandée').first(),
  ).toBeVisible();

  // --- The author sees the decision, the numbered reviews, and revises ------
  await author.reload();
  await expect(mine.getByText('Révision demandée').first()).toBeVisible();
  await expect(mine.getByText('Relecteur 1 ·', { exact: false })).toBeVisible();
  // Double blind: not a single reviewer name.
  await expect(mine.getByText(SESSIONS.editorialRelecteur1.email)).toHaveCount(
    0,
  );
  await mine.getByLabel('Nouvelle version (PDF)').setInputFiles({
    name: 'autrice-e2e-v2.pdf',
    mimeType: 'application/pdf',
    buffer: await manuscriptPdf('v2'),
  });
  await mine
    .getByLabel('Lettre de réponse aux relecteurs')
    .fill(
      'Merci : la méthode de sélection des cas est détaillée en section 2.',
    );
  await mine.getByRole('button', { name: 'Déposer la révision' }).click();
  // The "Version 2 déposée" notice is brief: the card redraws immediately
  // (reactive query, "re-soumis" step). We check the DURABLE state: v2
  // listed with its response letter, and the step shown to the author.
  await expect(
    mine.getByRole('listitem').filter({ hasText: /^v2 —.*lettre de réponse/ }),
  ).toBeVisible();
  await expect(
    mine.getByText("Votre révision est déposée : l'éditeur l'examine."),
  ).toBeVisible();

  // --- New round: reviewer 1 reviews v2 -------------------------------------
  await editor.reload();
  await expect(card(editor, title).getByText('Re-soumis')).toBeVisible();
  await assign(editor, title, 'editorialRelecteur1');
  await r1.goto('/fr/admin/mes-relectures');
  await card(r1, title)
    .getByRole('button', { name: 'Ouvrir le manuscrit' })
    .click();
  // They see what changed and the response letter.
  await expect(
    card(r1, title).getByText('Ce qui a changé de la v1 à la v2'),
  ).toBeVisible();
  await expect(
    card(r1, title).getByText('la méthode de sélection des cas est détaillée', {
      exact: false,
    }),
  ).toBeVisible();
  // Their conflict declaration still holds: they review directly.
  await review(
    r1,
    title,
    'Accepter',
    'Les corrections répondent aux remarques du premier tour.',
    false,
  );

  // --- Acceptance: publication in the library -------------------------------
  await editor.reload();
  await decide(
    editor,
    title,
    'Accepté',
    'La méthode est désormais claire ; le texte peut être publié.',
  );
  await author.reload();
  await expect(mine.getByText('Accepté').first()).toBeVisible();
  await mine.getByRole('link', { name: 'Ouvrir' }).click();
  await expect(author.getByRole('heading', { level: 1 })).toContainText(title);
});
