import { test, expect } from '@playwright/test';

test.use({ locale: 'fr-FR' });

// Sanity est la SECONDE dépendance externe des E2E, et la seule que rien ne
// provisionne : `.github/workflows/e2e.yml` crée un déploiement Convex par
// pull request, mais aucun projet Sanity. `sanity/env.ts` replie alors sur
// l'identifiant `placeholder`, et le build part avec — d'où, au premier
// passage réel de la suite, 27 × `Dataset "production" not found for project
// ID "placeholder"`.
//
// Ces deux tests ne pouvaient donc pas passer en CI : pas par défaut de
// l'application, qui se dégrade proprement (liste vide, le reste du site
// fonctionne), mais faute d'environnement. C'est la règle que le workflow
// s'applique déjà à lui-même : « faire rougir toutes les PR pour une raison
// d'environnement apprend aux relecteurs à ignorer le rouge ».
//
// Ce qui suit sépare donc les deux plans. Ce qui ne dépend PAS de Sanity — la
// page répond, s'annonce dans les deux langues, la navigation y mène — reste
// vérifié partout. Seules les assertions sur du CONTENU Sanity sont
// conditionnées, et leur absence est annoncée, jamais silencieuse.
const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const sanityConfigured = !!projectId && projectId !== 'placeholder';
const SANS_SANITY =
  'Sanity non configuré (NEXT_PUBLIC_SANITY_PROJECT_ID absent ou « placeholder ») : ' +
  'le contenu éditorial ne peut pas être vérifié. Renseigner la variable pour couvrir F-15 de bout en bout.';

function cards(page: import('@playwright/test').Page) {
  return page
    .getByRole('list', { name: 'Actualités du réseau' })
    .getByRole('listitem');
}

test('actualités : la page répond et s’annonce (F-15)', async ({ page }) => {
  await page.goto('/fr/actualites');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Actualités du réseau',
  );
});

test('actualités : liste depuis Sanity + article (F-15)', async ({ page }) => {
  test.skip(!sanityConfigured, SANS_SANITY);

  await page.goto('/fr/actualites');

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
  // Sans Sanity : la navigation et la localisation du titre restent vérifiées.
  // Ce sont elles qui attrapent un lien cassé ou une chaîne restée en français.
  await page.goto('/fr');
  await page.getByRole('link', { name: 'Actualités', exact: true }).click();
  await expect(page).toHaveURL(/\/fr\/actualites$/);

  await page.goto('/en/actualites');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Network news',
  );

  test.skip(!sanityConfigured, SANS_SANITY);
  await expect(
    page.getByRole('heading', { name: /founding collective/i }),
  ).toBeVisible();
});
