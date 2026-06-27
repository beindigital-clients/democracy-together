import { test, expect } from '@playwright/test';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../convex/_generated/api';

test.use({ locale: 'fr-FR' });

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

test('contact : envoi valide -> succès + message stocké (F-17)', async ({
  page,
}) => {
  const email = `e2e_contact_${Date.now()}@democracytogether.test`;
  await page.goto('/fr/contact');

  await page.getByLabel('Nom').fill('Awa Diop');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Sujet').fill('Partenariat think tank');
  await page
    .getByLabel('Message')
    .fill('Bonjour, notre institut souhaite rejoindre le réseau Democracy Together.');
  await page.getByRole('button', { name: 'Envoyer le message' }).click();

  await expect(
    page.getByRole('heading', { name: 'Message envoyé' }),
  ).toBeVisible();

  // vérifie le stockage réel côté Convex (lecture dev, garde AUTH_DEV_OTP)
  const stored = await convex.query(api.contact.latestForEmail, { email });
  expect(stored?.subject).toBe('Partenariat think tank');
  expect(stored?.handled).toBe(false);
});

test('contact : validation bloque un envoi invalide (F-17)', async ({ page }) => {
  await page.goto('/fr/contact');

  await page.getByLabel('Nom').fill('Awa');
  await page.getByLabel('E-mail').fill('pas-un-email');
  await page.getByLabel('Sujet').fill('Sujet');
  await page.getByLabel('Message').fill('Un message suffisamment long ici.');
  await page.getByRole('button', { name: 'Envoyer le message' }).click();

  // (role=alert existe aussi via le route-announcer Next : on cible le message)
  await expect(page.getByText(/Veuillez renseigner tous les champs/)).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Message envoyé' }),
  ).toHaveCount(0);
});
