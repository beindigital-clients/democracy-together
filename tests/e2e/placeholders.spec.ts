import { test, expect } from '@playwright/test';

test.use({ locale: 'fr-FR' });

// F-04 — les routes liées par la nav, le pied de page et le CTA du hero ne
// renvoient jamais 404. La dernière route en attente (« Bientôt ») était
// `/don` : depuis le chantier paiements (27/09), elle sert le vrai
// formulaire de don. Le test garde la promesse — 200, jamais 404 — et
// vérifie qu'il ne reste AUCUN écran « Bientôt » sur ce parcours.
const ROUTES = ['/fr/don'];

test('routes du parcours principal : 200, et plus aucun « Bientôt » (F-04)', async ({
  page,
}) => {
  for (const route of ROUTES) {
    const res = await page.goto(route);
    expect(res?.status(), route).toBe(200);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Faire un don' }),
    ).toBeVisible();
    await expect(page.getByText(/Bientôt/)).toHaveCount(0);
  }
});
