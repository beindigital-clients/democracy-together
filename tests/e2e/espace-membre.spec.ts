import { test, expect, type Page } from '@playwright/test';
import { SESSIONS } from './_sessions';
import { provisionUser, signInWithCode } from './_helpers';

// THE REDESIGNED MEMBER AREA, through a browser: the shared navigation, the
// dashboard as a member and as an administrator, the profile editor (live
// preview, unsaved changes, save) and "Mes publications".
//
// Each describe block holds its own session and rewrites it after each test
// (see `_sessions.ts`): several contexts drawn from one stored state would
// otherwise present a refresh token that a previous test already spent.

const nav = (page: Page) =>
  page.getByRole('navigation', { name: 'Mon espace' });

// The entries of the navigation, in order: their label alone, without the
// unread count spelled out for screen readers nor the badge.
// `allInnerTexts` does not wait: the column shows a skeleton until the role
// is read, so its first entry is awaited before the list is read.
const entries = async (page: Page) => {
  await expect(
    nav(page).getByRole('link', { name: 'Tableau de bord' }),
  ).toBeVisible();
  return (await nav(page).getByRole('link').allInnerTexts()).map((text) =>
    text
      .split('\n')[0]
      .replace(/\s*\(.*\)\s*$/, '')
      .trim(),
  );
};

// The programmes and the dues: a participant's business, not the team's.
const PARTICIPANT_ONLY = [
  'Espace Jeunes',
  'Mentorat',
  'Parcours et attestations',
  'Adhésion et paiements',
];
// What a member does as a participant of the network.
const NETWORK_ONLY = [
  'Appels à projets',
  'Évaluations',
  'Mes manuscrits',
  'Mon organisation',
];

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

  test('le menu d’un membre : ses programmes, ses contributions, son adhésion', async ({
    page,
  }) => {
    await page.goto('/fr/espace-membre');
    const labels = await entries(page);
    for (const name of [
      ...PARTICIPANT_ONLY,
      ...NETWORK_ONLY,
      'Annuaire des personnes',
      'Espaces de travail',
      'Notifications',
    ]) {
      expect(labels, name).toContain(name);
    }
    expect(labels).not.toContain('Administration');
  });

  test('l’annuaire, les espaces de travail et les notifications gardent le menu', async ({
    page,
  }) => {
    await page.goto('/fr/espace-membre');
    for (const [name, url] of [
      ['Annuaire des personnes', /\/fr\/membres$/],
      ['Espaces de travail', /\/fr\/espaces$/],
      ['Notifications', /\/fr\/notifications$/],
    ] as const) {
      await nav(page).getByRole('link', { name, exact: true }).click();
      await expect(page).toHaveURL(url);
      // The column is still there, on the entry just followed.
      await expect(
        nav(page).getByRole('link', { name, exact: true }),
      ).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
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

  test('le menu de l’équipe : le back-office, sans programmes ni cotisation', async ({
    page,
  }) => {
    await page.goto('/fr/espace-membre');
    const labels = await entries(page);
    // The back office right after the everyday entries.
    expect(labels.slice(0, 5)).toEqual([
      'Tableau de bord',
      'Mon profil',
      'Messages',
      'Notifications',
      'Administration',
    ]);
    for (const name of [...PARTICIPANT_ONLY, ...NETWORK_ONLY]) {
      expect(labels, name).not.toContain(name);
    }
    for (const name of ['Annuaire des personnes', 'Mes publications']) {
      expect(labels, name).toContain(name);
    }
    // Nor on the dashboard: no programmes block, no dues block.
    await expect(page.getByRole('region', { name: 'Programmes' })).toHaveCount(
      0,
    );
    await expect(
      page.getByRole('region', { name: 'Mon adhésion' }),
    ).toHaveCount(0);
  });
});

test.describe('espace membre — vu par un visiteur', () => {
  test('le menu d’un visiteur : son compte et les programmes ouverts à tous', async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const email = `e2e_menu_visiteur_${Date.now()}@democracytogether.test`;
    await provisionUser(email, 'visiteur');
    await signInWithCode(page, email);

    const labels = await entries(page);
    for (const name of PARTICIPANT_ONLY) {
      expect(labels, name).toContain(name);
    }
    // Reserved to members: no door that would open on a refusal.
    for (const name of [
      ...NETWORK_ONLY,
      'Annuaire des personnes',
      'Espaces de travail',
      'Mes publications',
      'Tribune',
      'Administration',
    ]) {
      expect(labels, name).not.toContain(name);
    }
  });
});
