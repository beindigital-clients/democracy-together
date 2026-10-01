'use node';

import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { locale } from './lib/locales';
import { MAX_PDF_BYTES } from './lib/documents';
import { countPages, looksLikePdf } from './lib/pdfImages';
import { translationModel } from './lib/translation';
import { translatePdf } from './lib/pdfTranslate/index';
import {
  BlockTranslationError,
  translateBlocks,
} from './lib/pdfTranslate/translateBlocks';

// PDF TRANSLATION KEEPING THE DESIGN — the Node entry point.
//
// The engine (convex/lib/pdfTranslate) needs Node: pdf.js to read the text
// with its positions, pdfkit and fontkit to set the translation, Arabic
// included. This file holds only actions, as the Convex guidelines require
// of a "use node" module.
//
// `runDocumentJob` is step 2 of the document jobs (convex/documentJobs.ts):
// it translates one publication's PDF into one language and stores the
// result. `translateFile` lets any PDF go through the real model from the
// command line, nothing stored — to try a document before publishing it:
//
//   npx convex run pdfTranslateNode:translateFile \
//     '{"pdfBase64":"…","sourceLocale":"fr","targetLocale":"en"}'

export const translateFile = internalAction({
  args: {
    pdfBase64: v.string(),
    sourceLocale: locale,
    targetLocale: locale,
  },
  returns: v.object({
    pdfBase64: v.string(),
    pages: v.number(),
    blocks: v.number(),
    translated: v.number(),
    shrunk: v.number(),
    overflowing: v.number(),
    skippedPages: v.number(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    ms: v.number(),
  }),
  handler: async (_ctx, args) => {
    const started = Date.now();
    let inputTokens = 0;
    let outputTokens = 0;
    const { bytes, stats } = await translatePdf(
      new Uint8Array(Buffer.from(args.pdfBase64, 'base64')),
      {
        targetLocale: args.targetLocale,
        translate: async (texts) => {
          const r = await translateBlocks(
            texts,
            args.sourceLocale,
            args.targetLocale,
          );
          inputTokens += r.inputTokens;
          outputTokens += r.outputTokens;
          return r.translations;
        },
      },
    );
    return {
      pdfBase64: Buffer.from(bytes).toString('base64'),
      ...stats,
      inputTokens,
      outputTokens,
      ms: Date.now() - started,
    };
  },
});

/**
 * Pages above which a document is not translated automatically: the job
 * must end well within the 10 minutes an action may run, and a document that
 * long deserves a human look at its cost first.
 */
export const MAX_DOCUMENT_PAGES = 80;

/** Step 2 of a document job: read, translate, store. */
export const runDocumentJob = internalAction({
  args: { id: v.id('documentTranslations') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const job: {
      fileId: Id<'_storage'>;
      sourceLocale: 'fr' | 'en' | 'es' | 'pt' | 'ar';
      targetLocale: 'fr' | 'en' | 'es' | 'pt' | 'ar';
      leaseUntil: number;
    } | null = await ctx.runMutation(internal.documentJobs.claimDocumentJob, {
      id,
    });
    if (!job) return null;
    const finish = async (
      result:
        | {
            ok: true;
            storageId: Id<'_storage'>;
            pages: number;
            size: number;
            model: string;
          }
        | { ok: false; code: string },
    ) => {
      await ctx.runMutation(internal.documentJobs.finishDocumentJob, {
        id,
        leaseUntil: job.leaseUntil,
        fileId: job.fileId,
        outcome: result,
      });
    };

    const fail = async (code: string) => {
      await finish({ ok: false, code });
      return null;
    };

    const blob = await ctx.storage.get(job.fileId);
    if (!blob) return await fail('FILE_MISSING');
    if (blob.size > MAX_PDF_BYTES) return await fail('TOO_LARGE');
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (!looksLikePdf(bytes)) return await fail('NOT_A_PDF');
    if ((countPages(bytes) ?? 0) > MAX_DOCUMENT_PAGES)
      return await fail('TOO_LONG');

    try {
      const { bytes: translated, stats } = await translatePdf(bytes, {
        targetLocale: job.targetLocale,
        translate: async (texts) =>
          (await translateBlocks(texts, job.sourceLocale, job.targetLocale))
            .translations,
      });
      const storageId = await ctx.storage.store(
        new Blob([translated as BlobPart], { type: 'application/pdf' }),
      );
      await finish({
        ok: true,
        storageId,
        pages: stats.pages,
        size: translated.length,
        model: translationModel(),
      });
    } catch (error) {
      // A gateway failure is retried; anything else comes from the file
      // itself — a PDF the reader cannot parse — and would fail again.
      const code =
        error instanceof BlockTranslationError ? error.code : 'PDF_UNREADABLE';
      console.error(
        '[document-translation]',
        code,
        error instanceof Error ? error.message : String(error),
      );
      await finish({ ok: false, code });
    }
    return null;
  },
});

/**
 * What the document backfill would translate, in pages — the measure its
 * cost follows. Reads the files, writes nothing.
 *
 *   npx convex run pdfTranslateNode:estimateDocumentBackfill '{}'
 */
export const estimateDocumentBackfill = internalAction({
  args: {},
  returns: v.object({
    documents: v.number(),
    translations: v.number(),
    pages: v.number(),
    translatedPages: v.number(),
  }),
  handler: async (ctx) => {
    const candidates: { fileId: Id<'_storage'>; languages: number }[] =
      await ctx.runQuery(internal.documentJobs.backfillCandidates, {});
    let pages = 0;
    let translatedPages = 0;
    let translations = 0;
    for (const c of candidates) {
      const blob = await ctx.storage.get(c.fileId);
      if (!blob) continue;
      const n = countPages(new Uint8Array(await blob.arrayBuffer())) ?? 0;
      pages += n;
      translatedPages += n * c.languages;
      translations += c.languages;
    }
    return {
      documents: candidates.length,
      translations,
      pages,
      translatedPages,
    };
  },
});
