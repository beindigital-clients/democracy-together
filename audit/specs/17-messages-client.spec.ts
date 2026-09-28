import { test, expect, type Page } from '@playwright/test';
import { PUBLIQUES } from './_routes';

// What the message catalog sends to the browser (audit F-05).
//
// `src/i18n/client-namespaces.ts` restricts the catalog passed to the
// client provider. The unit test of the same name checks that the LIST
// matches the sources; this one checks the SERVED RESULT, and above all
// that no page asks for a key that was removed from it.
//
// The risk these guards cover is precisely the one you can't see:
// a missing key does not break the page, it renders the last segment of its
// path (`src/i18n/message-errors.ts`). Without these tests, one removal too many
// would settle in silently.

const MARQUEUR = 'clé de message absente';

/** Missing-key errors emitted during the page's lifetime. */
function surveiller(page: Page): string[] {
  const vues: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && m.text().includes(MARQUEUR))
      vues.push(m.text());
  });
  return vues;
}

test('TÉMOIN — le détecteur voit bien ce genre de message', async ({
  page,
}) => {
  // Without this test, a detector that listens to nothing would make all
  // the checks below green while having seen nothing.
  const vues = surveiller(page);
  await page.goto('/fr');
  await page.evaluate((m) => {
    console.error(`[i18n] ${m} : temoin.de.controle`);
  }, MARQUEUR);
  await expect.poll(() => vues.length, { timeout: 5_000 }).toBeGreaterThan(0);
});

for (const locale of ['fr', 'en'] as const) {
  for (const route of PUBLIQUES) {
    test(`aucune clé absente ${locale}${route || '/'}`, async ({ page }) => {
      const vues = surveiller(page);
      await page.goto(`/${locale}${route}`, { waitUntil: 'networkidle' });
      // The mobile panel, the search palette and the cookie banner
      // mount on interaction: their namespaces come from the same list, and
      // the list is derived from ALL client components, mounted or not.
      expect(vues, `${locale}${route} : clés absentes`).toEqual([]);
    });
  }
}

test('le HTML public ne porte plus le catalogue du back-office', async ({
  request,
}) => {
  const html = await (await request.get('/fr/a-propos')).text();
  // Present: a namespace that this page's client components ask for.
  expect(html, 'le catalogue client doit rester servi').toContain(
    "C'est noté. Nous vous écrirons avant l'événement.",
  );
  // Absent: the back office, 10 KB for screens behind authentication.
  expect(html, 'le catalogue admin ne doit plus partir').not.toContain(
    "Cet espace est réservé à l'équipe de modération.",
  );
});

test('le back-office, lui, garde ses messages', async ({ request }) => {
  // Counter-check of the previous test: the removal is only valid if it broke
  // nothing where the namespace is needed. `/fr/admin` redirects an anonymous
  // visitor to sign-in (server 307, see M-4); what we check here
  // is therefore the REDIRECT, not the page — the proof that the back office renders
  // its labels is in the repo's E2E suite, which signs in to it.
  const res = await request.get('/fr/admin', { maxRedirects: 0 });
  expect([307, 302]).toContain(res.status());
  expect(res.headers()['location'] ?? '').toContain('/fr/connexion');
});
