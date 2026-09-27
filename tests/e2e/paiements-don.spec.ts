import { test, expect, type Page } from '@playwright/test';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';
import { SESSIONS } from './_sessions';

// PAIEMENTS (F-28 à F-31) — le parcours d'un don, de bout en bout :
// formulaire /don → page du prestataire (FACTICE) → webhook signé → retour →
// reçu PDF dans l'espace membre → transaction au back-office.
//
// Le prestataire factice n'existe que sur un déploiement de dev ou de
// préversion (`PAYMENTS_FAKE_PROVIDER=1` + `AUTH_DEV_OTP=true`, posés par
// e2e.yml). La spec lit la configuration RÉELLE du déploiement
// (`payments.checkout.paymentOptions`, la query même que lit la page) et
// exerce le chemin correspondant — comme `news.spec.ts` pour Sanity :
//  - un prestataire est disponible : parcours complet ;
//  - aucun : la page doit le DIRE et proposer une alternative, sans bouton
//    mort. Le parcours de paiement est alors annoté comme non joué.
//
// SESSION DÉDIÉE (`paiements`, rang admin) : le fichier donne, relit son reçu
// puis ouvre /admin/finances — il tient sa session d'un bout à l'autre.

test.use({ locale: 'fr-FR', storageState: SESSIONS.paiements.state });

test.afterEach(async ({ context }) => {
  await context.storageState({ path: SESSIONS.paiements.state });
});

async function paymentOptions() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error('NEXT_PUBLIC_CONVEX_URL manquant.');
  return await new ConvexHttpClient(url).query(
    api.payments.checkout.paymentOptions,
    {},
  );
}

async function donnerEnEuros(page: Page, montant: number) {
  await page.goto('/fr/don');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Faire un don' }),
  ).toBeVisible();
  // Portée : le formulaire de don (le pied de page porte son propre champ
  // « E-mail », celui de la newsletter).
  const form = page.getByRole('form', { name: 'Formulaire de don' });
  await form.getByText('Autre montant', { exact: true }).click();
  await form.getByLabel(/Montant libre/).fill(String(montant));
  // L'adresse du compte connecté pré-remplit le champ : le don est rattaché
  // au compte, et son reçu paraîtra dans l'espace membre.
  await expect(form.getByLabel('E-mail', { exact: true })).toHaveValue(
    SESSIONS.paiements.email,
  );
  await form.getByRole('button', { name: /^Donner/ }).click();
  await page.waitForURL(/\/fr\/paiement\/simulateur\?ref=/);
}

test('don ponctuel : prestataire factice → reçu dans l’espace membre → transaction au back-office', async ({
  page,
  context,
  request,
}) => {
  const options = await paymentOptions();
  const euro = options.currencies.find((c) => c.currency === 'EUR');

  if (!euro) {
    // Chemin dégradé : aucun prestataire pour l'euro sur ce déploiement.
    test.info().annotations.push({
      type: 'chemin',
      description:
        'aucun prestataire EUR configuré : parcours de paiement non joué',
    });
    await page.goto('/fr/don');
    if (options.currencies.length === 0) {
      await expect(
        page.getByRole('heading', {
          name: 'Le paiement en ligne n’est pas encore ouvert',
        }),
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'contactez-nous' }),
      ).toBeVisible();
      await expect(page.getByRole('button', { name: /^Donner/ })).toHaveCount(
        0,
      );
    }
    return;
  }
  test.skip(
    euro.provider !== 'fake',
    'prestataire EUR réel configuré : le paiement hébergé ne se joue pas en E2E',
  );

  // Montant distinct à chaque exécution : c'est lui qui retrouve la ligne.
  const montant = 6 + (Date.now() % 90);
  await donnerEnEuros(page, montant);

  // Page du « prestataire » : le montant demandé, puis le paiement.
  await expect(page.getByTestId('sim-amount')).toContainText(String(montant));
  await page.getByRole('button', { name: 'Payer (simulation)' }).click();

  // Retour : l'état vient du webhook inscrit en base, pas de l'URL.
  await page.waitForURL(/\/fr\/paiement\/retour\?ref=.*statut=succes/);
  await expect(
    page.getByRole('heading', { name: 'Merci pour votre don !' }),
  ).toBeVisible();

  // Espace membre : la transaction, puis son reçu (le PDF est produit par une
  // action planifiée — il peut arriver une ou deux secondes après).
  await page.getByRole('link', { name: 'Voir mes reçus' }).click();
  await page.waitForURL(/\/fr\/espace-membre\/cotisations/);
  const ligne = page
    .getByRole('row')
    .filter({ hasText: new RegExp(`${montant},00\\s?EUR`) })
    .first();
  await expect(ligne).toBeVisible();
  const recu = ligne.getByRole('button', {
    name: /Télécharger le reçu DT-\d{4}-\d{6}/,
  });
  await expect(recu).toBeVisible({ timeout: 30_000 });
  const numero = (await recu.textContent())?.trim() ?? '';
  expect(numero).toMatch(/^DT-\d{4}-\d{6}$/);

  // Le reçu s'ouvre et c'est un PDF.
  const [pdf] = await Promise.all([context.waitForEvent('page'), recu.click()]);
  // L'onglet naît sur « about:blank » puis navigue vers l'URL signée du
  // stockage. Lire son adresse trop tôt (vu en CI le 27/09, machine plus
  // lente) faisait retomber la requête sur la page d'accueil du site : on
  // attend qu'il ait quitté la page vide.
  await expect.poll(() => pdf.url()).not.toBe('about:blank');
  const reponse = await request.get(pdf.url());
  expect(reponse.ok()).toBe(true);
  expect((await reponse.body()).subarray(0, 5).toString()).toBe('%PDF-');
  await pdf.close();

  // Back-office : la transaction, retrouvée par son numéro de reçu.
  await page.goto('/fr/admin/finances');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Finances' }),
  ).toBeVisible();
  await expect(
    page.getByTestId('finance-tx-row').filter({ hasText: numero }),
  ).toBeVisible();
});

test('paiement annulé chez le prestataire : rien n’est encaissé, l’écran le dit', async ({
  page,
}) => {
  const options = await paymentOptions();
  const euro = options.currencies.find((c) => c.currency === 'EUR');
  test.skip(
    euro?.provider !== 'fake',
    'prestataire factice absent sur ce déploiement',
  );

  await donnerEnEuros(page, 7);
  await page.getByRole('button', { name: 'Annuler' }).click();
  await page.waitForURL(/\/fr\/paiement\/retour\?ref=.*statut=annule/);
  await expect(
    page.getByRole('heading', { name: 'Paiement annulé' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Réessayer' })).toBeVisible();
});
