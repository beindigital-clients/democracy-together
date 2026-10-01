import { test, expect, type Locator, type Page } from '@playwright/test';
import { provisionUser, submitApplication } from './_helpers';
import { SESSIONS } from './_sessions';
import { chooseOption } from './_fields';

test.use({ locale: 'fr-FR' });

// BACK-OFFICE SEARCH AND FILTERS (issue #49) — end to end, against the
// real Convex.
//
// Why this journey does not duplicate the unit tests: `convex-test`
// implements full-text indexes with its own tokenization (word prefixes
// split on spaces), whereas Convex also splits on punctuation
// and ranks by relevance. The only place where the REAL search is exercised
// is here — on a Convex deployment, through the screen.
//
// The data is timestamped per run: the dev deployment lives
// long and already carries accounts and applications. A unique term is
// what makes "the row appears ALONE" verifiable elsewhere than on an empty
// database.
//
// DEDICATED SESSION (see _sessions.ts): this file writes some data then
// searches for it, so it holds its session from one end to the other. Sharing it with
// another file killed it in CI — two contexts, a single refresh
// token — and the last journey woke up on /connexion.

const stamp = () => Date.now().toString(36);

async function search(page: Page, label: string, term: string) {
  await page.getByRole('searchbox', { name: label }).fill(term);
}

// The field is DEBOUNCED and the search is done by the server: between
// typing and the narrowed list, there is a delay then a Convex round
// trip. Any check of what remains displayed must therefore be an
// assertion that RETRIES — `allTextContents()` reads once, and reads the list
// from before. These two helpers only return once no row
// contradicts the filter any more, and at least one remains.
async function onlyRowsMatching(cells: Locator, expected: string | RegExp) {
  await expect(cells.filter({ hasNotText: expected })).toHaveCount(0);
  await expect(cells.first()).toBeVisible();
}

// The back-office screen is mounted behind two queries (session, then
// list): clicking right after `goto` without waiting for its title means aiming at a button
// the rendering may still replace — "element was detached from the DOM".
async function openScreen(page: Page, path: string, heading: string) {
  await page.goto(path);
  await expect(
    page.getByRole('heading', { level: 1, name: heading }),
  ).toBeVisible();
}

// THE REFRESH TOKEN ROTATES — IT MUST BE REWRITTEN. Same mechanism
// as in `admin-confirmations.spec.ts`, and same symptom: each test starts
// from a NEW context reloaded from the same state file, the first one that
// uses it rotates the token, and beyond the tolerance window
// Convex Auth sees a replay and cuts the session. This file has FIVE journeys:
// the last one starts long after the session was opened, and it is the one that
// landed twice on the sign-in screen. Rewriting the state after each test
// makes the next one start from the current token. The file's dedicated session makes
// the write safe: no other file reads this state during the run.
test.afterEach(async ({ context }) => {
  await context.storageState({ path: SESSIONS.adminRecherche.state });
});

test.describe('recherche des listes (session dédiée)', () => {
  test.use({ storageState: SESSIONS.adminRecherche.state });

  test('utilisateurs : un fragment d’adresse fait apparaître le compte SEUL (F-63)', async ({
    page,
  }) => {
    // The local part is a single alphanumeric block: the searched term is therefore
    // a whole word for the index, however it splits the
    // punctuation of an address.
    const token = `recherche${stamp()}`;
    const email = `${token}@democracytogether.test`;
    await provisionUser(email);

    await openScreen(page, '/fr/admin/utilisateurs', 'Utilisateurs');
    // Without a search, the list is paginated: nothing guarantees that the account
    // just created is on the first page — that is precisely what the
    // search is for finding.
    await search(page, 'Rechercher un utilisateur', token);

    const rows = page.getByRole('row').filter({ hasText: token });
    await expect(rows).toHaveCount(1);
    // ALONE: the table now contains only the header and this row.
    await expect(page.getByRole('row')).toHaveCount(2);

    // Clearing restores the list: the search lost nothing along the way.
    await page.getByRole('button', { name: 'Effacer' }).click();
    await expect(page.getByRole('row').nth(2)).toBeVisible();
  });

  test('utilisateurs : le filtre par rôle s’applique par-dessus la recherche (F-63)', async ({
    page,
  }) => {
    const token = `roles${stamp()}`;
    const email = `${token}@democracytogether.test`;
    // The role is REQUESTED explicitly: `provisionUser` creates a "visiteur"
    // by default, and a test filtering on "membre" must say which account
    // it is talking about rather than inherit a default.
    await provisionUser(email, 'membre');

    await openScreen(page, '/fr/admin/utilisateurs', 'Utilisateurs');
    await search(page, 'Rechercher un utilisateur', token);
    await expect(page.getByText(email)).toBeVisible();

    // The account is a member: filtering on "Éditeur" must make it disappear,
    // while the search, for its part, keeps matching. That is what
    // shows that both conditions are applied together, server-side.
    await chooseOption(page.getByLabel('Filtrer par rôle'), 'Éditeur');
    await expect(page.getByText(email)).toHaveCount(0);
    await expect(
      page.getByText('Aucun résultat pour cette recherche.'),
    ).toBeVisible();

    // …and on its own role, it comes back.
    await chooseOption(page.getByLabel('Filtrer par rôle'), 'Membre');
    await expect(page.getByText(email)).toBeVisible();
  });

  test('candidatures : recherche par nom d’organisation (F-22/F-26)', async ({
    page,
  }) => {
    const token = `InstitutCherche${stamp()}`;
    await submitApplication({
      type: 'organisation',
      organizationName: `${token} du Sahel`,
      contactEmail: `cand_${stamp()}@democracytogether.test`,
      country: 'Sénégal',
    });

    await openScreen(page, '/fr/admin/candidatures', 'Candidatures');
    await search(page, 'Rechercher une candidature', token);

    // NAMED list: the grouped navigation also renders `<li>`s, an
    // unscoped `getByRole('listitem')` would count its fourteen entries.
    const queue = page
      .getByRole('list', { name: 'Liste des candidatures' })
      .getByRole('listitem');
    await expect(queue.filter({ hasText: token })).toHaveCount(1);
    await expect(queue).toHaveCount(1);

    // A term that matches nothing SAYS so, instead of showing an empty
    // queue that one would take for "nothing left to moderate".
    await search(page, 'Rechercher une candidature', 'zzz-aucune-candidature');
    await expect(
      page.getByText('Aucun résultat pour cette recherche.'),
    ).toBeVisible();
  });

  test('journal : recherche par action, puis filtre sur l’acteur d’une ligne (F-67)', async ({
    page,
  }) => {
    // We produce an audit entry through the product itself: changing a role
    // writes `user.role_changed`, signed by the current admin session. Nothing
    // is inserted by hand, so what the log shows is indeed what the
    // back office writes.
    const token = `journal${stamp()}`;
    const email = `${token}@democracytogether.test`;
    await provisionUser(email);

    await openScreen(page, '/fr/admin/utilisateurs', 'Utilisateurs');
    await search(page, 'Rechercher un utilisateur', token);

    // The role change happens in TWO STEPS since issue #38: choosing
    // only prepares the draft, "Appliquer" opens the confirmation.
    const row = page.getByRole('row').filter({ hasText: token });
    await expect(row).toHaveCount(1);
    await chooseOption(row.getByLabel(`Rôle ${email}`), 'Modérateur');
    await row.getByRole('button', { name: 'Appliquer' }).click();
    // We WAIT for the dialog before aiming at its button, as
    // `admin-confirmations.spec.ts` does. Aiming directly mixes two failures
    // under the same message: "the confirmation did not open" and "the
    // button was not clickable". The second cost a campaign.
    const confirmation = page.getByRole('dialog', {
      name: `Changer le rôle de ${email} ?`,
    });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Changer le rôle' }).click();
    await expect(page.getByLabel(`Rôle ${email}`)).toHaveText('Modérateur');

    await openScreen(page, '/fr/admin/journal', "Journal d'activité");

    // Search by action family: the index splits the dotted slug, so
    // "user" brings up `user.role_changed` (and `user.invited`).
    await search(page, 'Rechercher une action', 'user');
    const actionCells = page.locator('tbody tr td:nth-child(2)');
    await onlyRowsMatching(actionCells, /^user\./);

    // Filter by actor: we take it where it is displayed, by clicking
    // a row's actor.
    //
    // The targeted actor is KNOWN — it is the session that just changed the role,
    // hence the entry just created. Reading instead the actor "of the
    // first row" would open a race: the log is fed in
    // parallel by the other journeys, and the top row may change
    // between the read and the click.
    await page.getByRole('button', { name: 'Effacer' }).click();
    const actor = SESSIONS.adminRecherche.email;
    const actorCells = page.locator('tbody tr td:nth-child(3)');
    await page
      .getByRole('button', { name: `Acteur : ${actor}` })
      .first()
      .click();

    // The label NAMES what is filtered — without it, a narrowed list
    // would be indistinguishable from an almost empty log. `exact`: the table's
    // buttons carry the same string as `aria-label`, but not as text.
    await expect(
      page.getByText(`Acteur : ${actor}`, { exact: true }),
    ).toBeVisible();
    await onlyRowsMatching(actorCells, actor);

    // And it can be dismissed.
    await page
      .getByRole('button', { name: "Retirer le filtre d'acteur" })
      .click();
    await expect(
      page.getByText(`Acteur : ${actor}`, { exact: true }),
    ).toHaveCount(0);
  });

  test('publications : recherche par titre dans la file de modération (F-32)', async ({
    page,
  }) => {
    // This queue depends on the seeds (`seedPublications`, see TESTING.md): we
    // therefore do not assume a specific row, we check the PROPERTY — everything that
    // remains displayed matches the term, and an absent term says so.
    await openScreen(page, '/fr/admin/publications', 'Publications');
    // The title appears before the queue's first page: clicking at that
    // moment means aiming at a button the next render replaces ("element
    // was detached from the DOM"). So we wait for the queue to have settled —
    // a list, or the empty-queue message.
    const queue = page
      .getByRole('list', { name: 'Liste des publications à modérer' })
      .getByRole('listitem');
    const settled = page
      .getByRole('list', { name: 'Liste des publications à modérer' })
      .or(page.getByText('Aucune publication à modérer.'));
    await expect(settled).toBeVisible();

    await page.getByRole('button', { name: 'Toutes' }).click();
    await expect(settled).toBeVisible();

    await search(page, 'Rechercher une publication', 'zzz-aucun-titre');
    await expect(
      page.getByText('Aucun résultat pour cette recherche.'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Effacer' }).click();
    const firstTitle = queue.first().getByRole('heading');
    await expect(firstTitle).toBeVisible();
    // A WHOLE WORD of the first title, long enough to be discriminating: a
    // short term (the "l'" of an elision, for example) would match almost
    // everything by prefix, and the assertion below would prove nothing.
    const word = (await firstTitle.innerText())
      .split(/[^\p{L}\p{N}]+/u)
      .find((w) => w.length >= 5);
    test.skip(!word, 'aucun mot assez long dans le premier titre');

    await search(page, 'Rechercher une publication', word!);
    await onlyRowsMatching(
      queue.getByRole('heading'),
      new RegExp(word!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
    );
  });
});
