import { test, expect } from '@playwright/test';

test.use({ locale: 'fr-FR' });

// F-04 — the routes linked from the nav, the footer and the hero CTA never
// return 404. The last pending route ("Bientôt") was
// `/don`: since the payments workstream (27/09), it serves the real
// donation form. The test keeps the promise — 200, never 404 — and
// checks that NO "Bientôt" screen remains on this flow.
const ROUTES = ['/fr/don'];

test('routes du parcours principal : 200, et plus aucun « Bientôt » (F-04)', async ({
  page,
}) => {
  for (const route of ROUTES) {
    const res = await page.goto(route);
    expect(res?.status(), route).toBe(200);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Faire un don' }),
    ).toBeVisible();
    await expect(page.getByText(/Bientôt/)).toHaveCount(0);
  }
});
