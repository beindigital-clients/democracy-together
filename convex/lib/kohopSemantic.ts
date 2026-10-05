import { foldWord } from './kohopOriginality';

// KOHOP — originality, SEMANTIC side. Constants and pure helpers. Every value
// here is a prudent default behind a name, flagged in the PR: none of them was
// given by the client. Nothing here calls the network.

/** Embedding model, reached through the AI gateway (multilingual). */
export const KOHOP_EMBEDDING_MODEL = 'openai/text-embedding-3-small';
/** Size of the vectors that model returns — fixed by the vector index. */
export const KOHOP_EMBEDDING_DIMENSIONS = 1536;
/** Paragraphs sent to the gateway in one embedding call. */
export const KOHOP_EMBEDDING_BATCH = 32;
/** Model that reads two passages side by side and confirms or dismisses them. */
export const KOHOP_CONFIRMATION_MODEL = 'anthropic/claude-sonnet-5';
/** Candidates the confirmation reads in one call. */
export const KOHOP_CONFIRMATION_BATCH = 8;
/** Candidates confirmed per check — a cost bound. */
export const KOHOP_CONFIRMATION_MAX = 16;
/** Cosine similarity from which two paragraphs become a candidate. */
export const KOHOP_SEMANTIC_THRESHOLD = 0.8;
/** Neighbours asked of the vector index for each paragraph. */
export const KOHOP_SEMANTIC_NEIGHBOURS = 6;
/** Semantic candidates kept in a report, best first. */
export const KOHOP_SEMANTIC_MAX = 20;
/** Model calls (embeddings and confirmations) allowed per UTC day. */
export const KOHOP_AI_DAILY_CAP = 300;

export type SemanticHit = {
  /** The checked paragraph. */
  chunk: string;
  /** What the index returned for it. */
  sourceKey: string;
  groupId?: string;
  sourcePassage: string;
  similarity: number;
};

/**
 * Candidates out of the raw neighbours: below the threshold or from the same
 * contribution they are dropped; a paragraph keeps its best neighbour per
 * source; a paragraph already reported as a shared run of words is not
 * reported twice; the best `KOHOP_SEMANTIC_MAX` remain.
 */
export function semanticCandidates(
  hits: readonly SemanticHit[],
  options: { ownGroupId: string; wordPassages: readonly string[] },
): SemanticHit[] {
  const covered = options.wordPassages.map((p) => fold(p));
  const best = new Map<string, SemanticHit>();
  for (const hit of hits) {
    if (hit.similarity < KOHOP_SEMANTIC_THRESHOLD) continue;
    if (hit.groupId !== undefined && hit.groupId === options.ownGroupId) {
      continue;
    }
    const folded = fold(hit.chunk);
    if (covered.some((c) => c.length > 0 && folded.includes(c))) continue;
    const key = `${hit.chunk}\u0000${hit.sourceKey}`;
    const kept = best.get(key);
    if (!kept || hit.similarity > kept.similarity) best.set(key, hit);
  }
  return [...best.values()]
    .sort(
      (a, b) =>
        b.similarity - a.similarity || a.sourceKey.localeCompare(b.sourceKey),
    )
    .slice(0, KOHOP_SEMANTIC_MAX);
}

function fold(text: string): string {
  return text.split(/\s+/).map(foldWord).filter(Boolean).join(' ');
}
