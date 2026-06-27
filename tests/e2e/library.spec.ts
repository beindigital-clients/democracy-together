import { test, expect } from '@playwright/test';

test.use({ locale: 'fr-FR' });

function grid(page: import('@playwright/test').Page) {
  return page
    .getByRole('list', { name: 'Liste des publications' })
    .getByRole('listitem');
}

test('bibliothèque : liste, facettes serveur et détail (F-32/F-34)', async ({
  page,
}) => {
  await page.goto('/fr/bibliotheque');

  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Bibliothèque',
  );
  // >= 14 publications du seed. La bibliothèque accueille désormais aussi des
  // dépôts membres publiés (F-32), donc le total n'est plus figé : on vérifie
  // le plancher du seed plutôt qu'un nombre exact (évite tout couplage avec
  // l'E2E de dépôt qui publie une vraie publication).
  const countLabel = page.getByText(/\d+ publications/).first();
  await expect(countLabel).toBeVisible();
  const total = Number((await countLabel.textContent())!.replace(/\D/g, ''));
  expect(total).toBeGreaterThanOrEqual(14);
  // page 1 = 9 cartes (PAGE_SIZE)
  expect(await grid(page).count()).toBe(9);
  await expect(
    page.getByRole('link', { name: /état de la démocratie entre/i }),
  ).toBeVisible();

  // Facette multi-sélection (lien GET) : filtre par thématique
  await page
    .getByRole('link', { name: /Transitions démocratiques/ })
    .first()
    .click();
  await expect(page).toHaveURL(/[?&]theme=transitions/);
  await expect(page.getByText('3 publications')).toBeVisible();
  // l'option active est marquée courante (aria-current sur un lien de filtre)
  await expect(
    page.getByRole('link', { name: /Transitions démocratiques/ }).first(),
  ).toHaveAttribute('aria-current', 'true');

  // Ouvrir le détail de la publication vedette
  await page.getByRole('link', { name: /état de la démocratie entre/i }).click();
  await expect(page).toHaveURL(/\/fr\/bibliotheque\/etat-democratie-afrique-europe$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    "L'état de la démocratie",
  );
  await expect(page.getByRole('heading', { name: 'Résumé' })).toBeVisible();

  // Bloc citation : APA par défaut, bascule BibTeX
  await expect(page.getByText(/Wade, A\..*Vandenberghe/)).toBeVisible();
  await page.getByRole('button', { name: 'BibTeX' }).click();
  await expect(page.getByText('@techreport{dt2026etat')).toBeVisible();
});

test('bibliothèque : accès via la nav « Analyses » + version EN (F-03/F-32)', async ({
  page,
}) => {
  await page.goto('/fr');
  await page.getByRole('link', { name: 'Analyses', exact: true }).click();
  await expect(page).toHaveURL(/\/fr\/bibliotheque$/);

  // L'ancienne URL /analyses redirige vers la bibliothèque
  await page.goto('/fr/analyses');
  await expect(page).toHaveURL(/\/fr\/bibliotheque$/);

  await page.goto('/en/bibliotheque');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Library');
  await expect(page.getByText(/open access and citable/i)).toBeVisible();
});
