// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CopyrightYear } from '@/components/layout/copyright-year';

// Issue #36 — the footer year was the constant `2026`, hence wrong
// from 1 January 2027 on all 61 routes of the site.
//
// The fix comes down to three properties, checked here:
//   1. the year comes from the SERVER RENDER (computed, not a constant);
//   2. the first client render reuses that value -> no hydration
//      mismatch, even on the night of 31 December or from an offset time zone;
//   3. the browser corrects it AFTER mount, so that the fix holds
//      the day these pages are served from HTML frozen at build time
//      (issue #13, static rendering).
//
// The behavior tests do not need a mocked clock: they compare
// a deliberately wrong server value (1999) with the process's real year,
// which stays true whatever day the suite runs.

const REAL_YEAR = new Date().getFullYear();

describe("CopyrightYear — l'année servie, puis l'année du navigateur", () => {
  it("rend l'année du serveur, sans jamais lire l'horloge au rendu", () => {
    // `renderToString` = the served HTML, and what a visitor without
    // JavaScript sees. An implausible value makes the failure unambiguous: if
    // the component read the clock during render, we would read REAL_YEAR.
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

// Anti-regression guard on the source: neither the typecheck nor the render tests
// above would catch a step backwards — putting a constant back,
// making the footer a client component, or reading the clock during render.
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
    // Seeding the state with the server value is WHAT avoids the hydration
    // mismatch: without it, a `suppressHydrationWarning` would be needed.
    expect(copyright).toContain('useState(serverYear)');
    // The clock must only be read in the effect, never during render.
    const avantEffet = copyright.slice(0, copyright.indexOf('useEffect('));
    expect(avantEffet).not.toContain('new Date(');
  });
});
