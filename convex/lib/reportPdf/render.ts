'use node';

import PDFDocument from 'pdfkit';
import { isRtlLocale, type SiteLocale } from '../locales';
import { loadFonts, type FontKey } from './fonts';
import { pageLabel, REPORT_PDF_LABELS } from './labels';
import {
  breakLines,
  logicalText,
  placeLine,
  tokenize,
  type Direction,
} from './layout';

// COMPOSING AN ANNUAL REPORT PDF (F-41) — pdfkit + fontkit, in pure
// JavaScript, run in a Convex action (Node runtime).
//
// The choice of technique is MEASURED (docs/backlog/editorial.md § Mesure):
// fontkit applies the font's OpenType tables, hence Arabic contextual forms
// and ligatures; bidirectional word placement is done by `./layout`; pdfkit
// provides the tagged PDF (structure tree, `/Lang`, `/ActualText`), the
// metadata and the bookmarks. No Chromium: production runs on Vercel, which
// does not have it, and neither does Convex.

export type ReportPdfInput = {
  locale: SiteLocale;
  year: number;
  inaugural: boolean;
  title: string;
  intro: string;
  chapters: { heading: string; body: string[] }[];
  keyFigures: { value: string; label: string }[];
};

export type ReportPdf = { bytes: Uint8Array<ArrayBuffer>; pages: number };

// Site tokens (src/app/globals.css, light theme): a PDF gets printed.
const COLOR = {
  ink: '#16191f',
  inkSoft: '#454953',
  muted: '#646771',
  accent: '#1f3d6e',
  line: '#d9d6cd',
};

const PAGE = { width: 595.28, height: 841.89 }; // A4, in points
const MARGIN = { top: 64, bottom: 72, side: 62 };
const CONTENT_WIDTH = PAGE.width - 2 * MARGIN.side;
const BOTTOM = PAGE.height - MARGIN.bottom;

type TextStyle = {
  font: FontKey;
  size: number;
  /** Line height, as a multiple of the size. */
  leading: number;
  color: string;
};

// Arabic is set one step larger and more airily: at equal point size, its
// x-height is smaller than Latin's, and its ascenders and descenders need the
// line spacing that Latin does not use.
function styles(rtl: boolean) {
  const body: FontKey = rtl ? 'arabic' : 'body';
  const bold: FontKey = rtl ? 'arabicBold' : 'bodyBold';
  const display: FontKey = rtl ? 'arabicBold' : 'display';
  return {
    eyebrow: { font: bold, size: 9, leading: 1.4, color: COLOR.muted },
    title: {
      font: display,
      size: rtl ? 28 : 30,
      leading: rtl ? 1.45 : 1.15,
      color: COLOR.ink,
    },
    intro: {
      font: body,
      size: rtl ? 13.5 : 13,
      leading: rtl ? 1.8 : 1.5,
      color: COLOR.inkSoft,
    },
    h2: {
      font: display,
      size: rtl ? 17 : 19,
      leading: rtl ? 1.6 : 1.25,
      color: COLOR.ink,
    },
    p: {
      font: body,
      size: rtl ? 11.5 : 10.5,
      leading: rtl ? 1.85 : 1.55,
      color: COLOR.inkSoft,
    },
    figureValue: {
      font: display,
      size: rtl ? 20 : 22,
      leading: 1.3,
      color: COLOR.accent,
    },
    figureLabel: {
      font: body,
      size: rtl ? 10 : 9.5,
      leading: rtl ? 1.6 : 1.4,
      color: COLOR.inkSoft,
    },
    footer: { font: body, size: 8.5, leading: 1.2, color: COLOR.muted },
  } satisfies Record<string, TextStyle>;
}

// Exported (along with `featuresFor` and `visualOrderLigatures`) for the
// payment receipt (convex/lib/payments/receiptPdf.ts), which sets Arabic
// names with the same measured fixes.
export const RTL_TEXT = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u;

// Kerning DISABLED in Arabic words, and only there. Measured: Plex Sans
// Arabic moves the letter following a ر ("تقرير") by 90/1000 em, and text
// extractors (pdf.js, Firefox's) read that gap as a space — "تقر ير".
// Without kerning, the lost visual gap is half a point; extraction, however,
// returns the whole word. Latin keeps its kerning.
type Features = PDFKit.Mixins.TextOptions['features'];
export function featuresFor(text: string): Features {
  return RTL_TEXT.test(text)
    ? ({ kern: false } as unknown as Features)
    : undefined;
}

// ToUnicode of Arabic LIGATURES, written in VISUAL order.
//
// The content stream draws an Arabic word in visual order (left to right,
// hence against the reading direction) — that is what fontkit produces, and
// what Chromium's PDFs do as well. Extractors put this stream back into
// logical order by REVERSING it character by character. A ligature (لا, لإ,
// تر, ين…) is a single glyph worth two letters: pdfkit maps it to its letters
// in logical order, the reversal swaps them, and "الإصدار" read back as
// "اإلصدار" (measured with pdf.js). Writing the mapping in visual order makes
// the stream CONSISTENT: reversed as a block, it gives back the right text.
// Readers that honour `/ActualText` (Acrobat, Poppler, screen readers) read
// the line's logical text anyway.
//
// Access to an internal pdfkit field (`_fontFamilies`, `unicode`): the
// "الإصدار" test in render.test.ts fails if a pdfkit version moves it.
export function visualOrderLigatures(doc: PDFKit.PDFDocument) {
  const families = (
    doc as unknown as {
      _fontFamilies?: Record<string, { unicode?: number[][] }>;
    }
  )._fontFamilies;
  const seen = new Set<unknown>();
  for (const font of Object.values(families ?? {})) {
    // A font is stored under two keys (registration name and PostScript name):
    // reversing it twice would cancel it out.
    if (seen.has(font)) continue;
    seen.add(font);
    for (const cps of font.unicode ?? []) {
      if (
        cps.length > 1 &&
        cps.every((c) => RTL_TEXT.test(String.fromCodePoint(c)))
      ) {
        cps.reverse();
      }
    }
  }
}

export async function renderReportPdf(
  input: ReportPdfInput,
): Promise<ReportPdf> {
  const fonts = loadFonts();
  const rtl = isRtlLocale(input.locale);
  const base: Direction = rtl ? 'rtl' : 'ltr';
  const S = styles(rtl);
  const labels = REPORT_PDF_LABELS[input.locale];

  const doc = new PDFDocument({
    size: 'A4',
    margins: {
      top: MARGIN.top,
      bottom: 0,
      left: MARGIN.side,
      right: MARGIN.side,
    },
    pdfVersion: '1.7',
    // Accessibility: tagged PDF (structure tree + /MarkInfo), document language
    // in the catalogue, title shown instead of the file name.
    tagged: true,
    lang: input.locale,
    displayTitle: true,
    bufferPages: true,
    // Default font = an EMBEDDED font: otherwise pdfkit loads Helvetica from its
    // AFM files, which are absent from an action bundle.
    font: fonts.body as unknown as string,
    info: {
      Title: input.title,
      Author: labels.publisher,
      Subject: input.intro.slice(0, 500),
      Keywords: `${labels.eyebrow}, ${input.year}, ${labels.publisher}`,
      Creator: labels.publisher,
    },
  });
  for (const [key, data] of Object.entries(fonts)) doc.registerFont(key, data);

  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve, reject) => {
    doc.on('end', () => resolve());
    doc.on('error', reject);
  });

  // A Latin font does not have Arabic glyphs: an Arabic name in a French report
  // switches to Plex Sans Arabic, which also carries Latin.
  const fontFor = (style: TextStyle, text: string): FontKey => {
    if (rtl || !RTL_TEXT.test(text)) return style.font;
    return style.font === 'body' ? 'arabic' : 'arabicBold';
  };
  const measureWith = (style: TextStyle) => (text: string) =>
    doc
      .font(fontFor(style, text))
      .fontSize(style.size)
      .widthOfString(text, { features: featuresFor(text) });

  const root = doc.struct('Document');
  doc.addStructure(root);

  let y = MARGIN.top;
  const newPage = () => {
    doc.addPage();
    y = MARGIN.top;
  };
  const ensure = (height: number) => {
    if (y + height > BOTTOM) newPage();
  };

  // A text block: resolved words, broken lines, each line placed in visual
  // order and linked to its structure element. The line of a right-to-left text
  // carries its LOGICAL text in `/ActualText`: that is what a screen reader and
  // a copy-paste must return, whatever the order in which the words are drawn.
  const block = (
    element: PDFKit.PDFStructureElement,
    text: string,
    style: TextStyle,
    opts: { width?: number; x?: number; keepLines?: number } = {},
  ) => {
    const width = opts.width ?? CONTENT_WIDTH;
    const x0 = opts.x ?? MARGIN.side;
    const measure = measureWith(style);
    const spaceWidth = measure(' ');
    const lines = breakLines(tokenize(text, base), width, measure, spaceWidth);
    const lineHeight = style.size * style.leading;
    ensure(lineHeight * Math.min(lines.length, opts.keepLines ?? 2));
    for (const line of lines) {
      ensure(lineHeight);
      const placed = placeLine(line, base, width, measure, spaceWidth);
      const content = rtl
        ? doc.markStructureContent('Span', { actual: logicalText(line) })
        : doc.markStructureContent('Span');
      doc.fillColor(style.color);
      for (const piece of placed) {
        doc
          .font(fontFor(style, piece.text))
          .fontSize(style.size)
          .text(
            piece.text,
            x0 + piece.x,
            y + (lineHeight - style.size * 1.2) / 2,
            {
              lineBreak: false,
              features: featuresFor(piece.text),
            },
          );
      }
      doc.endMarkedContent();
      element.add(content);
      y += lineHeight;
    }
  };

  // Decoration: never read by a screen reader (layout artifact).
  const artifact = (draw: () => void) => {
    doc.markContent('Artifact', { type: 'Layout' });
    draw();
    doc.endMarkedContent();
  };

  // --- Cover page ----------------------------------------------------------
  artifact(() => {
    doc.rect(0, 0, PAGE.width, 10).fill(COLOR.accent);
  });

  const eyebrow = doc.struct('P');
  root.add(eyebrow);
  const eyebrowText = input.inaugural
    ? `${labels.eyebrow} · ${input.year} · ${labels.inaugural}`
    : `${labels.eyebrow} · ${input.year}`;
  block(eyebrow, eyebrowText, S.eyebrow);
  eyebrow.end();
  y += 10;

  const h1 = doc.struct('H1');
  root.add(h1);
  block(h1, input.title, S.title);
  h1.end();
  y += 12;

  const intro = doc.struct('P');
  root.add(intro);
  block(intro, input.intro, S.intro);
  intro.end();
  y += 18;

  artifact(() => {
    doc
      .moveTo(MARGIN.side, y)
      .lineTo(PAGE.width - MARGIN.side, y)
      .lineWidth(0.75)
      .strokeColor(COLOR.line)
      .stroke();
  });
  y += 22;

  // --- Key figures: a grid of three, read in the language's direction -------
  if (input.keyFigures.length > 0) {
    const sect = doc.struct('Sect');
    root.add(sect);
    const h = doc.struct('H2');
    sect.add(h);
    block(h, labels.keyFigures, S.h2, { keepLines: 3 });
    h.end();
    y += 6;
    const list = doc.struct('L');
    sect.add(list);
    const cols = 3;
    const gutter = 16;
    const colWidth = (CONTENT_WIDTH - gutter * (cols - 1)) / cols;
    for (let i = 0; i < input.keyFigures.length; i += cols) {
      const row = input.keyFigures.slice(i, i + cols);
      const rowTop = y;
      let rowBottom = y;
      row.forEach((fig, c) => {
        const col = rtl ? cols - 1 - c : c;
        const x = MARGIN.side + col * (colWidth + gutter);
        y = rowTop;
        const li = doc.struct('LI');
        list.add(li);
        const lbl = doc.struct('Lbl');
        li.add(lbl);
        block(lbl, fig.value, S.figureValue, { width: colWidth, x });
        lbl.end();
        const lbody = doc.struct('LBody');
        li.add(lbody);
        block(lbody, fig.label, S.figureLabel, { width: colWidth, x });
        lbody.end();
        li.end();
        rowBottom = Math.max(rowBottom, y);
      });
      y = rowBottom + 14;
    }
    list.end();
    sect.end();
    y += 10;
  }

  // --- Chapters ------------------------------------------------------------
  for (const chapter of input.chapters) {
    const sect = doc.struct('Sect');
    root.add(sect);
    y += 8;
    // A heading is never left alone at the bottom of a page: it takes two lines
    // of the following paragraph with it.
    ensure(S.h2.size * S.h2.leading + 2 * S.p.size * S.p.leading);
    doc.outline.addItem(chapter.heading);
    const h = doc.struct('H2');
    sect.add(h);
    block(h, chapter.heading, S.h2);
    h.end();
    y += 6;
    for (const para of chapter.body) {
      const p = doc.struct('P');
      sect.add(p);
      block(p, para, S.p);
      p.end();
      y += S.p.size * 0.7;
    }
    sect.end();
  }

  root.end();

  // --- Footer, placed once the page count is known -------------------------
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.markContent('Artifact', { type: 'Pagination' });
    const footY = PAGE.height - MARGIN.bottom + 30;
    doc
      .moveTo(MARGIN.side, footY - 8)
      .lineTo(PAGE.width - MARGIN.side, footY - 8)
      .lineWidth(0.5)
      .strokeColor(COLOR.line)
      .stroke();
    const left = rtl ? pageLabel(labels, i + 1, range.count) : labels.publisher;
    const right = rtl
      ? labels.publisher
      : pageLabel(labels, i + 1, range.count);
    const footerFont = rtl ? 'arabic' : 'body';
    doc.fillColor(S.footer.color).font(footerFont).fontSize(S.footer.size);
    // Arabic pagination ("الصفحة 1 من 3") goes through the same bidirectional
    // placement as the body: placed as a block, fontkit would reverse its digits
    // too.
    const drawAt = (text: string, align: 'left' | 'right') => {
      const measure = measureWith({ ...S.footer, font: footerFont });
      const spaceWidth = measure(' ');
      const tokens = tokenize(text, base);
      const width = measure(text) + spaceWidth * 2;
      const placed = placeLine(tokens, base, width, measure, spaceWidth);
      const x0 =
        align === 'left' ? MARGIN.side : PAGE.width - MARGIN.side - width;
      for (const piece of placed) {
        doc
          .font(fontFor(S.footer, piece.text))
          .text(piece.text, x0 + piece.x, footY, {
            lineBreak: false,
            features: featuresFor(piece.text),
          });
      }
    };
    drawAt(left, 'left');
    drawAt(right, 'right');
    doc.endMarkedContent();
  }

  visualOrderLigatures(doc);
  doc.end();
  await done;
  const all = Buffer.concat(chunks);
  const bytes = new Uint8Array(all.byteLength);
  bytes.set(all);
  return { bytes, pages: range.count };
}
