'use node';

import PDFDocument from 'pdfkit';
import { loadFonts, type FontKey } from '../reportPdf/fonts';
import { featuresFor, visualOrderLigatures } from '../reportPdf/render';
import {
  breakLines,
  placeLine,
  tokenize,
  type Direction,
  type Token,
} from '../reportPdf/layout';
import type { Block } from './blocks';

// SETTING THE TRANSLATED TEXT — one overlay page per original page.
//
// Each translated block is set in the rectangle its original occupied: same
// first baseline, same width, same line spacing, same colour, same
// alignment. A translation is rarely as long as its source, so the size is
// fitted: the block keeps its original size if the text fits, and is reduced
// step by step — never below MIN_SCALE — when it does not. A single line (a
// heading, a label) may first grow sideways into the free space next to it.
//
// THE FONTS ARE THE SITE'S (IBM Plex Sans, Newsreader, IBM Plex Sans Arabic),
// not the original's: a PDF embeds only the glyphs it uses, so the original
// fonts cannot set words they never contained. The original's style is kept
// — serif or sans, bold or regular.
//
// Arabic is set right to left with the word-level bidirectional layout of the
// annual report PDF (`../reportPdf/layout.ts`) and its measured fixes for
// shaping and extraction (`featuresFor`, `visualOrderLigatures`).

// Arabic letters, and what reads left to right inside an Arabic sentence.
const ARABIC_RUN =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]+/gu;

/**
 * Splits a word that mixes Arabic letters with digits or Latin letters
 * (`و2025`, "and 2025") into parts set without a space between them.
 *
 * The word-level layout gives a word ONE direction; fontkit then reverses a
 * right-to-left word as a whole, digits included, and `و2025` came out as
 * `5202و` (measured). Split, the digits form a left-to-right run of their
 * own, placed where they belong.
 */
export function splitMixedScripts(tokens: Token[]): Token[] {
  const out: Token[] = [];
  for (const tok of tokens) {
    const parts: { text: string; rtl: boolean }[] = [];
    let last = 0;
    for (const m of tok.text.matchAll(ARABIC_RUN)) {
      const start = m.index ?? 0;
      if (start > last)
        parts.push({ text: tok.text.slice(last, start), rtl: false });
      parts.push({ text: m[0], rtl: true });
      last = start + m[0].length;
    }
    if (last < tok.text.length)
      parts.push({ text: tok.text.slice(last), rtl: false });
    const mixed =
      parts.some((p) => p.rtl) &&
      parts.some((p) => !p.rtl && /[\p{L}\p{N}]/u.test(p.text));
    if (!mixed) {
      out.push(tok);
      continue;
    }
    parts.forEach((p, i) =>
      out.push({
        text: p.text,
        dir: p.rtl ? 'rtl' : /[\p{L}\p{N}]/u.test(p.text) ? 'ltr' : tok.dir,
        spaceBefore: i === 0 ? tok.spaceBefore : false,
      }),
    );
  }
  return out;
}

/** Slant of the synthetic italic (tan 12°): the site's fonts have no italic. */
const ITALIC_SLANT = 0.21;

/** Smallest size a block is reduced to, as a share of its original size. */
export const MIN_SCALE = 0.72;
const SCALE_STEP = 0.04;

export type PlacedBlock = {
  block: Block;
  text: string;
  color: string;
  /** Free space around a single line: how far it may grow sideways. */
  leftLimit: number;
  rightLimit: number;
  /** Lowest the text may reach: the next text, rule, image or box edge. */
  bottomLimit: number;
};

export type OverlayPage = {
  x0: number;
  y0: number;
  width: number;
  height: number;
  blocks: PlacedBlock[];
};

export type OverlayStats = {
  blocks: number;
  shrunk: number;
  overflowing: number;
};

function fontFor(block: Block, rtl: boolean): FontKey {
  if (rtl) return block.style.bold ? 'arabicBold' : 'arabic';
  if (block.style.serif) return 'display';
  return block.style.bold ? 'bodyBold' : 'body';
}

/** Width a block's text may take, given its alignment and its neighbours. */
function availableWidth(p: PlacedBlock): { x: number; width: number } {
  const { block } = p;
  if (block.lines.length > 1)
    return { x: block.x0, width: block.x1 - block.x0 };
  // A single line was exactly as wide as its text: the translation may use
  // the free space on the side the text grows towards.
  switch (block.alignment) {
    case 'right':
      return { x: p.leftLimit, width: block.x1 - p.leftLimit };
    case 'center': {
      const center = (block.x0 + block.x1) / 2;
      const half = Math.min(center - p.leftLimit, p.rightLimit - center);
      return { x: center - half, width: 2 * half };
    }
    default:
      return { x: block.x0, width: p.rightLimit - block.x0 };
  }
}

/**
 * Paragraphs of the same style on a page share their reduced size when the
 * reduction is slight: one paragraph set smaller than its neighbours shows
 * more than all of them set a little smaller. Beyond this, a block that
 * needs much more room is reduced alone.
 */
export const HARMONIZE_FLOOR = 0.85;

type Fitted = {
  placed: PlacedBlock;
  font: FontKey;
  area: { x: number; width: number };
  tracking: number;
  scale: number;
  layout: (size: number) => {
    lines: Token[][];
    measure: (t: string) => number;
    space: number;
    size: number;
  };
  result: {
    lines: Token[][];
    measure: (t: string) => number;
    space: number;
    size: number;
  };
  fits: (r: { lines: Token[][]; size: number }) => boolean;
};

export async function renderOverlay(
  pages: OverlayPage[],
  targetLocale: string,
): Promise<{ bytes: Uint8Array; stats: OverlayStats }> {
  const rtl = targetLocale === 'ar';
  const dir: Direction = rtl ? 'rtl' : 'ltr';
  const fonts = loadFonts();
  const doc = new PDFDocument({
    autoFirstPage: false,
    compress: true,
    // Default font = an EMBEDDED one: otherwise pdfkit loads Helvetica from
    // its AFM files, which are absent from an action bundle (the same fix
    // as the annual report PDF).
    font: fonts.body as unknown as string,
  });
  for (const [key, data] of Object.entries(fonts)) doc.registerFont(key, data);
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((resolve) => doc.on('end', () => resolve()));
  const stats: OverlayStats = { blocks: 0, shrunk: 0, overflowing: 0 };

  /** Fits one block: the largest size, down to MIN_SCALE, that holds it. */
  const fit = (placed: PlacedBlock): Fitted => {
    const { block } = placed;
    const font = fontFor(block, rtl);
    const area = availableWidth(placed);
    const singleLine = block.lines.length === 1;
    // Height the text may take: from the top of its first line down to the
    // next obstacle — a longer translation uses free space below before
    // being reduced. Never less than the original took.
    const available = Math.max(
      block.top - block.bottom,
      block.top - placed.bottomLimit,
    );

    // Letter spacing of the original, in points per character: what its
    // line measured, minus what its letters take set without spacing.
    // Not in Arabic: spacing letters apart breaks the joins between them.
    let tracking = 0;
    if (block.letterSpaced && !rtl) {
      doc.font(font).fontSize(block.size);
      const chars = [...block.text].length;
      const natural = doc.widthOfString(block.text);
      tracking = Math.max(
        0,
        (block.x1 - block.x0 - natural) / Math.max(1, chars - 1),
      );
    }

    const layout = (size: number) => {
      doc.font(font).fontSize(size);
      const characterSpacing = tracking * (size / block.size);
      const measure = (t: string) =>
        doc.widthOfString(t, { features: featuresFor(t), characterSpacing });
      const space = measure(' ');
      const lines = breakLines(
        splitMixedScripts(tokenize(placed.text, dir)),
        area.width,
        measure,
        space,
      );
      return { lines, measure, space, size };
    };
    // Same measure as `available`: ascent, line gaps, descent.
    const fits = (r: { lines: Token[][]; size: number }) =>
      singleLine
        ? r.lines.length <= 1
        : (r.lines.length - 1) * block.lineGap * (r.size / block.size) +
            1.05 * r.size <=
          available;

    let scale = 1;
    let result = layout(block.size);
    while (scale - SCALE_STEP >= MIN_SCALE - 1e-9 && !fits(result)) {
      scale -= SCALE_STEP;
      result = layout(block.size * scale);
    }
    return { placed, font, area, tracking, scale, layout, result, fits };
  };

  for (const page of pages) {
    doc.addPage({ size: [page.width, page.height], margin: 0 });
    const fitted = page.blocks.map(fit);

    // Harmonise the text of one style on the page (see HARMONIZE_FLOOR).
    // The paragraphs set the size; single lines of the same style — the
    // last line of a note, a table cell — follow it.
    const groups = new Map<string, Fitted[]>();
    for (const f of fitted) {
      const b = f.placed.block;
      const key = `${Math.round(b.size * 4)}|${b.style.bold}|${b.style.serif}|${b.style.italic}`;
      groups.set(key, [...(groups.get(key) ?? []), f]);
    }
    for (const group of groups.values()) {
      const paragraphs = group.filter((f) => f.placed.block.lines.length > 1);
      if (paragraphs.length === 0) continue;
      const floor = Math.min(...paragraphs.map((f) => f.scale));
      if (floor >= 1 || floor < HARMONIZE_FLOOR) continue;
      for (const f of group) {
        if (f.scale <= floor) continue;
        f.scale = floor;
        f.result = f.layout(f.placed.block.size * floor);
      }
    }

    for (const f of fitted) {
      const { placed, area, result } = f;
      const { block } = placed;
      stats.blocks++;
      if (f.scale < 1) stats.shrunk++;
      if (!f.fits(result)) stats.overflowing++;

      const singleLine = block.lines.length === 1;
      const size = result.size;
      const gap = block.lineGap * (size / block.size);
      // The first line keeps the original top: a reduced block shrinks
      // towards its bottom, it does not float up.
      let baseline = block.lines[0].y + 0.8 * (block.size - size);
      // Right to left, a left-aligned or justified PARAGRAPH reads
      // right-aligned within its own box. A single line keeps its alignment:
      // a heading or a label stays where the design put it.
      const alignment =
        rtl &&
        !singleLine &&
        (block.alignment === 'left' || block.alignment === 'justify')
          ? 'right'
          : block.alignment;
      const characterSpacing = f.tracking * (size / block.size);

      doc.font(f.font).fontSize(size).fillColor(placed.color);
      result.lines.forEach((line, i) => {
        const pieces = placeLine(
          line,
          dir,
          area.width,
          result.measure,
          result.space,
        );
        const left = Math.min(...pieces.map((p) => p.x));
        const right = Math.max(...pieces.map((p) => p.x + p.width));
        const lineWidth = right - left;
        const last = i === result.lines.length - 1;
        let offset = -left;
        if (alignment === 'right') offset = area.width - right;
        else if (alignment === 'center')
          offset = (area.width - lineWidth) / 2 - left;
        let wordSpacing = 0;
        if (alignment === 'justify' && !last && pieces.length === 1) {
          const spaces = (pieces[0].text.match(/ /g) ?? []).length;
          if (spaces > 0) wordSpacing = (area.width - lineWidth) / spaces;
        }
        const y = page.height - (baseline - page.y0);
        // Italic text gets a synthetic slant: the embedded families have no
        // italic, and a quotation set upright loses what marked it out.
        // Not in Arabic, which has no italic convention.
        const slanted = block.style.italic && !rtl;
        if (slanted) {
          doc.save();
          // x' = x + k·(baseline − y): the baseline stays put, the tops lean.
          doc.transform(1, 0, -ITALIC_SLANT, 1, ITALIC_SLANT * y, 0);
        }
        for (const piece of pieces) {
          doc.text(piece.text, area.x - page.x0 + offset + piece.x, y, {
            lineBreak: false,
            baseline: 'alphabetic',
            features: featuresFor(piece.text),
            ...(wordSpacing > 0 ? { wordSpacing } : {}),
            ...(characterSpacing > 0 ? { characterSpacing } : {}),
          });
        }
        if (slanted) doc.restore();
        baseline -= gap;
      });
    }
  }

  visualOrderLigatures(doc);
  doc.end();
  await done;
  return { bytes: new Uint8Array(Buffer.concat(chunks)), stats };
}
