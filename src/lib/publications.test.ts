import { describe, it, expect } from 'vitest';
import {
  buildCitations,
  formatAuthorList,
  formatAuthorParts,
} from './publications';

// Liste d'auteurs : la ponctuation est une règle de LANGUE (issue #34).
//
// La fiche publication assemblait « A, B et C » à la main, en choisissant la
// conjonction par un ternaire sur la locale. Deux défauts pour le prix d'un :
// le libellé n'entrait pas dans le fichier de messages, et la règle inventée
// était FAUSSE en anglais — l'anglais met une virgule avant « and » (virgule
// de Oxford), ce qu'aucun ternaire sur la conjonction ne peut rattraper.
// `Intl.ListFormat` tient cette règle pour toutes les langues.

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
    // C'est ce qui autorise la fiche publication à mettre les NOMS en gras
    // sans toucher aux séparateurs : le rendu ne perd pas un caractère.
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
    // Ce sont des formats d'échange : leur séparateur d'auteurs est fixé par
    // la spécification (` and ` en BibTeX, une ligne `AU` par auteur en RIS),
    // pas par la langue du lecteur.
    const fr = buildCitations(pub, 'fr');
    const en = buildCitations(pub, 'en');
    expect(en.bibtex).toBe(fr.bibtex);
    expect(en.ris).toBe(fr.ris);
  });
});
