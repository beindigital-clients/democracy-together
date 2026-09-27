import { test, expect } from '@playwright/test';
import {
  deleteE2eContent,
  importCodedContent,
  isEventRegistered,
} from './_helpers';
import { SESSIONS } from './_sessions';

// CHANTIER « CONTENUS » — F-52, F-54, F-62 : le parcours principal de l'agenda.
//
//   1. un ÉDITEUR crée un événement depuis le back-office (brouillon), le
//      publie ;
//   2. l'événement apparaît dans l'agenda PUBLIC (liste et fiche), sans que
//      son lien de visioconférence figure dans la page ;
//   3. un MEMBRE s'y inscrit, et le lien de visioconférence lui est alors
//      révélé — à lui seul.
//
// Les étapes s'enchaînent sur la même donnée : le fichier est SÉRIEL. Chaque
// rôle a sa session dédiée (cf. `_sessions.ts`), réécrite après chaque test
// pour que le jeton de rafraîchissement ne soit jamais rejoué.
//
// L'événement est daté de 2030 : il ne tombe dans aucun mois que
// `calendrier.spec.ts` compte, et reste « à venir » quel que soit le jour de
// l'exécution. Son slug porte le préfixe `e2e-` que le ménage de fin retire.

test.use({ locale: 'fr-FR' });
test.describe.configure({ mode: 'serial' });

const stamp = Date.now();
const SLUG = `e2e-webinaire-${stamp}`;
const TITLE = `Webinaire E2E ${stamp}`;
const PLACE = 'En ligne (E2E)';
const VISIO = `https://visio.example.org/e2e-${stamp}`;

test.beforeAll(async () => {
  // L'agenda doit porter le contenu codé AVANT qu'un premier événement créé ne
  // fasse basculer les pages publiques du repli codé vers la table.
  await importCodedContent();
});

test.afterAll(async () => {
  await deleteE2eContent();
});

test.describe('éditeur', () => {
  test.use({ storageState: SESSIONS.contenusEvenements.state });
  test.afterEach(async ({ context }) => {
    await context.storageState({ path: SESSIONS.contenusEvenements.state });
  });

  test('crée un événement, le publie : il apparaît dans l’agenda public', async ({
    page,
  }) => {
    await page.goto('/fr/admin/contenus/evenements');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Événements' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Nouvel événement' }).click();
    const editor = page.getByRole('region', { name: 'Nouvel événement' });
    await editor.getByLabel('Adresse (slug)').fill(SLUG);
    await editor.getByLabel('Titre', { exact: true }).fill(TITLE);
    await editor.getByLabel('Lieu affiché').fill(PLACE);
    await editor
      .getByLabel('Chapô (présentation courte)')
      .fill('Un webinaire créé depuis le back-office par la suite E2E.');
    // La traduction anglaise, pour vérifier l'indicateur de langue.
    await editor.getByRole('button', { name: /Anglais/ }).click();
    await editor
      .getByLabel('Titre', { exact: true })
      .fill(`E2E webinar ${stamp}`);
    await editor.getByRole('button', { name: /Français/ }).click();

    await editor.getByLabel('Date de début').fill('2030-03-15');
    await editor.getByLabel('Heure de début (facultative)').fill('14:00');
    await editor.getByLabel('Heure de fin (facultative)').fill('15:30');
    await editor.getByLabel('Fuseau horaire du lieu').fill('Europe/Paris');
    await editor.getByLabel('Lien de visioconférence').fill(VISIO);
    await editor.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(page.getByText(`« ${TITLE} » enregistré.`)).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: TITLE });
    await expect(row).toContainText('Brouillon');
    // Traduit en fr et en : les trois autres langues sont signalées.
    await expect(row).toContainText('À traduire');

    // Un brouillon n'est PAS public.
    const draft = await page.request.get(`/fr/evenements/${SLUG}`);
    expect(draft.status()).toBe(404);

    await row.getByRole('button', { name: 'Publier' }).click();
    await expect(page.getByText(`« ${TITLE} » publié.`)).toBeVisible();
    await expect(row).toContainText('Publié');

    // Agenda public : la liste (recherche sur le titre) puis la fiche.
    await page.goto(`/fr/evenements?q=${stamp}`);
    await expect(page.getByRole('link', { name: TITLE })).toBeVisible();
    await page.getByRole('link', { name: TITLE }).click();
    await expect(page).toHaveURL(new RegExp(`/fr/evenements/${SLUG}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(TITLE);
    await expect(page.getByText(PLACE).first()).toBeVisible();
    // Le lien de visioconférence n'est dans AUCUNE page publique.
    expect(await page.content()).not.toContain(VISIO);

    // La version anglaise sert le titre anglais.
    await page.goto(`/en/evenements/${SLUG}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      `E2E webinar ${stamp}`,
    );
  });
});

test.describe('membre', () => {
  test.use({ storageState: SESSIONS.contenusMembre.state });
  test.afterEach(async ({ context }) => {
    await context.storageState({ path: SESSIONS.contenusMembre.state });
  });

  test('s’inscrit à l’événement : le lien de visioconférence lui est révélé', async ({
    page,
  }) => {
    await page.goto(`/fr/evenements/${SLUG}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(TITLE);
    // Connecté mais pas encore inscrit : pas de lien.
    await expect(
      page.getByRole('link', { name: 'Rejoindre la visioconférence' }),
    ).toHaveCount(0);

    const form = page.locator('#inscription');
    await form.getByLabel('Nom complet').fill('Membre E2E');
    await form.getByLabel('Adresse e-mail').fill(SESSIONS.contenusMembre.email);
    await form
      .getByRole('button', { name: 'Confirmer mon inscription' })
      .click();
    await expect(page.getByText(/Inscription confirmée/)).toBeVisible();

    // L'inscription est bien stockée, contre la table des événements.
    expect(isEventRegistered(SLUG, SESSIONS.contenusMembre.email)).toBe(true);

    // La requête est réactive : le lien apparaît sans recharger la page.
    const join = page.getByRole('link', {
      name: 'Rejoindre la visioconférence',
    });
    await expect(join).toBeVisible();
    await expect(join).toHaveAttribute('href', VISIO);
  });
});

test('visiteur anonyme : ni lien, ni fuite dans le HTML', async ({ page }) => {
  await page.goto(`/fr/evenements/${SLUG}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(TITLE);
  await expect(
    page.getByRole('link', { name: 'Rejoindre la visioconférence' }),
  ).toHaveCount(0);
  expect(await page.content()).not.toContain(VISIO);
});
