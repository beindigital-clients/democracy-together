import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// AUDIT A-2 (D-12) — no unregistered DOI on a page.
//
// The library's `10.59000/dt.<slug>` identifiers are internal: no DOI has been
// registered. `isRegisteredDoi` (src/lib/publications.ts) is the one gate; a
// page that shows a DOI, or builds a doi.org link, must go through it. This
// reads the sources of the places that used to do it, so that a re-introduction
// fails here and not in front of a reader.

const root = join(__dirname, '..', '..');
const read = (path: string) => readFileSync(join(root, path), 'utf8');

describe('DOI — affichage conditionné à isRegisteredDoi', () => {
  it('la page d’une publication ne lie doi.org que sous garde, et n’a plus de bouton de repli', () => {
    const page = read('src/app/[locale]/bibliotheque/[slug]/page.tsx');
    expect(page).toContain('isRegisteredDoi');
    // Every doi.org occurrence in code (not in comments) sits behind `doiRegistered`.
    const code = page
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    for (const match of code.matchAll(/doi\.org/g)) {
      const before = code.slice(Math.max(0, match.index - 160), match.index);
      expect(before, 'doi.org hors garde').toMatch(/doiRegistered/);
    }
    expect(code).not.toContain('consultDoi');
  });

  it('la carte de publication n’affiche le DOI que s’il est enregistré', () => {
    const card = read('src/components/library/publication-card.tsx');
    expect(card).toMatch(/isRegisteredDoi\(pub\.doi\)\s*\?/);
  });

  it('la page du baromètre n’affiche la colonne DOI que s’il y en a un d’enregistré', () => {
    const page = read('src/app/[locale]/barometre/page.tsx');
    expect(page).toContain('showDoi');
    expect(page).toContain('isRegisteredDoi');
  });

  it('les citations utilisent le lien permanent tant qu’aucun DOI n’est enregistré', () => {
    const lib = read('src/lib/publications.ts');
    expect(lib).toContain('isRegisteredDoi(pub.doi)');
    // The only doi.org link of the module is the guarded one.
    expect(lib.match(/https:\/\/doi\.org\//g)).toHaveLength(1);
  });
});
