import { describe, it, expect } from 'vitest';
import {
  buildCitations,
  formatAuthorList,
  formatAuthorParts,
} from './publications';

// Author list: punctuation is a LANGUAGE rule (issue #34).
//
// The publication page assembled "A, B et C" by hand, picking the
// conjunction with a ternary on the locale. Two defects for the price of one:
// the label was not in the messages file, and the invented rule was WRONG in
// English — English puts a comma before "and" (the Oxford comma), which no
// ternary on the conjunction can make up for.
// `Intl.ListFormat` handles this rule for every language.

const THREE = ['Awa Diop', 'Marc Lefèvre', 'Chen Wei'];

describe('formatAuthorList — la ponctuation vient de la langue', () => {
  it('français : virgules puis « et », sans virgule avant le dernier', () => {
    expect(formatAuthorList(THREE, 'fr')).toBe(
      'Awa Diop, Marc Lefèvre et Chen Wei',
    );
    expect(formatAuthorList(THREE.slice(0, 2), 'fr')).toBe(
      'Awa Diop et Marc Lefèvre',
    );
  });

  it('anglais : « , and » — c’est la virgule que la règle écrite à la main perdait', () => {
    expect(formatAuthorList(THREE, 'en')).toBe(
      'Awa Diop, Marc Lefèvre, and Chen Wei',
    );
    expect(formatAuthorList(THREE.slice(0, 2), 'en')).toBe(
      'Awa Diop and Marc Lefèvre',
    );
  });

  it('les deux langues ne produisent pas la même chaîne', () => {
    expect(formatAuthorList(THREE, 'en')).not.toBe(
      formatAuthorList(THREE, 'fr'),
    );
  });

  it('un seul auteur : aucun séparateur ; aucun auteur : chaîne vide', () => {
    for (const locale of ['fr', 'en']) {
      expect(formatAuthorList(['Awa Diop'], locale)).toBe('Awa Diop');
      expect(formatAuthorList([], locale)).toBe('');
    }
  });
});

describe('formatAuthorParts — noms et séparateurs séparés', () => {
  it('les segments `element` sont les noms, dans l’ordre', () => {
    for (const locale of ['fr', 'en']) {
      const parts = formatAuthorParts(THREE, locale);
      expect(
        parts.filter((p) => p.type === 'element').map((p) => p.value),
      ).toEqual(THREE);
    }
  });

  it('recollés, les segments redonnent exactement la liste formatée', () => {
    // This is what lets the publication page put the NAMES in bold
    // without touching the separators: the rendering loses no character.
    for (const locale of ['fr', 'en']) {
      expect(
        formatAuthorParts(THREE, locale)
          .map((p) => p.value)
          .join(''),
      ).toBe(formatAuthorList(THREE, locale));
    }
  });
});

describe('buildCitations — la citation APA suit la langue de lecture', () => {
  const pub = {
    title: 'Gouvernance numérique et participation',
    authors: [
      { name: 'Awa Diop' },
      { name: 'Marc Lefèvre' },
      { name: 'Chen Wei' },
    ],
    year: 2026,
    doi: '10.5281/zenodo.1234567',
    type: 'rapport',
  };

  it('français : « Diop, A., Lefèvre, M. et Wei, C. »', () => {
    expect(buildCitations(pub, 'fr').apa).toContain(
      'Diop, A., Lefèvre, M. et Wei, C.',
    );
  });

  it('anglais : « Diop, A., Lefèvre, M., and Wei, C. »', () => {
    expect(buildCitations(pub, 'en').apa).toContain(
      'Diop, A., Lefèvre, M., and Wei, C.',
    );
  });

  it('BibTeX et RIS ne dépendent PAS de la langue de lecture', () => {
    // These are exchange formats: their author separator is fixed by the
    // specification (` and ` in BibTeX, one `AU` line per author in RIS),
    // not by the reader's language.
    const fr = buildCitations(pub, 'fr');
    const en = buildCitations(pub, 'en');
    expect(en.bibtex).toBe(fr.bibtex);
    expect(en.ris).toBe(fr.ris);
  });
});
