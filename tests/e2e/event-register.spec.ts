import { test, expect } from '@playwright/test';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';

test.use({ locale: 'fr-FR' });

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Événement non vedette (le formulaire RSVP s'affiche ; la conférence inaugurale
// garde sa billetterie payante, hors périmètre F-53).
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
  expect(
    await convex.query(api.events.isRegistered, { eventSlug: SLUG, email }),
  ).toBe(true);
});

test('événement : nom manquant bloqué (F-53)', async ({ page }) => {
  await page.goto(`/fr/evenements/${SLUG}`);
  const form = page.locator('#inscription');
  await form.getByLabel('Nom complet').fill('B');
  await form.getByLabel('Adresse e-mail').fill('bob@example.org');
  await form.getByRole('button', { name: 'Confirmer mon inscription' }).click();
  await expect(page.getByText(/indiquer votre nom/)).toBeVisible();
});
