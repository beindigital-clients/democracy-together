import { describe, it, expect } from 'vitest';
import {
  buildCitations,
  formatAuthorList,
  formatAuthorParts,
  isRegisteredDoi,
  REGISTERED_DOI_PREFIXES,
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
    doi: '10.59000/dt.gouvernance-numerique',
    url: 'https://democracy-together.org/fr/bibliotheque/gouvernance-numerique',
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

// DOI (audit A-2, D-12). The library stores an INTERNAL identifier shaped like
// a DOI; none is registered, so it must never be shown or linked to doi.org.
// `isRegisteredDoi` is the one gate, and its list of prefixes is empty for now.
describe('isRegisteredDoi — aucun DOI n’est présenté tant qu’aucun préfixe n’est enregistré', () => {
  it('la liste des préfixes enregistrés est vide pour l’instant', () => {
    expect(REGISTERED_DOI_PREFIXES).toEqual([]);
  });

  it('refuse l’identifiant interne 10.59000/dt.<slug>', () => {
    expect(isRegisteredDoi('10.59000/dt.gouvernance-numerique')).toBe(false);
    expect(isRegisteredDoi('10.5281/zenodo.1234567')).toBe(false);
  });

  it('refuse l’absence de valeur', () => {
    expect(isRegisteredDoi('')).toBe(false);
    expect(isRegisteredDoi(null)).toBe(false);
    expect(isRegisteredDoi(undefined)).toBe(false);
  });

  it('accepte un DOI dont le préfixe est enregistré, et lui seul', () => {
    const prefixes = ['10.59000'];
    expect(isRegisteredDoi('10.59000/dt.x', prefixes)).toBe(true);
    // A prefix is matched up to the slash, never as a bare string prefix.
    expect(isRegisteredDoi('10.590001/dt.x', prefixes)).toBe(false);
    expect(isRegisteredDoi('10.5281/zenodo.1', prefixes)).toBe(false);
  });
});

describe('buildCitations — le lien permanent remplace le DOI non enregistré', () => {
  const pub = {
    title: 'Gouvernance numérique',
    authors: [{ name: 'Awa Diop' }],
    year: 2026,
    doi: '10.59000/dt.gouvernance-numerique',
    url: 'https://democracy-together.org/fr/bibliotheque/gouvernance-numerique',
    type: 'rapport',
  };

  it('APA, BibTeX et RIS pointent vers la page, sans doi.org', () => {
    const { apa, bibtex, ris } = buildCitations(pub, 'fr');
    expect(apa.endsWith(pub.url)).toBe(true);
    expect(bibtex).toContain(`url    = {${pub.url}}`);
    expect(ris).toContain(`UR  - ${pub.url}`);
    for (const citation of [apa, bibtex, ris]) {
      expect(citation).not.toContain('doi.org');
      expect(citation).not.toContain('10.59000');
      expect(citation).not.toMatch(/\bdoi\b|DO {2}-/i);
    }
  });
});
