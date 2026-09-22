import { test, expect } from '@playwright/test';

test('une thématique inexistante rend une 404 localisée', async ({ page }) => {
  const r = await page.goto('/fr/thematiques/inexistant-xyz');
  expect(r?.status(), 'doit être un vrai 404').toBe(404);
  // Assertion qui RÉESSAIE : sur une 404 localisée, le texte n'existe qu'une
  // fois la charge utile RSC appliquée par le client (F-06). Un `innerText()`
  // lu une seule fois après `goto` est une course — mesuré, ce test a rendu
  // `0` caractère sur une campagne et le texte complet sur la suivante, même
  // serveur, même build.
  await expect(page.locator('body')).toContainText('Page introuvable');
});
