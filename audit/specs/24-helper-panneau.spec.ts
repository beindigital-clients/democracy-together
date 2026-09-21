import { test, expect } from '@playwright/test';
import { ouvrirPanneau, cliquerJusqua } from '../../tests/e2e/_panneau';

// Le helper d'ouverture de panneau est lui-même testé — sur une page
// SYNTHÉTIQUE, parce que la suite E2E du dépôt exige un déploiement Convex que
// l'environnement d'audit n'a pas. Ce qu'on vérifie ici est justement ce qui ne
// dépend pas du produit : le comportement du helper face à un premier clic
// perdu, face à une bascule, et face à un panneau qui ne s'ouvre jamais.

/** Page à un bouton, qui IGNORE ses `perdus` premiers clics. */
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
  // Le cœur du helper : il ne re-clique que tant que le panneau est FERMÉ.
  // Un helper qui cliquerait en aveugle refermerait la bascule ici.
  await expect(page.locator('#p')).toBeVisible();
});

test('panneau qui ne s’ouvre jamais : le test échoue toujours', async ({
  page,
}) => {
  await page.setContent(pageAvecClicsPerdus(9999));
  // La garantie qui empêche ce helper d'être une mise sous le tapis.
  await expect(
    ouvrirPanneau(page.locator('#d'), page.locator('#p'), 'synthétique'),
  ).rejects.toThrow();
});

// --- cliquerJusqua : même symptôme, effet non localisable ------------------

/** Page dont le bouton n'agit qu'au `perdus+1`-ième clic, de façon IDEMPOTENTE. */
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
