import { test, expect, type Page } from '@playwright/test';

test.use({ locale: 'fr-FR' });

// F-23 / F-52 — the public calendar.
//
// SINCE THE "CONTENUS" WORKSTREAM, two things have changed under this page, and
// this file accounts for them instead of hard-coding numbers:
//  - the calendar comes from the `contentEvents` table (import of the coded content in CI,
//    `contenus/migration:importCodedContent`), or from the coded catalog as a fallback;
//    an editor can add events to it, and `contenus-*.spec.ts` does so;
//  - "upcoming" or "past" is decided by the event's DATE, no longer by a
//    manually set flag. The number of upcoming events therefore depends on the
//    day the suite runs.
// The assertions target the page's CONSISTENCY (the announced count is
// that of the displayed cards, a filter keeps only what it names), not
// a total that would change with the calendar.

async function annonce(page: Page): Promise<number> {
  const b = page
    .getByRole('region', { name: 'Résultats' })
    .locator('p b')
    .first();
  return Number(await b.textContent());
}

async function cartes(page: Page) {
  return page.getByRole('region', { name: 'Résultats' }).getByRole('listitem');
}

test('événements : liste, filtres serveur, période (F-23, F-52)', async ({
  page,
}) => {
  await page.goto('/fr/evenements');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Événements',
  );
  // The announced count is that of the displayed cards.
  const total = await annonce(page);
  expect(total).toBeGreaterThan(0);
  await expect(await cartes(page)).toHaveCount(total);

  // Facet filter: "Webinaire" (GET link) — every remaining card is one.
  await page.locator('aside a[href*="type=webinaire"]').click();
  await expect(page).toHaveURL(/[?&]type=webinaire/);
  const webinaires = await annonce(page);
  expect(webinaires).toBeGreaterThan(0);
  expect(webinaires).toBeLessThanOrEqual(total);
  const liste = await cartes(page);
  await expect(liste).toHaveCount(webinaires);
  for (const carte of await liste.all()) {
    await expect(carte).toContainText('Webinaire');
  }

  // Month filter (F-52): the "Mois" facet only offers populated months;
  // picking one never leaves the list empty.
  await page.goto('/fr/evenements');
  const mois = page.locator('aside a[href*="mois="]').first();
  if (await mois.count()) {
    await mois.click();
    await expect(page).toHaveURL(/[?&]mois=\d{4}-\d{2}/);
    expect(await annonce(page)).toBeGreaterThan(0);
  }

  // Period toggle → "Passés": the page stays consistent with its count.
  await page.goto('/fr/evenements');
  await page.getByRole('link', { name: 'Passés', exact: true }).click();
  await expect(page).toHaveURL(/[?&]period=passes/);
  const passes = await annonce(page);
  expect(passes).toBeGreaterThan(0);
  await expect(await cartes(page)).toHaveCount(passes);
});

test('événements : fiche riche de la conférence inaugurale (F-23)', async ({
  page,
}) => {
  // The list's "featured" block only exists while the conference is
  // upcoming (14 November 2026): we check the FEATURED item under that condition, and
  // the rich event page in all cases.
  if (Date.now() < Date.UTC(2026, 10, 14, 22)) {
    await page.goto('/fr/evenements');
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: 'Conférence inaugurale de Democracy Together',
      }),
    ).toBeVisible();
  }

  await page.goto('/fr/evenements/conference-inaugurale');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Conférence inaugurale',
  );
  await expect(
    page.getByRole('heading', { name: 'Programme détaillé' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Intervenants' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Infos pratiques' }),
  ).toBeVisible();
  // Ticketing (illustrative price): only while the conference is
  // upcoming — once past, the event page shows the replay instead.
  if (Date.now() < Date.UTC(2026, 10, 14, 22)) {
    await expect(page.getByText('45 €')).toBeVisible();
  }
});

test('événements : accès via la nav + version EN (F-03/F-23)', async ({
  page,
}) => {
  await page.goto('/fr');
  await page
    .getByRole('banner')
    .getByRole('link', { name: 'Événements', exact: true })
    .click();
  await expect(page).toHaveURL(/\/fr\/evenements$/);

  await page.goto('/en/evenements');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Events');
  await expect(
    page.getByText(/upcoming events?|past events?/).first(),
  ).toBeVisible();
});
