import { test, expect } from '@playwright/test';
import { isNewsletterSubscribed } from './_helpers';

test.use({ locale: 'fr-FR' });

// F-18 — Newsletter: signup -> success + real Convex storage.
test('newsletter : inscription valide -> succès + stockage (F-18)', async ({
  page,
}) => {
  const email = `e2e_nl_${Date.now()}@democracytogether.test`;
  await page.goto('/fr/newsletter');

  await page.getByLabel('Votre adresse e-mail').fill(email);
  await page.getByRole('button', { name: "S'inscrire" }).click();

  await expect(
    page.getByText(/Un e-mail de confirmation vient de vous être envoyé/),
  ).toBeVisible();

  // checks the real storage (dev read, AUTH_DEV_OTP guard)
  expect(isNewsletterSubscribed(email)).toBe(true);
});

test('newsletter : adresse invalide bloquée (F-18)', async ({ page }) => {
  await page.goto('/fr/newsletter');
  await page.getByLabel('Votre adresse e-mail').fill('pas-un-email');
  await page.getByRole('button', { name: "S'inscrire" }).click();
  await expect(page.getByText(/adresse e-mail valide/)).toBeVisible();
});
