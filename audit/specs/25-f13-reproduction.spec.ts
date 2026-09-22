import { test, expect, type Browser } from '@playwright/test';

const BASE = process.env.AUDIT_BASE_URL ?? 'http://localhost:3000';
const N = Number(process.env.F13_N ?? 12);

// F-13 — LA CAUSE, ET SA PREUVE.
//
// Le constat a résisté à cinq campagnes de CI parce qu'il ne s'observait qu'en
// CI : une défaillance sur 213 tests, jamais la même. Ce fichier l'a d'abord
// reproduit localement en trente secondes ; il documente désormais SA CAUSE.
//
// LA CAUSE. `JoinButton` rendait `null` le temps que Convex résolve l'état
// d'authentification, puis insérait 94 px dans une grappe ancrée à droite
// (`ml-auto`, site-header.tsx:41). Tout ce qui la précède — bascule de langue,
// bouton de recherche — sautait de 104 px VERS LA GAUCHE, après le premier
// rendu. Playwright calcule les coordonnées du clic, puis le dispatche : sous
// bridage, l'en-tête reflue entre les deux, et le clic part vers une position
// que le bouton vient de quitter.
//
// MESURÉ, PAS DÉDUIT : au moment du clic, la cible réelle était
// `div.hidden.items-center.gap-2` — le conteneur — et jamais le bouton. Le
// bouton, lui, portait bien ses props React : il était hydraté et fonctionnel.
// Ce n'était donc pas un défaut d'hydratation mais un clic qui rate sa cible.
//
//   bridage   avant      après
//   ×1        40/40      12/12
//   ×4         0/40      12/12
//
// CE QUE ÇA EXPLIQUE, et qui était resté ouvert :
//
//   • pourquoi le PIED DE PAGE répondait au même instant — il ne reflue pas ;
//   • pourquoi la bascule du MENU MOBILE répondait dès 0 ms — la grappe qui
//     bouge est `hidden` sous 1120 px ; mesuré, la bascule mobile ne se
//     déplace pas d'un pixel ;
//   • pourquoi un geste d'ÉTAT LOCAL et un geste de NAVIGATION mouraient
//     ENSEMBLE — ils sont voisins dans la grappe qui se déplace ;
//   • pourquoi un SECOND clic aboutissait — il repart de coordonnées fraîches,
//     ce qui est exactement ce que font les helpers de `tests/e2e/_panneau.ts` ;
//   • pourquoi la fenêtre était proportionnelle à la lenteur de la machine —
//     plus Convex tarde, plus le reflux est tardif ;
//   • pourquoi RIEN n'apparaissait en console — un clic sur un `div` ne
//     produit rien.
//
// CE QUE ÇA VEUT DIRE POUR UN VISITEUR, et c'est le vrai coût : sur un
// téléphone lent, l'en-tête se réorganise sous le doigt. Le premier appui sur
// « EN » tombe à côté, sans le moindre retour. Ce n'était jamais un défaut de
// test.
//
// LE CORRECTIF : `JoinButton` réserve sa place pendant le chargement
// (`invisible`, qui conserve la boîte), comme `AuthButton` le faisait déjà.
// Résiduel mesuré : 2 px — le gabarit d'`AuthButton` (64 px) contre le lien
// « Connexion » (66 px).
//
// GARDE DE NON-RÉGRESSION : `tests/e2e/header-stabilite.spec.ts`, jouée en CI.
// Vue ROUGIR sur le code d'avant (103,9 px) et verte après (2,4 px).
//
// CE QUI RESTE : un visiteur CONNECTÉ voit toujours l'en-tête bouger, le
// gabarit d'`AuthButton` étant bien plus étroit que « Espace membre ·
// Déconnexion ». Hors du périmètre de ce correctif, et non mesuré ici.
//
// PISTES ÉCARTÉES EN CHEMIN, par la mesure et non par raisonnement. Elles
// restent consignées : elles disent ce que le constat N'ÉTAIT PAS.
//
//   • « le panneau est lent » — à ×4 l'URL ne basculait JAMAIS, même après
//     20 secondes ;
//   • `useSearchParams()` — hypothèse testée, réfutée, correctif annulé ;
//   • le poids de la page ;
//   • le délai de dispatch — clic d'en-tête à 1037 ms (0/6), clic de pied de
//     page à 1060 ms (5/5) : le même instant, des résultats opposés ;
//   • « être rendu par le serveur » — le bouton de thème et l'envoi du
//     formulaire de contact le sont aussi, et aboutissent dès 0 ms ;
//   • le remplacement du nœud par React — une marque posée en propriété JS
//     survit au clic des deux côtés ;
//   • une erreur d'hydratation — zéro message en console, zéro `pageerror`.

// Le décalage horizontal de la bascule de langue entre la mise en page SERVIE
// (JavaScript désactivé) et la mise en page ÉTABLIE. C'était 104 px : la cause.
// Deux états DÉTERMINISTES, donc aucune course avec l'hydratation et aucune
// sensibilité à la charge — contrairement à un seuil sur des taux.
async function ecartDeMiseEnPage(browser: Browser): Promise<number> {
  async function abscisse(js: boolean): Promise<number> {
    const ctx = await browser.newContext({
      locale: 'fr-FR',
      viewport: { width: 1280, height: 800 },
      javaScriptEnabled: js,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/fr`);
    if (js) await page.waitForTimeout(4_000);
    const b = await page
      .locator('header button[lang="en"]')
      .first()
      .boundingBox();
    await ctx.close();
    return b?.x ?? NaN;
  }
  return Math.abs((await abscisse(true)) - (await abscisse(false)));
}

async function tauxDeReussite(
  browser: Browser,
  bridage: number,
): Promise<number> {
  const ctx = await browser.newContext({ locale: 'fr-FR' });
  let ok = 0;
  for (let i = 0; i < N; i++) {
    const page = await ctx.newPage();
    if (bridage > 1) {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: bridage });
    }
    // `goto()` par défaut : EXACTEMENT ce que font les specs du dépôt.
    await page.goto(`${BASE}/fr`);
    try {
      await page
        .getByRole('banner')
        .getByRole('button', { name: 'EN' })
        .click({ timeout: 8_000 });
      await page.waitForTimeout(1_200);
      if (/\/en$/.test(page.url())) ok++;
    } catch {
      /* clic impossible : compté comme un échec */
    }
    await page.close();
  }
  await ctx.close();
  return ok;
}

// UN SEUL PROJET : c'est une mesure de MACHINE, pas de viewport. La rejouer en
// mobile la doublerait sans rien apprendre — et coûterait deux minutes de plus.
// AUCUNE ASSERTION SUR LES TAUX, et c'est délibéré — même parti pris que la
// limite Next mesurée en 36-404.
//
// La première version assertait le cas au repos (« doit aboutir à chaque
// fois »). Elle a rougi dès la première campagne complète : la machine était
// chargée par le reste de la suite, donc le cas « au repos » ne l'était plus.
// J'allais ajouter au dépôt une porte SENSIBLE À LA CHARGE pour corriger un
// constat de portes sensibles à la charge. Mesuré, pas raisonné.
//
// On imprime donc les deux taux. Le jour où la cause est trouvée, le second
// chiffre remonte et se voit dans le rapport — sans qu'un test rouge ait eu à
// l'annoncer, ce que ce même audit reproche ailleurs.
// Le second volet du constat, et celui qui a corrigé mon erreur : ce n'est pas
// LE COMPOSANT. Au même instant, au même viewport, sur la même page, un geste
// d'ÉTAT LOCAL (ouvrir la palette de recherche) et un geste de NAVIGATION
// (basculer la langue) échouent tous les deux — puis réussissent tous les deux.
// Ils meurent et ressuscitent ensemble.
test('F-13 — état local et navigation se comportent pareil', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'mesure de machine, un projet');
  test.setTimeout(600_000);

  async function essai(
    attente: number,
    geste: (p: import('@playwright/test').Page) => Promise<void>,
    reussi: (p: import('@playwright/test').Page) => Promise<boolean>,
  ): Promise<boolean> {
    const ctx = await browser.newContext({
      locale: 'fr-FR',
      viewport: { width: 1280, height: 800 },
    });
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.goto(`${BASE}/fr`);
    await page.waitForTimeout(attente);
    try {
      await geste(page);
    } catch {
      await ctx.close();
      return false;
    }
    await page.waitForTimeout(2_500);
    const ok = await reussi(page);
    await ctx.close();
    return ok;
  }

  const etat = (a: number) =>
    essai(
      a,
      (p) =>
        p
          .getByRole('banner')
          .getByRole('button', { name: 'Recherche' })
          .click({ timeout: 8_000 }),
      (p) =>
        p.getByRole('dialog', { name: 'Rechercher sur le site' }).isVisible(),
    );
  const navigation = (a: number) =>
    essai(
      a,
      (p) =>
        p
          .getByRole('banner')
          .getByRole('button', { name: 'EN' })
          .click({ timeout: 8_000 }),
      async (p) => /\/en$/.test(p.url()),
    );

  const t0 = { etat: await etat(0), nav: await navigation(0) };
  const t500 = { etat: await etat(500), nav: await navigation(500) };
  console.log(
    `[F-13] à 0 ms   — état local ${t0.etat ? 'OK' : '--'} · navigation ${t0.nav ? 'OK' : '--'}`,
  );
  console.log(
    `[F-13] à 500 ms — état local ${t500.etat ? 'OK' : '--'} · navigation ${t500.nav ? 'OK' : '--'}`,
  );
  // Ce qui est asserté n'est pas l'échec (le constat est OUVERT, le faire
  // rougir en permanence apprendrait à ignorer le rouge) mais le fait que les
  // deux natures de geste se comportent PAREIL. C'est ce qui disqualifie
  // « c'est ce composant-là » comme explication.
  expect(t0.etat).toBe(t0.nav);
  expect(t500.etat).toBe(t500.nav);
});

test('F-13 — la bascule de langue, au repos et sous charge', async ({
  browser,
}, info) => {
  // UN SEUL PROJET : c'est une mesure de MACHINE, pas de viewport. La rejouer
  // en mobile la doublerait sans rien apprendre — et coûterait deux minutes de
  // plus. La forme au niveau du FICHIER ne reçoit pas `testInfo` dans le
  // Playwright épinglé ici (1.61) : `info` y était `undefined`, et le test
  // tombait au lieu d'être ignoré.
  test.skip(info.project.name !== 'desktop', 'mesure de machine, un projet');
  test.setTimeout(600_000);
  const repos = await tauxDeReussite(browser, 1);
  const bride = await tauxDeReussite(browser, 4);
  console.log(`[F-13] bridage ×1 — ${repos}/${N} bascules abouties`);
  console.log(
    `[F-13] bridage ×4 — ${bride}/${N} bascules abouties ` +
      `(0 = le constat se reproduit ; ${N} = il a été corrigé)`,
  );
  // L'ASSERTION NE PORTE PLUS SUR LES TAUX. La cause étant corrigée, l'écart a
  // disparu ; un seuil sur ces chiffres serait sensible à la charge — le piège
  // que ce fichier documente plus haut, et dans lequel sa première version est
  // tombée. On assertit donc l'invariant DÉTERMINISTE qui a été corrigé.
  const ecart = await ecartDeMiseEnPage(browser);
  console.log(
    `[F-13] décalage de l'en-tête, servi → établi : ${ecart.toFixed(1)} px ` +
      `(104 px = le défaut est revenu)`,
  );
  expect(ecart).toBeLessThanOrEqual(8);
});

// Le TROISIÈME volet, et celui qui déplace le constat : l'en-tête est inerte
// pendant que le pied de page répond DÉJÀ.
//
// Le consentement doit être posé pour l'origine réellement servie, sinon le
// bandeau cookies — `fixed inset-x-0 bottom-0` — intercepte le clic du pied de
// page et l'on mesure une occlusion en croyant mesurer une hydratation. C'est
// exactement l'erreur que cette mesure a d'abord commise.
const CONSENTI = {
  cookies: [],
  origins: [
    {
      origin: BASE,
      localStorage: [{ name: 'dt-cookie-consent', value: 'essential' }],
    },
  ],
};

test('F-13 — en-tête et pied de page, au même instant', async ({
  browser,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'mesure de machine, un projet');
  test.setTimeout(600_000);

  const M = 3;
  async function taux(
    selecteur: string,
    reussi: (p: import('@playwright/test').Page) => Promise<boolean>,
  ): Promise<number> {
    let ok = 0;
    for (let i = 0; i < M; i++) {
      const ctx = await browser.newContext({
        locale: 'fr-FR',
        viewport: { width: 1280, height: 800 },
        storageState: CONSENTI,
      });
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      // Aucune attente : le geste part dès le retour de `goto()`, comme dans
      // les specs du dépôt.
      await page.goto(`${BASE}/fr`);
      try {
        await page.locator(selecteur).first().click({ timeout: 8_000 });
        await page.waitForTimeout(2_500);
        if (await reussi(page)) ok++;
      } catch {
        /* clic impossible : compté comme un échec */
      }
      await ctx.close();
    }
    return ok;
  }

  const entete = await taux(
    'header button[lang="en"]',
    async (p) => new URL(p.url()).pathname === '/en',
  );
  const pied = await taux(
    'footer button[aria-label="Changer de thème"]',
    async (p) =>
      (await p.locator('html').getAttribute('data-theme')) === 'dark',
  );
  console.log(`[F-13] en-tête (bascule de langue) — ${entete}/${M} abouties`);
  console.log(`[F-13] pied de page (bouton thème) — ${pied}/${M} abouties`);

  // On n'assertit PAS que l'en-tête échoue : le jour où la cause est trouvée,
  // ce test doit virer au vert tout seul, pas rougir. On assertit l'ordre, qui
  // ne dépend pas de la charge de la machine : le pied de page ne fait jamais
  // MOINS BIEN que l'en-tête. Si cela s'inversait un jour, c'est un fait neuf
  // et il mérite de faire rougir.
  expect(pied).toBeGreaterThanOrEqual(entete);
});
