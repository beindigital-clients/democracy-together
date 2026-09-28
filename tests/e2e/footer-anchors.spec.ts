import { test, expect, type Page } from '@playwright/test';

// Issue #46 — under "Le réseau", the footer offered three entries —
// "Mission & vision", "Gouvernance", "Fondateurs" — which all three pointed
// to BARE `/a-propos`. Three labels, a single destination, at the top
// of a long page: up to the visitor to find the section themselves.
//
// What this spec sees that the unit tests do not:
//
//  1. the anchor jump as it really happens, i.e. through a
//     CLIENT navigation of the App Router — not through the browser's native
//     fragment. That is the whole difficulty: since Next 16, the scroll
//     handler scrolls to the anchor but "leaves focus untouched";
//  2. the resulting FOCUS, the only measure that tells whether the link is
//     any use with a keyboard and a screen reader;
//  3. the section's actual position once settled, under a sticky header.

// Sticky header: `h-16` (64 px). The targeted sections carry `scroll-mt-20`
// (80 px), so the top of the section must settle ~80 px from the top of the
// viewport — below the header, never underneath it. The tolerance absorbs
// scroll rounding.
const HAUT_ATTENDU = 80;
const TOLERANCE = 8;

// TRACE THE FIRST ATTEMPT, NOT THE RETRY. The repo configuration captures
// the `on-first-retry` trace: on a FLAKY test — one that fails then passes —
// the published artifact is therefore that of the SUCCESSFUL run, and the failure
// leaves nothing. That is what happened on 26/09: the report contained the
// full walkthrough of a green run, and not a single image of the failure.
//
// `retain-on-failure` records every attempt and keeps only those that
// fail. Set on THIS file only: the cost is that of its seven
// flows, not that of the whole suite.
test.use({ trace: 'retain-on-failure' });

// The `id`s are those of the page component, shared by both languages; only the
// footer labels are translated.
const ANCRES = {
  fr: [
    { libelle: 'Mission & vision', id: 'vision' },
    { libelle: 'Gouvernance', id: 'gouvernance' },
    { libelle: 'Fondateurs', id: 'fondateurs' },
  ],
  en: [
    { libelle: 'Mission & vision', id: 'vision' },
    { libelle: 'Governance', id: 'gouvernance' },
    { libelle: 'Founders', id: 'fondateurs' },
  ],
} as const;

function lienDuPiedDePage(page: Page, libelle: string) {
  return page
    .locator('footer')
    .getByRole('link', { name: libelle, exact: true });
}

// Who holds focus, spelled out. `toBeFocused()` can only answer
// "inactive": the section does not have focus, without saying where it went. Yet
// that is exactly what the 26/09 failure did not allow us to settle — focus
// NEVER SET (the `AnchorFocus` listener was missing at click time) or SET
// THEN LOST (the router moved it afterwards). The two are fixed in
// different places.
//
// The assertion is not weakened: `activeElement` must BE the section, as
// before. It merely names the culprit when that is not the case.
async function focusCourant(page: Page): Promise<string> {
  return page.evaluate(() => {
    const a = document.activeElement;
    if (!a) return 'aucun';
    return (
      a.id || a.getAttribute('href') || a.tagName.toLowerCase() || 'sans nom'
    );
  });
}

// Focus is set by the client component, scrolling by the router: on
// a click targeting the current page, the former precedes the latter. So we wait
// for both, rather than assuming they arrive together.
async function attendLeSautDAncre(page: Page, id: string): Promise<void> {
  const section = page.locator(`#${id}`);

  await expect
    .poll(() => focusCourant(page), {
      message: `le focus doit suivre l’ancre #${id} — élément focalisé`,
    })
    .toBe(id);

  const haut = () =>
    section.evaluate((el) => Math.round(el.getBoundingClientRect().top));
  await expect.poll(haut).toBeLessThanOrEqual(HAUT_ATTENDU + TOLERANCE);
  expect(
    await haut(),
    'la section doit se poser SOUS l’en-tête collant (scroll-mt-20)',
  ).toBeGreaterThanOrEqual(HAUT_ATTENDU - TOLERANCE);
}

for (const locale of ['fr', 'en'] as const) {
  test.describe(`pied de page -> sections de /a-propos (${locale})`, () => {
    for (const { libelle, id } of ANCRES[locale]) {
      test(`« ${libelle} » mène à sa section depuis une autre page`, async ({
        page,
      }) => {
        await page.goto(`/${locale}/adhesion`);
        await lienDuPiedDePage(page, libelle).click();

        await expect(page).toHaveURL(new RegExp(`/${locale}/a-propos#${id}$`));
        await attendLeSautDAncre(page, id);
      });
    }

    // The footer is rendered on EVERY page, `/a-propos` included. This
    // case does not remount the React tree and emits no `hashchange` (Next
    // goes through `history.pushState`): nothing replays by itself.
    test('les trois liens fonctionnent aussi depuis /a-propos', async ({
      page,
    }) => {
      await page.goto(`/${locale}/a-propos`);
      for (const { libelle, id } of ANCRES[locale]) {
        await lienDuPiedDePage(page, libelle).click();
        await expect(page).toHaveURL(new RegExp(`#${id}$`));
        await attendLeSautDAncre(page, id);
      }
    });

    test("au chargement direct de l'URL ancrée", async ({ page }) => {
      await page.goto(`/${locale}/a-propos#gouvernance`);
      await attendLeSautDAncre(page, 'gouvernance');
    });
  });
}

test.describe('prefers-reduced-motion : l’ancre ne contourne pas la préférence', () => {
  // `reducedMotion` is not a `test.use` option in the pinned version
  // of Playwright (see TESTING.md): it is set when the context is created.
  test.use({ contextOptions: { reducedMotion: 'reduce' } });

  test('le défilement reste instantané, et le saut fonctionne', async ({
    page,
  }) => {
    await page.goto('/fr/a-propos');

    // We explicitly request animated scrolling. The global rule in
    // `globals.css` (`scroll-behavior: auto !important` under the preference) must
    // win: it is what governs the anchor jump, since that jump is
    // performed by the BROWSER and not by a home-made animated `scrollIntoView`.
    await page.addStyleTag({ content: 'html { scroll-behavior: smooth; }' });
    await expect
      .poll(() =>
        page.evaluate(
          () => getComputedStyle(document.documentElement).scrollBehavior,
        ),
      )
      .toBe('auto');

    await lienDuPiedDePage(page, 'Gouvernance').click();
    await attendLeSautDAncre(page, 'gouvernance');
  });
});

// Control for the previous test: without the preference, the same stylesheet takes effect.
// Without it, the `auto` assertion would pass just as well if `addStyleTag`
// had done nothing — it would then prove nothing.
test('témoin : sans la préférence, une feuille « smooth » prend effet', async ({
  page,
}) => {
  await page.goto('/fr/a-propos');
  await page.addStyleTag({ content: 'html { scroll-behavior: smooth; }' });
  await expect
    .poll(() =>
      page.evaluate(
        () => getComputedStyle(document.documentElement).scrollBehavior,
      ),
    )
    .toBe('smooth');
});

// Safeguard requested by the issue (§ "Vérification plus large"): several
// labels leading to the same place is the exact shape of the defect fixed
// here. The footer is present on every page — it costs nothing to
// check that none of its other entries promises a destination it does
// not deliver.
//
// Scope: the FOOTER. The header was checked in the browser and is sound,
// but its "Rejoindre" button targets `/adhesion` like the footer's "Adhérer"
// entry: a call to action and a navigation entry are allowed to
// share a destination. Subjecting it to the check would make the guard fail on a
// legitimate case — and that button's rendering depends on the auth state, hence
// on Convex.
for (const locale of ['fr', 'en'] as const) {
  test(`pied de page : pas deux libellés pour une même destination (${locale})`, async ({
    page,
  }) => {
    await page.goto(`/${locale}`);

    const liens = await page.locator('footer a[href]').evaluateAll((els) =>
      els.map((el) => ({
        href: el.getAttribute('href') ?? '',
        nom:
          (el.textContent ?? '').trim() || el.getAttribute('aria-label') || '',
      })),
    );
    // The footer renders 22 links; the threshold only says we did
    // look at something, so that a selector gone silent does not pass for
    // a healthy footer.
    expect(liens.length).toBeGreaterThan(15);

    const parDestination = new Map<string, Set<string>>();
    for (const { href, nom } of liens) {
      const noms = parDestination.get(href) ?? new Set<string>();
      noms.add(nom);
      parDestination.set(href, noms);
    }

    const promessesConcurrentes = [...parDestination]
      .filter(([, noms]) => noms.size > 1)
      .map(([href, noms]) => `${href} <- ${[...noms].join(' | ')}`);
    expect(promessesConcurrentes).toEqual([]);
  });
}
