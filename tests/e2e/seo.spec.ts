import { test, expect } from '@playwright/test';
import { SESSIONS } from './_sessions';
import { approveTribunePosts } from './_helpers';

// F-07 — SEO: sitemap.xml and robots.txt served at the root (not intercepted
// by the next-intl proxy, which ignores paths with an extension).
test('sitemap.xml : pages clés bilingues + alternates hreflang (F-07)', async ({
  request,
}) => {
  const res = await request.get('/sitemap.xml');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('xml');

  const body = await res.text();
  // public pages, in both languages
  expect(body).toContain('/fr/bibliotheque');
  expect(body).toContain('/en/a-propos');
  expect(body).toContain('/fr/le-reseau');
  // hreflang alternates
  expect(body).toContain('hreflang="x-default"');
  expect(body).toContain('hreflang="en"');
  // never a private area in the sitemap
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

// --- Issue #35: what the page head declares to search engines --------------

test('/recherche : noindex — une page de résultats n’entre pas dans l’index (#35)', async ({
  page,
}) => {
  await page.goto('/fr/recherche?q=participation');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    'content',
    /noindex/,
  );
  // No hreflang: on a noindex page, a search engine ignores it. The noindex
  // IS the declaration — the alternate would just be noise.
  await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
});

test.describe('Tribune — un billet n’existe que dans une langue (#35)', () => {
  // Publishing requires a member: we start from the shared session rather than
  // replaying a sign-in (see tests/e2e/_sessions.ts).
  test.use({ storageState: SESSIONS.membre.state });

  test('canonical vers la langue du billet, identique sous les deux préfixes', async ({
    page,
  }) => {
    const title = `Canonical E2E ${Date.now()}`;

    // A post written in ENGLISH from the FRENCH interface: this is the case
    // that the interface language alone would have guessed wrong.
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
    // PRE-moderation (F-45): the post only has a public page once
    // approved.
    await composer
      .getByRole('button', { name: 'Soumettre à la modération' })
      .click();
    await expect(page.getByText(/soumise à la modération/)).toBeVisible();
    await approveTribunePosts(title);

    await page.goto('/fr/tribune');
    await page
      .locator('a[href*="/tribune/"]')
      .filter({ hasText: title })
      .first()
      .click();
    await expect(page).toHaveURL(/\/fr\/tribune\/[a-z0-9]+$/);
    const id = new URL(page.url()).pathname.split('/').pop();

    const canonical = new RegExp(`/en/tribune/${id}$`);
    // Served under /fr, the English post canonicalizes to /en...
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      canonical,
    );
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(
      0,
    );
    // ...and also says so to assistive technology, which otherwise would read
    // English text with the French voice.
    await expect(page.locator('h1')).toHaveAttribute('lang', 'en');

    // Under /en, THE SAME canonical: a single text, a single reference page.
    await page.goto(`/en/tribune/${id}`);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      canonical,
    );
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(
      0,
    );
    // Same language on both sides: nothing left to flag on the title.
    await expect(page.locator('h1')).not.toHaveAttribute('lang', 'en');
  });
});
