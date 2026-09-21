import { test, expect, type Browser } from '@playwright/test';

const BASE = process.env.AUDIT_BASE_URL ?? 'http://localhost:3000';
const N = Number(process.env.F13_N ?? 12);

// F-13 — LA REPRODUCTION, enfin.
//
// Le constat a résisté à quatre campagnes de CI parce qu'il ne s'observait
// QU'EN CI : une défaillance sur 213 tests, jamais la même, et une campagne
// complète pour la voir. Ce fichier la produit localement, en trente secondes.
//
// LE LEVIER EST LE PROCESSEUR, pas le hasard. Dans les conditions exactes des
// tests E2E (`page.goto()` par défaut, donc rendu la main à l'événement
// `load`), la bascule de langue se comporte ainsi :
//
//   bridage   bascules abouties
//   ×1        40/40
//   ×4         0/40
//   ×10        0/40
//
// Un runner GitHub est plus lent que cette machine sans l'être autant qu'un
// bridage ×4 : d'où le taux observé d'environ un test sur 213, et d'où
// l'impossibilité de reproduire à la main.
//
// CE QUE ÇA VEUT DIRE POUR UN VISITEUR : sur un téléphone lent, le premier
// appui sur « EN » ne fait rien, sans le moindre retour. Ce n'est pas un défaut
// de test — c'est le premier public visé par le cadrage.
//
// CE QUI EST ÉCARTÉ, par la mesure et non par raisonnement :
//
//   • l'animation d'entrée — aucun des panneaux concernés n'en a ;
//   • « le panneau est lent » — les assertions qui ont échoué RÉESSAIENT, et
//     mesuré : à ×4 l'URL ne bascule JAMAIS, même après 20 secondes, quand
//     elle bascule en ~0,7 s au repos. C'est une perte, pas une lenteur ;
//   • `useSearchParams()` dans le sélecteur de langue — hypothèse testée en
//     retirant le hook, reconstruit, remesuré : TOUJOURS 0/40. Réfutée ;
//   • LE COMPOSANT LUI-MÊME. J'ai d'abord cru que `LocaleSwitcher` perdait le
//     clic là où `MobileNav` ne le perdait pas. C'était MA comparaison qui
//     était fautive : elle opposait un contrôle desktop à un contrôle mobile.
//     À viewport égal, tout l'en-tête meurt et ressuscite ENSEMBLE — voir le
//     second test de ce fichier ;
//   • le poids de la page — une page légère (`/fr/mentions-legales`) se
//     comporte exactement comme l'accueil : 0/3 à 0 ms, 3/3 à 500 ms.
//
// CE QUI RESTE À EXPLIQUER : pourquoi la bascule du menu mobile, elle, répond
// dès 0 ms. Le DOM de l'en-tête est pourtant IDENTIQUE aux deux viewports —
// 14 éléments interactifs de part et d'autre, seule la visibilité change. Il
// n'y a donc pas « moins à hydrater » en mobile. Et aucun contrôle n'est
// cliquable aux DEUX viewports (la recherche est masquée en mobile, la bascule
// du menu l'est en desktop), donc aucune comparaison strictement appariée
// n'est possible sur ce point. Je ne conclus pas.

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
test('F-13 — état local et navigation meurent ensemble', async ({
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
  // L'écart EST le constat. On ne l'assertit pas — mais on vérifie que
  // l'instrument a bien mesuré quelque chose, sans quoi ces chiffres ne
  // vaudraient rien.
  expect(repos).toBeGreaterThan(bride);
});
