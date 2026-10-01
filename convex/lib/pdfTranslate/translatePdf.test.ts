// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import PDFKit from 'pdfkit';
import { PDFDocument } from 'pdf-lib';
import { translatePdf } from './index';
import { locatePage } from './contentStream';
import { extractPages } from './extract';
import { buildBlocks } from './blocks';

// PDF TRANSLATION KEEPING THE DESIGN — end to end, without a model.
//
// The translator is a stub: `[EN] ` before each block for a Latin target,
// and for Arabic a transliteration of every letter into an Arabic one, which
// gives words of the same length in the right script — enough to exercise
// right-to-left setting without a model call.
//
// PDF_TRANSLATE_IN=a.pdf,b.pdf PDF_TRANSLATE_OUT=/dir also translates those
// files and writes the results, to look at them.

const TO_ARABIC: Record<string, string> = {
  a: 'ا',
  b: 'ب',
  c: 'ت',
  d: 'د',
  e: 'ي',
  f: 'ف',
  g: 'غ',
  h: 'ه',
  i: 'ي',
  j: 'ج',
  k: 'ك',
  l: 'ل',
  m: 'م',
  n: 'ن',
  o: 'و',
  p: 'ب',
  q: 'ق',
  r: 'ر',
  s: 'س',
  t: 'ت',
  u: 'و',
  v: 'ف',
  w: 'و',
  x: 'خ',
  y: 'ي',
  z: 'ز',
};

function pseudoTranslate(locale: string) {
  return async (texts: string[]) =>
    texts.map((t) =>
      locale === 'ar'
        ? t
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .toLowerCase()
            .replace(/[a-z]/g, (c) => TO_ARABIC[c])
        : `[${locale.toUpperCase()}] ${t}`,
    );
}

/** A small designed page: a dark banner with white text, two columns. */
async function fixture(): Promise<Uint8Array> {
  const doc = new PDFKit({ size: 'A4', margin: 50 });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((r) => doc.on('end', () => r()));
  doc.rect(0, 0, 595, 160).fill('#1f3a5f');
  doc
    .font('Helvetica-Bold')
    .fontSize(24)
    .fillColor('#ffffff')
    .text('Rapport sur la participation citoyenne', 50, 60, { width: 495 });
  doc
    .font('Times-Roman')
    .fontSize(11)
    .fillColor('#222222')
    .text(
      'Ce rapport compare dix dispositifs de budget participatif. Il s’appuie sur les procès-verbaux publiés par les mairies et sur des entretiens.',
      50,
      200,
      { width: 230, align: 'justify' },
    )
    .text(
      'Les communes qui publient l’exécution du budget voté obtiennent une participation deux fois plus élevée.',
      315,
      200,
      { width: 230 },
    );
  doc
    .font('Helvetica')
    .fontSize(9)
    .fillColor('#777777')
    .text('Page 1', 500, 800);
  doc.end();
  await done;
  return new Uint8Array(Buffer.concat(chunks));
}

async function textOf(bytes: Uint8Array): Promise<string> {
  const pages = await extractPages(bytes);
  return pages.map((p) => p.items.map((i) => i.str).join(' ')).join('\n');
}

describe('Blocs — regroupement géométrique', () => {
  it('sépare les colonnes, garde un paragraphe entier', async () => {
    const [page] = await extractPages(await fixture());
    const blocks = buildBlocks(page.items).filter((b) => b.translatable);
    const texts = blocks.map((b) => b.text);
    expect(texts).toContain('Rapport sur la participation citoyenne');
    // The left column is one block, the right column another.
    expect(
      texts.some(
        (t) => t.startsWith('Ce rapport compare') && t.endsWith('entretiens.'),
      ),
    ).toBe(true);
    expect(
      texts.some((t) => t.startsWith('Les communes') && t.endsWith('élevée.')),
    ).toBe(true);
  });
});

describe('Traduction d’un PDF en gardant sa mise en page', () => {
  it('remplace le texte, et rien que le texte', async () => {
    const original = await fixture();
    const { bytes, stats } = await translatePdf(original, {
      targetLocale: 'en',
      translate: pseudoTranslate('en'),
    });
    const text = await textOf(bytes);
    expect(text).toContain('[EN] Rapport sur la participation citoyenne');
    expect(text).toContain('[EN] Page 1');
    // The original words are gone from the page, not hidden under it.
    expect(text).not.toMatch(/(^|[^\]] )Rapport sur la participation/);
    expect(stats.translated).toBeGreaterThanOrEqual(4);

    // The banner is still drawn, and the title on it is still white.
    const doc = await PDFDocument.load(bytes);
    const { runs } = locatePage(doc, doc.getPage(0));
    const title = runs.filter((r) => r.y > 700 && !r.invisible);
    expect(title.length).toBeGreaterThan(0);
    expect(title.every((r) => r.color === '#ffffff')).toBe(true);
  });

  it('compose l’arabe de droite à gauche, dans la police arabe', async () => {
    const { bytes } = await translatePdf(await fixture(), {
      targetLocale: 'ar',
      translate: pseudoTranslate('ar'),
    });
    const text = await textOf(bytes);
    expect(text).toMatch(/[؀-ۿ]/);
    const doc = await PDFDocument.load(bytes);
    expect(doc.catalog.toString()).toContain('/Lang (ar)');
  });

  it('écrit les fichiers demandés, pour les regarder', async () => {
    const inputs =
      process.env.PDF_TRANSLATE_IN?.split(',').filter(Boolean) ?? [];
    const out = process.env.PDF_TRANSLATE_OUT;
    if (inputs.length === 0 || !out) return;
    for (const input of inputs) {
      for (const locale of ['en', 'ar']) {
        const { bytes, stats } = await translatePdf(
          new Uint8Array(fs.readFileSync(input)),
          { targetLocale: locale, translate: pseudoTranslate(locale) },
        );
        const name = `${path.basename(input, '.pdf')}.${locale}.pdf`;
        fs.writeFileSync(path.join(out, name), bytes);
        console.log(name, JSON.stringify(stats));
      }
    }
  });
}, 60_000);
