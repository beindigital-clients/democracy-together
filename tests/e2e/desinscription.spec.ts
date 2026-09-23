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
// CE QUI EST VÉRIFIÉ, ET QUI NE L'EST PAS PAR LE MESSAGE À L'ÉCRAN. La page
// confirme la désinscription MÊME quand la mutation a échoué : son `.catch()`
// mène au même état que le succès, délibérément (la désinscription est
// idempotente côté serveur). Le message ne prouve donc rien à lui seul, et
// c'est la BASE qu'on relit.

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
    page.getByText(/Votre inscription est bien prise en compte/),
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

test('désinscription : un jeton inconnu ne retire personne, et ne dit pas qu’il est inconnu (F-12)', async ({
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
    page.getByText(/Votre inscription est bien prise en compte/),
  ).toBeVisible();
  expect(isNewsletterSubscribed(temoin)).toBe(true);

  await page.goto(
    '/fr/newsletter/desinscription?token=0000000000000000jeton-inexistant',
  );

  // MÊME message que le succès. C'est délibéré et c'est la propriété qu'on
  // garde ici : une page qui répondrait « jeton inconnu » distinguerait un
  // jeton valide d'un jeton inventé, donc rendrait un oracle à qui essaie —
  // le défaut refermé en F-09, par une autre porte.
  await expect(
    page.getByText(
      'Vous êtes désinscrit de la lettre de Democracy Together. À bientôt.',
    ),
  ).toBeVisible();

  // Et le témoin est toujours là.
  expect(
    isNewsletterSubscribed(temoin),
    'un jeton inconnu a retiré un abonné qui ne lui correspondait pas',
  ).toBe(true);
});
