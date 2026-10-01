import { test, expect, type Browser, type Page } from '@playwright/test';
import { resetProgrammes } from './_helpers';
import { SESSIONS, type SessionKey } from './_sessions';
import { chooseOption } from './_fields';

// F-59 — Mentoring, end to end: a mentor and a mentee maintain their
// profile; the coordinator reads the suggestions (explained score) and proposes the
// pair; both accept it; a session is logged; the
// coordinator follows the pair without reading the private notes.
test.use({ locale: 'fr-FR' });

async function as(browser: Browser, key: SessionKey) {
  const context = await browser.newContext({
    storageState: SESSIONS[key].state,
    locale: 'fr-FR',
  });
  const page = await context.newPage();
  return {
    page,
    done: async () => {
      await context.storageState({ path: SESSIONS[key].state });
      await context.close();
    },
  };
}

async function fillProfile(
  page: Page,
  region: string,
  name: string,
  goalsLabel: string,
) {
  const card = page.getByRole('region', { name: region });
  await card.getByRole('button', { name: 'Créer ce profil' }).click();
  const form = page.getByRole('form', { name: region });
  await form.getByLabel('Nom affiché').fill(name);
  await chooseOption(form.getByLabel('Région'), 'Afrique de l’Ouest');
  for (const theme of [
    'Participation citoyenne',
    'Gouvernance numérique',
    'Lutte anti-corruption',
  ])
    await form.getByRole('checkbox', { name: theme, exact: true }).check();
  await form.getByRole('checkbox', { name: 'Français', exact: true }).check();
  await form
    .getByLabel(goalsLabel)
    .fill('Construire un observatoire local de la participation citoyenne.');
  return form;
}

test.describe
  .serial('mentorat : appariement suggéré → acceptation → séance', () => {
  test.beforeAll(async () => {
    await resetProgrammes([
      SESSIONS.progMentor.email,
      SESSIONS.progMentore.email,
    ]);
  });

  test('parcours complet', async ({ browser }) => {
    test.setTimeout(180_000);
    const stamp = Date.now();
    const mentorName = `Mentor E2E ${stamp}`;
    const menteeName = `Mentorée E2E ${stamp}`;

    // 1. The mentor and the mentee maintain their profile.
    const mentor = await as(browser, 'progMentor');
    await mentor.page.goto('/fr/espace-membre/mentorat');
    const mentorForm = await fillProfile(
      mentor.page,
      'Profil mentor (j’accompagne)',
      mentorName,
      'Ce que je peux apporter',
    );
    await chooseOption(
      mentorForm.getByLabel('Binômes simultanés acceptés'),
      '5',
    );
    await mentorForm
      .getByRole('button', { name: 'Enregistrer le profil' })
      .click();
    await expect(
      mentor.page
        .getByRole('region', { name: 'Profil mentor (j’accompagne)' })
        .getByText('Actif', { exact: true }),
    ).toBeVisible();
    await mentor.done();

    const mentee = await as(browser, 'progMentore');
    await mentee.page.goto('/fr/espace-membre/mentorat');
    const menteeForm = await fillProfile(
      mentee.page,
      'Profil mentoré·e (je cherche un mentor)',
      menteeName,
      'Mes objectifs',
    );
    await menteeForm
      .getByRole('button', { name: 'Enregistrer le profil' })
      .click();
    await expect(
      mentee.page
        .getByRole('region', {
          name: 'Profil mentoré·e (je cherche un mentor)',
        })
        .getByText('Actif', { exact: true }),
    ).toBeVisible();
    await mentee.done();

    // 2. The coordinator reads the explained suggestion and proposes the pair.
    const coord = await as(browser, 'progMentoratCoordination');
    await coord.page.goto('/fr/admin/mentorat/coordination');
    const menteeRow = coord.page
      .getByRole('listitem')
      .filter({ hasText: menteeName })
      .first();
    await menteeRow
      .getByRole('button', { name: 'Voir les mentors suggérés' })
      .click();
    const suggestion = menteeRow
      .getByRole('listitem')
      .filter({ hasText: mentorName });
    // Identical profiles, mentor available: the score is full, and it is readable.
    await expect(
      suggestion.getByText('Score d’appariement : 100 / 100'),
    ).toBeVisible();
    await expect(
      suggestion.getByText(/Langue commune : Français/),
    ).toBeVisible();
    await expect(
      suggestion.getByText(/Même région : Afrique de l’Ouest/),
    ).toBeVisible();
    await suggestion
      .getByRole('button', { name: `Proposer ${mentorName}` })
      .click();
    await expect(
      coord.page
        .getByRole('listitem')
        .filter({ hasText: `${mentorName} · ${menteeName}` })
        .getByText('Proposé', { exact: true }),
    ).toBeVisible();
    await coord.done();

    // 3. Both parties accept from their area.
    for (const [key, other] of [
      ['progMentor', menteeName],
      ['progMentore', mentorName],
    ] as const) {
      const party = await as(browser, key);
      await party.page.goto('/fr/espace-membre/mentorat');
      const pair = party.page.getByRole('listitem').filter({ hasText: other });
      await pair.getByRole('button', { name: 'Accepter le binôme' }).click();
      await expect(
        pair.getByRole('button', { name: 'Accepter le binôme' }),
      ).toHaveCount(0);
      await party.done();
    }

    // 4. The mentee logs a session, notes included.
    const mentee2 = await as(browser, 'progMentore');
    await mentee2.page.goto('/fr/espace-membre/mentorat');
    const pair = mentee2.page
      .getByRole('listitem')
      .filter({ hasText: mentorName });
    await expect(pair.getByText('Actif', { exact: true })).toBeVisible();
    await pair.getByRole('link', { name: 'Ouvrir le suivi' }).click();
    await mentee2.page.getByLabel('Durée (minutes)').fill('45');
    await mentee2.page
      .getByLabel('Notes', { exact: true })
      .fill('Notes privées : plan de l’enquête.');
    await mentee2.page
      .getByRole('button', { name: 'Journaliser la séance' })
      .click();
    await expect(mentee2.page.getByText('Séance journalisée.')).toBeVisible();
    await expect(mentee2.page.getByText(/· 45 min/)).toBeVisible();
    await expect(
      mentee2.page.getByText('Notes privées : plan de l’enquête.'),
    ).toBeVisible();
    const pairUrl = mentee2.page.url();
    await mentee2.done();

    // 5. The coordinator follows the pair: the session, not its notes.
    const coord2 = await as(browser, 'progMentoratCoordination');
    await coord2.page.goto(pairUrl);
    await expect(coord2.page.getByText('Vue du coordinateur')).toBeVisible();
    await expect(coord2.page.getByText(/· 45 min/)).toBeVisible();
    await expect(
      coord2.page.getByText('Notes privées : plan de l’enquête.'),
    ).toHaveCount(0);
    await coord2.done();
  });
});
