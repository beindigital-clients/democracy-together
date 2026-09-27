import { test, expect, type Browser } from '@playwright/test';
import { resetProgrammes } from './_helpers';
import { SESSIONS, type SessionKey } from './_sessions';

// F-60 — Appels à projets, de bout en bout : un modérateur publie un appel
// daté et désigne un évaluateur ; un membre candidate avec une pièce jointe ;
// l'évaluateur note ; le modérateur sélectionne ; le porteur est notifié.
//
// Trois personnes, trois sessions DÉDIÉES à ce fichier (cf. _sessions.ts) :
// chacune est tenue de bout en bout, et son état est réécrit à la fin de son
// passage — le jeton de rafraîchissement tourne à chaque ouverture.
test.use({ locale: 'fr-FR' });

// Marqueur STABLE : `resetProgrammes` supprime les appels des exécutions
// précédentes (leur titre le porte), et l'écran ne se remplit pas d'essais.
const MARKER = '[E2E-prog-appels]';

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

// `datetime-local` attend l'heure MURALE du fuseau choisi ; l'appel est saisi
// en UTC, donc l'ISO tronqué convient.
const wall = (ms: number) => new Date(ms).toISOString().slice(0, 16);

test.describe
  .serial('appel à projets : publication → candidature → évaluation → décision', () => {
  test.beforeAll(async () => {
    await resetProgrammes(
      [SESSIONS.progAppelsMembre.email, SESSIONS.progAppelsEvaluateur.email],
      MARKER,
    );
  });

  test('parcours complet', async ({ browser }) => {
    test.setTimeout(180_000);
    const stamp = Date.now();
    const callTitle = `${MARKER} Fonds participation ${stamp}`;
    const projectTitle = `Observatoire citoyen ${stamp}`;

    // 1. Le modérateur rédige, publie, désigne l'évaluateur.
    const admin = await as(browser, 'progAppelsAdmin');
    await admin.page.goto('/fr/admin/projets/appels');
    await admin.page.getByRole('button', { name: 'Nouvel appel' }).click();
    await admin.page.getByLabel('Titre de l’appel').fill(callTitle);
    await admin.page
      .getByLabel('Présentation de l’appel')
      .fill('Soutenir des projets de recherche-action sur la participation.');
    await admin.page.getByLabel('Fuseau de référence').selectOption('UTC');
    await admin.page.getByLabel('Montant du fonds').fill('10000');
    await admin.page.getByLabel('Devise').fill('EUR');
    await admin.page.getByLabel('Ouverture').fill(wall(Date.now() - 3_600_000));
    await admin.page
      .getByLabel('Clôture')
      .fill(wall(Date.now() + 7 * 24 * 3_600_000));
    await admin.page.getByLabel('Critère 1').fill('Pertinence');
    await admin.page.getByLabel('Pièce 1').fill('Budget');
    await admin.page
      .getByRole('button', { name: 'Enregistrer l’appel' })
      .click();

    const row = admin.page.getByRole('listitem').filter({ hasText: callTitle });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Publier', exact: true }).click();
    await expect(row.getByText('Publié', { exact: true })).toBeVisible();
    await row.getByRole('button', { name: 'Évaluateurs' }).click();
    await row
      .getByLabel('Adresse de l’évaluateur')
      .fill(SESSIONS.progAppelsEvaluateur.email);
    await row.getByRole('button', { name: 'Désigner' }).click();
    await expect(
      row.getByText(SESSIONS.progAppelsEvaluateur.email).first(),
    ).toBeVisible();
    await admin.done();

    // 2. Le membre trouve l'appel ouvert et dépose un dossier complet.
    const membre = await as(browser, 'progAppelsMembre');
    await membre.page.goto('/fr/appels-a-projets');
    await membre.page.getByRole('link', { name: callTitle }).click();
    await expect(
      membre.page.getByRole('heading', { level: 1, name: callTitle }),
    ).toBeVisible();
    await membre.page.getByRole('link', { name: 'Candidater' }).click();
    await membre.page.getByLabel('Titre du projet').fill(projectTitle);
    await membre.page
      .getByLabel('Résumé')
      .fill('Un observatoire citoyen du budget local, ouvert et documenté.');
    await membre.page
      .getByRole('button', { name: 'Enregistrer le brouillon' })
      .click();
    await expect(membre.page.getByText('Brouillon enregistré.')).toBeVisible();
    await membre.page.getByLabel('Choisir un fichier').setInputFiles({
      name: 'budget.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\n% budget E2E\n%%EOF\n'),
    });
    await expect(membre.page.getByText(/budget\.pdf/)).toBeVisible();
    await membre.page
      .getByRole('button', { name: 'Déposer mon dossier' })
      .click();
    await expect(
      membre.page.getByText('Déposé', { exact: true }),
    ).toBeVisible();
    await membre.done();

    // 3. L'évaluateur désigné note le dossier depuis son espace membre.
    const evaluateur = await as(browser, 'progAppelsEvaluateur');
    await evaluateur.page.goto('/fr/espace-membre/evaluations');
    const dossier = evaluateur.page
      .getByRole('listitem')
      .filter({ hasText: projectTitle });
    await expect(dossier).toBeVisible();
    await dossier
      .getByLabel('Pertinence (poids 1)')
      .selectOption({ label: '4 / 5' });
    await dossier.getByRole('button', { name: 'Enregistrer ma note' }).click();
    await expect(dossier.getByText('Note enregistrée.')).toBeVisible();
    await evaluateur.done();

    // 4. Le modérateur lit le classement et sélectionne.
    const admin2 = await as(browser, 'progAppelsAdmin');
    await admin2.page.goto('/fr/admin/projets/appels');
    const row2 = admin2.page
      .getByRole('listitem')
      .filter({ hasText: callTitle })
      .first();
    await row2.getByRole('button', { name: 'Classement et décisions' }).click();
    const ranked = row2.getByRole('listitem').filter({ hasText: projectTitle });
    await expect(ranked.getByText(/moyenne 80 \/ 100/)).toBeVisible();
    await ranked.getByRole('button', { name: 'Sélectionner' }).click();
    await admin2.page
      .getByRole('dialog')
      .getByRole('button', { name: 'Sélectionner' })
      .click();
    await expect(
      ranked.getByText('Sélectionné', { exact: true }),
    ).toBeVisible();
    await admin2.done();

    // 5. Le porteur est notifié et voit la décision dans son espace.
    const membre2 = await as(browser, 'progAppelsMembre');
    await membre2.page.goto('/fr/notifications');
    await expect(
      membre2.page.getByText(
        `Appel « ${callTitle} » : votre projet est sélectionné.`,
      ),
    ).toBeVisible();
    await membre2.page.goto('/fr/espace-membre/projets');
    await expect(
      membre2.page
        .getByRole('listitem')
        .filter({ hasText: projectTitle })
        .getByText('Sélectionné', { exact: true }),
    ).toBeVisible();
    await membre2.done();
  });
});
