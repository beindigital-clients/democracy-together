import { test, expect, type Page } from '@playwright/test';

// What the F-07 and "scrollable region" fixes must PRODUCE — not what
// they put in the markup.
//
// The distinction is not rhetorical. The axe rule
// `scrollable-region-focusable` is satisfied by a `tabindex`: it never
// checks that the off-screen columns are actually reachable. A `tabindex` on
// a container that doesn't scroll would satisfy it just as well. These tests
// press the key and watch the content move.
//
// The 20-a11y suite separately guards the absence of violations; the two
// complement each other and do not replace each other.

const MOBILE = { width: 390, height: 844 };

/** Tables only overflow on small screens: that is where the defect is. */
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
      // A tab stop with no name is barely better than a closed region.
      await expect(zone).toHaveAttribute('aria-label', /\S/);

      const deborde = await zone.evaluate(
        (el) => el.scrollWidth - el.clientWidth,
      );
      if (deborde <= 0) continue; // this particular table fits: nothing to reach
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

// F-07 — a link buried in a sentence must stand out OTHER than by
// color (WCAG 1.4.1). Hover does not count: it does not exist with the keyboard,
// nor on touch, nor for anyone who cannot distinguish the hue used.
for (const route of ['/fr/connexion', '/fr/connexion-otp']) {
  test(`${route} : le lien dans la phrase est souligné sans survol`, async ({
    page,
  }) => {
    await page.goto(route);
    const lien = page.locator('p a[href$="adhesion"]');
    await expect(lien).toHaveCount(1);
    // COMPUTED style, at rest: an `underline` class present in the
    // markup would not prove that it applies.
    const decoration = await lien.evaluate(
      (el) => getComputedStyle(el).textDecorationLine,
    );
    console.log(`[lien] ${route} -> text-decoration-line: ${decoration}`);
    expect(decoration).toContain('underline');
  });
}
