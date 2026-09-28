import { test, expect } from '@playwright/test';
import { getNewsletterConfirmationLink, newsletterStatus } from './_helpers';
import { SESSIONS } from './_sessions';

test.use({ locale: 'fr-FR' });

// NEWSLETTER DOUBLE OPT-IN (F-18, "diffusion" workstream) — the full
// journey, as a subscriber experiences it:
//   public form -> "check your inbox" -> confirmation email
//   (read from the DEVELOPMENT outbox, as `getOtp` reads the codes)
//   -> confirmation page -> CONFIRMED subscriber, visible in the back office.
//
// Prerequisite: a deployment where AUTH_DEV_OTP=true (simulated send mode) and
// RECAPTCHA_DISABLED=true, as for the other public forms.
//
// A DEDICATED session (`diffusion`, editor rank): this file holds it from
// start to finish (see _sessions.ts).
test.use({ storageState: SESSIONS.diffusion.state });

test('inscription -> lien de confirmation -> abonné confirmé visible en admin (F-18)', async ({
  page,
}) => {
  const email = `e2e_dbl_optin_${Date.now()}@democracytogether.test`;

  await page.goto('/fr/newsletter');
  await page.getByLabel('Votre adresse e-mail').fill(email);
  await page.getByRole('button', { name: "S'inscrire" }).click();
  await expect(
    page.getByText(/Un e-mail de confirmation vient de vous être envoyé/),
  ).toBeVisible();

  // Subscribing does NOT create a subscriber: a pending one.
  await expect
    .poll(() => newsletterStatus(email), { timeout: 10_000 })
    .toBe('pending');

  // The email's link: we follow it like the subscriber, on OUR server (the
  // link carries SITE_URL, which may point to another host).
  const link = new URL(await getNewsletterConfirmationLink(email));
  expect(link.pathname).toBe('/fr/newsletter/confirmation');
  await page.goto(`${link.pathname}${link.search}`);
  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Confirmation de votre inscription',
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/C'est confirmé ! Vous recevrez désormais la lettre/),
  ).toBeVisible();

  // THE FACT, not the display.
  await expect
    .poll(() => newsletterStatus(email), { timeout: 10_000 })
    .toBe('confirmed');

  // Single use: the same link, followed a second time, is no longer valid.
  await page.goto(`${link.pathname}${link.search}`);
  await expect(
    page.getByText('Lien de confirmation invalide ou déjà utilisé.'),
  ).toBeVisible();

  // Back office: the subscriber is there, confirmed, with the proof of consent.
  await page.goto('/fr/admin/newsletter');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Newsletter' }),
  ).toBeVisible();
  await page.getByLabel('Rechercher une adresse exacte').fill(email);
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click();
  const liste = page.getByRole('list', { name: 'Abonnés' });
  const ligne = liste.getByRole('listitem').filter({ hasText: email });
  await expect(ligne).toBeVisible();
  await expect(ligne.getByText('Confirmé', { exact: true })).toBeVisible();
  await expect(
    ligne.getByText(/Consentement : .* page Newsletter/),
  ).toBeVisible();
});

test('un lien de confirmation inventé ne confirme rien, et le dit', async ({
  page,
}) => {
  await page.goto(`/fr/newsletter/confirmation?token=${'0'.repeat(64)}`);
  await expect(
    page.getByText('Lien de confirmation invalide ou déjà utilisé.'),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: "S'inscrire de nouveau" }),
  ).toHaveAttribute('href', '/fr/newsletter');
});
