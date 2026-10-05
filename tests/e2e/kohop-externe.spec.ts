import { test, expect, type Browser, type Page } from '@playwright/test';
import {
  getKohopInvitationLink,
  getOtp,
  menuCompte,
  provisionUser,
  seedKohopPilot,
} from './_helpers';
import { SESSIONS, type SessionKey } from './_sessions';
import { attendreAucuneViolationGrave } from './_a11y';

// KOHOP batch 7, end to end: the author proposes someone OUTSIDE the network, the
// review chief approves, the review starts and the person gets a personal link.
// They answer WITHOUT an account (the wrong address is refused), accepting opens
// an account with no rank, they sign in with a code and hand in an analysis.
test.use({ locale: 'fr-FR' });

const word = (i: number) =>
  ['participation', 'citoyenne', 'budget', 'démocratie', 'local', 'réseau'][
    i % 6
  ];
const words = (n: number) =>
  Array.from({ length: n }, (_, i) => word(i)).join(' ');

const opened: [Page, SessionKey][] = [];
test.afterEach(async () => {
  for (const [page, key] of opened.splice(0)) {
    try {
      await page.context().storageState({ path: SESSIONS[key].state });
    } catch {
      /* the context may already be closed */
    }
  }
});

async function as(browser: Browser, key: SessionKey): Promise<Page> {
  const context = await browser.newContext({
    storageState: SESSIONS[key].state,
    locale: 'fr-FR',
  });
  const page = await context.newPage();
  opened.push([page, key]);
  return page;
}

test('relecteur extérieur : lien personnel, acceptation sans compte, connexion par code, analyse', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const directory = SESSIONS.kohopRelecteur1.email;
  const external = `e2e_kohop_ext_${Date.now()}@democracytogether.test`;
  await provisionUser(directory, 'membre');
  await seedKohopPilot(SESSIONS.kohopAuteur.email, [directory]);
  const title = `Participation externe ${Date.now()}`;

  // --- The author designates a member and someone outside ---------------------
  const author = await as(browser, 'kohopAuteur');
  await author.goto('/fr/espace-membre/kohop');
  await author.getByRole('button', { name: 'Commencer un brouillon' }).click();
  await author.getByLabel('Texte de la contribution').waitFor();
  await author
    .getByLabel('Texte de la contribution')
    .fill(`## Introduction\n\n${words(280)}\n\n${words(280)}`);
  await author.getByLabel('Titre', { exact: true }).fill(title);
  await author
    .getByLabel('Chapô')
    .fill(
      'Un chapô de cent caractères au moins, qui résume la contribution en une ou deux phrases claires et utiles au lecteur.',
    );
  await author
    .getByRole('checkbox', { name: 'Participation citoyenne' })
    .click();

  await author.getByLabel('Chercher un membre').fill('Re');
  await author
    .getByRole('button', { name: 'Désigner Rémi Relecteur comme relecteur' })
    .first()
    .click();
  await author.getByRole('button', { name: 'Comme titulaire' }).click();
  await expect(author.getByText('Rémi Relecteur').first()).toBeVisible();

  await author
    .getByRole('button', { name: 'Proposer une personne extérieure au réseau' })
    .click();
  await author.getByLabel('Nom complet').fill('Ève Externe');
  await author.getByLabel('Adresse e-mail').fill(external);
  await author.getByLabel('Affiliation').fill('Université Externe');
  await author
    .getByLabel('Page publique qui atteste son identité')
    .fill('https://univ-externe.example.org/equipe/eve-externe');
  await author
    .getByLabel('Pourquoi cette personne ?')
    .fill(
      'Spécialiste reconnue des budgets participatifs, sans lien avec moi.',
    );
  await attendreAucuneViolationGrave(
    author,
    'proposition d’un relecteur extérieur',
  );
  await author.getByRole('button', { name: 'Comme titulaire' }).click();
  await expect(
    author.getByText('Proposition enregistrée : le chef de revue la validera'),
  ).toBeVisible();
  await expect(author.getByText('Ève Externe').first()).toBeVisible();
  // The address of the person is never shown to the author.
  await expect(author.getByText(external)).toHaveCount(0);

  const boxes = author.locator(
    'section[aria-labelledby="kohop-commitments"] [role=checkbox]',
  );
  for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).click();
  await author.getByRole('button', { name: 'Déposer ma contribution' }).click();
  await expect(
    author.getByText('Le chef de revue examine votre dépôt'),
  ).toBeVisible();

  // --- The review chief approves both and starts the review --------------------
  const chief = await as(browser, 'kohopChef');
  await chief.goto('/fr/admin/kohop');
  await chief.getByRole('link', { name: new RegExp(title) }).click();
  // The chief sees what the author typed about the outsider.
  await expect(chief.getByText('Raison du choix')).toBeVisible();
  await expect(chief.getByText(external)).toBeVisible();
  for (const b of await chief
    .getByRole('button', { name: 'Valider ce relecteur' })
    .all()) {
    await b.click();
  }
  const start = chief.getByRole('button', { name: 'Lancer la relecture' });
  await expect(start).toBeEnabled({ timeout: 30_000 });
  await start.click();
  await expect(chief.getByText('En relecture').first()).toBeVisible();

  // --- The outsider answers without an account ---------------------------------
  const link = await getKohopInvitationLink(external);
  expect(link).toMatch(/\/kohop\/invitation\/[0-9a-f]{64}$/);
  const context = await browser.newContext({ locale: 'fr-FR' });
  const guest = await context.newPage();
  await guest.goto(link);
  await expect(
    guest.getByRole('heading', {
      name: 'Invitation à relire une contribution KOHOP',
    }),
  ).toBeVisible();
  await expect(guest.getByRole('heading', { name: title })).toBeVisible();
  await attendreAucuneViolationGrave(
    guest,
    'invitation d’un relecteur extérieur',
  );

  // The wrong address is refused, with the same page as any broken link.
  await guest.getByLabel('Votre adresse e-mail').fill('autre@example.org');
  await guest.getByRole('radio', { name: 'J’accepte de relire' }).click();
  await guest.getByRole('checkbox', { name: /aucun conflit/ }).click();
  await guest.getByRole('checkbox', { name: /publiée avec mon nom/ }).click();
  await guest.getByRole('button', { name: 'Accepter la relecture' }).click();
  await expect(
    guest.getByRole('heading', { name: 'Ce lien n’est plus valable' }),
  ).toBeVisible();

  // The right one works, once.
  await guest.goto(link);
  await guest.getByLabel('Votre adresse e-mail').fill(external);
  await guest.getByRole('radio', { name: 'J’accepte de relire' }).click();
  await guest.getByRole('checkbox', { name: /aucun conflit/ }).click();
  await guest.getByRole('checkbox', { name: /publiée avec mon nom/ }).click();
  await guest.getByRole('button', { name: 'Accepter la relecture' }).click();
  await expect(
    guest.getByRole('heading', {
      name: 'Merci : votre acceptation est enregistrée',
    }),
  ).toBeVisible();
  await guest.goto(link);
  await expect(
    guest.getByRole('heading', { name: 'Ce lien n’est plus valable' }),
  ).toBeVisible();

  // --- Sign-in by code, then the same journey as a member ------------------------
  await guest.goto('/fr/connexion-otp');
  await guest.getByLabel('E-mail').fill(external);
  await guest.getByRole('button', { name: 'Recevoir un code' }).click();
  await guest.getByLabel('Code de vérification').fill(await getOtp(external));
  await guest.getByRole('button', { name: 'Se connecter' }).click();
  await expect(menuCompte(guest)).toBeVisible({ timeout: 20_000 });
  await guest.goto('/fr/espace-membre/relectures');
  await guest.getByRole('link', { name: new RegExp(title) }).click();
  await expect(
    guest.getByRole('heading', { name: 'Le texte à relire' }),
  ).toBeVisible();
  await guest.getByRole('radio', { name: 'Favorable', exact: true }).click();
  await guest
    .getByLabel('Votre analyse (publique)')
    .fill(`Cette contribution est claire et bien documentée. ${words(180)}`);
  await guest.getByRole('button', { name: 'Rendre mon analyse' }).click();
  await expect(guest.getByText('Votre analyse est enregistrée')).toBeVisible();
  await context.close();
});
