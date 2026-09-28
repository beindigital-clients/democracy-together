import { test, expect } from '@playwright/test';
import { ouvrirPanneau, cliquerJusqua } from '../../tests/e2e/_panneau';

// The panel-opening helper is itself tested — on a SYNTHETIC
// page, because the repo's E2E suite requires a Convex deployment that
// the audit environment does not have. What we check here is precisely what does not
// depend on the product: the helper's behavior on a lost first
// click, on a toggle, and on a panel that never opens.

/** One-button page that IGNORES its first `perdus` clicks. */
function pageAvecClicsPerdus(perdus: number) {
  return `<!doctype html><meta charset="utf-8"><body>
    <button id="d">Ouvrir</button>
    <div id="p" hidden>Panneau</div>
    <script>
      let n = 0, ouvert = false;
      document.getElementById('d').addEventListener('click', () => {
        if (++n <= ${perdus}) return;          // clic perdu
        ouvert = !ouvert;                       // BASCULE, comme un vrai menu
        document.getElementById('p').hidden = !ouvert;
      });
    </script>
  </body>`;
}

test('premier clic perdu : le panneau finit par s’ouvrir', async ({ page }) => {
  await page.setContent(pageAvecClicsPerdus(1));
  await ouvrirPanneau(page.locator('#d'), page.locator('#p'), 'synthétique');
  await expect(page.locator('#p')).toBeVisible();
});

test('aucun clic perdu : UN SEUL clic — une bascule ne doit pas se refermer', async ({
  page,
}) => {
  await page.setContent(pageAvecClicsPerdus(0));
  await ouvrirPanneau(page.locator('#d'), page.locator('#p'), 'synthétique');
  // The heart of the helper: it only re-clicks while the panel is CLOSED.
  // A helper that clicked blindly would close the toggle again here.
  await expect(page.locator('#p')).toBeVisible();
});

test('panneau qui ne s’ouvre jamais : le test échoue toujours', async ({
  page,
}) => {
  await page.setContent(pageAvecClicsPerdus(9999));
  // The guarantee that keeps this helper from sweeping things under the rug.
  await expect(
    ouvrirPanneau(page.locator('#d'), page.locator('#p'), 'synthétique'),
  ).rejects.toThrow();
});

// --- cliquerJusqua: same symptom, effect not localizable ------------------

/** Page whose button only acts on the `perdus+1`-th click, IDEMPOTENTLY. */
function pageEffetIdempotent(perdus: number) {
  return `<!doctype html><meta charset="utf-8"><body>
    <button id="d">Agir</button>
    <script>
      let n = 0;
      document.getElementById('d').addEventListener('click', () => {
        if (++n <= ${perdus}) return;
        document.title = 'fait';        // idempotent : re-cliquer ne défait rien
      });
    </script>
  </body>`;
}

test('cliquerJusqua — premier clic perdu : l’effet finit par se produire', async ({
  page,
}) => {
  await page.setContent(pageEffetIdempotent(1));
  await cliquerJusqua(
    page.locator('#d'),
    async () => (await page.title()) === 'fait',
    'synthétique',
  );
  expect(await page.title()).toBe('fait');
});

test('cliquerJusqua — effet qui ne vient jamais : le test échoue toujours', async ({
  page,
}) => {
  await page.setContent(pageEffetIdempotent(9999));
  await expect(
    cliquerJusqua(
      page.locator('#d'),
      async () => (await page.title()) === 'fait',
      'synthétique',
    ),
  ).rejects.toThrow();
});
