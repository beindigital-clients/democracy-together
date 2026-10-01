import { test, expect } from '@playwright/test';
import {
  signUpAndVerify,
  elevateRole,
  applyYouth,
  E2E_PASSWORD,
  approveTribunePosts,
} from './_helpers';
import { SESSIONS } from './_sessions';
import { chooseOption } from './_fields';

// The back-office screens that WRITE, end to end: real data
// arrives through the public path, staff handle it from the screen, and the effect
// is checked on the queue (it leaves it, and reappears with the right status).
// A "the page responds" would say nothing about the mutation, which is precisely what
// breaks.
//
// Already covered elsewhere: membership applications (`admin.spec.ts`) and
// publications (`library-submit.spec.ts`).
test.use({ locale: 'fr-FR' });

// The refresh token rotates on the first test: we rewrite the state so that
// the following ones do not start again from a consumed token (same precaution as
// `admin-nav`, `admin-recherche`, `admin-confirmations` and `admin-contact`).
test.afterEach(async ({ context }) => {
  await context.storageState({ path: SESSIONS.adminModeration.state });
});

test.describe('file des candidatures jeunes (session dédiée)', () => {
  // DEDICATED SESSION, which it was not: this block shared `moderateur`
  // with `admin-ecrans.spec.ts`. Playwright runs FILES in parallel,
  // so two contexts presented the same refresh token —
  // Convex Auth rotates it on each renewal, the second pass
  // looks like a replay, and the session dies. Observed in CI: the failure
  // snapshot is the sign-in page, and "Approuver" detaches from the DOM in the
  // middle of the journey. That is the mechanism `_sessions.ts` has described since
  // issue #38; this file still escaped it.
  test.use({ storageState: SESSIONS.adminModeration.state });

  test('back-office : un modérateur approuve une candidature jeune (F-58/F-26)', async ({
    page,
  }) => {
    const stamp = Date.now();
    const applicant = `Awa Jeunesse E2E ${stamp}`;

    // Application submitted through the public path (open action, like the
    // /jeunes form).
    await applyYouth({
      name: applicant,
      email: `e2e_youth_bo_${stamp}@democracytogether.test`,
      country: 'Sénégal',
      motivation:
        'Je souhaite contribuer aux travaux du réseau sur la participation citoyenne.',
    });

    await page.goto('/fr/admin/jeunes');

    const row = page.getByRole('listitem').filter({ hasText: applicant });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Approuver' }).click();
    await expect(row).toHaveCount(0); // leaves the "En attente" queue

    await page.getByRole('radio', { name: 'Toutes' }).click();
    const decided = page.getByRole('listitem').filter({ hasText: applicant });
    await expect(decided).toBeVisible();
    await expect(decided.getByText('Approuvée')).toBeVisible();

    // A decision taken cannot be undone (issue #9): the screen no longer offers
    // "Rejeter", but "Rouvrir" — the NAMED backward transition, which
    // sends the application back into the queue instead of overwriting the previous
    // decision. The server holds the same rule if the mutation is called
    // directly (see convex/youth.test.ts).
    await expect(decided.getByRole('button', { name: 'Rejeter' })).toHaveCount(
      0,
    );
    await decided.getByRole('button', { name: 'Rouvrir' }).click();
    await expect(decided.getByText('En attente')).toBeVisible();
    await expect(
      decided.getByRole('button', { name: 'Approuver' }),
    ).toBeVisible();
  });
});

test('back-office : un modérateur accepte une proposition de projet (F-60/F-26)', async ({
  page,
}) => {
  const stamp = Date.now();
  const projectTitle = `Observatoire commun E2E ${stamp}`;

  // 1. A MEMBER submits a proposal from the public page (the form is reserved
  // for members: this is also a check of the gate).
  const email = `e2e_prj_${stamp}@democracytogether.test`;
  await signUpAndVerify(page, email, E2E_PASSWORD);
  await elevateRole(email, 'membre');

  await page.goto('/fr/appels-a-projets');
  await chooseOption(
    page.getByLabel('Axe de travail'),
    'Participation citoyenne',
  );
  await page.getByLabel('Titre du projet').fill(projectTitle);
  await page
    .getByLabel('Résumé', { exact: true })
    .fill(
      'Un observatoire commun des pratiques de participation citoyenne, mené avec trois membres du réseau en Afrique de l’Ouest et en Europe.',
    );
  await page.getByRole('button', { name: 'Envoyer la proposition' }).click();
  await expect(page.getByText('Proposition envoyée. Merci !')).toBeVisible();

  // 2. Staff handle it from the back office.
  await elevateRole(email, 'moderateur');
  await page.goto('/fr/admin/projets');

  const row = page.getByRole('listitem').filter({ hasText: projectTitle });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Accepter' }).click();
  await expect(row).toHaveCount(0);

  await page.getByRole('radio', { name: 'Toutes' }).click();
  const decided = page.getByRole('listitem').filter({ hasText: projectTitle });
  await expect(decided).toBeVisible();
  await expect(decided.getByText('Accepté')).toBeVisible();
});

test('back-office : un modérateur traite un signalement de la tribune (F-50/F-26)', async ({
  page,
}) => {
  const stamp = Date.now();
  const postTitle = `Prise de parole E2E ${stamp}`;
  const email = `e2e_sig_${stamp}@democracytogether.test`;

  // 1. A member posts on the Tribune...
  await signUpAndVerify(page, email, E2E_PASSWORD);
  await elevateRole(email, 'membre');
  await page.goto('/fr/tribune');
  await page.getByRole('button', { name: 'Prendre la parole' }).click();

  const composer = page
    .locator('form')
    .filter({ hasText: 'Votre prise de parole' });
  await composer.getByLabel('Titre', { exact: true }).fill(postTitle);
  await composer
    .getByLabel('Votre texte')
    .fill(
      'Un court billet de test E2E sur la participation citoyenne et ses limites.',
    );
  // PRE-moderation (F-45): once submitted, the post awaits approval —
  // given here — before appearing in the public feed.
  await composer
    .getByRole('button', { name: 'Soumettre à la modération' })
    .click();
  await expect(page.getByText(/soumise à la modération/)).toBeVisible();
  await approveTribunePosts(postTitle);

  // 2. ...then reports the content from its page (any authenticated account can).
  await page.goto('/fr/tribune');
  await page
    .locator('a[href*="/tribune/"]')
    .filter({ hasText: postTitle })
    .first()
    .click();
  await expect(page).toHaveURL(/\/fr\/tribune\/[a-z0-9]+$/);
  await page.getByRole('button', { name: 'Signaler' }).first().click();
  await expect(page.getByText('Signalé')).toBeVisible();

  // 3. The report arrives in the moderation queue and leaves it once handled.
  await elevateRole(email, 'moderateur');
  await page.goto('/fr/admin/signalements');

  const row = page.getByRole('listitem').filter({ hasText: postTitle });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Ignorer' }).click();
  await expect(row).toHaveCount(0);
  // the post stays published: "Ignorer" does not remove the content
  await page.goto('/fr/tribune');
  await expect(
    page.getByRole('link').filter({ hasText: postTitle }).first(),
  ).toBeVisible();
});
