import { test, expect, type Page } from '@playwright/test';
import { cliquerJusqua } from './_panneau';

test.use({ locale: 'fr-FR' });

// F-12 — `/fr/evenements/calendrier` was referenced by NO E2E spec.
//
// WHAT MAKES THIS ROUTE DETERMINISTIC. Since the "contenus" workstream, its
// events come from the `contentEvents` table, or from the hard-coded catalog
// (`convex/lib/contenus/coded/events.ts`) as a fallback. CI imports that catalog
// as is (`contenus/migration:importCodedContent`, same dates): a given
// month therefore has the same events, on the same days, in both cases. The
// specs that CREATE events (`contenus-*.spec.ts`) date them in 2030,
// outside the months counted here.
//
// The displayed month is driven by `?ym=YYYY-MM`, never by the clock: all
// the assertions below are deterministic. The only test that touches
// the clock (fallback for an unreadable parameter) only compares two pages with
// each other, without naming a date.
//
// WHAT `buildMonthGrid` ALREADY HAS VERIFIED BY THE UNIT TEST: the shape of the
// grid, the filler cells, the year rollover. This file does not
// replay them. It checks what the unit test cannot see — that the RENDERED
// page does put the event in the right day's cell, and that the monthly
// navigation leads where it says.

// November 2026, as `EVENTS` carries it. Three events, three distinct
// days: an off-by-one-day error in the grid rendering shows.
const NOVEMBRE_2026 = [
  { jour: 5, titre: 'Webinaire : désinformation et confiance civique' },
  { jour: 14, titre: 'Conférence inaugurale de Democracy Together' },
  {
    jour: 26,
    titre: 'Atelier de Bruxelles : souveraineté numérique européenne',
  },
];

// July 2026: no events. `EVENTS` only carries some in 3, 4, 5, 6, 9, 10,
// 11 and 12 — the empty month is therefore a fact of the repo, not an assumption.
const MOIS_VIDE = '2026-07';

// The event chips, and only them: the breadcrumb links and the
// "Vue liste" toggle point to `/fr/evenements` (no trailing slash), those
// of the monthly navigation contain `calendrier`. Selection by ADDRESS
// rather than by class: the layout may move, the address of an event page
// is a contract.
const PASTILLES = 'a[href^="/fr/evenements/"]:not([href*="calendrier"])';

// Day of the cell containing this event.
//
// We go up to the direct child of the seven-column grid — that is the
// definition of a cell — rather than to a utility class, which is
// only a layout detail. The cell's first `span` is the day-number
// chip: it precedes the event list in the markup.
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

  // The month's counter, and the actual number of chips. Both, because
  // a correct counter on an empty grid would be a consistent lie.
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

  // The grid is a NAMED landmark. The page already wrote this name, but
  // `Reveal` did not pass `aria-label` through: observed on the served HTML, the
  // `<section>` only carried `data-reveal`, `class` and `style`, hence no
  // accessible name — and an anonymous `<section>` is not a `region` landmark.
  // This assertion goes red on the code from before the `reveal.tsx` fix.
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

  // The message and the grid must say the same thing: it is the pair that
  // makes sense, not the message alone.
  await expect(page.locator(PASTILLES)).toHaveCount(0);

  // The seven day headers stay: an empty month is still a calendar.
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

  // `rel` declares the relationship to robots as well as to screen readers: it is
  // in the code, so it is verifiable.
  await expect(suivant).toHaveAttribute('rel', 'next');
  await expect(precedent).toHaveAttribute('rel', 'prev');

  // Gesture adjacent to a navigation: goes through the helper hardened in F-13, which
  // waits for the effect before considering a second click and logs what it
  // observes. The predicate is on the rendered TITLE, not on the address —
  // `page.url()` switches before the next document is in place.
  await cliquerJusqua(
    suivant,
    async () => (await titreDuMois(page).textContent()) === 'Décembre 2026',
    'calendrier : mois suivant',
  );
  await expect(page).toHaveURL(/ym=2026-12/);
  await expect(page.locator(PASTILLES)).toHaveCount(3); // December 3, 10 and 16

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
  // `parseYm` returns `null` on a malformed value, and the page then falls back
  // to the current month. This test names NO date: it compares the faulty
  // page to the page without a parameter, which has the same fallback. It would therefore
  // still be true in six months — a dated test would be a scheduled failure.
  const reponse = await page.goto('/fr/evenements/calendrier?ym=pas-une-date');
  expect(
    reponse?.status(),
    'un ym illisible ne doit pas faire tomber la page',
  ).toBe(200);
  const moisFautif = await titreDuMois(page).textContent();

  await page.goto('/fr/evenements/calendrier');
  const moisParDefaut = await titreDuMois(page).textContent();

  expect(moisFautif).toBe(moisParDefaut);
  // Non-vacuous: we did read a month, not two empty strings.
  expect(moisFautif).toMatch(/\p{Lu}\p{L}+\s\d{4}/u);
});
