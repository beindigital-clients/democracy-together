import {
  decodePDFRawStream,
  PDFArray,
  PDFDict,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFRef,
  type PDFDocument,
  type PDFPage,
} from 'pdf-lib';

// READING AND REWRITING A PAGE'S CONTENT STREAM — the part of PDF
// translation that touches the original file.
//
// A translated PDF keeps everything the original draws — backgrounds,
// images, rules, charts — and replaces only its text. That means editing
// the page's drawing instructions: removing the operators that show the
// text being translated, and leaving every other byte as it was. Nothing
// here re-encodes the page; bytes are copied, and only text-showing
// operators (with their operands) are cut out.
//
// The same pass also LOCATES each piece of text — where it starts in page
// space, at what size, in what colour — because the text extractor
// (pdf.js) does not report colours, and white text on a dark banner must
// stay white once translated.
//
// WHAT IS NOT HANDLED, and stays as in the original: text inside
// annotations (form fields, stamps), Type 3 fonts drawn as graphics, text
// converted to outlines (it is not text any more). A text run is located by
// the start of its line segment: a run that follows another one on the same
// line without being positioned (`approximate`) is attributed to that line.

export type Matrix = [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** `m1` then `m2`: the PDF convention for concatenating matrices. */
export function multiply(m1: Matrix, m2: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + b1 * c2,
    a1 * b2 + b1 * d2,
    c1 * a2 + d1 * c2,
    c1 * b2 + d1 * d2,
    e1 * a2 + f1 * c2 + e2,
    e1 * b2 + f1 * d2 + f2,
  ];
}

/** A text-showing operator, located in page user space. */
export type TextRun = {
  x: number;
  y: number;
  /** Font size in user space (vertical scale of the text rendering matrix). */
  size: number;
  /** Fill colour, `#rrggbb`. */
  color: string;
  /** Rendering mode 3 (invisible) or 7 (clip only): nothing is drawn. */
  invisible: boolean;
  /** Not explicitly positioned: its real origin lies further along the line. */
  approximate: boolean;
};

/** Decides, for each text run, whether its operator is removed. */
export type RunDecision = (run: TextRun) => boolean;

/**
 * Something drawn on the page other than text, by its bounding box: a filled
 * or stroked path, or an image. Translated text must not run into it, and a
 * small filled one is what a list bullet is when the producer draws it (a
 * disc, a square) instead of setting a `•` glyph.
 */
export type Mark = {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  kind: 'fill' | 'stroke' | 'image';
};

// --- Lexer -------------------------------------------------------------------

type Token =
  | { kind: 'num'; value: number; start: number; end: number }
  | { kind: 'name'; value: string; start: number; end: number }
  | { kind: 'op'; value: string; start: number; end: number }
  | {
      kind: 'other';
      start: number;
      end: number;
    };

const WHITESPACE = new Set([0, 9, 10, 12, 13, 32]);
// ( ) < > [ ] { } / %
const DELIMITERS = new Set([40, 41, 60, 62, 91, 93, 123, 125, 47, 37]);

function isRegular(c: number): boolean {
  return !WHITESPACE.has(c) && !DELIMITERS.has(c);
}

/** End of a literal string starting at `i` (on its opening parenthesis). */
function skipLiteralString(b: Uint8Array, i: number): number {
  let depth = 0;
  for (; i < b.length; i++) {
    const c = b[i];
    if (c === 92) {
      i++; // escaped character, whatever it is
    } else if (c === 40) {
      depth++;
    } else if (c === 41) {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return b.length;
}

/** End of a balanced `open … close` group, skipping strings inside it. */
function skipGroup(
  b: Uint8Array,
  i: number,
  open: number,
  close: number,
): number {
  let depth = 0;
  while (i < b.length) {
    const c = b[i];
    if (c === 40) {
      i = skipLiteralString(b, i);
      continue;
    }
    if (c === 37) {
      while (i < b.length && b[i] !== 10 && b[i] !== 13) i++;
      continue;
    }
    if (open === 60 && c === 60 && b[i + 1] === 60) {
      depth++;
      i += 2;
      continue;
    }
    if (open === 60 && c === 62 && b[i + 1] === 62) {
      depth--;
      i += 2;
      if (depth === 0) return i;
      continue;
    }
    if (open !== 60 && c === 60) {
      // Hex string inside an array.
      while (i < b.length && b[i] !== 62) i++;
      i++;
      continue;
    }
    if (open !== 60 && c === open) depth++;
    if (open !== 60 && c === close) {
      depth--;
      if (depth === 0) return i + 1;
    }
    i++;
  }
  return b.length;
}

function decodeAscii(b: Uint8Array, start: number, end: number): string {
  let s = '';
  for (let i = start; i < end; i++) s += String.fromCharCode(b[i]);
  return s;
}

/** End of inline image data, starting just after the `ID` operator. */
function skipInlineImage(b: Uint8Array, i: number): number {
  // `ID` is followed by ONE whitespace byte, then binary data ended by `EI`
  // standing as its own token. Binary data may contain the bytes `EI`: the
  // usual test is that they are surrounded by whitespace.
  for (let j = i + 1; j < b.length - 1; j++) {
    if (
      b[j] === 69 &&
      b[j + 1] === 73 &&
      WHITESPACE.has(b[j - 1]) &&
      (j + 2 >= b.length || WHITESPACE.has(b[j + 2]))
    ) {
      return j + 2;
    }
  }
  return b.length;
}

function* lex(b: Uint8Array): Generator<Token> {
  let i = 0;
  while (i < b.length) {
    const c = b[i];
    if (WHITESPACE.has(c)) {
      i++;
      continue;
    }
    if (c === 37) {
      while (i < b.length && b[i] !== 10 && b[i] !== 13) i++;
      continue;
    }
    const start = i;
    if (c === 40) {
      i = skipLiteralString(b, i);
      yield { kind: 'other', start, end: i };
      continue;
    }
    if (c === 60) {
      if (b[i + 1] === 60) {
        i = skipGroup(b, i, 60, 62);
      } else {
        while (i < b.length && b[i] !== 62) i++;
        i++;
      }
      yield { kind: 'other', start, end: i };
      continue;
    }
    if (c === 91) {
      i = skipGroup(b, i, 91, 93);
      yield { kind: 'other', start, end: i };
      continue;
    }
    if (c === 47) {
      i++;
      while (i < b.length && isRegular(b[i])) i++;
      const raw = decodeAscii(b, start + 1, i);
      const value = raw.replace(/#([0-9a-fA-F]{2})/g, (_, h: string) =>
        String.fromCharCode(parseInt(h, 16)),
      );
      yield { kind: 'name', value, start, end: i };
      continue;
    }
    if (!isRegular(c)) {
      // Stray delimiter: skipped, never fatal.
      i++;
      continue;
    }
    while (i < b.length && isRegular(b[i])) i++;
    const word = decodeAscii(b, start, i);
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(word)) {
      yield { kind: 'num', value: Number(word), start, end: i };
      continue;
    }
    if (word === 'ID') {
      i = skipInlineImage(b, i);
      yield { kind: 'other', start, end: i };
      continue;
    }
    yield { kind: 'op', value: word, start, end: i };
  }
}

// --- Colours -------------------------------------------------------------------

function hex(n: number): string {
  const v = Math.max(0, Math.min(255, Math.round(n * 255)));
  return v.toString(16).padStart(2, '0');
}

function colorFromComponents(values: number[]): string | null {
  if (values.length === 1) return `#${hex(values[0]).repeat(3)}`;
  if (values.length === 3)
    return `#${hex(values[0])}${hex(values[1])}${hex(values[2])}`;
  if (values.length === 4) {
    const [c, m, y, k] = values;
    return `#${hex((1 - c) * (1 - k))}${hex((1 - m) * (1 - k))}${hex((1 - y) * (1 - k))}`;
  }
  return null;
}

// --- Interpreter ---------------------------------------------------------------

type GraphicsState = {
  ctm: Matrix;
  fill: string;
  renderMode: number;
  fontSize: number;
  leading: number;
};

type ScanResult = {
  /** The rewritten stream, or `null` when nothing was removed. */
  bytes: Uint8Array | null;
  runs: TextRun[];
  marks: Mark[];
};

type ScanContext = {
  doc: PDFDocument;
  resources: PDFDict | undefined;
  decide: RunDecision | null;
  /** Form XObjects already rewritten in this pass. */
  formsDone: Set<string>;
  depth: number;
};

function lookupDict(
  dict: PDFDict | undefined,
  key: string,
): PDFDict | undefined {
  if (!dict) return undefined;
  const value = dict.lookup(PDFName.of(key));
  return value instanceof PDFDict ? value : undefined;
}

function matrixOf(dict: PDFDict): Matrix {
  const value = dict.lookup(PDFName.of('Matrix'));
  if (!(value instanceof PDFArray) || value.size() !== 6) return IDENTITY;
  const nums = value
    .asArray()
    .map((v) => (v instanceof PDFNumber ? v.asNumber() : 0));
  return nums as Matrix;
}

/** Decoded bytes of a stream, or `null` when its filters are not supported. */
export function streamBytes(stream: unknown): Uint8Array | null {
  if (!(stream instanceof PDFRawStream)) return null;
  try {
    return decodePDFRawStream(stream).decode();
  } catch {
    return null;
  }
}

function scan(
  bytes: Uint8Array,
  initialCtm: Matrix,
  ctx: ScanContext,
): ScanResult {
  const runs: TextRun[] = [];
  const marks: Mark[] = [];
  // Bounding box of the path being built, in page space.
  let path: Omit<Mark, 'kind'> | null = null;
  const paint = (kind: 'fill' | 'stroke') => {
    if (path) marks.push({ ...path, kind });
    path = null;
  };
  const addPoint = (x: number, y: number) => {
    const [a, b, c, d, e, f] = gs.ctm;
    const px = a * x + c * y + e;
    const py = b * x + d * y + f;
    path = path
      ? {
          x0: Math.min(path.x0, px),
          y0: Math.min(path.y0, py),
          x1: Math.max(path.x1, px),
          y1: Math.max(path.y1, py),
        }
      : { x0: px, y0: py, x1: px, y1: py };
  };
  const stack: GraphicsState[] = [];
  let gs: GraphicsState = {
    ctm: initialCtm,
    fill: '#000000',
    renderMode: 0,
    fontSize: 0,
    leading: 0,
  };
  let tm: Matrix = IDENTITY;
  let tlm: Matrix = IDENTITY;
  let shownSincePositioning = false;

  // Byte ranges cut out of the stream, with what replaces them.
  const edits: { start: number; end: number; insert: string }[] = [];
  let operands: Token[] = [];

  const nums = () =>
    operands
      .filter((t) => t.kind === 'num')
      .map((t) => (t as { value: number }).value);

  const moveText = (tx: number, ty: number) => {
    tlm = multiply([1, 0, 0, 1, tx, ty], tlm);
    tm = tlm;
    shownSincePositioning = false;
  };

  const show = (op: Token, replacement: string) => {
    const trm = multiply(tm, gs.ctm);
    const run: TextRun = {
      x: trm[4],
      y: trm[5],
      size: gs.fontSize * Math.hypot(trm[2], trm[3]),
      color: gs.fill,
      invisible: gs.renderMode === 3 || gs.renderMode === 7,
      approximate: shownSincePositioning,
    };
    runs.push(run);
    shownSincePositioning = true;
    if (ctx.decide && ctx.decide(run)) {
      const start = operands.length > 0 ? operands[0].start : op.start;
      edits.push({ start, end: op.end, insert: replacement });
    }
  };

  for (const tok of lex(bytes)) {
    if (tok.kind !== 'op') {
      operands.push(tok);
      continue;
    }
    const n = nums();
    switch (tok.value) {
      case 'q':
        stack.push({ ...gs });
        break;
      case 'Q':
        gs = stack.pop() ?? gs;
        break;
      case 'cm':
        if (n.length === 6) gs.ctm = multiply(n as Matrix, gs.ctm);
        break;
      case 'g':
      case 'rg':
      case 'k':
      case 'sc':
      case 'scn': {
        // A pattern colour (`/P0 scn`) has a name operand: it is not a
        // flat colour, and the text keeps the previous one.
        const named = operands.some((t) => t.kind === 'name');
        const color = named ? null : colorFromComponents(n);
        if (color) gs.fill = color;
        break;
      }
      case 'BT':
        tm = IDENTITY;
        tlm = IDENTITY;
        shownSincePositioning = false;
        break;
      case 'Tf':
        if (n.length >= 1) gs.fontSize = n[n.length - 1];
        break;
      case 'Tr':
        if (n.length >= 1) gs.renderMode = n[0];
        break;
      case 'TL':
        if (n.length >= 1) gs.leading = n[0];
        break;
      case 'Td':
        if (n.length === 2) moveText(n[0], n[1]);
        break;
      case 'TD':
        if (n.length === 2) {
          gs.leading = -n[1];
          moveText(n[0], n[1]);
        }
        break;
      case 'Tm':
        if (n.length === 6) {
          tlm = n as Matrix;
          tm = tlm;
          shownSincePositioning = false;
        }
        break;
      case 'T*':
        moveText(0, -gs.leading);
        break;
      case 'Tj':
      case 'TJ':
        show(tok, '');
        break;
      case "'":
        moveText(0, -gs.leading);
        // Removing the show must keep the line move it implies.
        show(tok, 'T*');
        break;
      case '"': {
        moveText(0, -gs.leading);
        // `aw ac string "`: word spacing, char spacing, next line, show.
        const [aw, ac] = n;
        show(tok, `${aw ?? 0} Tw ${ac ?? 0} Tc T*`);
        break;
      }
      case 'm':
      case 'l':
        if (n.length === 2) addPoint(n[0], n[1]);
        break;
      case 'c':
        if (n.length === 6) {
          addPoint(n[0], n[1]);
          addPoint(n[2], n[3]);
          addPoint(n[4], n[5]);
        }
        break;
      case 'v':
      case 'y':
        if (n.length === 4) {
          addPoint(n[0], n[1]);
          addPoint(n[2], n[3]);
        }
        break;
      case 're':
        if (n.length === 4) {
          addPoint(n[0], n[1]);
          addPoint(n[0] + n[2], n[1] + n[3]);
        }
        break;
      case 'f':
      case 'F':
      case 'f*':
      case 'B':
      case 'B*':
      case 'b':
      case 'b*':
        paint('fill');
        break;
      case 'S':
      case 's':
        paint('stroke');
        break;
      case 'n':
        path = null;
        break;
      case 'Do': {
        const nameTok = operands.find((t) => t.kind === 'name') as
          { value: string } | undefined;
        if (!nameTok) break;
        if (xobjectSubtype(nameTok.value, ctx) === 'Image') {
          // An image is drawn in the unit square of the current matrix.
          const [a, b, c, d, e, f] = gs.ctm;
          const xs = [e, a + e, c + e, a + c + e];
          const ys = [f, b + f, d + f, b + d + f];
          marks.push({
            x0: Math.min(...xs),
            y0: Math.min(...ys),
            x1: Math.max(...xs),
            y1: Math.max(...ys),
            kind: 'image',
          });
          break;
        }
        const inner = visitForm(nameTok.value, gs.ctm, ctx);
        runs.push(...inner.runs);
        marks.push(...inner.marks);
        break;
      }
      default:
        break;
    }
    operands = [];
  }

  if (edits.length === 0) return { bytes: null, runs, marks };

  // Rebuild the stream: every byte kept, only the cut ranges replaced.
  const parts: Uint8Array[] = [];
  let cursor = 0;
  const encoder = new TextEncoder();
  for (const e of edits) {
    parts.push(bytes.subarray(cursor, e.start));
    if (e.insert) parts.push(encoder.encode(` ${e.insert} `));
    cursor = e.end;
  }
  parts.push(bytes.subarray(cursor));
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return { bytes: out, runs, marks };
}

function xobjectSubtype(name: string, ctx: ScanContext): string | null {
  const ref = lookupDict(ctx.resources, 'XObject')?.get(PDFName.of(name));
  if (!(ref instanceof PDFRef)) return null;
  const stream = ctx.doc.context.lookup(ref);
  if (!(stream instanceof PDFRawStream)) return null;
  const subtype = stream.dict.lookup(PDFName.of('Subtype'));
  return subtype instanceof PDFName ? subtype.decodeText() : null;
}

/** Text drawn by a Form XObject, which is rewritten in place if needed. */
function visitForm(
  name: string,
  ctm: Matrix,
  ctx: ScanContext,
): { runs: TextRun[]; marks: Mark[] } {
  const none = { runs: [], marks: [] };
  if (ctx.depth > 8) return none;
  const xobjects = lookupDict(ctx.resources, 'XObject');
  const ref = xobjects?.get(PDFName.of(name));
  if (!(ref instanceof PDFRef)) return none;
  const stream = ctx.doc.context.lookup(ref);
  if (!(stream instanceof PDFRawStream)) return none;
  const subtype = stream.dict.lookup(PDFName.of('Subtype'));
  if (subtype !== PDFName.of('Form')) return none;
  const bytes = streamBytes(stream);
  if (!bytes) return none;

  const formResources = lookupDict(stream.dict, 'Resources') ?? ctx.resources;
  const key = ref.toString();
  // A form drawn several times is rewritten once; its later uses are only
  // located (their text is removed with the first rewrite).
  const decide = ctx.formsDone.has(key) ? null : ctx.decide;
  const result = scan(bytes, multiply(matrixOf(stream.dict), ctm), {
    ...ctx,
    resources: formResources,
    decide,
    depth: ctx.depth + 1,
  });
  if (decide && result.bytes) {
    replaceStream(ctx.doc, ref, stream, result.bytes);
    ctx.formsDone.add(key);
  }
  return { runs: result.runs, marks: result.marks };
}

function replaceStream(
  doc: PDFDocument,
  ref: PDFRef,
  old: PDFRawStream,
  bytes: Uint8Array,
): void {
  const next = doc.context.flateStream(bytes);
  for (const [key, value] of old.dict.entries()) {
    const k = key.asString();
    if (k === '/Length' || k === '/Filter' || k === '/DecodeParms') continue;
    next.dict.set(key, value);
  }
  doc.context.assign(ref, next);
}

function pageContentBytes(page: PDFPage): Uint8Array | null {
  const contents = page.node.Contents();
  if (!contents) return new Uint8Array();
  const streams =
    contents instanceof PDFArray
      ? contents.asArray().map((v) => page.doc.context.lookup(v))
      : [contents];
  const parts: Uint8Array[] = [];
  for (const s of streams) {
    const b = streamBytes(s);
    if (!b) return null;
    parts.push(b);
  }
  // Streams of an array are one logical stream, split at token boundaries:
  // a newline between them keeps the tokens apart.
  const total = parts.reduce((n, p) => n + p.length + 1, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
    out[offset++] = 10;
  }
  return out;
}

/** The text runs and bullet-sized shapes of a page. Writes nothing. */
export function locatePage(
  doc: PDFDocument,
  page: PDFPage,
): { runs: TextRun[]; marks: Mark[] } {
  const bytes = pageContentBytes(page);
  if (!bytes) return { runs: [], marks: [] };
  const { runs, marks } = scan(bytes, IDENTITY, {
    doc,
    resources: page.node.Resources(),
    decide: null,
    formsDone: new Set(),
    depth: 0,
  });
  return { runs, marks };
}

/**
 * Removes the text runs `decide` selects from a page, and wraps what remains
 * in `q … Q` so that whatever is drawn afterwards starts from a clean
 * graphics state.
 *
 * @returns false when the page could not be read (its text is kept).
 */
export function stripRuns(
  doc: PDFDocument,
  page: PDFPage,
  decide: RunDecision,
  formsDone: Set<string>,
): boolean {
  const bytes = pageContentBytes(page);
  if (!bytes) return false;
  const result = scan(bytes, IDENTITY, {
    doc,
    resources: page.node.Resources(),
    decide,
    formsDone,
    depth: 0,
  });
  const kept = result.bytes ?? bytes;
  const encoder = new TextEncoder();
  const wrapped = new Uint8Array(kept.length + 6);
  wrapped.set(encoder.encode('q\n'), 0);
  wrapped.set(kept, 2);
  wrapped.set(encoder.encode('\nQ\n\n'), kept.length + 2);
  const stream = doc.context.flateStream(wrapped);
  page.node.set(PDFName.of('Contents'), doc.context.register(stream));
  return true;
}
