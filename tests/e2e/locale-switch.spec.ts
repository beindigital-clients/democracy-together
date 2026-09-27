import { test, expect } from '@playwright/test';
import { choixLangue, ouvrirSelecteurDeLangue } from './_langue';

// Issue #35 — le sélecteur de langue basculait bien /fr/… en /en/…, mais
// abandonnait la query string : un visiteur qui avait filtré la bibliothèque
// repartait sur /en/bibliotheque, tous ses filtres perdus.
//
// Ce n'est pas un détail d'ergonomie : le projet met délibérément les facettes
// dans l'URL pour qu'elles soient partageables et indexables. Le sélecteur de
// langue était le seul endroit du site à rompre ce contrat.
//
// LE GESTE A CHANGÉ DE FORME, PAS D'ENJEU. Le sélecteur est devenu un menu
// (cf. `_langue.ts`) : il faut l'ouvrir avant de choisir. Ce que ces tests
// vérifient est inchangé — l'adresse d'arrivée, query string comprise.
//
// POURQUOI LA GARDE F-13 A CHANGÉ DE CLIC.
// La bascule de langue est le geste que l'audit F-13 a mesuré comme perdant
// son clic : émis juste après `page.goto()`, il n'aboutit JAMAIS sous bridage
// processeur ×4 (0/6), alors qu'il aboutit toujours une fois la page établie.
// Le clic exposé est désormais celui qui OUVRE le menu, et c'est
// `ouvrirSelecteurDeLangue` qui le protège.
//
// Le clic sur la langue, lui, reste nu — et il est mieux fondé qu'avant. Le
// menu ne s'ouvre que par `useState` : un menu VISIBLE prouve que React a
// repris la main, donc que la page est hydratée. C'est précisément la
// condition dont l'absence faisait perdre le clic. On ne peut d'ailleurs pas
// le protéger par `cliquerJusqua` : choisir une langue REFERME le menu, donc
// re-cliquer viserait un élément détaché — le geste n'est plus idempotent.
//
// Ce qui subsiste du risque est l'ATTENTE : `router.replace` déclenche une
// navigation serveur, et le délai par défaut d'une assertion (5 s) est court
// pour un runner chargé. Les assertions d'URL gardent donc le budget large que
// `cliquerJusqua` leur donnait — on attend autant qu'avant, sans re-cliquer.
const NAVIGATION = { timeout: 20_000 };

test('bibliothèque filtrée : la bascule de langue garde les filtres (#35)', async ({
  page,
}) => {
  const query = 'theme=participation&type=rapport&sort=cited&page=2';
  await page.goto(`/fr/bibliotheque?${query}`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

  await ouvrirSelecteurDeLangue(page);
  await choixLangue(page, 'en').click();
  await expect(page).toHaveURL(`/en/bibliotheque?${query}`, NAVIGATION);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  // ...et le retour ne les perd pas davantage.
  await ouvrirSelecteurDeLangue(page);
  await choixLangue(page, 'fr').click();
  await expect(page).toHaveURL(`/fr/bibliotheque?${query}`, NAVIGATION);
});

test('recherche : la bascule de langue garde la requête saisie (#35)', async ({
  page,
}) => {
  await page.goto('/fr/recherche?q=participation');

  await ouvrirSelecteurDeLangue(page);
  await choixLangue(page, 'en').click();
  await expect(page).toHaveURL('/en/recherche?q=participation', NAVIGATION);
});

test('page sans filtre : la bascule ne laisse pas de « ? » orphelin (#35)', async ({
  page,
}) => {
  await page.goto('/fr/le-reseau');

  await ouvrirSelecteurDeLangue(page);
  await choixLangue(page, 'en').click();
  await expect(page).toHaveURL('/en/le-reseau', NAVIGATION);
});
