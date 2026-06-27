import { test, expect } from '@playwright/test';

test.use({ locale: 'fr-FR' });

// Les routes liées par la nav / le footer / le CTA hero ne doivent plus
// renvoyer 404 (placeholders « bientôt disponible »).
// Route encore en placeholder (don = CTA paiement, en attente du PSP). Les
// pages devenues réelles (analyses→bibliothèque, baromètre, événements, jeunes,
// pages légales F-09, newsletter) ont leur propre spec.
const ROUTES = ['/fr/don'];

test('routes placeholder : 200 + « Bientôt », jamais 404 (F-04)', async ({
  page,
}) => {
  for (const route of ROUTES) {
    const res = await page.goto(route);
    expect(res?.status(), route).toBe(200);
    await expect(page.getByText(/Bientôt/)).toBeVisible();
  }
});
