import { test, expect, type BrowserContext } from '@playwright/test';
import { SESSIONS } from './_sessions';

// F-13 — L'EN-TÊTE NE DOIT PAS SE DÉCALER QUAND L'AUTHENTIFICATION SE RÉSOUT.
//
// Cause racine du constat : `JoinButton` rendait `null` le temps que Convex
// réponde, puis insérait 94 px dans une grappe ancrée à droite
// (`ml-auto`, site-header.tsx:41). Tout ce qui la précède — bascule de langue,
// bouton de recherche — sautait de 104 px VERS LA GAUCHE, après le premier
// rendu. Un appui visant « EN » partait vers une position que le bouton venait
// de quitter : il tombait sur le conteneur, sans le moindre retour. Mesuré, la
// cible réelle du clic était un `div`, jamais le bouton.
//
// POURQUOI CETTE FORME DE TEST. Comparer « avant » et « après » sur une même
// page ferait la course avec l'hydratation : sur une machine rapide l'état est
// déjà résolu quand `goto` rend la main, et le test passerait à vide sans rien
// vérifier. On compare donc deux états DÉTERMINISTES — la mise en page servie
// par le serveur (JavaScript désactivé) et la mise en page établie — ce qui est
// exactement l'invariant qui compte, et ne dépend ni de la vitesse de la
// machine ni de la charge.
async function abscisseBascule(ctx: BrowserContext, url: string) {
  const page = await ctx.newPage();
  await page.goto(url);
  const boite = await page
    .locator('header button[lang="en"]')
    .first()
    .boundingBox();
  return { page, x: boite?.x ?? null };
}

test("l'en-tête ne se décale pas entre le rendu serveur et l'état établi (F-13)", async ({
  browser,
  baseURL,
}) => {
  const url = `${baseURL}/fr`;

  const sansJs = await browser.newContext({
    javaScriptEnabled: false,
    storageState: './tests/e2e/cookie-consent-state.json',
  });
  const servi = await abscisseBascule(sansJs, url);

  const avecJs = await browser.newContext({
    storageState: './tests/e2e/cookie-consent-state.json',
  });
  const etabli = await abscisseBascule(avecJs, url);
  // « Connexion » n'apparaît qu'une fois l'état d'authentification résolu :
  // c'est précisément l'instant où l'en-tête prenait ses 104 px.
  await expect(
    etabli.page
      .getByRole('banner')
      .getByRole('link', { name: /connexion|sign in/i }),
  ).toBeVisible();
  const xEtabli = (
    await etabli.page.locator('header button[lang="en"]').first().boundingBox()
  )?.x;

  expect(servi.x, 'la bascule doit exister dans le HTML servi').not.toBeNull();
  expect(
    xEtabli,
    "la bascule doit exister une fois l'état établi",
  ).not.toBeUndefined();

  const ecart = Math.abs((xEtabli as number) - (servi.x as number));
  // Le résiduel mesuré est de 2 px — le gabarit de `AuthButton` (64 px) contre
  // le lien « Connexion » (66 px). Le défaut, lui, valait 104 px : la marge
  // distingue les deux sans ambiguïté.
  expect(
    ecart,
    `la bascule de langue s'est déplacée de ${ecart} px entre le rendu servi et l'état établi`,
  ).toBeLessThanOrEqual(8);

  await sansJs.close();
  await avecJs.close();
});

// LE CAS CONNECTÉ, la seconde moitié du décalage. Chez un visiteur connecté,
// `NotificationBell` apparaissait après coup (36 px) et `AuthButton` passait
// d'un gabarit de 64 px à « Espace membre · Déconnexion », bien plus large :
// l'en-tête se réorganisait comme pour un visiteur anonyme, mais davantage.
// Depuis que `site-header.tsx` lit l'état d'authentification au rendu SERVEUR,
// le HTML servi porte déjà la variante finale.
//
// Ce cas n'est mesurable qu'ICI : l'environnement d'audit n'a aucun
// déploiement Convex, donc aucune session. La CI, elle, en a une par fichier.
//
// LA NON-VACANCE EST ASSERTÉE. Si la session était perdue, ce test comparerait
// deux fois la mise en page ANONYME et passerait sans rien vérifier — le défaut
// exact que cet audit reproche ailleurs. On exige donc que le HTML servi porte
// le marqueur de l'état connecté AVANT de comparer quoi que ce soit.
test("l'en-tête ne se décale pas non plus pour un visiteur connecté (F-13)", async ({
  browser,
  baseURL,
}) => {
  const url = `${baseURL}/fr`;
  const etat = SESSIONS.enTete.state;

  const sansJs = await browser.newContext({
    javaScriptEnabled: false,
    storageState: etat,
  });
  const servi = await abscisseBascule(sansJs, url);
  // Sans JavaScript, seul le rendu SERVEUR s'exprime : « Déconnexion » n'y
  // figure que si le serveur a bien reconnu la session.
  await expect(
    servi.page
      .getByRole('banner')
      .getByRole('button', { name: /déconnexion|sign out/i }),
    'la session doit être reconnue au rendu serveur, sinon ce test est vacant',
  ).toBeVisible();

  const avecJs = await browser.newContext({ storageState: etat });
  const etabli = await abscisseBascule(avecJs, url);
  await expect(
    etabli.page
      .getByRole('banner')
      .getByRole('link', { name: /espace membre|member space/i }),
  ).toBeVisible();
  const xEtabli = (
    await etabli.page.locator('header button[lang="en"]').first().boundingBox()
  )?.x;

  const ecart = Math.abs((xEtabli as number) - (servi.x as number));
  expect(
    ecart,
    `la bascule de langue s'est déplacée de ${ecart} px entre le rendu servi et l'état établi (visiteur connecté)`,
  ).toBeLessThanOrEqual(8);

  await sansJs.close();
  await avecJs.close();
});
