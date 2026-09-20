import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test, expect, devices, type Page } from '@playwright/test';
import { SESSIONS } from './_sessions';

// ─── Niveau « dev-browser » — issue #50 ──────────────────────────────────────
//
// CE QUE CE FICHIER EST. Un OUTIL D'INSPECTION, pas une porte. Il produit le
// rendu réel de l'application dans toutes les combinaisons que `TESTING.md`
// exige — clair/sombre × desktop/mobile × nominal/vide/erreur/connecté — et
// les rassemble dans une planche-contact (`screenshots/index.html`) faite pour
// être PARCOURUE DES YEUX. Aucune image n'est comparée à une référence : la
// décision est documentée dans `TESTING.md` § Dev-browser, avec ses raisons.
//
// POURQUOI IL EXISTE. Deux régressions rédhibitoires de la PR #4 n'ont été
// vues que par une inspection navigateur, jamais par les tests :
//   1. contenu animé bloqué à `opacity: 0` sans JavaScript — mentions légales
//      entièrement blanches, accueil réduit à son en-tête ;
//   2. un `loading.tsx` de segment bloquant TOUTES les pages sur « Chargement… ».
// Les deux sont des pages qui répondent 200, avec le bon HTML, et que l'œil
// seul voit vides. D'où les deux assertions ci-dessous : elles ne comparent
// aucun pixel, mais elles refusent de photographier une page vide. C'est la
// part de ce niveau qu'une machine peut tenir ; le reste (la mise en page, les
// contrastes, ce qui déborde) se regarde.
//
// CE QUI N'EST PAS COUVERT ICI. Le contraste automatisable est déjà tenu par
// `a11y.spec.ts` (axe), et le rendu sans JavaScript par
// `tests/unit/reveal-nojs.test.ts`. Ce fichier ne les rejoue pas.
//
// LANCEMENT : `pnpm test:dev-browser` (le script vide `screenshots/` d'abord,
// pour que la planche montre UNE exécution et pas la sédimentation de
// plusieurs). Le dossier est ignoré par git.

const OUT = 'screenshots';

// Rideau de `AuthGate` et ancien symptôme du `loading.tsx` fautif : tant qu'il
// est là, la page n'est pas celle qu'on veut photographier.
const LOADING = 'Chargement…';

const THEMES = [
  { nom: 'clair', valeur: 'light' },
  { nom: 'sombre', valeur: 'dark' },
] as const;

// `devices[...]` porte aussi `defaultBrowserType`, qui est une option de
// WORKER : Playwright refuse de la voir dans un `test.use` de bloc (« forces a
// new worker »). On ne retient donc que l'émulation proprement dite — celle qui
// se règle par contexte. Le typage des tests ne l'attrape pas, c'est un refus à
// l'exécution : d'où ce filtrage explicite plutôt qu'un `...devices[...]`.
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
  // Mêmes émulations que les deux projets de `playwright.config.ts`, pour que
  // ce qui est photographié soit ce qui est testé ailleurs.
  { nom: 'desktop', device: emulation(devices['Desktop Chrome']) },
  { nom: 'mobile', device: emulation(devices['Pixel 7']) },
] as const;

type Etat = 'nominal' | 'vide' | 'erreur' | 'connecte';

type Capture = {
  id: string;
  chemin: string;
  etat: Etat;
  // Ce que l'œil doit vérifier sur cette capture : reporté dans la
  // planche-contact, sous l'image. Sans cette phrase, une planche de quarante
  // images est un dossier d'images.
  regarder: string;
};

// ─── LA MATRICE ──────────────────────────────────────────────────────────────
// Explicite et close, à dessein : `TESTING.md` décrivait les combinaisons en
// prose, ce qui n'a jamais permis à personne de savoir si une feature UI avait
// été vérifiée « partout ». La liste est ici, elle se lit et elle se complète.
//
// Les routes ne sont pas un échantillon au hasard : chacune apporte une famille
// de mise en page que les autres n'ont pas.

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
    // État VIDE déterministe et atteignable par URL : le terme ne rencontre
    // rien, quel que soit le jeu de données. Cf. `search.spec.ts`.
    id: 'recherche-sans-resultat',
    chemin: '/fr/recherche?q=zzzxqkw',
    etat: 'vide',
    regarder:
      'Message « Aucun résultat » : il doit rester lisible et centré, pas une page qui a l’air cassée.',
  },
  {
    // État ERREUR. L'URL n'est pas prise au hasard : une adresse qui ne
    // correspond à AUCUNE route (`/fr/nimporte-quoi`) sert la 404 par défaut de
    // Next, en anglais et hors charte — ce n'est pas `[locale]/not-found.tsx`.
    // Celle-ci ne s'affiche que sur un `notFound()` appelé DEPUIS le segment,
    // d'où un slug inconnu sur une route existante. `thematiques` est choisie
    // parce que sa 404 ne dépend d'aucun service externe.
    id: '404-localisee',
    chemin: '/fr/thematiques/inexistant',
    etat: 'erreur',
    regarder:
      'La 404 garde en-tête, pied de page et charte (elle est rendue dans le layout de la locale). Une 404 nue et anglaise signalerait que le not-found localisé ne prend plus.',
  },
];

// État CONNECTÉ. Rang administrateur : les gardes du back-office sont
// hiérarchiques, un seul compte couvre les deux écrans (cf. `_sessions.ts`).
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

// ─── Mécanique ───────────────────────────────────────────────────────────────

// Chemin relatif au dossier de sortie. Ordre des composants choisi pour que le
// tri alphabétique place les deux thèmes d'une même page CÔTE À CÔTE — c'est
// la comparaison qu'on vient faire.
function fichier(c: Capture, viewport: string, theme: string): string {
  return join(c.etat, `${c.id}__${viewport}__${theme}.png`);
}

// Les `Reveal` (framer-motion) démarrent à opacity:0 et ne s'animent qu'une
// fois entrés dans le viewport : une capture pleine page prise sans parcourir
// la page montrerait tout ce qui est sous la ligne de flottaison encore
// invisible. Même intention que `a11y.spec.ts`, avec deux corrections que la
// capture, elle, rend visibles.
async function toutRevelier(page: Page): Promise<void> {
  await page.evaluate(async () => {
    // PAS D'UNE DEMI-HAUTEUR, pas d'une hauteur pleine : les `Reveal` se
    // déclenchent à `viewport: { margin: '-80px' }`, donc 80 px À L'INTÉRIEUR
    // du cadre. Deux positions espacées d'une hauteur pleine laissent entre
    // elles une bande que rien ne déclenche jamais. Mesuré sur les mentions
    // légales en 1280×720 : la section « Directeur de la publication »
    // (682-771 px) restait à opacity:0, trop basse à y=0, déjà remontée à
    // y=720. Des fenêtres qui se recouvrent ferment cette bande.
    const pas = Math.max(200, Math.floor(window.innerHeight / 2));
    // `scrollHeight` est RELU à chaque tour : la page s'allonge à mesure que
    // les sections reprennent leur place, et une hauteur relevée une fois pour
    // toutes arrêterait le parcours avant le bas.
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

// Compte les éléments animés qui OCCUPENT DE LA PLACE dans la mise en page et
// sont pourtant encore transparents. Un élément dans un conteneur `display:none`
// a un rectangle nul : il n'est pas compté, il n'est pas censé se voir.
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
  // Le thème est appliqué avant peinture par le script inline du layout, qui
  // lit `localStorage`. On écrit donc la préférence AVANT la navigation, par le
  // même canal que la bascule de l'interface — pas en forçant l'attribut, ce
  // qui court-circuiterait justement ce qu'on veut voir fonctionner.
  // Le consentement cookies est reposé ici parce que les états CONNECTÉS
  // remplacent le `storageState` global qui le portait : sans cela, le bandeau
  // F-09 s'inviterait sur une capture sur deux.
  await page.addInitScript((valeur: string) => {
    try {
      localStorage.setItem('dt-theme', valeur);
      localStorage.setItem('dt-cookie-consent', 'essential');
    } catch {
      /* origine opaque (about:blank) : sans objet */
    }
  }, theme.valeur);

  await page.goto(c.chemin);

  // Toutes les routes de la matrice sont rendues DANS le layout de la locale,
  // donc dans son `<main>` — la 404 localisée comprise. On exige le landmark :
  // une page qui le perdrait a changé de nature, et la capture doit le dire.
  // (Une adresse ne correspondant à aucune route, elle, sort du layout et sert
  // la 404 par défaut de Next : ce n'est pas ce que cette matrice photographie,
  // cf. le commentaire de la capture « erreur ».)
  const zone = page.locator('main');
  await expect(zone).toBeVisible();

  // ASSERTION 1 — le rideau est levé. C'est le défaut `loading.tsx` (toutes les
  // pages bloquées sur « Chargement… »), et le temps d'établissement de la
  // session pour les écrans connectés.
  await expect(zone.getByText(LOADING, { exact: true })).toHaveCount(0, {
    timeout: 20_000,
  });

  await toutRevelier(page);

  // ASSERTION 2 — rien d'animé n'est resté transparent. C'est le défaut
  // opacity:0, celui qui rendait les mentions légales entièrement blanches.
  // `expect.poll` plutôt qu'un relevé unique : une animation encore en vol ne
  // doit pas faire échouer une vérification qui porte sur son état final.
  await expect.poll(() => revealsBloques(page), { timeout: 5_000 }).toBe(0);

  // ASSERTION 3 — la page dit quelque chose. Une zone vide se photographie sans
  // bruit ; la capture, elle, ne se plaint jamais.
  expect((await zone.innerText()).trim().length).toBeGreaterThan(40);

  const cible = join(OUT, fichier(c, viewport, theme.nom));
  mkdirSync(dirname(cible), { recursive: true });
  await page.screenshot({
    path: cible,
    fullPage: true,
    animations: 'disabled',
  });
}

// ─── Les cas ─────────────────────────────────────────────────────────────────

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

// ─── La planche-contact ──────────────────────────────────────────────────────
// Sans elle, ce fichier produit quarante PNG dans un dossier, et la
// « vérif dev-browser » revient à ouvrir quarante fichiers à la main —
// c'est-à-dire à ne pas la faire. La planche met les deux thèmes d'une même
// page côte à côte, ce qui est le geste qu'on vient faire.
//
// Construite depuis la MATRICE, filtrée par ce qui existe réellement sur
// disque : une exécution filtrée (`-g`, `--project`) produit une planche
// partielle plutôt qu'une planche menteuse.

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
  // Le chemin dans le log : c'est là que la vérification commence.
  console.log(`\nPlanche-contact : ${join(OUT, 'index.html')}\n`);
});
