import { v, ConvexError } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import {
  query,
  action,
  internalQuery,
  internalMutation,
  internalAction,
  type ActionCtx,
  type QueryCtx,
} from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { locale, type SiteLocale } from './lib/locales';
import { getCurrentUser, getActiveUserById, rank } from './lib/rbac';
import { enforceRateLimit } from './lib/rateLimit';
import {
  isGatewayConfigured,
  runStructured,
  toBase64,
  GATEWAY_ERRORS,
} from './lib/aiGateway';
import {
  buildDocumentTranslationInstructions,
  buildDocumentTranslationSchema,
  buildExtractionInstructions,
  buildExtractionSchema,
  documentBlock,
  documentStatus,
  documentTokenBudget,
  extractedImage,
  parseDocumentTranslation,
  parseExtraction,
  MAX_IMAGES,
  MAX_PDF_BYTES,
  type DocumentBlock,
} from './lib/documents';
import { countPages, extractJpegImages, looksLikePdf } from './lib/pdfImages';
import { translationModel } from './lib/translation';

// TRANSLATION OF THE DOCUMENT ATTACHED TO A PUBLICATION — orchestration.
//
// TWO STAGES, AND THAT IS THE WHOLE POINT OF THE SPLIT.
//
//  1. EXTRACT, once. The PDF goes to the model, which returns its structure
//     (convex/lib/documents.ts); in parallel, its JPEG images are copied
//     into storage (convex/lib/pdfImages.ts). This is the expensive operation —
//     several megabytes on the way out — and it depends on no language.
//  2. TRANSLATE, once per requested language, from the extracted blocks.
//     A few dozen kilobytes of JSON, and the file is never read
//     again. The five versions therefore describe EXACTLY the same document,
//     which an extraction redone for each language would not guarantee.
//
// THE IMAGE IS NEVER RETRANSLATED OR RECOMPRESSED. A `figure` block carries an
// index; the index passes through translation intact (`parseDocumentTranslation`
// re-imposes it from the source). The five languages thus serve the same files,
// in the same places.
//
// WHAT IS PRODUCED IS NOT A PDF, and it is not a stopgap. No PDF library
// in the JavaScript ecosystem can typeset Arabic — neither the contextual
// letter forms nor the bidirectional algorithm. A browser engine does it,
// and without error. The document view
// (`/[locale]/bibliotheque/[slug]/document`) is therefore a page formatted
// for printing, which the reader saves as PDF from their browser.

// --- Public shape -----------------------------------------------------------

const documentViewValidator = v.object({
  status: documentStatus,
  sourceLocale: locale,
  targetLocale: locale,
  title: v.optional(v.string()),
  blocks: v.optional(v.array(documentBlock)),
  /** Signed URL per image, indexed like `imageIndex`. */
  imageUrls: v.array(v.union(v.string(), v.null())),
  skippedImages: v.number(),
  pageCount: v.optional(v.number()),
  error: v.optional(v.string()),
  /** The original PDF, when the reader is entitled to it. */
  originalUrl: v.union(v.string(), v.null()),
  updatedAt: v.number(),
});

async function viewerIsMember(ctx: QueryCtx): Promise<boolean> {
  const user = await getCurrentUser(ctx);
  return rank(user?.role) >= rank('membre');
}

/**
 * A publication's document, in one language.
 *
 * Returns `null` when the publication does not exist, has no attached document,
 * or the reader is not allowed to read it. The distinction between "not
 * prepared yet" and "prepared" is read from `status`, because the interface
 * derives two different screens from it.
 *
 * ACCESS CONTROL LIVES HERE, and it is the same as the library's:
 * the document view renders the FULL TEXT of a report. A members-only
 * publication must not leak through this door.
 */
export const getDocument = query({
  args: { slug: v.string(), targetLocale: locale },
  returns: v.union(documentViewValidator, v.null()),
  handler: async (ctx, args) => {
    const pub = await ctx.db
      .query('publications')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .unique();
    if (!pub || pub.status !== 'published' || !pub.fileId) return null;
    if (pub.access === 'members' && !(await viewerIsMember(ctx))) return null;

    const extraction = await ctx.db
      .query('documentExtractions')
      .withIndex('by_publication', (q) => q.eq('publicationId', pub._id))
      .unique();

    const sourceLocale = extraction?.sourceLocale ?? pub.languages[0] ?? 'fr';
    const originalUrl = await ctx.storage.getUrl(pub.fileId);

    // No extraction yet, or an extraction describing ANOTHER file:
    // nothing to serve. The second case happens when a member replaces their PDF.
    if (!extraction || extraction.fileId !== pub.fileId) {
      return {
        status: 'pending' as const,
        sourceLocale,
        targetLocale: args.targetLocale,
        imageUrls: [],
        skippedImages: 0,
        originalUrl,
        updatedAt: extraction?.updatedAt ?? 0,
      };
    }
    if (extraction.status !== 'ready') {
      return {
        status: extraction.status,
        sourceLocale,
        targetLocale: args.targetLocale,
        imageUrls: [],
        skippedImages: extraction.skippedImages ?? 0,
        pageCount: extraction.pageCount,
        error: extraction.error,
        originalUrl,
        updatedAt: extraction.updatedAt,
      };
    }

    // Image URLs are signed at read time: the array is INDEXED like
    // `imageIndex`, with `null` holes rather than a compacted array —
    // compacting would shift all the following figures.
    const images = extraction.images ?? [];
    const imageUrls: (string | null)[] = [];
    for (let i = 0; i < images.length; i++) {
      const img = images.find((x) => x.index === i);
      imageUrls.push(img ? await ctx.storage.getUrl(img.storageId) : null);
    }

    // The source language is served as is: the extracted document IS already
    // in that language, translating it into itself would make no sense.
    if (args.targetLocale === sourceLocale) {
      return {
        status: 'ready' as const,
        sourceLocale,
        targetLocale: args.targetLocale,
        title: extraction.title,
        blocks: extraction.blocks,
        imageUrls,
        skippedImages: extraction.skippedImages ?? 0,
        pageCount: extraction.pageCount,
        originalUrl,
        updatedAt: extraction.updatedAt,
      };
    }

    const rendition = await ctx.db
      .query('documentRenditions')
      .withIndex('by_publication_and_locale', (q) =>
        q.eq('publicationId', pub._id).eq('targetLocale', args.targetLocale),
      )
      .unique();

    // A version attached to a replaced extraction describes the old PDF.
    const usable = rendition && rendition.extractionId === extraction._id;
    return {
      status: usable ? rendition.status : ('pending' as const),
      sourceLocale,
      targetLocale: args.targetLocale,
      title: usable ? rendition.title : undefined,
      blocks: usable ? rendition.blocks : undefined,
      imageUrls,
      skippedImages: extraction.skippedImages ?? 0,
      pageCount: extraction.pageCount,
      error: usable ? rendition.error : undefined,
      originalUrl,
      updatedAt: usable ? rendition.updatedAt : extraction.updatedAt,
    };
  },
});

/** The languages in which the document is already ready. */
export const listDocumentLocales = query({
  args: { slug: v.string() },
  returns: v.array(locale),
  handler: async (ctx, { slug }) => {
    const pub = await ctx.db
      .query('publications')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (!pub || pub.status !== 'published' || !pub.fileId) return [];
    if (pub.access === 'members' && !(await viewerIsMember(ctx))) return [];

    const extraction = await ctx.db
      .query('documentExtractions')
      .withIndex('by_publication', (q) => q.eq('publicationId', pub._id))
      .unique();
    if (
      !extraction ||
      extraction.fileId !== pub.fileId ||
      extraction.status !== 'ready'
    ) {
      return [];
    }

    const renditions = await ctx.db
      .query('documentRenditions')
      .withIndex('by_publication_and_locale', (q) =>
        q.eq('publicationId', pub._id),
      )
      // At most one version per served language: the bound is structural.
      .take(8);

    return [
      extraction.sourceLocale,
      ...renditions
        .filter(
          (r) => r.status === 'ready' && r.extractionId === extraction._id,
        )
        .map((r) => r.targetLocale),
    ];
  },
});

// --- Stage 1: context -------------------------------------------------------

export const loadDocumentContext = internalQuery({
  args: {
    slug: v.string(),
    userId: v.union(v.id('users'), v.null()),
    targetLocale: locale,
  },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      publicationId: v.id('publications'),
      fileId: v.id('_storage'),
      sourceLocale: locale,
      extractionId: v.union(v.id('documentExtractions'), v.null()),
      extractionFresh: v.boolean(),
      blocks: v.optional(v.array(documentBlock)),
      title: v.optional(v.string()),
      imageCount: v.number(),
      /** The requested version already exists and describes the current file. */
      renditionFresh: v.boolean(),
    }),
    v.object({ ok: v.literal(false), reason: v.string() }),
  ),
  handler: async (ctx, args) => {
    const pub = await ctx.db
      .query('publications')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .unique();
    if (!pub || pub.status !== 'published') {
      return { ok: false as const, reason: 'NOT_FOUND' };
    }
    if (!pub.fileId) return { ok: false as const, reason: 'NO_DOCUMENT' };
    if (pub.access === 'members') {
      const user = args.userId
        ? await getActiveUserById(ctx, args.userId)
        : null;
      if (rank(user?.role) < rank('membre')) {
        return { ok: false as const, reason: 'FORBIDDEN' };
      }
    }

    const extraction = await ctx.db
      .query('documentExtractions')
      .withIndex('by_publication', (q) => q.eq('publicationId', pub._id))
      .unique();
    const fresh =
      extraction !== null &&
      extraction.fileId === pub.fileId &&
      extraction.status === 'ready';

    // Is the requested version already ready AND attached to THIS extraction?
    // This is what lets `prepareDocument` keep the promise of its
    // comment and never spend anything twice.
    const rendition = fresh
      ? await ctx.db
          .query('documentRenditions')
          .withIndex('by_publication_and_locale', (q) =>
            q
              .eq('publicationId', pub._id)
              .eq('targetLocale', args.targetLocale),
          )
          .unique()
      : null;

    return {
      ok: true as const,
      publicationId: pub._id,
      fileId: pub.fileId,
      sourceLocale: extraction?.sourceLocale ?? pub.languages[0] ?? 'fr',
      extractionId: extraction?._id ?? null,
      extractionFresh: fresh,
      blocks: fresh ? extraction.blocks : undefined,
      title: fresh ? extraction.title : undefined,
      imageCount: fresh ? (extraction.images?.length ?? 0) : 0,
      renditionFresh:
        rendition !== null &&
        rendition.status === 'ready' &&
        extraction !== null &&
        rendition.extractionId === extraction._id,
    };
  },
});

// --- Writes -----------------------------------------------------------------

export const saveExtraction = internalMutation({
  args: {
    publicationId: v.id('publications'),
    fileId: v.id('_storage'),
    sourceLocale: locale,
    status: documentStatus,
    title: v.optional(v.string()),
    blocks: v.optional(v.array(documentBlock)),
    images: v.optional(v.array(extractedImage)),
    skippedImages: v.optional(v.number()),
    pageCount: v.optional(v.number()),
    model: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: v.id('documentExtractions'),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query('documentExtractions')
      .withIndex('by_publication', (q) =>
        q.eq('publicationId', args.publicationId),
      )
      .unique();

    // The PDF changed: the old extraction's images no longer describe
    // anything, nor do the translated versions. We delete them explicitly —
    // leaving orphaned files in storage is a slow leak,
    // exactly the kind nobody notices before the bill.
    if (existing && existing.fileId !== args.fileId) {
      for (const img of existing.images ?? []) {
        await ctx.storage.delete(img.storageId);
      }
      const stale = await ctx.db
        .query('documentRenditions')
        .withIndex('by_extraction', (q) => q.eq('extractionId', existing._id))
        .take(16);
      for (const r of stale) await ctx.db.delete(r._id);
    }

    const row = {
      publicationId: args.publicationId,
      fileId: args.fileId,
      sourceLocale: args.sourceLocale,
      status: args.status,
      ...(args.title ? { title: args.title } : {}),
      ...(args.blocks ? { blocks: args.blocks } : {}),
      ...(args.images ? { images: args.images } : {}),
      ...(args.skippedImages !== undefined
        ? { skippedImages: args.skippedImages }
        : {}),
      ...(args.pageCount !== undefined ? { pageCount: args.pageCount } : {}),
      ...(args.model ? { model: args.model } : {}),
      ...(args.error ? { error: args.error } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.replace(existing._id, row);
      return existing._id;
    }
    return await ctx.db.insert('documentExtractions', row);
  },
});

export const saveRendition = internalMutation({
  args: {
    publicationId: v.id('publications'),
    extractionId: v.id('documentExtractions'),
    sourceLocale: locale,
    targetLocale: locale,
    status: documentStatus,
    title: v.optional(v.string()),
    blocks: v.optional(v.array(documentBlock)),
    model: v.optional(v.string()),
    error: v.optional(v.string()),
    requestedBy: v.union(v.id('users'), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query('documentRenditions')
      .withIndex('by_publication_and_locale', (q) =>
        q
          .eq('publicationId', args.publicationId)
          .eq('targetLocale', args.targetLocale),
      )
      .unique();

    const row = {
      publicationId: args.publicationId,
      extractionId: args.extractionId,
      sourceLocale: args.sourceLocale,
      targetLocale: args.targetLocale,
      status: args.status,
      ...(args.title ? { title: args.title } : {}),
      ...(args.blocks ? { blocks: args.blocks } : {}),
      ...(args.model ? { model: args.model } : {}),
      ...(args.error ? { error: args.error } : {}),
      ...(args.requestedBy ? { requestedBy: args.requestedBy } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    // `replace`: a version that succeeds after a failure must lose its
    // `error`, and the reverse must lose its `blocks`.
    if (existing) await ctx.db.replace(existing._id, row);
    else await ctx.db.insert('documentRenditions', row);
    return null;
  },
});

export const consumeDocumentQuota = internalMutation({
  args: { key: v.string() },
  returns: v.null(),
  handler: async (ctx, { key }) => {
    await enforceRateLimit(ctx, {
      // Preparing a document costs much more than an article: the whole file
      // goes to the model. Three per hour per actor, and the cache then serves
      // all readers of that language.
      key,
      max: 3,
      windowMs: 60 * 60 * 1000,
    });
    return null;
  },
});

// --- Stage 2a: extract ------------------------------------------------------

type ExtractionOutcome = { ok: boolean; code?: string; extractionId?: string };

export const extractDocument = internalAction({
  args: {
    publicationId: v.id('publications'),
    fileId: v.id('_storage'),
    sourceLocale: locale,
  },
  returns: v.object({
    ok: v.boolean(),
    code: v.optional(v.string()),
    extractionId: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<ExtractionOutcome> => {
    const fail = async (code: string): Promise<ExtractionOutcome> => {
      await ctx.runMutation(internal.documents.saveExtraction, {
        publicationId: args.publicationId,
        fileId: args.fileId,
        sourceLocale: args.sourceLocale,
        status: 'failed',
        error: code,
      });
      return { ok: false, code };
    };

    if (!isGatewayConfigured()) return fail(GATEWAY_ERRORS.NOT_CONFIGURED);

    const blob = await ctx.storage.get(args.fileId);
    if (!blob) return fail('FILE_MISSING');
    if (blob.size > MAX_PDF_BYTES) return fail('TOO_LARGE');

    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (!looksLikePdf(bytes)) return fail('NOT_A_PDF');

    // IMAGES FIRST. Their count goes into the extraction instructions:
    // the model must know how many illustrations it can reference, otherwise
    // it invents indexes that point to nothing.
    const { images, skipped } = extractJpegImages(bytes, MAX_IMAGES);
    const stored: {
      index: number;
      storageId: Id<'_storage'>;
      contentType: string;
      width?: number;
      height?: number;
    }[] = [];
    for (const img of images) {
      const id = await ctx.storage.store(
        new Blob([img.data as BlobPart], { type: img.contentType }),
      );
      stored.push({
        index: img.index,
        storageId: id,
        contentType: img.contentType,
        ...(img.width !== undefined ? { width: img.width } : {}),
        ...(img.height !== undefined ? { height: img.height } : {}),
      });
    }

    const model = translationModel();
    const result = await runStructured({
      model,
      instructions: buildExtractionInstructions(stored.length),
      userText:
        'Convert the attached PDF into the structured block representation described in your instructions.',
      attachment: {
        filename: 'document.pdf',
        base64: toBase64(bytes),
        contentType: 'application/pdf',
      },
      schemaName: 'document_extraction',
      schema: buildExtractionSchema(),
      // Extraction returns JSON more verbose than the PDF's text: the margin
      // is wide, a truncated output costs the whole call.
      maxOutputTokens: 64_000,
    });

    if (!result.ok) {
      // Images already stored are kept: the next attempt
      // will be on the same file and would rewrite them identically.
      return fail(result.code);
    }

    const parsed = parseExtraction(result.data, stored.length);
    if (!parsed) return fail(GATEWAY_ERRORS.BAD_RESPONSE);

    const extractionId: Id<'documentExtractions'> = await ctx.runMutation(
      internal.documents.saveExtraction,
      {
        publicationId: args.publicationId,
        fileId: args.fileId,
        sourceLocale: args.sourceLocale,
        status: 'ready',
        title: parsed.title,
        blocks: parsed.blocks,
        images: stored,
        skippedImages: skipped,
        pageCount: countPages(bytes),
        model: result.model,
      },
    );
    return { ok: true, extractionId };
  },
});

// --- Stage 2b: translate ----------------------------------------------------

/**
 * Prepares a publication's document in one language.
 *
 * Extracts first if needed, then translates. Idempotent: if the requested
 * version already exists and describes the current file, the call consumes nothing.
 */
export const prepareDocument = action({
  args: { slug: v.string(), targetLocale: locale },
  returns: v.object({ ok: v.boolean(), code: v.optional(v.string()) }),
  handler: async (ctx, args): Promise<{ ok: boolean; code?: string }> => {
    const userId = await getAuthUserId(ctx);
    const context = await ctx.runQuery(internal.documents.loadDocumentContext, {
      slug: args.slug,
      userId,
      targetLocale: args.targetLocale,
    });
    if (!context.ok) return { ok: false, code: context.reason };

    // IDEMPOTENCY, which the comment above promised without anything
    // enforcing it. Two readers opening the same page and clicking the same
    // language triggered two extractions of the whole PDF and two full
    // translations, the second overwriting the first. Worse: if the gateway
    // failed on that useless second call, `saveRendition` replaced a
    // READY version with a `failed` row, and an already paid-for translation
    // was lost for all readers. So we re-read before spending, as
    // `requestTranslation` already does with `peekCached`.
    if (context.renditionFresh) return { ok: true };

    try {
      await ctx.runMutation(internal.documents.consumeDocumentQuota, {
        key: userId ? `document:user:${userId}` : `document:anon:${args.slug}`,
      });
    } catch (error) {
      if (error instanceof ConvexError)
        return { ok: false, code: 'RATE_LIMITED' };
      throw error;
    }

    // 1. Extraction, if it is missing or describes another file.
    let extractionId = context.extractionId;
    let blocks = context.blocks;
    let title = context.title;
    if (!context.extractionFresh) {
      const extracted = await ctx.runAction(
        internal.documents.extractDocument,
        {
          publicationId: context.publicationId,
          fileId: context.fileId,
          sourceLocale: context.sourceLocale,
        },
      );
      if (!extracted.ok) return { ok: false, code: extracted.code };
      // Re-read rather than trust the return value: extraction just wrote, and
      // the database is the source of truth for what was actually saved.
      const after = await ctx.runQuery(internal.documents.loadDocumentContext, {
        slug: args.slug,
        userId,
        targetLocale: args.targetLocale,
      });
      if (!after.ok || !after.extractionFresh) {
        return { ok: false, code: GATEWAY_ERRORS.BAD_RESPONSE };
      }
      extractionId = after.extractionId;
      blocks = after.blocks;
      title = after.title;
    }

    // 2. The source language is served by the extraction itself.
    if (args.targetLocale === context.sourceLocale) return { ok: true };
    if (!extractionId || !blocks || blocks.length === 0) {
      return { ok: false, code: 'EMPTY_DOCUMENT' };
    }

    const saveFailure = async (code: string) => {
      await ctx.runMutation(internal.documents.saveRendition, {
        publicationId: context.publicationId,
        extractionId,
        sourceLocale: context.sourceLocale,
        targetLocale: args.targetLocale,
        status: 'failed',
        error: code,
        requestedBy: userId,
      });
      return { ok: false, code };
    };

    const model = translationModel();
    const result = await runStructured({
      model,
      instructions: buildDocumentTranslationInstructions(
        context.sourceLocale,
        args.targetLocale,
      ),
      userText: JSON.stringify({ title: title ?? '', blocks }),
      schemaName: 'document_translation',
      schema: buildDocumentTranslationSchema(blocks),
      maxOutputTokens: documentTokenBudget(blocks),
    });
    if (!result.ok) return saveFailure(result.code);

    const parsed = parseDocumentTranslation(blocks, result.data);
    if (!parsed) return saveFailure(GATEWAY_ERRORS.BAD_RESPONSE);

    await ctx.runMutation(internal.documents.saveRendition, {
      publicationId: context.publicationId,
      extractionId,
      sourceLocale: context.sourceLocale,
      targetLocale: args.targetLocale,
      status: 'ready',
      title: parsed.title,
      blocks: parsed.blocks,
      model: result.model,
      requestedBy: userId,
    });
    return { ok: true };
  },
});

// Re-exports useful to tests and callers, so that the block type is not
// re-imported from two different places.
export type { DocumentBlock };
export type { ActionCtx, SiteLocale };
