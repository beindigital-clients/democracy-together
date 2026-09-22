import { test, expect } from '@playwright/test';
import { cliquerJusqua } from './_panneau';

// Navigateur en français : rend la détection Accept-Language déterministe
// (sinon `/` est redirigé vers /en avec le navigateur en-US par défaut).
test.use({ locale: 'fr-FR' });

test('redirige / vers /fr (middleware)', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/fr$/);
});

test('home FR puis bascule EN par URL (F-03)', async ({ page }) => {
  await page.goto('/fr');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'La démocratie a besoin',
  );

  // Même geste que le test suivant, donc même garde (audit F-13). Ce test-ci
  // avait été laissé sans, et il a rougi en CI sur le commit `2c08208` :
  // attendu `/en`, reçu `/fr`, treize sondages. Mesuré depuis, sur trois
  // campagnes consécutives, le symptôme se produit À CHAQUE FOIS sur cette
  // bascule — il n'était simplement absorbé que sur le test voisin.
  await cliquerJusqua(
    page.getByRole('banner').getByRole('button', { name: 'EN' }),
    async () => /\/en$/.test(page.url()),
    'bascule de langue FR -> EN (accueil)',
  );
  await expect(page).toHaveURL(/\/en$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Democracy needs a network',
  );
});

test('le sélecteur de langue pose le cookie NEXT_LOCALE', async ({
  page,
  context,
}) => {
  await page.goto('/fr');
  await cliquerJusqua(
    page.getByRole('banner').getByRole('button', { name: 'EN' }),
    async () => /\/en$/.test(page.url()),
    'bascule de langue FR -> EN',
  );
  await expect(page).toHaveURL(/\/en$/);
  // Le cookie est écrit par next-intl pendant la navigation : on l'attend
  // (expect.poll) au lieu d'une lecture unique -> pas de course.
  await expect
    .poll(
      async () =>
        (await context.cookies()).find((c) => c.name === 'NEXT_LOCALE')?.value,
    )
    .toBe('en');
});

test('le bouton thème bascule data-theme (F-04)', async ({ page }) => {
  await page.goto('/fr');
  const html = page.locator('html');
  const before = await html.getAttribute('data-theme');
  // Le toggle de thème vit dans le pied de page (retiré de la barre desktop) ;
  // il reste aussi dans le menu mobile.
  await page
    .locator('footer')
    .getByRole('button', { name: /thème|theme/i })
    .click();
  await expect(html).not.toHaveAttribute('data-theme', before ?? 'light');
});

test('sélecteur de langue : bascule segmentée FR | EN (F-03)', async ({
  page,
}) => {
  await page.goto('/fr');
  const group = page.getByRole('banner').getByRole('group', { name: 'Langue' });
  // les deux langues sont visibles côte à côte, l'active (FR) surlignée
  await expect(group.getByRole('button', { name: 'FR' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(group.getByRole('button', { name: 'EN' })).toBeVisible();
});

test('accueil : toutes les sections de la maquette présentes (F-10)', async ({
  page,
}) => {
  await page.goto('/fr');
  // hero : CTA + bande méta (statut / bureaux / fondé par)
  await expect(
    page.getByRole('link', { name: 'Lire les analyses' }),
  ).toBeVisible();
  await expect(page.getByText('Bureaux', { exact: true })).toBeVisible();
  for (const name of [
    'Dernières analyses',
    'Le Baromètre de la démocratie',
    'Cinq axes de travail',
    'Événements',
    'Rejoindre le réseau',
    'La lettre d’analyses',
  ]) {
    await expect(page.getByRole('heading', { name })).toBeVisible();
  }
  // section jeunes (univers safran)
  await expect(
    page.getByRole('heading', {
      name: /moins de 35 ans et des idées pour la démocratie/i,
    }),
  ).toBeVisible();
});
