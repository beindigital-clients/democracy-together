import { v } from 'convex/values';
import {
  internalAction,
  internalMutation,
  type MutationCtx,
} from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { locale, type SiteLocale } from './lib/locales';
import { consumeRateLimit } from './lib/rateLimit';
import {
  GATEWAY_ERRORS,
  isGatewayConfigured,
  runStructured,
} from './lib/aiGateway';
import {
  buildTranslationInput,
  buildTranslationInstructions,
  buildTranslationSchema,
  isRetryableTranslationError,
  outputTokenBudget,
  parseTranslation,
  sourceFingerprint,
  sourceLength,
  translatableFields,
  translationDailyCap,
  translationModel,
  translationRetryDelayMs,
  MAX_SOURCE_CHARS,
  TRANSLATION_LEASE_MS,
  TRANSLATION_MAX_ATTEMPTS,
  type TranslatableFields,
  type TranslationSourceType,
} from './lib/translation';
import { readSource } from './lib/translationSource';

// TRANSLATING CONTENT WHEN IT GOES LIVE — the jobs.
//
// A publication, a Tribune post or a news article is translated ONCE, the
// moment it is published, into every other site language. Readers then pick
// the language they read in (convex/translation.ts); nobody waits for a
// model, and nobody pays for the same translation twice.
//
// ONE JOB PER (CONTENT, LANGUAGE), CARRIED BY ITS ROW. `enqueueTranslations`
// writes the `contentTranslations` row `pending` and schedules `runJob`. The
// job runs in three steps, as everywhere a model is called in this repo
// (`aiModeration.ts`): a mutation CLAIMS the row and reads the source, the
// action calls the model, a mutation WRITES the result after re-checking
// what may have changed in between.
//
// WHAT MAKES IT SAFE TO RUN TWICE:
//  - the claim takes a LEASE (`leaseUntil`). A second run of the same job
//    finds it held and stops; a run whose lease has expired writes nothing.
//  - the result is written only if the source still has the fingerprint it
//    was translated from. A text edited during the call is translated again.
//  - a `sweep` every few minutes restarts what a crash or the daily cap left
//    behind: the scheduler is the fast path, not the only one.
//
// WHAT IT COSTS IS BOUNDED. Every model call takes a token from a daily cap
// (`TRANSLATION_DAILY_CAP`); over it, jobs wait for the next window instead
// of failing. A job is attempted three times at most.

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const DAILY_CAP_KEY = 'translation:daily';
// Due jobs the sweep looks at, and restarts, per run.
const SWEEP_SCAN = 100;
const SWEEP_BATCH = 20;
// Content looked at per table by the backfill. The library, the Tribune and
// the news count a few dozen items each today; the bound keeps the backfill
// inside one transaction.
const BACKFILL_MAX = 300;
// Gap between two items' jobs in a backfill, so that catching up on the
// whole site does not fire a hundred model calls in the same second.
const BACKFILL_SPACING_MS = 20_000;

async function findRow(
  ctx: MutationCtx,
  sourceType: TranslationSourceType,
  sourceId: string,
  targetLocale: SiteLocale,
): Promise<Doc<'contentTranslations'> | null> {
  return await ctx.db
    .query('contentTranslations')
    .withIndex('by_source_and_target', (q) =>
      q
        .eq('sourceType', sourceType)
        .eq('sourceId', sourceId)
        .eq('targetLocale', targetLocale),
    )
    .unique();
}

/** Already translated, or already on its way, for THIS text. */
function upToDate(
  row: Doc<'contentTranslations'> | null,
  sourceHash: string,
): boolean {
  return (
    row !== null &&
    row.sourceHash === sourceHash &&
    (row.status === 'ready' || row.status === 'pending')
  );
}

/**
 * Queues the translations a piece of content still needs.
 *
 * Called by every path that puts content online, in the same transaction:
 * the jobs exist as soon as the content is public. Languages already
 * translated from this very text are skipped, so calling it again — a
 * re-publication, a backfill — costs nothing.
 *
 * @returns the number of jobs scheduled.
 */
export async function enqueueTranslations(
  ctx: MutationCtx,
  sourceType: TranslationSourceType,
  sourceId: string,
  options: { delayMs?: number } = {},
): Promise<number> {
  const source = await readSource(ctx, sourceType, sourceId);
  if (!source) return 0;

  const sourceHash = sourceFingerprint(source.fields);
  // A text over the bound will never fit the model's output budget: the
  // rows say so at once instead of failing three times.
  const tooLong = sourceLength(source.fields) > MAX_SOURCE_CHARS;
  const delayMs = options.delayMs ?? 0;
  const now = Date.now();
  let scheduled = 0;

  for (const targetLocale of source.targets) {
    const existing = await findRow(ctx, sourceType, sourceId, targetLocale);
    if (upToDate(existing, sourceHash)) continue;

    const base = {
      sourceType,
      sourceId,
      sourceLocale: source.sourceLocale,
      targetLocale,
      sourceHash,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    // `replace`, not `patch`: a stale translation must LOSE its fields and
    // its error when its job starts again.
    const row = tooLong
      ? { ...base, status: 'failed' as const, error: 'TOO_LONG' }
      : {
          ...base,
          status: 'pending' as const,
          attempts: 0,
          nextAttemptAt: now + delayMs,
        };
    let id: Id<'contentTranslations'>;
    if (existing) {
      await ctx.db.replace(existing._id, row);
      id = existing._id;
    } else {
      id = await ctx.db.insert('contentTranslations', row);
    }
    if (!tooLong) {
      await ctx.scheduler.runAfter(delayMs, internal.translationJobs.runJob, {
        id,
      });
      scheduled++;
    }
  }
  return scheduled;
}

/** A job that will not be retried: the row keeps the reason, not a text. */
async function writeFailure(
  ctx: MutationCtx,
  row: Doc<'contentTranslations'>,
  code: string,
  sourceHash: string,
  attempts: number,
): Promise<void> {
  await ctx.db.replace(row._id, {
    sourceType: row.sourceType,
    sourceId: row.sourceId,
    sourceLocale: row.sourceLocale,
    targetLocale: row.targetLocale,
    sourceHash,
    status: 'failed',
    error: code,
    attempts,
    createdAt: row.createdAt,
    updatedAt: Date.now(),
  });
}

const jobValidator = v.object({
  sourceLocale: locale,
  targetLocale: locale,
  fields: translatableFields,
  sourceHash: v.string(),
  leaseUntil: v.number(),
});

type Job = {
  sourceLocale: SiteLocale;
  targetLocale: SiteLocale;
  fields: TranslatableFields;
  sourceHash: string;
  leaseUntil: number;
};

/**
 * Step 1 — takes a pending job, and hands its CURRENT source text to the
 * action. `null`: nothing to do now (finished, held by another run, not due,
 * over the daily cap, or nothing left to translate).
 */
export const claimJob = internalMutation({
  args: { id: v.id('contentTranslations') },
  returns: v.union(v.null(), jobValidator),
  handler: async (ctx, { id }): Promise<Job | null> => {
    const row = await ctx.db.get(id);
    if (!row || row.status !== 'pending') return null;
    const now = Date.now();
    if (row.leaseUntil !== undefined && row.leaseUntil > now) return null;
    if (row.nextAttemptAt !== undefined && row.nextAttemptAt > now) return null;

    const source = await readSource(ctx, row.sourceType, row.sourceId);
    // Unpublished since it was queued, or — for a news article — written
    // by hand in this language since: nothing is left to translate. The
    // next publication queues it again if needed.
    if (!source || !source.targets.includes(row.targetLocale)) {
      await ctx.db.delete(id);
      return null;
    }

    const sourceHash = sourceFingerprint(source.fields);
    const attempts = row.attempts ?? 0;
    if (sourceLength(source.fields) > MAX_SOURCE_CHARS) {
      await writeFailure(ctx, row, 'TOO_LONG', sourceHash, attempts);
      return null;
    }
    // Without a key no call can happen: a final failure, which the next
    // publication or a backfill restarts once the key is set.
    if (!isGatewayConfigured()) {
      await writeFailure(
        ctx,
        row,
        GATEWAY_ERRORS.NOT_CONFIGURED,
        sourceHash,
        attempts,
      );
      return null;
    }

    // The cap is consumed BEFORE the call, in this transaction: two jobs
    // claimed at the same time cannot both take the last token.
    const allowed = await consumeRateLimit(ctx, {
      key: DAILY_CAP_KEY,
      max: translationDailyCap(),
      windowMs: DAY,
    });
    if (!allowed) {
      // Over the cap, the job has neither failed nor been tried: it waits,
      // and the sweep picks it up again.
      await ctx.db.patch(id, { nextAttemptAt: now + HOUR, updatedAt: now });
      return null;
    }

    const leaseUntil = now + TRANSLATION_LEASE_MS;
    await ctx.db.patch(id, {
      leaseUntil,
      sourceHash,
      sourceLocale: source.sourceLocale,
      updatedAt: now,
    });
    return {
      sourceLocale: source.sourceLocale,
      targetLocale: row.targetLocale,
      fields: source.fields,
      sourceHash,
      leaseUntil,
    };
  },
});

const outcomeValidator = v.union(
  v.object({
    ok: v.literal(true),
    fields: translatableFields,
    model: v.string(),
  }),
  v.object({ ok: v.literal(false), code: v.string() }),
);

/**
 * Step 2 — the model call. The only step outside a transaction, hence the
 * only one that writes nothing itself.
 */
export const runJob = internalAction({
  args: { id: v.id('contentTranslations') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const job: Job | null = await ctx.runMutation(
      internal.translationJobs.claimJob,
      { id },
    );
    if (!job) return null;

    const result = await runStructured({
      model: translationModel(),
      instructions: buildTranslationInstructions(
        job.sourceLocale,
        job.targetLocale,
      ),
      userText: buildTranslationInput(job.fields),
      schemaName: 'translation',
      schema: buildTranslationSchema(job.fields),
      maxOutputTokens: outputTokenBudget(job.fields),
    });

    // The output is revalidated here: the schema is applied BY THE GATEWAY,
    // and a translation missing a paragraph must be rejected rather than
    // served truncated.
    let outcome:
      | { ok: true; fields: TranslatableFields; model: string }
      | { ok: false; code: string };
    if (!result.ok) {
      outcome = { ok: false, code: result.code };
    } else {
      const translated = parseTranslation(job.fields, result.data);
      outcome = translated
        ? { ok: true, fields: translated, model: result.model }
        : { ok: false, code: GATEWAY_ERRORS.BAD_RESPONSE };
    }

    await ctx.runMutation(internal.translationJobs.finishJob, {
      id,
      leaseUntil: job.leaseUntil,
      sourceHash: job.sourceHash,
      outcome,
    });
    return null;
  },
});

/**
 * Step 3 — writes what the call produced, if the job is still the one that
 * was claimed and the text is still the one that was translated.
 */
export const finishJob = internalMutation({
  args: {
    id: v.id('contentTranslations'),
    leaseUntil: v.number(),
    sourceHash: v.string(),
    outcome: outcomeValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.id);
    // Superseded: queued again after an edit, taken over once the lease ran
    // out, or already finished. The work of a run nobody holds is dropped.
    if (
      !row ||
      row.status !== 'pending' ||
      row.leaseUntil !== args.leaseUntil
    ) {
      return null;
    }
    const now = Date.now();
    const outcome = args.outcome;

    if (outcome.ok) {
      const source = await readSource(ctx, row.sourceType, row.sourceId);
      if (source && sourceFingerprint(source.fields) !== args.sourceHash) {
        // The text changed while the model was translating it: this
        // translation describes a version that no longer exists. Start
        // again on the current text, without counting an attempt.
        await ctx.db.patch(row._id, {
          leaseUntil: undefined,
          nextAttemptAt: now,
          updatedAt: now,
        });
        await ctx.scheduler.runAfter(0, internal.translationJobs.runJob, {
          id: row._id,
        });
        return null;
      }
      await ctx.db.replace(row._id, {
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        sourceLocale: row.sourceLocale,
        targetLocale: row.targetLocale,
        sourceHash: args.sourceHash,
        status: 'ready',
        fields: outcome.fields,
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
      await ctx.scheduler.runAfter(delay, internal.translationJobs.runJob, {
        id: row._id,
      });
      return null;
    }
    await writeFailure(ctx, row, outcome.code, args.sourceHash, attempts);
    return null;
  },
});

/**
 * Restarts the pending jobs that are due and held by nobody: a run lost in a
 * crash, a job deferred by the daily cap. Cron, every ten minutes.
 */
export const sweep = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query('contentTranslations')
      .withIndex('by_status_and_nextAttemptAt', (q) =>
        q.eq('status', 'pending').lte('nextAttemptAt', now),
      )
      .take(SWEEP_SCAN);
    let scheduled = 0;
    for (const row of due) {
      if (scheduled >= SWEEP_BATCH) break;
      if (row.leaseUntil !== undefined && row.leaseUntil > now) continue;
      // Spaced by a few seconds: the sweep catches up, it does not burst.
      await ctx.scheduler.runAfter(
        scheduled * 5_000,
        internal.translationJobs.runJob,
        { id: row._id },
      );
      scheduled++;
    }
    return scheduled;
  },
});

const backfillReport = v.object({
  /** Content items with at least one language to translate. */
  sources: v.number(),
  /** Translations (content × language) to produce. */
  translations: v.number(),
  /** Characters sent to the model, all translations included. */
  sourceChars: v.number(),
  estimatedInputTokens: v.number(),
  estimatedOutputTokens: v.number(),
});

/**
 * Translates what was published BEFORE translation at publication existed.
 *
 * Run it with `dryRun: true` first: it then only counts, and the estimate
 * says what the backfill will cost before anything is spent.
 *
 *   npx convex run translationJobs:backfill '{"dryRun":true}'
 *   npx convex run translationJobs:backfill '{"dryRun":false}'
 *
 * Idempotent: content already translated from its current text is skipped,
 * so a second run only queues what the first one left out.
 */
export const backfill = internalMutation({
  args: { dryRun: v.boolean() },
  returns: backfillReport,
  handler: async (ctx, { dryRun }) => {
    const candidates: { type: TranslationSourceType; id: string }[] = [];
    const publications = await ctx.db
      .query('publications')
      .withIndex('by_status', (q) => q.eq('status', 'published'))
      .take(BACKFILL_MAX);
    for (const p of publications)
      candidates.push({ type: 'publication', id: p._id });
    const posts = await ctx.db
      .query('tribunePosts')
      .withIndex('by_status', (q) => q.eq('status', 'published'))
      .take(BACKFILL_MAX);
    for (const p of posts) candidates.push({ type: 'tribunePost', id: p._id });
    const news = await ctx.db
      .query('contentNews')
      .withIndex('by_status_and_publishedOn', (q) =>
        q.eq('status', 'published'),
      )
      .take(BACKFILL_MAX);
    for (const n of news) candidates.push({ type: 'news', id: n._id });

    let sources = 0;
    let translations = 0;
    let sourceChars = 0;
    for (const c of candidates) {
      const source = await readSource(ctx, c.type, c.id);
      if (!source) continue;
      const sourceHash = sourceFingerprint(source.fields);
      let needed = 0;
      for (const target of source.targets) {
        const row = await findRow(ctx, c.type, c.id, target);
        if (!upToDate(row, sourceHash)) needed++;
      }
      if (needed === 0) continue;
      if (!dryRun) {
        await enqueueTranslations(ctx, c.type, c.id, {
          delayMs: sources * BACKFILL_SPACING_MS,
        });
      }
      sources++;
      translations += needed;
      sourceChars += sourceLength(source.fields) * needed;
    }

    // A rough estimate, for deciding, not for invoicing: about three
    // characters per token in these languages, a few hundred tokens of
    // instructions per call, and an output a third longer than its input.
    return {
      sources,
      translations,
      sourceChars,
      estimatedInputTokens: Math.round(sourceChars / 3 + translations * 400),
      estimatedOutputTokens: Math.round((sourceChars / 3) * 1.3),
    };
  },
});
