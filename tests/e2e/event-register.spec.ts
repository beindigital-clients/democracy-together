import { test, expect } from '@playwright/test';
import { importCodedContent, isEventRegistered } from './_helpers';

test.use({ locale: 'fr-FR' });

// Depuis le chantier « contenus », le serveur valide l'inscription CONTRE LA
// TABLE `contentEvents` (point M-5 du pentest) : l'événement doit y exister,
// publié et non terminé. La CI importe le contenu codé ; en local, on
// l'importe ici (idempotent) pour ne pas dépendre de l'état du déploiement.
test.beforeAll(async () => {
  await importCodedContent();
});

// Événement non vedette (le formulaire RSVP s'affiche ; la conférence inaugurale
// garde sa billetterie payante, hors périmètre F-53). Daté du 3 décembre
// 2026 : passé cette date, le serveur le ferme (EVENT_CLOSED) et la fiche
// n'affiche plus le formulaire — c'est la règle, et ce test devra alors viser
// un événement à venir (cf. `contenus-evenements.spec.ts`, qui en crée un).
const SLUG = 'webinaire-gouvernance-plateformes';

// F-53 — Inscription événement : formulaire -> succès + stockage Convex réel.
test('événement : inscription valide -> succès + stockage (F-53)', async ({
  page,
}) => {
  const email = `e2e_ev_${Date.now()}@democracytogether.test`;
  await page.goto(`/fr/evenements/${SLUG}`);

  // La page porte aussi le formulaire de rappel (F-55) : on cible la carte
  // d'inscription pour lever l'ambiguïté des libellés partagés (e-mail).
  const form = page.locator('#inscription');
  await form.getByLabel('Nom complet').fill('Awa Diop');
  await form.getByLabel('Adresse e-mail').fill(email);
  await form.getByRole('button', { name: 'Confirmer mon inscription' }).click();

  await expect(page.getByText(/Inscription confirmée/)).toBeVisible();

  // lecture dev (garde AUTH_DEV_OTP) : l'inscription est bien stockée
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

// A-03 / A-10 (campagne du 27/09) — un événement PASSÉ ne propose plus le
// formulaire d'inscription ; sa fiche porte le bloc rediffusion (mention
// honnête tant qu'aucun enregistrement n'existe, lien vers les replays).
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
