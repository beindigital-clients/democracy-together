import { test, expect, type Page } from '@playwright/test';

// Issue #36 — l'année du pied de page était la constante `2026`, donc fausse
// dès le 1er janvier 2027, sur toutes les pages du site.
//
// Ce que cette spec voit et que les tests unitaires ne voient pas :
//
//  1. l'année RÉELLEMENT servie au bout de la chaîne (composant serveur ->
//     HTML -> hydratation) ;
//  2. l'absence d'écart d'hydratation — le piège de l'issue. React ne fait pas
//     échouer la navigation pour un écart : il le SIGNALE (« Hydration failed
//     because the server rendered text didn't match the client »), puis rejoue
//     l'arbre côté client. Sans écoute de la console et des erreurs de page, la
//     régression serait invisible ici : la spec resterait verte en affichant la
//     bonne année pour la mauvaise raison.
//
// En build de production les messages de React sont minifiés (« Minified React
// error #418 ») — d'où les deux formes dans le motif. Motif vérifié contre le
// message réel en remettant la correction naïve : il l'attrape.
const ECART_HYDRATATION =
  /hydrat|did not match|Minified React error #(418|423|425)/i;

function releveLesAlertes(page: Page) {
  const messages: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') messages.push(m.text());
  });
  // L'écart d'hydratation remonte par `pageerror`, pas par `console` : écouter
  // la seule console ne verrait rien.
  page.on('pageerror', (e) => messages.push(e.message));
  return () => messages.filter((m) => ECART_HYDRATATION.test(m));
}

// Barrière d'hydratation : la bascule de thème du pied de page ne modifie
// `data-theme` qu'une fois React aux commandes. Avant sa réponse, un écart peut
// encore être signalé — relever les alertes plus tôt ne prouverait rien.
async function attendLHydratationDuPiedDePage(page: Page) {
  const html = page.locator('html');
  const avant = await html.getAttribute('data-theme');
  await page
    .locator('footer')
    .getByRole('button', { name: /thème|theme/i })
    .click();
  await expect(html).not.toHaveAttribute('data-theme', avant ?? 'light');
}

for (const locale of ['fr', 'en'] as const) {
  test(`pied de page : année en cours, sans écart d'hydratation (${locale})`, async ({
    page,
  }) => {
    const ecarts = releveLesAlertes(page);
    await page.goto(`/${locale}`);

    await expect(page.locator('footer')).toContainText(
      `© ${new Date().getFullYear()}`,
    );

    await attendLHydratationDuPiedDePage(page);
    expect(ecarts()).toEqual([]);
  });
}

// Le cas exact décrit par l'issue : serveur et navigateur ne sont pas dans la
// même année — fuseaux décalés, ou page servie pendant la nuit du 31 décembre.
// C'est là que la correction évidente (`new Date().getFullYear()` au rendu d'un
// composant client) casse l'hydratation. C'est aussi, par le même mécanisme, le
// cas d'une page STATIQUE dont le HTML aurait été construit l'année précédente
// (issue #13) : le navigateur rattrape l'année après montage.
test("pied de page : navigateur en avance d'un an sur le serveur", async ({
  page,
}) => {
  const anneeServeur = new Date().getFullYear();
  const ecarts = releveLesAlertes(page);

  // `setFixedTime` fige `Date` dans le navigateur SANS suspendre les minuteurs :
  // React continue de fonctionner normalement.
  await page.clock.setFixedTime(
    new Date(`${anneeServeur + 1}-01-01T00:00:30Z`),
  );
  await page.goto('/fr');

  // Le HTML servi porte l'année du SERVEUR — c'est ce que voit un visiteur sans
  // JavaScript, et c'est ce sur quoi React hydrate. Les `<!-- -->` sont les
  // séparateurs de nœuds texte posés par le rendu serveur de React.
  const servi = await (await page.request.get('/fr')).text();
  expect(servi.replace(/<!-- -->/g, '')).toContain(`© ${anneeServeur} `);

  // Après montage, le navigateur impose la sienne (l'assertion réessaie, donc
  // elle attend la rectification plutôt que de la supposer immédiate).
  const copyright = page.locator('footer p').filter({ hasText: '©' });
  await expect(copyright).toContainText(`© ${anneeServeur + 1}`);

  await attendLHydratationDuPiedDePage(page);
  expect(ecarts()).toEqual([]);
});
