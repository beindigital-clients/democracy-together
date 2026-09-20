// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CopyrightYear } from '@/components/layout/copyright-year';

// Issue #36 — l'année du pied de page était la constante `2026`, donc fausse
// dès le 1er janvier 2027 sur les 61 routes du site.
//
// Le correctif tient en trois propriétés, vérifiées ici :
//   1. l'année vient du RENDU SERVEUR (calcul, pas constante) ;
//   2. le premier rendu client reprend cette valeur -> aucun écart
//      d'hydratation, même la nuit du 31 décembre ou depuis un fuseau décalé ;
//   3. le navigateur la rectifie APRÈS montage, pour que la correction tienne
//      le jour où ces pages seraient servies depuis un HTML figé au build
//      (issue #13, rendu statique).
//
// Les tests de comportement n'ont pas besoin d'horloge simulée : ils comparent
// une valeur de serveur volontairement fausse (1999) à l'année réelle du
// processus, ce qui reste vrai quel que soit le jour où la suite tourne.

const REAL_YEAR = new Date().getFullYear();

describe("CopyrightYear — l'année servie, puis l'année du navigateur", () => {
  it("rend l'année du serveur, sans jamais lire l'horloge au rendu", () => {
    // `renderToString` = le HTML servi, et ce que voit un visiteur sans
    // JavaScript. Une valeur invraisemblable rend l'échec sans ambiguïté : si
    // le composant lisait l'horloge pendant le rendu, on lirait REAL_YEAR.
    expect(renderToString(<CopyrightYear serverYear={1999} />)).toBe('1999');
  });

  it("rectifie après montage quand le navigateur n'est pas dans la même année", () => {
    const { container } = render(<CopyrightYear serverYear={1999} />);
    expect(container.textContent).toBe(String(REAL_YEAR));
  });

  it("laisse l'année inchangée quand serveur et navigateur concordent", () => {
    const { container } = render(<CopyrightYear serverYear={REAL_YEAR} />);
    expect(container.textContent).toBe(String(REAL_YEAR));
  });
});

// Garde anti-régression sur la source : ni le typecheck ni les tests de rendu
// ci-dessus n'attraperaient un retour en arrière — remettre une constante,
// passer le pied de page en composant client, ou lire l'horloge au rendu.
const LAYOUT = join(process.cwd(), 'src', 'components', 'layout');
const footer = readFileSync(join(LAYOUT, 'site-footer.tsx'), 'utf8');
const copyright = readFileSync(join(LAYOUT, 'copyright-year.tsx'), 'utf8');

describe('Contrat de source du pied de page', () => {
  it("le pied de page reste un composant SERVEUR et calcule l'année", () => {
    expect(footer).not.toMatch(/^\s*['"]use client['"]/m);
    expect(footer).toContain('new Date().getFullYear()');
    expect(footer).not.toMatch(/const year = \d{4}/);
  });

  it("le pied de page transmet l'année du serveur plutôt que de l'afficher nue", () => {
    expect(footer).toContain('<CopyrightYear serverYear={year} />');
  });

  it("la rectification est cliente et n'a lieu qu'après montage", () => {
    expect(copyright).toMatch(/^\s*['"]use client['"]/m);
    // Semer l'état avec la valeur du serveur est CE qui évite l'écart
    // d'hydratation : sans cela, il faudrait un `suppressHydrationWarning`.
    expect(copyright).toContain('useState(serverYear)');
    // L'horloge ne doit être lue que dans l'effet, jamais au fil du rendu.
    const avantEffet = copyright.slice(0, copyright.indexOf('useEffect('));
    expect(avantEffet).not.toContain('new Date(');
  });
});
