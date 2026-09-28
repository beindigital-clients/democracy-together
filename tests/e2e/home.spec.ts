import { test, expect } from '@playwright/test';
import { choixLangue, ouvrirSelecteurDeLangue } from './_langue';

// French browser: makes Accept-Language detection deterministic
// (otherwise `/` is redirected to /en with the default en-US browser).
test.use({ locale: 'fr-FR' });

test('redirige / vers /fr (middleware)', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/fr$/);
});

test('home FR puis bascule EN par URL (F-03)', async ({ page }) => {
  await page.goto('/fr');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'La démocratie a besoin',
  );

  // Same gesture as the next test, hence the same guard (audit F-13). This test
  // had been left without it, and it went red in CI on commit `2c08208`:
  // expected `/en`, got `/fr`, thirteen polls. Measured since, over three
  // consecutive campaigns, the symptom occurs EVERY TIME on this
  // toggle — it was simply only being absorbed on the neighboring test.
  //
  // The guard now covers the menu OPENING, which is the exposed click
  // (the selector became a menu: see `_langue.ts`). Choosing the
  // language follows on a page whose opening has just proven hydration.
  await ouvrirSelecteurDeLangue(page);
  await choixLangue(page, 'en').click();
  await expect(page).toHaveURL(/\/en$/, { timeout: 20_000 });
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Democracy needs a network',
  );
});

test('le sélecteur de langue pose le cookie NEXT_LOCALE', async ({
  page,
  context,
}) => {
  await page.goto('/fr');
  await ouvrirSelecteurDeLangue(page);
  await choixLangue(page, 'en').click();
  await expect(page).toHaveURL(/\/en$/, { timeout: 20_000 });
  // The cookie is written by next-intl during navigation: we wait for it
  // (expect.poll) instead of a single read -> no race.
  await expect
    .poll(
      async () =>
        (await context.cookies()).find((c) => c.name === 'NEXT_LOCALE')?.value,
    )
    .toBe('en');
});

test('le bouton thème bascule data-theme (F-04)', async ({ page }) => {
  await page.goto('/fr');
  const html = page.locator('html');
  const before = await html.getAttribute('data-theme');
  // The theme toggle lives in the footer (removed from the desktop bar);
  // it also remains in the mobile menu.
  await page
    .locator('footer')
    .getByRole('button', { name: /thème|theme/i })
    .click();
  await expect(html).not.toHaveAttribute('data-theme', before ?? 'light');
});

// THE FORM CHANGED, THE REQUIREMENT DID NOT. The segmented "FR | EN" row gave
// two things for free: the current language readable WITHOUT opening anything, and
// the choice visible at a glance. A menu can lose the first —
// that is its classic flaw. So this test holds both separately, rather
// than merely noting the menu is present.
test('sélecteur de langue : langue courante lisible fermé, cinq langues dans le menu (F-03)', async ({
  page,
}) => {
  await page.goto('/fr');

  // 1. Closed: the trigger announces the current language.
  const declencheur = page
    .getByRole('banner')
    .getByRole('button', { name: 'Langue' });
  await expect(declencheur).toContainText('FR');
  await expect(declencheur).toHaveAttribute('aria-expanded', 'false');

  // 2. Open: the five languages, the active one checked — then, in the desktop
  // header, the two appearance choices (light / dark), which have no
  // `lang` ("Langue et affichage" menu).
  const menu = await ouvrirSelecteurDeLangue(page);
  await expect(menu.locator('[role="menuitemradio"][lang]')).toHaveCount(5);
  await expect(menu.getByRole('menuitemradio')).toHaveCount(7);
  await expect(
    menu.getByRole('menuitemradio', { name: 'Français' }),
  ).toHaveAttribute('aria-checked', 'true');
  await expect(
    menu.getByRole('menuitemradio', { name: 'English' }),
  ).toHaveAttribute('aria-checked', 'false');

  // 3. The labels are ENDONYMS, including on a French page:
  // "العربية" and not "Arabe". Someone looking for their language in an
  // interface they cannot read looks for the word they know. A translated name
  // here would go unnoticed by any French-speaking review.
  await expect(
    menu.getByRole('menuitemradio', { name: 'العربية' }),
  ).toBeVisible();
  await expect(
    menu.getByRole('menuitemradio', { name: 'Português' }),
  ).toBeVisible();
});

test('accueil : toutes les sections de la maquette présentes (F-10)', async ({
  page,
}) => {
  await page.goto('/fr');
  // hero: CTA + meta strip (status / offices / founded by)
  await expect(
    page.getByRole('link', { name: 'Lire les analyses' }),
  ).toBeVisible();
  await expect(page.getByText('Bureaux', { exact: true })).toBeVisible();
  for (const name of [
    'Dernières analyses',
    'Le Baromètre de la démocratie',
    'Cinq axes de travail',
    'Événements',
    'Rejoindre le réseau',
    'La lettre d’analyses',
  ]) {
    await expect(page.getByRole('heading', { name })).toBeVisible();
  }
  // youth section (saffron theme)
  await expect(
    page.getByRole('heading', {
      name: /moins de 35 ans et des idées pour la démocratie/i,
    }),
  ).toBeVisible();
});
