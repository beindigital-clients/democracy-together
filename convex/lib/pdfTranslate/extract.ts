import type { FontStyle, PositionedText } from './blocks';

// TEXT EXTRACTION WITH POSITIONS — pdf.js, the extractor every browser
// uses. It decodes what this repo should not re-implement: font encodings,
// CID fonts, ToUnicode maps, glyph widths. What it returns is text with its
// baseline origin, width and size, in page user space — the same space the
// content stream reader works in (contentStream.ts), which is what lets the
// two be matched.

export type ExtractedPage = {
  /** Media box: the page's own coordinate frame. */
  x0: number;
  y0: number;
  width: number;
  height: number;
  rotate: number;
  items: PositionedText[];
};

const BOLD = /Bold|Black|Heavy|Semibold|SemiBold|Demi|ExtraBold|Ultra/i;
const ITALIC = /Italic|Oblique|Slanted/i;
const SERIF_NAME =
  /Serif|Times|Georgia|Garamond|Minion|Cambria|Palatino|Baskerville|Caslon|Book|Newsreader|Merriweather|Lora|Charter|Didot|Bodoni/i;

/** Style read from a font's PostScript name (`ABCDEF+Georgia-Bold`). */
export function styleFromFontName(
  name: string,
  serifHint: boolean | undefined,
): FontStyle {
  const base = name.replace(/^[A-Z]{6}\+/, '');
  const sans =
    /Sans|Grotesk|Gothic|Helvetica|Arial|Inter|Roboto|Verdana|Calibri/i.test(
      base,
    );
  return {
    bold: BOLD.test(base),
    italic: ITALIC.test(base),
    serif: serifHint ?? (!sans && SERIF_NAME.test(base)),
  };
}

type PdfJsFont = { name?: string; isSerifFont?: boolean };
type PdfJsTextItem = {
  str: string;
  transform: number[];
  width: number;
  fontName: string;
};

export async function extractPages(
  bytes: Uint8Array,
): Promise<ExtractedPage[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // In Node, pdf.js runs its "worker" in the same thread, and looks for it
  // with a dynamic import relative to its own file — a path that no longer
  // exists once Convex has bundled the action. Loading the worker module
  // here and handing it over through the global pdf.js checks first makes
  // the import unnecessary.
  // The worker entry point ships without type declarations: the `as string`
  // keeps TypeScript from resolving it (the app and test typechecks reach
  // this file too), while the emitted import keeps its literal path, which
  // the bundler follows. The lint rule sees only the types.
  const worker: unknown = await import(
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    'pdfjs-dist/legacy/build/pdf.worker.mjs' as string
  );
  (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
  // pdf.js takes ownership of the buffer it is given: a copy keeps the
  // caller's bytes usable for the rewrite that follows.
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: false,
    fontExtraProperties: true,
    verbosity: 0,
  });
  const doc = await task.promise;
  const pages: ExtractedPage[] = [];
  try {
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      // The operator list loads the fonts into `commonObjs`, where their real
      // names (and pdf.js's serif guess) can be read.
      await page.getOperatorList();
      const content = await page.getTextContent();
      const fonts = new Map<string, FontStyle>();
      const styleOf = (fontName: string): FontStyle => {
        let style = fonts.get(fontName);
        if (!style) {
          let font: PdfJsFont | null;
          try {
            font = page.commonObjs.get(fontName) as PdfJsFont;
          } catch {
            // A font pdf.js could not load: its style is read from nothing.
            font = null;
          }
          style = styleFromFontName(font?.name ?? '', font?.isSerifFont);
          fonts.set(fontName, style);
        }
        return style;
      };
      const items: PositionedText[] = [];
      for (const raw of content.items) {
        if (!('str' in raw)) continue;
        const it = raw as PdfJsTextItem;
        const [a, b, c, d, e, f] = it.transform;
        const size = Math.hypot(c, d);
        if (size <= 0) continue;
        items.push({
          str: it.str,
          x: e,
          y: f,
          width: it.width,
          size,
          style: styleOf(it.fontName),
          // Upright text has no rotation or skew; a small tolerance absorbs
          // rounding in the producer's matrices.
          rotated:
            Math.abs(b) > 0.01 * size || Math.abs(c) > 0.01 * size || a <= 0,
        });
      }
      const [x0, y0, x1, y1] = page.view;
      pages.push({
        x0,
        y0,
        width: x1 - x0,
        height: y1 - y0,
        rotate: page.rotate,
        items,
      });
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }
  return pages;
}
