import { test, expect, type Page } from '@playwright/test';
import { cliquerJusqua } from './_panneau';

test.use({ locale: 'fr-FR' });

// F-12 — `/fr/evenements/calendrier` n'était citée par AUCUNE spec E2E.
//
// CE QUI REND CETTE ROUTE TESTABLE SANS CONVEX, et pourquoi c'est un cas à
// part dans ce dossier : elle ne lit aucun backend. Sa grille vient de
// `buildMonthGrid` et ses événements de `EVENTS` (src/lib/events-content.ts),
// deux sources VERSIONNÉES. Un mois donné a donc toujours les mêmes
// événements, aux mêmes jours — on peut l'affirmer au lieu de le sonder.
//
// Le mois affiché est piloté par `?ym=YYYY-MM`, jamais par l'horloge : toutes
// les assertions ci-dessous sont déterministes. Le seul test qui touche à
// l'horloge (repli du paramètre illisible) ne compare que deux pages entre
// elles, sans nommer de date.
//
// CE QUE `buildMonthGrid` FAIT DÉJÀ VÉRIFIER PAR L'UNITAIRE : la forme de la
// grille, les cases de remplissage, le passage d'année. Ce fichier ne les
// rejoue pas. Il vérifie ce que l'unitaire ne peut pas voir — que la page
// RENDUE place bien l'événement dans la case du bon jour, et que la navigation
// mensuelle emmène là où elle dit.

// Novembre 2026, tel que `EVENTS` le porte. Trois événements, trois jours
// distincts : une erreur d'un jour dans le rendu de la grille se voit.
const NOVEMBRE_2026 = [
  { jour: 5, titre: 'Webinaire : désinformation et confiance civique' },
  { jour: 14, titre: 'Conférence inaugurale de Democracy Together' },
  {
    jour: 26,
    titre: 'Atelier de Bruxelles : souveraineté numérique européenne',
  },
];

// Juillet 2026 : aucun événement. `EVENTS` n'en porte qu'en 3, 4, 5, 6, 9, 10,
// 11 et 12 — le mois vide est donc un fait du dépôt, pas une supposition.
const MOIS_VIDE = '2026-07';

// Les pastilles d'événement, et elles seules : les liens du fil d'Ariane et de
// la bascule « Vue liste » pointent `/fr/evenements` (sans barre finale), ceux
// de la navigation mensuelle contiennent `calendrier`. Sélection par ADRESSE
// plutôt que par classe : la mise en page peut bouger, l'adresse d'une fiche
// d'événement est un contrat.
const PASTILLES = 'a[href^="/fr/evenements/"]:not([href*="calendrier"])';

// Jour de la case qui contient cet événement.
//
// On remonte jusqu'à l'enfant direct de la grille à sept colonnes — c'est la
// définition d'une case — plutôt que jusqu'à une classe utilitaire, qui n'est
// qu'un détail de mise en page. Le premier `span` de la case est la pastille
// du numéro de jour : elle précède la liste des événements dans le balisage.
async function jourDeLaCase(page: Page, titre: string): Promise<number | null> {
  return page.getByRole('link', { name: titre }).evaluate((el) => {
    const case_ = el.closest('.grid-cols-7 > div');
    const numero = case_?.querySelector('span')?.textContent?.trim();
    const n = Number(numero);
    return Number.isFinite(n) && numero !== '' ? n : null;
  });
}

function titreDuMois(page: Page) {
  return page.getByRole('heading', { level: 2 }).first();
}

test('calendrier : novembre 2026 place ses trois événements au bon jour (F-12)', async ({
  page,
}) => {
  await page.goto('/fr/evenements/calendrier?ym=2026-11');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Calendrier des événements' }),
  ).toBeVisible();
  await expect(titreDuMois(page)).toHaveText('Novembre 2026');

  // Le compteur du mois, et le nombre réel de pastilles. Les deux, parce
  // qu'un compteur juste sur une grille vide serait un mensonge cohérent.
  await expect(page.getByText('3 événements')).toBeVisible();
  await expect(page.locator(PASTILLES)).toHaveCount(3);

  for (const { jour, titre } of NOVEMBRE_2026) {
    const pastille = page.getByRole('link', { name: titre });
    await expect(pastille, `« ${titre} » absente de la grille`).toBeVisible();
    expect(
      await jourDeLaCase(page, titre),
      `« ${titre} » n'est pas dans la case du ${jour}`,
    ).toBe(jour);
  }

  await expect(page.getByText('Aucun événement ce mois-ci.')).toHaveCount(0);

  // La grille est un repère NOMMÉ. La page écrivait déjà ce nom, mais
  // `Reveal` ne relayait pas `aria-label` : constaté sur le HTML servi, le
  // `<section>` ne portait que `data-reveal`, `class` et `style`, donc aucun
  // nom accessible — et un `<section>` anonyme n'est pas un repère `region`.
  // Cette assertion rougit sur le code d'avant le correctif de `reveal.tsx`.
  await expect(
    page.getByRole('region', { name: 'Novembre 2026' }),
  ).toBeVisible();
});

test('calendrier : un mois sans événement le dit, et la grille est vraiment vide (F-12)', async ({
  page,
}) => {
  await page.goto(`/fr/evenements/calendrier?ym=${MOIS_VIDE}`);

  await expect(titreDuMois(page)).toHaveText('Juillet 2026');
  await expect(page.getByText('Aucun événement ce mois-ci.')).toBeVisible();
  await expect(
    page.getByText('Aucun événement', { exact: true }),
  ).toBeVisible();

  // Le message et la grille doivent dire la même chose : c'est le couple qui
  // a du sens, pas le message seul.
  await expect(page.locator(PASTILLES)).toHaveCount(0);

  // Les sept en-têtes de jours restent là : un mois vide reste un calendrier.
  for (const jour of ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim']) {
    await expect(page.getByText(jour, { exact: true })).toBeVisible();
  }
});

test('calendrier : la navigation mensuelle emmène où elle annonce (F-12)', async ({
  page,
}) => {
  await page.goto('/fr/evenements/calendrier?ym=2026-11');
  await expect(titreDuMois(page)).toHaveText('Novembre 2026');

  const suivant = page.getByRole('link', { name: 'Mois suivant' });
  const precedent = page.getByRole('link', { name: 'Mois précédent' });

  // `rel` déclare la relation aux robots comme aux lecteurs d'écran : c'est
  // dans le code, donc c'est vérifiable.
  await expect(suivant).toHaveAttribute('rel', 'next');
  await expect(precedent).toHaveAttribute('rel', 'prev');

  // Geste adjacent à une navigation : passé par le helper durci en F-13, qui
  // attend l'effet avant d'envisager un second clic et journalise ce qu'il
  // constate. Le prédicat porte sur le TITRE rendu, pas sur l'adresse —
  // `page.url()` bascule avant que le document suivant ne soit en place.
  await cliquerJusqua(
    suivant,
    async () => (await titreDuMois(page).textContent()) === 'Décembre 2026',
    'calendrier : mois suivant',
  );
  await expect(page).toHaveURL(/ym=2026-12/);
  await expect(page.locator(PASTILLES)).toHaveCount(3); // 3, 10 et 16 décembre

  await cliquerJusqua(
    page.getByRole('link', { name: 'Mois précédent' }),
    async () => (await titreDuMois(page).textContent()) === 'Novembre 2026',
    'calendrier : mois précédent',
  );
  await expect(page).toHaveURL(/ym=2026-11/);
});

test('calendrier : une pastille ouvre la fiche de son événement (F-12)', async ({
  page,
}) => {
  await page.goto('/fr/evenements/calendrier?ym=2026-11');

  const pastille = page.getByRole('link', {
    name: 'Conférence inaugurale de Democracy Together',
  });
  await expect(pastille).toHaveAttribute(
    'href',
    '/fr/evenements/conference-inaugurale',
  );

  await cliquerJusqua(
    pastille,
    async () => /\/fr\/evenements\/conference-inaugurale$/.test(page.url()),
    'calendrier : ouverture de la fiche',
  );
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
});

test('calendrier : un paramètre ym illisible retombe sur le mois courant (F-12)', async ({
  page,
}) => {
  // `parseYm` rend `null` sur une valeur mal formée, et la page retombe alors
  // sur le mois courant. Ce test ne nomme AUCUNE date : il compare la page
  // fautive à la page sans paramètre, qui a le même repli. Il resterait donc
  // vrai dans six mois — un test daté serait une panne programmée.
  const reponse = await page.goto('/fr/evenements/calendrier?ym=pas-une-date');
  expect(
    reponse?.status(),
    'un ym illisible ne doit pas faire tomber la page',
  ).toBe(200);
  const moisFautif = await titreDuMois(page).textContent();

  await page.goto('/fr/evenements/calendrier');
  const moisParDefaut = await titreDuMois(page).textContent();

  expect(moisFautif).toBe(moisParDefaut);
  // Non vacant : on a bien lu un mois, pas deux chaînes vides.
  expect(moisFautif).toMatch(/\p{Lu}\p{L}+\s\d{4}/u);
});
