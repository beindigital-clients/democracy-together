import { test, expect } from '@playwright/test';
import { attendreAucuneViolationGrave, revealAll } from './_a11y';

// KOHOP's reading material and public entry points: charter and guides carry
// the "first draft, to be validated" banner (D-11), every page passes axe, and
// the header offers KOHOP. Anonymous visitor, no session.
test.describe('pages de lecture KOHOP', () => {
  for (const [path, title] of [
    ['charte', 'Charte KOHOP'],
    ['guide-auteur', 'Guide de l’auteur·rice'],
    ['guide-relecteur', 'Guide du relecteur·rice'],
  ] as const) {
    test(`/${path} : premier jet signalé, accessible`, async ({ page }) => {
      await page.goto(`/fr/kohop/${path}`);
      await expect(
        page.getByRole('heading', { level: 1, name: title }),
      ).toBeVisible();
      await expect(
        page.getByText('Premier jet, à valider par le client'),
      ).toBeVisible();
      // The Reveals start transparent: axe must read their final state.
      await revealAll(page);
      await attendreAucuneViolationGrave(page, `page ${path}`);
    });
  }

  test('la charte en arabe : lecture de droite à gauche, accessible', async ({
    page,
  }) => {
    await page.goto('/ar/kohop/charte');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await revealAll(page);
    await attendreAucuneViolationGrave(page, 'charte KOHOP en arabe');
  });

  test('l’en-tête du site propose KOHOP, et la liste renvoie aux trois pages', async ({
    page,
  }) => {
    await page.goto('/fr/kohop');
    await expect(
      page.getByRole('banner').getByRole('link', { name: 'KOHOP' }),
    ).toBeVisible();
    for (const name of [
      'La charte KOHOP',
      'Guide de l’auteur·rice',
      'Guide du relecteur·rice',
    ]) {
      await expect(page.getByRole('link', { name })).toBeVisible();
    }
    await revealAll(page);
    await attendreAucuneViolationGrave(page, 'liste KOHOP');
  });
});
