import { test, expect } from '@playwright/test';

test('les en-têtes de sécurité sont présents sur une réponse réelle', async ({
  request,
}) => {
  const r = await request.get('/fr');
  const h = r.headers();
  console.log('[en-têtes]', JSON.stringify(h, null, 2));

  expect(h['content-security-policy'], 'CSP absente').toBeTruthy();
  expect(h['strict-transport-security'], 'HSTS absente').toBeTruthy();
  expect(h['x-frame-options'] ?? '', 'X-Frame-Options').toBeTruthy();
  expect(h['x-content-type-options'], 'X-Content-Type-Options').toBe('nosniff');
  expect(h['referrer-policy'], 'Referrer-Policy absente').toBeTruthy();
});
