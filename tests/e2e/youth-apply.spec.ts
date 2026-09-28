import { test, expect } from '@playwright/test';
import { isYouthApplicant } from './_helpers';

test.use({ locale: 'fr-FR' });

// F-58 — Youth application: form (#rejoindre on /jeunes) -> success +
// real Convex storage.
test('jeunes : candidature valide -> succès + stockage (F-58)', async ({
  page,
}) => {
  const email = `e2e_youth_${Date.now()}@democracytogether.test`;
  await page.goto('/fr/jeunes');

  // The page also carries the mentoring form (F-59): we target the
  // application section to disambiguate shared labels (name/email/country).
  const form = page.locator('#rejoindre');
  await form.getByLabel('Nom complet').fill('Awa Diop');
  await form.getByLabel('Adresse e-mail').fill(email);
  await form.getByLabel('Pays').fill('Sénégal');
  await form
    .getByLabel('Ta motivation')
    .fill('Je veux contribuer aux travaux du réseau sur la participation.');
  await form.getByRole('button', { name: 'Envoyer ma candidature' }).click();

  await expect(page.getByText(/Candidature envoyée/)).toBeVisible();
  expect(isYouthApplicant(email)).toBe(true);
});

test('jeunes : motivation manquante bloquée (F-58)', async ({ page }) => {
  await page.goto('/fr/jeunes');
  const form = page.locator('#rejoindre');
  await form.getByLabel('Nom complet').fill('Awa Diop');
  await form.getByLabel('Adresse e-mail').fill('awa@example.org');
  await form.getByLabel('Pays').fill('Sénégal');
  await form.getByLabel('Ta motivation').fill('court');
  await form.getByRole('button', { name: 'Envoyer ma candidature' }).click();
  await expect(page.getByText(/quelques mots de motivation/)).toBeVisible();
});
