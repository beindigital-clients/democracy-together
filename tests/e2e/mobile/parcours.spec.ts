import { test, expect, type Page } from '@playwright/test';

// Parcours complet sur téléphone TACTILE (projet `mobile-chromium` : viewport
// 412x839, `hasTouch`). Le mobile est le premier usage attendu du cadrage —
// jusqu'ici aucun parcours ne s'y déroulait, et les correctifs mobiles de la
// PR #4 avaient dû être vérifiés à la main en émulation.
//
// Tous les gestes passent par `tap()` (et non `click()`) : c'est la seule
// manière d'exercer les chemins `pointerType: 'touch'`, ceux qui régressent.
test.use({ locale: 'fr-FR' });

const MENU_TOGGLE = 'button[aria-controls="mobile-nav"]';

// Un débordement horizontal est LE défaut mobile classique (et invisible en
// desktop) : la page défile latéralement, le contenu sort de l'écran.
async function noHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const d = document.documentElement;
    return { scroll: d.scrollWidth, client: d.clientWidth };
  });
  expect(
    overflow.scroll,
    `débordement horizontal : ${overflow.scroll}px pour ${overflow.client}px de large`,
  ).toBeLessThanOrEqual(overflow.client + 1); // +1 : arrondi sous-pixel
}

test('mobile : accueil -> menu -> bibliothèque -> facettes repliées -> détail', async ({
  page,
}) => {
  await page.goto('/fr');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'La démocratie a besoin',
  );
  await noHorizontalOverflow(page);

  // 1. La nav desktop est masquée : seul le menu tactile donne accès aux liens.
  const toggle = page.locator(MENU_TOGGLE);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.tap();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');

  await page
    .locator('#mobile-nav')
    .getByRole('link', { name: 'Analyses', exact: true })
    .tap();
  await expect(page).toHaveURL(/\/fr\/bibliotheque$/);
  // le panneau se referme après navigation
  await expect(page.locator(MENU_TOGGLE)).toHaveAttribute(
    'aria-expanded',
    'false',
  );

  // 2. Bibliothèque : sous `lg`, les facettes sont repliées derrière « Filtrer »
  // (sans ce repli, la liste passait sous la pliure sur téléphone).
  const cards = page
    .getByRole('list', { name: 'Liste des publications' })
    .getByRole('listitem');
  await expect(cards.first()).toBeVisible();
  await noHorizontalOverflow(page);

  const filters = page.locator('button[aria-controls="library-facets"]');
  await expect(filters).toBeVisible();
  await expect(filters).toHaveAttribute('aria-expanded', 'false');
  const themeFacet = page
    .getByRole('link', { name: /Transitions démocratiques/ })
    .first();
  await expect(themeFacet).toBeHidden(); // replié : pas juste hors écran

  await filters.tap();
  await expect(filters).toHaveAttribute('aria-expanded', 'true');
  await expect(themeFacet).toBeVisible();

  // 3. Filtrage par thématique (lien GET rendu côté serveur)
  await themeFacet.tap();
  await expect(page).toHaveURL(/[?&]theme=transitions/);
  await expect(page.getByText(/\d+ publications?/).first()).toBeVisible();
  // une facette active -> compteur sur le bouton replié + lien de remise à zéro
  await expect(filters).toContainText('1');
  await expect(page.getByRole('link', { name: 'Réinitialiser' })).toBeVisible();

  // 4. Ouverture d'une fiche au doigt
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

  // Les champs du formulaire tiennent dans l'écran et se remplissent au doigt.
  const name = page.getByLabel('Nom du think tank');
  await name.tap();
  await name.fill('Institut Mobile E2E');
  await expect(name).toHaveValue('Institut Mobile E2E');
  await expect(
    page.getByRole('button', { name: 'Envoyer ma candidature' }),
  ).toBeVisible();
});
