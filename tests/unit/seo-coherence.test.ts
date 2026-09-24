import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Les deux listes sont LUES dans le source plutôt qu'importées : `sitemap.ts`
// tire le client Sanity et l'API Convex, que ce test n'a aucune raison de
// monter. Le prix à payer est une analyse textuelle — d'où l'assertion de
// garde ci-dessous, sans laquelle une expression régulière qui cesserait de
// correspondre rendrait ce fichier silencieusement vide, donc inutile.
function arrayLiteral(file: string, name: string): string[] {
  const src = readFileSync(join(process.cwd(), 'src', 'app', file), 'utf8');
  const m = new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(src);
  if (!m) throw new Error(`${name} introuvable dans ${file}`);
  return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
}

const STATIC_PATHS = arrayLiteral('sitemap.ts', 'STATIC_PATHS');
const PRIVATE = arrayLiteral('robots.ts', 'PRIVATE');

// F-04 — la cohérence entre ce que le SITE déclare et ce que chaque PAGE
// déclare.
//
// Trois écritures parlent des mêmes adresses : `sitemap.ts` (ce qu'on propose
// à l'indexation), `robots.ts` (ce qu'on interdit au crawl) et le
// `generateMetadata` de chaque page (canonical, hreflang, robots). L'en-tête
// du sitemap affirme d'ailleurs que ses alternates sont « cohérents avec les
// canonicals posés par les generateMetadata ».
//
// Ils ne l'étaient pas : `/contact` et `/don` figuraient dans le sitemap, avec
// leurs alternates, alors que les pages n'annonçaient NI canonical NI
// hreflang — parce que toutes deux sont servies par un composant client, qui
// ne peut pas exporter `generateMetadata`. Une conséquence, pas un oubli, et
// donc exactement le genre de chose qu'aucune relecture ne rattrape.
//
// Ce test lit le code source, comme `i18n-keys.test.ts` et `reveal-nojs.test.ts`.

const APP = join(process.cwd(), 'src', 'app', '[locale]');

describe('Les listes lues dans le source ne sont pas vides', () => {
  // Sans cette garde, une régression de lecture désarmerait tous les tests
  // ci-dessous sans faire rougir quoi que ce soit.
  it('le sitemap déclare un nombre plausible de pages statiques', () => {
    expect(STATIC_PATHS.length).toBeGreaterThan(15);
  });
  it('robots.txt déclare des zones privées', () => {
    // Un seuil numérique se serait tu le jour où la liste rétrécit pour une
    // bonne raison — c'est arrivé le 23/09, quand les trois tunnels
    // d'authentification en sont sortis. On vérifie donc ce qui doit y être.
    expect(PRIVATE).toContain('admin');
    expect(PRIVATE).toContain('espace-membre');
  });
});

/**
 * Routes (relatives à `[locale]`) dont les métadonnées annoncent `index: false`.
 * Parcourt deux niveaux : `connexion`, `newsletter/desinscription`… — ce qui
 * couvre toutes les routes du dépôt qui portent un `generateMetadata`.
 */
function routesDeclarantNoindex(): string[] {
  const trouvees: string[] = [];
  const visiter = (rel: string) => {
    if (/index:\s*false/.test(metadataSources(rel))) trouvees.push(rel);
  };
  for (const e of readdirSync(APP, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name.startsWith('[')) continue;
    visiter(e.name);
    for (const f of readdirSync(join(APP, e.name), { withFileTypes: true })) {
      if (f.isDirectory() && !f.name.startsWith('[')) {
        visiter(`${e.name}/${f.name}`);
      }
    }
  }
  return trouvees.sort();
}

/** Le texte des fichiers qui peuvent porter les métadonnées d'une route. */
function metadataSources(path: string): string {
  const dir = path ? join(APP, ...path.split('/')) : APP;
  return ['page.tsx', 'layout.tsx']
    .map((f) => join(dir, f))
    .filter((f) => existsSync(f))
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
}

describe('Sitemap et robots.txt ne se contredisent pas', () => {
  it('aucune adresse interdite au crawl n’est proposée à l’indexation', () => {
    const fautives = STATIC_PATHS.filter((p) =>
      PRIVATE.some((priv) => p === priv || p.startsWith(`${priv}/`)),
    );
    expect(
      fautives,
      `Ces chemins sont dans le sitemap ET interdits dans robots.txt : ${fautives.join(', ')}`,
    ).toEqual([]);
  });
});

describe('Toute page du sitemap annonce son adresse canonique', () => {
  // Le sitemap déclare des alternates pour chaque page qu'il liste. Une page
  // qui n'annonce pas de canonical laisse le moteur arbitrer seul entre /fr et
  // /en — c'est précisément ce que les alternates servent à éviter.
  const manquantes = STATIC_PATHS.filter(
    (p) => !/alternates\s*:/.test(metadataSources(p)),
  );

  it('aucune page listée ne se tait sur son canonical', () => {
    expect(
      manquantes,
      `Sans canonical alors qu'elles sont dans le sitemap : ${manquantes.join(', ') || '—'}`,
    ).toEqual([]);
  });

  it.each(STATIC_PATHS)('%s déclare des alternates', (p) => {
    expect(metadataSources(p)).toMatch(/alternates\s*:/);
  });
});

describe('Une page en noindex ne déclare pas de hreflang (issue #35)', () => {
  // L'arbitrage du dépôt, documenté dans `recherche/page.tsx` et tenu par
  // `tests/e2e/seo.spec.ts` : sur une page en `noindex`, un moteur ignore le
  // hreflang — l'ajouter ne serait que du bruit. Ce test étend la règle à
  // toute page qui se déclarerait `noindex` plus tard.
  const ROUTES = ['recherche', 'newsletter/desinscription'];

  it.each(ROUTES)('%s : noindex, et aucun hreflang', (route) => {
    const src = metadataSources(route);
    expect(src, `${route} : robots.index attendu à false`).toMatch(
      /index:\s*false/,
    );
    expect(src, `${route} : hreflang inutile sur une page noindex`).not.toMatch(
      /languages\s*:/,
    );
  });
});

describe('« Interdit au crawl » et « noindex » ne se cumulent pas', () => {
  // ARBITRAGE DU 23/09, et la raison pour laquelle il fallait le trancher :
  // les deux mesures se neutralisent. Un moteur qui respecte le `Disallow` de
  // `robots.txt` ne vient JAMAIS lire le `noindex` de la page — la seconde
  // ceinture ne protège donc rien, elle documente une intention. Les trois
  // tunnels d'authentification portaient les deux ; ils ne gardent que le
  // `noindex`, qui est la mesure effective.
  //
  // Ce test interdit de les recombiner, dans un sens comme dans l'autre :
  // une route qui annonce `index: false` ne doit pas être interdite au crawl,
  // sans quoi son annonce ne sera lue par personne.
  const routesNoindex = routesDeclarantNoindex();

  it('au moins une route se déclare noindex (sinon ce test est vide)', () => {
    expect(routesNoindex.length).toBeGreaterThan(0);
  });

  it.each(routesNoindex)('%s : noindex, donc pas de Disallow', (route) => {
    const interdite = PRIVATE.some(
      (priv) => route === priv || route.startsWith(`${priv}/`),
    );
    expect(
      interdite,
      `${route} annonce « noindex » ET figure dans robots.txt : ` +
        `le moteur ne viendra pas lire l'annonce.`,
    ).toBe(false);
  });
});
