import { test, expect } from '@playwright/test';

// Issue #35 — le sélecteur de langue basculait bien /fr/… en /en/…, mais
// abandonnait la query string : un visiteur qui avait filtré la bibliothèque
// repartait sur /en/bibliotheque, tous ses filtres perdus.
//
// Ce n'est pas un détail d'ergonomie : le projet met délibérément les facettes
// dans l'URL pour qu'elles soient partageables et indexables. Le sélecteur de
// langue était le seul endroit du site à rompre ce contrat.
//
// Le bouton est ciblé par son attribut `lang` plutôt que par son libellé : le
// libellé est le code de langue lui-même, affiché en capitales par CSS. Le
// header contient aussi le menu mobile (replié, donc non cliquable sur un
// viewport desktop) : `.first()` désigne la barre visible.

function switchTo(locale: string) {
  return `header button[lang="${locale}"]`;
}

test('bibliothèque filtrée : la bascule de langue garde les filtres (#35)', async ({
  page,
}) => {
  const query = 'theme=participation&type=rapport&sort=cited&page=2';
  await page.goto(`/fr/bibliotheque?${query}`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

  await page.locator(switchTo('en')).first().click();

  await expect(page).toHaveURL(`/en/bibliotheque?${query}`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  // ...et le retour ne les perd pas davantage.
  await page.locator(switchTo('fr')).first().click();
  await expect(page).toHaveURL(`/fr/bibliotheque?${query}`);
});

test('recherche : la bascule de langue garde la requête saisie (#35)', async ({
  page,
}) => {
  await page.goto('/fr/recherche?q=participation');
  await page.locator(switchTo('en')).first().click();
  await expect(page).toHaveURL('/en/recherche?q=participation');
});

test('page sans filtre : la bascule ne laisse pas de « ? » orphelin (#35)', async ({
  page,
}) => {
  await page.goto('/fr/le-reseau');
  await page.locator(switchTo('en')).first().click();
  await expect(page).toHaveURL('/en/le-reseau');
});
