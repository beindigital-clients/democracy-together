import { tokenize } from './kohopOriginality';
import { toPlainText } from './kohopText';

// KOHOP — originality index, FINGERPRINTS. Pure. A text is cut into runs of 5
// normalised words (k-grams), each run is hashed, and the "winnowing" scheme
// (Schleimer, Wilkerson, Aiken, 2003) keeps the smallest hash of every window
// of 4 consecutive runs. Guarantee: any run of at least K + W - 1 = 8 identical
// words in two texts yields at least one fingerprint they share, so the 9-word
// minimum reported by `findSharedPassages` can never be missed by the index —
// while only about a third of the hashes are stored.

/** Words per fingerprinted run (spec: "des suites de 5 mots normalisés"). */
export const FINGERPRINT_K = 5;
/** Window of consecutive runs from which the smallest hash is kept. */
export const FINGERPRINT_W = 4;
/** Fingerprints stored per source — a bound, not a target. */
export const FINGERPRINTS_MAX = 4000;

export type Fingerprint = { hash: number; position: number };

/** FNV-1a, 32 bits, over the UTF-16 code units of a string. Unsigned. */
export function hashRun(run: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < run.length; i++) {
    h ^= run.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The fingerprints of folded words. */
export function fingerprintWords(folded: readonly string[]): Fingerprint[] {
  const runs = folded.length - FINGERPRINT_K + 1;
  if (runs < 1) return [];
  const hashes: number[] = [];
  for (let i = 0; i < runs; i++) {
    hashes.push(hashRun(folded.slice(i, i + FINGERPRINT_K).join(' ')));
  }
  if (runs <= FINGERPRINT_W) {
    // A short text: its smallest run is still a fingerprint.
    let at = 0;
    for (let i = 1; i < runs; i++) if (hashes[i] <= hashes[at]) at = i;
    return [{ hash: hashes[at], position: at }];
  }
  const out: Fingerprint[] = [];
  let last = -1;
  for (let start = 0; start + FINGERPRINT_W <= runs; start++) {
    // Rightmost minimum of the window: a stable choice that keeps the guarantee.
    let at = start;
    for (let i = start + 1; i < start + FINGERPRINT_W; i++) {
      if (hashes[i] <= hashes[at]) at = i;
    }
    if (at !== last) {
      out.push({ hash: hashes[at], position: at });
      last = at;
    }
  }
  return out.slice(0, FINGERPRINTS_MAX);
}

/** The fingerprints of a text written in the constrained Markdown. */
export function fingerprintsOf(markdown: string): Fingerprint[] {
  return fingerprintWords(tokenize(toPlainText(markdown)).folded);
}

/** The distinct hashes of a fingerprint list. */
export function distinctHashes(prints: readonly Fingerprint[]): number[] {
  return [...new Set(prints.map((p) => p.hash))];
}

export type SourceHit = { sourceKey: string; shared: number };

/**
 * From the sources found for each hash of the checked text, the ones worth
 * reading closely: those sharing at least `min` distinct fingerprints, best
 * first (ties broken by key so the order is stable), at most `limit`.
 */
export function rankSources(
  hitsByHash: ReadonlyMap<number, readonly string[]>,
  options: { min: number; limit: number },
): SourceHit[] {
  const counts = new Map<string, number>();
  for (const keys of hitsByHash.values()) {
    for (const key of new Set(keys)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, shared]) => shared >= options.min)
    .map(([sourceKey, shared]) => ({ sourceKey, shared }))
    .sort(
      (a, b) => b.shared - a.shared || a.sourceKey.localeCompare(b.sourceKey),
    )
    .slice(0, options.limit);
}
