'use node';

import { PDFDocument } from 'pdf-lib';
import { blockContains, buildBlocks, type Block } from './blocks';
import { renderOverlay, type OverlayPage, type PlacedBlock } from './compose';
import {
  locatePage,
  stripRuns,
  type Mark,
  type TextRun,
} from './contentStream';
import { extractPages } from './extract';

// TRANSLATING A PDF WHILE KEEPING ITS DESIGN — the whole pipeline.
//
//  1. extract the text with its positions (pdf.js) and group it into blocks;
//  2. locate every text-showing operator of the page (contentStream.ts),
//     which gives each block its colour and tells visible text from the
//     invisible layer a scanned PDF carries;
//  3. translate the blocks (the caller's function: a model, or a stub in
//     tests);
//  4. remove the original text of the translated blocks from the page, and
//     nothing else;
//  5. set the translations on an overlay page (compose.ts) and draw it over
//     the original page.
//
// The result is the original file — its images, backgrounds, vector
// graphics, links and metadata — with its text replaced. What is not
// translated stays exactly as it was: text without letters (figures, bullet
// signs), rotated text, invisible text, pages the reader could not parse.

export type PdfTranslateOptions = {
  targetLocale: string;
  /** Translates texts, returning as many, in the same order. */
  translate: (texts: string[]) => Promise<string[]>;
};

export type PdfTranslateStats = {
  pages: number;
  blocks: number;
  translated: number;
  shrunk: number;
  overflowing: number;
  skippedPages: number;
};

/** Gap kept between a growing line and its neighbour or the page edge. */
const SIDE_MARGIN = 28;

const SENTENCE_END = /[.!?…:;»"”)\]]$/u;
const STARTS_LOWER = /^[\p{Ll}]/u;

/**
 * Pairs a block whose sentence is not finished with the block that carries
 * it on: same size and style, starting in lower case, at the top of the next
 * column (to the right, higher on the page) or of the next page.
 *
 * @returns index of a block → index of its continuation.
 */
function continuations(
  blocks: { page: number; block: Block }[],
): Map<number, number> {
  const next = new Map<number, number>();
  const taken = new Set<number>();
  blocks.forEach((a, i) => {
    if (SENTENCE_END.test(a.block.text.trim())) return;
    let best: number | undefined;
    blocks.forEach((b, j) => {
      if (j === i || taken.has(j)) return;
      if (!STARTS_LOWER.test(b.block.text)) return;
      if (Math.abs(b.block.size - a.block.size) > 0.05 * a.block.size) return;
      if (b.block.style.bold !== a.block.style.bold) return;
      if (b.block.style.serif !== a.block.style.serif) return;
      // The next column starts HIGHER than the block it continues: side by
      // side at the same height are separate texts (key figures, table
      // cells), not one sentence split in two.
      const nextColumn =
        b.page === a.page &&
        b.block.x0 > (a.block.x0 + a.block.x1) / 2 &&
        b.block.top > a.block.top + 1.5 * a.block.size;
      const nextPage = b.page === a.page + 1;
      if (!nextColumn && !nextPage) return;
      // The highest candidate: a continuation starts at the top.
      if (best === undefined || b.block.top > blocks[best].block.top) best = j;
    });
    if (best !== undefined) {
      next.set(i, best);
      taken.add(best);
    }
  });
  return next;
}

/**
 * Splits a translation between the places its source occupied, in
 * proportion to their original lengths, at word boundaries.
 */
function shareBack(text: string, lengths: number[]): string[] {
  if (lengths.length === 1) return [text];
  const words = text.split(/\s+/).filter(Boolean);
  const total = lengths.reduce((s, n) => s + n, 0) || 1;
  const parts: string[] = [];
  let start = 0;
  let consumed = 0;
  lengths.forEach((len, k) => {
    consumed += len;
    const last = k === lengths.length - 1;
    const end = last
      ? words.length
      : Math.min(
          words.length - (lengths.length - 1 - k),
          Math.max(start + 1, Math.round((words.length * consumed) / total)),
        );
    parts.push(words.slice(start, end).join(' '));
    start = end;
  });
  return parts;
}

function dominantColor(runs: TextRun[]): string {
  const counts = new Map<string, number>();
  for (const r of runs) counts.set(r.color, (counts.get(r.color) ?? 0) + 1);
  let best = '#000000';
  let n = 0;
  for (const [color, c] of counts) {
    if (c > n) {
      best = color;
      n = c;
    }
  }
  return best;
}

/** Lowest a block's text may reach, in page space. */
function bottomLimit(
  block: Block,
  all: Block[],
  marks: Mark[],
  pageY0: number,
): number {
  const gap = 0.3 * block.size;
  let limit = pageY0 + SIDE_MARGIN;
  const sharesColumns = (x0: number, x1: number) =>
    Math.min(x1, block.x1) - Math.max(x0, block.x0) > 1;
  // Text further down in the same columns.
  for (const other of all) {
    if (other === block || !sharesColumns(other.x0, other.x1)) continue;
    if (other.top <= block.bottom + 0.5)
      limit = Math.max(limit, other.top + gap);
  }
  for (const m of marks) {
    if (!sharesColumns(m.x0, m.x1)) continue;
    if (m.y1 <= block.bottom + 0.5) {
      // A rule, a shape or an image below.
      limit = Math.max(limit, m.y1 + gap);
    } else if (
      m.kind === 'fill' &&
      m.y0 < block.bottom &&
      m.y1 >= block.top - 0.5 &&
      m.x0 <= block.x0 + 0.5 &&
      m.x1 >= block.x1 - 0.5
    ) {
      // A coloured box the block sits in: the text stays inside it.
      limit = Math.max(limit, m.y0 + gap);
    }
  }
  return Math.min(limit, block.bottom);
}

/** How far a single line may grow left and right without meeting another. */
function sideLimits(
  block: Block,
  all: Block[],
  marks: Mark[],
  pageX0: number,
  pageWidth: number,
): { leftLimit: number; rightLimit: number } {
  let leftLimit = pageX0 + SIDE_MARGIN;
  let rightLimit = pageX0 + pageWidth - SIDE_MARGIN;
  for (const other of all) {
    if (other === block) continue;
    const sharesRows = other.bottom < block.top && other.top > block.bottom;
    if (!sharesRows) continue;
    if (other.x0 >= block.x1 - 1)
      rightLimit = Math.min(rightLimit, other.x0 - 6);
    if (other.x1 <= block.x0 + 1) leftLimit = Math.max(leftLimit, other.x1 + 6);
  }
  // A coloured box the line sits in: it grows inside the box, not past it.
  for (const m of marks) {
    const contains =
      m.kind === 'fill' &&
      m.x0 <= block.x0 + 0.5 &&
      m.x1 >= block.x1 - 0.5 &&
      m.y0 <= block.bottom &&
      m.y1 >= block.top;
    if (!contains) continue;
    rightLimit = Math.min(rightLimit, m.x1 - 0.5 * block.size);
    leftLimit = Math.max(leftLimit, m.x0 + 0.5 * block.size);
  }
  return {
    leftLimit: Math.min(leftLimit, block.x0),
    rightLimit: Math.max(rightLimit, block.x1),
  };
}

export async function translatePdf(
  bytes: Uint8Array,
  options: PdfTranslateOptions,
): Promise<{ bytes: Uint8Array; stats: PdfTranslateStats }> {
  const pages = await extractPages(bytes);
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  const stats: PdfTranslateStats = {
    pages: pages.length,
    blocks: 0,
    translated: 0,
    shrunk: 0,
    overflowing: 0,
    skippedPages: 0,
  };

  // 1-2. Blocks of every page, with the runs that draw them.
  type PageWork = {
    blocks: Block[];
    marks: Mark[];
    selected: { block: Block; color: string }[];
  };
  const work: PageWork[] = pages.map((page, i) => {
    // A rotated page would need its overlay rotated too: left as is for now.
    if (page.rotate !== 0 || i >= doc.getPageCount()) {
      stats.skippedPages++;
      return { blocks: [], marks: [], selected: [] };
    }
    const { runs, marks } = locatePage(doc, doc.getPage(i));
    const blocks = buildBlocks(page.items, marks);
    stats.blocks += blocks.length;
    const selected: PageWork['selected'] = [];
    for (const block of blocks) {
      if (!block.translatable) continue;
      const mine = runs.filter((r) => blockContains(block, r.x, r.y));
      const visible = mine.filter((r) => !r.invisible);
      // Text nobody sees (the OCR layer of a scan) or that could not be
      // located in the page is not translated: drawing its translation
      // over the original would show both.
      if (visible.length === 0) continue;
      selected.push({ block, color: dominantColor(visible) });
    }
    return { blocks, marks, selected };
  });

  // 3. One call for the whole document: the caller batches as it sees fit.
  // A sentence that runs on into the next column or page is translated as
  // ONE text — translated in two halves, its grammar would not survive —
  // then shared back between its two places.
  const flat = work.flatMap((w, page) =>
    w.selected.map((s) => ({ page, block: s.block })),
  );
  const next = continuations(flat);
  const isTail = new Set(next.values());
  const units: number[][] = [];
  flat.forEach((_, i) => {
    if (isTail.has(i)) return;
    const unit = [i];
    let j = next.get(i);
    while (j !== undefined && !unit.includes(j)) {
      unit.push(j);
      j = next.get(j);
    }
    units.push(unit);
  });
  const sources = units.map((u) => u.map((i) => flat[i].block.text).join(' '));
  const translated = sources.length > 0 ? await options.translate(sources) : [];
  if (translated.length !== sources.length) {
    throw new Error('PDF_TRANSLATION_COUNT_MISMATCH');
  }
  const translations: string[] = new Array<string>(flat.length);
  units.forEach((unit, u) => {
    const parts = shareBack(
      translated[u],
      unit.map((i) => flat[i].block.text.length),
    );
    unit.forEach((i, k) => (translations[i] = parts[k]));
  });

  // 4-5. Strip, then overlay.
  let cursor = 0;
  const overlayPages: OverlayPage[] = [];
  const formsDone = new Set<string>();
  work.forEach((w, i) => {
    const page = pages[i];
    const placed: PlacedBlock[] = w.selected.map((s) => ({
      block: s.block,
      text: translations[cursor++],
      color: s.color,
      ...sideLimits(s.block, w.blocks, w.marks, page.x0, page.width),
      bottomLimit: bottomLimit(s.block, w.blocks, w.marks, page.y0),
    }));
    if (placed.length > 0) {
      const removed = stripRuns(
        doc,
        doc.getPage(i),
        (run) => placed.some((p) => blockContains(p.block, run.x, run.y)),
        formsDone,
      );
      if (!removed) {
        // Unreadable content stream: drawing over text that cannot be
        // removed would print both versions. The page stays original.
        stats.skippedPages++;
        placed.length = 0;
      }
    }
    stats.translated += placed.length;
    overlayPages.push({
      x0: page.x0,
      y0: page.y0,
      width: page.width,
      height: page.height,
      blocks: placed,
    });
  });

  const overlay = await renderOverlay(overlayPages, options.targetLocale);
  stats.shrunk = overlay.stats.shrunk;
  stats.overflowing = overlay.stats.overflowing;

  const embedded = await doc.embedPdf(
    overlay.bytes,
    overlayPages.map((_, i) => i),
  );
  embedded.forEach((page, i) => {
    if (overlayPages[i].blocks.length === 0) return;
    doc
      .getPage(i)
      .drawPage(page, { x: overlayPages[i].x0, y: overlayPages[i].y0 });
  });
  doc.setLanguage(options.targetLocale);
  return { bytes: await doc.save(), stats };
}
