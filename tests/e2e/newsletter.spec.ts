import { test, expect } from '@playwright/test';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';

test.use({ locale: 'fr-FR' });

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// F-18 — Newsletter : inscription -> succès + stockage Convex réel.
test('newsletter : inscription valide -> succès + stockage (F-18)', async ({
  page,
}) => {
  const email = `e2e_nl_${Date.now()}@democracytogether.test`;
  await page.goto('/fr/newsletter');

  await page.getByLabel('Votre adresse e-mail').fill(email);
  await page.getByRole('button', { name: "S'inscrire" }).click();

  await expect(
    page.getByText(/Votre inscription est bien prise en compte/),
  ).toBeVisible();

  // vérifie le stockage réel (lecture dev, garde AUTH_DEV_OTP)
  expect(await convex.query(api.newsletter.isSubscribed, { email })).toBe(true);
});

test('newsletter : adresse invalide bloquée (F-18)', async ({ page }) => {
  await page.goto('/fr/newsletter');
  await page.getByLabel('Votre adresse e-mail').fill('pas-un-email');
  await page.getByRole('button', { name: "S'inscrire" }).click();
  await expect(page.getByText(/adresse e-mail valide/)).toBeVisible();
});
