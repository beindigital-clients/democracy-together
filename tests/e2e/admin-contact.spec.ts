import { test, expect, type Page } from '@playwright/test';
import { latestContactForEmail } from './_helpers';
import { SESSIONS } from './_sessions';

test.use({ locale: 'fr-FR', storageState: SESSIONS.adminContact.state });

// F-12 — `/fr/admin/contact` was referenced by NO E2E spec.
//
// It is the screen that finding F-17 / F-26 gave birth to: without it,
// messages from the public form piled up in the database without anyone
// being able to read them or mark them handled. Yet it had no end-to-end
// guard — `contact.spec.ts` stops at the write, and the unit
// tests in `convex/contact-admin.test.ts` do not see the screen.
//
// WHAT THIS FILE EXERCISES, and which can only be verified here: the full cycle
// of a message, from the public form to its filing, by way of
// the FILTER. It is this filter that makes the test non-trivial — since the query is
// reactive, marking "handled" under "En attente" makes the entry DISAPPEAR
// from the list instead of changing a badge there. A test waiting for the badge
// in place would fail, and a test looking only at the badge under
// "Toutes" would not see that the queue empties.
//
// DEDICATED SESSION (see `_sessions.ts`): this file writes the data THEN
// moderates it, so it holds its session from one end to the other. Moderator rank, the
// minimum `listMessages` and `setHandled` require.
//
// WHAT IS NOT HERE. Role partitioning — a visitor cannot reach
// this screen — belongs to `middleware-gating.spec.ts` and `admin-ecrans.spec.ts`,
// which already hold the corresponding sessions. Putting it here would add a
// second account to this file, which `_sessions.ts` forbids.

// The refresh token rotates on the first test: we rewrite the state so that
// the second does not start again from a consumed token (same precaution as
// `admin-nav`, `admin-recherche` and `admin-confirmations`).
test.afterEach(async ({ context }) => {
  await context.storageState({ path: SESSIONS.adminContact.state });
});

const CORPS =
  'Bonjour, ceci est un message de vérification de la file de contact du back-office.';

// Submits a message through the PUBLIC form — a visitor's real path.
// We do not go through the API: what fills the queue in production is this
// form, so it is the one that must fill it here.
async function deposerUnMessage(
  page: Page,
  email: string,
  sujet: string,
): Promise<void> {
  await page.goto('/fr/contact');
  await page.getByLabel('Nom').fill('Awa Diop');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Sujet').fill(sujet);
  await page.getByLabel('Message', { exact: true }).fill(CORPS);
  await page.getByRole('button', { name: 'Envoyer le message' }).click();
  await expect(
    page.getByRole('heading', { name: 'Message envoyé' }),
  ).toBeVisible();
}

function ficheDe(page: Page, sujet: string) {
  return page.getByRole('listitem').filter({ hasText: sujet });
}

// The filter is a radio group (shadcn ToggleGroup): each choice is a
// `radio`, the current one `aria-checked`.
function filtre(page: Page, nom: 'En attente' | 'Toutes') {
  return page.getByRole('radio', { name: nom, exact: true });
}

test('admin/contact : un message public traverse la file jusqu’à « traité » (F-12)', async ({
  page,
}) => {
  const tampon = Date.now();
  const email = `e2e_admin_contact_${tampon}@democracytogether.test`;
  const sujet = `Demande de partenariat ${tampon}`;

  await deposerUnMessage(page, email, sujet);

  // NON-VACUITY: if the write had not happened, everything that follows
  // would look for a missing entry and the test would say "not found" instead of
  // "not handled". We separate the two.
  expect(
    latestContactForEmail(email),
    "le message n'a pas été écrit : la suite serait un test de l'absence",
  ).not.toBeNull();
  expect(latestContactForEmail(email)?.handled).toBe(false);

  await page.goto('/fr/admin/contact');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Messages de contact' }),
  ).toBeVisible();

  // --- Under "En attente", the default filter -----------------------------
  await expect(filtre(page, 'En attente')).toHaveAttribute(
    'aria-checked',
    'true',
  );

  const fiche = ficheDe(page, sujet);
  await expect(fiche, 'le message ne figure pas dans la file').toHaveCount(1);
  await expect(fiche).toContainText('Awa Diop');
  await expect(fiche).toContainText(email);
  await expect(fiche).toContainText(CORPS);
  await expect(fiche.getByText('À traiter')).toBeVisible();

  // "Répondre par e-mail" must open a PRE-FILLED draft: the sender's
  // address and a "Re:" subject. A bare mailto would be a decorative link.
  expect(
    await fiche
      .getByRole('link', { name: 'Répondre par e-mail' })
      .getAttribute('href'),
  ).toBe(`mailto:${email}?subject=${encodeURIComponent(`Re: ${sujet}`)}`);

  // --- Handling ------------------------------------------------------------
  await fiche.getByRole('button', { name: 'Marquer comme traité' }).click();

  // Since the query is reactive, the entry LEAVES the queue. That is the
  // expected behavior, and it is also the proof that the server accepted:
  // the list only redraws on data coming back from the backend.
  await expect(
    ficheDe(page, sujet),
    'la fiche traitée est restée dans la file « En attente »',
  ).toHaveCount(0);

  expect(latestContactForEmail(email)?.handled).toBe(true);

  // --- Under "Toutes", it is there, and marked --------------------------
  await filtre(page, 'Toutes').click();
  await expect(filtre(page, 'Toutes')).toHaveAttribute('aria-checked', 'true');
  await expect(filtre(page, 'En attente')).toHaveAttribute(
    'aria-checked',
    'false',
  );

  const ficheTraitee = ficheDe(page, sujet);
  await expect(ficheTraitee).toHaveCount(1);
  await expect(ficheTraitee.getByText('Traité')).toBeVisible();

  // --- Reopen: the filing is REVERSIBLE -------------------------------
  // A message handled by mistake must be able to go back into the queue; that is
  // written in `contact.setHandled`, so it can be verified.
  await ficheTraitee.getByRole('button', { name: 'Rouvrir' }).click();
  await expect(ficheTraitee.getByText('À traiter')).toBeVisible();
  expect(latestContactForEmail(email)?.handled).toBe(false);

  // And it is back in the queue.
  await filtre(page, 'En attente').click();
  await expect(ficheDe(page, sujet)).toHaveCount(1);
});

test('admin/contact : « Toutes » montre au moins ce que montre « En attente » (F-12)', async ({
  page,
}) => {
  const tampon = Date.now();
  const email = `e2e_admin_contact_f_${tampon}@democracytogether.test`;
  const sujet = `Question sur le réseau ${tampon}`;

  await deposerUnMessage(page, email, sujet);
  await page.goto('/fr/admin/contact');

  // We wait for the list to be populated before counting: `undefined` renders
  // the "Chargement…" screen, and counting at that moment would give 0 everywhere.
  await expect(ficheDe(page, sujet)).toHaveCount(1);
  await expect(page.getByText('Chargement…')).toHaveCount(0);
  const enAttente = await page.getByRole('listitem').count();

  await filtre(page, 'Toutes').click();
  await expect(ficheDe(page, sujet)).toHaveCount(1);
  const toutes = await page.getByRole('listitem').count();

  // Filter invariant: "En attente" is a SUBSET of "Toutes".
  // This holds whatever the content of the shared dataset, so this
  // test does not depend on what the other specs left in it.
  expect(
    toutes,
    '« Toutes » montre moins de messages que « En attente »',
  ).toBeGreaterThanOrEqual(enAttente);
  expect(
    enAttente,
    'la file d’attente est vide alors qu’on vient d’y écrire',
  ).toBeGreaterThan(0);
});
