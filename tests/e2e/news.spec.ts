import { test, expect } from '@playwright/test';
import { CODED_NEWS } from '../../convex/lib/contenus/coded/news';

test.use({ locale: 'fr-FR' });

// The articles live in Convex (`contentNews`, edited in the back office). In
// CI the E2E preview deployment runs `importCodedContent`, which copies the
// three coded articles into the table; without that import, the page serves
// those same articles from the code. Either way the visitor reads the same
// three articles — which is what this spec checks, without needing to know
// which of the two answered.
const [COLLECTIF] = CODED_NEWS;

function cards(page: import('@playwright/test').Page, name: string) {
  return page.getByRole('list', { name }).getByRole('listitem');
}

test('actualités : liste + article (F-15)', async ({ page }) => {
  const response = await page.goto('/fr/actualites');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Actualités du réseau',
  );
  await expect(
    page.getByRole('heading', { name: COLLECTIF.text.fr.title }),
  ).toBeVisible();
  expect(
    await cards(page, 'Actualités du réseau').count(),
  ).toBeGreaterThanOrEqual(CODED_NEWS.length);

  // Open an article: its paragraphs, as entered.
  await page.getByRole('link', { name: /collectif fondateur/i }).click();
  await expect(page).toHaveURL(new RegExp(`/fr/actualites/${COLLECTIF.slug}$`));
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'collectif fondateur',
  );
  await expect(page.getByText(/quatre axes de la mission/i)).toBeVisible();
});

test('actualités : accessible depuis la nav, version EN (F-03/F-15)', async ({
  page,
}) => {
  await page.goto('/fr');
  await page.getByRole('link', { name: 'Actualités', exact: true }).click();
  await expect(page).toHaveURL(/\/fr\/actualites$/);

  const response = await page.goto('/en/actualites');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Network news',
  );
  await expect(
    page.getByRole('heading', { name: COLLECTIF.text.en.title }),
  ).toBeVisible();
});

// Sanity only carried French and English: the three other news pages were
// EMPTY. One article now carries its five languages, under one address.
test('actualités : les articles existent dans les cinq langues, à la même adresse', async ({
  page,
}) => {
  await page.goto('/es/actualites');
  await expect(
    page.getByRole('heading', { name: COLLECTIF.text.es.title }),
  ).toBeVisible();

  const response = await page.goto(`/ar/actualites/${COLLECTIF.slug}`);
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    COLLECTIF.text.ar.title,
  );
});
