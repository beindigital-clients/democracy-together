import { describe, it, expect } from 'vitest';
import { breakLines, logicalText, mirror, placeLine, tokenize } from './layout';
import { REPORT_PDF_LABELS, pageLabel } from './labels';
import { SITE_LOCALES } from '../locales';

// Mise en ligne bidirectionnelle du PDF des rapports (F-41). Mesure fictive :
// un caractère = une unité, pour que les positions se lisent à l'œil.
const measure = (s: string) => [...s].length;

describe('Mots et directions', () => {
  it('arabe = droite-à-gauche, latin et chiffres = gauche-à-droite', () => {
    const toks = tokenize(
      'السنة الأولى لـ Democracy Together: تأسيس 2026',
      'rtl',
    );
    expect(toks.map((t) => [t.text, t.dir])).toEqual([
      ['السنة', 'rtl'],
      ['الأولى', 'rtl'],
      ['لـ', 'rtl'],
      ['Democracy', 'ltr'],
      ['Together', 'ltr'],
      // Le deux-points entre un mot latin et un mot arabe prend la direction
      // du paragraphe.
      [':', 'rtl'],
      ['تأسيس', 'rtl'],
      ['2026', 'ltr'],
    ]);
    // La ponctuation collée ne crée pas d'espace.
    expect(toks[5].spaceBefore).toBe(false);
  });

  it('les signes appariés d’une course droite-à-gauche sont mis en miroir', () => {
    expect(mirror('(')).toBe(')');
    expect(mirror('«')).toBe('»');
  });
});

describe('Coupure des lignes', () => {
  it('ne coupe qu’aux espaces : la virgule arabe reste avec son mot', () => {
    const toks = tokenize('ألف باء، جيم', 'rtl');
    const lines = breakLines(toks, 8, measure, 1);
    // « باء، » ne se sépare pas de sa virgule, même en bout de ligne.
    expect(lines.map(logicalText)).toEqual(['ألف باء،', 'جيم']);
  });

  it('typographie française : « : » ne commence jamais une ligne', () => {
    const toks = tokenize('abcd efgh : ijkl', 'ltr');
    const lines = breakLines(toks, 9, measure, 1);
    expect(lines.map(logicalText)).toEqual(['abcd', 'efgh :', 'ijkl']);
  });

  it('un mot plus long que la ligne est coupé au caractère', () => {
    const lines = breakLines(tokenize('abcdefghij', 'ltr'), 4, measure, 1);
    expect(lines.map(logicalText)).toEqual(['abcd', 'efgh', 'ij']);
  });
});

describe('Placement visuel', () => {
  it('paragraphe arabe : mots posés de droite à gauche, bloc latin d’un seul tenant', () => {
    const toks = tokenize('ب Latin text ج', 'rtl');
    const placed = placeLine(toks, 'rtl', 20, measure, 1);
    // Premier mot logique à DROITE.
    expect(placed.map((p) => [p.text, p.x])).toEqual([
      ['ب', 19],
      ['Latin text', 8],
      ['ج', 6],
    ]);
  });

  it('parenthèses arabes retournées, chiffres jamais inversés', () => {
    const toks = tokenize('(قانون 1901)', 'rtl');
    const placed = placeLine(toks, 'rtl', 20, measure, 1);
    const texts = placed.map((p) => p.text);
    expect(texts).toContain('1901');
    // « ( » logique, posé à droite, se dessine « ) » (règle L4).
    expect(texts[0]).toBe(')');
  });

  it('paragraphe latin : ordre de lecture conservé, une seule chaîne', () => {
    const toks = tokenize('Rapport annuel 2026', 'ltr');
    const placed = placeLine(toks, 'ltr', 40, measure, 1);
    expect(placed).toEqual([
      { text: 'Rapport annuel 2026', dir: 'ltr', x: 0, width: 19 },
    ]);
  });
});

describe('Libellés d’habillage du PDF', () => {
  it('cinq langues complètes, pagination à deux marqueurs', () => {
    for (const loc of SITE_LOCALES) {
      const L = REPORT_PDF_LABELS[loc];
      for (const value of Object.values(L)) expect(value.trim()).not.toBe('');
      expect(L.pageOf).toContain('{page}');
      expect(L.pageOf).toContain('{total}');
      expect(pageLabel(L, 2, 5)).not.toContain('{');
    }
  });
});
