import { test, expect } from '@playwright/test';

test('une thématique inexistante rend une 404 localisée', async ({ page }) => {
  const r = await page.goto('/fr/thematiques/inexistant-xyz');
  expect(r?.status(), 'doit être un vrai 404').toBe(404);
  const texte = (await page.locator('body').innerText()).toLowerCase();
  expect(texte.length).toBeGreaterThan(40);
});
