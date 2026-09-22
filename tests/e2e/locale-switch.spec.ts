import { test, expect, type Page } from '@playwright/test';
import { cliquerJusqua } from './_panneau';

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
//
// POURQUOI `cliquerJusqua` ICI, ET NULLE PART AILLEURS DANS CE FICHIER.
// La bascule de langue est le geste que l'audit F-13 a mesuré comme perdant
// son clic : émis juste après `page.goto()`, il n'aboutit JAMAIS sous bridage
// processeur ×4 (0/6), alors qu'il aboutit toujours une fois la page établie.
// Trois des quatre occurrences relevées en CI avaient cette forme exacte, et
// la campagne du 21/09 en a absorbé deux à elle seule. Les trois PREMIERS
// clics de ce fichier suivent immédiatement un `goto` : ils sont exposés.
//
// Le SECOND clic de chaque test ne l'est pas : `router.replace` navigue côté
// client sans recharger le document, donc l'application est déjà hydratée. Il
// reste nu — délibérément. S'il venait à échouer, ce serait un autre
// mécanisme, et il doit rester visible.

function switchTo(locale: string) {
  return `header button[lang="${locale}"]`;
}

// `page.url()` est absolue, les cibles de ces tests sont relatives.
function urlEst(page: Page, attendue: string): () => Promise<boolean> {
  return async () => {
    const u = new URL(page.url());
    return u.pathname + u.search === attendue;
  };
}

test('bibliothèque filtrée : la bascule de langue garde les filtres (#35)', async ({
  page,
}) => {
  const query = 'theme=participation&type=rapport&sort=cited&page=2';
  await page.goto(`/fr/bibliotheque?${query}`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

  await cliquerJusqua(
    page.locator(switchTo('en')).first(),
    urlEst(page, `/en/bibliotheque?${query}`),
    'bascule de langue FR→EN (bibliothèque filtrée)',
  );
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');

  // ...et le retour ne les perd pas davantage.
  await page.locator(switchTo('fr')).first().click();
  await expect(page).toHaveURL(`/fr/bibliotheque?${query}`);
});

test('recherche : la bascule de langue garde la requête saisie (#35)', async ({
  page,
}) => {
  await page.goto('/fr/recherche?q=participation');
  await cliquerJusqua(
    page.locator(switchTo('en')).first(),
    urlEst(page, '/en/recherche?q=participation'),
    'bascule de langue FR→EN (recherche)',
  );
  await expect(page).toHaveURL('/en/recherche?q=participation');
});

test('page sans filtre : la bascule ne laisse pas de « ? » orphelin (#35)', async ({
  page,
}) => {
  await page.goto('/fr/le-reseau');
  await cliquerJusqua(
    page.locator(switchTo('en')).first(),
    urlEst(page, '/en/le-reseau'),
    'bascule de langue FR→EN (le-reseau)',
  );
  await expect(page).toHaveURL('/en/le-reseau');
});
