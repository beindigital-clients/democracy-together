'use node';

import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { locale, type SiteLocale } from './lib/locales';
import type { ReportContent } from './lib/annualReports';
import { renderReportPdf } from './lib/reportPdf/render';

// ANNUAL REPORT PDF COMPOSITION (F-41) — Node runtime.
//
// Why a Convex action, and not the site: the site's production runs
// on Vercel, without Chromium, and generation must follow every correction
// to the text without human intervention. pdfkit + fontkit are pure
// JavaScript; Convex runs them in its Node runtime, and the PDF goes directly
// into Convex storage, from where the site's route serves it.
//
// Scheduled by convex/annualReports.ts on every write of the text. The
// full (re)generation command, for operations:
//   npx convex run reportPdfNode:generateAll
// (docs/backlog/editorial.md § Régénérer les PDF).

// Shape returned by `annualReports.pdfSource`, written by hand: inference
// would go through `internal`, which depends on this file.
type PdfSource =
  | (ReportContent & { year: number; inaugural: boolean; contentHash: string })
  | null;

export const generate = internalAction({
  args: { reportId: v.id('annualReports'), locale },
  returns: v.union(
    v.null(),
    v.object({ stored: v.boolean(), pages: v.number(), size: v.number() }),
  ),
  handler: async (
    ctx,
    { reportId, locale: loc },
  ): Promise<{ stored: boolean; pages: number; size: number } | null> => {
    const source: PdfSource = await ctx.runQuery(
      internal.annualReports.pdfSource,
      {
        reportId,
        locale: loc,
      },
    );
    if (!source) return null;
    const { bytes, pages } = await renderReportPdf({
      locale: loc,
      year: source.year,
      inaugural: source.inaugural,
      title: source.title,
      intro: source.intro,
      chapters: source.chapters,
      keyFigures: source.keyFigures,
    });
    const storageId = await ctx.storage.store(
      new Blob([bytes], { type: 'application/pdf' }),
    );
    const stored: boolean = await ctx.runMutation(
      internal.annualReports.savePdf,
      {
        reportId,
        locale: loc,
        storageId,
        size: bytes.byteLength,
        pages,
        contentHash: source.contentHash,
      },
    );
    return { stored, pages, size: bytes.byteLength };
  },
});

// Regenerates everything: one scheduled action per (edition, language), so that one
// failure does not take the others down and each one stays within its limits.
export const generateAll = internalAction({
  args: {},
  returns: v.number(),
  handler: async (ctx): Promise<number> => {
    const all: { reportId: Id<'annualReports'>; locale: SiteLocale }[] =
      await ctx.runQuery(internal.annualReports.allReportLocales, {});
    for (const item of all) {
      await ctx.scheduler.runAfter(0, internal.reportPdfNode.generate, item);
    }
    return all.length;
  },
});
