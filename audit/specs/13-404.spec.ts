import { test, expect } from '@playwright/test';

test('une thématique inexistante rend une 404 localisée', async ({ page }) => {
  const r = await page.goto('/fr/thematiques/inexistant-xyz');
  expect(r?.status(), 'doit être un vrai 404').toBe(404);
  // RETRYING assertion: on a localized 404, the text only exists
  // once the RSC payload has been applied by the client (F-06). An `innerText()`
  // read once after `goto` is a race — measured, this test rendered
  // `0` characters in one campaign and the full text in the next, same
  // server, same build.
  await expect(page.locator('body')).toContainText('Page introuvable');
});
