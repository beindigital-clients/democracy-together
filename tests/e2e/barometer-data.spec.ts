import { test, expect } from '@playwright/test';

// F-40 — Barometer open data. The /[locale]/barometre/data/* endpoints
// serve downloadable files (CSV/JSON/codebook/geometries). Since the
// URLs carry an extension, the next-intl proxy ignores them: the locale comes from the
// path. Illustrative data.

test('open-data : CSV composite servi en pièce jointe avec en-tête (F-40)', async ({
  request,
}) => {
  const res = await request.get('/fr/barometre/data/composite.csv');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('text/csv');
  expect(res.headers()['content-disposition']).toContain('attachment');
  expect(res.headers()['content-disposition']).toContain('composite-fr.csv');

  const body = await res.text();
  expect(body.split('\r\n')[0]).toBe(
    'rank,name_en,country,region,index,category,category_label,trend_direction,trend_change',
  );
  // 14 countries + header + trailing empty line
  expect(body.trimEnd().split('\r\n')).toHaveLength(15);
});

test('open-data : JSON composite citable (méta licence + lignes) (F-40)', async ({
  request,
}) => {
  const res = await request.get('/en/barometre/data/composite.json');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/json');
  const json = await res.json();
  expect(json.meta.license).toBe('CC-BY-4.0');
  expect(json.rows).toHaveLength(14);
});

test('open-data : géométries + codebook servis (F-40)', async ({ request }) => {
  const geo = await request.get('/fr/barometre/data/geometries.json');
  expect(geo.status()).toBe(200);
  const g = await geo.json();
  expect(Array.isArray(g.countries)).toBe(true);
  expect(g.countries.length).toBeGreaterThan(20);

  const cb = await request.get('/fr/barometre/data/codebook.txt');
  expect(cb.status()).toBe(200);
  expect(cb.headers()['content-type']).toContain('text/plain');
  expect(await cb.text()).toContain('CC-BY-4.0');
});

test('open-data : fichier inconnu -> 404 (F-40)', async ({ request }) => {
  const res = await request.get('/fr/barometre/data/secret.xml');
  expect(res.status()).toBe(404);
});

test('baromètre : la section Jeux de données pointe vers de vrais fichiers (F-40)', async ({
  page,
}) => {
  await page.goto('/fr/barometre');

  // The first row's "Télécharger" button leads to a real file.
  const firstDownload = page
    .getByRole('link', { name: /Télécharger —/ })
    .first();
  await expect(firstDownload).toHaveAttribute(
    'href',
    '/fr/barometre/data/composite.csv',
  );

  // No more dead links (#) in the datasets section.
  const dead = page.locator('#datasets a[href="#"]');
  await expect(dead).toHaveCount(0);

  // The codebook link is real.
  const codebook = page.getByRole('link', { name: 'Codebook' }).first();
  await expect(codebook).toHaveAttribute(
    'href',
    '/fr/barometre/data/codebook.txt',
  );
});
