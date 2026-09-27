import { v } from 'convex/values';
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { requireNetworkRole } from './lib/rbac';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { locale, SITE_LOCALES, type SiteLocale } from './lib/locales';
import {
  normalizeReportContent,
  reportContent,
  reportContentHash,
  reportStatus,
  REPORT_BOUNDS,
  type ReportContent,
} from './lib/annualReports';
import { CODED_REPORTS, CODED_REPORT_YEARS } from './lib/annualReportsCoded';

// RAPPORTS ANNUELS (F-41) — modèle de données, administration (rang éditeur)
// et PDF par langue.
//
// Les rapports étaient CODÉS dans le dépôt (src/lib/reports-content.ts), sans
// administration. Ils ont désormais un modèle : une édition par année
// (`annualReports`), son texte par langue (`annualReportContents`), et le PDF
// composé pour chaque langue (`annualReportPdfs`). Les pages publiques
// gardent leurs URL (`/rapports`, `/rapports/<année>`) et retombent sur le
// contenu codé pour une année que la base ne connaît pas encore : la
// migration (`importCodedReport`) recopie ce contenu champ pour champ, sans
// que rien ne change à l'écran.
//
// LE PDF est composé par une action Node (convex/reportPdfNode.ts) PLANIFIÉE
// à chaque écriture du texte : le rédacteur n'a rien à déclencher. Il n'est
// servi que si l'empreinte du texte dont il est issu est celle du texte
// courant — un rapport corrigé ne propose jamais un PDF qui le contredit.

const REPORTS_MAX = 100;

async function byYear(
  ctx: QueryCtx,
  year: number,
): Promise<Doc<'annualReports'> | null> {
  return await ctx.db
    .query('annualReports')
    .withIndex('by_year', (q) => q.eq('year', year))
    .unique();
}

async function contentFor(
  ctx: QueryCtx,
  reportId: Id<'annualReports'>,
  loc: SiteLocale,
): Promise<Doc<'annualReportContents'> | null> {
  return await ctx.db
    .query('annualReportContents')
    .withIndex('by_report_and_locale', (q) =>
      q.eq('reportId', reportId).eq('locale', loc),
    )
    .unique();
}

async function pdfFor(
  ctx: QueryCtx,
  reportId: Id<'annualReports'>,
  loc: SiteLocale,
): Promise<Doc<'annualReportPdfs'> | null> {
  return await ctx.db
    .query('annualReportPdfs')
    .withIndex('by_report_and_locale', (q) =>
      q.eq('reportId', reportId).eq('locale', loc),
    )
    .unique();
}

// Le PDF d'une langue n'est « à jour » que s'il porte l'empreinte du texte.
function freshPdf(
  content: Doc<'annualReportContents'> | null,
  pdf: Doc<'annualReportPdfs'> | null,
): Doc<'annualReportPdfs'> | null {
  return content && pdf && pdf.contentHash === content.contentHash ? pdf : null;
}

function assertYear(year: number) {
  if (
    !Number.isInteger(year) ||
    year < REPORT_BOUNDS.yearMin ||
    year > REPORT_BOUNDS.yearMax
  ) {
    throw new Error('INVALID_YEAR');
  }
}

async function schedulePdf(
  ctx: MutationCtx,
  reportId: Id<'annualReports'>,
  loc: SiteLocale,
) {
  await ctx.scheduler.runAfter(0, internal.reportPdfNode.generate, {
    reportId,
    locale: loc,
  });
}

// Écrit (ou réécrit) le texte d'une langue et planifie son PDF.
async function writeContent(
  ctx: MutationCtx,
  report: Doc<'annualReports'>,
  loc: SiteLocale,
  content: ReportContent,
) {
  const now = Date.now();
  const contentHash = reportContentHash(report.year, report.inaugural, content);
  const existing = await contentFor(ctx, report._id, loc);
  if (existing) {
    await ctx.db.patch(existing._id, {
      ...content,
      contentHash,
      updatedAt: now,
    });
  } else {
    await ctx.db.insert('annualReportContents', {
      reportId: report._id,
      locale: loc,
      ...content,
      contentHash,
      updatedAt: now,
    });
  }
  if (!existing || existing.contentHash !== contentHash) {
    await schedulePdf(ctx, report._id, loc);
  }
}

// --- Lecture publique ---------------------------------------------------------

const pdfInfo = v.object({
  locale,
  size: v.number(),
  pages: v.number(),
  contentHash: v.string(),
});

const publicReport = v.object({
  year: v.number(),
  inaugural: v.boolean(),
  locale,
  ...reportContent.fields,
  availableLocales: v.array(locale),
  pdfs: v.array(pdfInfo),
});

/**
 * Éditions PUBLIÉES, pour la liste `/rapports` et le plan du site.
 *
 * `knownYears` rend aussi les années présentes en base à l'état de brouillon :
 * une année connue de la base n'est plus servie depuis le contenu codé, même
 * dépubliée — sinon « dépublier » ferait réapparaître l'ancienne version.
 */
export const listPublic = query({
  args: { locale },
  returns: v.object({
    reports: v.array(
      v.object({
        year: v.number(),
        inaugural: v.boolean(),
        title: v.string(),
        intro: v.string(),
        contentLocale: locale,
      }),
    ),
    knownYears: v.array(v.number()),
  }),
  handler: async (ctx, { locale: loc }) => {
    const all = await ctx.db.query('annualReports').take(REPORTS_MAX);
    const published = all
      .filter((r) => r.status === 'published')
      .sort((a, b) => b.year - a.year);
    const reports = [];
    for (const r of published) {
      // Langue demandée, puis français (langue de rédaction du réseau).
      const content =
        (await contentFor(ctx, r._id, loc)) ??
        (await contentFor(ctx, r._id, 'fr'));
      if (!content) continue;
      reports.push({
        year: r.year,
        inaugural: r.inaugural,
        title: content.title,
        intro: content.intro,
        contentLocale: content.locale,
      });
    }
    return { reports, knownYears: all.map((r) => r.year) };
  },
});

/**
 * Une édition dans une langue. `known` dit si la base connaît l'année —
 * auquel cas la page ne retombe PAS sur le contenu codé.
 */
export const getPublic = query({
  args: { year: v.number(), locale },
  returns: v.object({
    known: v.boolean(),
    report: v.union(publicReport, v.null()),
  }),
  handler: async (ctx, { year, locale: loc }) => {
    const report = await byYear(ctx, year);
    if (!report) return { known: false, report: null };
    if (report.status !== 'published') return { known: true, report: null };
    const contents = await ctx.db
      .query('annualReportContents')
      .withIndex('by_report', (q) => q.eq('reportId', report._id))
      .take(SITE_LOCALES.length);
    // Langue demandée, sinon le français (langue de rédaction du réseau) :
    // une édition publiée n'est pas introuvable faute d'une traduction. La
    // page annonce alors la langue du texte (`locale`).
    const content =
      contents.find((c) => c.locale === loc) ??
      contents.find((c) => c.locale === 'fr') ??
      null;
    if (!content) return { known: true, report: null };
    const pdfs = [];
    for (const c of contents) {
      const pdf = freshPdf(c, await pdfFor(ctx, report._id, c.locale));
      if (pdf) {
        pdfs.push({
          locale: pdf.locale,
          size: pdf.size,
          pages: pdf.pages,
          contentHash: pdf.contentHash,
        });
      }
    }
    return {
      known: true,
      report: {
        year: report.year,
        inaugural: report.inaugural,
        locale: content.locale,
        title: content.title,
        intro: content.intro,
        chapters: content.chapters,
        keyFigures: content.keyFigures,
        availableLocales: contents.map((c) => c.locale),
        pdfs,
      },
    };
  },
});

/**
 * Le PDF À JOUR d'une édition publiée, pour la route de téléchargement du
 * site (`/[locale]/rapports/[année]/rapport.pdf`). L'URL signée du stockage
 * n'est générée que pour une édition publiée.
 */
export const getPdf = query({
  args: { year: v.number(), locale },
  returns: v.union(
    v.null(),
    v.object({
      url: v.string(),
      size: v.number(),
      pages: v.number(),
      contentHash: v.string(),
      title: v.string(),
    }),
  ),
  handler: async (ctx, { year, locale: loc }) => {
    const report = await byYear(ctx, year);
    if (!report || report.status !== 'published') return null;
    const content = await contentFor(ctx, report._id, loc);
    const pdf = freshPdf(content, await pdfFor(ctx, report._id, loc));
    if (!pdf || !content) return null;
    const url = await ctx.storage.getUrl(pdf.storageId);
    if (!url) return null;
    return {
      url,
      size: pdf.size,
      pages: pdf.pages,
      contentHash: pdf.contentHash,
      title: content.title,
    };
  },
});

// --- Administration (éditeur+) -----------------------------------------------

const localeState = v.object({
  locale,
  title: v.string(),
  updatedAt: v.number(),
  pdf: v.union(v.literal('fresh'), v.literal('stale'), v.literal('missing')),
  pdfSize: v.union(v.number(), v.null()),
  pdfPages: v.union(v.number(), v.null()),
  pdfUrl: v.union(v.string(), v.null()),
});

type LocaleState = {
  locale: SiteLocale;
  title: string;
  updatedAt: number;
  pdf: 'fresh' | 'stale' | 'missing';
  pdfSize: number | null;
  pdfPages: number | null;
  pdfUrl: string | null;
};

export const adminList = query({
  args: {},
  returns: v.object({
    reports: v.array(
      v.object({
        _id: v.id('annualReports'),
        year: v.number(),
        status: reportStatus,
        inaugural: v.boolean(),
        origin: v.union(v.literal('coded'), v.literal('admin')),
        updatedAt: v.number(),
        locales: v.array(localeState),
      }),
    ),
    // Éditions codées que la base ne connaît pas encore : à migrer.
    codedToImport: v.array(v.number()),
  }),
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'editeur');
    const all = (await ctx.db.query('annualReports').take(REPORTS_MAX)).sort(
      (a, b) => b.year - a.year,
    );
    const reports = [];
    for (const r of all) {
      const contents = await ctx.db
        .query('annualReportContents')
        .withIndex('by_report', (q) => q.eq('reportId', r._id))
        .take(SITE_LOCALES.length);
      const locales: LocaleState[] = [];
      for (const c of contents) {
        const pdf = await pdfFor(ctx, r._id, c.locale);
        const fresh = freshPdf(c, pdf);
        locales.push({
          locale: c.locale,
          title: c.title,
          updatedAt: c.updatedAt,
          pdf: fresh
            ? ('fresh' as const)
            : pdf
              ? ('stale' as const)
              : ('missing' as const),
          pdfSize: pdf?.size ?? null,
          pdfPages: pdf?.pages ?? null,
          pdfUrl: pdf ? await ctx.storage.getUrl(pdf.storageId) : null,
        });
      }
      reports.push({
        _id: r._id,
        year: r.year,
        status: r.status,
        inaugural: r.inaugural,
        origin: r.origin,
        updatedAt: r.updatedAt,
        locales: SITE_LOCALES.flatMap((l) =>
          locales.filter((x) => x.locale === l),
        ),
      });
    }
    const known = new Set(all.map((r) => r.year));
    return {
      reports,
      codedToImport: CODED_REPORT_YEARS.filter((y) => !known.has(y)),
    };
  },
});

export const adminGet = query({
  args: { reportId: v.id('annualReports') },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id('annualReports'),
      year: v.number(),
      status: reportStatus,
      inaugural: v.boolean(),
      contents: v.array(v.object({ locale, ...reportContent.fields })),
    }),
  ),
  handler: async (ctx, { reportId }) => {
    await requireNetworkRole(ctx, 'editeur');
    const r = await ctx.db.get(reportId);
    if (!r) return null;
    const contents = await ctx.db
      .query('annualReportContents')
      .withIndex('by_report', (q) => q.eq('reportId', reportId))
      .take(SITE_LOCALES.length);
    return {
      _id: r._id,
      year: r.year,
      status: r.status,
      inaugural: r.inaugural,
      contents: contents.map((c) => ({
        locale: c.locale,
        title: c.title,
        intro: c.intro,
        chapters: c.chapters,
        keyFigures: c.keyFigures,
      })),
    };
  },
});

/** Nouvelle édition, en brouillon. Une édition par année. */
export const createReport = mutation({
  args: { year: v.number(), inaugural: v.boolean() },
  returns: v.id('annualReports'),
  handler: async (ctx, { year, inaugural }) => {
    const editor = await requireNetworkRole(ctx, 'editeur');
    assertYear(year);
    if (await byYear(ctx, year)) throw new Error('REPORT_EXISTS');
    const now = Date.now();
    const id = await ctx.db.insert('annualReports', {
      year,
      status: 'draft',
      inaugural,
      origin: 'admin',
      createdBy: editor._id,
      updatedBy: editor._id,
      createdAt: now,
      updatedAt: now,
    });
    await recordAudit(ctx, {
      actorId: editor._id,
      action: AUDIT.REPORT_CREATED,
      targetId: id,
      metadata: { year },
    });
    return id;
  },
});

/**
 * MIGRATION FIDÈLE d'une édition codée : les cinq langues recopiées telles
 * quelles, l'édition PUBLIÉE d'emblée — la page publique ne change pas
 * d'un caractère, elle change seulement de source — et les cinq PDF planifiés.
 */
export const importCodedReport = mutation({
  args: { year: v.number() },
  returns: v.id('annualReports'),
  handler: async (ctx, { year }) => {
    const editor = await requireNetworkRole(ctx, 'editeur');
    const fr = CODED_REPORTS.fr[year];
    if (!fr) throw new Error('CODED_REPORT_UNKNOWN');
    if (await byYear(ctx, year)) throw new Error('REPORT_EXISTS');
    const now = Date.now();
    const id = await ctx.db.insert('annualReports', {
      year,
      status: 'published',
      inaugural: fr.inaugural,
      origin: 'coded',
      createdBy: editor._id,
      updatedBy: editor._id,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    });
    const report = (await ctx.db.get(id)) as Doc<'annualReports'>;
    for (const loc of SITE_LOCALES) {
      const coded = CODED_REPORTS[loc][year];
      if (!coded) continue;
      // Pas de `normalizeReportContent` : la migration recopie, elle ne
      // corrige pas. Le contenu codé est déjà tenu par ses tests.
      await writeContent(ctx, report, loc, {
        title: coded.title,
        intro: coded.intro,
        chapters: coded.chapters.map((c) => ({
          heading: c.heading,
          body: [...c.body],
        })),
        keyFigures: coded.keyFigures.map((f) => ({ ...f })),
      });
    }
    await recordAudit(ctx, {
      actorId: editor._id,
      action: AUDIT.REPORT_IMPORTED,
      targetId: id,
      metadata: { year },
    });
    return id;
  },
});

export const saveReportContent = mutation({
  args: { reportId: v.id('annualReports'), locale, ...reportContent.fields },
  returns: v.null(),
  handler: async (ctx, { reportId, locale: loc, ...raw }) => {
    const editor = await requireNetworkRole(ctx, 'editeur');
    const report = await ctx.db.get(reportId);
    if (!report) throw new Error('NOT_FOUND');
    const content = normalizeReportContent(raw);
    await writeContent(ctx, report, loc, content);
    await ctx.db.patch(reportId, {
      updatedBy: editor._id,
      updatedAt: Date.now(),
    });
    await recordAudit(ctx, {
      actorId: editor._id,
      action: AUDIT.REPORT_UPDATED,
      targetId: reportId,
      metadata: { year: report.year, locale: loc },
    });
    return null;
  },
});

/**
 * Publication / dépublication et drapeau « édition inaugurale ». Publier
 * exige le texte français (la langue de rédaction, et le repli de la liste).
 * Changer le drapeau change l'empreinte de TOUTES les langues (il figure sur
 * la page de garde du PDF) : elles sont toutes recomposées.
 */
export const updateReportMeta = mutation({
  args: {
    reportId: v.id('annualReports'),
    status: v.optional(reportStatus),
    inaugural: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, { reportId, status, inaugural }) => {
    const editor = await requireNetworkRole(ctx, 'editeur');
    const report = await ctx.db.get(reportId);
    if (!report) throw new Error('NOT_FOUND');
    const now = Date.now();
    if (status === 'published' && !(await contentFor(ctx, reportId, 'fr'))) {
      throw new Error('REPORT_INCOMPLETE');
    }
    await ctx.db.patch(reportId, {
      ...(status ? { status } : {}),
      ...(status === 'published' && report.status !== 'published'
        ? { publishedAt: now }
        : {}),
      ...(inaugural !== undefined ? { inaugural } : {}),
      updatedBy: editor._id,
      updatedAt: now,
    });
    if (inaugural !== undefined && inaugural !== report.inaugural) {
      const updated = (await ctx.db.get(reportId)) as Doc<'annualReports'>;
      const contents = await ctx.db
        .query('annualReportContents')
        .withIndex('by_report', (q) => q.eq('reportId', reportId))
        .take(SITE_LOCALES.length);
      for (const c of contents) {
        await writeContent(ctx, updated, c.locale, {
          title: c.title,
          intro: c.intro,
          chapters: c.chapters,
          keyFigures: c.keyFigures,
        });
      }
    }
    await recordAudit(ctx, {
      actorId: editor._id,
      action:
        status === 'published' && report.status !== 'published'
          ? AUDIT.REPORT_PUBLISHED
          : AUDIT.REPORT_UPDATED,
      targetId: reportId,
      metadata: { year: report.year, status, inaugural },
    });
    return null;
  },
});

/** Recompose les PDF de toutes les langues (après une mise à jour des polices). */
export const regenerateReportPdfs = mutation({
  args: { reportId: v.id('annualReports') },
  returns: v.number(),
  handler: async (ctx, { reportId }) => {
    const editor = await requireNetworkRole(ctx, 'editeur');
    const report = await ctx.db.get(reportId);
    if (!report) throw new Error('NOT_FOUND');
    const contents = await ctx.db
      .query('annualReportContents')
      .withIndex('by_report', (q) => q.eq('reportId', reportId))
      .take(SITE_LOCALES.length);
    for (const c of contents) await schedulePdf(ctx, reportId, c.locale);
    await recordAudit(ctx, {
      actorId: editor._id,
      action: AUDIT.REPORT_UPDATED,
      targetId: reportId,
      metadata: { year: report.year, regeneratePdfs: contents.length },
    });
    return contents.length;
  },
});

/** Supprime une édition, son texte et ses PDF (le repli codé reprend la main). */
export const deleteReport = mutation({
  args: { reportId: v.id('annualReports') },
  returns: v.null(),
  handler: async (ctx, { reportId }) => {
    const editor = await requireNetworkRole(ctx, 'editeur');
    const report = await ctx.db.get(reportId);
    if (!report) throw new Error('NOT_FOUND');
    await purgeReport(ctx, reportId);
    await recordAudit(ctx, {
      actorId: editor._id,
      action: AUDIT.REPORT_DELETED,
      targetId: reportId,
      metadata: { year: report.year },
    });
    return null;
  },
});

async function purgeReport(ctx: MutationCtx, reportId: Id<'annualReports'>) {
  const pdfs = await ctx.db
    .query('annualReportPdfs')
    .withIndex('by_report', (q) => q.eq('reportId', reportId))
    .take(SITE_LOCALES.length * 2);
  for (const p of pdfs) {
    await ctx.storage.delete(p.storageId);
    await ctx.db.delete(p._id);
  }
  const contents = await ctx.db
    .query('annualReportContents')
    .withIndex('by_report', (q) => q.eq('reportId', reportId))
    .take(SITE_LOCALES.length);
  for (const c of contents) await ctx.db.delete(c._id);
  await ctx.db.delete(reportId);
}

// --- Composition du PDF (appelé par convex/reportPdfNode.ts) ------------------

export const pdfSource = internalQuery({
  args: { reportId: v.id('annualReports'), locale },
  returns: v.union(
    v.null(),
    v.object({
      year: v.number(),
      inaugural: v.boolean(),
      contentHash: v.string(),
      ...reportContent.fields,
    }),
  ),
  handler: async (ctx, { reportId, locale: loc }) => {
    const report = await ctx.db.get(reportId);
    if (!report) return null;
    const content = await contentFor(ctx, reportId, loc);
    if (!content) return null;
    return {
      year: report.year,
      inaugural: report.inaugural,
      contentHash: content.contentHash,
      title: content.title,
      intro: content.intro,
      chapters: content.chapters,
      keyFigures: content.keyFigures,
    };
  },
});

/**
 * Enregistre un PDF composé. S'il a été composé à partir d'un texte qui a
 * changé ENTRE-TEMPS, il est jeté : la génération planifiée par ce
 * changement le remplacera, et servir l'ancien serait servir un PDF faux.
 */
export const savePdf = internalMutation({
  args: {
    reportId: v.id('annualReports'),
    locale,
    storageId: v.id('_storage'),
    size: v.number(),
    pages: v.number(),
    contentHash: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const content = await contentFor(ctx, args.reportId, args.locale);
    if (!content || content.contentHash !== args.contentHash) {
      await ctx.storage.delete(args.storageId);
      return false;
    }
    const existing = await pdfFor(ctx, args.reportId, args.locale);
    if (existing) {
      await ctx.storage.delete(existing.storageId);
      await ctx.db.delete(existing._id);
    }
    await ctx.db.insert('annualReportPdfs', {
      reportId: args.reportId,
      locale: args.locale,
      storageId: args.storageId,
      size: args.size,
      pages: args.pages,
      contentHash: args.contentHash,
      generatedAt: Date.now(),
    });
    return true;
  },
});

/** Toutes les (édition, langue) — pour `reportPdfNode:generateAll`. */
export const allReportLocales = internalQuery({
  args: {},
  returns: v.array(v.object({ reportId: v.id('annualReports'), locale })),
  handler: async (ctx) => {
    const reports = await ctx.db.query('annualReports').take(REPORTS_MAX);
    const out = [];
    for (const r of reports) {
      const contents = await ctx.db
        .query('annualReportContents')
        .withIndex('by_report', (q) => q.eq('reportId', r._id))
        .take(SITE_LOCALES.length);
      for (const c of contents) out.push({ reportId: r._id, locale: c.locale });
    }
    return out;
  },
});

// --- Données personnelles (suppression / export de compte) ---------------------

// Les éditions ne portent de personne que l'attribution de leur dernière
// écriture : à la suppression du compte, l'attribution est retirée, le
// rapport (document de l'association) reste.
export async function deleteUserDataReports(
  ctx: MutationCtx,
  userId: Id<'users'>,
): Promise<void> {
  const reports = await ctx.db.query('annualReports').take(REPORTS_MAX);
  for (const r of reports) {
    if (r.createdBy === userId || r.updatedBy === userId) {
      await ctx.db.patch(r._id, {
        ...(r.createdBy === userId ? { createdBy: undefined } : {}),
        ...(r.updatedBy === userId ? { updatedBy: undefined } : {}),
      });
    }
  }
}

export async function exportUserDataReports(
  ctx: QueryCtx,
  userId: Id<'users'>,
): Promise<{ year: number; role: 'created' | 'updated' }[]> {
  const reports = await ctx.db.query('annualReports').take(REPORTS_MAX);
  const out: { year: number; role: 'created' | 'updated' }[] = [];
  for (const r of reports) {
    if (r.createdBy === userId) out.push({ year: r.year, role: 'created' });
    else if (r.updatedBy === userId)
      out.push({ year: r.year, role: 'updated' });
  }
  return out;
}
