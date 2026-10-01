// FROM POSITIONED TEXT TO BLOCKS — pure logic, no PDF library.
//
// A PDF has no paragraphs: it has strings drawn at coordinates. Translating
// line by line would break sentences in the middle (a translation does not
// fall on the same words at the end of each line), so lines are grouped back
// into BLOCKS — a paragraph, a heading, a table cell, a caption — each
// translated as a whole and set again in the rectangle it occupied.
//
// The grouping is geometric and deliberately conservative: two lines join
// the same block only if they share size, style, alignment and a regular
// line spacing. Splitting a paragraph in two costs a little fluency; merging
// two columns would mix their sentences.

export type FontStyle = { bold: boolean; italic: boolean; serif: boolean };

/** A piece of text as the extractor reports it, in page user space. */
export type PositionedText = {
  str: string;
  /** Baseline origin. */
  x: number;
  y: number;
  width: number;
  size: number;
  style: FontStyle;
  /** Rotated or skewed text: never moved, never translated. */
  rotated: boolean;
};

export type Alignment = 'left' | 'right' | 'center' | 'justify';

export type BlockLine = { x0: number; x1: number; y: number; text: string };

export type Block = {
  id: number;
  lines: BlockLine[];
  text: string;
  size: number;
  style: FontStyle;
  alignment: Alignment;
  /** Distance between two baselines (the size × 1.2 for a single line). */
  lineGap: number;
  /** Bounding box: left, right, top (above the first line), bottom. */
  x0: number;
  x1: number;
  top: number;
  bottom: number;
  /** Something to translate: letters, and not rotated. */
  translatable: boolean;
  /**
   * Letter-spaced text (`R A P P O R T`): the extractor sees each letter as a
   * word. The text is joined back, and the spacing re-applied when set.
   */
  letterSpaced: boolean;
};

type Segment = {
  x0: number;
  x1: number;
  y: number;
  size: number;
  style: FontStyle;
  text: string;
  rotated: boolean;
  /** Preceded on its line by a bullet or a list number: a list item starts. */
  listItem?: boolean;
};

// A bullet sign or a list number standing alone before a line of text.
const LIST_MARKER = /^([•◦▪▫‣⁃∙·●○■□➢➤►–—-]|\d{1,2}[.)])$/u;
const LIST_PREFIX = /^([•◦▪▫‣⁃∙●○■□➢➤►]|\d{1,2}[.)])\s/u;

/**
 * Letter-spaced text, as the extractor returns it: most "words" are single
 * letters. Joined back without spaces — word boundaries are lost in the
 * extraction, and restoring them is left to the translator, which reads
 * "RAPPORTANNUEL" as easily as a person does.
 */
export function joinLetterSpaced(text: string): string | null {
  const tokens = text.split(' ').filter(Boolean);
  if (tokens.length < 6) return null;
  const single = tokens.filter((t) => [...t].length === 1).length;
  if (single / tokens.length < 0.7) return null;
  return tokens.join('');
}

const LETTER = /\p{L}/u;

function sameStyle(a: FontStyle, b: FontStyle): boolean {
  return a.bold === b.bold && a.serif === b.serif;
}

/** The style shared by most characters of a list of pieces. */
function dominantStyle(
  pieces: { style: FontStyle; weight: number }[],
): FontStyle {
  const counts = new Map<string, { style: FontStyle; n: number }>();
  for (const p of pieces) {
    const key = `${p.style.bold}|${p.style.italic}|${p.style.serif}`;
    const entry = counts.get(key) ?? { style: p.style, n: 0 };
    entry.n += p.weight;
    counts.set(key, entry);
  }
  let best = { style: pieces[0].style, n: -1 };
  for (const e of counts.values()) if (e.n > best.n) best = e;
  return best.style;
}

/**
 * Lines, then segments: pieces on one baseline, split wherever a gap is
 * wider than a word space allows (table columns, chart labels, a footer's
 * left and right parts).
 */
function segmentsOf(items: PositionedText[]): Segment[] {
  const pieces = items
    .filter((it) => it.str.length > 0)
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: PositionedText[][] = [];
  for (const it of pieces) {
    const line = lines.find(
      (l) =>
        Math.abs(l[0].y - it.y) < 0.3 * Math.max(l[0].size, it.size) &&
        !l[0].rotated &&
        !it.rotated,
    );
    if (line) line.push(it);
    else lines.push([it]);
  }

  const segments: Segment[] = [];
  for (const line of lines) {
    line.sort((a, b) => a.x - b.x);
    let current: PositionedText[] = [];
    const flush = () => {
      const visible = current.filter((p) => p.str.trim() !== '');
      if (visible.length > 0) {
        let text = '';
        let prevEnd: number | null = null;
        for (const p of current) {
          if (
            prevEnd !== null &&
            p.x - prevEnd > 0.15 * p.size &&
            !text.endsWith(' ') &&
            !p.str.startsWith(' ')
          ) {
            text += ' ';
          }
          text += p.str;
          prevEnd = p.x + p.width;
        }
        segments.push({
          x0: visible[0].x,
          x1: Math.max(...visible.map((p) => p.x + p.width)),
          y: visible[0].y,
          size: Math.max(...visible.map((p) => p.size)),
          style: dominantStyle(
            visible.map((p) => ({ style: p.style, weight: p.str.length })),
          ),
          text: text.replace(/\s+/g, ' ').trim(),
          rotated: visible.some((p) => p.rotated),
        });
      }
      current = [];
    };
    for (const p of line) {
      const last = current[current.length - 1];
      if (last) {
        const gap = p.x - (last.x + last.width);
        const wideSpace =
          last.str.trim() === '' && last.width > 1.5 * last.size;
        if (gap > 1.5 * Math.max(p.size, last.size) || wideSpace) flush();
      }
      // A space piece wide enough to be a column gap separates segments
      // and belongs to neither.
      if (p.str.trim() === '' && p.width > 1.5 * p.size) {
        flush();
        continue;
      }
      current.push(p);
    }
    flush();
  }
  return segments;
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}

function alignmentOf(lines: BlockLine[], size: number): Alignment {
  if (lines.length < 2) return 'left';
  const tol = 0.6 * size;
  const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
  const lefts = lines.map((l) => l.x0);
  const rights = lines.map((l) => l.x1);
  const centers = lines.map((l) => (l.x0 + l.x1) / 2);
  const leftAligned = spread(lefts) < tol;
  const allButLast = rights.slice(0, -1);
  // Justified: every line but the last reaches the same right edge. It takes
  // three lines to see it — the first line of a two-line block always
  // "reaches" its own right edge.
  if (
    leftAligned &&
    lines.length >= 3 &&
    spread(allButLast) < tol &&
    spread(rights) >= tol / 2
  ) {
    return 'justify';
  }
  if (leftAligned) return 'left';
  if (spread(rights) < tol) return 'right';
  if (spread(centers) < tol) return 'center';
  return 'left';
}

/** A bullet drawn as a shape (see `Mark` in contentStream.ts). */
export type ShapeMarker = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  kind: 'fill' | 'stroke' | 'image';
};

/** Groups a page's text into blocks, top to bottom. */
export function buildBlocks(
  items: PositionedText[],
  shapes: ShapeMarker[] = [],
): Block[] {
  const segments = segmentsOf(items).sort((a, b) => b.y - a.y || a.x0 - b.x0);
  for (const seg of segments) {
    // The marker is either a segment of its own, left of the text, or the
    // first character of the segment itself.
    seg.listItem =
      LIST_PREFIX.test(seg.text) ||
      shapes.some((m) => {
        // Only a small filled shape is a bullet.
        if (m.kind !== 'fill' || m.x1 - m.x0 > 8 || m.y1 - m.y0 > 8)
          return false;
        const middle = (m.y0 + m.y1) / 2;
        return (
          m.x1 <= seg.x0 + 1 &&
          seg.x0 - m.x1 < 3 * seg.size &&
          middle > seg.y - 0.2 * seg.size &&
          middle < seg.y + 0.8 * seg.size
        );
      }) ||
      segments.some(
        (m) =>
          m !== seg &&
          LIST_MARKER.test(m.text) &&
          Math.abs(m.y - seg.y) < 0.3 * seg.size &&
          m.x1 <= seg.x0 + 1 &&
          seg.x0 - m.x1 < 3 * seg.size,
      );
  }
  type Open = { lines: Segment[]; style: FontStyle; size: number };
  const groups: Open[] = [];

  for (const seg of segments) {
    let target: Open | undefined;
    // A list item starts its own block: its translation must stay next to
    // its bullet, not flow into the previous item.
    for (const g of seg.listItem ? [] : groups) {
      const last = g.lines[g.lines.length - 1];
      if (seg.rotated || last.rotated) continue;
      if (Math.abs(seg.size - g.size) > 0.12 * g.size) continue;
      if (!sameStyle(seg.style, g.style)) continue;
      const gap = last.y - seg.y;
      if (gap < 0.8 * g.size || gap > 1.9 * g.size) continue;
      if (g.lines.length >= 2) {
        const previousGap = g.lines[g.lines.length - 2].y - last.y;
        if (Math.abs(gap - previousGap) > 0.25 * previousGap) continue;
      }
      const shared = overlap(seg.x0, seg.x1, last.x0, last.x1);
      const narrower = Math.min(seg.x1 - seg.x0, last.x1 - last.x0);
      const leftAligned = Math.abs(seg.x0 - last.x0) < 0.6 * g.size;
      if (!leftAligned && shared < 0.5 * narrower) continue;
      target = g;
      break;
    }
    if (target) target.lines.push(seg);
    else groups.push({ lines: [seg], style: seg.style, size: seg.size });
  }

  return groups.map((g, id) => {
    const lines: BlockLine[] = g.lines.map((l) => ({
      x0: l.x0,
      x1: l.x1,
      y: l.y,
      text: l.text,
    }));
    // A word hyphenated at the end of a line is joined back.
    const text = lines.reduce((acc, l) => {
      if (!acc) return l.text;
      if (/\p{L}-$/u.test(acc) && /^\p{Ll}/u.test(l.text))
        return acc.slice(0, -1) + l.text;
      return `${acc} ${l.text}`;
    }, '');
    const joined = lines.length === 1 ? joinLetterSpaced(text) : null;
    const gaps = lines.slice(1).map((l, i) => lines[i].y - l.y);
    const lineGap =
      gaps.length > 0
        ? gaps.sort((a, b) => a - b)[Math.floor(gaps.length / 2)]
        : 1.2 * g.size;
    const x0 = Math.min(...lines.map((l) => l.x0));
    const x1 = Math.max(...lines.map((l) => l.x1));
    return {
      id,
      lines,
      text: joined ?? text,
      size: g.size,
      style: dominantStyle(
        g.lines.map((l) => ({ style: l.style, weight: l.text.length })),
      ),
      alignment: alignmentOf(lines, g.size),
      lineGap,
      x0,
      x1,
      top: lines[0].y + 0.8 * g.size,
      bottom: lines[lines.length - 1].y - 0.25 * g.size,
      translatable: LETTER.test(text) && !g.lines.some((l) => l.rotated),
      letterSpaced: joined !== null,
    };
  });
}

/** Is this point the origin of a line of this block? */
export function blockContains(block: Block, x: number, y: number): boolean {
  const tol = 0.35 * block.size;
  return block.lines.some(
    (l) => Math.abs(l.y - y) < tol && x >= l.x0 - tol && x <= l.x1 + tol,
  );
}
