// KOHOP — the text format: a CONSTRAINED subset of Markdown.
//
// A PURE module, read by the server and by the browser (alias `@convex/*`):
// the same word count on both sides, a rendering made of React elements and
// never of raw HTML (so no script injection), differences between two
// versions that are easy to compute, and plain text for indexing.
//
// Accepted: paragraphs, `##` and `###` headings, **bold**, *italic* / _italic_,
// `-` / `*` bullet lists, `1.` numbered lists, `>` quotes, and `https` links.
// EVERYTHING ELSE is refused with a named code — it is not silently dropped:
// the author sees what was not understood.

export type Inline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: Inline[] }
  | { type: 'em'; children: Inline[] }
  | { type: 'link'; href: string; children: Inline[] };

export type Block =
  | { type: 'paragraph'; children: Inline[] }
  | { type: 'heading'; level: 2 | 3; children: Inline[] }
  | { type: 'list'; ordered: boolean; items: Inline[][] }
  | { type: 'quote'; children: Inline[] };

export type TextErrorCode =
  | 'html'
  | 'image'
  | 'code'
  | 'heading_level'
  | 'rule'
  | 'table'
  | 'link_scheme'
  | 'link_malformed'
  | 'emphasis_unclosed';

export type TextError = { line: number; code: TextErrorCode };

export type ParsedText = { blocks: Block[]; errors: TextError[] };

// --- Inline -------------------------------------------------------------------

const LINK = /^\[([^\]\n]+)\]\(([^)\s]*)\)/;

function parseInline(
  source: string,
  line: number,
  errors: TextError[],
): Inline[] {
  const out: Inline[] = [];
  let buffer = '';
  const flush = () => {
    if (buffer) out.push({ type: 'text', text: buffer });
    buffer = '';
  };

  for (let i = 0; i < source.length;) {
    const rest = source.slice(i);
    const ch = source[i];

    if (ch === '\\' && i + 1 < source.length) {
      // Backslash escapes the next character.
      buffer += source[i + 1];
      i += 2;
      continue;
    }
    if (ch === '<' && /^<\/?[a-zA-Z!]/.test(rest)) {
      errors.push({ line, code: 'html' });
      buffer += ch;
      i += 1;
      continue;
    }
    if (ch === '`') {
      errors.push({ line, code: 'code' });
      buffer += ch;
      i += 1;
      continue;
    }
    if (rest.startsWith('![')) {
      errors.push({ line, code: 'image' });
      buffer += ch;
      i += 1;
      continue;
    }
    if (ch === '[') {
      const match = LINK.exec(rest);
      if (!match) {
        errors.push({ line, code: 'link_malformed' });
        buffer += ch;
        i += 1;
        continue;
      }
      const [whole, label, href] = match;
      if (!isHttpsUrl(href)) errors.push({ line, code: 'link_scheme' });
      flush();
      out.push({
        type: 'link',
        href,
        children: parseInline(label, line, errors),
      });
      i += whole.length;
      continue;
    }
    if (rest.startsWith('**')) {
      const end = rest.indexOf('**', 2);
      if (end > 2) {
        flush();
        out.push({
          type: 'strong',
          children: parseInline(rest.slice(2, end), line, errors),
        });
        i += end + 2;
        continue;
      }
      errors.push({ line, code: 'emphasis_unclosed' });
      buffer += '**';
      i += 2;
      continue;
    }
    if (ch === '*' || ch === '_') {
      // Intra-word underscores (snake_case, URLs) are not emphasis.
      const prev = i > 0 ? source[i - 1] : '';
      const intraWord = ch === '_' && /[\p{L}\p{N}]/u.test(prev);
      const end = intraWord ? -1 : findClosing(rest, ch);
      if (end > 1) {
        flush();
        out.push({
          type: 'em',
          children: parseInline(rest.slice(1, end), line, errors),
        });
        i += end + 1;
        continue;
      }
      if (ch === '*') {
        errors.push({ line, code: 'emphasis_unclosed' });
      }
      buffer += ch;
      i += 1;
      continue;
    }
    buffer += ch;
    i += 1;
  }
  flush();
  return out;
}

function findClosing(rest: string, mark: string): number {
  for (let j = 1; j < rest.length; j++) {
    if (rest[j] === '\\') {
      j += 1;
      continue;
    }
    if (rest[j] === mark && rest[j - 1] !== ' ') return j;
  }
  return -1;
}

/** `https` only, a host, no credentials, no whitespace. */
export function isHttpsUrl(value: string): boolean {
  if (!value || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname.includes('.') &&
      url.username === '' &&
      url.password === ''
    );
  } catch {
    return false;
  }
}

// --- Blocks -------------------------------------------------------------------

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^[-*]\s+(.*)$/;
const ORDERED = /^\d{1,3}[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const RULE = /^(-{3,}|\*{3,}|_{3,})$/;

export function parseText(markdown: string): ParsedText {
  const errors: TextError[] = [];
  const blocks: Block[] = [];
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');

  let paragraph: { text: string[]; line: number } | null = null;
  let list: { ordered: boolean; items: Inline[][]; line: number } | null = null;
  let quote: { text: string[]; line: number } | null = null;

  const closeParagraph = () => {
    if (paragraph) {
      blocks.push({
        type: 'paragraph',
        children: parseInline(paragraph.text.join(' '), paragraph.line, errors),
      });
      paragraph = null;
    }
  };
  const closeList = () => {
    if (list) {
      blocks.push({ type: 'list', ordered: list.ordered, items: list.items });
      list = null;
    }
  };
  const closeQuote = () => {
    if (quote) {
      blocks.push({
        type: 'quote',
        children: parseInline(quote.text.join(' '), quote.line, errors),
      });
      quote = null;
    }
  };
  const closeAll = () => {
    closeParagraph();
    closeList();
    closeQuote();
  };

  lines.forEach((raw, index) => {
    const line = index + 1;
    const text = raw.trim();

    if (text === '') {
      closeAll();
      return;
    }
    if (text.startsWith('```') || text.startsWith('~~~')) {
      closeAll();
      errors.push({ line, code: 'code' });
      return;
    }
    if (text.startsWith('|')) {
      closeAll();
      errors.push({ line, code: 'table' });
      return;
    }
    if (RULE.test(text)) {
      closeAll();
      errors.push({ line, code: 'rule' });
      return;
    }

    const heading = HEADING.exec(text);
    if (heading) {
      closeAll();
      const level = heading[1].length;
      if (level === 2 || level === 3) {
        blocks.push({
          type: 'heading',
          level,
          children: parseInline(heading[2].trim(), line, errors),
        });
      } else {
        errors.push({ line, code: 'heading_level' });
      }
      return;
    }

    const bullet = BULLET.exec(text);
    const ordered = bullet ? null : ORDERED.exec(text);
    if (bullet || ordered) {
      closeParagraph();
      closeQuote();
      const isOrdered = ordered !== null;
      if (list && list.ordered !== isOrdered) closeList();
      if (!list) list = { ordered: isOrdered, items: [], line };
      const body = (bullet ?? ordered)![1];
      list.items.push(parseInline(body.trim(), line, errors));
      return;
    }

    const quoted = QUOTE.exec(text);
    if (quoted) {
      closeParagraph();
      closeList();
      if (!quote) quote = { text: [], line };
      quote.text.push(quoted[1].trim());
      return;
    }

    closeList();
    closeQuote();
    if (!paragraph) paragraph = { text: [], line };
    paragraph.text.push(text);
  });
  closeAll();

  return { blocks, errors };
}

// --- Plain text, word count ----------------------------------------------------

function inlineText(nodes: readonly Inline[]): string {
  return nodes
    .map((n) => (n.type === 'text' ? n.text : inlineText(n.children)))
    .join('');
}

/** One plain-text string per block (list items joined by line breaks). */
export function blockTexts(blocks: readonly Block[]): string[] {
  return blocks.map((b) => {
    switch (b.type) {
      case 'list':
        return b.items.map((item) => inlineText(item)).join('\n');
      default:
        return inlineText(b.children);
    }
  });
}

/** Plain text for indexing and for the originality checks. */
export function toPlainText(markdown: string): string {
  return blockTexts(parseText(markdown).blocks).join('\n\n');
}

const HAS_LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/**
 * Words of a plain text. A token is a run of non-space characters that holds at
 * least one letter or digit, so a lone dash, quote mark or Arabic comma is not
 * a word. Apostrophes and hyphens stay INSIDE a word (« l'économie »,
 * « peer-review » are one word each), the convention of word processors.
 */
export function countWordsInPlainText(text: string): number {
  let count = 0;
  for (const token of text.split(/(?:\s|\u200B|\u200C|\u200D)+/u)) {
    if (token && HAS_LETTER_OR_DIGIT.test(token)) count += 1;
  }
  return count;
}

/** Words of the markup-free text: the markup and the URLs are not counted. */
export function countWords(markdown: string): number {
  return countWordsInPlainText(toPlainText(markdown));
}

/** Estimated reading time in minutes (at least 1), 220 words a minute. */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 220));
}

/** The URLs of the text's links, in order, without duplicates. */
export function extractLinks(markdown: string): string[] {
  const seen = new Set<string>();
  const walk = (nodes: readonly Inline[]) => {
    for (const n of nodes) {
      if (n.type === 'link') seen.add(n.href);
      if (n.type !== 'text') walk(n.children);
    }
  };
  for (const b of parseText(markdown).blocks) {
    if (b.type === 'list') b.items.forEach(walk);
    else walk(b.children);
  }
  return [...seen];
}

// --- Differences between two versions -----------------------------------------

export type WordOp = { op: 'equal' | 'insert' | 'delete'; text: string };

/** Word-level difference (longest common subsequence). */
export function diffWords(before: string, after: string): WordOp[] {
  const a = before.split(/(\s+)/u).filter((t) => t !== '');
  const b = after.split(/(\s+)/u).filter((t) => t !== '');
  return lcsDiff(a, b).map((o) => ({ op: o.op, text: o.item }));
}

export type BlockDiff =
  | { op: 'equal'; text: string }
  | { op: 'insert'; text: string }
  | { op: 'delete'; text: string }
  | { op: 'change'; before: string; after: string; words: WordOp[] };

/**
 * Block-level difference: the blocks are compared as plain text; a deleted
 * block immediately followed by an inserted one is shown as a CHANGE, with the
 * word-level difference inside.
 */
export function diffTexts(before: string, after: string): BlockDiff[] {
  const a = blockTexts(parseText(before).blocks);
  const b = blockTexts(parseText(after).blocks);
  const raw = lcsDiff(a, b);
  const out: BlockDiff[] = [];
  for (let i = 0; i < raw.length; i++) {
    const cur = raw[i];
    const next = raw[i + 1];
    if (cur.op === 'delete' && next && next.op === 'insert') {
      out.push({
        op: 'change',
        before: cur.item,
        after: next.item,
        words: diffWords(cur.item, next.item),
      });
      i += 1;
    } else {
      out.push({ op: cur.op, text: cur.item });
    }
  }
  return out;
}

/** Has the text changed in a way that matters (blocks differ)? */
export function textChanged(before: string, after: string): boolean {
  return diffTexts(before, after).some((d) => d.op !== 'equal');
}

function lcsDiff(
  a: readonly string[],
  b: readonly string[],
): { op: 'equal' | 'insert' | 'delete'; item: string }[] {
  const n = a.length;
  const m = b.length;
  // Longest common subsequence table, filled from the end.
  const table: Uint32Array[] = Array.from(
    { length: n + 1 },
    () => new Uint32Array(m + 1),
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] =
        a[i] === b[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const out: { op: 'equal' | 'insert' | 'delete'; item: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ op: 'equal', item: a[i] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      out.push({ op: 'delete', item: a[i++] });
    } else {
      out.push({ op: 'insert', item: b[j++] });
    }
  }
  while (i < n) out.push({ op: 'delete', item: a[i++] });
  while (j < m) out.push({ op: 'insert', item: b[j++] });
  return out;
}

// --- Validation against the bounds --------------------------------------------

export type TextProblem =
  | { code: 'unsupported'; errors: TextError[] }
  | { code: 'too_short'; words: number }
  | { code: 'too_long'; words: number };

/** What prevents a text from being submitted, or `null` when it is fine. */
export function validateBody(
  markdown: string,
  bounds: { min: number; max: number },
): TextProblem | null {
  const parsed = parseText(markdown);
  if (parsed.errors.length > 0)
    return { code: 'unsupported', errors: parsed.errors };
  const words = countWordsInPlainText(blockTexts(parsed.blocks).join('\n\n'));
  if (words < bounds.min) return { code: 'too_short', words };
  if (words > bounds.max) return { code: 'too_long', words };
  return null;
}
