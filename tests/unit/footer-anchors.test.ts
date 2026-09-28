import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Issue #46 — the footer's three "Le réseau" entries pointed to
// bare `/a-propos`. The fix is a CONTRACT BETWEEN TWO FILES: the footer
// promises a fragment, the About page carries it. Nothing in the typing
// links the two — renaming an `id` on one side leaves the other pointing into the
// void, with no compile error and nothing visible in review.
//
// The E2E spec checks the real behavior (scrolling, focus, motion
// preference); this file holds the source contract, which breaks faster
// than it gets noticed.

const RACINE = process.cwd();
const FOOTER = join(RACINE, 'src', 'components', 'layout', 'site-footer.tsx');
const A_PROPOS = join(RACINE, 'src', 'app', '[locale]', 'a-propos', 'page.tsx');
const ANCRE_FOCUS = join(
  RACINE,
  'src',
  'components',
  'a11y',
  'anchor-focus.tsx',
);
const GLOBALS = join(RACINE, 'src', 'app', 'globals.css');

// The files concerned have COMMENTS about what must not be written (an
// animated `scrollIntoView`, which would bypass the motion preference). A
// guard that reads the prose would catch the warning instead of the mistake: we
// therefore strip comment lines before examining the code. URLs in
// strings (`http://…`) are preserved, only ENTIRELY commented lines
// are dropped.
function code(chemin: string): string {
  return readFileSync(chemin, 'utf8')
    .split('\n')
    .filter((ligne) => !ligne.trimStart().startsWith('//'))
    .join('\n');
}

const footer = code(FOOTER);
const aPropos = code(A_PROPOS);
const ancreFocus = code(ANCRE_FOCUS);
const globals = readFileSync(GLOBALS, 'utf8');

// Table of footer column links: `['/href', t('clé')]`.
const liensColonnes = [
  ...footer.matchAll(/\['([^']+)',\s*t\('([^']+)'\)\]/g),
].map(([, href, cle]) => ({ href, cle }));

// The opening tag of a `<section>` carrying this `id` (attributes over
// several lines, but never a `>` before the end of the tag).
function baliseDeSection(id: string): string | undefined {
  return aPropos.match(new RegExp(`<section\\b[^>]*\\bid="${id}"[^>]*>`))?.[0];
}

const ENTREES_RESEAU = ['col1a', 'col1b', 'col1c'] as const;

describe('Pied de page — « Le réseau » promet trois destinations', () => {
  it('a bien relevé la table des liens', () => {
    // Safeguard for the safeguard: if the shape of the links changes, the following
    // assertions would turn green for lack of material to examine.
    expect(liensColonnes.length).toBeGreaterThanOrEqual(18);
  });

  it('donne une ancre distincte à chacune des trois entrées', () => {
    const cibles = ENTREES_RESEAU.map(
      (cle) => liensColonnes.find((l) => l.cle === cle)?.href,
    );
    expect(cibles).toEqual([
      '/a-propos#vision',
      '/a-propos#gouvernance',
      '/a-propos#fondateurs',
    ]);
    expect(new Set(cibles).size).toBe(3);
  });

  it('ne fait pointer aucune autre paire de colonnes au même endroit', () => {
    const vues = new Map<string, string[]>();
    for (const { href, cle } of liensColonnes) {
      vues.set(href, [...(vues.get(href) ?? []), cle]);
    }
    const partagees = [...vues]
      .filter(([, cles]) => cles.length > 1)
      .map(([href, cles]) => `${href} <- ${cles.join(' | ')}`);
    expect(partagees).toEqual([]);
  });
});

describe('Page À propos — les ancres promises existent et sont atteignables', () => {
  const fragments = liensColonnes
    .filter((l) => l.href.startsWith('/a-propos#'))
    .map((l) => l.href.split('#')[1]);

  it('porte un `id` pour chaque fragment promis', () => {
    expect(fragments.length).toBe(3);
    expect(fragments.filter((id) => baliseDeSection(id) === undefined)).toEqual(
      [],
    );
  });

  it.each(['vision', 'gouvernance', 'fondateurs'])(
    'rend la section #%s focusable — sans quoi le focus ne peut pas suivre',
    (id) => {
      // `focus()` on a bare `<section>` does nothing: focus would stay on
      // the footer link, and the link would be useless with a keyboard.
      expect(baliseDeSection(id)).toContain('tabIndex={-1}');
    },
  );

  it.each(['vision', 'gouvernance', 'fondateurs'])(
    'décale la section #%s sous l’en-tête collant',
    (id) => {
      expect(baliseDeSection(id)).toMatch(/\bscroll-mt-\d/);
    },
  );
});

describe('Le saut d’ancre reste celui du navigateur', () => {
  // `prefers-reduced-motion` is respected BECAUSE the movement is performed by
  // the browser, hence governed by `scroll-behavior`. An animated scroll
  // written in JavaScript would override the preference: that is the regression
  // these two assertions catch.
  it.each([
    ['la page À propos', aPropos],
    ['le composant de focus', ancreFocus],
  ])("n'anime aucun défilement depuis %s", (_nom, source) => {
    expect(source).not.toMatch(/behavior:\s*['"]smooth['"]/);
  });

  it('ne repose que le focus, sans déplacer la page', () => {
    expect(ancreFocus).toContain('preventScroll: true');
  });

  it('neutralise toujours `scroll-behavior` sous la préférence', () => {
    const bloc = globals.match(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\n\}/,
    )?.[0];
    expect(bloc).toBeDefined();
    expect(bloc).toMatch(/scroll-behavior:\s*auto\s*!important/);
  });
});
