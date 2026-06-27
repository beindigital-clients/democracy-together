import { test, expect } from '@playwright/test';

// F-40 — Données ouvertes du Baromètre. Les endpoints /[locale]/barometre/data/*
// servent des fichiers téléchargeables (CSV/JSON/codebook/géométries). Comme les
// URLs portent une extension, le proxy next-intl les ignore : la locale vient du
// chemin. Données d'illustration.

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
  // 14 pays + en-tête + ligne finale vide
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

  // Le bouton « Télécharger » de la première ligne mène à un fichier réel.
  const firstDownload = page
    .getByRole('link', { name: /Télécharger —/ })
    .first();
  await expect(firstDownload).toHaveAttribute(
    'href',
    '/fr/barometre/data/composite.csv',
  );

  // Plus aucun lien mort (#) dans la section datasets.
  const dead = page.locator('#datasets a[href="#"]');
  await expect(dead).toHaveCount(0);

  // Le lien codebook est réel.
  const codebook = page.getByRole('link', { name: 'Codebook' }).first();
  await expect(codebook).toHaveAttribute(
    'href',
    '/fr/barometre/data/codebook.txt',
  );
});
