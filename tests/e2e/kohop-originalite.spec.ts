import { test, expect } from '@playwright/test';
import { provisionUser, seedKohopOriginalityDossier } from './_helpers';
import { SESSIONS } from './_sessions';
import { attendreAucuneViolationGrave, revealAll } from './_a11y';

// What the review chief reads about originality and links: the three stages of
// the platform check (a stage that failed is said, never "nothing to report"),
// each passage beside its source with its language, the AI's advice next to the
// rule-based class, and the links synthesis with its sources. Built from a seeded
// file at the decision stage; real screen, real server guards.
test.use({ locale: 'fr-FR', storageState: SESSIONS.kohopChef.state });

test('l’écran du chef : étapes, passages côte à côte, avis de l’IA, synthèse des liens', async ({
  page,
}) => {
  await provisionUser(SESSIONS.kohopRelecteur1.email, 'membre');
  const title = `Originalité ${Date.now()}`;
  await seedKohopOriginalityDossier(
    SESSIONS.kohopAuteur.email,
    SESSIONS.kohopRelecteur1.email,
    title,
  );

  await page.goto('/fr/admin/kohop');
  await page.getByRole('radio', { name: /À décider/ }).click();
  await page
    .getByRole('link', { name: new RegExp(title) })
    .first()
    .click();
  const card = page.getByRole('region', { name: 'Originalité', exact: true });
  await expect(card).toBeVisible();

  // The stages: the failed one is named, and the report says it is incomplete.
  await expect(
    card.getByText('Étapes du contrôle de plateforme'),
  ).toBeVisible();
  await expect(card.getByText('Suites de mots · Terminé')).toBeVisible();
  await expect(card.getByText('Avis de l’IA · Échec')).toBeVisible();
  await expect(card.getByText('Contrôle incomplet')).toBeVisible();

  // A passage found by meaning, across languages, beside its source.
  await expect(card.getByText('D’une langue à l’autre')).toBeVisible();
  await expect(card.getByText('Proximité 91 %')).toBeVisible();
  await expect(card.getByText('Avis de l’IA : traduction')).toBeVisible();
  await expect(
    card.getByText(/Participatory budgets bring residents/),
  ).toBeVisible();

  // The links synthesis, with its sources.
  await expect(page.getByText('Synthèse (IA) :')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'source' }).first(),
  ).toBeVisible();
  // At the decision stage the designation is closed: no way to re-run the links check.
  await expect(
    page.getByRole('button', {
      name: 'Relancer la vérification hors plateforme',
    }),
  ).toHaveCount(0);

  await revealAll(page);
  await attendreAucuneViolationGrave(page, 'écran du chef : originalité');

  // Small screen: no horizontal scroll, still readable.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(card).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(overflow).toBe(false);
  await attendreAucuneViolationGrave(
    page,
    'écran du chef : originalité (mobile)',
  );
});
