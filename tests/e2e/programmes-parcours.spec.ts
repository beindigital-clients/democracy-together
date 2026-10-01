import { test, expect, type Browser } from '@playwright/test';
import { resetProgrammes } from './_helpers';
import { SESSIONS, type SessionKey } from './_sessions';
import { chooseOption } from './_fields';

// F-56 / F-57 — Toolbox and learning paths, end to end: an editor
// publishes a resource and a two-step path (a resource, a
// replay referenced by its address); a member follows the path from the
// public page to the printable certificate.
test.use({ locale: 'fr-FR' });

const MARKER = '[E2E-prog-parcours]';

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

test.describe
  .serial('parcours d’apprentissage : publication → progression → attestation', () => {
  test.beforeAll(async () => {
    await resetProgrammes([SESSIONS.progParcoursMembre.email], MARKER);
  });

  test('parcours complet', async ({ browser }) => {
    test.setTimeout(180_000);
    const stamp = Date.now();
    const resourceTitle = `${MARKER} Guide de la consultation ${stamp}`;
    const pathTitle = `${MARKER} Organiser une consultation ${stamp}`;

    // 1. The editor publishes a resource then a path.
    const editeur = await as(browser, 'progParcoursEditeur');
    await editeur.page.goto('/fr/admin/boite-a-outils');
    await editeur.page
      .getByRole('button', { name: 'Nouvelle ressource' })
      .click();
    await editeur.page.getByLabel('Titre', { exact: true }).fill(resourceTitle);
    await editeur.page
      .getByLabel('Présentation')
      .fill('Les étapes pour organiser une consultation citoyenne.');
    await editeur.page
      .getByLabel('Adresse (lien, vidéo, replay)')
      .fill('https://example.org/guide-consultation');
    await editeur.page
      .getByRole('button', { name: 'Enregistrer', exact: true })
      .click();
    const resourceRow = editeur.page
      .getByRole('listitem')
      .filter({ hasText: resourceTitle });
    await resourceRow
      .getByRole('button', { name: 'Publier', exact: true })
      .click();
    await expect(
      resourceRow.getByText('Publié', { exact: true }),
    ).toBeVisible();

    await editeur.page
      .getByRole('button', { name: 'Parcours d’apprentissage' })
      .click();
    await editeur.page
      .getByRole('button', { name: 'Nouveau parcours' })
      .click();
    await editeur.page.getByLabel('Titre', { exact: true }).fill(pathTitle);
    await editeur.page
      .getByLabel('Présentation')
      .fill('Un parcours en deux étapes, du guide au replay.');
    await editeur.page
      .getByRole('button', { name: 'Enregistrer', exact: true })
      .click();

    const pathRow = editeur.page
      .getByRole('listitem')
      .filter({ hasText: pathTitle })
      .first();
    await pathRow.getByLabel('Titre de l’étape').fill('Lire le guide');
    await chooseOption(
      pathRow.getByLabel('Ressource de la boîte à outils'),
      resourceTitle,
    );
    await pathRow.getByRole('button', { name: 'Ajouter l’étape' }).click();
    await expect(pathRow.getByText('Lire le guide')).toBeVisible();
    await pathRow.getByLabel('Titre de l’étape').fill('Regarder le replay');
    await pathRow.getByLabel('Ou adresse (replay, page)').fill('/replays');
    await pathRow.getByRole('button', { name: 'Ajouter l’étape' }).click();
    await expect(pathRow.getByText('Regarder le replay')).toBeVisible();
    await pathRow.getByRole('button', { name: 'Publier', exact: true }).click();
    await expect(pathRow.getByText('Publié', { exact: true })).toBeVisible();
    await editeur.done();

    // 2. The member follows the path from the public toolbox.
    const membre = await as(browser, 'progParcoursMembre');
    await membre.page.goto('/fr/boite-a-outils');
    await membre.page.getByRole('link', { name: pathTitle }).click();
    await expect(
      membre.page.getByRole('heading', { level: 1, name: pathTitle }),
    ).toBeVisible();
    await membre.page
      .getByRole('button', { name: 'Suivre ce parcours' })
      .click();
    await membre.page.getByLabel('Étape 1 — Lire le guide').check();
    await expect(membre.page.getByText('1 / 2 étapes')).toBeVisible();
    await membre.page.getByLabel('Étape 2 — Regarder le replay').check();
    await expect(membre.page.getByText('2 / 2 étapes')).toBeVisible();

    // 3. The certificate: printable page, in the member's name.
    await membre.page
      .getByRole('link', { name: 'Voir mon attestation' })
      .click();
    await expect(
      membre.page.getByRole('heading', {
        level: 1,
        name: 'Attestation de fin de parcours',
      }),
    ).toBeVisible();
    await expect(membre.page.getByText(pathTitle)).toBeVisible();
    await expect(membre.page.getByText(/Référence : DT-/)).toBeVisible();
    await expect(
      membre.page.getByRole('button', {
        name: 'Imprimer ou enregistrer en PDF',
      }),
    ).toBeVisible();

    // The progress shows up in the member area.
    await membre.page.goto('/fr/espace-membre/parcours');
    await expect(
      membre.page.getByRole('listitem').filter({ hasText: pathTitle }),
    ).toContainText('2 / 2 étapes');
    await membre.done();
  });
});
