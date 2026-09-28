import { test, expect } from '@playwright/test';

const BASE = process.env.AUDIT_BASE_URL ?? 'http://localhost:3000';
const CIBLE = '/fr/actualites/un-article-quelconque';

// F-10 — the only page backed by Sanity, when Sanity does not respond.
//
// PRECONDITION: the audit suite runs against a build without
// `NEXT_PUBLIC_SANITY_PROJECT_ID` (see § 6 of the report). `sanity/env.ts`
// then falls back to the `placeholder` project, whose API does not exist: every
// request fails, and that is exactly the case these tests measure.
//
// NO conditional `test.skip` here, and that is deliberate. The first version
// detected the degraded path by looking for `noindex` in the served HTML.
// Measured: Next's default error page ALSO emits `noindex`.
// So the condition did not distinguish "fixed and degraded" from "broken" —
// it detected nothing at all. A detector that reads the output of the fix
// it is supposed to condition cannot do otherwise.
//
// The whole audit suite already assumes this environment (`_routes.ts` excludes
// Convex routes for the same reason); against a reachable Sanity, these
// tests go loudly red, and the header above says why.
//
// Measured before the fix: 500 with ZERO characters in the served HTML. The
// `error.tsx` boundary is a CLIENT component; its content only arrives
// via the RSC payload. A blank page, then, for anyone not running
// JavaScript — whereas the same outage on /fr/bibliotheque/… already rendered
// 671 readable characters since F-02. Two backends, two behaviors.

test('Sanity muet : la page reste lisible SANS JavaScript', async ({
  browser,
}) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  const res = await page.goto(`${BASE}${CIBLE}`);
  const texte = (await page.locator('body').innerText()).trim();
  await ctx.close();

  console.log(`[sanity-ko] statut=${res?.status()} ${texte.length} caractères`);
  // 200 and not 500: the visitor keeps the header, the navigation and a way back
  // to the list. A 500 would be defensible, but it renders NOTHING without JS.
  expect(res?.status()).toBe(200);
  expect(texte.length).toBeGreaterThan(200);
});

test('Sanity muet : le rendu dégradé n’est pas indexable', async ({
  request,
}) => {
  const html = await (await request.get(CIBLE)).text();
  const robots = /<meta name="robots" content="([^"]*)"/.exec(html)?.[1];
  console.log(`[sanity-ko] robots: ${robots}`);
  // Without this noindex, a search engine crawling during the outage would replace
  // the article with the "unavailable" panel in its index.
  expect(robots).toContain('noindex');
  expect(robots).toContain('follow');
});

test('la LISTE dégradait déjà, et continue', async ({ request }) => {
  const res = await request.get('/fr/actualites');
  expect(res.status()).toBe(200);
});
