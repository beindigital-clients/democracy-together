import { test, expect, type Page } from '@playwright/test';
import { recaptchaConfigured } from '../../src/lib/recaptcha';

test.use({ locale: 'fr-FR' });

// CHARGEMENT À LA DEMANDE DU SCRIPT reCAPTCHA (issue #39).
//
// Le script de Google était monté par le layout racine, donc servi sur les 61
// routes — y compris `/fr/mentions-legales`, qui est du texte statique sans le
// moindre formulaire. Sur les connexions mobiles à faible débit que le cadrage
// prend pour exigence structurante, c'est de la latence, de la batterie et des
// données consommées pour rien ; et un traqueur tiers posé sans raison sur une
// page qui n'en a aucun besoin.
//
// Ces tests tiennent le critère d'acceptation : AUCUN script reCAPTCHA sur une
// page sans formulaire, et le script bien présent là où un formulaire protégé
// est rendu.
//
// Deux configurations possibles, comme pour Sanity (TESTING.md § « Sources
// externes ») : sans `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` — le cas de la CI — rien
// n'est jamais chargé. La règle est IMPORTÉE du module de l'application, jamais
// recopiée : une divergence ferait silencieusement prendre la mauvaise branche.
// Le premier test, lui, vaut dans les deux cas : c'est le critère lui-même.

const RECAPTCHA = /recaptcha/i;

function suivreRecaptcha(page: Page): string[] {
  const vues: string[] = [];
  page.on('request', (r) => {
    if (RECAPTCHA.test(r.url())) vues.push(r.url());
  });
  return vues;
}

function noterConfiguration() {
  test.info().annotations.push({
    type: 'recaptcha',
    description: recaptchaConfigured
      ? 'clé de site posée : chargement réel vérifié'
      : 'clé de site absente : no-op vérifié',
  });
}

// L'absence de requête ne prouve rien tant que la page n'est pas hydratée : le
// script est injecté depuis un effet, donc APRÈS l'hydratation. On attend donc
// une preuve qu'elle a bien eu lieu — un contrôle qui ne répond que par React —
// avant de conclure que rien n'a été chargé. La bascule de thème du pied de
// page est présente sur toutes les pages.
async function attendreHydratation(page: Page) {
  const html = page.locator('html');
  const avant = (await html.getAttribute('data-theme')) ?? 'light';
  const bascule = page
    .getByRole('contentinfo')
    .getByRole('button', { name: 'Changer de thème' });

  // Le bouton est dans le HTML servi bien avant d'être branché : un clic parti
  // trop tôt ne fait rien du tout. On réessaie jusqu'à ce qu'il réponde — c'est
  // précisément l'instant d'hydratation qu'on cherche à attendre.
  await expect(async () => {
    await bascule.click();
    await expect(html).not.toHaveAttribute('data-theme', avant, {
      timeout: 1000,
    });
  }).toPass({ timeout: 20_000 });
}

test('page éditoriale : aucun script reCAPTCHA (issue #39)', async ({
  page,
}) => {
  noterConfiguration();
  const vues = suivreRecaptcha(page);

  await page.goto('/fr/mentions-legales');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Mentions légales',
  );
  await attendreHydratation(page);

  expect(
    vues,
    'Une page purement éditoriale ne doit charger aucune ressource reCAPTCHA.',
  ).toEqual([]);
  expect(await page.locator('script#recaptcha-v3').count()).toBe(0);
});

test('page avec formulaire protégé : le script est chargé à la demande', async ({
  page,
}) => {
  noterConfiguration();
  const vues = suivreRecaptcha(page);

  await page.goto('/fr/contact');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  if (!recaptchaConfigured) {
    // No-op gracieux : sans clé, les formulaires fonctionnent et rien de tiers
    // n'est chargé. C'est ce que voit la CI, et ça mérite d'être vérifié pour
    // soi-même — c'est aussi la configuration d'un déploiement mal réglé.
    await attendreHydratation(page);
    expect(vues).toEqual([]);
    return;
  }

  // Le formulaire de contact est protégé : son montage vaut demande de
  // chargement, sans attendre la soumission.
  await expect(page.locator('script#recaptcha-v3')).toBeAttached();
  await expect
    .poll(() => vues.length, {
      message: 'Le script de Google doit être demandé au rendu du formulaire.',
    })
    .toBeGreaterThan(0);
});

test('navigation client : le script suit le formulaire, pas la page d’accueil', async ({
  page,
}) => {
  noterConfiguration();
  const vues = suivreRecaptcha(page);

  // Départ sur une page éditoriale : rien ne doit partir vers Google.
  await page.goto('/fr/mentions-legales');
  await attendreHydratation(page);
  expect(vues).toEqual([]);

  // Puis navigation CLIENT (sans rechargement) vers le formulaire de contact.
  await page
    .getByRole('contentinfo')
    .getByRole('link', { name: 'Contact' })
    .click();
  await expect(page).toHaveURL(/\/fr\/contact$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  if (!recaptchaConfigured) {
    expect(vues).toEqual([]);
    return;
  }
  await expect(page.locator('script#recaptcha-v3')).toBeAttached();
});
