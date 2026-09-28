import { test, expect } from '@playwright/test';

test.use({ locale: 'fr-FR' });

// F-09 — Legal pages: real content (no more "Bientôt" placeholder).
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
  // Several mentions since audience measurement (CNIL exemption): one is enough.
  await expect(page.getByText(/CNIL/).first()).toBeVisible();

  await page.goto('/fr/accessibilite');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'accessibilité',
  );

  // EN version
  await page.goto('/en/confidentialite');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Privacy policy',
  );
  await expect(
    page.getByRole('heading', { name: 'Your rights' }),
  ).toBeVisible();
});

// F-09 — Consent banner. Starts from a clean state (the global storageState
// pre-consents the other specs so that the fixed banner does not
// intercept their clicks).
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

    // Persistence: no more banner after reload.
    await page.reload();
    await expect(
      page.getByRole('region', { name: 'Gestion des cookies' }),
    ).toBeHidden();
  });
});
