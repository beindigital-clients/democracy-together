import { test, expect, type Page } from '@playwright/test';
import { PUBLIQUES } from './_routes';

// Ce que le catalogue de messages envoie au navigateur (audit F-05).
//
// `src/i18n/client-namespaces.ts` restreint le catalogue transmis au
// fournisseur client. Le test unitaire du même nom vérifie que la LISTE
// correspond aux sources ; celui-ci vérifie le RÉSULTAT SERVI, et surtout
// qu'aucune page ne réclame une clé qu'on lui a retirée.
//
// Le risque que ces gardes couvrent est précisément celui qui ne se voit pas :
// une clé absente ne casse pas la page, elle rend le dernier segment de son
// chemin (`src/i18n/message-errors.ts`). Sans ces tests, un retrait de trop
// s'installerait en silence.

const MARQUEUR = 'clé de message absente';

/** Erreurs de clé absente émises pendant la vie de la page. */
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
  // Sans ce test, un détecteur qui n'écoute rien rendrait vertes toutes les
  // vérifications ci-dessous en n'ayant rien vu.
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
      // Le panneau mobile, la palette de recherche et le bandeau de cookies
      // montent à l'interaction : leurs espaces viennent de la même liste, et
      // la liste se dérive de TOUS les composants client, montés ou non.
      expect(vues, `${locale}${route} : clés absentes`).toEqual([]);
    });
  }
}

test('le HTML public ne porte plus le catalogue du back-office', async ({
  request,
}) => {
  const html = await (await request.get('/fr/a-propos')).text();
  // Présent : un espace que des composants client de cette page demandent.
  expect(html, 'le catalogue client doit rester servi').toContain(
    "C'est noté. Nous vous écrirons avant l'événement.",
  );
  // Absent : le back-office, 10 Ko pour des écrans derrière authentification.
  expect(html, 'le catalogue admin ne doit plus partir').not.toContain(
    "Cet espace est réservé à l'équipe de modération.",
  );
});

test('le back-office, lui, garde ses messages', async ({ request }) => {
  // Contre-épreuve du test précédent : le retrait ne vaut que s'il n'a rien
  // cassé là où l'espace est nécessaire. `/fr/admin` redirige un visiteur
  // anonyme vers la connexion (307 serveur, cf. M-4) ; ce qu'on vérifie ici
  // est donc la REDIRECTION, pas la page — la preuve que le back-office rend
  // ses libellés est dans la suite E2E du dépôt, qui s'y connecte.
  const res = await request.get('/fr/admin', { maxRedirects: 0 });
  expect([307, 302]).toContain(res.status());
  expect(res.headers()['location'] ?? '').toContain('/fr/connexion');
});
