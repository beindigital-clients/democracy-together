import { describe, it, expect } from 'vitest';
import {
  countWords,
  countWordsInPlainText,
  diffTexts,
  diffWords,
  extractLinks,
  isHttpsUrl,
  parseText,
  readingMinutes,
  textChanged,
  toPlainText,
  validateBody,
} from './kohopText';

describe('kohopText — Markdown contraint', () => {
  it('lit paragraphes, intertitres, gras, italique, listes, citations et liens https', () => {
    const { blocks, errors } = parseText(
      [
        '## Titre de partie',
        '',
        'Un **paragraphe** avec *de l’italique*, _un autre_ et un [lien](https://exemple.org/page).',
        'Suite du même paragraphe.',
        '',
        '### Sous-partie',
        '',
        '- premier',
        '- second',
        '',
        '1. un',
        '2. deux',
        '',
        '> Une citation',
      ].join('\n'),
    );
    expect(errors).toEqual([]);
    expect(blocks.map((b) => b.type)).toEqual([
      'heading',
      'paragraph',
      'heading',
      'list',
      'list',
      'quote',
    ]);
    const [h2, p, h3, bullets, ordered] = blocks;
    expect(h2).toMatchObject({ type: 'heading', level: 2 });
    expect(h3).toMatchObject({ type: 'heading', level: 3 });
    expect(bullets).toMatchObject({ type: 'list', ordered: false });
    expect(ordered).toMatchObject({ type: 'list', ordered: true });
    expect(p.type === 'paragraph' && p.children.map((c) => c.type)).toEqual([
      'text',
      'strong',
      'text',
      'em',
      'text',
      'em',
      'text',
      'link',
      'text',
    ]);
  });

  it.each([
    ['du HTML', 'Un <script>alert(1)</script>', 'html'],
    ['une image', '![alt](https://x.org/a.png)', 'image'],
    ['du code', 'Du `code` en ligne', 'code'],
    ['un bloc de code', '```\nx\n```', 'code'],
    ['un titre de niveau 1', '# Trop haut', 'heading_level'],
    ['un titre de niveau 4', '#### Trop bas', 'heading_level'],
    ['une règle', '---', 'rule'],
    ['un tableau', '| a | b |', 'table'],
    ['un lien http', '[x](http://exemple.org)', 'link_scheme'],
    ['un lien javascript', '[x](javascript:alert(1))', 'link_scheme'],
    ['un lien mailto', '[x](mailto:a@b.org)', 'link_scheme'],
    ['un lien relatif', '[x](/page)', 'link_scheme'],
    ['un lien cassé', 'voir [ceci] sans adresse', 'link_malformed'],
    ['un gras jamais fermé', 'Du **gras ouvert', 'emphasis_unclosed'],
  ])('refuse %s', (_label, source, code) => {
    expect(parseText(source).errors.map((e) => e.code)).toContain(code);
  });

  it('signale la ligne de l’erreur', () => {
    const { errors } = parseText('Bonjour\n\nUn <b>mot</b>\n');
    expect(errors[0]).toEqual({ line: 3, code: 'html' });
  });

  it('accepte l’échappement et les tirets bas à l’intérieur d’un mot', () => {
    expect(parseText('un\\*astérisque et snake_case_ok').errors).toEqual([]);
    expect(toPlainText('un\\*astérisque')).toBe('un*astérisque');
  });

  it('ne produit jamais de HTML : le texte brut ne garde que les mots', () => {
    expect(
      toPlainText('Du **gras**, [un lien](https://x.org/a?b=1) et *plus*.'),
    ).toBe('Du gras, un lien et plus.');
  });

  it('isHttpsUrl : https, un hôte, ni identifiants ni espaces', () => {
    expect(isHttpsUrl('https://exemple.org/a?b=1#c')).toBe(true);
    expect(isHttpsUrl('http://exemple.org')).toBe(false);
    expect(isHttpsUrl('https://user:pass@exemple.org')).toBe(false);
    expect(isHttpsUrl('https://localhost')).toBe(false);
    expect(isHttpsUrl('https://exemple.org/a b')).toBe(false);
    expect(isHttpsUrl('')).toBe(false);
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('kohopText — comptage de mots (français, anglais, arabe)', () => {
  it('français : apostrophes et traits d’union restent dans le mot', () => {
    expect(countWordsInPlainText("L'économie s'est redressée.")).toBe(3);
    expect(
      countWordsInPlainText('Un peer-review rapide et très-bien fait'),
    ).toBe(6);
  });

  it('français : la ponctuation isolée, les tirets cadratins et les guillemets ne comptent pas', () => {
    expect(countWordsInPlainText('Oui — non ; peut-être ! « bien » ?')).toBe(4);
    expect(countWordsInPlainText('… , . ; : ! ?')).toBe(0);
  });

  it('français : les espaces insécables et fines séparent les mots', () => {
    expect(countWordsInPlainText('Quoi ? Rien tout')).toBe(3);
  });

  it('anglais : contractions et nombres', () => {
    expect(countWordsInPlainText("It's 2026 and we can't wait.")).toBe(6);
    expect(countWordsInPlainText('1,000 people (about 3.5%) came')).toBe(5);
  });

  it('arabe : un mot par groupe séparé par des espaces, les signes de ponctuation arabes ne comptent pas', () => {
    expect(countWordsInPlainText('الديمقراطية في أفريقيا وأوروبا')).toBe(4);
    expect(countWordsInPlainText('نعم، لا؛ ربما؟ ٣ مرات')).toBe(5);
    // Diacritics (tashkeel) stay attached to their word.
    expect(countWordsInPlainText('الدِّيمُقْرَاطِيَّةُ مُهِمَّةٌ')).toBe(2);
  });

  it('le balisage et les URL ne comptent pas', () => {
    const md =
      'Voir **ce texte** et [la source officielle](https://exemple.org/une/tres/longue/adresse?x=1).';
    expect(countWords(md)).toBe(7);
  });

  it('les intertitres, listes et citations comptent', () => {
    expect(countWords('## Deux mots\n\n- un\n- deux\n\n> trois quatre')).toBe(
      6,
    );
  });

  it('un texte vide compte zéro', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('\n\n   \n')).toBe(0);
  });

  it('le temps de lecture est d’au moins une minute', () => {
    expect(readingMinutes(10)).toBe(1);
    expect(readingMinutes(1000)).toBe(5);
  });
});

describe('kohopText — extraction et validation', () => {
  it('liste les liens du texte une seule fois', () => {
    expect(
      extractLinks(
        '[a](https://x.org/1) et [b](https://x.org/2)\n\n- [c](https://x.org/1)',
      ),
    ).toEqual(['https://x.org/1', 'https://x.org/2']);
  });

  const words = (n: number) => Array.from({ length: n }, () => 'mot').join(' ');

  it('validateBody : bornes 500–1000 mots', () => {
    const bounds = { min: 500, max: 1000 };
    expect(validateBody(words(499), bounds)).toEqual({
      code: 'too_short',
      words: 499,
    });
    expect(validateBody(words(500), bounds)).toBeNull();
    expect(validateBody(words(1000), bounds)).toBeNull();
    expect(validateBody(words(1001), bounds)).toEqual({
      code: 'too_long',
      words: 1001,
    });
  });

  it('validateBody : un texte avec du Markdown non pris en charge est refusé avant le comptage', () => {
    expect(
      validateBody(`${words(600)}\n\n<b>x</b>`, { min: 500, max: 1000 }),
    ).toMatchObject({ code: 'unsupported' });
  });
});

describe('kohopText — différences entre deux versions', () => {
  it('mots : insertions et suppressions', () => {
    const ops = diffWords('le chat dort', 'le grand chat dort bien');
    expect(
      ops.filter((o) => o.op === 'insert').map((o) => o.text.trim()),
    ).toEqual(expect.arrayContaining(['grand', 'bien']));
    expect(ops.some((o) => o.op === 'delete')).toBe(false);
    expect(ops.map((o) => o.text).join('')).toBe('le grand chat dort bien');
  });

  it('blocs : identiques, ajoutés, supprimés, modifiés', () => {
    const before = 'Premier.\n\nSecond paragraphe ici.\n\nTroisième.';
    const after =
      'Premier.\n\nSecond paragraphe modifié ici.\n\nTroisième.\n\nQuatrième.';
    const diff = diffTexts(before, after);
    expect(diff.map((d) => d.op)).toEqual([
      'equal',
      'change',
      'equal',
      'insert',
    ]);
    const change = diff[1];
    expect(
      change.op === 'change' && change.words.some((w) => w.op === 'insert'),
    ).toBe(true);
  });

  it('textChanged : faux pour un texte identique, vrai dès qu’un bloc diffère', () => {
    expect(textChanged('Un.\n\nDeux.', 'Un.\n\nDeux.')).toBe(false);
    expect(textChanged('Un.\n\nDeux.', 'Un.\n\nDeux !')).toBe(true);
    // Markup alone (bold) does not change the plain text.
    expect(textChanged('Un mot.', 'Un **mot**.')).toBe(false);
  });

  it('un bloc supprimé seul reste une suppression', () => {
    const diff = diffTexts('A.\n\nB.', 'A.');
    expect(diff.map((d) => d.op)).toEqual(['equal', 'delete']);
  });
});
