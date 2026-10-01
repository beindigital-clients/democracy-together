import { test, expect, type Page } from '@playwright/test';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';
import { SESSIONS } from './_sessions';

// PAYMENTS (F-28 to F-31) — the donation flow, end to end:
// /don form → provider page (FAKE) → signed webhook → return →
// PDF receipt in the member area → transaction in the back office.
//
// The fake provider only exists on a dev or
// preview deployment (`PAYMENTS_FAKE_PROVIDER=1` + `AUTH_DEV_OTP=true`, set by
// e2e.yml). The spec reads the deployment's ACTUAL configuration
// (`payments.checkout.paymentOptions`, the very query the page reads) and
// exercises the corresponding path:
//  - a provider is available: full flow;
//  - none: the page must SAY so and offer an alternative, with no dead
//    button. The payment flow is then annotated as not run.
//
// DEDICATED SESSION (`paiements`, admin rank): the file donates, re-reads its receipt
// then opens /admin/finances — it holds its session from start to finish.

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

async function donner(
  page: Page,
  montant: number,
  devise: 'EUR' | 'USD' = 'EUR',
) {
  await page.goto('/fr/don');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Faire un don' }),
  ).toBeVisible();
  // Scope: the donation form (the footer carries its own
  // "E-mail" field, the newsletter one).
  const form = page.getByRole('form', { name: 'Formulaire de don' });
  if (devise === 'USD') {
    await form
      .getByText('Dollar des États-Unis (USD)', { exact: true })
      .click();
    await expect(
      form.getByRole('radio', {
        name: 'Dollar des États-Unis (USD)',
      }),
    ).toBeChecked();
  }
  await form.getByText('Autre montant', { exact: true }).click();
  await form.getByLabel(/Montant libre/).fill(String(montant));
  // The signed-in account's address pre-fills the field: the donation is linked
  // to the account, and its receipt will show up in the member area.
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
    // Degraded path: no provider for the euro on this deployment.
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

  // A distinct amount on each run: it is what finds the row.
  const montant = 6 + (Date.now() % 90);
  await donner(page, montant);

  // The "provider" page: the requested amount, then the payment.
  await expect(page.getByTestId('sim-amount')).toContainText(String(montant));
  await page.getByRole('button', { name: 'Payer (simulation)' }).click();

  // Return: the state comes from the webhook recorded in the database, not from the URL.
  await page.waitForURL(/\/fr\/paiement\/retour\?ref=.*statut=succes/);
  await expect(
    page.getByRole('heading', { name: 'Merci pour votre don !' }),
  ).toBeVisible();

  // Member area: the transaction, then its receipt (the PDF is produced by a
  // scheduled action — it may arrive a second or two later).
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

  // The receipt opens and it is a PDF.
  // We capture the REQUEST for the file rather than the tab's address:
  // CI's headless Chromium DOWNLOADS a PDF instead of
  // displaying it, and the opened tab stays without an address (seen on 28/09), whereas
  // local Chromium displays it. The request, on the other hand, goes out in both cases.
  const [fichier, pdf] = await Promise.all([
    context.waitForEvent('request', (r) => r.url().includes('/api/storage/')),
    context.waitForEvent('page'),
    recu.click(),
  ]);
  const reponse = await request.get(fichier.url());
  expect(reponse.ok()).toBe(true);
  const corps = await reponse.body();
  expect(
    corps.subarray(0, 5).toString(),
    `${fichier.url()} — ${reponse.headers()['content-type']} — ${corps.subarray(0, 120).toString()}`,
  ).toBe('%PDF-');
  await pdf.close();

  // Back office: the transaction, found by its receipt number.
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

  await donner(page, 7);
  await page.getByRole('button', { name: 'Annuler' }).click();
  await page.waitForURL(/\/fr\/paiement\/retour\?ref=.*statut=annule/);
  await expect(
    page.getByRole('heading', { name: 'Paiement annulé' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Réessayer' })).toBeVisible();
});

test('don en dollars : même parcours, la ligne et le montant restent en USD', async ({
  page,
}) => {
  const options = await paymentOptions();
  const dollar = options.currencies.find((c) => c.currency === 'USD');
  test.skip(
    dollar?.provider !== 'fake',
    'prestataire factice absent sur ce déploiement',
  );

  const montant = 6 + (Date.now() % 90);
  await donner(page, montant, 'USD');
  await expect(page.getByTestId('sim-amount')).toContainText('USD');
  await page.getByRole('button', { name: 'Payer (simulation)' }).click();
  await page.waitForURL(/\/fr\/paiement\/retour\?ref=.*statut=succes/);
  await expect(
    page.getByRole('heading', { name: 'Merci pour votre don !' }),
  ).toBeVisible();

  await page.getByRole('link', { name: 'Voir mes reçus' }).click();
  await page.waitForURL(/\/fr\/espace-membre\/cotisations/);
  await expect(
    page
      .getByRole('row')
      .filter({ hasText: new RegExp(`${montant},00\\s?USD`) })
      .first(),
  ).toBeVisible();
});
