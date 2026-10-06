import { v } from 'convex/values';
import {
  internalAction,
  internalMutation,
  internalQuery,
} from './_generated/server';
import type { ActionCtx, MutationCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { KOHOP_INDEX_KINDS, type KohopIndexKind } from './lib/kohop';
import { runEmbeddings } from './lib/aiGateway';
import { tokenize } from './lib/kohopOriginality';
import { chunkText } from './lib/kohopChunks';
import { fingerprintsOf, hashRun } from './lib/kohopWinnowing';
import { loadSource } from './lib/kohopIndexSources';
import {
  KOHOP_EMBEDDING_BATCH,
  KOHOP_EMBEDDING_DIMENSIONS,
  KOHOP_EMBEDDING_MODEL,
} from './lib/kohopSemantic';

// KOHOP — the ORIGINALITY INDEX (plan § 4.2). Two structures per source: winnowed
// fingerprints of 5-word runs (exact reuse), and one embedding per paragraph
// (reuse by meaning, in any language). The corpus is the KOHOP versions, the
// library (title, abstract, key points, body, and the text extracted from the
// PDFs) and the Tribune. Indexing never touches the sources themselves.
//
// It runs in batches: a rolling pass reads each source table a few documents at
// a time (`indexBatch`), drops what left the corpus (`pruneBatch`), and a
// pending-embeddings pass asks the gateway for the vectors. A check calls
// `catchUp` first, so it never compares with an index that was never built.

const KIND_BATCH = 6;
const PRUNE_BATCH = 20;
const DELETE_CHUNK = 2000;
const PRUNE_KEY = 'prune';
/** Batches one pass of the cycle may run per table, and one catch-up in all. */
const CYCLE_BATCHES = 10;
const CATCH_UP_BATCHES = 40;
const BACKFILL_PER_CYCLE = 5;

// --- Writing the index ------------------------------------------------------------

export async function dropSource(
  ctx: MutationCtx,
  kind: KohopIndexKind,
  sourceId: string,
): Promise<void> {
  for (const table of ['textFingerprints', 'textPassages'] as const) {
    for (;;) {
      const rows = await ctx.db
        .query(table)
        .withIndex('by_source', (q) =>
          q.eq('sourceKind', kind).eq('sourceId', sourceId),
        )
        .take(DELETE_CHUNK);
      for (const row of rows) await ctx.db.delete(row._id);
      if (rows.length < DELETE_CHUNK) break;
    }
  }
  const row = await ctx.db
    .query('textSources')
    .withIndex('by_source', (q) =>
      q.eq('sourceKind', kind).eq('sourceId', sourceId),
    )
    .unique();
  if (row) await ctx.db.delete(row._id);
}

/** Indexes (or drops, or leaves as is) one source. True when passages were written. */
async function indexOne(
  ctx: MutationCtx,
  kind: KohopIndexKind,
  sourceId: string,
): Promise<boolean> {
  const source = await loadSource(ctx, kind, sourceId);
  if (!source) {
    await dropSource(ctx, kind, sourceId);
    return false;
  }
  const words = tokenize(source.text).folded.length;
  const contentHash = `${words}:${hashRun(source.text)}`;
  const known = await ctx.db
    .query('textSources')
    .withIndex('by_source', (q) =>
      q.eq('sourceKind', kind).eq('sourceId', sourceId),
    )
    .unique();
  if (known && known.contentHash === contentHash) return false;

  await dropSource(ctx, kind, sourceId);
  await ctx.db.insert('textSources', {
    sourceKind: kind,
    sourceId,
    groupId: source.groupId,
    title: source.title,
    lang: source.lang,
    authorUserId: source.authorUserId,
    contentHash,
    words,
    indexedAt: Date.now(),
  });
  for (const print of fingerprintsOf(source.text)) {
    await ctx.db.insert('textFingerprints', {
      sourceKind: kind,
      sourceId,
      hash: print.hash,
      position: print.position,
    });
  }
  const chunks = chunkText(source.text);
  for (let i = 0; i < chunks.length; i++) {
    await ctx.db.insert('textPassages', {
      sourceKind: kind,
      sourceId,
      groupId: source.groupId,
      index: i,
      text: chunks[i],
      lang: source.lang,
    });
  }
  return chunks.length > 0;
}

const kindValidator = v.union(...KOHOP_INDEX_KINDS.map((k) => v.literal(k)));

/** One source, now: a KOHOP contribution deposited or revised. */
export const indexSource = internalMutation({
  args: { kind: kindValidator, sourceId: v.string() },
  returns: v.null(),
  handler: async (ctx, { kind, sourceId }) => {
    if (await indexOne(ctx, kind, sourceId)) {
      await ctx.scheduler.runAfter(0, internal.kohopIndex.embedPending, {});
    }
    return null;
  },
});

async function cursorRow(ctx: MutationCtx, key: string) {
  return await ctx.db
    .query('kohopIndexCursors')
    .withIndex('by_key', (q) => q.eq('key', key))
    .unique();
}

async function saveCursor(
  ctx: MutationCtx,
  key: string,
  next: string | null,
  finished: boolean,
) {
  const row = await cursorRow(ctx, key);
  const now = Date.now();
  if (row) {
    await ctx.db.patch(row._id, {
      cursor: next,
      passes: row.passes + (finished ? 1 : 0),
      updatedAt: now,
    });
  } else {
    await ctx.db.insert('kohopIndexCursors', {
      key,
      cursor: next,
      passes: finished ? 1 : 0,
      updatedAt: now,
    });
  }
}

/**
 * The next few documents of one source table, indexed. Returns whether a full
 * pass over the table has just ended (the next call then starts over).
 */
export const indexBatch = internalMutation({
  args: { kind: kindValidator },
  returns: v.object({ finished: v.boolean(), wrote: v.boolean() }),
  handler: async (ctx, { kind }) => {
    const row = await cursorRow(ctx, kind);
    const cursor = row?.cursor ?? null;
    const opts = { numItems: KIND_BATCH, cursor };
    const page =
      kind === 'kohop'
        ? await ctx.db.query('kohopContributions').paginate(opts)
        : kind === 'publication'
          ? await ctx.db.query('publications').paginate(opts)
          : kind === 'document'
            ? await ctx.db.query('documentExtractions').paginate(opts)
            : await ctx.db.query('tribunePosts').paginate(opts);
    let wrote = false;
    for (const doc of page.page) {
      if (await indexOne(ctx, kind, doc._id)) wrote = true;
    }
    await saveCursor(
      ctx,
      kind,
      page.isDone ? null : page.continueCursor,
      page.isDone,
    );
    if (wrote) {
      await ctx.scheduler.runAfter(0, internal.kohopIndex.embedPending, {});
    }
    return { finished: page.isDone, wrote };
  },
});

/**
 * A fresh read of the KOHOP contributions, from the start, independent of the
 * rolling cursor: a check must see a contribution deposited a minute ago.
 */
export const refreshKohop = internalMutation({
  args: { cursor: v.union(v.string(), v.null()) },
  returns: v.object({ next: v.union(v.string(), v.null()), done: v.boolean() }),
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query('kohopContributions')
      .paginate({ numItems: KIND_BATCH, cursor });
    for (const doc of page.page) await indexOne(ctx, 'kohop', doc._id);
    return {
      next: page.isDone ? null : page.continueCursor,
      done: page.isDone,
    };
  },
});

/** Drops the index rows of sources that no longer exist or left the corpus. */
export const pruneBatch = internalMutation({
  args: {},
  returns: v.object({ finished: v.boolean(), dropped: v.number() }),
  handler: async (ctx) => {
    const row = await cursorRow(ctx, PRUNE_KEY);
    const page = await ctx.db
      .query('textSources')
      .paginate({ numItems: PRUNE_BATCH, cursor: row?.cursor ?? null });
    let dropped = 0;
    for (const source of page.page) {
      if (!(await loadSource(ctx, source.sourceKind, source.sourceId))) {
        await dropSource(ctx, source.sourceKind, source.sourceId);
        dropped += 1;
      }
    }
    await saveCursor(
      ctx,
      PRUNE_KEY,
      page.isDone ? null : page.continueCursor,
      page.isDone,
    );
    return { finished: page.isDone, dropped };
  },
});

/** Has every source table been read to its end at least once? */
export const indexComplete = internalQuery({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    for (const kind of KOHOP_INDEX_KINDS) {
      const row = await ctx.db
        .query('kohopIndexCursors')
        .withIndex('by_key', (q) => q.eq('key', kind))
        .unique();
      if (!row || row.passes < 1) return false;
    }
    return true;
  },
});

// --- Embeddings --------------------------------------------------------------------

export const pendingPassages = internalQuery({
  args: { limit: v.number() },
  returns: v.array(v.object({ id: v.id('textPassages'), text: v.string() })),
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db
      .query('textPassages')
      .withIndex('by_unembedded', (q) => q.eq('embeddingModel', undefined))
      .take(limit);
    return rows.map((r) => ({ id: r._id, text: r.text }));
  },
});

export const storeEmbeddings = internalMutation({
  args: {
    model: v.string(),
    items: v.array(
      v.object({ id: v.id('textPassages'), embedding: v.array(v.number()) }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, { model, items }) => {
    for (const item of items) {
      // The passage may have been dropped while the gateway was answering.
      if (await ctx.db.get(item.id)) {
        await ctx.db.patch(item.id, {
          embedding: item.embedding,
          embeddingModel: model,
        });
      }
    }
    return null;
  },
});

/**
 * Embeds the passages that have no vector yet, one gateway call per batch,
 * under the daily cap. A failure leaves them pending: the next pass retries,
 * and a check that needs the vectors says plainly that it could not use them.
 */
export async function embedPendingBatches(
  ctx: ActionCtx,
  batches: number,
): Promise<'done' | 'cap' | 'failed'> {
  for (let i = 0; i < batches; i++) {
    const pending = await ctx.runQuery(internal.kohopIndex.pendingPassages, {
      limit: KOHOP_EMBEDDING_BATCH,
    });
    if (pending.length === 0) return 'done';
    const allowed = await ctx.runMutation(internal.kohopAi.reserveCalls, {
      calls: 1,
    });
    if (!allowed) return 'cap';
    const result = await runEmbeddings({
      model: KOHOP_EMBEDDING_MODEL,
      inputs: pending.map((p) => p.text),
      dimensions: KOHOP_EMBEDDING_DIMENSIONS,
    });
    if (!result.ok) return 'failed';
    await ctx.runMutation(internal.kohopIndex.storeEmbeddings, {
      model: result.model,
      items: pending.map((p, at) => ({
        id: p.id,
        embedding: result.vectors[at],
      })),
    });
  }
  return 'done';
}

export const embedPending = internalAction({
  args: { batches: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, { batches }) => {
    await embedPendingBatches(ctx, batches ?? 3);
    return null;
  },
});

// --- Running it --------------------------------------------------------------------

/**
 * Reads the source tables until every one has been read to its end once, so a
 * check never trusts an index that was never built. False when the bound was
 * reached first: the check then reports the index as incomplete.
 */
export async function catchUpIndex(ctx: ActionCtx): Promise<boolean> {
  // KOHOP contributions are few and change often: always read them afresh.
  let cursor: string | null = null;
  for (let page = 0; page < CATCH_UP_BATCHES; page++) {
    const out: { next: string | null; done: boolean } = await ctx.runMutation(
      internal.kohopIndex.refreshKohop,
      { cursor },
    );
    if (out.done) break;
    cursor = out.next;
  }
  if (await ctx.runQuery(internal.kohopIndex.indexComplete, {})) return true;
  let budget = CATCH_UP_BATCHES;
  for (const kind of KOHOP_INDEX_KINDS) {
    while (budget > 0) {
      budget -= 1;
      const { finished } = await ctx.runMutation(
        internal.kohopIndex.indexBatch,
        { kind },
      );
      if (finished) break;
    }
  }
  return await ctx.runQuery(internal.kohopIndex.indexComplete, {});
}

/** Is any passage of ANOTHER text still waiting for its vector? */
export const hasPendingEmbeddings = internalQuery({
  args: { exceptGroupId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { exceptGroupId }) => {
    const rows = await ctx.db
      .query('textPassages')
      .withIndex('by_unembedded', (q) => q.eq('embeddingModel', undefined))
      .take(100);
    return rows.some((r) => r.groupId !== exceptGroupId);
  },
});

export const needingCheck = internalQuery({
  args: { limit: v.number() },
  returns: v.array(
    v.object({
      contributionId: v.id('kohopContributions'),
      version: v.number(),
    }),
  ),
  handler: async (ctx, { limit }) => {
    const out: { contributionId: Id<'kohopContributions'>; version: number }[] =
      [];
    for (const stage of [
      'submitted',
      'in_review',
      'revision',
      'decision',
    ] as const) {
      const files = await ctx.db
        .query('kohopContributions')
        .withIndex('by_stage', (q) => q.eq('stage', stage))
        .take(50);
      for (const file of files) {
        const version = Math.max(
          file.reviewedVersion ?? 0,
          file.submittedVersion ?? 0,
        );
        if (version === 0) continue;
        const reports = await ctx.db
          .query('originalityReports')
          .withIndex('by_contribution_and_version', (q) =>
            q.eq('contributionId', file._id).eq('version', version),
          )
          .take(10);
        if (!reports.some((r) => r.scope === 'platform')) {
          out.push({ contributionId: file._id, version });
          if (out.length >= limit) return out;
        }
      }
    }
    return out;
  },
});

/** The cron: a few batches per table, the sweep, the vectors, and the backfill of checks. */
export const cycle = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    for (const kind of KOHOP_INDEX_KINDS) {
      for (let i = 0; i < CYCLE_BATCHES; i++) {
        const { finished } = await ctx.runMutation(
          internal.kohopIndex.indexBatch,
          { kind },
        );
        if (finished) break;
      }
    }
    for (let i = 0; i < CYCLE_BATCHES; i++) {
      const { finished } = await ctx.runMutation(
        internal.kohopIndex.pruneBatch,
        {},
      );
      if (finished) break;
    }
    await embedPendingBatches(ctx, 5);
    // Contributions deposited before the checks existed: run them now.
    const late = await ctx.runQuery(internal.kohopIndex.needingCheck, {
      limit: BACKFILL_PER_CYCLE,
    });
    for (const item of late) {
      await ctx.scheduler.runAfter(0, internal.kohopOriginality.runAll, item);
    }
    return null;
  },
});
