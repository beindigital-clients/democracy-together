import { test, expect } from '@playwright/test';
import { provisionUser, setAmi, signInWithCode } from './_helpers';

// CERCLE DES AMIS — nothing private leaks to the public site, seen from a
// browser with no session. An Ami writes a contribution carrying a unique
// marker; an anonymous visitor then looks for it everywhere a public reader or
// a crawler could: search, library, home, sitemap, robots, the private route,
// the upload endpoint. The marker must appear nowhere.

test.use({ locale: 'fr-FR' });

const STAMP = Date.now();
const MARKER = `marqueurcerclesecret${STAMP}`;
const AMI = `e2e_cercle_fuites_${STAMP}@democracytogether.test`;
const SITE = process.env.NEXT_PUBLIC_CONVEX_SITE_URL;

test('une contribution du Cercle n’apparaît nulle part sur le site public', async ({
  browser,
}) => {
  await provisionUser(AMI, 'visiteur');
  await setAmi(AMI, true);
  const owner = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    locale: 'fr-FR',
  });
  const ownerPage = await owner.newPage();
  await signInWithCode(ownerPage, AMI);
  await ownerPage.goto('/fr/espace-membre/cercle');
  await ownerPage
    .getByLabel('Votre contribution')
    .fill(`Piste privée ${MARKER}, pour le Cercle seulement.`);
  await ownerPage.getByRole('button', { name: 'Ajouter au Cercle' }).click();
  await expect(ownerPage.getByText(MARKER)).toBeVisible({ timeout: 15_000 });
  await owner.close();

  // An anonymous visitor.
  const anon = await browser.newContext({
    storageState: { cookies: [], origins: [] },
    locale: 'fr-FR',
  });
  const page = await anon.newPage();

  // The search page echoes what was typed, so the TEXT of the contribution is
  // what must be missing from it, not the searched marker itself.
  await page.goto(`/fr/recherche?q=${MARKER}`);
  await page.waitForLoadState('networkidle');
  expect(await page.content()).not.toContain('Piste privée');
  expect(await page.content()).not.toContain('pour le Cercle seulement');

  for (const path of [
    '/fr/bibliotheque',
    '/fr/cercle',
    '/fr',
    '/fr/tribune',
    '/fr/le-reseau',
  ]) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(await page.content(), path).not.toContain(MARKER);
  }

  // Crawler-facing files.
  const sitemap = await page.request.get('/sitemap.xml');
  expect(sitemap.ok()).toBe(true);
  const sitemapText = await sitemap.text();
  expect(sitemapText).not.toContain(MARKER);
  expect(sitemapText).not.toContain('espace-membre');
  expect(sitemapText).toContain('/fr/cercle');
  const robots = await (await page.request.get('/robots.txt')).text();
  expect(robots).toMatch(/Disallow: \/fr\/espace-membre/);

  // The private route is closed at the HTTP level, before any rendering.
  await page.goto('/fr/espace-membre/cercle');
  await expect(page).toHaveURL(/\/fr\/connexion/);
  expect(await page.content()).not.toContain(MARKER);

  // The upload endpoint hands nothing back to a GET.
  if (SITE) {
    const response = await page.request.get(`${SITE}/cercle/cv`);
    expect([404, 405]).toContain(response.status());
    expect(await response.text()).not.toContain(MARKER);
  }
  await anon.close();
});
