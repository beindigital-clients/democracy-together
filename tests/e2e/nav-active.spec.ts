import { test, expect } from '@playwright/test';

test.use({ locale: 'fr-FR' });

// Indicateur de page active dans la nav (aria-current="page").
test('nav : la page courante est marquée active', async ({ page }) => {
  const banner = page.getByRole('banner');

  await page.goto('/fr/bibliotheque');
  await expect(
    banner.getByRole('link', { name: 'Analyses', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  // une autre entrée n'est pas marquée active
  await expect(
    banner.getByRole('link', { name: 'À propos', exact: true }),
  ).not.toHaveAttribute('aria-current', 'page');

  // sous-page : /bibliotheque/<slug> garde « Analyses » active
  await page.goto('/fr/bibliotheque/etat-democratie-afrique-europe');
  await expect(
    banner.getByRole('link', { name: 'Analyses', exact: true }),
  ).toHaveAttribute('aria-current', 'page');
});
