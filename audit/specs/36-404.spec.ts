import { test, expect, type Page } from '@playwright/test';

const BASE = process.env.AUDIT_BASE_URL ?? 'http://localhost:3000';

// F-06 — what someone landing on a 404 sees.
//
// The repo serves TWO of them, and they do not share the same fate:
//   • address with no route at all      -> `src/app/not-found.tsx`
//   • `notFound()` from a route         -> `src/app/[locale]/not-found.tsx`
//
// Measured on Next 16.3.5: only the first is rendered in the served HTML.
// The second only arrives via the RSC payload, so only if
// JavaScript runs. Three hypotheses were ruled out by measurement
// (component suspension, file location, layout shell): it is a
// framework behavior, not a repo defect.
//
// These tests therefore hold what is GUARANTEED, and MAKE VISIBLE what is
// not — rather than recording the limitation as if it went without saying.

/**
 * Visible text of a SERVED HTML, with `<script>` and `<style>` removed — parsed by
 * the browser engine, never by a regular expression.
 *
 * This filtering IS the test, which is why it must be exact: what these
 * specs establish is that the text is in the HTML OTHER than
 * in the RSC payload — which travels precisely inside a
 * `<script>`. A block that escaped the filter would make the test PASS for the
 * wrong reason, i.e. in the exact presence of the defect F-06 is meant to
 * detect.
 *
 * The `/<script[\s\S]*?<\/script>/` that held this role saw neither an
 * uppercase `<SCRIPT>`, nor a `<script` left behind by nesting
 * (CodeQL js/bad-tag-filter and js/incomplete-multi-character-sanitization).
 * `DOMParser` parses like a browser and builds an INERT document:
 * nothing that goes through here executes.
 */
async function texteVisible(page: Page, html: string): Promise<string> {
  return page.evaluate((brut) => {
    const doc = new DOMParser().parseFromString(brut, 'text/html');
    doc.querySelectorAll('script, style').forEach((noeud) => {
      noeud.remove();
    });
    return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
  }, html);
}

// THE FILTER IS THE TEST — so it is tested too.
//
// Measured on the localized 404: "Page introuvable" appears THREE times in
// the 78,912 bytes served, inside <script> (RSC payload), for
// zero characters of visible text. A filter that lets a block through would
// therefore turn the measuring spec green in the exact presence of the defect it
// is looking for: the costliest failure a test can have.
//
// The old regular-expression filter failed on the first case
// below — measured: `<SCRIPT>` came out with its payload.
//
// ABSENT from the list, and deliberately: `<scr<script>ipt>charge</script>`.
// A browser sees NO script there — it reads a tag named "scr<script"
// then the text "ipt>charge". This string is therefore genuinely visible to
// a visitor, and requiring it to be absent would make the test lie about what it measures.
test('le filtre de scripts ne laisse pas fuir la charge utile', async ({
  page,
}) => {
  const pieges = [
    '<p>visible</p><SCRIPT>charge_rsc</SCRIPT>',
    '<p>visible</p><ScRiPt>charge_rsc</ScRiPt>',
    '<p>visible</p><script type="a>b">charge_rsc</script>',
    '<p>visible</p><script>var a = "<p>charge_rsc</p>";</script>',
    '<p>visible</p><style>p::after{content:"charge_rsc"}</style>',
  ];
  for (const piege of pieges) {
    expect(await texteVisible(page, piege), piege).toBe('visible');
  }
});

test('404 sans route : lisible dans le HTML servi', async ({
  page,
  request,
}) => {
  const res = await request.get('/fr/nimporte-quoi-du-tout');
  expect(res.status()).toBe(404);
  const body = await texteVisible(page, await res.text());
  expect(body).toContain('Page introuvable');
  expect(body).toContain('Page not found');
});

test('404 sans route : lisible SANS JavaScript', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  const res = await page.goto(`${BASE}/fr/nimporte-quoi-du-tout`);
  expect(res?.status()).toBe(404);
  const texte = (await page.locator('body').innerText()).trim();
  await ctx.close();
  console.log(`[404] sans route, sans JS : ${texte.length} caractères`);
  expect(texte.length).toBeGreaterThan(80);
});

test('404 sans route : les deux langues et un retour vers chacune', async ({
  page,
}) => {
  await page.goto('/fr/nimporte-quoi-du-tout');
  await expect(page.getByRole('link', { name: 'Accueil' })).toHaveAttribute(
    'href',
    '/fr',
  );
  await expect(page.getByRole('link', { name: 'Home' })).toHaveAttribute(
    'href',
    '/en',
  );
});

test('404 localisée : lisible avec JavaScript', async ({ page }) => {
  const res = await page.goto('/fr/rapports/9999');
  expect(res?.status()).toBe(404);
  // RETRYING assertion, not an `innerText()` read once: on
  // this particular 404 the text only exists once the RSC payload has been applied
  // by the client — that is the whole point of F-06. Reading right after `goto`, which
  // returns on the `load` event, is therefore a race: measured, the same
  // test on the same server passed on desktop then failed on the next run,
  // the `<body>` still being empty.
  await expect(page.locator('body')).toContainText('Page introuvable');
});

// No assertion here: we MEASURE the framework's limitation and print it. The
// day Next renders this case in the HTML, this number will stop being zero and we
// will see it in the report — without a red test having had to announce it.
test('404 localisée : ce que le HTML servi en contient (limite mesurée)', async ({
  page,
  request,
}) => {
  const html = await (await request.get('/fr/rapports/9999')).text();
  const body = await texteVisible(page, html);
  console.log(
    `[404] localisée, HTML servi : ${body.length} caractères ` +
      `(0 = la limite Next décrite dans src/app/not-found.tsx)`,
  );
  expect(html.length).toBeGreaterThan(0);
});
