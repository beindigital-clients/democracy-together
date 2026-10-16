// @vitest-environment edge-runtime
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { convexTest, type TestConvex } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { CODED_REPORTS } from './lib/annualReportsCoded';
import { reportContentHash } from './lib/annualReports';
import { deleteUserDataEditorial } from './editorial';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// Annual reports (F-41): data model, administration (editor+),
// faithful migration of the hard-coded content, and PDF served only if it matches
// the current text.
//
// Fake clock: every write of the text SCHEDULES the PDF composition
// (Node action). Tests that want it run it by hand.
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.UTC(2026, 8, 27, 10));
});
afterEach(() => vi.useRealTimers());

type T = TestConvex<typeof schema>;
async function userWithRole(
  t: T,
  role: 'membre' | 'moderateur' | 'editeur' | 'admin',
  email: string,
) {
  const id = await t.run((ctx) => ctx.db.insert('users', { role, email }));
  return { id, as: t.withIdentity({ subject: `${id}|s` }) };
}

const CONTENT = {
  title: 'Rapport d’activité 2027',
  intro: 'Deuxième année du réseau : consolidation et premières données.',
  chapters: [
    {
      heading: 'Consolidation',
      body: ['Le réseau compte ses premiers membres.', ''],
    },
  ],
  keyFigures: [{ value: '12', label: 'organisations membres' }],
};

async function scheduledPdfJobs(t: T) {
  return await t.run((ctx) =>
    ctx.db.system
      .query('_scheduled_functions')
      .filter((q) => q.eq(q.field('name'), 'reportPdfNode:generate'))
      .collect(),
  );
}

describe('Rapports annuels — administration (F-41)', () => {
  it('éditeur seulement : un modérateur ne crée ni ne lit l’administration', async () => {
    const t = convexTest(schema, modules);
    const mod = await userWithRole(t, 'moderateur', 'm@test.org');
    await expect(
      mod.as.mutation(api.annualReports.createReport, {
        year: 2027,
        inaugural: false,
      }),
    ).rejects.toThrow();
    await expect(
      mod.as.query(api.annualReports.adminList, {}),
    ).rejects.toThrow();
    await expect(
      mod.as.mutation(api.annualReports.importCodedReport, { year: 2026 }),
    ).rejects.toThrow();
  });

  it('crée, rédige, publie ; bornes et unicité par année ; audit', async () => {
    const t = convexTest(schema, modules);
    const ed = await userWithRole(t, 'editeur', 'e@test.org');
    const id = await ed.as.mutation(api.annualReports.createReport, {
      year: 2027,
      inaugural: false,
    });
    await expect(
      ed.as.mutation(api.annualReports.createReport, {
        year: 2027,
        inaugural: false,
      }),
    ).rejects.toThrow('REPORT_EXISTS');
    await expect(
      ed.as.mutation(api.annualReports.createReport, {
        year: 1850,
        inaugural: false,
      }),
    ).rejects.toThrow('INVALID_YEAR');

    // Draft: invisible, and the year is no longer served by the hard-coded fallback.
    expect(
      await t.query(api.annualReports.getPublic, { year: 2027, locale: 'fr' }),
    ).toEqual({ known: true, report: null });

    // Publishing without French text: refused.
    await expect(
      ed.as.mutation(api.annualReports.updateReportMeta, {
        reportId: id,
        status: 'published',
      }),
    ).rejects.toThrow('REPORT_INCOMPLETE');

    await expect(
      ed.as.mutation(api.annualReports.saveReportContent, {
        reportId: id,
        locale: 'fr',
        ...CONTENT,
        title: 'x',
      }),
    ).rejects.toThrow('INVALID_TITLE');
    await ed.as.mutation(api.annualReports.saveReportContent, {
      reportId: id,
      locale: 'fr',
      ...CONTENT,
    });
    // The empty paragraph is removed, not counted as an error.
    const stored = await t.run((ctx) =>
      ctx.db.query('annualReportContents').collect(),
    );
    expect(stored[0].chapters[0].body).toEqual([
      'Le réseau compte ses premiers membres.',
    ]);
    // The PDF is scheduled on write.
    expect(await scheduledPdfJobs(t)).toHaveLength(1);

    await ed.as.mutation(api.annualReports.updateReportMeta, {
      reportId: id,
      status: 'published',
    });
    const pub = await t.query(api.annualReports.getPublic, {
      year: 2027,
      locale: 'fr',
    });
    expect(pub.report).toMatchObject({
      title: CONTENT.title,
      keyFigures: CONTENT.keyFigures,
      availableLocales: ['fr'],
      pdfs: [],
    });
    // Language without text: the French text is served, and states its language.
    expect(
      (await t.query(api.annualReports.getPublic, { year: 2027, locale: 'ar' }))
        .report?.locale,
    ).toBe('fr');

    const audit = await t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(audit.map((a) => a.action)).toEqual([
      'report.created',
      'report.updated',
      'report.published',
    ]);
  });

  it('MIGRATION FIDÈLE : l’édition codée recopiée champ pour champ, publiée, cinq PDF planifiés', async () => {
    const t = convexTest(schema, modules);
    const ed = await userWithRole(t, 'editeur', 'e@test.org');
    expect(
      (await ed.as.query(api.annualReports.adminList, {})).codedToImport,
    ).toEqual([2026]);
    // Before migration: the database doesn't know the year (hard-coded fallback).
    expect(
      await t.query(api.annualReports.getPublic, { year: 2026, locale: 'fr' }),
    ).toEqual({ known: false, report: null });

    await ed.as.mutation(api.annualReports.importCodedReport, { year: 2026 });
    await expect(
      ed.as.mutation(api.annualReports.importCodedReport, { year: 2026 }),
    ).rejects.toThrow('REPORT_EXISTS');
    await expect(
      ed.as.mutation(api.annualReports.importCodedReport, { year: 1999 }),
    ).rejects.toThrow('CODED_REPORT_UNKNOWN');

    for (const loc of ['fr', 'en', 'es', 'pt', 'ar'] as const) {
      const coded = CODED_REPORTS[loc][2026];
      const { report } = await t.query(api.annualReports.getPublic, {
        year: 2026,
        locale: loc,
      });
      expect(report).toMatchObject({
        year: 2026,
        inaugural: coded.inaugural,
        title: coded.title,
        intro: coded.intro,
        chapters: coded.chapters,
        keyFigures: coded.keyFigures,
      });
    }
    expect(await scheduledPdfJobs(t)).toHaveLength(5);
    const list = await t.query(api.annualReports.listPublic, { locale: 'ar' });
    expect(list.reports.map((r) => [r.year, r.title])).toEqual([
      [2026, CODED_REPORTS.ar[2026].title],
    ]);
    expect(
      (await ed.as.query(api.annualReports.adminList, {})).codedToImport,
    ).toEqual([]);
  });
});

describe('Rapports annuels — PDF servi seulement s’il correspond au texte (F-41)', () => {
  async function publishedWithPdf(t: T) {
    const ed = await userWithRole(t, 'editeur', 'e@test.org');
    const reportId = await ed.as.mutation(api.annualReports.importCodedReport, {
      year: 2026,
    });
    const content = await t.run(async (ctx) =>
      ctx.db
        .query('annualReportContents')
        .withIndex('by_report_and_locale', (q) =>
          q.eq('reportId', reportId).eq('locale', 'ar'),
        )
        .unique(),
    );
    const storageId = await t.run((ctx) =>
      ctx.storage.store(
        new Blob(['%PDF-1.7 factice'], { type: 'application/pdf' }),
      ),
    );
    const saved = await t.mutation(internal.annualReports.savePdf, {
      reportId,
      locale: 'ar',
      storageId,
      size: 36_000,
      pages: 2,
      contentHash: content!.contentHash,
    });
    return { ed, reportId, saved, storageId };
  }

  it('un PDF à jour est rendu (taille, pages, URL) ; un PDF périmé ne l’est plus', async () => {
    const t = convexTest(schema, modules);
    const { ed, reportId, saved } = await publishedWithPdf(t);
    expect(saved).toBe(true);
    const pdf = await t.query(api.annualReports.getPdf, {
      year: 2026,
      locale: 'ar',
    });
    expect(pdf).toMatchObject({
      size: 36_000,
      pages: 2,
      url: expect.any(String),
    });
    const page = await t.query(api.annualReports.getPublic, {
      year: 2026,
      locale: 'fr',
    });
    // The French page also announces the Arabic PDF (other languages).
    expect(page.report?.pdfs.map((p) => p.locale)).toEqual(['ar']);

    // The Arabic text is corrected: the old PDF no longer matches.
    const coded = CODED_REPORTS.ar[2026];
    await ed.as.mutation(api.annualReports.saveReportContent, {
      reportId,
      locale: 'ar',
      title: coded.title,
      intro: `${coded.intro} (مراجعة)`,
      chapters: coded.chapters,
      keyFigures: [],
    });
    expect(
      await t.query(api.annualReports.getPdf, { year: 2026, locale: 'ar' }),
    ).toBeNull();
    const admin = await ed.as.query(api.annualReports.adminList, {});
    expect(admin.reports[0].locales.find((l) => l.locale === 'ar')?.pdf).toBe(
      'stale',
    );
  });

  it('un PDF composé à partir d’un texte déjà remplacé est JETÉ', async () => {
    const t = convexTest(schema, modules);
    const { reportId } = await publishedWithPdf(t);
    const late = await t.run((ctx) =>
      ctx.storage.store(new Blob(['%PDF tardif'], { type: 'application/pdf' })),
    );
    const saved = await t.mutation(internal.annualReports.savePdf, {
      reportId,
      locale: 'ar',
      storageId: late,
      size: 10,
      pages: 1,
      contentHash: reportContentHash(2026, true, {
        title: 'ancien',
        intro: 'ancien',
        chapters: [],
        keyFigures: [],
      }),
    });
    expect(saved).toBe(false);
    expect(await t.run((ctx) => ctx.storage.get(late))).toBeNull();
  });

  it('dépublier retire la page ET le PDF ; changer « inaugurale » recompose toutes les langues', async () => {
    const t = convexTest(schema, modules);
    const { ed, reportId } = await publishedWithPdf(t);
    const before = (await scheduledPdfJobs(t)).length;
    await ed.as.mutation(api.annualReports.updateReportMeta, {
      reportId,
      inaugural: false,
    });
    expect((await scheduledPdfJobs(t)).length - before).toBe(5);
    // The hash changed with the flag: the Arabic PDF is stale.
    expect(
      await t.query(api.annualReports.getPdf, { year: 2026, locale: 'ar' }),
    ).toBeNull();

    await ed.as.mutation(api.annualReports.updateReportMeta, {
      reportId,
      status: 'draft',
    });
    expect(
      await t.query(api.annualReports.getPublic, { year: 2026, locale: 'fr' }),
    ).toEqual({ known: true, report: null });
    expect(
      (await t.query(api.annualReports.listPublic, { locale: 'fr' }))
        .knownYears,
    ).toEqual([2026]);
  });

  it('supprimer une édition efface texte, PDF et fichiers ; le repli codé reprend', async () => {
    const t = convexTest(schema, modules);
    const { ed, reportId, storageId } = await publishedWithPdf(t);
    await ed.as.mutation(api.annualReports.deleteReport, { reportId });
    expect(
      await t.query(api.annualReports.getPublic, { year: 2026, locale: 'fr' }),
    ).toEqual({ known: false, report: null });
    expect(await t.run((ctx) => ctx.storage.get(storageId))).toBeNull();
    expect(
      await t.run((ctx) => ctx.db.query('annualReportContents').collect()),
    ).toHaveLength(0);
  });

  it(
    'l’action compose, stocke et enregistre le PDF arabe ; la route le trouve',
    { timeout: 60_000 },
    async () => {
      const t = convexTest(schema, modules);
      const ed = await userWithRole(t, 'editeur', 'e@test.org');
      const reportId = await ed.as.mutation(
        api.annualReports.importCodedReport,
        {
          year: 2026,
        },
      );
      const res = await t.action(internal.reportPdfNode.generate, {
        reportId,
        locale: 'ar',
      });
      expect(res).toMatchObject({ stored: true });
      expect(res!.pages).toBeGreaterThanOrEqual(2);
      const pdf = await t.query(api.annualReports.getPdf, {
        year: 2026,
        locale: 'ar',
      });
      expect(pdf).toMatchObject({ pages: res!.pages, size: res!.size });
      const head = await t.run(async (ctx) => {
        const row = await ctx.db.query('annualReportPdfs').first();
        const blob = await ctx.storage.get(row!.storageId);
        return new TextDecoder().decode(
          new Uint8Array(await (blob as Blob).arrayBuffer()).slice(0, 5),
        );
      });
      expect(head).toBe('%PDF-');
    },
  );

  it('suppression de compte : l’attribution est retirée, le rapport reste', async () => {
    const t = convexTest(schema, modules);
    const { ed, reportId } = await publishedWithPdf(t);
    await t.run((ctx) => deleteUserDataEditorial(ctx, ed.id));
    const r = await t.run((ctx) => ctx.db.get(reportId as Id<'annualReports'>));
    expect(r?.createdBy).toBeUndefined();
    expect(r?.updatedBy).toBeUndefined();
    expect(r?.status).toBe('published');
  });
});
