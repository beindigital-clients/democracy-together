import { test, expect, type Page } from '@playwright/test';

// Issue #36 — the footer year was the constant `2026`, hence wrong
// from 1 January 2027, on every page of the site.
//
// What this spec sees that the unit tests do not:
//
//  1. the year ACTUALLY served at the end of the chain (server component ->
//     HTML -> hydration);
//  2. the absence of a hydration mismatch — the trap in the issue. React does not
//     fail navigation over a mismatch: it REPORTS it ("Hydration failed
//     because the server rendered text didn't match the client"), then replays
//     the tree client-side. Without listening to the console and page errors, the
//     regression would be invisible here: the spec would stay green while showing the
//     right year for the wrong reason.
//
// In a production build React's messages are minified ("Minified React
// error #418") — hence the two forms in the pattern. Pattern checked against the
// real message by putting the naive fix back: it catches it.
const ECART_HYDRATATION =
  /hydrat|did not match|Minified React error #(418|423|425)/i;

function releveLesAlertes(page: Page) {
  const messages: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') messages.push(m.text());
  });
  // The hydration mismatch surfaces through `pageerror`, not `console`: listening
  // to the console alone would see nothing.
  page.on('pageerror', (e) => messages.push(e.message));
  return () => messages.filter((m) => ECART_HYDRATATION.test(m));
}

// Hydration barrier: the footer theme toggle only changes
// `data-theme` once React is in control. Before its response, a mismatch can
// still be reported — collecting alerts earlier would prove nothing.
async function attendLHydratationDuPiedDePage(page: Page) {
  const html = page.locator('html');
  const avant = await html.getAttribute('data-theme');
  await page
    .locator('footer')
    .getByRole('button', { name: /thème|theme/i })
    .click();
  await expect(html).not.toHaveAttribute('data-theme', avant ?? 'light');
}

for (const locale of ['fr', 'en'] as const) {
  test(`pied de page : année en cours, sans écart d'hydratation (${locale})`, async ({
    page,
  }) => {
    const ecarts = releveLesAlertes(page);
    await page.goto(`/${locale}`);

    await expect(page.locator('footer')).toContainText(
      `© ${new Date().getFullYear()}`,
    );

    await attendLHydratationDuPiedDePage(page);
    expect(ecarts()).toEqual([]);
  });
}

// The exact case described by the issue: server and browser are not in the
// same year — offset time zones, or a page served during the night of 31 December.
// That is where the obvious fix (`new Date().getFullYear()` when rendering a
// client component) breaks hydration. It is also, through the same mechanism, the
// case of a STATIC page whose HTML was built the previous year
// (issue #13): the browser catches up on the year after mount.
test("pied de page : navigateur en avance d'un an sur le serveur", async ({
  page,
}) => {
  const anneeServeur = new Date().getFullYear();
  const ecarts = releveLesAlertes(page);

  // `setFixedTime` freezes `Date` in the browser WITHOUT suspending timers:
  // React keeps working normally.
  await page.clock.setFixedTime(
    new Date(`${anneeServeur + 1}-01-01T00:00:30Z`),
  );
  await page.goto('/fr');

  // The served HTML carries the SERVER's year — that is what a visitor without
  // JavaScript sees, and what React hydrates against. The `<!-- -->` are the
  // text-node separators inserted by React's server render.
  const servi = await (await page.request.get('/fr')).text();
  expect(servi.replace(/<!-- -->/g, '')).toContain(`© ${anneeServeur} `);

  // After mount, the browser imposes its own (the assertion retries, so
  // it waits for the correction rather than assuming it is immediate).
  const copyright = page.locator('footer p').filter({ hasText: '©' });
  await expect(copyright).toContainText(`© ${anneeServeur + 1}`);

  await attendLHydratationDuPiedDePage(page);
  expect(ecarts()).toEqual([]);
});
