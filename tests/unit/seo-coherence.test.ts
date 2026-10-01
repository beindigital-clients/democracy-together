import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Both lists are READ from the source rather than imported: `sitemap.ts`
// pulls in the Convex API and the content loaders, which this test has no
// reason to mount. The price to pay is a textual analysis — hence the guard
// assertion below, without which a regular expression that stopped
// matching would make this file silently empty, hence useless.
function arrayLiteral(file: string, name: string): string[] {
  const src = readFileSync(join(process.cwd(), 'src', 'app', file), 'utf8');
  const m = new RegExp(`const ${name} = \\[([^\\]]*)\\]`).exec(src);
  if (!m) throw new Error(`${name} introuvable dans ${file}`);
  return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
}

const STATIC_PATHS = arrayLiteral('sitemap.ts', 'STATIC_PATHS');
const PRIVATE = arrayLiteral('robots.ts', 'PRIVATE');

// F-04 — consistency between what the SITE declares and what each PAGE
// declares.
//
// Three writings talk about the same addresses: `sitemap.ts` (what we offer
// for indexing), `robots.ts` (what we forbid from crawling) and each page's
// `generateMetadata` (canonical, hreflang, robots). The sitemap header
// even claims its alternates are "consistent with the
// canonicals set by the generateMetadata functions".
//
// They were not: `/contact` and `/don` were in the sitemap, with
// their alternates, while the pages announced NEITHER canonical NOR
// hreflang — because both are served by a client component, which
// cannot export `generateMetadata`. A consequence, not an oversight, and
// therefore exactly the kind of thing no review catches.
//
// This test reads the source code, like `i18n-keys.test.ts` and `reveal-nojs.test.ts`.

const APP = join(process.cwd(), 'src', 'app', '[locale]');

describe('Les listes lues dans le source ne sont pas vides', () => {
  // Without this guard, a parsing regression would disarm all the tests
  // below without turning anything red.
  it('le sitemap déclare un nombre plausible de pages statiques', () => {
    expect(STATIC_PATHS.length).toBeGreaterThan(15);
  });
  it('robots.txt déclare des zones privées', () => {
    // A numeric threshold would have stayed silent the day the list shrank for a
    // good reason — it happened on 23/09, when the three authentication
    // flows were removed from it. So we check what must be in it.
    expect(PRIVATE).toContain('admin');
    expect(PRIVATE).toContain('espace-membre');
  });
});

/**
 * Routes (relative to `[locale]`) whose metadata announce `index: false`.
 * Walks two levels: `connexion`, `newsletter/desinscription`… — which
 * covers every route in the repo carrying a `generateMetadata`.
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

/** The text of the files that may carry a route's metadata. */
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
  // The sitemap declares alternates for each page it lists. A page
  // that announces no canonical leaves the search engine to arbitrate alone between /fr and
  // /en — which is precisely what alternates are meant to avoid.
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
  // The repo's decision, documented in `recherche/page.tsx` and upheld by
  // `tests/e2e/seo.spec.ts`: on a `noindex` page, a search engine ignores
  // hreflang — adding it would just be noise. This test extends the rule to
  // any page that declares itself `noindex` later.
  const ROUTES = [
    'recherche',
    'newsletter/desinscription',
    // Diffusion workstream: same decision for the double opt-in link.
    'newsletter/confirmation',
  ];

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
  // DECISION OF 23/09, and the reason it had to be settled:
  // the two measures cancel each other out. A search engine that respects `robots.txt`'s
  // `Disallow` NEVER comes to read the page's `noindex` — the second
  // belt therefore protects nothing, it documents an intention. The three
  // authentication flows carried both; they keep only the
  // `noindex`, which is the effective measure.
  //
  // This test forbids recombining them, in either direction:
  // a route that announces `index: false` must not be disallowed from crawling,
  // otherwise its announcement will be read by nobody.
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
