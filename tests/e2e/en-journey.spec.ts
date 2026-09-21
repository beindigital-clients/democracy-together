import { test, expect } from '@playwright/test';
import { getOtp, latestApplicationForEmail, provisionUser } from './_helpers';

// PARCOURS COMPLET EN ANGLAIS sur les chemins principaux : accueil,
// bibliothèque, adhésion, connexion.
//
// L'anglais, c'est la moitié de l'interface, et jusqu'ici la parité était
// vérifiée par un simple comptage de clés (846 = 846) — qui ne dit rien des
// chaînes françaises codées en dur (cf. #34, y compris dans des `aria-label`).
// D'où le parti pris de ce fichier : on cible les éléments par leur NOM
// ACCESSIBLE ANGLAIS. Un libellé resté en français ne fait pas « un texte en
// trop », il fait échouer le locator — donc le test.
test.use({ locale: 'en-US' });

test('EN : / est redirigé vers /en et la page est annoncée en anglais (F-03)', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/en$/);
  // `lang` conditionne la synthèse vocale et la césure : un `lang="fr"` sur une
  // page anglaise est un vrai défaut d'accessibilité.
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  const group = page
    .getByRole('banner')
    .getByRole('group', { name: 'Language' });
  await expect(group.getByRole('button', { name: 'EN' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

test('EN : accueil -> bibliothèque -> facette -> fiche de publication (F-03/F-32)', async ({
  page,
}) => {
  await page.goto('/en');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Democracy needs a network',
  );
  await expect(page.getByText('Offices', { exact: true })).toBeVisible();

  // 1. CTA du hero -> bibliothèque
  //
  // Par la DESTINATION, pas par le libellé. Le contenu du hero vient de
  // `getHomeContent`, qui lit Sanity avec repli sur `home-content.ts` : le
  // libellé est donc éditable (F-62), et il a déjà changé — le test attendait
  // « Explore the analyses » (vestige de `messages/en.json`, qui n'alimente
  // plus le hero) alors que la page rend « Read the analyses ». L'adresse de
  // destination, elle, est une décision de structure.
  //
  // `main` écarte le lien homonyme de la navigation ; le CTA du hero est le
  // premier lien de la page à pointer vers la bibliothèque.
  await page.locator('main a[href="/en/bibliotheque"]').first().click();
  await expect(page).toHaveURL(/\/en\/bibliotheque$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Library',
  );
  // aria-label de la recherche et de la liste : tous deux traduits
  await expect(
    page.getByRole('searchbox', {
      name: 'Search a title, an author, a topic…',
    }),
  ).toBeVisible();
  const cards = page
    .getByRole('list', { name: 'List of publications' })
    .getByRole('listitem');
  await expect(cards.first()).toBeVisible();

  // 2. Facette thématique traduite (« Transitions démocratiques » en FR)
  await page
    .getByRole('link', { name: 'Democratic transitions' })
    .first()
    .click();
  await expect(page).toHaveURL(/[?&]theme=transitions/);
  await expect(page.getByText(/\d+ publications?/).first()).toBeVisible();

  // 3. Fiche de publication : le détail reste en anglais et sur /en
  await cards.first().getByRole('link').first().click();
  await expect(page).toHaveURL(/\/en\/bibliotheque\/[a-z0-9-]+$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Abstract' })).toBeVisible();
  // Encadré latéral : libellés d'interface, eux aussi traduits.
  await expect(page.getByRole('heading', { name: 'Metadata' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Impact' })).toBeVisible();
});

test('EN : candidature d’adhésion depuis le formulaire anglais (F-20/F-22)', async ({
  page,
}) => {
  const email = `e2e_en_adh_${Date.now()}@democracytogether.test`;

  await page.goto('/en');
  // Le CTA « Join the network » du hero mène à l'adhésion.
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

  // Formulaire : libellés anglais (un `getByLabel` français échouerait ici)
  await page.getByLabel('Think tank name').fill('English Democracy Lab');
  await page.getByLabel('Contact email').fill(email);
  await page.getByLabel('Country').fill('Ghana');
  await page
    .getByLabel('About you (optional)')
    .fill('We study democratic governance in West Africa.');
  await page.getByRole('button', { name: 'Submit my application' }).click();

  await expect(
    page.getByRole('heading', { name: 'Application received' }),
  ).toBeVisible();

  // La candidature anglaise atterrit dans la MÊME file de modération.
  const stored = latestApplicationForEmail(email);
  expect(stored?.organizationName).toBe('English Democracy Lab');
  expect(stored?.status).toBe('pending');
});

test('EN : connexion par code puis espace membre (F-01/F-03)', async ({
  page,
}) => {
  const email = `e2e_en_otp_${Date.now()}@democracytogether.test`;
  // Pas d'auto-inscription : la connexion par code refuse une adresse inconnue
  // (NO_SELF_SIGNUP). Le compte doit exister d'abord — c'est ce que fait une
  // invitation dans la vraie vie (#66).
  await provisionUser(email);

  await page.goto('/en/connexion');
  await expect(
    page.getByRole('heading', { level: 1, name: 'Sign in' }),
  ).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();

  // Connexion sans mot de passe, en anglais
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

  // L'espace membre reste en anglais après l'authentification.
  await expect(page).toHaveURL(/\/en\/espace-membre$/);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Member area' }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible({
    timeout: 15_000,
  });
});

// Les trois points de l'issue #34, vérifiés là où ils se voient : dans le rendu.
// Aucun n'est un texte de page — ce sont un nom accessible, un nom accessible
// de section, et une balise `<meta>`. Autrement dit, exactement ce qu'une
// relecture à l'œil ne rattrape pas, et ce qu'un comptage de clés FR/EN ne
// disait pas non plus.
test('EN : noms accessibles et description racine en anglais (#34)', async ({
  page,
}) => {
  // 1. Le lien vers l'accueil est le SEUL élément sans texte du bandeau : son
  // nom accessible venait d'un `aria-label` français, sur toutes les pages.
  await page.goto('/en/evenements');
  await expect(
    page
      .getByRole('banner')
      .getByRole('link', { name: 'Democracy Together — home' }),
  ).toBeVisible();

  // 2. La section de résultats : `<section aria-label>` -> rôle `region`.
  await expect(page.getByRole('region', { name: 'Results' })).toBeVisible();

  // 3. La description par défaut du site, servie par `generateMetadata` du
  // layout. `/en/don` n'a pas de métadonnées propres : c'est donc bien celle du
  // layout qu'un moteur de recherche afficherait pour cette page.
  await page.goto('/en/don');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    'content',
    'International network of think tanks for democracy · Africa–Europe.',
  );
});
