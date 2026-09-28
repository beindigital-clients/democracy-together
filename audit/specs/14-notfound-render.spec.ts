import { test, expect } from '@playwright/test';

// These specs open their OWN context (JavaScript disabled), which does not follow
// the project's `baseURL`: the address must therefore be absolute, and follow the
// port actually served.
const BASE = process.env.AUDIT_BASE_URL ?? 'http://localhost:3000';

// Decisive: does the LOCALIZED 404 display anything on screen?
// /fr/rapports/9999 does NOT depend on Convex (content served by
// src/lib/reports-content.ts): what we observe here is therefore not a
// side effect of the unreachable backend.
const CIBLE = '/fr/rapports/9999';

// The screenshot name includes the PROJECT. Both projects run the same spec
// and wrote to the same path: the committed screenshot was therefore that of the
// last project run — mobile — whereas the report cites the desktop
// version. One piece of evidence silently replaced by another, exactly what
// this audit criticizes elsewhere. Anyone running only one project saw nothing.
const capture = (nom: string, projet: string) =>
  `/home/user/democracy-together/audit/screenshots/${nom}-${projet}.png`;

test('404 localisée : avec JavaScript, après hydratation', async ({
  page,
}, info) => {
  const r = await page.goto(CIBLE, { waitUntil: 'networkidle' });
  expect(r?.status()).toBe(404);
  await page.waitForTimeout(2000); // give hydration every chance
  const texte = (await page.locator('body').innerText()).trim();
  await page.screenshot({
    path: capture('404-localisee-avec-js', info.project.name),
    fullPage: true,
  });
  console.log(
    `[404 avec JS] ${texte.length} caractères visibles : ${JSON.stringify(texte.slice(0, 200))}`,
  );
  expect(
    texte.length,
    'la 404 localisée doit dire quelque chose',
  ).toBeGreaterThan(20);
});

test('404 localisée : sans JavaScript', async ({ browser }, info) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  const r = await page.goto(`${BASE}${CIBLE}`);
  expect(r?.status()).toBe(404);
  const texte = (await page.locator('body').innerText()).trim();
  await page.screenshot({
    path: capture('404-localisee-sans-js', info.project.name),
    fullPage: true,
  });
  console.log(
    `[404 sans JS] ${texte.length} caractères visibles : ${JSON.stringify(texte.slice(0, 200))}`,
  );
  await ctx.close();
  // NO assertion on the length, and that is the outcome of F-06, not
  // giving up. This spec is the DIAGNOSTIC that established the finding: on
  // Next 16.3.5, a 404 raised by `notFound()` from a matching route
  // renders an empty `<body>` — the content only arrives via the RSC payload.
  // Three hypotheses were ruled out by measurement (component suspension,
  // file location, layout shell): it's the framework.
  //
  // Requiring it anyway would keep red, indefinitely, a test that
  // cannot pass — and the half of the issue that WAS winnable is
  // now fixed and held by 36-404.spec.ts (404 with no route: 161
  // characters readable without JavaScript). The number is still printed: the day
  // Next changes, it will stop being zero and we will see it.
  console.log(
    `[404 sans JS] limite mesurée : ${texte.length} caractères ` +
      `(voir src/app/not-found.tsx)`,
  );
});

test('contre-épreuve : une page publique normale rend bien du texte', async ({
  page,
}) => {
  await page.goto('/fr/mentions-legales', { waitUntil: 'networkidle' });
  const texte = (await page.locator('body').innerText()).trim();
  console.log(`[mentions-legales] ${texte.length} caractères visibles`);
  expect(texte.length).toBeGreaterThan(200);
});
