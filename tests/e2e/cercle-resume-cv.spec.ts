import { test, expect, type Page } from '@playwright/test';
import { SESSIONS } from './_sessions';

// CERCLE DES AMIS — the automatic CV summary, on the president's screen.
//
// Runs only where the deployment has the tool on AND the development mock
// (`CERCLE_CV_AI_ENABLED=true`, `CERCLE_CV_AI_MOCK=true`, `AUTH_DEV_OTP=true`):
// the summary is a canned fictitious one, no provider is called and no CV
// leaves. Elsewhere — the tool is off by default — the spec says so and skips,
// as the other config-dependent specs do (TESTING.md § "Sources externes").
//
// Dedicated session (`cercleAdminCvAi`): see tests/e2e/_sessions.ts.

test.use({ locale: 'fr-FR' });
test.use({ storageState: SESSIONS.cercleAdminCvAi.state });
test.describe.configure({ mode: 'serial' });
test.afterEach(async ({ context }) => {
  await context.storageState({ path: SESSIONS.cercleAdminCvAi.state });
});

const STAMP = Date.now();
const WITH = {
  name: `Avec Outil ${STAMP}`,
  email: `e2e_cvai_oui_${STAMP}@democracytogether.test`,
};
const WITHOUT = {
  name: `Sans Outil ${STAMP}`,
  email: `e2e_cvai_non_${STAMP}@democracytogether.test`,
};
const PDF = {
  name: 'cv.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.4\n% fictitious cv for tests\n'),
};

async function fill(page: Page, who: { name: string; email: string }) {
  await page.getByLabel('Nom et prénom').fill(who.name);
  await page.getByLabel('Adresse e-mail').fill(who.email);
  await page.getByLabel(/CV court/).setInputFiles(PDF);
  await page.getByRole('checkbox', { name: /J.ai lu la charte/ }).click();
  await page.getByRole('checkbox', { name: /J.ai compris/ }).click();
}

for (const [who, consent] of [
  [WITH, true],
  [WITHOUT, false],
] as const) {
  test(`un visiteur envoie sa demande ${consent ? 'avec' : 'sans'} l'outil automatique`, async ({
    browser,
  }) => {
    const ctx = await browser.newContext({
      storageState: { cookies: [], origins: [] },
      locale: 'fr-FR',
    });
    const page = await ctx.newPage();
    await page.goto('/fr/cercle');
    const notice = page.getByRole('heading', {
      name: 'Lecture du CV avec un outil automatique (facultatif)',
    });
    test.skip(
      (await notice.count()) === 0 &&
        (await page.waitForTimeout(1500).then(() => notice.count())) === 0,
      "l'outil automatique est désactivé sur ce déploiement (réglage par défaut)",
    );
    // The notice says what the tool does and does not do.
    await expect(notice).toBeVisible();
    await expect(
      page.getByText(/ne note personne, n'attribue aucune étiquette/),
    ).toBeVisible();
    await fill(page, who);
    if (consent) {
      await page
        .getByRole('checkbox', {
          name: /J'accepte que mon CV soit lu avec l'aide/,
        })
        .click();
    }
    await page.getByRole('button', { name: 'Envoyer ma demande' }).click();
    await expect(
      page.getByRole('heading', { name: 'Demande reçue' }),
    ).toBeVisible({
      timeout: 20_000,
    });
    await ctx.close();
  });
}

test('le président voit le résumé, qui ne décide de rien, seulement pour qui a accepté', async ({
  page,
}) => {
  await page.goto('/fr/admin/cercle');
  const withTool = page.getByRole('listitem').filter({ hasText: WITH.email });
  // The deployment lives long: the queue is paginated and oldest first, so the
  // requests of this run may sit on a later page.
  const more = page.getByRole('button', { name: 'Charger la suite' });
  await page
    .getByRole('list', { name: 'Demandes' })
    .waitFor({ timeout: 15_000 });
  for (let i = 0; i < 20 && (await withTool.count()) === 0; i++) {
    if (!(await more.isVisible().catch(() => false))) break;
    await more.click();
    await page.waitForTimeout(500);
  }
  test.skip(
    (await withTool.count()) === 0,
    "l'outil automatique est désactivé sur ce déploiement (réglage par défaut)",
  );
  const summary = withTool.getByRole('region', {
    name: 'Résumé automatique du CV',
  });
  await expect(summary).toBeVisible({ timeout: 20_000 });
  await expect(summary).toContainText('Résumé fictif de test');
  await expect(summary).toContainText('Master fictif en sciences politiques');
  await expect(summary).toContainText(
    'Il ne note personne et ne décide de rien',
  );
  // Nothing that looks like a verdict.
  await expect(summary).not.toContainText(
    /score|note :|risque|écart|déviance/i,
  );

  // Without consent, no summary and no mention of the tool.
  const withoutTool = page
    .getByRole('listitem')
    .filter({ hasText: WITHOUT.email });
  await expect(withoutTool).toBeVisible();
  await expect(
    withoutTool.getByRole('region', { name: 'Résumé automatique du CV' }),
  ).toHaveCount(0);

  // A refusal takes the summary away with the CV.
  await withTool.getByRole('button', { name: `Refuser ${WITH.name}` }).click();
  await page
    .getByRole('dialog', { name: `Refuser ${WITH.name} ?` })
    .getByRole('button', { name: 'Refuser la demande' })
    .click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: `La demande de ${WITH.name} est refusée` }),
  ).toBeVisible();
  await page.getByRole('radio', { name: 'Refusées' }).click();
  const refused = page.getByRole('listitem').filter({ hasText: WITH.email });
  await expect(refused).toContainText('CV supprimé.');
  await expect(
    refused.getByRole('region', { name: 'Résumé automatique du CV' }),
  ).toHaveCount(0);

  // Leave the queue as found: the second request is refused too.
  await page.getByRole('radio', { name: 'En attente' }).click();
  await page
    .getByRole('list', { name: 'Demandes' })
    .waitFor({ timeout: 15_000 });
  for (let i = 0; i < 20 && (await withoutTool.count()) === 0; i++) {
    if (!(await more.isVisible().catch(() => false))) break;
    await more.click();
    await page.waitForTimeout(500);
  }
  await withoutTool
    .getByRole('button', { name: `Refuser ${WITHOUT.name}` })
    .click();
  await page
    .getByRole('dialog', { name: `Refuser ${WITHOUT.name} ?` })
    .getByRole('button', { name: 'Refuser la demande' })
    .click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: `La demande de ${WITHOUT.name} est refusée` }),
  ).toBeVisible();
});
