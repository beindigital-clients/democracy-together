import { test, expect } from '@playwright/test';

// Ces specs ouvrent leur PROPRE contexte (JavaScript désactivé), qui ne suit
// pas la `baseURL` du projet : l'adresse doit donc être absolue, et suivre le
// port réellement servi.
const BASE = process.env.AUDIT_BASE_URL ?? 'http://localhost:3000';
import { PUBLIQUES } from './_routes';

// Sans JavaScript : la régression #1 documentée dans TESTING.md (contenu bloqué
// à opacity:0, mentions légales entièrement blanches). Le dépôt tient ce point
// par un test unitaire (reveal-nojs) ; on le mesure ici sur le rendu réel.
for (const route of PUBLIQUES) {
  test(`sans JS ${route || '/'}`, async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    const r = await page.goto(`${BASE}/fr${route}`);
    const statut = r?.status();
    const texte = (await page.locator('body').innerText()).trim();
    console.log(
      `[sans-js] ${route || '/'} statut=${statut} caracteres=${texte.length}`,
    );
    await ctx.close();
    expect(statut, `${route} : statut`).toBe(200);
    expect(
      texte.length,
      `${route} : page vide sans JavaScript`,
    ).toBeGreaterThan(40);
  });
}
