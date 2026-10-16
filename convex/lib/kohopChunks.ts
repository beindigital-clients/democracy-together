import { tokenize } from './kohopOriginality';
import { toPlainText } from './kohopText';

// KOHOP — originality index, PARAGRAPHS. Pure. The semantic index holds one
// vector per paragraph (spec: "un vecteur par paragraphe"). Very short
// paragraphs carry too little meaning to be compared and are merged with the
// next one; very long ones are cut, so that a vector always stands for a
// passage a person can read side by side with another.

/** A paragraph shorter than this is merged with the following one. */
export const CHUNK_MIN_WORDS = 25;
/** A paragraph longer than this is cut. */
export const CHUNK_MAX_WORDS = 150;
/** Paragraphs embedded per source — a cost bound. */
export const CHUNKS_MAX = 40;
/** Below this, a source has nothing worth a vector. */
export const CHUNK_FLOOR_WORDS = 12;

/** The paragraphs of a text, ready to be embedded. */
export function chunkText(textOrMarkdown: string): string[] {
  const plain = toPlainText(textOrMarkdown);
  const paragraphs = plain
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const pieces: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(' ');
    for (let i = 0; i < words.length; i += CHUNK_MAX_WORDS) {
      pieces.push(words.slice(i, i + CHUNK_MAX_WORDS).join(' '));
    }
  }

  const merged: string[] = [];
  let carry = '';
  for (const piece of pieces) {
    const next = carry ? `${carry} ${piece}` : piece;
    if (tokenize(next).folded.length < CHUNK_MIN_WORDS) {
      carry = next;
      continue;
    }
    merged.push(next);
    carry = '';
  }
  if (carry && tokenize(carry).folded.length >= CHUNK_FLOOR_WORDS) {
    merged.push(carry);
  }
  return merged.slice(0, CHUNKS_MAX);
}
