import { test, expect } from '@playwright/test';
import { choixLangue, ouvrirSelecteurDeLangue } from './_langue';

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
  //
  // La garde porte maintenant sur l'OUVERTURE du menu, qui est le clic exposé
  // (le sélecteur est devenu un menu : cf. `_langue.ts`). Le choix de la
  // langue suit sur une page dont l'ouverture vient de prouver l'hydratation.
  await ouvrirSelecteurDeLangue(page);
  await choixLangue(page, 'en').click();
  await expect(page).toHaveURL(/\/en$/, { timeout: 20_000 });
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Democracy needs a network',
  );
});

test('le sélecteur de langue pose le cookie NEXT_LOCALE', async ({
  page,
  context,
}) => {
  await page.goto('/fr');
  await ouvrirSelecteurDeLangue(page);
  await choixLangue(page, 'en').click();
  await expect(page).toHaveURL(/\/en$/, { timeout: 20_000 });
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

// LA FORME A CHANGÉ, L'EXIGENCE NON. La rangée segmentée « FR | EN » donnait
// deux choses gratuitement : la langue courante lisible SANS rien ouvrir, et
// le choix visible d'un coup d'œil. Un menu peut faire perdre la première —
// c'est son défaut classique. Ce test tient donc les deux séparément, plutôt
// que de constater la présence du menu.
test('sélecteur de langue : langue courante lisible fermé, cinq langues dans le menu (F-03)', async ({
  page,
}) => {
  await page.goto('/fr');

  // 1. Fermé : le déclencheur annonce la langue courante.
  const declencheur = page
    .getByRole('banner')
    .getByRole('button', { name: 'Langue' });
  await expect(declencheur).toContainText('FR');
  await expect(declencheur).toHaveAttribute('aria-expanded', 'false');

  // 2. Ouvert : les cinq langues, l'active cochée — puis, dans l'en-tête
  // desktop, les deux choix d'apparence (clair / sombre), qui n'ont pas de
  // `lang` (menu « Langue et affichage »).
  const menu = await ouvrirSelecteurDeLangue(page);
  await expect(menu.locator('[role="menuitemradio"][lang]')).toHaveCount(5);
  await expect(menu.getByRole('menuitemradio')).toHaveCount(7);
  await expect(
    menu.getByRole('menuitemradio', { name: 'Français' }),
  ).toHaveAttribute('aria-checked', 'true');
  await expect(
    menu.getByRole('menuitemradio', { name: 'English' }),
  ).toHaveAttribute('aria-checked', 'false');

  // 3. Les libellés sont des ENDONYMES, y compris sur une page française :
  // « العربية » et non « Arabe ». Quelqu'un qui cherche sa langue dans une
  // interface qu'il ne lit pas cherche le mot qu'il connaît. Un nom traduit
  // ici passerait inaperçu de toute relecture francophone.
  await expect(
    menu.getByRole('menuitemradio', { name: 'العربية' }),
  ).toBeVisible();
  await expect(
    menu.getByRole('menuitemradio', { name: 'Português' }),
  ).toBeVisible();
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
