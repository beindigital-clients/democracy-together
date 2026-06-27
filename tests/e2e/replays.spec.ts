import { test, expect } from '@playwright/test';

// F-54 — Replays de webinaires : page LEAN dérivée des événements passés.
// AUCUNE fausse vidéo — un encart honnête « Enregistrement bientôt disponible ».

test('replays : la page répond et affiche son titre (F-54)', async ({ page }) => {
  const res = await page.goto('/fr/replays');
  expect(res?.status()).toBe(200);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Replays des webinaires' }),
  ).toBeVisible();

  // Encart honnête : pas de faux lecteur vidéo, juste l'annonce.
  await expect(
    page.getByText('Enregistrement bientôt disponible').first(),
  ).toBeVisible();

  // Au moins un lien vers la fiche d'un événement passé.
  await expect(
    page.locator('a[href*="/evenements/"]').first(),
  ).toBeVisible();
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
