import { test, expect } from '@playwright/test';
import {
  submitApplication,
  provisionUser,
  deleteTestPublications,
  chercherUtilisateur,
  approveTribunePosts,
} from './_helpers';
import { SESSIONS } from './_sessions';
import { chooseOption } from './_fields';

// SAFEGUARD for the back office's irreversible actions (issue #38).
//
// The four destructive actions — rejecting an application, rejecting a
// publication, removing content from the Tribune, changing a role — fired on the
// FIRST CLICK. What these journeys pin down is therefore not "the action
// works" (that is the subject of `admin.spec`, `library-submit.spec` and
// `admin-moderation.spec`) but the three properties of the safeguard:
//
//   1. the dialog opens and NAMES its target — not a generic "Confirm?";
//   2. as long as it is not confirmed, NOTHING has been sent (Escape, cancel, and
//      for the role: a mere choice in the dropdown);
//   3. the completed action produces VISIBLE feedback, where the screen used to stay silent.
//
// DEDICATED SESSION (and not one of the per-role sessions): two of these journeys
// write the data then moderate it, hence hold a session from end to
// end. By joining the shared accounts, this file brought down
// `admin-moderation` then `admin.spec` onto the sign-in screen — two
// contexts on the same refresh token cannot coexist
// (see `_sessions.ts`). The account has administrator rank: since the
// back-office guards are hierarchical, it submits like a member and decides like
// a moderator.
test.use({
  locale: 'fr-FR',
  storageState: SESSIONS.confirmations.state,
});

// THE REFRESH TOKEN ROTATES — IT MUST BE REWRITTEN. Each test starts
// from a NEW context reloaded from the same state file. But the first one that
// uses it rotates the token (Convex Auth renews and invalidates it):
// the following ones therefore start again from an already consumed token. As long as the
// tolerance window is not exceeded, it works; beyond it, Convex Auth sees a
// replay and cuts the session — the test wakes up on /connexion in the middle of
// its journey (the mechanism is described in `_sessions.ts`, for the case of
// two FILES on the same account; it applies just as much to two TESTS of the
// same file, only later).
//
// This file is the most exposed: four back-office journeys in a row,
// so the fourth starts long after the session was opened. It
// landed twice in a row on the sign-in screen (PR #79), always the
// last one, while the first three passed.
//
// So we rewrite the state AFTER EACH TEST: the next one starts from the current
// token, never from a stale one. The file's dedicated session
// (see `_sessions.ts`) makes the write safe — no other file reads or
// writes this state file during the run.
test.afterEach(async ({ context }) => {
  await context.storageState({ path: SESSIONS.confirmations.state });
});

// Marker of the publications created here -> targeted cleanup of the shared
// dataset (like `library-submit.spec.ts`).
const PUB_MARKER = 'Rejet confirmé E2E';

test.afterAll(async () => {
  await deleteTestPublications(PUB_MARKER);
});

test('rejeter une candidature : confirmation nommant l’organisation, Échap annule (issue #38)', async ({
  page,
}) => {
  const stamp = Date.now();
  const appOrg = `Institut Démo Sahel E2E ${stamp}`;

  await submitApplication({
    type: 'individu',
    organizationName: appOrg,
    contactEmail: `e2e_conf_cand_${stamp}@democracytogether.test`,
    country: 'Sénégal',
  });

  await page.goto('/fr/admin/candidatures');
  const row = page.getByRole('listitem').filter({ hasText: appOrg });
  await expect(row).toBeVisible();

  // 1. The dialog NAMES the targeted application.
  await row.getByRole('button', { name: 'Rejeter', exact: true }).click();
  const dialog = page.getByRole('dialog', {
    name: `Rejeter la candidature « ${appOrg} » ?`,
  });
  await expect(dialog).toBeVisible();

  // 2. Escape closes without deciding anything — the application is still pending
  // (what matters: since the state machine #9, a rejection cannot be replayed).
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(row).toBeVisible();
  await expect(row.getByText('En attente')).toBeVisible();

  // 3. Once confirmed, the action goes through — and the screen SAYS so.
  await row.getByRole('button', { name: 'Rejeter', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Rejeter la candidature' })
    .click();
  await expect(page.getByRole('status')).toContainText(
    `Candidature « ${appOrg} » rejetée.`,
  );
  await expect(row).toHaveCount(0);

  await page.getByRole('button', { name: 'Toutes' }).click();
  const decided = page.getByRole('listitem').filter({ hasText: appOrg });
  await expect(decided.getByText('Rejetée')).toBeVisible();
});

// GOING BACK ON A DECISION (issue #9) — the rejection dialog above used to
// call it final. A rejection is rescued in one click (nothing to take back),
// and an approval is put back under review through a confirmation that says
// what the server withdraws: the `membre` role the approval gave.
test('revenir sur une décision d’adhésion : un refus repêché, une approbation remise en étude (issue #9)', async ({
  page,
}) => {
  const stamp = Date.now();
  const appOrg = `Institut Repêché E2E ${stamp}`;
  const contactEmail = `e2e_conf_reprise_${stamp}@democracytogether.test`;

  await submitApplication({
    type: 'individu',
    organizationName: appOrg,
    contactEmail,
    country: 'Sénégal',
  });

  await page.goto('/fr/admin/candidatures');
  // Rows are looked up IN the queue: the confirmation below is a list too.
  const queue = page.getByRole('list', { name: 'Liste des candidatures' });
  const pendingRow = queue.getByRole('listitem').filter({ hasText: appOrg });
  await pendingRow
    .getByRole('button', { name: 'Rejeter', exact: true })
    .click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Rejeter la candidature' })
    .click();
  await expect(pendingRow).toHaveCount(0);

  await page.getByRole('button', { name: 'Toutes' }).click();
  const row = queue.getByRole('listitem').filter({ hasText: appOrg });
  await expect(row.getByText('Rejetée')).toBeVisible();

  // 1. Rescued: back in the queue at once, the previous decision in sight.
  await row.getByRole('button', { name: 'Remettre en étude' }).click();
  await expect(page.getByRole('status')).toContainText(
    `Candidature « ${appOrg} » remise en étude.`,
  );
  await expect(row.getByText('En attente')).toBeVisible();
  await expect(row.getByText(/elle avait été rejetée\.$/)).toBeVisible();

  // 2. Decided again — approved, like a first time.
  await row.getByRole('button', { name: 'Approuver' }).click();
  await expect(page.getByRole('status')).toContainText(
    `Candidature « ${appOrg} » approuvée.`,
  );
  await expect(row.getByText('Approuvée', { exact: true })).toBeVisible();

  // 3. Put back under review: the confirmation names what is taken back, and
  // nothing moves before it is confirmed.
  await row.getByRole('button', { name: 'Remettre en étude' }).click();
  const dialog = page.getByRole('dialog', {
    name: `Remettre en étude la candidature « ${appOrg} » ?`,
  });
  await expect(dialog).toContainText(
    `le compte ${contactEmail} perd son rôle de membre`,
  );
  await expect(dialog).toContainText(
    `Le compte ${contactEmail} est prévenu que la candidature est de nouveau à l’étude`,
  );
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(row.getByText('Approuvée', { exact: true })).toBeVisible();

  await row.getByRole('button', { name: 'Remettre en étude' }).click();
  await dialog.getByRole('button', { name: 'Remettre en étude' }).click();
  await expect(page.getByRole('status')).toContainText(
    'Son compte n’a plus le rôle de membre.',
  );
  await expect(page.getByRole('status')).toContainText(
    'Le candidat en est prévenu dans son espace.',
  );
  await expect(row.getByText('En attente')).toBeVisible();
  await expect(row.getByText(/elle avait été approuvée\.$/)).toBeVisible();
});

test('rejeter une publication : confirmation nommant le titre, annulation sans effet (issue #38)', async ({
  page,
}) => {
  const title = `${PUB_MARKER} ${Date.now()}`;

  // The publication to reject must exist: we submit it through the real path.
  await page.goto('/fr/espace-membre/deposer');
  await page.getByLabel('Titre', { exact: true }).fill(title);
  await page.getByLabel('Auteur·rice·s').fill('A. Membre E2E');
  await page
    .getByLabel('Résumé', { exact: true })
    .fill(
      'Un dépôt de test destiné à être rejeté depuis la file de modération.',
    );
  await page.getByRole('button', { name: 'Soumettre pour relecture' }).click();
  await expect(
    page.getByRole('heading', { name: 'Soumission reçue' }),
  ).toBeVisible();

  await page.goto('/fr/admin/publications');
  const row = page.getByRole('listitem').filter({ hasText: title });
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: 'Rejeter', exact: true }).click();
  const dialog = page.getByRole('dialog', {
    name: `Rejeter la publication « ${title} » ?`,
  });
  await expect(dialog).toBeVisible();

  // Cancel leaves the publication in the pending queue.
  await dialog.getByRole('button', { name: 'Annuler' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row.getByText('En attente')).toBeVisible();

  await row.getByRole('button', { name: 'Rejeter', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Rejeter la publication' })
    .click();
  await expect(page.getByRole('status')).toContainText(
    `Publication « ${title} » rejetée.`,
  );
  await expect(row).toHaveCount(0);
});

test('retirer un contenu signalé : confirmation nommant la cible (issue #38)', async ({
  page,
}) => {
  const postTitle = `Prise de parole à retirer E2E ${Date.now()}`;

  // Content published, then reported (any authenticated account can report).
  // PRE-moderation (F-45): the submitted post awaits approval before
  // being public — we give it, then find it again in the feed.
  await page.goto('/fr/tribune');
  await page.getByRole('button', { name: 'Prendre la parole' }).click();
  const composer = page
    .locator('form')
    .filter({ hasText: 'Votre prise de parole' });
  await composer.getByLabel('Titre', { exact: true }).fill(postTitle);
  await composer
    .getByLabel('Votre texte')
    .fill(
      'Un court billet de test E2E destiné à être retiré par la modération.',
    );
  await composer
    .getByRole('button', { name: 'Soumettre à la modération' })
    .click();
  await expect(page.getByText(/soumise à la modération/)).toBeVisible();
  await approveTribunePosts(postTitle);

  await page.goto('/fr/tribune');
  await page
    .locator('a[href*="/tribune/"]')
    .filter({ hasText: postTitle })
    .first()
    .click();
  await expect(page).toHaveURL(/\/fr\/tribune\/[a-z0-9]+$/);
  await page.getByRole('button', { name: 'Signaler' }).first().click();
  await expect(page.getByText('Signalé')).toBeVisible();

  await page.goto('/fr/admin/signalements');
  const row = page.getByRole('listitem').filter({ hasText: postTitle });
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: 'Retirer', exact: true }).click();
  const dialog = page.getByRole('dialog', {
    name: 'Retirer cette prise de parole de la tribune ?',
  });
  await expect(dialog).toBeVisible();
  // The target is named down to the reported excerpt: two rows of this queue
  // differ only by that.
  await expect(dialog).toContainText(postTitle);

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: 'Retirer', exact: true }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Retirer le contenu' })
    .click();
  await expect(page.getByRole('status')).toContainText(
    'Contenu retiré de la tribune.',
  );
  await expect(row).toHaveCount(0);

  // The content has indeed left the public Tribune. We look at the FEED (links
  // to a public page): "Mes billets", under the composer, keeps the
  // removed post for its author — with its state — and points to the member
  // area, not to the Tribune.
  await page.goto('/fr/tribune');
  await expect(
    page.locator('a[href*="/tribune/"]').filter({ hasText: postTitle }),
  ).toHaveCount(0);
});

test('le rôle ne change pas sur un simple choix dans la liste : il faut « Appliquer » puis confirmer (issue #38)', async ({
  page,
}) => {
  const stamp = Date.now();
  const email = `e2e_conf_role_${stamp}@democracytogether.test`;
  await provisionUser(email, 'membre');

  await page.goto('/fr/admin/utilisateurs');
  await chercherUtilisateur(page, email);
  const row = page.getByRole('row').filter({ hasText: email });
  await expect(row).toBeVisible();

  // 1. CHOOSING IS NOT APPLYING. This is the heart of the issue: a mouse-wheel
  // movement over the dropdown changed its value, and that
  // value was sent to the server. We simulate the gesture through its consequence (the
  // value changes) and check that after reloading, nothing was sent.
  await chooseOption(row.getByLabel(`Rôle ${email}`), 'Visiteur');
  await expect(row.getByRole('button', { name: 'Appliquer' })).toBeVisible();
  await page.reload();
  // Reloading clears the search field — it is local state. Without
  // setting it again, the row falls off the first page as soon as the database is
  // populated, and the failure no longer says anything about the test's subject.
  await chercherUtilisateur(page, email);
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: email })
      .getByLabel(`Rôle ${email}`),
  ).toHaveText('Membre');

  // 2. "Appliquer" opens a confirmation that names the account, and says what
  // changes.
  const row2 = page.getByRole('row').filter({ hasText: email });
  await chooseOption(row2.getByLabel(`Rôle ${email}`), 'Visiteur');
  await row2.getByRole('button', { name: 'Appliquer' }).click();
  const dialog = page.getByRole('dialog', {
    name: `Changer le rôle de ${email} ?`,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('« Membre »');
  await expect(dialog).toContainText('« Visiteur »');

  // Cancel touches nothing.
  await dialog.getByRole('button', { name: 'Annuler' }).click();
  await expect(dialog).toHaveCount(0);
  await page.reload();
  // Reloading clears the search field — it is local state. Without
  // setting it again, the row falls off the first page as soon as the database is
  // populated, and the failure no longer says anything about the test's subject.
  await chercherUtilisateur(page, email);
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: email })
      .getByLabel(`Rôle ${email}`),
  ).toHaveText('Membre');

  // 3. Once confirmed, the switch goes through — with visible feedback.
  const row3 = page.getByRole('row').filter({ hasText: email });
  await chooseOption(row3.getByLabel(`Rôle ${email}`), 'Visiteur');
  await row3.getByRole('button', { name: 'Appliquer' }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Changer le rôle' })
    .click();
  // Filtered: the users screen carries a second `status` region (the
  // invitation form), which would make the selector ambiguous.
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: `${email} est désormais « Visiteur »` }),
  ).toBeVisible();

  await page.reload();
  // Reloading clears the search field — it is local state. Without
  // setting it again, the row falls off the first page as soon as the database is
  // populated, and the failure no longer says anything about the test's subject.
  await chercherUtilisateur(page, email);
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: email })
      .getByLabel(`Rôle ${email}`),
  ).toHaveText('Visiteur');
});
