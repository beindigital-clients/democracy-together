// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { renderReportPdf, type ReportPdfInput } from './render';
import { CODED_REPORTS } from '../annualReportsCoded';
import { SITE_LOCALES, type SiteLocale } from '../locales';

// REPORT PDF GENERATION (F-41). What these tests guarantee:
//  - the PDF OPENS (pdf.js reads it without error);
//  - the page count read is the one the generator announces (and that the
//    site page displays next to the button);
//  - the title is in the metadata AND in the extracted text;
//  - EXTRACTED ARABIC IS JOINED: each letter used in several positions of a
//    word is drawn with several distinct glyphs (initial, medial, final
//    forms), and words read back in one piece.
//
// To INSPECT the generated PDFs: `REPORT_PDF_OUT=/path pnpm exec vitest
// run convex/lib/reportPdf/render.test.ts` writes them to that directory, one
// per language (this is the measurement command cited in
// docs/backlog/editorial.md).

const OUT = process.env.REPORT_PDF_OUT;

function inputFor(locale: SiteLocale): ReportPdfInput {
  const r = CODED_REPORTS[locale][2026];
  return {
    locale,
    year: r.year,
    inaugural: r.inaugural,
    title: r.title,
    intro: r.intro,
    chapters: r.chapters,
    keyFigures: r.keyFigures,
  };
}

async function open(bytes: Uint8Array) {
  // pdf.js detaches the buffer it is given: we pass it a copy.
  return pdfjs.getDocument({
    data: bytes.slice(),
    isEvalSupported: false,
    useSystemFonts: false,
  }).promise;
}

async function allText(doc: pdfjs.PDFDocumentProxy): Promise<string> {
  const out: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    out.push(tc.items.map((it) => ('str' in it ? it.str : '')).join(' '));
  }
  return out.join('\n');
}

// Drawn glyphs, with their character code (CID) and the Unicode text the PDF
// associates with them (/ToUnicode). A contextually shaped Arabic letter
// appears under SEVERAL CIDs; set in isolation, under only one.
async function glyphForms(
  doc: pdfjs.PDFDocumentProxy,
): Promise<Map<string, Set<number>>> {
  const forms = new Map<string, Set<number>>();
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const ops = await page.getOperatorList();
    ops.fnArray.forEach((fn, k) => {
      if (fn !== pdfjs.OPS.showText) return;
      const glyphs = ops.argsArray[k][0] as (
        { unicode: string; originalCharCode: number } | number
      )[];
      for (const g of glyphs) {
        if (typeof g === 'number' || !g.unicode) continue;
        const set = forms.get(g.unicode) ?? new Set<number>();
        set.add(g.originalCharCode);
        forms.set(g.unicode, set);
      }
    });
  }
  return forms;
}

// Composing a PDF takes from a few hundred milliseconds to a few seconds when
// the whole suite runs in parallel: extended timeout.
describe('PDF des rapports annuels (F-41)', { timeout: 60_000 }, () => {
  it.each(SITE_LOCALES)(
    '%s : s’ouvre, annonce le bon nombre de pages, porte titre et langue',
    async (locale) => {
      const input = inputFor(locale);
      const { bytes, pages } = await renderReportPdf(input);
      if (OUT) {
        mkdirSync(OUT, { recursive: true });
        writeFileSync(join(OUT, `rapport-2026-${locale}.pdf`), bytes);
      }
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
      const doc = await open(bytes);
      expect(doc.numPages).toBe(pages);
      expect(pages).toBeGreaterThanOrEqual(2);

      const { info } = (await doc.getMetadata()) as {
        info: Record<string, unknown>;
      };
      expect(info.Title).toBe(input.title);
      expect(info.Author).toBe('Democracy Together');
      expect(info.Language).toBe(locale);

      // Tagging: the catalogue declares a marked PDF, and the structure tree
      // exists (read by pdf.js page by page).
      const tree = await (await doc.getPage(1)).getStructTree();
      expect(tree?.children.length).toBeGreaterThan(0);

      // The title reads back in the extracted text (normalised spaces).
      const text = (await allText(doc)).replace(/\s+/g, ' ');
      const firstWord = input.title.split(' ')[0];
      expect(text).toContain(firstWord);
      await doc.destroy();
    },
  );

  it('arabe : les lettres sont LIÉES (formes contextuelles), les mots se relisent entiers', async () => {
    const input = inputFor('ar');
    const { bytes } = await renderReportPdf(input);
    const doc = await open(bytes);

    // 1. Contextual forms. ب (beh), ت (teh), ن (noon), م (meem), ي (yeh)
    //    appear in the report at the start, middle and end of words: correct
    //    shaping draws them with at least three different glyphs each; a
    //    "letter by letter" composition would use only one.
    const forms = await glyphForms(doc);
    for (const letter of ['ب', 'ت', 'ن', 'م', 'ي']) {
      expect(
        forms.get(letter)?.size ?? 0,
        `formes de ${letter}`,
      ).toBeGreaterThanOrEqual(3);
    }
    // And, overall, most of the Arabic letters used have more than one form.
    const arabic = [...forms.entries()].filter(([u]) => /^[ء-ي]$/u.test(u));
    const joined = arabic.filter(([, cids]) => cids.size > 1);
    expect(joined.length / arabic.length).toBeGreaterThan(0.6);

    // 2. Extracted text: the title's words read back in one piece, in logical
    //    order — not a sequence of separate letters, not a reversed word.
    const text = await allText(doc);
    expect(text).toContain('تقرير');
    expect(text).toContain('النشاط');
    expect(text).not.toMatch(/ت ق ر ي ر/u);
    expect(text).not.toContain('ريرقت');
    // Ligatures: lam-alif (mandatory) and the font's ligatures read back in
    // logical order (see `visualOrderLigatures`).
    expect(text).toContain('الإصدار');
    expect(text).toContain('المشتركة');
    expect(text).toContain('بين');
    // The year's digits are not reversed by the reading direction.
    expect(text).toContain('2026');
    expect(text).not.toContain('6202');
    await doc.destroy();
  });

  it('pagination : un rapport long s’étend sur plusieurs pages, toutes comptées', async () => {
    const base = inputFor('fr');
    const long: ReportPdfInput = {
      ...base,
      chapters: Array.from({ length: 6 }, (_, i) => ({
        heading: `Chapitre ${i + 1}`,
        body: base.chapters.flatMap((c) => c.body),
      })),
      keyFigures: [
        { value: '12', label: 'organisations membres' },
        { value: '5', label: 'axes de travail' },
        { value: '2026', label: 'année de fondation' },
        { value: '1', label: 'baromètre' },
      ],
    };
    const { bytes, pages } = await renderReportPdf(long);
    const doc = await open(bytes);
    expect(pages).toBeGreaterThan(4);
    expect(doc.numPages).toBe(pages);
    const lastPage = await doc.getPage(pages);
    const footer = (await lastPage.getTextContent()).items
      .map((it) => ('str' in it ? it.str : ''))
      .join(' ');
    expect(footer).toContain(`Page ${pages} sur ${pages}`);
    await doc.destroy();
  });
});
