import { test, expect } from '@playwright/test';
import { isNewsletterSubscribed, newsletterUnsubToken } from './_helpers';

test.use({ locale: 'fr-FR' });

// F-12 — `/fr/newsletter/desinscription` n'était citée par AUCUNE spec E2E.
//
// POURQUOI ELLE NE L'ÉTAIT PAS, et ce qu'il a fallu ajouter. Cette page
// n'existe qu'au bout d'un JETON : c'est le lien du pied de l'e-mail de
// campagne. Or aucun oracle de lecture ne rendait ce jeton — `isSubscribed`
// ne rend qu'un booléen. Sans lui, on ne pouvait tester que les branches
// d'ÉCHEC, c'est-à-dire tout sauf la désinscription. D'où
// `newsletter:devUnsubToken`, `internalQuery` gardée par AUTH_DEV_OTP, sur le
// modèle exact de `isSubscribed` et `contact:latestForEmail` — hors API
// publique, appelée par la CLI Convex en contexte de confiance. Ce n'est PAS
// l'oracle public refermé en F-09, qui répondait à n'importe qui.
//
// CE QUI EST VÉRIFIÉ, ET QUI NE L'EST PAS PAR LE MESSAGE À L'ÉCRAN. Depuis
// R-09, la page ne confirme que si le serveur a TROUVÉ le jeton (`found`) ;
// mais c'est toujours la BASE qu'on relit : le message dit ce que le serveur
// a répondu, pas ce qu'il a fait.

test('désinscription : le lien de l’e-mail retire vraiment l’abonné (F-12)', async ({
  page,
}) => {
  const email = `e2e_unsub_${Date.now()}@democracytogether.test`;

  // On s'inscrit par le FORMULAIRE public : c'est le chemin qui produit le
  // jeton, et le seul que vive un abonné réel.
  await page.goto('/fr/newsletter');
  await page.getByLabel('Votre adresse e-mail').fill(email);
  await page.getByRole('button', { name: "S'inscrire" }).click();
  await expect(
    page.getByText(/Un e-mail de confirmation vient de vous être envoyé/),
  ).toBeVisible();

  // NON-VACUITÉ : si l'inscription n'avait pas eu lieu, tout ce qui suit
  // passerait à vide — on « désinscrirait » quelqu'un qui n'est pas là.
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

  // LE FAIT, pas l'affichage.
  await expect
    .poll(() => isNewsletterSubscribed(email), {
      message: "l'abonné est toujours en base après la désinscription",
      timeout: 10_000,
    })
    .toBe(false);

  // Le retour à l'accueil est la seule issue offerte : une page sans sortie
  // laisse l'abonné sur un cul-de-sac.
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
  // Un abonné témoin, qui doit SURVIVRE au passage d'un jeton inventé. Sans
  // lui, ce test ne distinguerait pas « le jeton inconnu n'a rien fait » de
  // « le jeton inconnu a tout supprimé ».
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

  // « Lien invalide ou expiré », et NON la confirmation : un abonné dont le
  // lien a été tronqué par son client mail croyait s'être désinscrit et
  // restait abonné (mesuré le 27/09, vitrine O2). Ce n'est pas l'oracle
  // refermé en F-09 : celui-là répondait à une ADRESSE choisie ; ici le jeton
  // est un secret aléatoire de 128 bits, qui n'identifie personne — le
  // distinguer d'un jeton inventé ne renseigne sur aucun abonné.
  await expect(
    page.getByText('Lien de désinscription invalide ou expiré.'),
  ).toBeVisible();
  await expect(
    page.getByText(/Vous êtes désinscrit/),
    'un jeton inconnu ne doit pas annoncer une désinscription',
  ).toHaveCount(0);

  // Et le témoin est toujours là.
  expect(
    isNewsletterSubscribed(temoin),
    'un jeton inconnu a retiré un abonné qui ne lui correspondait pas',
  ).toBe(true);
});
