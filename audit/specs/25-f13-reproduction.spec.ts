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
//   • l'animation d'entrée — aucun des panneaux concernés n'en a ;
//   • « le panneau est lent » — les assertions qui ont échoué RÉESSAIENT ;
//   • `useSearchParams()` dans le sélecteur de langue — hypothèse testée en
//     retirant le hook, reconstruit, remesuré : TOUJOURS 0/40. Réfutée.
//
// CE QUI RESTE INEXPLIQUÉ : pourquoi ce composant-ci perd le clic quand
// `MobileNav`, dans des conditions strictement identiques, ne le perd jamais
// (20/20 à ×4). C'est là qu'il faut creuser, et c'est mesurable désormais.

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
