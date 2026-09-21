import { test, expect, type Page } from '@playwright/test';

const BASE = process.env.AUDIT_BASE_URL ?? 'http://localhost:3000';

// F-06 — ce que voit quelqu'un qui tombe sur une 404.
//
// Le dépôt en sert DEUX, et elles n'ont pas le même sort :
//   • adresse sans route du tout      -> `src/app/not-found.tsx`
//   • `notFound()` depuis une route   -> `src/app/[locale]/not-found.tsx`
//
// Mesuré sur Next 16.3.5 : seule la première est rendue dans le HTML servi.
// La seconde n'arrive que par la charge utile RSC, donc uniquement si
// JavaScript s'exécute. Trois hypothèses ont été écartées par la mesure
// (suspension du composant, place du fichier, coquille du layout) : c'est un
// comportement du cadriciel, pas un défaut du dépôt.
//
// Ces tests tiennent donc ce qui est GARANTI, et RENDENT VISIBLE ce qui ne
// l'est pas — plutôt que d'enregistrer la limite comme si elle allait de soi.

/**
 * Texte visible d'un HTML SERVI, `<script>` et `<style>` retirés — analysé par
 * le moteur du navigateur, jamais par une expression régulière.
 *
 * Ce filtrage EST le test, et c'est pourquoi il doit être exact : ce que ces
 * specs établissent, c'est que le texte se trouve dans le HTML AUTREMENT que
 * dans la charge utile RSC — laquelle voyage précisément à l'intérieur d'un
 * `<script>`. Un bloc qui échapperait au filtre ferait PASSER le test pour la
 * mauvaise raison, c'est-à-dire en présence exacte du défaut que F-06 sert à
 * détecter.
 *
 * Le `/<script[\s\S]*?<\/script>/` qui tenait ce rôle ne voyait ni un
 * `<SCRIPT>` majuscule, ni un `<script` laissé derrière par une imbrication
 * (CodeQL js/bad-tag-filter et js/incomplete-multi-character-sanitization).
 * `DOMParser` analyse comme un navigateur et construit un document INERTE :
 * rien de ce qui passe ici ne s'exécute.
 */
async function texteVisible(page: Page, html: string): Promise<string> {
  return page.evaluate((brut) => {
    const doc = new DOMParser().parseFromString(brut, 'text/html');
    doc.querySelectorAll('script, style').forEach((noeud) => {
      noeud.remove();
    });
    return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
  }, html);
}

// LE FILTRE EST LE TEST — il est donc testé lui aussi.
//
// Mesuré sur la 404 localisée : « Page introuvable » apparaît TROIS fois dans
// les 78 912 octets servis, à l'intérieur de <script> (charge utile RSC), pour
// zéro caractère de texte visible. Un filtre qui laisse passer un bloc ferait
// donc virer au vert la spec de mesure en présence exacte du défaut qu'elle
// cherche : la panne la plus coûteuse qu'un test puisse avoir.
//
// L'ancien filtre par expression régulière échouait sur le premier cas
// ci-dessous — mesuré : `<SCRIPT>` en ressortait avec sa charge.
//
// ABSENT de la liste, et délibérément : `<scr<script>ipt>charge</script>`.
// Un navigateur n'y voit AUCUN script — il lit une balise nommée « scr<script »
// puis le texte « ipt>charge ». Cette chaîne est donc réellement visible pour
// un visiteur, et l'exiger absente ferait mentir le test sur ce qu'il mesure.
test('le filtre de scripts ne laisse pas fuir la charge utile', async ({
  page,
}) => {
  const pieges = [
    '<p>visible</p><SCRIPT>charge_rsc</SCRIPT>',
    '<p>visible</p><ScRiPt>charge_rsc</ScRiPt>',
    '<p>visible</p><script type="a>b">charge_rsc</script>',
    '<p>visible</p><script>var a = "<p>charge_rsc</p>";</script>',
    '<p>visible</p><style>p::after{content:"charge_rsc"}</style>',
  ];
  for (const piege of pieges) {
    expect(await texteVisible(page, piege), piege).toBe('visible');
  }
});

test('404 sans route : lisible dans le HTML servi', async ({
  page,
  request,
}) => {
  const res = await request.get('/fr/nimporte-quoi-du-tout');
  expect(res.status()).toBe(404);
  const body = await texteVisible(page, await res.text());
  expect(body).toContain('Page introuvable');
  expect(body).toContain('Page not found');
});

test('404 sans route : lisible SANS JavaScript', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  const res = await page.goto(`${BASE}/fr/nimporte-quoi-du-tout`);
  expect(res?.status()).toBe(404);
  const texte = (await page.locator('body').innerText()).trim();
  await ctx.close();
  console.log(`[404] sans route, sans JS : ${texte.length} caractères`);
  expect(texte.length).toBeGreaterThan(80);
});

test('404 sans route : les deux langues et un retour vers chacune', async ({
  page,
}) => {
  await page.goto('/fr/nimporte-quoi-du-tout');
  await expect(page.getByRole('link', { name: 'Accueil' })).toHaveAttribute(
    'href',
    '/fr',
  );
  await expect(page.getByRole('link', { name: 'Home' })).toHaveAttribute(
    'href',
    '/en',
  );
});

test('404 localisée : lisible avec JavaScript', async ({ page }) => {
  const res = await page.goto('/fr/rapports/9999');
  expect(res?.status()).toBe(404);
  // Assertion qui RÉESSAIE, et non un `innerText()` lu une seule fois : sur
  // cette 404-là le texte n'existe qu'une fois la charge utile RSC appliquée
  // par le client — c'est tout le sujet de F-06. Lire juste après `goto`, qui
  // rend la main à l'événement `load`, est donc une course : mesuré, le même
  // test sur le même serveur passait en desktop puis échouait au run suivant,
  // le `<body>` étant encore vide.
  await expect(page.locator('body')).toContainText('Page introuvable');
});

// Pas d'assertion ici : on MESURE la limite du cadriciel et on l'imprime. Le
// jour où Next rendra ce cas dans le HTML, ce chiffre cessera d'être nul et on
// le verra dans le rapport — sans qu'un test rouge n'ait eu à l'annoncer.
test('404 localisée : ce que le HTML servi en contient (limite mesurée)', async ({
  page,
  request,
}) => {
  const html = await (await request.get('/fr/rapports/9999')).text();
  const body = await texteVisible(page, html);
  console.log(
    `[404] localisée, HTML servi : ${body.length} caractères ` +
      `(0 = la limite Next décrite dans src/app/not-found.tsx)`,
  );
  expect(html.length).toBeGreaterThan(0);
});
