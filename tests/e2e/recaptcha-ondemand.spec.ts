import { test, expect, type Page } from '@playwright/test';
import { recaptchaConfigured } from '../../src/lib/recaptcha';

test.use({ locale: 'fr-FR' });

// ON-DEMAND LOADING OF THE reCAPTCHA SCRIPT (issue #39).
//
// Google's script was mounted by the root layout, hence served on all 61
// routes — including `/fr/mentions-legales`, which is static text without a
// single form. On the low-bandwidth mobile connections that the scoping document
// treats as a structuring requirement, that is latency, battery and
// data consumed for nothing; and a third-party tracker placed for no reason on a
// page that has no need for it.
//
// These tests hold the acceptance criterion: NO reCAPTCHA script on a
// page without a form, and the script present wherever a protected form
// is rendered.
//
// Two possible configurations (TESTING.md § "Sources externes"): without
// `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` — the CI case — nothing
// is ever loaded. The rule is IMPORTED from the application module, never
// copied: a divergence would silently take the wrong branch.
// The first test holds in both cases: it is the criterion itself.

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

// The absence of a request proves nothing until the page is hydrated: the
// script is injected from an effect, hence AFTER hydration. So we wait for
// proof that it did happen — a control that only responds through React —
// before concluding that nothing was loaded. The footer theme toggle
// is present on every page.
async function attendreHydratation(page: Page) {
  const html = page.locator('html');
  const avant = (await html.getAttribute('data-theme')) ?? 'light';
  const bascule = page
    .getByRole('contentinfo')
    .getByRole('button', { name: 'Changer de thème' });

  // The button is in the served HTML well before it is wired up: a click fired
  // too early does nothing at all. We retry until it responds — that is
  // precisely the hydration moment we are trying to wait for.
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
    // Graceful no-op: without a key, the forms work and nothing third-party
    // is loaded. That is what CI sees, and it deserves to be checked in its
    // own right — it is also the configuration of a misconfigured deployment.
    await attendreHydratation(page);
    expect(vues).toEqual([]);
    return;
  }

  // The contact form is protected: mounting it counts as a load
  // request, without waiting for submission.
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

  // Start on an editorial page: nothing must go out to Google.
  await page.goto('/fr/mentions-legales');
  await attendreHydratation(page);
  expect(vues).toEqual([]);

  // Then a CLIENT navigation (no reload) to the contact form.
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
