import { test, expect } from '@playwright/test';
import { SESSIONS } from './_sessions';

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

// --- Issue #35 : ce que la tête de page déclare aux moteurs -----------------

test('/recherche : noindex — une page de résultats n’entre pas dans l’index (#35)', async ({
  page,
}) => {
  await page.goto('/fr/recherche?q=participation');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    /noindex/,
  );
  // Aucun hreflang : sur une page en noindex, un moteur l'ignore. Le noindex
  // EST la déclaration — l'alternate ne serait que du bruit.
  await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
});

test.describe('Tribune — un billet n’existe que dans une langue (#35)', () => {
  // Publier exige un membre : on part de la session partagée plutôt que de
  // rejouer une connexion (cf. tests/e2e/_sessions.ts).
  test.use({ storageState: SESSIONS.membre.state });

  test('canonical vers la langue du billet, identique sous les deux préfixes', async ({
    page,
  }) => {
    const title = `Canonical E2E ${Date.now()}`;

    // Un billet rédigé en ANGLAIS depuis l'interface FRANÇAISE : c'est le cas
    // que la langue de l'interface, seule, aurait mal deviné.
    await page.goto('/fr/tribune');
    await page.getByRole('button', { name: 'Prendre la parole' }).click();
    const composer = page
      .locator('form')
      .filter({ hasText: 'Votre prise de parole' });
    await composer.getByLabel('Titre', { exact: true }).fill(title);
    await composer.getByLabel('Langue du billet').selectOption('en');
    await composer
      .getByLabel('Votre texte')
      .fill(
        'A short English contribution on citizen participation, written from the French interface.',
      );
    await composer.getByRole('button', { name: 'Publier' }).click();

    await page.getByRole('link').filter({ hasText: title }).first().click();
    await expect(page).toHaveURL(/\/fr\/tribune\/[a-z0-9]+$/);
    const id = new URL(page.url()).pathname.split('/').pop();

    const canonical = new RegExp(`/en/tribune/${id}$`);
    // Servi sous /fr, le billet anglais canonicalise vers /en...
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      canonical,
    );
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(
      0,
    );
    // ...et le dit aussi à l'assistance technique, qui sans cela lirait un
    // texte anglais avec la voix française.
    await expect(page.locator('h1')).toHaveAttribute('lang', 'en');

    // Sous /en, LE MÊME canonical : un seul texte, une seule page de référence.
    await page.goto(`/en/tribune/${id}`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      canonical,
    );
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(
      0,
    );
    // Même langue de part et d'autre : plus rien à signaler sur le titre.
    await expect(page.locator('h1')).not.toHaveAttribute('lang', 'en');
  });
});
