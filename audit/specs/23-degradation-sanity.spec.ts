import { test, expect } from '@playwright/test';

const BASE = process.env.AUDIT_BASE_URL ?? 'http://localhost:3000';
const CIBLE = '/fr/actualites/un-article-quelconque';

// F-10 — la seule page adossée à Sanity, quand Sanity ne répond pas.
//
// PRÉCONDITION : la suite d'audit tourne contre un build sans
// `NEXT_PUBLIC_SANITY_PROJECT_ID` (voir § 6 du rapport). `sanity/env.ts`
// retombe alors sur le projet `placeholder`, dont l'API n'existe pas : toute
// requête échoue, et c'est exactement le cas que ces tests mesurent.
//
// PAS de `test.skip` conditionnel ici, et c'est délibéré. La première version
// détectait le chemin dégradé en cherchant `noindex` dans le HTML servi.
// Mesuré : la page d'erreur par défaut de Next émet ELLE AUSSI `noindex`.
// La condition ne distinguait donc pas « corrigé et dégradé » de « cassé » —
// elle ne détectait rien du tout. Un détecteur qui lit la sortie du correctif
// qu'il est censé conditionner ne peut pas faire autrement.
//
// Toute la suite d'audit suppose déjà cet environnement (`_routes.ts` exclut
// les routes Convex pour la même raison) ; contre un Sanity joignable, ces
// tests rougissent bruyamment, et l'en-tête ci-dessus dit pourquoi.
//
// Mesuré avant correctif : 500 avec ZÉRO caractère dans le HTML servi. La
// frontière `error.tsx` est un composant CLIENT ; son contenu n'arrive que
// par la charge utile RSC. Page blanche, donc, pour qui n'exécute pas
// JavaScript — alors que la même panne sur /fr/bibliotheque/… rendait déjà
// 671 caractères lisibles depuis F-02. Deux backends, deux comportements.

test('Sanity muet : la page reste lisible SANS JavaScript', async ({
  browser,
}) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  const res = await page.goto(`${BASE}${CIBLE}`);
  const texte = (await page.locator('body').innerText()).trim();
  await ctx.close();

  console.log(`[sanity-ko] statut=${res?.status()} ${texte.length} caractères`);
  // 200 et non 500 : le visiteur garde l'en-tête, la navigation et un retour
  // vers la liste. Un 500 serait défendable, mais il ne rend RIEN sans JS.
  expect(res?.status()).toBe(200);
  expect(texte.length).toBeGreaterThan(200);
});

test('Sanity muet : le rendu dégradé n’est pas indexable', async ({
  request,
}) => {
  const html = await (await request.get(CIBLE)).text();
  const robots = /<meta name="robots" content="([^"]*)"/.exec(html)?.[1];
  console.log(`[sanity-ko] robots: ${robots}`);
  // Sans ce noindex, un moteur qui passe pendant la panne remplacerait
  // l'article par le panneau « indisponible » dans son index.
  expect(robots).toContain('noindex');
  expect(robots).toContain('follow');
});

test('la LISTE dégradait déjà, et continue', async ({ request }) => {
  const res = await request.get('/fr/actualites');
  expect(res.status()).toBe(200);
});
