import { test, expect } from '@playwright/test';

// F-07 — SEO : sitemap.xml et robots.txt servis à la racine (non interceptés
// par le proxy next-intl, qui ignore les chemins avec extension).
test('sitemap.xml : pages clés bilingues + alternates hreflang (F-07)', async ({
  request,
}) => {
  const res = await request.get('/sitemap.xml');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('xml');

  const body = await res.text();
  // pages publiques, dans les deux langues
  expect(body).toContain('/fr/bibliotheque');
  expect(body).toContain('/en/a-propos');
  expect(body).toContain('/fr/le-reseau');
  // alternates hreflang
  expect(body).toContain('hreflang="x-default"');
  expect(body).toContain('hreflang="en"');
  // jamais de zone privée dans le sitemap
  expect(body).not.toContain('/admin');
  expect(body).not.toContain('/espace-membre');
});

test('robots.txt : sitemap déclaré + zones privées interdites (F-07)', async ({
  request,
}) => {
  const res = await request.get('/robots.txt');
  expect(res.status()).toBe(200);

  const body = await res.text();
  expect(body).toMatch(/Sitemap:\s*https?:\/\/.+\/sitemap\.xml/);
  expect(body).toContain('Disallow: /fr/admin');
  expect(body).toContain('Disallow: /en/espace-membre');
  expect(body).toContain('Disallow: /studio');
});
