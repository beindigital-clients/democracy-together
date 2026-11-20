import { v, ConvexError } from 'convex/values';
import {
  query,
  action,
  internalQuery,
  internalMutation,
  type ActionCtx,
  type QueryCtx,
} from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { getAuthUserId } from '@convex-dev/auth/server';
import { locale, type SiteLocale } from './lib/locales';
import { getActiveUserById, getCercleUser } from './lib/rbac';
import { hasCercleAccess } from './lib/roles';
import { enforceRateLimit } from './lib/rateLimit';
import {
  isGatewayConfigured,
  runStructured,
  GATEWAY_ERRORS,
} from './lib/aiGateway';
import { translationModel, translationStatus } from './lib/translation';
import {
  buildCercleTranslationInput,
  buildCercleTranslationInstructions,
  buildCercleTranslationSchema,
  contributionFingerprint,
  contributionParagraphs,
  parseCercleTranslation,
  CERCLE_TRANSLATION_OUTPUT_TOKENS,
} from './lib/cercleTranslation';

// TRANSLATION OF THE CERCLE'S PRIVATE CONTRIBUTIONS — orchestration.
//
// A reader of the Cercle presses "Translate" under a contribution; the text is
// translated into the reader's language and CACHED for the next readers of
// that language. Same three phases as convex/translation.ts (read, call,
// write), for the same reason: a mutation has no `fetch`, an action has no
// transaction. Nothing is shared with that module's tables or queries.
//
// RULES, covered by convex/cercle-translation.test.ts:
//  1. ONLY THE CERCLE READS OR ASKS. Same access rule as the contribution
//     (`hasCercleAccess`), checked in the query AND, again, in the action's
//     internal read: the client sends an identifier, never text.
//  2. ZERO DATA RETENTION, ALWAYS. Every model call sets `zeroDataRetention`:
//     the gateway routes it only to providers that keep nothing, and fails
//     rather than fall back to one that would.
//  3. GONE WITH THE CONTRIBUTION. A removed contribution has no translation
//     to read, none can be asked for, a result arriving after the removal is
//     not written, and the rows are deleted with the contribution or the
//     account (`cercleContributions.remove`, lib/cercleUserData.ts).
//  4. NEVER TO MODERATION. Nothing here schedules `aiModeration`.

const translationValidator = v.object({
  status: translationStatus,
  targetLocale: locale,
  /** The paragraphs, when `status` is 'ready'. */
  body: v.optional(v.array(v.string())),
  /** Language the model found ('fr'…'ar', or 'other'). */
  detectedLocale: v.optional(v.string()),
  /** The text was already in the reader's language: nothing to show. */
  sameLanguage: v.boolean(),
  /** The row describes the contribution as it is today. */
  fresh: v.boolean(),
  error: v.optional(v.string()),
});

/** A visible contribution and its paragraphs, or null. */
async function readContribution(
  ctx: QueryCtx,
  contributionId: Id<'cercleContributions'>,
): Promise<{ paragraphs: string[]; fingerprint: string } | null> {
  const row = await ctx.db.get(contributionId);
  if (!row || row.status !== 'visible' || !row.body.trim()) return null;
  const paragraphs = contributionParagraphs(row.body);
  return { paragraphs, fingerprint: contributionFingerprint(paragraphs) };
}

async function findRow(
  ctx: QueryCtx,
  contributionId: Id<'cercleContributions'>,
  targetLocale: SiteLocale,
): Promise<Doc<'cercleTranslations'> | null> {
  return await ctx.db
    .query('cercleTranslations')
    .withIndex('by_contribution_and_target', (q) =>
      q.eq('contributionId', contributionId).eq('targetLocale', targetLocale),
    )
    .unique();
}

// --- Public query ---------------------------------------------------------

/**
 * The cached translation of a contribution for a reading language, or null
 * when none was asked for (or the reader is not in the Cercle).
 */
export const get = query({
  args: {
    contributionId: v.id('cercleContributions'),
    targetLocale: locale,
  },
  returns: v.union(translationValidator, v.null()),
  handler: async (ctx, args) => {
    if (!(await getCercleUser(ctx))) return null;
    const source = await readContribution(ctx, args.contributionId);
    if (!source) return null;
    const row = await findRow(ctx, args.contributionId, args.targetLocale);
    if (!row) return null;
    return {
      status: row.status,
      targetLocale: row.targetLocale,
      body: row.body,
      detectedLocale: row.detectedLocale,
      sameLanguage: row.detectedLocale === row.targetLocale,
      fresh: row.sourceHash === source.fingerprint,
      error: row.error,
    };
  },
});

// --- Phase 1: read the source ----------------------------------------------

export const loadSource = internalQuery({
  args: {
    contributionId: v.id('cercleContributions'),
    targetLocale: locale,
    userId: v.id('users'),
  },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      paragraphs: v.array(v.string()),
      fingerprint: v.string(),
      cached: v.boolean(),
    }),
    v.object({ ok: v.literal(false), reason: v.string() }),
  ),
  handler: async (ctx, args) => {
    const user = await getActiveUserById(ctx, args.userId);
    if (!user || !hasCercleAccess(user)) {
      return { ok: false as const, reason: 'FORBIDDEN' };
    }
    const source = await readContribution(ctx, args.contributionId);
    if (!source) return { ok: false as const, reason: 'NOT_FOUND' };
    const row = await findRow(ctx, args.contributionId, args.targetLocale);
    return {
      ok: true as const,
      paragraphs: source.paragraphs,
      fingerprint: source.fingerprint,
      // Already translated and up to date: no call, no quota spent.
      cached: row?.status === 'ready' && row.sourceHash === source.fingerprint,
    };
  },
});

// --- Phase 3: write the result -------------------------------------------

export const save = internalMutation({
  args: {
    contributionId: v.id('cercleContributions'),
    targetLocale: locale,
    sourceHash: v.string(),
    status: translationStatus,
    detectedLocale: v.optional(v.string()),
    body: v.optional(v.array(v.string())),
    model: v.optional(v.string()),
    error: v.optional(v.string()),
    requestedBy: v.id('users'),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Re-checked here: the contribution may have been removed while the model
    // was translating it. A translation of a removed text is not written.
    const source = await readContribution(ctx, args.contributionId);
    if (!source || source.fingerprint !== args.sourceHash) return null;

    const now = Date.now();
    const existing = await findRow(ctx, args.contributionId, args.targetLocale);
    // `replace`, not `patch`: a success after a failure must lose its `error`,
    // a failure after a success must lose its `body`.
    const row = {
      contributionId: args.contributionId,
      targetLocale: args.targetLocale,
      sourceHash: args.sourceHash,
      status: args.status,
      ...(args.detectedLocale ? { detectedLocale: args.detectedLocale } : {}),
      ...(args.body ? { body: args.body } : {}),
      ...(args.model ? { model: args.model } : {}),
      ...(args.error ? { error: args.error } : {}),
      requestedBy: args.requestedBy,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    if (existing) await ctx.db.replace(existing._id, row);
    else await ctx.db.insert('cercleTranslations', row);
    return null;
  },
});

/** Takes a quota token BEFORE the call: what costs is the call. */
export const consumeQuota = internalMutation({
  args: { userId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    await enforceRateLimit(ctx, {
      key: `cercle-translate:user:${userId}`,
      // Contributions are short and a page lists twenty: thirty per hour lets
      // a reader go through a page, and the cache serves everyone after.
      max: 30,
      windowMs: 60 * 60 * 1000,
    });
    return null;
  },
});

// --- Phase 2: the call ------------------------------------------------------

/**
 * Translates a contribution into a language, under zero data retention, and
 * caches the result. Returns its failures as `{ ok: false, code }`.
 */
export const request = action({
  args: {
    contributionId: v.id('cercleContributions'),
    targetLocale: locale,
  },
  returns: v.object({ ok: v.boolean(), code: v.optional(v.string()) }),
  handler: async (ctx, args): Promise<{ ok: boolean; code?: string }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { ok: false, code: 'FORBIDDEN' };

    const context = await ctx.runQuery(internal.cercleTranslations.loadSource, {
      contributionId: args.contributionId,
      targetLocale: args.targetLocale,
      userId,
    });
    if (!context.ok) return { ok: false, code: context.reason };
    if (context.cached) return { ok: true };

    if (!isGatewayConfigured()) {
      await persistFailure(
        ctx,
        args,
        context.fingerprint,
        userId,
        GATEWAY_ERRORS.NOT_CONFIGURED,
      );
      return { ok: false, code: GATEWAY_ERRORS.NOT_CONFIGURED };
    }

    try {
      await ctx.runMutation(internal.cercleTranslations.consumeQuota, {
        userId,
      });
    } catch (error) {
      if (error instanceof ConvexError) {
        return { ok: false, code: 'RATE_LIMITED' };
      }
      throw error;
    }

    const result = await runStructured({
      model: translationModel(),
      instructions: buildCercleTranslationInstructions(args.targetLocale),
      userText: buildCercleTranslationInput(context.paragraphs),
      schemaName: 'cercle_translation',
      schema: buildCercleTranslationSchema(context.paragraphs.length),
      maxOutputTokens: CERCLE_TRANSLATION_OUTPUT_TOKENS,
      zeroDataRetention: true,
    });
    if (!result.ok) {
      await persistFailure(ctx, args, context.fingerprint, userId, result.code);
      return { ok: false, code: result.code };
    }

    const translated = parseCercleTranslation(context.paragraphs, result.data);
    if (!translated) {
      await persistFailure(
        ctx,
        args,
        context.fingerprint,
        userId,
        GATEWAY_ERRORS.BAD_RESPONSE,
      );
      return { ok: false, code: GATEWAY_ERRORS.BAD_RESPONSE };
    }

    await ctx.runMutation(internal.cercleTranslations.save, {
      contributionId: args.contributionId,
      targetLocale: args.targetLocale,
      sourceHash: context.fingerprint,
      status: 'ready',
      detectedLocale: translated.sourceLanguage,
      body: translated.body,
      model: result.model,
      requestedBy: userId,
    });
    return { ok: true };
  },
});

async function persistFailure(
  ctx: ActionCtx,
  args: {
    contributionId: Id<'cercleContributions'>;
    targetLocale: SiteLocale;
  },
  fingerprint: string,
  userId: Id<'users'>,
  code: string,
): Promise<void> {
  // A row even when no call took place (missing key): otherwise the page shows
  // the same button forever and nobody learns the mechanism is broken.
  await ctx.runMutation(internal.cercleTranslations.save, {
    contributionId: args.contributionId,
    targetLocale: args.targetLocale,
    sourceHash: fingerprint,
    status: 'failed',
    error: code,
    requestedBy: userId,
  });
}
