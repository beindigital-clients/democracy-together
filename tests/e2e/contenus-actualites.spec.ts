import { test, expect } from '@playwright/test';
import { deleteE2eContent, importCodedContent } from './_helpers';
import { SESSIONS } from './_sessions';
import { CODED_NEWS } from '../../convex/lib/contenus/coded/news';

// "CONTENUS" WORKSTREAM — F-15, F-62: the news, written in the back office
// since Sanity was removed.
//
//   1. the imported articles are listed, ready to be edited;
//   2. an EDITOR writes an article: as a draft, it is not public;
//   3. published, it appears on the public news page, and its English
//      translation is served under the SAME address.
//
// The steps chain on the same data: the file is SERIAL. Its slug carries the
// `e2e-` prefix that the final cleanup removes.

test.use({ locale: 'fr-FR' });
test.describe.configure({ mode: 'serial' });

const stamp = Date.now();
const SLUG = `e2e-actualite-${stamp}`;
const TITLE = `Actualité E2E ${stamp}`;

test.beforeAll(async () => {
  // The table must carry the coded articles BEFORE a first created article
  // switches the public pages from the coded fallback to the table.
  await importCodedContent();
});

test.afterAll(async () => {
  await deleteE2eContent(stamp);
});

test.describe('éditeur', () => {
  test.use({ storageState: SESSIONS.contenusActualites.state });
  test.afterEach(async ({ context }) => {
    await context.storageState({ path: SESSIONS.contenusActualites.state });
  });

  test('écrit une actualité, la publie : elle paraît sur le site, dans ses langues', async ({
    page,
  }) => {
    await page.goto('/fr/admin/contenus/actualites');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Actualités' }),
    ).toBeVisible();
    await expect(page.getByText(CODED_NEWS[0].text.fr.title)).toBeVisible();

    await page.getByRole('button', { name: 'Nouvelle actualité' }).click();
    const editor = page.getByRole('region', { name: 'Nouvelle actualité' });
    await editor.getByLabel('Adresse (slug)').fill(SLUG);
    await editor.getByLabel('Date de publication').fill('2026-09-30');
    await editor.getByLabel('Titre', { exact: true }).fill(TITLE);
    await editor
      .getByLabel('Chapô (facultatif)')
      .fill('Une actualité écrite par la suite E2E.');
    await editor
      .getByLabel('Texte de l’article')
      .fill('Premier paragraphe.\n\nSecond paragraphe.');
    // The English title: the article is served in English under its address.
    await editor.getByRole('button', { name: /Anglais/ }).click();
    await editor.getByLabel('Titre', { exact: true }).fill(`E2E news ${stamp}`);
    await editor.getByRole('button', { name: /Français/ }).click();
    await editor.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByText(`« ${TITLE} » enregistré.`)).toBeVisible();

    const row = page.getByRole('listitem').filter({ hasText: TITLE });
    await expect(row).toContainText('Brouillon');

    // A draft is NOT public.
    const draft = await page.request.get(`/fr/actualites/${SLUG}`);
    expect(draft.status()).toBe(404);

    await row.getByRole('button', { name: 'Publier' }).click();
    await expect(page.getByText(`« ${TITLE} » publié.`)).toBeVisible();

    await page.goto('/fr/actualites');
    await page.getByRole('link', { name: new RegExp(TITLE) }).click();
    await expect(page).toHaveURL(new RegExp(`/fr/actualites/${SLUG}$`));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(TITLE);
    await expect(page.getByText('Second paragraphe.')).toBeVisible();

    await page.goto(`/en/actualites/${SLUG}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      `E2E news ${stamp}`,
    );
  });
});
