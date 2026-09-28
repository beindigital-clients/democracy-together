import { test, expect } from '@playwright/test';

// Security — HTTP headers (defense in depth). Checks that they are present on
// public pages, and that the CSP is excluded on the Sanity Studio.
test('en-têtes de sécurité sur les pages publiques', async ({ request }) => {
  const res = await request.get('/fr');
  const h = res.headers();

  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['x-frame-options']).toBe('SAMEORIGIN');
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(h['strict-transport-security']).toContain('max-age=');
  expect(h['cross-origin-opener-policy']).toBe('same-origin');
  expect(h['permissions-policy']).toContain('geolocation=()');

  const csp = h['content-security-policy'] ?? '';
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'self'");
  expect(csp).toContain("object-src 'none'");
  // PER DIRECTIVE, not on the whole string: `toContain('*.convex.cloud')`
  // passed thanks to `connect-src` while `img-src` OMITTED that origin —
  // the test was green, and the browser refused every illustration in the
  // translated PDFs, served from Convex storage. A check that does not
  // distinguish directives does not guard what it claims to guard.
  const directive = (nom: string) =>
    csp
      .split(';')
      .map((d) => d.trim())
      .find((d) => d.startsWith(`${nom} `)) ?? '';

  expect(directive('connect-src'), 'sync temps réel Convex').toContain(
    'https://*.convex.cloud',
  );
  expect(
    directive('img-src'),
    'illustrations extraites des PDF, servies par le stockage Convex',
  ).toContain('https://*.convex.cloud');
  expect(directive('img-src'), 'images Sanity').toContain(
    'https://cdn.sanity.io',
  );
});

test('le Studio Sanity garde les en-têtes de base mais est exclu de la CSP', async ({
  request,
}) => {
  const res = await request.get('/studio');
  const h = res.headers();
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['content-security-policy']).toBeUndefined();
});
