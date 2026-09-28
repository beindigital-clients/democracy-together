import { test, expect, type Page } from '@playwright/test';

// Full flow on a TOUCH phone (`mobile-chromium` project: viewport
// 412x839, `hasTouch`). Mobile is the primary expected use per the scoping document —
// until now no flow ran there, and the mobile fixes of
// PR #4 had to be verified by hand in emulation.
//
// Every gesture goes through `tap()` (not `click()`): it is the only
// way to exercise the `pointerType: 'touch'` paths, the ones that regress.
test.use({ locale: 'fr-FR' });

const MENU_TOGGLE = 'button[aria-controls="mobile-nav"]';

// Horizontal overflow is THE classic mobile defect (and invisible on
// desktop): the page scrolls sideways, the content goes off screen.
async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const d = document.documentElement;
    return { scroll: d.scrollWidth, client: d.clientWidth };
  });
  expect(
    overflow.scroll,
    `débordement horizontal : ${overflow.scroll}px pour ${overflow.client}px de large`,
  ).toBeLessThanOrEqual(overflow.client + 1); // +1: sub-pixel rounding
}

test('mobile : accueil -> menu -> bibliothèque -> facettes repliées -> détail', async ({
  page,
}) => {
  await page.goto('/fr');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'La démocratie a besoin',
  );
  await noHorizontalOverflow(page);

  // 1. The desktop nav is hidden: only the touch menu gives access to the links.
  const toggle = page.locator(MENU_TOGGLE);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.tap();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  await page
    .locator('#mobile-nav')
    .getByRole('link', { name: 'Analyses', exact: true })
    .tap();
  await expect(page).toHaveURL(/\/fr\/bibliotheque$/);
  // the panel closes after navigation
  await expect(page.locator(MENU_TOGGLE)).toHaveAttribute(
    'aria-expanded',
    'false',
  );

  // 2. Library: below `lg`, the facets are collapsed behind "Filtrer"
  // (without this collapse, the list fell below the fold on a phone).
  const cards = page
    .getByRole('list', { name: 'Liste des publications' })
    .getByRole('listitem');
  await expect(cards.first()).toBeVisible();
  await noHorizontalOverflow(page);

  const filters = page.locator('button[aria-controls="library-facets"]');
  await expect(filters).toBeVisible();
  await expect(filters).toHaveAttribute('aria-expanded', 'false');
  // Scope limited to the facet panel. Without it, `.first()` landed on
  // the publication CARD: the theme badge is part of its accessible
  // name, and it precedes the facets in the DOM. The test therefore failed
  // on a visible element, whereas it checks that the facets are collapsed.
  const themeFacet = page
    .locator('#library-facets')
    .getByRole('link', { name: /Transitions démocratiques/ });
  await expect(themeFacet).toBeHidden(); // collapsed: not just off screen

  await filters.tap();
  await expect(filters).toHaveAttribute('aria-expanded', 'true');
  await expect(themeFacet).toBeVisible();

  // 3. Filtering by theme (server-rendered GET link)
  await themeFacet.tap();
  await expect(page).toHaveURL(/[?&]theme=transitions/);
  await expect(page.getByText(/\d+ publications?/).first()).toBeVisible();
  // an active facet -> counter on the collapsed button + reset link
  await expect(filters).toContainText('1');
  await expect(page.getByRole('link', { name: 'Réinitialiser' })).toBeVisible();

  // 4. Opening a publication page by finger
  const first = cards.first().getByRole('link').first();
  const title = (await first.textContent())?.trim() ?? '';
  expect(title.length).toBeGreaterThan(0);
  await first.tap();
  await expect(page).toHaveURL(/\/fr\/bibliotheque\/[a-z0-9-]+$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await noHorizontalOverflow(page);
});

test('mobile : le CTA d’adhésion du menu mène au formulaire, utilisable au doigt', async ({
  page,
}) => {
  await page.goto('/fr');
  await page.locator(MENU_TOGGLE).tap();
  await page
    .locator('#mobile-nav')
    .getByRole('link', { name: 'Rejoindre', exact: true })
    .tap();
  await expect(page).toHaveURL(/\/fr\/adhesion$/);

  await expect(
    page.getByRole('heading', { level: 1, name: 'Rejoindre le réseau' }),
  ).toBeVisible();
  await noHorizontalOverflow(page);

  // The form fields fit on screen and can be filled in by finger.
  const name = page.getByLabel('Nom du think tank');
  await name.tap();
  await name.fill('Institut Mobile E2E');
  await expect(name).toHaveValue('Institut Mobile E2E');
  await expect(
    page.getByRole('button', { name: 'Envoyer ma candidature' }),
  ).toBeVisible();
});
