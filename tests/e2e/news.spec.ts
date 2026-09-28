import { test, expect } from '@playwright/test';
import { projectId } from '../../sanity/env';

test.use({ locale: 'fr-FR' });

// Sanity is not always configured. In CI no project secret is set,
// and `sanity/env.ts` falls back to the "placeholder" identifier: the request still
// goes out and comes back as a 404 "Dataset not found". The page absorbs it — it
// shows its empty list instead of crashing — and that behavior deserves
// to be tested IN ITS OWN RIGHT: it is what visitors will see the day
// the CMS misbehaves, and nothing covered it until now.
//
// Both paths are therefore tested, and the actual configuration
// decides which one runs. No test is disabled, none is declared
// "skipped": without a Sanity project we check the degradation, with one we check the
// content. The rule is imported from the application module, not copied —
// a divergence would silently take the wrong branch.
const sanityConfigured = projectId !== 'placeholder';

function cards(page: import('@playwright/test').Page) {
  return page
    .getByRole('list', { name: 'Actualités du réseau' })
    .getByRole('listitem');
}

function noteSanity() {
  test.info().annotations.push({
    type: 'sanity',
    description: sanityConfigured
      ? `projet « ${projectId} » : contenu réel`
      : 'projet non configuré : chemin dégradé',
  });
}

test('actualités : liste depuis Sanity + article (F-15)', async ({ page }) => {
  noteSanity();
  const response = await page.goto('/fr/actualites');

  // Holds in both cases, and it is the heart of the matter when the CMS is absent:
  // an unavailable source must not take the page down with it.
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Actualités du réseau',
  );

  if (!sanityConfigured) {
    // CMS absent = OUTAGE, not an empty list: the page says so (doctrine F-02,
    // like the article detail). "Aucune actualité" is reserved for a CMS
    // that responds and has nothing.
    await expect(
      page.getByText('Contenu momentanément indisponible'),
    ).toBeVisible();
    await expect(page.getByText('Aucune actualité pour le moment')).toHaveCount(
      0,
    );
    await expect(cards(page)).toHaveCount(0);
    return;
  }

  await expect(
    page.getByRole('heading', { name: /collectif fondateur/i }),
  ).toBeVisible();
  expect(await cards(page).count()).toBeGreaterThanOrEqual(3);

  // open an article -> PortableText rendering
  await page.getByRole('link', { name: /collectif fondateur/i }).click();
  await expect(page).toHaveURL(/\/fr\/actualites\/collectif-fondateur$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'collectif fondateur',
  );
  await expect(page.getByText(/quatre axes de la mission/i)).toBeVisible();
});

test('actualités : accessible depuis la nav, version EN (F-03/F-15)', async ({
  page,
}) => {
  noteSanity();
  await page.goto('/fr');
  await page.getByRole('link', { name: 'Actualités', exact: true }).click();
  await expect(page).toHaveURL(/\/fr\/actualites$/);

  // The EN page's navigation and rendering do not depend on the CMS: they are
  // what this spec checks (F-03), the content is merely the proof.
  const response = await page.goto('/en/actualites');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Network news',
  );

  if (!sanityConfigured) {
    // Same doctrine as in French: CMS absent = announced outage, not an empty
    // list (batch 3 of 27/09).
    await expect(
      page.getByText('Content temporarily unavailable'),
    ).toBeVisible();
    await expect(page.getByText('No news yet.')).toHaveCount(0);
    return;
  }

  await expect(
    page.getByRole('heading', { name: /founding collective/i }),
  ).toBeVisible();
});
