import { test, expect } from '@playwright/test';
import { seedDirectory, latestApplicationForEmail } from './_helpers';
import { expectFieldError, expectNoFieldError } from './_fields';

test.use({ locale: 'fr-FR' });

test.beforeAll(async () => {
  await seedDirectory(); // pour le test du lien depuis une fiche
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

// Le formulaire cité par l'issue #37 : trois causes de refus, un seul message.
// Chacune porte désormais son champ — et la présentation, le champ le plus long
// à écrire, survit au refus.
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
  // Le pays est correct : il n'est pas mis en cause.
  await expectNoFieldError(page.getByLabel('Pays'));
  // Le premier champ fautif prend le focus.
  await expect(name).toBeFocused();
  // Rien n'est perdu, la présentation en premier.
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
