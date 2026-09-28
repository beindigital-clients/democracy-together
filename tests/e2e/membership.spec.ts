import { test, expect } from '@playwright/test';
import { seedDirectory, latestApplicationForEmail } from './_helpers';
import { expectFieldError, expectNoFieldError } from './_fields';

test.use({ locale: 'fr-FR' });

test.beforeAll(async () => {
  await seedDirectory(); // for the link-from-a-profile test
});

test('adhésion : candidature -> succès + stockage (F-22)', async ({ page }) => {
  const email = `e2e_adh_${Date.now()}@democracytogether.test`;
  await page.goto('/fr/adhesion');

  await page.getByLabel('Nom du think tank').fill('Institut Démo Sahel');
  await page.getByLabel('E-mail de contact').fill(email);
  await page.getByLabel('Pays').fill('Sénégal');
  await page
    .getByLabel('Présentation (optionnel)')
    .fill('Nous travaillons sur la gouvernance démocratique au Sahel.');
  await page.getByRole('button', { name: 'Envoyer ma candidature' }).click();

  await expect(
    page.getByRole('heading', { name: 'Candidature reçue' }),
  ).toBeVisible();

  const stored = latestApplicationForEmail(email);
  expect(stored?.organizationName).toBe('Institut Démo Sahel');
  expect(stored?.type).toBe('organisation');
  expect(stored?.status).toBe('pending');
});

test('adhésion : bascule individu adapte le libellé (F-22)', async ({
  page,
}) => {
  await page.goto('/fr/adhesion');
  await expect(page.getByLabel('Nom du think tank')).toBeVisible();
  await page.getByText('Chercheur / individuel').click();
  await expect(page.getByLabel('Nom et prénom')).toBeVisible();
});

// The form cited by issue #37: three causes of rejection, a single message.
// Each one now points to its field — and the introduction, the longest field
// to write, survives the rejection.
test('adhésion : chaque champ fautif porte son message (F-22, #37)', async ({
  page,
}) => {
  const presentation =
    'Nous travaillons sur la gouvernance démocratique au Sahel.';
  await page.goto('/fr/adhesion');
  await page.getByLabel('Nom du think tank').fill('X');
  await page.getByLabel('E-mail de contact').fill('pas-un-email');
  await page.getByLabel('Pays').fill('Sénégal');
  await page.getByLabel('Présentation (optionnel)').fill(presentation);
  await page.getByRole('button', { name: 'Envoyer ma candidature' }).click();

  const name = page.getByLabel('Nom du think tank');
  await expectFieldError(page, name, /Indiquez un nom/);
  await expectFieldError(
    page,
    page.getByLabel('E-mail de contact'),
    /adresse e-mail de contact valide/,
  );
  // The country is correct: it is not flagged.
  await expectNoFieldError(page.getByLabel('Pays'));
  // The first invalid field takes focus.
  await expect(name).toBeFocused();
  // Nothing is lost, the introduction first.
  await expect(page.getByLabel('Présentation (optionnel)')).toHaveValue(
    presentation,
  );

  await expect(
    page.getByRole('heading', { name: 'Candidature reçue' }),
  ).toHaveCount(0);
});

test('fiche membre -> CTA candidature mène à /adhesion (F-21 → F-22)', async ({
  page,
}) => {
  await page.goto('/fr/le-reseau/nairobi-democratic-futures');
  await page.getByRole('link', { name: 'Déposer une candidature' }).click();
  await expect(page).toHaveURL(/\/fr\/adhesion$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Rejoindre le réseau' }),
  ).toBeVisible();
});
