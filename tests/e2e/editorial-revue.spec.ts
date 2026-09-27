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

// F-43 — Revue à comité de lecture, parcours complet en DOUBLE AVEUGLE :
// manuscrit soumis → deux relecteurs (conflit d'intérêts déclaré, avis) →
// révision demandée (motif) → nouvelle version avec lettre de réponse →
// nouveau tour → accepté, et publié dans la bibliothèque.
//
// Quatre personnes, quatre contextes : l'autrice (membre), l'éditeur, deux
// relecteurs de rang modérateur. La machine à états, les refus et le double
// aveugle au niveau des données sont tenus par convex/peerReview.test.ts ;
// ce fichier vérifie que l'interface permet réellement le parcours, et que
// l'écran du relecteur ne montre pas l'autrice.

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

// Un PDF qui NOMME son autrice dans ses métadonnées — le cas réel que
// l'anonymisation doit traiter.
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
  // Double aveugle : rien, sur l'écran du relecteur, ne nomme l'autrice.
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
  await item
    .getByLabel('Recommandation')
    .selectOption({ label: recommendation });
  await item
    .getByLabel("Avis argumenté (transmis anonymement à l'auteur)")
    .fill(comment);
  await item.getByRole('button', { name: "Déposer l'avis" }).click();
  await expect(item.getByText('Avis rendu.')).toBeVisible();
}

async function assign(editor: Page, title: string, reviewer: SessionKey) {
  const item = card(editor, title);
  await item
    .getByLabel('Assigner un relecteur')
    .selectOption({ label: SESSIONS[reviewer].email });
  await item.getByRole('button', { name: 'Assigner', exact: true }).click();
  // La ligne du relecteur, dans la liste des relecteurs du manuscrit.
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
  await item
    .getByLabel('Décision', { exact: true })
    .selectOption({ label: decision });
  await item.getByLabel("Motif, transmis à l'auteur").fill(reason);
  await item.getByRole('button', { name: 'Rendre la décision' }).click();
}

test('F-43 : soumis → deux relecteurs → révision demandée → v2 → accepté', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const title = `${MARKER} ${Date.now()}`;

  // --- L'autrice dépose puis soumet au comité -------------------------------
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
  await author
    .getByRole('link', { name: 'Mes manuscrits (comité de lecture)' })
    .click();
  await expect(author).toHaveURL(/\/espace-membre\/manuscrits$/);
  await card(author, title)
    .getByRole('button', { name: 'Soumettre au comité de lecture' })
    .click();
  const mine = author
    .getByRole('region', { name: 'Manuscrits en revue' })
    .getByRole('listitem')
    .filter({ hasText: title });
  await expect(mine.getByText('Soumis', { exact: true })).toBeVisible();

  // --- L'éditeur désigne deux relecteurs ------------------------------------
  const editor = await as(browser, 'editorialEditeur');
  await editor.goto('/fr/admin/revue');
  await expect(card(editor, title)).toBeVisible();
  // L'éditeur, lui, voit l'autrice.
  await expect(
    card(editor, title).getByText(SESSIONS.editorialAuteur.email, {
      exact: false,
    }),
  ).toBeVisible();
  await assign(editor, title, 'editorialRelecteur1');
  await assign(editor, title, 'editorialRelecteur2');
  await expect(card(editor, title).getByText('En évaluation')).toBeVisible();

  // --- Les deux relecteurs déclarent l'absence de conflit, puis évaluent ----
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

  // --- Révision demandée, motivée -------------------------------------------
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

  // --- L'autrice voit la décision, les avis numérotés, et révise -------------
  await author.reload();
  await expect(mine.getByText('Révision demandée').first()).toBeVisible();
  await expect(mine.getByText('Relecteur 1 ·', { exact: false })).toBeVisible();
  // Double aveugle : pas un nom de relecteur.
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
  // L'avis « Version 2 déposée » est bref : la carte se redessine aussitôt
  // (requête réactive, étape « re-soumis »). On vérifie l'état DURABLE : la
  // v2 listée avec sa lettre de réponse, et l'étape annoncée à l'autrice.
  await expect(
    mine.getByRole('listitem').filter({ hasText: /^v2 —.*lettre de réponse/ }),
  ).toBeVisible();
  await expect(
    mine.getByText("Votre révision est déposée : l'éditeur l'examine."),
  ).toBeVisible();

  // --- Nouveau tour : le relecteur 1 évalue la v2 ----------------------------
  await editor.reload();
  await expect(card(editor, title).getByText('Re-soumis')).toBeVisible();
  await assign(editor, title, 'editorialRelecteur1');
  await r1.goto('/fr/admin/mes-relectures');
  await card(r1, title)
    .getByRole('button', { name: 'Ouvrir le manuscrit' })
    .click();
  // Il voit ce qui a changé et la lettre de réponse.
  await expect(
    card(r1, title).getByText('Ce qui a changé de la v1 à la v2'),
  ).toBeVisible();
  await expect(
    card(r1, title).getByText('la méthode de sélection des cas est détaillée', {
      exact: false,
    }),
  ).toBeVisible();
  // Sa déclaration de conflit vaut toujours : il évalue directement.
  await review(
    r1,
    title,
    'Accepter',
    'Les corrections répondent aux remarques du premier tour.',
    false,
  );

  // --- Acceptation : publication dans la bibliothèque ------------------------
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
