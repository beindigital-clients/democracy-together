import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test, expect, devices, type Page } from '@playwright/test';
import { SESSIONS } from './_sessions';

// ─── "dev-browser" level — issue #50 ─────────────────────────────────────────
//
// WHAT THIS FILE IS. An INSPECTION TOOL, not a gate. It produces the
// real rendering of the application in every combination `TESTING.md`
// requires — light/dark × desktop/mobile × nominal/empty/error/signed-in — and
// gathers them in a contact sheet (`screenshots/index.html`) made to be
// BROWSED BY EYE. No image is compared to a reference: the
// decision is documented in `TESTING.md` § Dev-browser, with its reasons.
//
// WHY IT EXISTS. Two show-stopping regressions in PR #4 were only
// seen through a browser inspection, never by the tests:
//   1. animated content stuck at `opacity: 0` without JavaScript — legal notice
//      entirely blank, home page reduced to its header;
//   2. a segment `loading.tsx` blocking ALL pages on "Chargement…".
// Both are pages that respond 200, with the right HTML, and that only the eye
// sees as empty. Hence the two assertions below: they compare
// no pixels, but they refuse to photograph an empty page. That is the
// part of this level a machine can hold; the rest (layout,
// contrast, what overflows) is looked at.
//
// WHAT IS NOT COVERED HERE. Automatable contrast is already held by
// `a11y.spec.ts` (axe), and rendering without JavaScript by
// `tests/unit/reveal-nojs.test.ts`. This file does not replay them.
//
// RUNNING: `pnpm test:dev-browser` (the script empties `screenshots/` first,
// so that the sheet shows ONE run and not the sediment of
// several). The folder is ignored by git.

const OUT = 'screenshots';

// `AuthGate` curtain and old symptom of the faulty `loading.tsx`: while it
// is there, the page is not the one we want to photograph.
const LOADING = 'Chargement…';

const THEMES = [
  { nom: 'clair', valeur: 'light' },
  { nom: 'sombre', valeur: 'dark' },
] as const;

// `devices[...]` also carries `defaultBrowserType`, which is a WORKER
// option: Playwright refuses to see it in a block-level `test.use` ("forces a
// new worker"). We therefore keep only the emulation proper — the part that
// is set per context. Test typing does not catch it, it is a refusal at
// runtime: hence this explicit filtering rather than a `...devices[...]`.
function emulation(d: (typeof devices)[string]) {
  return {
    viewport: d.viewport,
    userAgent: d.userAgent,
    deviceScaleFactor: d.deviceScaleFactor,
    isMobile: d.isMobile,
    hasTouch: d.hasTouch,
  };
}

const VIEWPORTS = [
  // Same emulations as the two projects in `playwright.config.ts`, so that
  // what is photographed is what is tested elsewhere.
  { nom: 'desktop', device: emulation(devices['Desktop Chrome']) },
  { nom: 'mobile', device: emulation(devices['Pixel 7']) },
] as const;

type Etat = 'nominal' | 'vide' | 'erreur' | 'connecte';

type Capture = {
  id: string;
  chemin: string;
  etat: Etat;
  // What the eye must check on this capture: carried over into the
  // contact sheet, under the image. Without this sentence, a sheet of forty
  // images is a folder of images.
  regarder: string;
};

// ─── THE MATRIX ──────────────────────────────────────────────────────────────
// Explicit and closed, on purpose: `TESTING.md` described the combinations in
// prose, which never let anyone know whether a UI feature had
// been checked "everywhere". The list is here, it can be read and it can be completed.
//
// The routes are not a random sample: each one brings a family
// of layout that the others do not have.

const PUBLIQUES: Capture[] = [
  {
    id: 'accueil',
    chemin: '/fr',
    etat: 'nominal',
    regarder:
      'Hero, sections animées, globe. La page réduite à son seul en-tête est le symptôme du défaut opacity:0.',
  },
  {
    id: 'bibliotheque',
    chemin: '/fr/bibliotheque',
    etat: 'nominal',
    regarder:
      'Liste de cartes issues de Convex : images, filtres, grille qui retombe en une colonne sur mobile.',
  },
  {
    id: 'mentions-legales',
    chemin: '/fr/mentions-legales',
    etat: 'nominal',
    regarder:
      'Page de texte long. C’est CELLE-CI qui était entièrement blanche avant aea9b24.',
  },
  {
    id: 'adhesion',
    chemin: '/fr/adhesion',
    etat: 'nominal',
    regarder:
      'Formulaire au repos : libellés, aides, bouton. Les champs en erreur se regardent sur la capture « erreur ».',
  },
  {
    id: 'barometre',
    chemin: '/fr/barometre',
    etat: 'nominal',
    regarder:
      'Data-viz. Les couleurs bar-1..bar-4 sont les plus sensibles à la bascule de thème.',
  },
  {
    id: 'jeunes',
    chemin: '/fr/jeunes',
    etat: 'nominal',
    regarder:
      'Univers safran (data-universe="jeunes"). En sombre, c’est la seule route qui exerce la règle [data-theme=dark][data-universe=jeunes].',
  },
  {
    // Deterministic EMPTY state reachable by URL: the term matches
    // nothing, whatever the dataset. See `search.spec.ts`.
    id: 'recherche-sans-resultat',
    chemin: '/fr/recherche?q=zzzxqkw',
    etat: 'vide',
    regarder:
      'Message « Aucun résultat » : il doit rester lisible et centré, pas une page qui a l’air cassée.',
  },
  {
    // ERROR state. The URL is not picked at random: an address that
    // matches NO route (`/fr/nimporte-quoi`) serves Next's default 404,
    // in English and off-brand — it is not `[locale]/not-found.tsx`.
    // The latter only shows on a `notFound()` called FROM the segment,
    // hence an unknown slug on an existing route. `thematiques` is chosen
    // because its 404 depends on no external service.
    id: '404-localisee',
    chemin: '/fr/thematiques/inexistant',
    etat: 'erreur',
    regarder:
      'La 404 garde en-tête, pied de page et charte (elle est rendue dans le layout de la locale). Une 404 nue et anglaise signalerait que le not-found localisé ne prend plus.',
  },
];

// SIGNED-IN state. Administrator rank: the back-office guards are
// hierarchical, a single account covers both screens (see `_sessions.ts`).
const CONNECTEES: Capture[] = [
  {
    id: 'espace-membre',
    chemin: '/fr/espace-membre',
    etat: 'connecte',
    regarder:
      'Tableau « Mes contributions » et pastilles de statut : ce sont des couleurs posées en color-mix, à revoir en sombre.',
  },
  {
    id: 'admin',
    chemin: '/fr/admin',
    etat: 'connecte',
    regarder:
      'Coquille du back-office : navigation latérale sur desktop, repliée sur mobile.',
  },
];

const TOUTES = [...PUBLIQUES, ...CONNECTEES];

// ─── Mechanics ───────────────────────────────────────────────────────────────

// Path relative to the output folder. Component order chosen so that
// alphabetical sorting puts the two themes of the same page SIDE BY SIDE — that is
// the comparison we come to make.
function fichier(c: Capture, viewport: string, theme: string): string {
  return join(c.etat, `${c.id}__${viewport}__${theme}.png`);
}

// The `Reveal`s (framer-motion) start at opacity:0 and only animate once
// they enter the viewport: a full-page capture taken without scrolling through
// the page would show everything below the fold still
// invisible. Same intent as `a11y.spec.ts`, with two corrections that the
// capture, for its part, makes visible.
async function toutRevelier(page: Page): Promise<void> {
  await page.evaluate(async () => {
    // STEP OF HALF A HEIGHT, not a full height: the `Reveal`s
    // trigger at `viewport: { margin: '-80px' }`, hence 80 px INSIDE
    // the frame. Two positions a full height apart leave between
    // them a band that nothing ever triggers. Measured on the legal
    // notice at 1280×720: the "Directeur de la publication" section
    // (682-771 px) stayed at opacity:0, too low at y=0, already scrolled up at
    // y=720. Overlapping windows close that band.
    const pas = Math.max(200, Math.floor(window.innerHeight / 2));
    // `scrollHeight` is RE-READ on every iteration: the page grows as
    // the sections settle into place, and a height read once and for
    // all would stop the scroll before the bottom.
    let y = 0;
    for (let garde = 0; garde < 400; garde++) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 90));
      if (y >= document.body.scrollHeight) break;
      y += pas;
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(900);
}

// Counts the animated elements that TAKE UP SPACE in the layout and
// are nevertheless still transparent. An element inside a `display:none` container
// has a zero rectangle: it is not counted, it is not meant to be seen.
function revealsBloques(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      [...document.querySelectorAll('[data-reveal]')].filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.height === 0 || r.width === 0) return false;
        return Number(getComputedStyle(el).opacity) < 0.9;
      }).length,
  );
}

async function capturer(
  page: Page,
  c: Capture,
  viewport: string,
  theme: (typeof THEMES)[number],
): Promise<void> {
  // The theme is applied before paint by the layout's inline script, which
  // reads `localStorage`. So we write the preference BEFORE navigation, through the
  // same channel as the UI toggle — not by forcing the attribute, which
  // would short-circuit precisely what we want to see working.
  // The cookie consent is set again here because the SIGNED-IN states
  // replace the global `storageState` that carried it: without this, the
  // F-09 banner would show up on every other capture.
  await page.addInitScript((valeur: string) => {
    try {
      localStorage.setItem('dt-theme', valeur);
      localStorage.setItem('dt-cookie-consent', 'essential');
    } catch {
      /* origine opaque (about:blank) : sans objet */
    }
  }, theme.valeur);

  await page.goto(c.chemin);

  // All the matrix routes are rendered INSIDE the locale layout,
  // hence in its `<main>` — the localized 404 included. We require the landmark:
  // a page that lost it has changed nature, and the capture must say so.
  // (An address matching no route, on the other hand, leaves the layout and serves
  // Next's default 404: that is not what this matrix photographs,
  // see the comment on the "erreur" capture.)
  const zone = page.locator('main');
  await expect(zone).toBeVisible();

  // ASSERTION 1 — the curtain is lifted. That is the `loading.tsx` defect (all
  // pages stuck on "Chargement…"), and the session setup time
  // for the signed-in screens.
  await expect(zone.getByText(LOADING, { exact: true })).toHaveCount(0, {
    timeout: 20_000,
  });

  await toutRevelier(page);

  // ASSERTION 2 — nothing animated stayed transparent. That is the
  // opacity:0 defect, the one that made the legal notice entirely blank.
  // `expect.poll` rather than a single reading: an animation still in flight must
  // not fail a check that is about its final state.
  await expect.poll(() => revealsBloques(page), { timeout: 5_000 }).toBe(0);

  // ASSERTION 3 — the page says something. An empty area gets photographed without
  // a sound; the capture never complains.
  expect((await zone.innerText()).trim().length).toBeGreaterThan(40);

  const cible = join(OUT, fichier(c, viewport, theme.nom));
  mkdirSync(dirname(cible), { recursive: true });
  await page.screenshot({
    path: cible,
    fullPage: true,
    animations: 'disabled',
  });
}

// ─── The cases ───────────────────────────────────────────────────────────────

for (const viewport of VIEWPORTS) {
  test.describe(viewport.nom, () => {
    test.use({ ...viewport.device, locale: 'fr-FR' });

    for (const c of PUBLIQUES) {
      for (const theme of THEMES) {
        test(`${c.etat} · ${c.id} · ${theme.nom}`, async ({ page }) => {
          await capturer(page, c, viewport.nom, theme);
        });
      }
    }

    test.describe('connecté', () => {
      test.use({ storageState: SESSIONS.devBrowser.state });

      for (const c of CONNECTEES) {
        for (const theme of THEMES) {
          test(`${c.etat} · ${c.id} · ${theme.nom}`, async ({ page }) => {
            await capturer(page, c, viewport.nom, theme);
          });
        }
      }
    });
  });
}

// ─── The contact sheet ───────────────────────────────────────────────────────
// Without it, this file produces forty PNGs in a folder, and the
// "dev-browser check" comes down to opening forty files by hand —
// that is, not doing it. The sheet puts the two themes of the same
// page side by side, which is the gesture we come to make.
//
// Built from the MATRIX, filtered by what actually exists on
// disk: a filtered run (`-g`, `--project`) produces a partial
// sheet rather than a lying one.

test.afterAll(() => {
  const sections: string[] = [];

  for (const c of TOUTES) {
    const vignettes: string[] = [];
    for (const v of VIEWPORTS) {
      for (const theme of THEMES) {
        const rel = fichier(c, v.nom, theme.nom);
        if (!existsSync(join(OUT, rel))) continue;
        vignettes.push(
          `<figure><figcaption>${v.nom} · ${theme.nom}</figcaption>` +
            `<a href="${rel}"><img src="${rel}" loading="lazy" alt=""></a></figure>`,
        );
      }
    }
    if (vignettes.length === 0) continue;
    sections.push(
      `<section><h2>${c.etat} · ${c.id}</h2>` +
        `<p class="url">${c.chemin}</p>` +
        `<p class="regarder">${c.regarder}</p>` +
        `<div class="grid">${vignettes.join('')}</div></section>`,
    );
  }

  if (sections.length === 0) return;

  const html = `<!doctype html>
<html lang="fr">
<meta charset="utf-8">
<title>Dev-browser — ${new Date().toLocaleString('fr-FR')}</title>
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; padding: 2rem; font: 15px/1.5 system-ui, sans-serif; }
  h1 { font-size: 1.4rem; }
  h2 { font-size: 1rem; margin: 0 0 .2rem; }
  .intro { max-width: 70ch; color: GrayText; }
  section { margin: 2.5rem 0; border-top: 1px solid; border-color: color-mix(in srgb, currentColor 20%, transparent); padding-top: 1rem; }
  .url, .regarder { margin: .2rem 0; max-width: 80ch; }
  .url { font-family: ui-monospace, monospace; font-size: .8rem; color: GrayText; }
  .regarder { color: GrayText; }
  .grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); margin-top: 1rem; }
  figure { margin: 0; }
  figcaption { font-size: .75rem; color: GrayText; margin-bottom: .3rem; }
  img { width: 100%; height: auto; border: 1px solid; border-color: color-mix(in srgb, currentColor 25%, transparent); }
</style>
<h1>Dev-browser — planche-contact</h1>
<p class="intro">Rendu réel de l’application, clair/sombre × desktop/mobile, pour les états
nominal, vide, erreur et connecté. Aucune image n’est comparée à une référence :
ces captures se REGARDENT. Ce qui se compare automatiquement est déjà tenu par
<code>pnpm test</code> et <code>pnpm test:e2e</code>.</p>
${sections.join('\n')}
</html>
`;

  writeFileSync(join(OUT, 'index.html'), html, 'utf8');
  // The path in the log: that is where the check begins.
  console.log(`\nPlanche-contact : ${join(OUT, 'index.html')}\n`);
});
