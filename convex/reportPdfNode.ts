'use node';

import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { locale, type SiteLocale } from './lib/locales';
import type { ReportContent } from './lib/annualReports';
import { renderReportPdf } from './lib/reportPdf/render';

// COMPOSITION DES PDF DES RAPPORTS ANNUELS (F-41) — runtime Node.
//
// Pourquoi une action Convex, et pas le site : la production du site tourne
// sur Vercel, sans Chromium, et la génération doit suivre chaque correction
// du texte sans intervention humaine. pdfkit + fontkit sont du JavaScript
// pur ; Convex les exécute dans son runtime Node, et le PDF va directement
// dans le stockage Convex, d'où la route du site le sert.
//
// Planifiée par convex/annualReports.ts à chaque écriture du texte. La
// commande de (re)génération complète, pour l'exploitation :
//   npx convex run reportPdfNode:generateAll
// (docs/backlog/editorial.md § Régénérer les PDF).

// Forme rendue par `annualReports.pdfSource`, écrite à la main : l'inférence
// traverserait `internal`, qui dépend de ce fichier.
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

// Régénère tout : une action planifiée par (édition, langue), pour qu'un
// échec n'emporte pas les autres et que chacune tienne dans ses limites.
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
