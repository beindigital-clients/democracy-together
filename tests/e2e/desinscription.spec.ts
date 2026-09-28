import { test, expect } from '@playwright/test';
import { isNewsletterSubscribed, newsletterUnsubToken } from './_helpers';

test.use({ locale: 'fr-FR' });

// F-12 — `/fr/newsletter/desinscription` was referenced by NO E2E spec.
//
// WHY IT WAS NOT, and what had to be added. This page
// only exists at the end of a TOKEN: it is the link in the campaign email
// footer. Yet no read oracle returned this token — `isSubscribed`
// only returns a boolean. Without it, only the FAILURE branches could be
// tested, that is, everything except unsubscribing. Hence
// `newsletter:devUnsubToken`, an `internalQuery` guarded by AUTH_DEV_OTP, on the
// exact model of `isSubscribed` and `contact:latestForEmail` — outside the public
// API, called by the Convex CLI in a trusted context. It is NOT
// the public oracle closed in F-09, which answered anyone.
//
// WHAT IS CHECKED, AND WHAT THE ON-SCREEN MESSAGE DOES NOT CHECK. Since
// R-09, the page only confirms if the server FOUND the token (`found`);
// but it is still the DATABASE that we re-read: the message says what the server
// answered, not what it did.

test('désinscription : le lien de l’e-mail retire vraiment l’abonné (F-12)', async ({
  page,
}) => {
  const email = `e2e_unsub_${Date.now()}@democracytogether.test`;

  // We subscribe through the public FORM: it is the path that produces the
  // token, and the only one a real subscriber goes through.
  await page.goto('/fr/newsletter');
  await page.getByLabel('Votre adresse e-mail').fill(email);
  await page.getByRole('button', { name: "S'inscrire" }).click();
  await expect(
    page.getByText(/Un e-mail de confirmation vient de vous être envoyé/),
  ).toBeVisible();

  // NON-VACUITY: if the subscription had not happened, everything that follows
  // would pass vacuously — we would "unsubscribe" someone who is not there.
  expect(
    isNewsletterSubscribed(email),
    "l'inscription préalable n'a pas eu lieu : le test suivant serait vide",
  ).toBe(true);

  const jeton = newsletterUnsubToken(email);
  expect(jeton, 'aucun jeton de désinscription en base').toBeTruthy();

  await page.goto(`/fr/newsletter/desinscription?token=${jeton}`);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Désinscription' }),
  ).toBeVisible();
  await expect(
    page.getByText(
      'Vous êtes désinscrit de la lettre de Democracy Together. À bientôt.',
    ),
  ).toBeVisible();

  // THE FACT, not the display.
  await expect
    .poll(() => isNewsletterSubscribed(email), {
      message: "l'abonné est toujours en base après la désinscription",
      timeout: 10_000,
    })
    .toBe(false);

  // Going back to the home page is the only way out offered: a page with no exit
  // leaves the subscriber in a dead end.
  await expect(
    page.getByRole('link', { name: "Retour à l'accueil" }),
  ).toHaveAttribute('href', '/fr');
});

test('désinscription : sans jeton, la page le dit au lieu de faire semblant (F-12)', async ({
  page,
}) => {
  await page.goto('/fr/newsletter/desinscription');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Désinscription' }),
  ).toBeVisible();
  await expect(
    page.getByText('Lien de désinscription invalide ou expiré.'),
  ).toBeVisible();
  await expect(
    page.getByText(/Vous êtes désinscrit/),
    'une page sans jeton ne doit pas annoncer une désinscription',
  ).toHaveCount(0);
});

test('désinscription : un jeton inconnu ne retire personne, et le dit (F-12, R-09)', async ({
  page,
}) => {
  // A control subscriber, who must SURVIVE an invented token going through. Without
  // them, this test could not tell "the unknown token did nothing" from
  // "the unknown token deleted everything".
  const temoin = `e2e_unsub_temoin_${Date.now()}@democracytogether.test`;
  await page.goto('/fr/newsletter');
  await page.getByLabel('Votre adresse e-mail').fill(temoin);
  await page.getByRole('button', { name: "S'inscrire" }).click();
  await expect(
    page.getByText(/Un e-mail de confirmation vient de vous être envoyé/),
  ).toBeVisible();
  expect(isNewsletterSubscribed(temoin)).toBe(true);

  await page.goto(
    '/fr/newsletter/desinscription?token=0000000000000000jeton-inexistant',
  );

  // "Lien invalide ou expiré", and NOT the confirmation: a subscriber whose
  // link had been truncated by their mail client believed they had unsubscribed and
  // remained subscribed (measured on 27/09, showcase O2). This is not the oracle
  // closed in F-09: that one answered for a chosen ADDRESS; here the token
  // is a random 128-bit secret, which identifies no one — telling it
  // apart from an invented token reveals nothing about any subscriber.
  await expect(
    page.getByText('Lien de désinscription invalide ou expiré.'),
  ).toBeVisible();
  await expect(
    page.getByText(/Vous êtes désinscrit/),
    'un jeton inconnu ne doit pas annoncer une désinscription',
  ).toHaveCount(0);

  // And the control is still there.
  expect(
    isNewsletterSubscribed(temoin),
    'un jeton inconnu a retiré un abonné qui ne lui correspondait pas',
  ).toBe(true);
});
