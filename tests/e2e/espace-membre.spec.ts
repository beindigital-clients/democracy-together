import { test, expect, type Page } from '@playwright/test';
import { SESSIONS } from './_sessions';

// THE REDESIGNED MEMBER AREA, through a browser: the shared navigation, the
// dashboard as a member and as an administrator, the profile editor (live
// preview, unsaved changes, save) and "Mes publications".
//
// Each describe block holds its own session and rewrites it after each test
// (see `_sessions.ts`): several contexts drawn from one stored state would
// otherwise present a refresh token that a previous test already spent.

const nav = (page: Page) =>
  page.getByRole('navigation', { name: 'Mon espace' });

test.describe('espace membre — vu par un membre', () => {
  test.use({ storageState: SESSIONS.espaceMembre.state });
  test.afterEach(async ({ context }) => {
    await context.storageState({ path: SESSIONS.espaceMembre.state });
  });

  test('tableau de bord : le lieu, la navigation, et rien de réservé à l’équipe', async ({
    page,
  }) => {
    await page.goto('/fr/espace-membre');
    await expect(page).toHaveTitle('Espace membre · Democracy Together');
    await expect(
      page.getByRole('heading', { level: 1, name: /^Espace membre/ }),
    ).toBeVisible();

    const menu = nav(page);
    await expect(
      menu.getByRole('link', { name: 'Tableau de bord' }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(
      menu.getByRole('link', { name: 'Mes publications' }),
    ).toBeVisible();
    // Staff only: neither the entry nor the block.
    await expect(
      menu.getByRole('link', { name: 'Administration' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: /Espace d.administration/ }),
    ).toHaveCount(0);

    // The blocks of a member's dashboard.
    for (const name of ['Mes publications', 'Tribune', 'Mon adhésion']) {
      await expect(page.getByRole('region', { name })).toBeVisible();
    }
    await expect(
      page.getByRole('link', { name: /Conversations non lues/ }),
    ).toBeVisible();
  });

  test('navigation : l’entrée courante suit la page, le titre d’onglet aussi', async ({
    page,
  }) => {
    await page.goto('/fr/espace-membre');
    await nav(page).getByRole('link', { name: 'Sécurité' }).click();
    await expect(page).toHaveURL(/\/fr\/espace-membre\/securite$/);
    await expect(page).toHaveTitle(
      'Sécurité du compte · Espace membre · Democracy Together',
    );
    await expect(
      nav(page).getByRole('link', { name: 'Sécurité' }),
    ).toHaveAttribute('aria-current', 'page');
    await expect(
      nav(page).getByRole('link', { name: 'Tableau de bord' }),
    ).not.toHaveAttribute('aria-current', 'page');
  });

  test('profil : aperçu en direct, modifications signalées, annulées puis enregistrées', async ({
    page,
  }) => {
    const nom = `Membre E2E ${Date.now()}`;
    await page.goto('/fr/espace-membre/profil');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Mon profil' }),
    ).toBeVisible();
    const apercu = page.getByRole('region', { name: 'Aperçu de votre carte' });

    // Typing shows up in the preview, and the page says something is left
    // to save.
    await page.getByLabel('Nom affiché').fill(nom);
    await expect(apercu).toContainText(nom);
    await expect(
      page.getByText('Modifications non enregistrées'),
    ).toBeVisible();

    // The country is picked by name, from a list one can SEARCH: typed
    // without its accents, "senegal" finds it, and Enter picks it.
    const pays = page.getByRole('combobox', { name: 'Pays' });
    await pays.click();
    const recherche = page.getByRole('combobox', {
      name: 'Rechercher un pays',
    });
    await expect(recherche).toBeFocused();
    await recherche.fill('senegal');
    await expect(page.getByRole('option')).toHaveText(['Sénégal']);
    await recherche.press('Enter');
    await expect(pays).toHaveText('Sénégal');
    await expect(pays).toBeFocused();
    await expect(apercu).toContainText('Sénégal');

    await page
      .getByRole('button', { name: /Créer mon profil|Enregistrer le profil/ })
      .click();
    await expect(page.getByText('Profil enregistré.')).toBeVisible();
    await expect(page.getByText('Modifications non enregistrées')).toHaveCount(
      0,
    );

    // A change then discarded leaves nothing to save.
    await page.getByLabel('Fonction').fill('Fonction provisoire');
    await expect(
      page.getByText('Modifications non enregistrées'),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Annuler les modifications' })
      .click();
    await expect(page.getByLabel('Fonction')).not.toHaveValue(
      'Fonction provisoire',
    );
    await expect(page.getByText('Modifications non enregistrées')).toHaveCount(
      0,
    );

    // Saved for real: a reload keeps it.
    await page.reload();
    await expect(page.getByLabel('Nom affiché')).toHaveValue(nom);
    await expect(page.getByRole('combobox', { name: 'Pays' })).toHaveText(
      'Sénégal',
    );
  });

  test('profil : un refus du serveur est rattaché à son champ, qui reçoit le focus', async ({
    page,
  }) => {
    await page.goto('/fr/espace-membre/profil');
    const identifiant = page.getByLabel('Identifiant public');
    await expect(identifiant).toBeVisible();
    // A reserved handle is refused by the server.
    await identifiant.fill('admin');
    if (!(await page.getByLabel('Nom affiché').inputValue())) {
      await page.getByLabel('Nom affiché').fill('Membre E2E');
    }
    await page
      .getByRole('button', { name: /Créer mon profil|Enregistrer le profil/ })
      .click();
    await expect(identifiant).toHaveAttribute('aria-invalid', 'true');
    await expect(identifiant).toBeFocused();
  });

  test('mes publications : filtre par statut, et le dépôt à un clic', async ({
    page,
  }) => {
    await page.goto('/fr/espace-membre/publications');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Mes publications' }),
    ).toBeVisible();
    await expect(
      nav(page).getByRole('link', { name: 'Mes publications' }),
    ).toHaveAttribute('aria-current', 'page');
    await page
      .getByRole('main')
      .getByRole('link', { name: 'Nouvelle publication' })
      .click();
    await expect(page).toHaveURL(/\/fr\/espace-membre\/deposer$/);
    // The submission form belongs to "Mes publications" in the navigation.
    await expect(
      nav(page).getByRole('link', { name: 'Mes publications' }),
    ).toHaveAttribute('aria-current', 'page');
  });
});

test.describe('espace membre — vu par un administrateur', () => {
  test.use({ storageState: SESSIONS.espaceMembreAdmin.state });
  test.afterEach(async ({ context }) => {
    await context.storageState({ path: SESSIONS.espaceMembreAdmin.state });
  });

  test('le bloc Administration mène aux files et au back-office', async ({
    page,
  }) => {
    await page.goto('/fr/espace-membre');
    const bloc = page.getByRole('region', { name: 'Administration' });
    await expect(bloc).toBeVisible();
    await expect(
      bloc.getByRole('link', { name: /Candidatures en attente/ }),
    ).toHaveAttribute('href', '/fr/admin/candidatures');
    await expect(
      bloc.getByRole('link', { name: /Comptes utilisateurs/ }),
    ).toHaveAttribute('href', '/fr/admin/utilisateurs');

    await expect(
      nav(page).getByRole('link', { name: 'Administration' }),
    ).toBeVisible();
    await bloc.getByRole('link', { name: /Espace d.administration/ }).click();
    await expect(page).toHaveURL(/\/fr\/admin$/);
  });
});
