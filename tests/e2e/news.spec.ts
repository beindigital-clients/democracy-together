import { test, expect } from '@playwright/test';
import { projectId } from '../../sanity/env';

test.use({ locale: 'fr-FR' });

// Sanity n'est pas toujours configuré. En CI aucun secret de projet n'est posé,
// et `sanity/env.ts` retombe sur l'identifiant « placeholder » : la requête part
// quand même et revient en 404 « Dataset not found ». La page encaisse — elle
// affiche sa liste vide au lieu de tomber — et c'est un comportement qui mérite
// d'être vérifié POUR LUI-MÊME : c'est ce que verront les visiteurs le jour où
// le CMS répondra mal, et rien ne le couvrait jusqu'ici.
//
// Les deux chemins sont donc testés, et c'est la configuration réelle qui
// décide lequel s'exécute. Aucun test n'est neutralisé, aucun n'est déclaré
// « ignoré » : sans projet Sanity on vérifie la dégradation, avec on vérifie le
// contenu. La règle est importée du module de l'application, et non recopiée —
// une divergence ferait silencieusement prendre la mauvaise branche.
const sanityConfigured = projectId !== 'placeholder';

function cards(page: import('@playwright/test').Page) {
  return page
    .getByRole('list', { name: 'Actualités du réseau' })
    .getByRole('listitem');
}

function noteSanity() {
  test.info().annotations.push({
    type: 'sanity',
    description: sanityConfigured
      ? `projet « ${projectId} » : contenu réel`
      : 'projet non configuré : chemin dégradé',
  });
}

test('actualités : liste depuis Sanity + article (F-15)', async ({ page }) => {
  noteSanity();
  const response = await page.goto('/fr/actualites');

  // Vaut dans les deux cas, et c'est le cœur du sujet quand le CMS est absent :
  // une source indisponible ne doit pas emporter la page.
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Actualités du réseau',
  );

  if (!sanityConfigured) {
    await expect(
      page.getByText('Aucune actualité pour le moment'),
    ).toBeVisible();
    await expect(cards(page)).toHaveCount(0);
    return;
  }

  await expect(
    page.getByRole('heading', { name: /collectif fondateur/i }),
  ).toBeVisible();
  expect(await cards(page).count()).toBeGreaterThanOrEqual(3);

  // ouvrir un article -> rendu PortableText
  await page.getByRole('link', { name: /collectif fondateur/i }).click();
  await expect(page).toHaveURL(/\/fr\/actualites\/collectif-fondateur$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'collectif fondateur',
  );
  await expect(page.getByText(/quatre axes de la mission/i)).toBeVisible();
});

test('actualités : accessible depuis la nav, version EN (F-03/F-15)', async ({
  page,
}) => {
  noteSanity();
  await page.goto('/fr');
  await page.getByRole('link', { name: 'Actualités', exact: true }).click();
  await expect(page).toHaveURL(/\/fr\/actualites$/);

  // La navigation et le rendu de la page EN ne dépendent pas du CMS : ce sont
  // eux que cette spec vérifie (F-03), le contenu n'en est que la preuve.
  const response = await page.goto('/en/actualites');
  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Network news',
  );

  if (!sanityConfigured) {
    await expect(page.getByText('No news yet.')).toBeVisible();
    return;
  }

  await expect(
    page.getByRole('heading', { name: /founding collective/i }),
  ).toBeVisible();
});
