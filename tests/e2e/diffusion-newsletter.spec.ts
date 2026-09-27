import { test, expect } from '@playwright/test';
import { getNewsletterConfirmationLink, newsletterStatus } from './_helpers';
import { SESSIONS } from './_sessions';

test.use({ locale: 'fr-FR' });

// DOUBLE OPT-IN DE LA NEWSLETTER (F-18, chantier diffusion) — le parcours
// complet, tel qu'un abonné le vit :
//   formulaire public -> « vérifiez votre boîte » -> courriel de confirmation
//   (lu dans la boîte d'envoi de DÉVELOPPEMENT, comme `getOtp` lit les codes)
//   -> page de confirmation -> abonné CONFIRMÉ, visible au back-office.
//
// Prérequis : un déploiement où AUTH_DEV_OTP=true (mode d'envoi simulé) et
// RECAPTCHA_DISABLED=true, comme pour les autres formulaires publics.
//
// Une session DÉDIÉE (`diffusion`, rang éditeur) : ce fichier la tient du
// début à la fin (cf. _sessions.ts).
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

  // L'inscription ne fait PAS d'abonné : une attente.
  await expect
    .poll(() => newsletterStatus(email), { timeout: 10_000 })
    .toBe('pending');

  // Le lien du courriel : on le suit comme l'abonné, sur NOTRE serveur (le
  // lien porte SITE_URL, qui peut désigner un autre hôte).
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

  // LE FAIT, pas l'affichage.
  await expect
    .poll(() => newsletterStatus(email), { timeout: 10_000 })
    .toBe('confirmed');

  // Usage unique : le même lien, suivi une seconde fois, ne vaut plus.
  await page.goto(`${link.pathname}${link.search}`);
  await expect(
    page.getByText('Lien de confirmation invalide ou déjà utilisé.'),
  ).toBeVisible();

  // Back-office : l'abonné est là, confirmé, avec la preuve du consentement.
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
