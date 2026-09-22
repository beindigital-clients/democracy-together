import { test, expect, type Page } from '@playwright/test';

// Ce que les correctifs F-07 et « zone défilante » doivent PRODUIRE — pas ce
// qu'ils posent dans le balisage.
//
// La distinction n'est pas rhétorique. La règle axe
// `scrollable-region-focusable` se satisfait d'un `tabindex` : elle ne vérifie
// jamais qu'on atteint réellement les colonnes hors écran. Un `tabindex` sur
// un conteneur qui ne défile pas la contenterait tout autant. Ces tests-ci
// appuient sur la touche et regardent le contenu bouger.
//
// La suite 20-a11y garde par ailleurs l'absence de violation ; les deux se
// complètent et ne se remplacent pas.

const MOBILE = { width: 390, height: 844 };

/** Les tableaux ne débordent qu'en petit écran : c'est là qu'est le défaut. */
async function enPetitEcran(page: Page, route: string) {
  await page.setViewportSize(MOBILE);
  await page.goto(route);
}

for (const route of ['/fr/barometre', '/fr/adhesion']) {
  test(`${route} : les colonnes hors écran sont atteignables au clavier`, async ({
    page,
  }) => {
    await enPetitEcran(page, route);
    const zones = page.locator('[role="region"][tabindex="0"]');
    const nombre = await zones.count();
    expect(nombre, 'au moins une zone défilante déclarée').toBeGreaterThan(0);

    let debordantes = 0;
    for (let i = 0; i < nombre; i++) {
      const zone = zones.nth(i);
      // Un arrêt de tabulation sans nom vaut à peine mieux qu'une zone close.
      await expect(zone).toHaveAttribute('aria-label', /\S/);

      const deborde = await zone.evaluate(
        (el) => el.scrollWidth - el.clientWidth,
      );
      if (deborde <= 0) continue; // ce tableau-là tient : rien à atteindre
      debordantes++;

      await zone.focus();
      expect(
        await zone.evaluate((el) => el === document.activeElement),
        'la zone reçoit bien le focus',
      ).toBe(true);

      const avant = await zone.evaluate((el) => el.scrollLeft);
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await expect
        .poll(() => zone.evaluate((el) => el.scrollLeft))
        .toBeGreaterThan(avant);
      console.log(
        `[zone] ${route} #${i} débordement=${deborde}px — défilement au clavier OK`,
      );
    }
    expect(
      debordantes,
      'au moins un tableau déborde réellement ici',
    ).toBeGreaterThan(0);
  });
}

// F-07 — un lien noyé dans une phrase doit se distinguer AUTREMENT que par la
// couleur (WCAG 1.4.1). Le survol ne compte pas : il n'existe ni au clavier,
// ni au toucher, ni pour qui ne distingue pas la teinte employée.
for (const route of ['/fr/connexion', '/fr/connexion-otp']) {
  test(`${route} : le lien dans la phrase est souligné sans survol`, async ({
    page,
  }) => {
    await page.goto(route);
    const lien = page.locator('p a[href$="adhesion"]');
    await expect(lien).toHaveCount(1);
    // Style CALCULÉ, au repos : une classe `underline` présente dans le
    // balisage ne prouverait pas qu'elle s'applique.
    const decoration = await lien.evaluate(
      (el) => getComputedStyle(el).textDecorationLine,
    );
    console.log(`[lien] ${route} -> text-decoration-line: ${decoration}`);
    expect(decoration).toContain('underline');
  });
}
