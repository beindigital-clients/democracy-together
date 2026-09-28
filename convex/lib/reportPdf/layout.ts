// BIDIRECTIONAL LINE LAYOUT of the annual report PDF (F-41).
//
// PURE module: it knows neither pdfkit nor fonts, only a measuring function.
// That is what makes it testable without generating a PDF, and what keeps the
// "where does each word go" decision in one place.
//
// WHAT THE LIBRARY DOES, AND WHAT IT DOES NOT. pdfkit delegates shaping a
// word to fontkit, which applies the font's OpenType tables: that is where
// Arabic gets its contextual forms (initial, medial, final) and its ligatures
// (lam-alif). An Arabic word passed alone to pdfkit therefore comes out
// correctly joined. What neither of them does is the ORDER of words in a
// mixed line: fontkit reverses the whole string when it is right-to-left —
// digits and Latin names included, "2026" becoming "6202" — and pdfkit, when
// splitting its spaces, puts them back in the wrong place (measured:
// "تقرير النشاط" came out glued together, the space pushed to the start of
// the line).
//
// Hence this module: a WORD-level version of the Unicode bidirectional
// algorithm (UAX #9), sufficient for prose — each word gets a strong
// direction (Arabic → right-to-left, Latin or digit → left-to-right), neutral
// characters take that of their neighbours when those surround them and that
// of the paragraph otherwise, and a sequence of words with the same direction
// forms a "run" placed as a block. Paired characters (parentheses, quotation
// marks) in a right-to-left run are mirrored (rule L4). What this splitting
// does not cover — a word mixing both scripts WITHOUT a space, nested
// embeddings — does not occur in an activity report; it is documented in
// docs/backlog/editorial.md.

export type Direction = 'ltr' | 'rtl';

export type Token = {
  text: string;
  /** Resolved direction of the word. */
  dir: Direction;
  /** Does a space separate it from the LOGICALLY previous word? */
  spaceBefore: boolean;
};

// Right-to-left scripts served by the site: Arabic (basic, supplement,
// extended-A blocks, presentation forms A and B). Hebrew is not a site
// language, but a Hebrew proper noun in an Arabic report would be misplaced
// without it: it is counted.
const RTL_CHAR =
  /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u;
const STRONG_LTR = /[\p{L}\p{N}]/u;
// Everything that is neither a letter nor a digit: punctuation, dashes,
// symbols.
const NEUTRAL = /[^\p{L}\p{N}]/u;

function strongDir(text: string): Direction | null {
  if (RTL_CHAR.test(text)) return 'rtl';
  if (STRONG_LTR.test(text)) return 'ltr';
  return null;
}

// Splits a word (without spaces) into [leading punctuation][core][trailing
// punctuation]. "Together:" gives "Together" and ":", so that the colon is
// placed according to the surrounding text and not the Latin word it
// follows. INTERNAL punctuation ("CC-BY", "2026-2027", "l'Afrique") stays in
// the core.
function splitWord(word: string): string[] {
  const chars = [...word];
  let start = 0;
  let end = chars.length;
  while (start < end && NEUTRAL.test(chars[start])) start++;
  while (end > start && NEUTRAL.test(chars[end - 1])) end--;
  if (start === end) return [word];
  const out: string[] = [];
  if (start > 0) out.push(chars.slice(0, start).join(''));
  out.push(chars.slice(start, end).join(''));
  if (end < chars.length) out.push(chars.slice(end).join(''));
  return out;
}

// Mirrored pairs (Unicode BidiMirroring, subset useful in prose).
const MIRROR: Record<string, string> = {
  '(': ')',
  ')': '(',
  '[': ']',
  ']': '[',
  '{': '}',
  '}': '{',
  '<': '>',
  '>': '<',
  '«': '»',
  '»': '«',
  '‹': '›',
  '›': '‹',
};

export function mirror(text: string): string {
  return [...text].map((c) => MIRROR[c] ?? c).join('');
}

/**
 * Splits a paragraph into words with a resolved direction.
 *
 * Neutrals between two words of the same direction take it; the others take
 * the paragraph's (rules N1/N2 of UAX #9, at word granularity).
 */
export function tokenize(text: string, base: Direction): Token[] {
  const raw: { text: string; strong: Direction | null; space: boolean }[] = [];
  const words = text.split(/(\s+)/u);
  let pendingSpace = false;
  for (const w of words) {
    if (w === '') continue;
    if (/^\s+$/u.test(w)) {
      pendingSpace = true;
      continue;
    }
    splitWord(w).forEach((part, i) => {
      raw.push({
        text: part,
        strong: strongDir(part),
        space: i === 0 ? pendingSpace : false,
      });
    });
    pendingSpace = false;
  }
  return raw.map((tok, i) => {
    if (tok.strong)
      return { text: tok.text, dir: tok.strong, spaceBefore: tok.space };
    let prev: Direction | null = null;
    for (let j = i - 1; j >= 0 && prev === null; j--) prev = raw[j].strong;
    let next: Direction | null = null;
    for (let j = i + 1; j < raw.length && next === null; j++)
      next = raw[j].strong;
    const dir = prev !== null && prev === next ? prev : base;
    return { text: tok.text, dir, spaceBefore: tok.space };
  });
}

export type Measure = (text: string) => number;

const NO_BREAK_BEFORE = /^[:;!?»›%]+$/u;

/**
 * Splits words into lines of maximum width `width` (greedy).
 *
 * We break ONLY AT A SPACE: punctuation detached by `tokenize` stays attached
 * to the word it follows. Without this rule, the Arabic comma at the end of a
 * line went alone to the start of the next line (measured on the 2026
 * report: "، والأزمات العالمية").
 */
export function breakLines(
  tokens: Token[],
  width: number,
  measure: Measure,
  spaceWidth: number,
): Token[][] {
  // A word wider than the line (address, identifier) is broken at the
  // character: it is the site's `wrap-anywhere`, transposed to paper.
  const pieces: Token[] = [];
  for (const tok of tokens) {
    if (measure(tok.text) <= width) {
      pieces.push(tok);
      continue;
    }
    let chunk = '';
    let first = true;
    for (const ch of [...tok.text]) {
      if (chunk && measure(chunk + ch) > width) {
        pieces.push({
          ...tok,
          text: chunk,
          // The pieces of a broken word are allowed break points.
          spaceBefore: first ? tok.spaceBefore : true,
        });
        first = false;
        chunk = '';
      }
      chunk += ch;
    }
    if (chunk)
      pieces.push({
        ...tok,
        text: chunk,
        spaceBefore: first ? tok.spaceBefore : true,
      });
  }

  // Non-breaking groups: a word and the punctuation attached to it — and, in
  // French typography, high punctuation preceded by a space (":", ";", "!",
  // "?", "»"): it never starts a line.
  const groups: Token[][] = [];
  for (const tok of pieces) {
    const last = groups[groups.length - 1];
    if (last && (!tok.spaceBefore || NO_BREAK_BEFORE.test(tok.text))) {
      last.push(tok);
    } else groups.push([tok]);
  }

  const lines: Token[][] = [];
  let line: Token[] = [];
  let used = 0;
  for (const group of groups) {
    const w = group.reduce(
      (s, t, i) =>
        s + measure(t.text) + (i > 0 && t.spaceBefore ? spaceWidth : 0),
      0,
    );
    const gap = line.length > 0 ? spaceWidth : 0;
    if (line.length > 0 && used + gap + w > width) {
      lines.push(line);
      line = [];
      used = 0;
    }
    group.forEach((tok, i) =>
      line.push(
        i === 0 && line.length === 0 ? { ...tok, spaceBefore: false } : tok,
      ),
    );
    used += (line.length > group.length ? gap : 0) + w;
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

export type Placed = {
  text: string;
  dir: Direction;
  /** X-coordinate of the chunk's LEFT edge, relative to the start of the area. */
  x: number;
  width: number;
};

/**
 * Places a line's words in VISUAL order.
 *
 * Consecutive words with the same direction form a run. In a right-to-left
 * paragraph, runs are laid out right to left in logical order; within a
 * left-to-right run, words keep their reading order. The mirror image the
 * other way round.
 *
 * A left-to-right run is rendered as A SINGLE CHUNK, spaces included: pdfkit
 * can lay out a Latin string, and one chunk per run rather than per word
 * keeps text extraction intact. A right-to-left run is rendered word by word:
 * it is the only way to avoid fontkit reversing the whole string.
 */
export function placeLine(
  line: Token[],
  base: Direction,
  width: number,
  measure: Measure,
  spaceWidth: number,
): Placed[] {
  type Run = { dir: Direction; tokens: Token[] };
  const runs: Run[] = [];
  for (const tok of line) {
    const last = runs[runs.length - 1];
    if (last && last.dir === tok.dir) last.tokens.push(tok);
    else runs.push({ dir: tok.dir, tokens: [tok] });
  }

  // Chunks of a run, in logical order, with the space preceding them. An LTR
  // run is merged into one chunk per sequence of space-separated words.
  type Piece = { text: string; width: number; gapBefore: number };
  const piecesOf = (run: Run, first: boolean): Piece[] => {
    if (run.dir === 'ltr') {
      const text = run.tokens
        .map((t, i) => (i > 0 && t.spaceBefore ? ' ' : '') + t.text)
        .join('');
      const gap = !first && run.tokens[0].spaceBefore ? spaceWidth : 0;
      return [{ text, width: measure(text), gapBefore: gap }];
    }
    return run.tokens.map((t, i) => {
      const text = mirror(t.text);
      const gap = (i > 0 || !first) && t.spaceBefore ? spaceWidth : 0;
      return { text, width: measure(text), gapBefore: gap };
    });
  };

  const placed: Placed[] = [];
  if (base === 'rtl') {
    let cursor = width;
    runs.forEach((run, r) => {
      const pieces = piecesOf(run, r === 0);
      if (run.dir === 'rtl') {
        for (const p of pieces) {
          cursor -= p.gapBefore + p.width;
          placed.push({ text: p.text, dir: 'rtl', x: cursor, width: p.width });
        }
      } else {
        const p = pieces[0];
        cursor -= p.gapBefore + p.width;
        placed.push({ text: p.text, dir: 'ltr', x: cursor, width: p.width });
      }
    });
  } else {
    let cursor = 0;
    runs.forEach((run, r) => {
      const pieces = piecesOf(run, r === 0);
      if (run.dir === 'ltr') {
        const p = pieces[0];
        cursor += p.gapBefore;
        placed.push({ text: p.text, dir: 'ltr', x: cursor, width: p.width });
        cursor += p.width;
      } else {
        // Right-to-left run in a Latin paragraph: block placed after the previous
        // one, words arranged right to left WITHIN the block.
        const total = pieces.reduce(
          (s, p, i) => s + p.width + (i > 0 ? p.gapBefore : 0),
          0,
        );
        cursor += pieces[0].gapBefore;
        let inner = cursor + total;
        pieces.forEach((p, i) => {
          inner -= (i > 0 ? p.gapBefore : 0) + p.width;
          placed.push({ text: p.text, dir: 'rtl', x: inner, width: p.width });
        });
        cursor += total;
      }
    });
  }
  return placed;
}

/** LOGICAL text of a line — what `/ActualText` carries (accessibility). */
export function logicalText(line: Token[]): string {
  return line
    .map((t, i) => (i > 0 && t.spaceBefore ? ' ' : '') + t.text)
    .join('');
}
