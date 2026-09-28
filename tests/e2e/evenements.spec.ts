import { test, expect, type Page } from '@playwright/test';

test.use({ locale: 'fr-FR' });

// F-23 / F-52 — l'agenda public.
//
// DEPUIS LE CHANTIER « CONTENUS », deux choses ont changé sous cette page, et
// ce fichier en tient compte au lieu de figer des nombres :
//  - l'agenda vient de la table `contentEvents` (import du contenu codé en CI,
//    `contenus/migration:importCodedContent`), ou du catalogue codé en repli ;
//    un éditeur peut y ajouter des événements, et `contenus-*.spec.ts` le fait ;
//  - « à venir » ou « passé » se décide par la DATE de l'événement, plus par un
//    indicateur posé à la main. Le compte d'événements à venir dépend donc du
//    jour où la suite tourne.
// Les assertions portent sur la COHÉRENCE de la page (le compte annoncé est
// celui des cartes affichées, un filtre ne garde que ce qu'il nomme), pas sur
// un total qui changerait avec le calendrier.

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
  // Le compte annoncé est celui des cartes affichées.
  const total = await annonce(page);
  expect(total).toBeGreaterThan(0);
  await expect(await cartes(page)).toHaveCount(total);

  // Filtre facette : Webinaire (lien GET) — chaque carte restante en est un.
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

  // Filtre par mois (F-52) : la facette « Mois » ne propose que des mois
  // peuplés ; en choisir un ne laisse jamais la liste vide.
  await page.goto('/fr/evenements');
  const mois = page.locator('aside a[href*="mois="]').first();
  if (await mois.count()) {
    await mois.click();
    await expect(page).toHaveURL(/[?&]mois=\d{4}-\d{2}/);
    expect(await annonce(page)).toBeGreaterThan(0);
  }

  // Bascule période → Passés : la page reste cohérente avec son compte.
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
  // Le bloc « à la une » de la liste n'existe que tant que la conférence est
  // à venir (14 novembre 2026) : on vérifie la VEDETTE à cette condition, et
  // la fiche riche dans tous les cas.
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
  // Billetterie (tarif illustratif) : seulement tant que la conférence est à
  // venir — passée, la fiche montre la rediffusion à la place.
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
