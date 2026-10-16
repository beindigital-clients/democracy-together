import type { QueryCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import type { DocumentBlock } from './documents';
import { KOHOP_CORPUS_STAGES, type KohopIndexKind } from './kohop';

// KOHOP — originality index: the sources it reads. One loader per kind of
// source says whether a document belongs to the corpus (and with what text) or
// not — the same rule serves the indexing pass, the dropping of what left the
// corpus, and the reading of a candidate's text during a check.

/** Longest text kept of a source: the index is a comparison base, not an archive. */
export const SOURCE_CHARS_MAX = 20_000;

export type LoadedSource = {
  groupId: string;
  title: string;
  lang?: string;
  authorUserId?: Id<'users'>;
  text: string;
};

/** The group of every version of one KOHOP contribution. */
export const kohopGroup = (contributionId: string) => `kohop:${contributionId}`;
/** The group of a library publication, and of the PDF text extracted from it. */
export const publicationGroup = (publicationId: string) =>
  `publication:${publicationId}`;
export const tribuneGroup = (postId: string) => `tribune:${postId}`;

/** The text of extracted document blocks (tables and figures carry no prose). */
export function blocksToText(blocks: readonly DocumentBlock[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === 'list') {
      parts.push((block.items ?? []).join('\n'));
    } else if (
      block.type === 'heading' ||
      block.type === 'paragraph' ||
      block.type === 'quote'
    ) {
      if (block.text) parts.push(block.text);
    }
  }
  return parts.filter(Boolean).join('\n\n');
}

const cut = (text: string) => text.slice(0, SOURCE_CHARS_MAX);

export async function loadSource(
  ctx: QueryCtx,
  kind: KohopIndexKind,
  sourceId: string,
): Promise<LoadedSource | null> {
  if (kind === 'kohop') {
    const file = await ctx.db.get(sourceId as Id<'kohopContributions'>);
    if (
      !file ||
      !(KOHOP_CORPUS_STAGES as readonly string[]).includes(file.stage)
    ) {
      return null;
    }
    const version = file.submittedVersion ?? file.currentVersion;
    const row = await ctx.db
      .query('kohopVersions')
      .withIndex('by_contribution_and_version', (q) =>
        q.eq('contributionId', file._id).eq('version', version),
      )
      .unique();
    if (!row) return null;
    return {
      groupId: kohopGroup(file._id),
      title: row.title,
      lang: file.lang,
      authorUserId: file.authorUserId,
      text: cut(`${row.standfirst}\n\n${row.body}`),
    };
  }
  if (kind === 'publication') {
    const pub = await ctx.db.get(sourceId as Id<'publications'>);
    if (!pub || pub.status !== 'published') return null;
    return {
      groupId: publicationGroup(pub._id),
      title: pub.title,
      lang: pub.languages[0],
      authorUserId: pub.authorUserId,
      text: cut([pub.abstract, ...pub.keypoints, ...pub.body].join('\n\n')),
    };
  }
  if (kind === 'document') {
    const extraction = await ctx.db.get(sourceId as Id<'documentExtractions'>);
    if (!extraction || extraction.status !== 'ready' || !extraction.blocks) {
      return null;
    }
    const pub = await ctx.db.get(extraction.publicationId);
    if (!pub || pub.status !== 'published') return null;
    return {
      groupId: publicationGroup(pub._id),
      title: extraction.title ?? pub.title,
      lang: extraction.sourceLocale,
      authorUserId: pub.authorUserId,
      text: cut(blocksToText(extraction.blocks)),
    };
  }
  const post = await ctx.db.get(sourceId as Id<'tribunePosts'>);
  if (!post || post.status !== 'published') return null;
  return {
    groupId: tribuneGroup(post._id),
    title: post.title,
    lang: post.lang,
    authorUserId: post.authorUserId,
    text: cut(`${post.title}\n\n${post.body}`),
  };
}

export type SourceDoc =
  | Doc<'kohopContributions'>
  | Doc<'publications'>
  | Doc<'documentExtractions'>
  | Doc<'tribunePosts'>;
