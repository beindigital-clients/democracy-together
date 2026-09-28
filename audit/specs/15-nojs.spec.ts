import { test, expect } from '@playwright/test';

// These specs open their OWN context (JavaScript disabled), which does not follow
// the project's `baseURL`: the address must therefore be absolute, and follow the
// port actually served.
const BASE = process.env.AUDIT_BASE_URL ?? 'http://localhost:3000';
import { PUBLIQUES } from './_routes';

// Without JavaScript: regression #1 documented in TESTING.md (content stuck
// at opacity:0, legal notice entirely blank). The repo holds this point
// with a unit test (reveal-nojs); here we measure it on the real render.
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
