import { test, expect } from '@playwright/test';

// F-54 — Webinar replays: LEAN page derived from past events.
// NO fake video — an honest "Enregistrement bientôt disponible" notice.

test('replays : la page répond et affiche son titre (F-54)', async ({
  page,
}) => {
  const res = await page.goto('/fr/replays');
  expect(res?.status()).toBe(200);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Replays des webinaires' }),
  ).toBeVisible();

  // Honest notice: no fake video player, just the announcement.
  await expect(
    page.getByText('Enregistrement bientôt disponible').first(),
  ).toBeVisible();

  // At least one link to a past event's page.
  await expect(page.locator('a[href*="/evenements/"]').first()).toBeVisible();
});

test('replays : version EN (F-54/F-03)', async ({ page }) => {
  await page.goto('/en/replays');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Webinar replays' }),
  ).toBeVisible();
});

test('replays : accessible depuis le pied de page (F-54)', async ({ page }) => {
  await page.goto('/fr');
  const footerLink = page.locator('footer a[href$="/replays"]');
  await expect(footerLink).toBeVisible();
  await footerLink.click();
  await expect(page).toHaveURL(/\/fr\/replays$/);
});
