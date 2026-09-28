import { test, expect } from '@playwright/test';
import { importCodedContent, isEventRegistered } from './_helpers';

test.use({ locale: 'fr-FR' });

// Since the "contenus" workstream, the server validates the registration AGAINST THE
// `contentEvents` TABLE (pentest item M-5): the event must exist there,
// published and not over. CI imports the coded content; locally, we
// import it here (idempotent) so as not to depend on the deployment's state.
test.beforeAll(async () => {
  await importCodedContent();
});

// Non-featured event (the RSVP form is shown; the inaugural conference
// keeps its paid ticketing, outside the F-53 scope). Dated 3 December
// 2026: after that date, the server closes it (EVENT_CLOSED) and the event page
// no longer shows the form — that is the rule, and this test will then have to target
// an upcoming event (see `contenus-evenements.spec.ts`, which creates one).
const SLUG = 'webinaire-gouvernance-plateformes';

// F-53 — Event registration: form -> success + real Convex storage.
test('événement : inscription valide -> succès + stockage (F-53)', async ({
  page,
}) => {
  const email = `e2e_ev_${Date.now()}@democracytogether.test`;
  await page.goto(`/fr/evenements/${SLUG}`);

  // The page also carries the reminder form (F-55): we target the
  // registration card to disambiguate shared labels (email).
  const form = page.locator('#inscription');
  await form.getByLabel('Nom complet').fill('Awa Diop');
  await form.getByLabel('Adresse e-mail').fill(email);
  await form.getByRole('button', { name: 'Confirmer mon inscription' }).click();

  await expect(page.getByText(/Inscription confirmée/)).toBeVisible();

  // dev read (AUTH_DEV_OTP guard): the registration is indeed stored
  expect(isEventRegistered(SLUG, email)).toBe(true);
});

test('événement : nom manquant bloqué (F-53)', async ({ page }) => {
  await page.goto(`/fr/evenements/${SLUG}`);
  const form = page.locator('#inscription');
  await form.getByLabel('Nom complet').fill('B');
  await form.getByLabel('Adresse e-mail').fill('bob@example.org');
  await form.getByRole('button', { name: 'Confirmer mon inscription' }).click();
  await expect(page.getByText(/indiquer votre nom/)).toBeVisible();
});

// A-03 / A-10 (27/09 campaign) — a PAST event no longer offers the
// registration form; its page carries the replay block (an honest
// notice as long as no recording exists, link to the replays).
test('événement passé : pas de formulaire, bloc rediffusion (A-03, A-10)', async ({
  page,
}) => {
  await page.goto('/fr/evenements/ia-generative-integrite-information');
  await expect(page.locator('#inscription')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Confirmer mon inscription' }),
  ).toHaveCount(0);
  const bloc = page.locator('#rediffusion');
  await expect(
    bloc.getByRole('heading', { name: 'Rediffusion' }),
  ).toBeVisible();
  await expect(
    bloc.getByRole('link', { name: 'Voir toutes les rediffusions' }),
  ).toHaveAttribute('href', /\/fr\/replays$/);
});
