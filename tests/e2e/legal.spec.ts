import { test, expect } from '@playwright/test';

test.use({ locale: 'fr-FR' });

// F-09 — Pages légales : contenu réel (plus de placeholder « Bientôt »).
test('pages légales : contenu réel FR + EN (F-09)', async ({ page }) => {
  await page.goto('/fr/mentions-legales');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Mentions légales',
  );
  await expect(
    page.getByRole('heading', { name: 'Éditeur du site' }),
  ).toBeVisible();
  await expect(page.getByText(/loi du 1/)).toBeVisible();

  await page.goto('/fr/confidentialite');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'confidentialité',
  );
  await expect(page.getByRole('heading', { name: 'Vos droits' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Cookies et traceurs' }),
  ).toBeVisible();
  await expect(page.getByText(/CNIL/)).toBeVisible();

  await page.goto('/fr/accessibilite');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'accessibilité',
  );

  // Version EN
  await page.goto('/en/confidentialite');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Privacy policy',
  );
  await expect(
    page.getByRole('heading', { name: 'Your rights' }),
  ).toBeVisible();
});

// F-09 — Bandeau de consentement. Repart d'un état vierge (le storageState
// global pré-consent les autres specs pour éviter que le bandeau fixed
// n'intercepte leurs clics).
test.describe('bandeau de consentement cookies (F-09)', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('apparaît au 1er passage, se ferme et persiste le choix', async ({
    page,
  }) => {
    await page.goto('/fr');
    const banner = page.getByRole('region', { name: 'Gestion des cookies' });
    await expect(banner).toBeVisible();
    await expect(
      banner.getByRole('link', { name: 'En savoir plus' }),
    ).toHaveAttribute('href', /\/fr\/confidentialite$/);

    await banner.getByRole('button', { name: 'Essentiels uniquement' }).click();
    await expect(banner).toBeHidden();

    // Persistance : plus de bandeau après rechargement.
    await page.reload();
    await expect(
      page.getByRole('region', { name: 'Gestion des cookies' }),
    ).toBeHidden();
  });
});
