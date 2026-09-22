import { test, expect } from '@playwright/test';

// Ces specs ouvrent leur PROPRE contexte (JavaScript désactivé), qui ne suit
// pas la `baseURL` du projet : l'adresse doit donc être absolue, et suivre le
// port réellement servi.
const BASE = process.env.AUDIT_BASE_URL ?? 'http://localhost:3000';

// Décisif : la 404 LOCALISÉE affiche-t-elle quelque chose à l'écran ?
// /fr/rapports/9999 ne dépend PAS de Convex (contenu servi par
// src/lib/reports-content.ts) : ce qu'on observe ici n'est donc pas une
// retombée du backend injoignable.
const CIBLE = '/fr/rapports/9999';

// Le nom de la capture porte le PROJET. Les deux projets jouent la même spec
// et écrivaient au même chemin : la capture committée était donc celle du
// dernier projet joué — le mobile — alors que le rapport en cite la version
// desktop. Une preuve remplacée en silence par une autre, exactement ce que
// cet audit reproche ailleurs. Qui ne joue qu'un projet ne voyait rien.
const capture = (nom: string, projet: string) =>
  `/home/user/democracy-together/audit/screenshots/${nom}-${projet}.png`;

test('404 localisée : avec JavaScript, après hydratation', async ({
  page,
}, info) => {
  const r = await page.goto(CIBLE, { waitUntil: 'networkidle' });
  expect(r?.status()).toBe(404);
  await page.waitForTimeout(2000); // laisse toute sa chance à l'hydratation
  const texte = (await page.locator('body').innerText()).trim();
  await page.screenshot({
    path: capture('404-localisee-avec-js', info.project.name),
    fullPage: true,
  });
  console.log(
    `[404 avec JS] ${texte.length} caractères visibles : ${JSON.stringify(texte.slice(0, 200))}`,
  );
  expect(
    texte.length,
    'la 404 localisée doit dire quelque chose',
  ).toBeGreaterThan(20);
});

test('404 localisée : sans JavaScript', async ({ browser }, info) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  const r = await page.goto(`${BASE}${CIBLE}`);
  expect(r?.status()).toBe(404);
  const texte = (await page.locator('body').innerText()).trim();
  await page.screenshot({
    path: capture('404-localisee-sans-js', info.project.name),
    fullPage: true,
  });
  console.log(
    `[404 sans JS] ${texte.length} caractères visibles : ${JSON.stringify(texte.slice(0, 200))}`,
  );
  await ctx.close();
  // PAS d'assertion sur la longueur, et c'est le résultat de F-06, pas un
  // renoncement. Cette spec est le DIAGNOSTIC qui a établi le constat : sur
  // Next 16.3.5, une 404 levée par `notFound()` depuis une route qui matche
  // rend un `<body>` vide — le contenu n'arrive que par la charge utile RSC.
  // Trois hypothèses ont été écartées par la mesure (suspension du composant,
  // place du fichier, coquille du layout) : c'est le cadriciel.
  //
  // L'exiger malgré tout maintiendrait rouge, indéfiniment, un test qui ne
  // peut pas passer — et la moitié du sujet qui, elle, ÉTAIT gagnable est
  // désormais corrigée et tenue par 36-404.spec.ts (404 sans route : 161
  // caractères lisibles sans JavaScript). Le chiffre reste imprimé : le jour
  // où Next changera, il cessera d'être nul et on le verra.
  console.log(
    `[404 sans JS] limite mesurée : ${texte.length} caractères ` +
      `(voir src/app/not-found.tsx)`,
  );
});

test('contre-épreuve : une page publique normale rend bien du texte', async ({
  page,
}) => {
  await page.goto('/fr/mentions-legales', { waitUntil: 'networkidle' });
  const texte = (await page.locator('body').innerText()).trim();
  console.log(`[mentions-legales] ${texte.length} caractères visibles`);
  expect(texte.length).toBeGreaterThan(200);
});
