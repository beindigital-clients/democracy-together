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
import { getCurrentUser, getActiveUserById, rank } from './lib/rbac';
import { enforceRateLimit } from './lib/rateLimit';
import {
  isGatewayConfigured,
  runStructured,
  GATEWAY_ERRORS,
} from './lib/aiGateway';
import {
  buildTranslationInput,
  buildTranslationInstructions,
  buildTranslationSchema,
  outputTokenBudget,
  parseTranslation,
  sourceFingerprint,
  sourceLength,
  translatableFields,
  translationModel,
  translationSourceType,
  translationStatus,
  MAX_SOURCE_CHARS,
  type TranslatableFields,
  type TranslationSourceType,
} from './lib/translation';

// TRANSLATION OF CONTENT SUBMITTED BY MEMBERS — orchestration.
//
// The mechanism in one sentence: a reader opens content written in a
// language they do not read, the page offers them a translation, and the resulting
// translation is CACHED for everyone who follows.
//
// THREE RULES, enforced by the code and covered by convex/translation.test.ts:
//
//  1. THE ORIGINAL NEVER DISAPPEARS. No write touches the source
//     document. A translation is a row alongside it, which the page can ignore —
//     and which it does ignore as soon as the text's fingerprint has changed.
//  2. NOTHING IS DISPLAYED AS TRANSLATED WITHOUT BEING SO. A failed analysis writes
//     a `failed` row rather than nothing: that is what lets the interface
//     distinguish "not yet requested" from "requested, and it did not work".
//     The fail-closed approach of `lib/recaptcha.ts`, applied to a read.
//  3. THE SERVER IS WHAT READS THE SOURCE TEXT. The client sends an
//     identifier, never content: otherwise, anyone could have
//     anything translated at the network's expense, and a members-only
//     publication would slip out through the translation door.
//
// The query / action / mutation split is the one from `aiModeration.ts`, and
// for the same reason: a Convex mutation has no `fetch`, an action has no
// transaction. Hence three phases — read the source, call the model,
// write — and the need to re-check in phase 3 what was true in phase 1.

// --- Public shape ---------------------------------------------------------

const translationValidator = v.object({
  status: translationStatus,
  sourceLocale: locale,
  targetLocale: locale,
  fields: v.optional(translatableFields),
  error: v.optional(v.string()),
  model: v.optional(v.string()),
  updatedAt: v.number(),
  /**
   * Does the translation describe the text as it is TODAY?
   *
   * Computed at read time by comparing the stored fingerprint with that of the
   * current content. `false` -> the author has edited their text since: the page serves
   * the original and offers to retranslate.
   */
  fresh: v.boolean(),
});

// --- Reading the source content ----------------------------------------------
//
// A single function for both content families, because a single
// shape covers them (cf. `TranslatableFields`). It ALSO returns the source
// language, which the two tables do not store the same way: a Tribune
// post carries a single `lang`, a publication a LIST of languages whose
// first is the language it was written in.
type Source = {
  fields: TranslatableFields;
  sourceLocale: SiteLocale;
  /** Members-only content: so is its translation. */
  membersOnly: boolean;
};

async function readSource(
  ctx: QueryCtx,
  sourceType: TranslationSourceType,
  sourceId: string,
): Promise<Source | null> {
  if (sourceType === 'tribunePost') {
    // `normalizeId` BEFORE `db.get`, and this is not a stylistic precaution:
    // the one-argument overload of `db.get` does NOT check the table. With
    // `sourceType` supplied by the client, a restricted publication identifier
    // passed as a "post" loaded the publication document and then took the
    // branch below, which sets `membersOnly: false` HARD-CODED. Only a
    // fortuitous `TypeError` (a publication body is an array) closed
    // the door. `normalizeId` returns `null` as soon as the identifier comes from another
    // table: the client's discriminant ceases to be an authority.
    const postId = ctx.db.normalizeId('tribunePosts', sourceId);
    if (!postId) return null;
    const post = await ctx.db.get(postId);
    if (!post || post.status !== 'published') return null;
    return {
      // A post body is a single input field: we split it into
      // paragraphs on blank lines, as the page rendering does.
      // Translating a 4,000-character block as a single string gives the model
      // full latitude to recompose its structure.
      fields: { title: post.title, body: splitParagraphs(post.body) },
      sourceLocale: post.lang ?? 'fr',
      membersOnly: false,
    };
  }

  const pubId = ctx.db.normalizeId('publications', sourceId);
  if (!pubId) return null;
  const pub = await ctx.db.get(pubId);
  if (!pub || pub.status !== 'published') return null;
  return {
    fields: {
      title: pub.title,
      abstract: pub.abstract,
      keypoints: pub.keypoints.length > 0 ? pub.keypoints : undefined,
      body: pub.body,
    },
    // `languages` is a list; the FIRST is the language it was written in. A
    // publication submitted without a language falls back to French, as everywhere
    // else in the repo.
    sourceLocale: pub.languages[0] ?? 'fr',
    membersOnly: pub.access === 'members',
  };
}

/**
 * Does the reader have at least the "member" rank?
 *
 * Same scale as `viewerIsMember` in `convex/publications.ts`, and this is
 * deliberate: the translation of a restricted publication is the full text of
 * that publication. Two different scales for the same data is a
 * back door that opens at the first divergence.
 */
async function viewerIsMember(ctx: QueryCtx): Promise<boolean> {
  const user = await getCurrentUser(ctx);
  return rank(user?.role) >= rank('membre');
}

/**
 * Splits free text into paragraphs.
 *
 * On blank lines, and on them only: a simple line break
 * inside a paragraph does not open a new one, which is already how
 * the Tribune renders posts.
 */
export function splitParagraphs(body: string): string[] {
  const parts = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  // A text without a blank line remains one paragraph: returning an empty array
  // would make the output schema fail (`minItems: 0`), and would lose the text.
  return parts.length > 0 ? parts : [body.trim()].filter(Boolean);
}

// --- Public query ---------------------------------------------------------

/**
 * The cached translation of a piece of content, for a reading language.
 *
 * Returns `null` when nothing has ever been requested — which the interface
 * distinguishes from a `failed` row, which has a story to tell.
 *
 * ACCESS IS RE-CHECKED HERE. A members-only publication does not deliver
 * its translation to a visitor: that would be the full text, served through a
 * different door from the guarded one.
 */
export const getTranslation = query({
  args: {
    sourceType: translationSourceType,
    sourceId: v.string(),
    targetLocale: locale,
  },
  returns: v.union(translationValidator, v.null()),
  handler: async (ctx, args) => {
    const source = await readSource(ctx, args.sourceType, args.sourceId);
    if (!source) return null;

    if (source.membersOnly && !(await viewerIsMember(ctx))) return null;

    const row = await ctx.db
      .query('contentTranslations')
      .withIndex('by_source_and_target', (q) =>
        q
          .eq('sourceType', args.sourceType)
          .eq('sourceId', args.sourceId)
          .eq('targetLocale', args.targetLocale),
      )
      .unique();
    if (!row) return null;

    return {
      status: row.status,
      sourceLocale: row.sourceLocale,
      targetLocale: row.targetLocale,
      fields: row.fields,
      error: row.error,
      model: row.model,
      updatedAt: row.updatedAt,
      fresh: row.sourceHash === sourceFingerprint(source.fields),
    };
  },
});

/**
 * The languages into which this content is already translated and up to date.
 *
 * Feeds the document's language selector: offering "lire en portugais"
 * when the translation already exists costs a read, whereas requesting it costs
 * a model call.
 */
export const listAvailableTranslations = query({
  args: { sourceType: translationSourceType, sourceId: v.string() },
  returns: v.array(locale),
  handler: async (ctx, args) => {
    const source = await readSource(ctx, args.sourceType, args.sourceId);
    if (!source) return [];
    if (source.membersOnly && !(await viewerIsMember(ctx))) return [];
    const fingerprint = sourceFingerprint(source.fields);
    const rows = await ctx.db
      .query('contentTranslations')
      .withIndex('by_source', (q) =>
        q.eq('sourceType', args.sourceType).eq('sourceId', args.sourceId),
      )
      // Five languages at most, minus the source language: the bound is
      // structural, not arbitrary.
      .take(8);
    return rows
      .filter((r) => r.status === 'ready' && r.sourceHash === fingerprint)
      .map((r) => r.targetLocale);
  },
});

// --- Phase 1: read the context ---------------------------------------------

const contextValidator = v.union(
  v.object({
    ok: v.literal(true),
    fields: translatableFields,
    sourceLocale: locale,
    fingerprint: v.string(),
  }),
  v.object({ ok: v.literal(false), reason: v.string() }),
);

export const loadSource = internalQuery({
  args: {
    sourceType: translationSourceType,
    sourceId: v.string(),
    targetLocale: locale,
    userId: v.union(v.id('users'), v.null()),
  },
  returns: contextValidator,
  handler: async (ctx, args) => {
    const source = await readSource(ctx, args.sourceType, args.sourceId);
    if (!source) return { ok: false as const, reason: 'NOT_FOUND' };

    if (source.membersOnly) {
      const user = args.userId
        ? await getActiveUserById(ctx, args.userId)
        : null;
      if (rank(user?.role) < rank('membre')) {
        return { ok: false as const, reason: 'FORBIDDEN' };
      }
    }
    if (source.sourceLocale === args.targetLocale) {
      return { ok: false as const, reason: 'SAME_LANGUAGE' };
    }
    if (sourceLength(source.fields) > MAX_SOURCE_CHARS) {
      return { ok: false as const, reason: 'TOO_LONG' };
    }

    return {
      ok: true as const,
      fields: source.fields,
      sourceLocale: source.sourceLocale,
      fingerprint: sourceFingerprint(source.fields),
    };
  },
});

// --- Phase 3: write the result -------------------------------------------

export const saveTranslation = internalMutation({
  args: {
    sourceType: translationSourceType,
    sourceId: v.string(),
    sourceLocale: locale,
    targetLocale: locale,
    sourceHash: v.string(),
    status: translationStatus,
    fields: v.optional(translatableFields),
    model: v.optional(v.string()),
    error: v.optional(v.string()),
    requestedBy: v.union(v.id('users'), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query('contentTranslations')
      .withIndex('by_source_and_target', (q) =>
        q
          .eq('sourceType', args.sourceType)
          .eq('sourceId', args.sourceId)
          .eq('targetLocale', args.targetLocale),
      )
      .unique();

    // `replace` and not `patch`: a translation that succeeds after a failure must
    // LOSE its `error`, and one that fails after a success must lose its
    // `fields`. A patch would let both coexist, and the page would display
    // a stale text under an error message.
    const row = {
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      sourceLocale: args.sourceLocale,
      targetLocale: args.targetLocale,
      sourceHash: args.sourceHash,
      status: args.status,
      ...(args.fields ? { fields: args.fields } : {}),
      ...(args.model ? { model: args.model } : {}),
      ...(args.error ? { error: args.error } : {}),
      ...(args.requestedBy ? { requestedBy: args.requestedBy } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    if (existing) await ctx.db.replace(existing._id, row);
    else await ctx.db.insert('contentTranslations', row);
    return null;
  },
});

/**
 * Consumes a rate-limit token BEFORE the model call.
 *
 * An action has no transaction: the quota is therefore taken in a separate
 * mutation, and it is taken even if the translation then fails. This is intended —
 * what costs is the call, not its result.
 */
export const consumeQuota = internalMutation({
  args: { key: v.string() },
  returns: v.null(),
  handler: async (ctx, { key }) => {
    await enforceRateLimit(ctx, {
      key,
      // Ten translations per hour per actor. A reading page
      // requests one; ten is already unusual usage, and the cache serves
      // all subsequent readers without consuming anything.
      max: 10,
      windowMs: 60 * 60 * 1000,
    });
    return null;
  },
});

// --- Phase 2: the call ------------------------------------------------------

const requestResultValidator = v.object({
  ok: v.boolean(),
  /** Stable code, logged and displayed translated. */
  code: v.optional(v.string()),
});

/**
 * Translates a piece of content into a language, and caches the result.
 *
 * Idempotent up to the read: if an UP-TO-DATE translation already exists, the call
 * consumes neither quota nor model tokens. That is what makes it safe to call
 * this action from a button that several readers may press at the same
 * time.
 */
export const requestTranslation = action({
  args: {
    sourceType: translationSourceType,
    sourceId: v.string(),
    targetLocale: locale,
  },
  returns: requestResultValidator,
  handler: async (ctx, args): Promise<{ ok: boolean; code?: string }> => {
    const userId = await getAuthUserId(ctx);

    const context = await ctx.runQuery(internal.translation.loadSource, {
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      targetLocale: args.targetLocale,
      userId,
    });
    if (!context.ok) return { ok: false, code: context.reason };

    // Already translated and up to date: we do not call the model again. The check
    // is here rather than in the client, because this is where it protects
    // the spending.
    const cached: { status: string; fresh: boolean } | null =
      await ctx.runQuery(internal.translation.peekCached, {
        sourceType: args.sourceType,
        sourceId: args.sourceId,
        targetLocale: args.targetLocale,
        fingerprint: context.fingerprint,
      });
    if (cached?.status === 'ready' && cached.fresh) return { ok: true };

    if (!isGatewayConfigured()) {
      await persistFailure(
        ctx,
        args,
        context,
        userId,
        GATEWAY_ERRORS.NOT_CONFIGURED,
      );
      return { ok: false, code: GATEWAY_ERRORS.NOT_CONFIGURED };
    }

    // The quota is taken in the user's name when there is one, and in the
    // content's otherwise: an anonymous visitor must not be able to exhaust the quota
    // of everyone else by switching tabs.
    try {
      await ctx.runMutation(internal.translation.consumeQuota, {
        key: userId
          ? `translate:user:${userId}`
          : `translate:anon:${args.sourceType}:${args.sourceId}`,
      });
    } catch (error) {
      if (error instanceof ConvexError)
        return { ok: false, code: 'RATE_LIMITED' };
      throw error;
    }

    const model = translationModel();
    const result = await runStructured({
      model,
      instructions: buildTranslationInstructions(
        context.sourceLocale,
        args.targetLocale,
      ),
      userText: buildTranslationInput(context.fields),
      schemaName: 'translation',
      schema: buildTranslationSchema(context.fields),
      maxOutputTokens: outputTokenBudget(context.fields),
    });

    if (!result.ok) {
      await persistFailure(ctx, args, context, userId, result.code);
      return { ok: false, code: result.code };
    }

    // The output is revalidated here: the schema is applied BY THE GATEWAY,
    // and a translation missing a paragraph must be rejected
    // rather than served truncated.
    const translated = parseTranslation(context.fields, result.data);
    if (!translated) {
      await persistFailure(
        ctx,
        args,
        context,
        userId,
        GATEWAY_ERRORS.BAD_RESPONSE,
      );
      return { ok: false, code: GATEWAY_ERRORS.BAD_RESPONSE };
    }

    await ctx.runMutation(internal.translation.saveTranslation, {
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      sourceLocale: context.sourceLocale,
      targetLocale: args.targetLocale,
      sourceHash: context.fingerprint,
      status: 'ready',
      fields: translated,
      model: result.model,
      requestedBy: userId,
    });
    return { ok: true };
  },
});

type FailureContext = { sourceLocale: SiteLocale; fingerprint: string };

async function persistFailure(
  ctx: ActionCtx,
  args: {
    sourceType: TranslationSourceType;
    sourceId: string;
    targetLocale: SiteLocale;
  },
  context: FailureContext,
  userId: Id<'users'> | null,
  code: string,
): Promise<void> {
  // A record is written EVEN when the call did not take place (missing key,
  // quota): without it, the page could only display the same button
  // indefinitely, and no one would know the mechanism is broken.
  await ctx.runMutation(internal.translation.saveTranslation, {
    sourceType: args.sourceType,
    sourceId: args.sourceId,
    sourceLocale: context.sourceLocale,
    targetLocale: args.targetLocale,
    sourceHash: context.fingerprint,
    status: 'failed',
    error: code,
    requestedBy: userId,
  });
}

export const peekCached = internalQuery({
  args: {
    sourceType: translationSourceType,
    sourceId: v.string(),
    targetLocale: locale,
    fingerprint: v.string(),
  },
  returns: v.union(
    v.object({ status: translationStatus, fresh: v.boolean() }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const row: Doc<'contentTranslations'> | null = await ctx.db
      .query('contentTranslations')
      .withIndex('by_source_and_target', (q) =>
        q
          .eq('sourceType', args.sourceType)
          .eq('sourceId', args.sourceId)
          .eq('targetLocale', args.targetLocale),
      )
      .unique();
    if (!row) return null;
    return { status: row.status, fresh: row.sourceHash === args.fingerprint };
  },
});
