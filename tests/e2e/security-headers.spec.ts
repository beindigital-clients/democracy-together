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
  // Convex (sync + stockage) et images Sanity autorisés.
  expect(csp).toContain('*.convex.cloud');
  expect(csp).toContain('https://cdn.sanity.io');
});

test('le Studio Sanity garde les en-têtes de base mais est exclu de la CSP', async ({
  request,
}) => {
  const res = await request.get('/studio');
  const h = res.headers();
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['content-security-policy']).toBeUndefined();
});
