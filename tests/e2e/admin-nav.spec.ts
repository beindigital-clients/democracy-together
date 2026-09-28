import { test, expect, type Locator, type Page } from '@playwright/test';
import { SESSIONS } from './_sessions';

test.use({ locale: 'fr-FR' });

// BACK-OFFICE NAVIGATION (issue #49) — the shape, measured.
//
// The issue's criterion is literally geometric: "the navigation stays
// readable without horizontal scrolling". This cannot be checked by a
// component test (happy-dom does no layout) nor by `toBeVisible()`, which is true
// of an off-screen link inside a scrolling container — that was exactly
// the previous state. It takes a real browser and a real width.
//
// WHY THIS FILE IS NOT IN `tests/e2e/mobile/`. The repo's convention
// (TESTING.md) puts there the journeys whose viewport AND touch input
// come from the `mobile-chromium` project. But that project does not depend on `setup`:
// it does not have the shared sessions, and the back office requires an admin
// session. What is measured here is a width, not a gesture — the viewport is
// therefore set by the file, and the session comes from the `chromium` project.

const PHONE = { width: 412, height: 839 };

// The issue's fourteen entries, as they are displayed, plus the
// fifteenth added since ("Modération IA"), the sixteenth ("Mes
// relectures", the reviewer's view — campaign of 27/09, A-02) and the
// seventeenth (the Tribune's "File de modération", "communauté" workstream),
// then the eighteenth ("Organisations", review of entries — "comptes" workstream).
const ALL_ITEMS = [
  'Tableau de bord',
  'Impact',
  'Candidatures',
  'Publications',
  'Mes relectures',
  'File de modération',
  'Signalements',
  'Messages',
  'Organisations',
  'Jeunes',
  'Mentorat',
  'Projets',
  'Événements',
  'Comité de lecture',
  'Newsletter',
  'Modération IA',
  'Utilisateurs',
  'Journal',
];

const GROUPS = [
  'Pilotage',
  'Modération',
  'Programmes',
  'Édition',
  'Automatisation',
  'Comptes et audit',
];

function nav(page: Page): Locator {
  return page.getByRole('navigation', { name: 'Administration' });
}

// No off-screen entry, and no container scrolling sideways.
async function fitsOnScreen(page: Page, width: number) {
  const bar = nav(page);

  const scroll = await bar.evaluate((el) => ({
    scroll: el.scrollWidth,
    client: el.clientWidth,
  }));
  expect(
    scroll.scroll,
    `la navigation défile horizontalement : ${scroll.scroll}px pour ${scroll.client}px`,
  ).toBeLessThanOrEqual(scroll.client + 1);

  for (const item of ALL_ITEMS) {
    const box = await bar
      .getByRole('link', { name: `${item} (Administration)`, exact: true })
      .boundingBox();
    expect(
      box,
      `entrée « ${item} » sans boîte : absente ou masquée`,
    ).not.toBeNull();
    expect(box!.x, `« ${item} » commence hors écran`).toBeGreaterThanOrEqual(
      -1,
    );
    expect(
      box!.x + box!.width,
      `« ${item} » dépasse la largeur de l'écran`,
    ).toBeLessThanOrEqual(width + 1);
  }

  const page_ = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(page_.scroll).toBeLessThanOrEqual(page_.client + 1);
}

// Same precaution as `admin-recherche.spec.ts` and `admin-confirmations`: the
// refresh token rotates on the first test, so we rewrite the state
// so that the following ones do not start again from a consumed token.
test.afterEach(async ({ context }) => {
  await context.storageState({ path: SESSIONS.adminNav.state });
});

test.describe('navigation du back-office sur téléphone (session dédiée)', () => {
  test.use({ storageState: SESSIONS.adminNav.state, viewport: PHONE });

  test('back-office : les 17 entrées tiennent sans défilement horizontal (F-26)', async ({
    page,
  }) => {
    await page.goto('/fr/admin');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Tableau de bord' }),
    ).toBeVisible();
    await fitsOnScreen(page, PHONE.width);
  });

  test('back-office : les entrées sont regroupées par domaine (F-26)', async ({
    page,
  }) => {
    await page.goto('/fr/admin');
    for (const group of GROUPS) {
      // The group heading names its list (`aria-labelledby`): that is what
      // makes the grouping perceivable other than visually.
      await expect(nav(page).getByRole('list', { name: group })).toBeVisible();
    }
  });
});

test.describe('navigation du back-office en large (session dédiée)', () => {
  test.use({ storageState: SESSIONS.adminNav.state });

  test('back-office : colonne latérale, sans défilement horizontal (F-26)', async ({
    page,
    viewport,
  }) => {
    await page.goto('/fr/admin/journal');
    await expect(
      page.getByRole('heading', { level: 1, name: "Journal d'activité" }),
    ).toBeVisible();
    await fitsOnScreen(page, viewport!.width);

    // The three strengths the issue credits the existing version with, and which
    // had to survive the redesign: the navigation's name, the current entry
    // indicated — and only it —, and the dashboard not lighting up
    // on a sub-route.
    const current = nav(page).locator('a[aria-current="page"]');
    await expect(current).toHaveCount(1);
    await expect(current).toHaveText('Journal');
    await expect(
      nav(page).getByRole('link', {
        name: 'Tableau de bord (Administration)',
        exact: true,
      }),
    ).not.toHaveAttribute('aria-current', 'page');
  });
});

// The FALLBACK BY ROLE — a moderator only gets their three groups — is
// checked in `admin-ecrans.spec.ts`, which already holds the moderator session and
// whose subject is role partitioning. Putting it here would make this
// file a THIRD one on that session, which `_sessions.ts` forbids.
