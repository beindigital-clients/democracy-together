import { test, expect } from '@playwright/test';

// Sécurité — en-têtes HTTP (défense en profondeur). Vérifie leur présence sur
// les pages publiques, et l'exclusion de la CSP sur le Studio Sanity.
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
  // PAR DIRECTIVE, et non sur la chaîne entière : `toContain('*.convex.cloud')`
  // passait grâce à `connect-src` pendant qu'`img-src` OMETTAIT cette origine —
  // le test était vert, et le navigateur refusait toutes les illustrations des
  // PDF traduits, servies depuis le stockage Convex. Un contrôle qui ne
  // distingue pas les directives ne garde pas ce qu'il prétend garder.
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
