import { describe, it, expect } from 'vitest';
import {
  buildDocumentTranslationInstructions,
  buildDocumentTranslationSchema,
  buildExtractionInstructions,
  documentTokenBudget,
  normalizeBlock,
  parseDocumentTranslation,
  parseExtraction,
  type DocumentBlock,
} from './lib/documents';

// Le point le plus fragile de la traduction d'un document n'est pas le texte :
// c'est l'APPARIEMENT DES FIGURES À LEURS IMAGES, qui se fait par position. Un
// bloc perdu, ajouté ou changé de type, et les illustrations du document
// traduit se retrouvent aux mauvais endroits — sans que rien ne plante, et
// sans que personne ne s'en aperçoive avant de lire le document.
//
// Ces tests tiennent cet invariant, et les cas dégénérés qui l'attaquent.

const SOURCE: DocumentBlock[] = [
  { type: 'heading', level: 1, text: 'Introduction' },
  { type: 'paragraph', text: 'Un premier paragraphe.' },
  { type: 'figure', imageIndex: 0, caption: 'Figure 1' },
  { type: 'list', items: ['Un', 'Deux'] },
  {
    type: 'table',
    rows: [
      ['Pays', 'Indice'],
      ['Sénégal', '0.71'],
    ],
  },
  { type: 'quote', text: 'Une citation.' },
];

function translated(over: Partial<Record<number, unknown>> = {}) {
  const blocks: unknown[] = [
    {
      type: 'heading',
      level: 1,
      text: 'Introduction',
      items: null,
      rows: null,
      imageIndex: null,
      caption: null,
    },
    {
      type: 'paragraph',
      text: 'A first paragraph.',
      level: null,
      items: null,
      rows: null,
      imageIndex: null,
      caption: null,
    },
    {
      type: 'figure',
      imageIndex: 0,
      caption: 'Figure 1',
      level: null,
      text: null,
      items: null,
      rows: null,
    },
    {
      type: 'list',
      items: ['One', 'Two'],
      level: null,
      text: null,
      rows: null,
      imageIndex: null,
      caption: null,
    },
    {
      type: 'table',
      rows: [
        ['Country', 'Index'],
        ['Senegal', '0.71'],
      ],
      level: null,
      text: null,
      items: null,
      imageIndex: null,
      caption: null,
    },
    {
      type: 'quote',
      text: 'A quotation.',
      level: null,
      items: null,
      rows: null,
      imageIndex: null,
      caption: null,
    },
  ];
  for (const [i, v] of Object.entries(over)) blocks[Number(i)] = v;
  return { title: 'Translated title', blocks };
}

describe('Normalisation d’un bloc — le mode strict rend des null partout', () => {
  it('convertit les null en champs absents', () => {
    // La passerelle exige que TOUS les champs déclarés soient présents, d'où
    // des `null` pour ceux qui ne s'appliquent pas. Convex, lui, refuse `null`
    // là où le validateur attend un champ optionnel : sans cette conversion,
    // l'écriture échouerait en production et nulle part ailleurs.
    const b = normalizeBlock({
      type: 'paragraph',
      text: 'Texte',
      level: null,
      items: null,
      rows: null,
      imageIndex: null,
      caption: null,
    });
    expect(b).toEqual({ type: 'paragraph', text: 'Texte' });
    expect(b).not.toHaveProperty('level');
  });

  it('borne le niveau de titre entre 1 et 4', () => {
    expect(
      normalizeBlock({ type: 'heading', text: 'T', level: 9 }),
    ).toMatchObject({
      level: 4,
    });
    expect(
      normalizeBlock({ type: 'heading', text: 'T', level: 0 }),
    ).toMatchObject({
      level: 1,
    });
    // Sans niveau, un intertitre vaut 2 : le `h1` est celui de la page.
    expect(normalizeBlock({ type: 'heading', text: 'T' })).toMatchObject({
      level: 2,
    });
  });

  it('écarte les blocs vides plutôt que de faire un trou dans la page', () => {
    expect(normalizeBlock({ type: 'paragraph', text: '   ' })).toBeNull();
    expect(normalizeBlock({ type: 'list', items: [] })).toBeNull();
    expect(normalizeBlock({ type: 'table', rows: [] })).toBeNull();
    expect(normalizeBlock({ type: 'heading', text: '' })).toBeNull();
    // Une figure sans image NI légende n'a rien à montrer.
    expect(normalizeBlock({ type: 'figure' })).toBeNull();
  });

  it('garde une figure qui n’a qu’une légende', () => {
    // Cas réel : un graphique vectoriel, que `lib/pdfImages.ts` ne sait pas
    // extraire. La légende reste, et la vue affiche un renvoi vers l'original.
    expect(normalizeBlock({ type: 'figure', caption: 'Graphique 3' })).toEqual({
      type: 'figure',
      caption: 'Graphique 3',
    });
  });

  it('refuse un type inconnu', () => {
    expect(normalizeBlock({ type: 'footnote', text: 'x' })).toBeNull();
    expect(normalizeBlock(null)).toBeNull();
    expect(normalizeBlock('paragraphe')).toBeNull();
  });
});

describe('Extraction — les index d’image ne désignent que des images réelles', () => {
  it('conserve un index valide', () => {
    const parsed = parseExtraction(
      { title: 'T', blocks: [{ type: 'figure', imageIndex: 1, caption: 'F' }] },
      2,
    );
    expect(parsed?.blocks[0]).toMatchObject({ imageIndex: 1 });
  });

  it('retire un index qui dépasse le nombre d’images extraites', () => {
    // Le modèle peut compter des illustrations que l'extracteur n'a pas pu
    // lire. L'index désignerait alors une image absente, donc une figure vide.
    const parsed = parseExtraction(
      { title: 'T', blocks: [{ type: 'figure', imageIndex: 5, caption: 'F' }] },
      2,
    );
    expect(parsed?.blocks[0]).toEqual({ type: 'figure', caption: 'F' });
  });

  it('supprime une figure dont l’index est faux ET qui n’a pas de légende', () => {
    const parsed = parseExtraction(
      {
        title: 'T',
        blocks: [
          { type: 'figure', imageIndex: 9 },
          { type: 'paragraph', text: 'Reste.' },
        ],
      },
      1,
    );
    expect(parsed?.blocks).toEqual([{ type: 'paragraph', text: 'Reste.' }]);
  });

  it('refuse un document dont aucun bloc n’est exploitable', () => {
    // Mieux vaut un échec explicite — qui affiche « aucun contenu extrait » et
    // renvoie vers le PDF — qu'une page vide qui paraît réussie.
    expect(
      parseExtraction({ title: 'T', blocks: [{ type: 'x' }] }, 0),
    ).toBeNull();
    expect(parseExtraction({ title: 'T', blocks: [] }, 0)).toBeNull();
    expect(parseExtraction({ blocks: [] }, 0)).toBeNull();
    expect(parseExtraction(null, 0)).toBeNull();
  });
});

describe('Traduction d’un document — la structure est celle de la source', () => {
  it('accepte une traduction bloc pour bloc', () => {
    const parsed = parseDocumentTranslation(SOURCE, translated());
    expect(parsed?.title).toBe('Translated title');
    expect(parsed?.blocks).toHaveLength(SOURCE.length);
    expect(parsed?.blocks.map((b) => b.type)).toEqual(
      SOURCE.map((b) => b.type),
    );
    expect(parsed?.blocks[1].text).toBe('A first paragraph.');
    expect(parsed?.blocks[4].rows?.[1]).toEqual(['Senegal', '0.71']);
  });

  it('REFUSE un nombre de blocs différent', () => {
    const t = translated();
    expect(
      parseDocumentTranslation(SOURCE, { ...t, blocks: t.blocks.slice(0, 4) }),
    ).toBeNull();
    expect(
      parseDocumentTranslation(SOURCE, {
        ...t,
        blocks: [...t.blocks, { type: 'paragraph', text: 'En trop.' }],
      }),
    ).toBeNull();
  });

  it('REFUSE un tableau qui a maigri', () => {
    // LE DÉFAUT LE PLUS COÛTEUX ET LE PLUS DISCRET du dispositif. Compter les
    // blocs ne suffit pas : un tableau de N lignes rendu avec trois lignes
    // reste UN bloc, de type `table`. La page l'affichait parfaitement mis en
    // forme, sous la mention « traduit automatiquement » — et le lecteur
    // l'enregistrait en PDF puis le citait, amputé, sans que rien ne l'ait
    // signalé. Le schéma de la passerelle ne peut pas l'empêcher : il est
    // partagé avec l'extraction, où le nombre de lignes n'est pas connu.
    const source = SOURCE[4];
    expect(source.type).toBe('table');
    expect(source.rows?.length).toBeGreaterThan(1);

    const ampute = translated({
      4: { type: 'table', rows: [source.rows![0]] },
    });
    expect(parseDocumentTranslation(SOURCE, ampute)).toBeNull();
  });

  it('REFUSE une ligne de tableau qui a perdu une cellule', () => {
    const source = SOURCE[4];
    const rows = source.rows!.map((r, i) => (i === 1 ? r.slice(0, 1) : [...r]));
    expect(
      parseDocumentTranslation(
        SOURCE,
        translated({ 4: { type: 'table', rows } }),
      ),
    ).toBeNull();
  });

  it('REFUSE une liste qui a perdu des puces', () => {
    const i = SOURCE.findIndex((b) => b.type === 'list');
    expect(
      i,
      'la source de test doit contenir une liste',
    ).toBeGreaterThanOrEqual(0);
    expect(SOURCE[i].items!.length).toBeGreaterThan(1);
    const ampute = translated({
      [i]: { type: 'list', items: [SOURCE[i].items![0]] },
    });
    expect(parseDocumentTranslation(SOURCE, ampute)).toBeNull();
  });

  it('REFUSE un bloc dont le type a changé', () => {
    // Un paragraphe rendu à la place d'un tableau décalerait toutes les
    // figures suivantes : c'est le défaut que cette garde existe pour attraper.
    const t = translated({
      4: { type: 'paragraph', text: 'Le tableau, en prose.' },
    });
    expect(parseDocumentTranslation(SOURCE, t)).toBeNull();
  });

  it('IMPOSE l’index d’image de la source, quoi que rende le modèle', () => {
    // Même si le modèle renvoie un autre index — ou aucun — la figure reste
    // liée à l'illustration du document d'origine.
    const t = translated({
      2: {
        type: 'figure',
        imageIndex: 7,
        caption: 'Figure 1',
        level: null,
        text: null,
        items: null,
        rows: null,
      },
    });
    expect(parseDocumentTranslation(SOURCE, t)?.blocks[2]).toMatchObject({
      imageIndex: 0,
    });

    const sansIndex = translated({
      2: {
        type: 'figure',
        caption: 'Figure 1',
        level: null,
        text: null,
        items: null,
        rows: null,
        imageIndex: null,
      },
    });
    expect(
      parseDocumentTranslation(SOURCE, sansIndex)?.blocks[2],
    ).toMatchObject({
      imageIndex: 0,
    });
  });

  it('retire un index que la source ne portait pas', () => {
    const source: DocumentBlock[] = [{ type: 'figure', caption: 'Vectoriel' }];
    const out = parseDocumentTranslation(source, {
      title: 'T',
      blocks: [{ type: 'figure', caption: 'Vector', imageIndex: 3 }],
    });
    expect(out?.blocks[0]).not.toHaveProperty('imageIndex');
  });

  it('IMPOSE aussi le niveau de titre de la source', () => {
    const t = translated({
      0: {
        type: 'heading',
        level: 4,
        text: 'Introduction',
        items: null,
        rows: null,
        imageIndex: null,
        caption: null,
      },
    });
    expect(parseDocumentTranslation(SOURCE, t)?.blocks[0]).toMatchObject({
      level: 1,
    });
  });

  it('refuse une réponse malformée', () => {
    expect(parseDocumentTranslation(SOURCE, null)).toBeNull();
    expect(parseDocumentTranslation(SOURCE, { blocks: [] })).toBeNull();
    expect(parseDocumentTranslation(SOURCE, { title: 'T' })).toBeNull();
  });
});

describe('Schémas et consignes', () => {
  it('le schéma de traduction fige le nombre de blocs', () => {
    const schema = buildDocumentTranslationSchema(SOURCE) as {
      properties: { blocks: { minItems: number; maxItems: number } };
    };
    expect(schema.properties.blocks.minItems).toBe(SOURCE.length);
    expect(schema.properties.blocks.maxItems).toBe(SOURCE.length);
  });

  it('la consigne d’extraction annonce le nombre d’images référençables', () => {
    // Sans ce nombre, le modèle invente des index qui ne désignent rien.
    expect(buildExtractionInstructions(3)).toContain('0 to 2');
    expect(buildExtractionInstructions(0)).toContain('No extractable images');
  });

  it('la consigne d’extraction interdit de traduire', () => {
    // L'extraction est faite UNE fois pour cinq langues : si elle traduisait,
    // les cinq versions ne décriraient pas le même document.
    expect(buildExtractionInstructions(1)).toMatch(/Do NOT translate/);
  });

  it('la consigne de traduction protège l’index d’image', () => {
    const i = buildDocumentTranslationInstructions('fr', 'ar');
    expect(i).toMatch(/Never change "imageIndex"/);
    expect(i).toContain('Arabic');
    expect(i).toContain('Western Arabic numerals');
  });

  it('le budget de sortie croît avec le document et reste borné', () => {
    const petit: DocumentBlock[] = [{ type: 'paragraph', text: 'x' }];
    const grand: DocumentBlock[] = [
      { type: 'paragraph', text: 'x'.repeat(200_000) },
    ];
    expect(documentTokenBudget(petit)).toBe(4_000);
    expect(documentTokenBudget(grand)).toBe(64_000);
    const moyen: DocumentBlock[] = [
      { type: 'paragraph', text: 'x'.repeat(20_000) },
    ];
    expect(documentTokenBudget(moyen)).toBeGreaterThan(
      documentTokenBudget(petit),
    );
  });
});
