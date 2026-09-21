import { test, expect } from '@playwright/test';

test('robots.txt est servi et référence le sitemap', async ({ request }) => {
  const r = await request.get('/robots.txt');
  expect(r.status()).toBe(200);
  expect((await r.text()).toLowerCase()).toContain('sitemap');
});

test('sitemap.xml est servi, bien formé, et ses URLs répondent', async ({
  request,
}) => {
  const r = await request.get('/sitemap.xml');
  expect(r.status()).toBe(200);
  const xml = await r.text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(urls.length, 'sitemap vide').toBeGreaterThan(0);
  console.log(`[sitemap] ${urls.length} URLs déclarées`);

  // Échantillon : les 12 premières, pour ne pas transformer l'audit en crawl.
  const echantillon = urls.slice(0, 12);
  const morts: string[] = [];
  for (const u of echantillon) {
    const chemin = new URL(u).pathname;
    const res = await request.get(chemin, { maxRedirects: 0 });
    if (res.status() >= 400) morts.push(`${chemin} -> ${res.status()}`);
  }
  expect(morts, `URLs de sitemap en erreur : ${morts.join(', ')}`).toEqual([]);
});
