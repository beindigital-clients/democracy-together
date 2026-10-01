import { test, expect, type Browser, type Page } from '@playwright/test';
import { provisionUser, signInWithCode } from './_helpers';

// SOCIAL NETWORK — main two-member flow ("social" workstream):
//
//   A fills in their profile as PUBLIC; the `/membres/<handle>` page responds to an
//   anonymous visitor, indexable; B finds A in the people directory,
//   follows them, writes to them; A sees the "unread" badge in the header, opens the
//   conversation and replies; B receives the reply IN REAL TIME, without reloading.
//   Then A switches their profile to PRIVATE: the same address responds 404.
//
// Two FRESH accounts per run (timestamped addresses): the file holds
// its two sessions from start to finish, and no shared session from
// `_sessions.ts` is involved ("one file, its own session" rule).

const STAMP = Date.now();
const EMAIL_A = `e2e_social_a_${STAMP}@democracytogether.test`;
const EMAIL_B = `e2e_social_b_${STAMP}@democracytogether.test`;
const NOM_A = `Awa Social ${STAMP}`;
const NOM_B = `Bob Social ${STAMP}`;
const HANDLE_A = `awa-social-${STAMP}`;

test.describe.configure({ mode: 'serial' });

// Fresh context WITH the project's cookie consent: without it, the F-09
// banner would intercept clicks.
async function membre(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext({
    locale: 'fr-FR',
    storageState: test.info().project.use.storageState,
  });
  const page = await context.newPage();
  await signInWithCode(page, email);
  return page;
}

async function creerProfil(
  page: Page,
  nom: string,
  visibilite: RegExp,
): Promise<void> {
  await page.goto('/fr/espace-membre/profil');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Mon profil' }),
  ).toBeVisible();
  await page.getByLabel('Nom affiché').fill(nom);
  await page.getByLabel('Fonction').fill('Chercheuse en gouvernance');
  await page.getByRole('radio', { name: visibilite }).check();
  await page
    .getByRole('button', { name: /Créer mon profil|Enregistrer le profil/ })
    .click();
  await expect(page.getByText('Profil enregistré.')).toBeVisible();
}

test('A publie son profil, B le trouve, le suit et lui écrit ; A voit le non-lu et répond', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  await provisionUser(EMAIL_A, 'membre');
  await provisionUser(EMAIL_B, 'membre');

  // --- A: public profile -------------------------------------------------------
  const pageA = await membre(browser, EMAIL_A);
  await creerProfil(pageA, NOM_A, /^Public/);

  // --- An ANONYMOUS visitor sees the page, indexable ----------------------------
  const anonyme = await browser.newContext({
    locale: 'fr-FR',
    storageState: test.info().project.use.storageState,
  });
  const visiteur = await anonyme.newPage();
  const reponse = await visiteur.goto(`/fr/membres/${HANDLE_A}`);
  expect(reponse?.status()).toBe(200);
  await expect(
    visiteur.getByRole('heading', { level: 1, name: NOM_A }),
  ).toBeVisible();
  await expect(visiteur.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    new RegExp(`/fr/membres/${HANDLE_A}$`),
  );
  await expect(
    visiteur.locator('link[rel="alternate"][hreflang="ar"]'),
  ).toHaveAttribute('href', new RegExp(`/ar/membres/${HANDLE_A}$`));
  // No action button for an anonymous visitor.
  await expect(visiteur.getByRole('button', { name: 'Suivre' })).toHaveCount(0);

  // --- B: profile (members only), search, follow, message -----------------------
  const pageB = await membre(browser, EMAIL_B);
  await creerProfil(pageB, NOM_B, /^Membres du réseau/);
  await pageB.goto('/fr/membres');
  await pageB.getByLabel('Rechercher une personne').fill(NOM_A);
  await pageB.getByRole('link', { name: new RegExp(NOM_A) }).click();
  await expect(pageB).toHaveURL(new RegExp(`/fr/membres/${HANDLE_A}$`));

  await pageB.getByRole('button', { name: 'Suivre', exact: true }).click();
  await expect(
    pageB.getByRole('button', { name: 'Ne plus suivre' }),
  ).toBeVisible();

  await pageB.getByRole('link', { name: 'Écrire' }).click();
  await expect(pageB).toHaveURL(/\/espace-membre\/messages\?to=/);
  await pageB
    .getByLabel('Votre message')
    .fill('Bonjour Awa, ravi de vous lire.');
  await pageB.getByRole('button', { name: 'Envoyer' }).click();
  await expect(pageB).toHaveURL(/\/espace-membre\/messages\?c=/);
  await expect(
    pageB.getByText('Bonjour Awa, ravi de vous lire.', { exact: true }),
  ).toBeVisible();

  // --- A: unread badge in the header, reading, reply -----------------------------
  await pageA.goto('/fr/espace-membre');
  const pastille = pageA.getByRole('link', {
    name: /Messages, 1 conversation non lue/,
  });
  await expect(pastille).toBeVisible({ timeout: 20_000 });
  await pastille.click();
  await pageA
    .getByRole('link', { name: new RegExp(NOM_B) })
    .first()
    .click();
  await expect(
    pageA.getByText('Bonjour Awa, ravi de vous lire.', { exact: true }),
  ).toBeVisible();
  // Opening the thread counts as reading: the badge goes away.
  await expect(
    pageA.getByRole('link', { name: 'Messages', exact: true }).first(),
  ).toBeVisible({ timeout: 20_000 });

  await pageA.getByLabel('Votre message').fill('Merci Bob, avec plaisir.');
  await pageA.getByRole('button', { name: 'Envoyer' }).click();

  // --- B receives the reply without reloading (real time) -----------------------
  await expect(
    pageB.getByText('Merci Bob, avec plaisir.', { exact: true }).last(),
  ).toBeVisible({
    timeout: 20_000,
  });

  await anonyme.close();
  await pageA.context().close();
  await pageB.context().close();
});

// The messenger gestures, both sides open on the same conversation: "Seen",
// "is typing…", Enter to send, reply, reaction and correction — each one
// seen by the OTHER person without reloading.
test('messagerie : Vu, saisie en cours, Entrée, réponse, réaction, modification', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const pageA = await membre(browser, EMAIL_A);
  const pageB = await membre(browser, EMAIL_B);
  for (const page of [pageA, pageB]) {
    await page.goto('/fr/espace-membre/messages');
  }
  await pageA
    .getByRole('link', { name: new RegExp(NOM_B) })
    .first()
    .click();
  await pageB
    .getByRole('link', { name: new RegExp(NOM_A) })
    .first()
    .click();

  // A read B's first message in the previous test: B sees "Vu".
  await expect(pageB.getByText('Vu', { exact: true })).toBeVisible({
    timeout: 20_000,
  });

  // B types without sending: A sees "… écrit…".
  const composerB = pageB.getByLabel('Votre message');
  await composerB.fill('Entrée envoie');
  await expect(pageA.getByText(`${NOM_B} écrit…`)).toBeVisible({
    timeout: 20_000,
  });

  // Enter sends (Shift+Enter would only break the line).
  await composerB.press('Enter');
  await expect(composerB).toHaveValue('');
  const recu = pageA
    .getByRole('log')
    .locator('li', { hasText: 'Entrée envoie' })
    .filter({ hasNotText: 'Réponse citée' });
  await expect(recu).toBeVisible({ timeout: 20_000 });
  await expect(pageA.getByText(`${NOM_B} écrit…`)).toHaveCount(0);

  // A replies to that precise message.
  await recu.hover();
  await recu.getByRole('button', { name: 'Répondre' }).click();
  await expect(pageA.getByText(`Réponse à ${NOM_B}`)).toBeVisible();
  const composerA = pageA.getByLabel('Votre message');
  await composerA.fill('Réponse citée');
  await composerA.press('Enter');
  const reponse = pageB
    .getByRole('log')
    .locator('li', { hasText: 'Réponse citée' })
    .last();
  await expect(reponse).toBeVisible({ timeout: 20_000 });
  await expect(reponse.getByText('En réponse à vous')).toBeVisible();

  // B reacts to it; A sees the reaction.
  await reponse.hover();
  await reponse.getByRole('button', { name: 'Réagir' }).click();
  await pageB.getByRole('menuitem', { name: '👍' }).click();
  await expect(
    pageA
      .getByRole('log')
      .locator('li', { hasText: 'Réponse citée' })
      .last()
      .getByRole('button', { name: 'Réactions : 👍' }),
  ).toBeVisible({ timeout: 20_000 });

  // B corrects their own message; A sees the new text, marked "modifié".
  // The reply quotes this message: skip the bubble that only cites it.
  const mien = pageB
    .getByRole('log')
    .locator('li', { hasText: 'Entrée envoie' })
    .filter({ hasNotText: 'Réponse citée' });
  await mien.hover();
  await mien.getByRole('button', { name: "Plus d'actions" }).click();
  await pageB.getByRole('menuitem', { name: 'Modifier' }).click();
  await expect(composerB).toHaveValue('Entrée envoie');
  await composerB.fill('Entrée envoie, corrigé');
  await composerB.press('Enter');
  const corrige = pageA
    .getByRole('log')
    .locator('li', { hasText: 'Entrée envoie, corrigé' })
    .filter({ hasNotText: 'Réponse citée' });
  await expect(corrige).toBeVisible({ timeout: 20_000 });
  await expect(corrige.getByText('modifié', { exact: true })).toBeVisible();

  await pageA.context().close();
  await pageB.context().close();
});

test('un profil passé en privé répond 404, comme une adresse inconnue', async ({
  browser,
}) => {
  const pageA = await membre(browser, EMAIL_A);
  await creerProfil(pageA, NOM_A, /^Privé/);

  const anonyme = await browser.newContext({ locale: 'fr-FR' });
  const visiteur = await anonyme.newPage();
  const prive = await visiteur.goto(`/fr/membres/${HANDLE_A}`);
  expect(prive?.status()).toBe(404);
  await expect(
    visiteur.getByRole('heading', { name: 'Profil introuvable' }),
  ).toBeVisible();
  const inconnu = await visiteur.goto(`/fr/membres/personne-${STAMP}`);
  expect(inconnu?.status()).toBe(404);

  await anonyme.close();
  await pageA.context().close();
});
