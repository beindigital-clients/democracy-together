import { v } from 'convex/values';
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { SITE_LOCALES, locale, type SiteLocale } from './lib/locales';
import { consumeRateLimit } from './lib/rateLimit';
import { GATEWAY_ERRORS, isGatewayConfigured } from './lib/aiGateway';
import {
  isRetryableTranslationError,
  translationRetryDelayMs,
  TRANSLATION_MAX_ATTEMPTS,
} from './lib/translation';

// TRANSLATING A PUBLICATION'S PDF WHEN IT GOES LIVE — the jobs.
//
// The attached PDF of a publication is translated into every other site
// language the moment the publication is published, keeping its design
// (engine: convex/lib/pdfTranslate, run by convex/pdfTranslateNode.ts).
// Readers then download the PDF in their language; nobody waits for it, and
// nobody pays for it twice.
//
// One job per (publication, language), carried by its `documentTranslations`
// row, with the same three steps and the same safeguards as the text jobs
// (convex/translationJobs.ts): a mutation CLAIMS the row under a lease, the
// Node action reads the file, translates and stores the result, a mutation
// WRITES it — only if the lease is still held and the publication still has
// the file that was translated. A result nobody holds any more is deleted
// from storage, not left behind.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const DAILY_CAP_KEY = 'documentTranslation:daily';

/**
 * Document translations allowed per 24 hours (one per file and language).
 * A spending guard: a PDF costs more than a page of text. Over it, jobs wait
 * for the next window.
 */
export const DEFAULT_DOCUMENT_DAILY_CAP = 60;

function documentDailyCap(): number {
  const raw = Number(process.env.DOCUMENT_TRANSLATION_DAILY_CAP);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_DOCUMENT_DAILY_CAP;
}

// A PDF is read whole and translated in several model calls: the lease
// covers the longest action Convex runs (10 minutes) with a margin.
const DOCUMENT_LEASE_MS = 12 * 60 * 1000;
const SWEEP_SCAN = 50;
const SWEEP_BATCH = 5;
const BACKFILL_MAX = 300;
// Documents are heavier than texts: the backfill spaces them further apart.
const BACKFILL_SPACING_MS = 90_000;

type DocumentSource = {
  fileId: Id<'_storage'>;
  sourceLocale: SiteLocale;
  targets: SiteLocale[];
};

/** What a publication's PDF is translated from, or `null`. */
function documentSource(
  pub: Doc<'publications'> | null,
): DocumentSource | null {
  if (!pub || pub.status !== 'published' || !pub.fileId) return null;
  const sourceLocale = pub.languages[0] ?? 'fr';
  return {
    fileId: pub.fileId,
    sourceLocale,
    targets: SITE_LOCALES.filter((l) => l !== sourceLocale),
  };
}

async function findRow(
  ctx: MutationCtx,
  publicationId: Id<'publications'>,
  targetLocale: SiteLocale,
): Promise<Doc<'documentTranslations'> | null> {
  return await ctx.db
    .query('documentTranslations')
    .withIndex('by_publication_and_locale', (q) =>
      q.eq('publicationId', publicationId).eq('targetLocale', targetLocale),
    )
    .unique();
}

function upToDate(
  row: Doc<'documentTranslations'> | null,
  fileId: Id<'_storage'>,
): boolean {
  return (
    row !== null &&
    row.fileId === fileId &&
    (row.status === 'ready' || row.status === 'pending')
  );
}

/**
 * Queues the translations a publication's PDF still needs. Called when the
 * publication goes live (`onPublicationPublished`, translationJobs.ts) and by
 * the backfill; languages already translated from this very file are skipped.
 *
 * @returns the number of jobs scheduled.
 */
export async function enqueueDocumentTranslations(
  ctx: MutationCtx,
  publicationId: Id<'publications'>,
  options: { delayMs?: number } = {},
): Promise<number> {
  const source = documentSource(await ctx.db.get(publicationId));
  if (!source) return 0;
  const delayMs = options.delayMs ?? 0;
  const now = Date.now();
  let scheduled = 0;

  for (const targetLocale of source.targets) {
    const existing = await findRow(ctx, publicationId, targetLocale);
    if (upToDate(existing, source.fileId)) continue;
    // The translation of a replaced file is obsolete: its file goes with it.
    if (existing?.storageId) await ctx.storage.delete(existing.storageId);
    const row = {
      publicationId,
      fileId: source.fileId,
      sourceLocale: source.sourceLocale,
      targetLocale,
      status: 'pending' as const,
      attempts: 0,
      nextAttemptAt: now + delayMs,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    let id: Id<'documentTranslations'>;
    if (existing) {
      await ctx.db.replace(existing._id, row);
      id = existing._id;
    } else {
      id = await ctx.db.insert('documentTranslations', row);
    }
    await ctx.scheduler.runAfter(
      delayMs,
      internal.pdfTranslateNode.runDocumentJob,
      { id },
    );
    scheduled++;
  }
  return scheduled;
}

async function writeFailure(
  ctx: MutationCtx,
  row: Doc<'documentTranslations'>,
  code: string,
  attempts: number,
): Promise<void> {
  await ctx.db.replace(row._id, {
    publicationId: row.publicationId,
    fileId: row.fileId,
    sourceLocale: row.sourceLocale,
    targetLocale: row.targetLocale,
    status: 'failed',
    error: code,
    attempts,
    createdAt: row.createdAt,
    updatedAt: Date.now(),
  });
}

const jobValidator = v.object({
  fileId: v.id('_storage'),
  sourceLocale: locale,
  targetLocale: locale,
  leaseUntil: v.number(),
});

type Job = {
  fileId: Id<'_storage'>;
  sourceLocale: SiteLocale;
  targetLocale: SiteLocale;
  leaseUntil: number;
};

/**
 * Step 1 — takes a pending job. `null`: nothing to do now (finished, held,
 * not due, over the daily cap, or the publication no longer needs it).
 */
export const claimDocumentJob = internalMutation({
  args: { id: v.id('documentTranslations') },
  returns: v.union(v.null(), jobValidator),
  handler: async (ctx, { id }): Promise<Job | null> => {
    const row = await ctx.db.get(id);
    if (!row || row.status !== 'pending') return null;
    const now = Date.now();
    if (row.leaseUntil !== undefined && row.leaseUntil > now) return null;
    if (row.nextAttemptAt !== undefined && row.nextAttemptAt > now) return null;

    const source = documentSource(await ctx.db.get(row.publicationId));
    // Unpublished, or its file replaced since the job was queued: there is
    // nothing left to translate. A new publication queues what it needs.
    if (
      !source ||
      source.fileId !== row.fileId ||
      !source.targets.includes(row.targetLocale)
    ) {
      await ctx.db.delete(id);
      return null;
    }
    if (!isGatewayConfigured()) {
      await writeFailure(
        ctx,
        row,
        GATEWAY_ERRORS.NOT_CONFIGURED,
        row.attempts ?? 0,
      );
      return null;
    }
    const allowed = await consumeRateLimit(ctx, {
      key: DAILY_CAP_KEY,
      max: documentDailyCap(),
      windowMs: DAY,
    });
    if (!allowed) {
      await ctx.db.patch(id, { nextAttemptAt: now + HOUR, updatedAt: now });
      return null;
    }
    const leaseUntil = now + DOCUMENT_LEASE_MS;
    await ctx.db.patch(id, { leaseUntil, updatedAt: now });
    return {
      fileId: row.fileId,
      sourceLocale: row.sourceLocale,
      targetLocale: row.targetLocale,
      leaseUntil,
    };
  },
});

const outcomeValidator = v.union(
  v.object({
    ok: v.literal(true),
    storageId: v.id('_storage'),
    pages: v.number(),
    size: v.number(),
    model: v.string(),
  }),
  v.object({ ok: v.literal(false), code: v.string() }),
);

/** Step 3 — writes the translated file, or the failure, if still wanted. */
export const finishDocumentJob = internalMutation({
  args: {
    id: v.id('documentTranslations'),
    leaseUntil: v.number(),
    fileId: v.id('_storage'),
    outcome: outcomeValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    const outcome = args.outcome;
    const source = row
      ? documentSource(await ctx.db.get(row.publicationId))
      : null;
    const superseded =
      !row ||
      row.status !== 'pending' ||
      row.leaseUntil !== args.leaseUntil ||
      row.fileId !== args.fileId ||
      // The publication's file was replaced while this one was translated.
      (source !== null && source.fileId !== args.fileId);
    if (superseded) {
      // Work nobody holds any more: its file is not left in storage.
      if (outcome.ok) await ctx.storage.delete(outcome.storageId);
      return null;
    }
    const now = Date.now();
    if (outcome.ok) {
      await ctx.db.replace(row._id, {
        publicationId: row.publicationId,
        fileId: row.fileId,
        sourceLocale: row.sourceLocale,
        targetLocale: row.targetLocale,
        status: 'ready',
        storageId: outcome.storageId,
        pages: outcome.pages,
        size: outcome.size,
        model: outcome.model,
        createdAt: row.createdAt,
        updatedAt: now,
      });
      return null;
    }

    const attempts = (row.attempts ?? 0) + 1;
    if (
      isRetryableTranslationError(outcome.code) &&
      attempts < TRANSLATION_MAX_ATTEMPTS
    ) {
      const delay = translationRetryDelayMs(attempts);
      await ctx.db.patch(row._id, {
        attempts,
        error: outcome.code,
        leaseUntil: undefined,
        nextAttemptAt: now + delay,
        updatedAt: now,
      });
      await ctx.scheduler.runAfter(
        delay,
        internal.pdfTranslateNode.runDocumentJob,
        { id: row._id },
      );
      return null;
    }
    await writeFailure(ctx, row, outcome.code, attempts);
    return null;
  },
});

/** Restarts the due pending jobs held by nobody. Cron, every ten minutes. */
export const sweepDocuments = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query('documentTranslations')
      .withIndex('by_status_and_nextAttemptAt', (q) =>
        q.eq('status', 'pending').lte('nextAttemptAt', now),
      )
      .take(SWEEP_SCAN);
    let scheduled = 0;
    for (const row of due) {
      if (scheduled >= SWEEP_BATCH) break;
      if (row.leaseUntil !== undefined && row.leaseUntil > now) continue;
      await ctx.scheduler.runAfter(
        scheduled * 30_000,
        internal.pdfTranslateNode.runDocumentJob,
        { id: row._id },
      );
      scheduled++;
    }
    return scheduled;
  },
});

async function publishedWithFile(ctx: MutationCtx) {
  const pubs = await ctx.db
    .query('publications')
    .withIndex('by_status', (q) => q.eq('status', 'published'))
    .take(BACKFILL_MAX);
  return pubs.filter((p) => p.fileId !== undefined);
}

/**
 * Translates the PDFs of publications published BEFORE this existed.
 *
 * `dryRun: true` only counts — documents, translations, bytes — and
 * `pdfTranslateNode:estimateDocumentBackfill` adds the page count, which is
 * what the cost follows. Idempotent, as the text backfill.
 *
 *   npx convex run documentJobs:backfillDocuments '{"dryRun":true}'
 *   npx convex run documentJobs:backfillDocuments '{"dryRun":false}'
 */
export const backfillDocuments = internalMutation({
  args: { dryRun: v.boolean() },
  returns: v.object({
    documents: v.number(),
    translations: v.number(),
    totalBytes: v.number(),
  }),
  handler: async (ctx, { dryRun }) => {
    let documents = 0;
    let translations = 0;
    let totalBytes = 0;
    for (const pub of await publishedWithFile(ctx)) {
      const source = documentSource(pub);
      if (!source) continue;
      let needed = 0;
      for (const target of source.targets) {
        if (!upToDate(await findRow(ctx, pub._id, target), source.fileId))
          needed++;
      }
      if (needed === 0) continue;
      const meta = await ctx.db.system.get(source.fileId);
      if (!dryRun) {
        await enqueueDocumentTranslations(ctx, pub._id, {
          delayMs: documents * BACKFILL_SPACING_MS,
        });
      }
      documents++;
      translations += needed;
      totalBytes += (meta?.size ?? 0) * needed;
    }
    return { documents, translations, totalBytes };
  },
});

/** The files the backfill would translate, and into how many languages. */
export const backfillCandidates = internalQuery({
  args: {},
  returns: v.array(
    v.object({ fileId: v.id('_storage'), languages: v.number() }),
  ),
  handler: async (ctx) => {
    const pubs = await ctx.db
      .query('publications')
      .withIndex('by_status', (q) => q.eq('status', 'published'))
      .take(BACKFILL_MAX);
    const out: { fileId: Id<'_storage'>; languages: number }[] = [];
    for (const pub of pubs) {
      const source = documentSource(pub);
      if (!source) continue;
      let languages = 0;
      for (const target of source.targets) {
        const row = await ctx.db
          .query('documentTranslations')
          .withIndex('by_publication_and_locale', (q) =>
            q.eq('publicationId', pub._id).eq('targetLocale', target),
          )
          .unique();
        if (!upToDate(row, source.fileId)) languages++;
      }
      if (languages > 0) out.push({ fileId: source.fileId, languages });
    }
    return out;
  },
});
