import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Issue #46 — les trois entrées « Le réseau » du pied de page pointaient vers
// `/a-propos` nu. Le correctif est un CONTRAT ENTRE DEUX FICHIERS : le pied de
// page promet un fragment, la page À propos le porte. Rien dans le typage ne
// relie les deux — renommer un `id` d'un côté laisse l'autre pointer dans le
// vide, sans erreur de compilation et sans rien de visible à la relecture.
//
// La spec E2E vérifie le comportement réel (défilement, focus, préférence de
// mouvement) ; ce fichier tient le contrat de source, qui se casse plus vite
// qu'il ne se remarque.

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

// Les fichiers concernés COMMENTENT ce qu'il ne faut pas écrire (un
// `scrollIntoView` animé, qui contournerait la préférence de mouvement). Une
// garde qui lit la prose attraperait l'avertissement au lieu de la faute : on
// retire donc les lignes de commentaire avant d'examiner le code. Les URL en
// chaîne (`http://…`) sont préservées, seules les lignes ENTIÈREMENT commentées
// tombent.
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

// Table des liens de colonnes du pied de page : `['/href', t('clé')]`.
const liensColonnes = [
  ...footer.matchAll(/\['([^']+)',\s*t\('([^']+)'\)\]/g),
].map(([, href, cle]) => ({ href, cle }));

// La balise ouvrante d'une `<section>` portant cet `id` (attributs sur
// plusieurs lignes, mais jamais de `>` avant la fin de la balise).
function baliseDeSection(id: string): string | undefined {
  return aPropos.match(new RegExp(`<section\\b[^>]*\\bid="${id}"[^>]*>`))?.[0];
}

const ENTREES_RESEAU = ['col1a', 'col1b', 'col1c'] as const;

describe('Pied de page — « Le réseau » promet trois destinations', () => {
  it('a bien relevé la table des liens', () => {
    // Garde-fou du garde-fou : si la forme des liens change, les assertions
    // suivantes deviendraient vertes faute de matière à examiner.
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
      // `focus()` sur une `<section>` nue ne fait rien : le focus resterait sur
      // le lien du pied de page, et le lien ne servirait à rien au clavier.
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
  // `prefers-reduced-motion` est respecté PARCE QUE le déplacement est opéré par
  // le navigateur, donc gouverné par `scroll-behavior`. Un défilement animé
  // écrit en JavaScript passerait outre la préférence : c'est la régression que
  // ces deux assertions attrapent.
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
