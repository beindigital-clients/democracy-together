import type { KohopMatchClass } from './kohop';
import { blockTexts, parseText, toPlainText } from './kohopText';

// KOHOP — originality, PLATFORM side. Pure: finds the passages a text shares
// with another one (runs of identical words) and sorts them. It reports, it
// never decides — the review chief reads the matches, and a human refuses or
// accepts (D-16/D-17). Nothing here calls the network.

/** Shortest run of identical words reported as a shared passage. */
export const MIN_RUN_WORDS = 9;
/** Below this length a shared passage is "a common phrase", not a borrowing. */
export const COMMON_PHRASE_MAX_WORDS = 14;
/** Words of context kept around each reported passage text. */
const PASSAGE_MAX_WORDS = 60;

const EDGE_PUNCTUATION = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;

/** A word, folded for comparison: lowercase, no accent, no edge punctuation. */
export function foldWord(word: string): string {
  return word
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(EDGE_PUNCTUATION, '');
}

export type Tokens = { raw: string[]; folded: string[] };

export function tokenize(plain: string): Tokens {
  const raw: string[] = [];
  const folded: string[] = [];
  for (const token of plain.split(/(?:\s|\u200B|\u200C|\u200D)+/u)) {
    const f = foldWord(token);
    if (f) {
      raw.push(token);
      folded.push(f);
    }
  }
  return { raw, folded };
}

export type SharedPassage = {
  /** The passage as written in the checked text. */
  passage: string;
  /** The same passage as written in the source. */
  sourcePassage: string;
  words: number;
  /** Inside a quotation (blockquote, « », “ ”, " "): probably a cited source. */
  quoted: boolean;
};

const GRAM = 5;

/** Folded quoted segments of a text: quote blocks and inline quotation marks. */
function quotedSegments(markdown: string): string[] {
  const parsed = parseText(markdown);
  const segments: string[] = [];
  const blocks = parsed.blocks;
  const texts = blockTexts(blocks);
  blocks.forEach((block, i) => {
    if (block.type === 'quote')
      segments.push(tokenize(texts[i]).folded.join(' '));
  });
  const plain = texts.join('\n\n');
  for (const m of plain.matchAll(/«([^»]+)»|“([^”]+)”|"([^"]+)"/gu)) {
    segments.push(tokenize(m[1] ?? m[2] ?? m[3] ?? '').folded.join(' '));
  }
  return segments.filter(Boolean);
}

/**
 * Passages of `checked` that also appear, word for word, in `source`. Both are
 * constrained Markdown. A run must reach `MIN_RUN_WORDS` to be reported.
 */
export function findSharedPassages(
  checked: string,
  source: string,
): SharedPassage[] {
  const a = tokenize(toPlainText(checked));
  const b = tokenize(toPlainText(source));
  if (a.folded.length < MIN_RUN_WORDS || b.folded.length < MIN_RUN_WORDS) {
    return [];
  }

  const index = new Map<string, number[]>();
  for (let i = 0; i + GRAM <= b.folded.length; i++) {
    const key = b.folded.slice(i, i + GRAM).join(' ');
    const list = index.get(key);
    if (list) list.push(i);
    else index.set(key, [i]);
  }

  const quotes = quotedSegments(checked);
  const found: SharedPassage[] = [];
  let i = 0;
  while (i + GRAM <= a.folded.length) {
    const positions = index.get(a.folded.slice(i, i + GRAM).join(' '));
    let best = 0;
    let bestAt = 0;
    if (positions) {
      for (const p of positions) {
        let n = 0;
        while (
          i + n < a.folded.length &&
          p + n < b.folded.length &&
          a.folded[i + n] === b.folded[p + n]
        ) {
          n += 1;
        }
        if (n > best) {
          best = n;
          bestAt = p;
        }
      }
    }
    if (best >= MIN_RUN_WORDS) {
      const folded = a.folded.slice(i, i + best).join(' ');
      found.push({
        passage: a.raw
          .slice(i, i + Math.min(best, PASSAGE_MAX_WORDS))
          .join(' '),
        sourcePassage: b.raw
          .slice(bestAt, bestAt + Math.min(best, PASSAGE_MAX_WORDS))
          .join(' '),
        words: best,
        quoted: quotes.some((q) => q.includes(folded)),
      });
      i += best;
    } else {
      i += 1;
    }
  }
  return found;
}

/**
 * Sorts a shared passage. A quotation is "referenced" only when it is quoted
 * AND the contribution cites the source; a passage of the same author's earlier
 * work (declared in the prior works) is "declared self reuse"; a short run is
 * "a common phrase"; everything else is a "borrowing" the chief must read.
 */
export function classifyPassage(input: {
  passage: SharedPassage;
  sourceCited: boolean;
  sameAuthor: boolean;
  selfReuseDeclared: boolean;
}): KohopMatchClass {
  const { passage } = input;
  if (passage.quoted && input.sourceCited) return 'referenced_quote';
  if (input.sameAuthor && input.selfReuseDeclared) return 'declared_self_reuse';
  if (passage.words < COMMON_PHRASE_MAX_WORDS) return 'common_phrase';
  return 'borrowing';
}

/** Share of the checked text covered by shared passages, 0..1. */
export function coverage(
  checkedWords: number,
  passages: readonly { words: number }[],
): number {
  if (checkedWords <= 0) return 0;
  const covered = passages.reduce((n, p) => n + p.words, 0);
  return Math.min(1, covered / checkedWords);
}
