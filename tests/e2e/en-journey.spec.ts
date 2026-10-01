import { test, expect } from '@playwright/test';
import { getOtp, latestApplicationForEmail, provisionUser } from './_helpers';
import { ouvrirSelecteurDeLangue } from './_langue';

// FULL ENGLISH JOURNEY over the main paths: home,
// library, membership, sign-in.
//
// English is half of the interface, and until now parity was checked
// by a mere key count (846 = 846) — which says nothing about
// hard-coded French strings (see #34, including in `aria-label`s).
// Hence this file's approach: elements are targeted by their ENGLISH
// ACCESSIBLE NAME. A label left in French does not produce "extra
// text", it makes the locator fail — and therefore the test.
test.use({ locale: 'en-US' });

test('EN : / est redirigé vers /en et la page est annoncée en anglais (F-03)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/en$/);
  // `lang` drives speech synthesis and hyphenation: a `lang="fr"` on an
  // English page is a real accessibility defect.
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  // The language selector is a menu (see `_langue.ts`). Its accessible name
  // is targeted LITERALLY and in English, in line with this file's approach:
  // it is a translated `aria-label`, so exactly the kind of string that
  // stays in French without anything flagging it (#34). "Langue" would make
  // this locator fail, and that is the point.
  const declencheur = page
    .getByRole('banner')
    .getByRole('button', { name: 'Language' });
  await expect(declencheur).toBeVisible();

  const menu = await ouvrirSelecteurDeLangue(page);
  await expect(
    menu.getByRole('menuitemradio', { name: 'English' }),
  ).toHaveAttribute('aria-checked', 'true');
});

test('EN : accueil -> bibliothèque -> facette -> fiche de publication (F-03/F-32)', async ({
  page,
}) => {
  await page.goto('/en');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Democracy needs a network',
  );
  await expect(page.getByText('Offices', { exact: true })).toBeVisible();

  // 1. Hero CTA -> library
  //
  // By DESTINATION, not by label. The hero content comes from
  // `getHomeContent` (`home-content.ts`): the label is editorial, and it has
  // already changed — the
  // test expected "Explore the analyses" (a leftover from `messages/en.json`,
  // which no longer feeds the hero) while the page renders "Read the
  // analyses". The destination address, on the other hand, is a structural decision.
  //
  // `main` excludes the same-named link in the navigation; the hero CTA is the
  // first link on the page pointing to the library.
  await page.locator('main a[href="/en/bibliotheque"]').first().click();
  await expect(page).toHaveURL(/\/en\/bibliotheque$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Library',
  );
  // aria-label of the search and of the list: both translated
  await expect(
    page.getByRole('searchbox', {
      name: 'Search a title, an author, a topic…',
    }),
  ).toBeVisible();
  const cards = page
    .getByRole('list', { name: 'List of publications' })
    .getByRole('listitem');
  await expect(cards.first()).toBeVisible();

  // 2. Translated theme facet ("Transitions démocratiques" in FR)
  await page
    .getByRole('link', { name: 'Democratic transitions' })
    .first()
    .click();
  await expect(page).toHaveURL(/[?&]theme=transitions/);
  await expect(page.getByText(/\d+ publications?/).first()).toBeVisible();

  // 3. Publication page: the detail stays in English and on /en
  await cards.first().getByRole('link').first().click();
  await expect(page).toHaveURL(/\/en\/bibliotheque\/[a-z0-9-]+$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Abstract' })).toBeVisible();
  // Sidebar: interface labels, also translated.
  await expect(page.getByRole('heading', { name: 'Metadata' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Impact' })).toBeVisible();
});

test('EN : candidature d’adhésion depuis le formulaire anglais (F-20/F-22)', async ({
  page,
}) => {
  const email = `e2e_en_adh_${Date.now()}@democracytogether.test`;

  await page.goto('/en');
  // The hero's "Join the network" CTA leads to membership.
  await page
    .getByRole('link', { name: 'Join the network', exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/en\/adhesion$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Join the network' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Solidarity pricing estimator' }),
  ).toBeVisible();

  // Form: English labels (a French `getByLabel` would fail here)
  await page.getByLabel('Think tank name').fill('English Democracy Lab');
  await page.getByLabel('Contact email').fill(email);
  // Exact: the estimator's radio group, "Country income level", also
  // contains the word.
  await page.getByLabel('Country', { exact: true }).fill('Ghana');
  await page
    .getByLabel('About you (optional)')
    .fill('We study democratic governance in West Africa.');
  await page.getByRole('button', { name: 'Submit my application' }).click();

  await expect(
    page.getByRole('heading', { name: 'Application received' }),
  ).toBeVisible();

  // The English application lands in the SAME moderation queue.
  const stored = latestApplicationForEmail(email);
  expect(stored?.organizationName).toBe('English Democracy Lab');
  expect(stored?.status).toBe('pending');
});

test('EN : connexion par code puis espace membre (F-01/F-03)', async ({
  page,
}) => {
  const email = `e2e_en_otp_${Date.now()}@democracytogether.test`;
  // No self-signup: code sign-in rejects an unknown address
  // (NO_SELF_SIGNUP). The account must exist first — which is what an
  // invitation does in real life (#66).
  await provisionUser(email);

  await page.goto('/en/connexion');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Sign in' }),
  ).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();

  // Passwordless sign-in, in English
  await page.getByRole('link', { name: 'Sign in without a password' }).click();
  await expect(page).toHaveURL(/\/en\/connexion-otp$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Sign in with a code' }),
  ).toBeVisible();

  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByRole('button', { name: 'Get a code' }).click();

  await expect(
    page.getByRole('heading', { name: 'Enter the code' }),
  ).toBeVisible();
  await page.getByLabel('Verification code').fill(await getOtp(email));
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  // The member area stays in English after authentication.
  await expect(page).toHaveURL(/\/en\/espace-membre$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Member area' }),
  ).toBeVisible();
  // Signed in, the header carries the account menu, named in English too.
  await expect(
    page.getByRole('banner').getByRole('button', { name: 'My account' }),
  ).toBeVisible({ timeout: 15_000 });
});

// The three points of issue #34, checked where they show: in the render.
// None of them is page text — they are an accessible name, a section
// accessible name, and a `<meta>` tag. In other words, exactly what a
// visual review does not catch, and what an FR/EN key count did not
// reveal either.
test('EN : noms accessibles et description racine en anglais (#34)', async ({
  page,
}) => {
  // 1. The home link is the ONLY text-less element of the banner: its
  // accessible name came from a French `aria-label`, on every page.
  await page.goto('/en/evenements');
  await expect(
    page
      .getByRole('banner')
      .getByRole('link', { name: 'Democracy Together — home' }),
  ).toBeVisible();

  // 2. The results section: `<section aria-label>` -> `region` role.
  await expect(page.getByRole('region', { name: 'Results' })).toBeVisible();

  // 3. The description served in ENGLISH. `/en/don` now has its own
  // metadata (payments workstream, 27/09): it is its own, translated one that
  // the search engine would display — the check is about the language.
  await page.goto('/en/don');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    'Your donation funds Democracy Together’s meetings, publications and youth programmes in Africa and Europe.',
  );
});
