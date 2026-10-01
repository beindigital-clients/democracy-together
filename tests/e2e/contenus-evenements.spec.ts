import { test, expect } from '@playwright/test';
import {
  deleteE2eContent,
  importCodedContent,
  isEventRegistered,
} from './_helpers';
import { SESSIONS } from './_sessions';
import { chooseOption } from './_fields';

// "CONTENUS" WORKSTREAM — F-52, F-54, F-62: the agenda's main journey.
//
//   1. an EDITOR creates an event from the back office (draft), then
//      publishes it;
//   2. the event appears in the PUBLIC agenda (list and page), without
//      its videoconference link appearing in the page;
//   3. a MEMBER registers for it, and the videoconference link is then
//      revealed to them — to them alone.
//
// The steps chain on the same data: the file is SERIAL. Each
// role has its dedicated session (see `_sessions.ts`), rewritten after each test
// so that the refresh token is never replayed.
//
// The event is dated 2030: it falls in none of the months that
// `calendrier.spec.ts` counts, and stays "upcoming" whatever the day of
// the run. Its slug carries the `e2e-` prefix that the final cleanup removes.

test.use({ locale: 'fr-FR' });
test.describe.configure({ mode: 'serial' });

const stamp = Date.now();
const SLUG = `e2e-webinaire-${stamp}`;
const TITLE = `Webinaire E2E ${stamp}`;
const PLACE = 'En ligne (E2E)';
const VISIO = `https://visio.example.org/e2e-${stamp}`;

test.beforeAll(async () => {
  // The agenda must carry the hard-coded content BEFORE a first created event
  // switches the public pages from the hard-coded fallback to the table.
  await importCodedContent();
});

test.afterAll(async () => {
  await deleteE2eContent(stamp);
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
    // The English translation, to check the language indicator. The
    // editing languages are a radio group (shadcn ToggleGroup).
    await editor.getByRole('radio', { name: /Anglais/ }).click();
    await editor
      .getByLabel('Titre', { exact: true })
      .fill(`E2E webinar ${stamp}`);
    await editor.getByRole('radio', { name: /Français/ }).click();

    await editor.getByLabel('Date de début').fill('2030-03-15');
    await editor.getByLabel('Heure de début (facultative)').fill('14:00');
    await editor.getByLabel('Heure de fin (facultative)').fill('15:30');
    // A searchable list of the IANA zones, no longer a free-text field.
    await chooseOption(
      editor.getByLabel('Fuseau horaire du lieu'),
      'Europe/Paris',
    );
    await editor.getByLabel('Lien de visioconférence').fill(VISIO);
    await editor.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(page.getByText(`« ${TITLE} » enregistré.`)).toBeVisible();
    const row = page.getByRole('row').filter({ hasText: TITLE });
    await expect(row).toContainText('Brouillon');
    // Translated into fr and en: the three other languages are flagged.
    await expect(row).toContainText('À traduire');

    // A draft is NOT public.
    const draft = await page.request.get(`/fr/evenements/${SLUG}`);
    expect(draft.status()).toBe(404);

    await row.getByRole('button', { name: 'Publier' }).click();
    await expect(page.getByText(`« ${TITLE} » publié.`)).toBeVisible();
    await expect(row).toContainText('Publié');

    // Public agenda: the list (search on the title) then the page.
    await page.goto(`/fr/evenements?q=${stamp}`);
    await expect(page.getByRole('link', { name: TITLE })).toBeVisible();
    await page.getByRole('link', { name: TITLE }).click();
    await expect(page).toHaveURL(new RegExp(`/fr/evenements/${SLUG}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(TITLE);
    await expect(page.getByText(PLACE).first()).toBeVisible();
    // The videoconference link is in NO public page.
    expect(await page.content()).not.toContain(VISIO);

    // The English version serves the English title.
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
    // Signed in but not yet registered: no link.
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

    // The registration is indeed stored, against the events table.
    expect(isEventRegistered(SLUG, SESSIONS.contenusMembre.email)).toBe(true);

    // The query is reactive: the link appears without reloading the page.
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
