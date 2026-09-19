import { test, expect } from '@playwright/test';
import { isYouthApplicant } from './_helpers';

test.use({ locale: 'fr-FR' });


// F-58 — Candidature jeune : formulaire (#rejoindre sur /jeunes) -> succès +
// stockage Convex réel.
test('jeunes : candidature valide -> succès + stockage (F-58)', async ({
  page,
}) => {
  const email = `e2e_youth_${Date.now()}@democracytogether.test`;
  await page.goto('/fr/jeunes');

  // La page porte aussi le formulaire de mentorat (F-59) : on cible la section
  // de candidature pour lever l'ambiguïté des libellés partagés (nom/e-mail/pays).
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
