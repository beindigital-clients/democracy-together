import { test, expect } from '@playwright/test';

const BASE = process.env.AUDIT_BASE_URL ?? 'http://localhost:3000';

// F-06 — ce que voit quelqu'un qui tombe sur une 404.
//
// Le dépôt en sert DEUX, et elles n'ont pas le même sort :
//   • adresse sans route du tout      -> `src/app/not-found.tsx`
//   • `notFound()` depuis une route   -> `src/app/[locale]/not-found.tsx`
//
// Mesuré sur Next 16.3.5 : seule la première est rendue dans le HTML servi.
// La seconde n'arrive que par la charge utile RSC, donc uniquement si
// JavaScript s'exécute. Trois hypothèses ont été écartées par la mesure
// (suspension du composant, place du fichier, coquille du layout) : c'est un
// comportement du cadriciel, pas un défaut du dépôt.
//
// Ces tests tiennent donc ce qui est GARANTI, et RENDENT VISIBLE ce qui ne
// l'est pas — plutôt que d'enregistrer la limite comme si elle allait de soi.

test('404 sans route : lisible dans le HTML servi', async ({ request }) => {
  const res = await request.get('/fr/nimporte-quoi-du-tout');
  expect(res.status()).toBe(404);
  const html = await res.text();
  const body = html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<[^>]+>/g, ' ');
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
  const texte = (await page.locator('body').innerText()).trim();
  expect(texte).toContain('Page introuvable');
});

// Pas d'assertion ici : on MESURE la limite du cadriciel et on l'imprime. Le
// jour où Next rendra ce cas dans le HTML, ce chiffre cessera d'être nul et on
// le verra dans le rapport — sans qu'un test rouge n'ait eu à l'annoncer.
test('404 localisée : ce que le HTML servi en contient (limite mesurée)', async ({
  request,
}) => {
  const html = await (await request.get('/fr/rapports/9999')).text();
  const body = html
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  console.log(
    `[404] localisée, HTML servi : ${body.length} caractères ` +
      `(0 = la limite Next décrite dans src/app/not-found.tsx)`,
  );
  expect(html.length).toBeGreaterThan(0);
});
