// @vitest-environment edge-runtime
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// TRANSLATED PDFs AT PUBLICATION — the jobs and what readers get.
//
// The translation itself (pdf.js, pdfkit, the model) is the Node action's,
// tested on real files in convex/lib/pdfTranslate. These tests drive the
// three steps around it directly — claim, finish — and check what matters
// outside the action: a job per language when a publication goes live, a
// result written only while it is still wanted, no translated file left
// behind in storage, and a members-only document kept behind its door.

type Ctx = ReturnType<typeof convexTest>;

async function seedUser(
  t: Ctx,
  role: 'membre' | 'moderateur' | 'admin',
  email = `${role}-${Math.random()}@dt.test`,
) {
  const id = await t.run((ctx) => ctx.db.insert('users', { email, role }));
  return { id, as: t.withIdentity({ subject: `${id}|s` }) };
}

async function storePdf(t: Ctx, text = 'original'): Promise<Id<'_storage'>> {
  return await t.run((ctx) =>
    ctx.storage.store(
      new Blob([`%PDF-1.4\n% ${text}\n`], { type: 'application/pdf' }),
    ),
  );
}

async function seedPublication(
  t: Ctx,
  over: Record<string, unknown> = {},
): Promise<{ id: Id<'publications'>; slug: string; fileId: Id<'_storage'> }> {
  const author = await seedUser(t, 'membre');
  const fileId = await storePdf(t);
  const slug = `rapport-${Math.random().toString(36).slice(2, 8)}`;
  const id = await t.run((ctx) =>
    ctx.db.insert('publications', {
      title: 'Rapport TRADUCTION-PDF',
      slug,
      type: 'rapport',
      theme: 'participation',
      region: 'afrique',
      languages: ['fr'],
      access: 'open',
      authors: [{ name: 'A. Autrice' }],
      year: 2026,
      publishedAt: 0,
      abstract: 'Un rapport sur dix budgets participatifs.',
      keypoints: [],
      body: [],
      doi: '',
      downloads: 0,
      citations: 0,
      views: 0,
      status: 'pending',
      authorUserId: author.id,
      submittedAt: Date.now(),
      createdAt: Date.now(),
      fileId,
      fileName: 'rapport.pdf',
      ...over,
    }),
  );
  return { id, slug, fileId };
}

async function approve(t: Ctx, publicationId: Id<'publications'>) {
  const moderator = await seedUser(t, 'moderateur');
  await moderator.as.mutation(api.publications.reviewPublication, {
    publicationId,
    decision: 'approved',
  });
}

async function rowsOf(t: Ctx, publicationId: Id<'publications'>) {
  return await t.run((ctx) =>
    ctx.db
      .query('documentTranslations')
      .withIndex('by_publication_and_locale', (q) =>
        q.eq('publicationId', publicationId),
      )
      .collect(),
  );
}

/** Claims a job and finishes it with a stored "translated" file. */
async function completeJob(t: Ctx, id: Id<'documentTranslations'>) {
  const job = await t.mutation(internal.documentJobs.claimDocumentJob, { id });
  expect(job).not.toBeNull();
  const storageId = await storePdf(t, `traduit ${job!.targetLocale}`);
  await t.mutation(internal.documentJobs.finishDocumentJob, {
    id,
    leaseUntil: job!.leaseUntil,
    fileId: job!.fileId,
    outcome: { ok: true, storageId, pages: 2, size: 1234, model: 'test' },
  });
  return { job: job!, storageId };
}

beforeEach(() => {
  vi.stubEnv('AI_GATEWAY_API_KEY', 'vck_test');
  // The Node action is never run here: the clock is fake and never advanced.
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('PDF — traduit à la mise en ligne de la publication', () => {
  it('met en file une traduction du fichier par autre langue', async () => {
    const t = convexTest(schema, modules);
    const pub = await seedPublication(t);

    await approve(t, pub.id);

    const rows = await rowsOf(t, pub.id);
    expect(rows.map((r) => r.targetLocale).sort()).toEqual([
      'ar',
      'en',
      'es',
      'pt',
    ]);
    for (const r of rows) {
      expect(r.status).toBe('pending');
      expect(r.fileId).toBe(pub.fileId);
    }
    // The text is queued in the same transaction.
    const texts = await t.run((ctx) =>
      ctx.db
        .query('contentTranslations')
        .withIndex('by_source', (q) =>
          q.eq('sourceType', 'publication').eq('sourceId', pub.id),
        )
        .collect(),
    );
    expect(texts).toHaveLength(4);
  });

  it('sans fichier joint, rien à traduire côté PDF', async () => {
    const t = convexTest(schema, modules);
    const pub = await seedPublication(t, { fileId: undefined });
    await approve(t, pub.id);
    expect(await rowsOf(t, pub.id)).toHaveLength(0);
  });

  it('sert l’original et chaque traduction prête, dit ce qui se prépare', async () => {
    const t = convexTest(schema, modules);
    const pub = await seedPublication(t);
    await approve(t, pub.id);
    const rows = await rowsOf(t, pub.id);
    await completeJob(t, rows.find((r) => r.targetLocale === 'en')!._id);

    const files = await t.query(api.documents.getDocumentFiles, {
      slug: pub.slug,
    });
    expect(files?.sourceLocale).toBe('fr');
    const byLocale = Object.fromEntries(files!.files.map((f) => [f.locale, f]));
    expect(byLocale.fr.status).toBe('original');
    expect(byLocale.fr.url).toBeTruthy();
    expect(byLocale.en.status).toBe('ready');
    expect(byLocale.en.url).toBeTruthy();
    expect(byLocale.en.pages).toBe(2);
    expect(byLocale.es).toEqual({ locale: 'es', status: 'pending' });
  });

  it('un document réservé aux membres garde sa porte, traductions comprises', async () => {
    const t = convexTest(schema, modules);
    const pub = await seedPublication(t, { access: 'members' });
    await approve(t, pub.id);

    expect(
      await t.query(api.documents.getDocumentFiles, { slug: pub.slug }),
    ).toBeNull();
    const member = await seedUser(t, 'membre');
    const files = await member.as.query(api.documents.getDocumentFiles, {
      slug: pub.slug,
    });
    expect(files?.files).toHaveLength(5);
  });
});

describe('PDF — rien n’est gardé qui n’est plus voulu', () => {
  it('le résultat d’un bail expiré est jeté, fichier compris', async () => {
    const t = convexTest(schema, modules);
    const pub = await seedPublication(t);
    await approve(t, pub.id);
    const [row] = await rowsOf(t, pub.id);

    const first = await t.mutation(internal.documentJobs.claimDocumentJob, {
      id: row._id,
    });
    // The clock moves, the scheduler does not: no Node action runs here.
    vi.setSystemTime(Date.now() + 13 * 60 * 1000);
    const second = await t.mutation(internal.documentJobs.claimDocumentJob, {
      id: row._id,
    });
    expect(second).not.toBeNull();

    const late = await storePdf(t, 'late');
    await t.mutation(internal.documentJobs.finishDocumentJob, {
      id: row._id,
      leaseUntil: first!.leaseUntil,
      fileId: first!.fileId,
      outcome: { ok: true, storageId: late, pages: 1, size: 10, model: 'x' },
    });
    expect((await t.run((ctx) => ctx.db.get(row._id)))?.status).toBe('pending');
    expect(await t.run((ctx) => ctx.storage.get(late))).toBeNull();
  });

  it('un fichier remplacé fait retraduire, et l’ancienne traduction disparaît', async () => {
    const t = convexTest(schema, modules);
    const pub = await seedPublication(t);
    await approve(t, pub.id);
    const en = (await rowsOf(t, pub.id)).find((r) => r.targetLocale === 'en')!;
    const { storageId: oldTranslation } = await completeJob(t, en._id);

    // The accepted manuscript version brings a new file; the publication
    // is put online again with it.
    const newFile = await storePdf(t, 'version 2');
    await t.run((ctx) => ctx.db.patch(pub.id, { fileId: newFile }));
    await t.mutation(internal.documentJobs.backfillDocuments, {
      dryRun: false,
    });

    const after = (await rowsOf(t, pub.id)).find(
      (r) => r.targetLocale === 'en',
    )!;
    expect(after.status).toBe('pending');
    expect(after.fileId).toBe(newFile);
    expect(after.storageId).toBeUndefined();
    expect(await t.run((ctx) => ctx.storage.get(oldTranslation))).toBeNull();
  });

  it('la suppression de la publication emporte ses PDF traduits', async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv('AUTH_DEV_OTP', 'true');
    const pub = await seedPublication(t);
    await approve(t, pub.id);
    const en = (await rowsOf(t, pub.id)).find((r) => r.targetLocale === 'en')!;
    const { storageId } = await completeJob(t, en._id);

    await t.mutation(internal.devAdmin.deleteTestPublications, {
      marker: 'TRADUCTION-PDF',
    });

    expect(await rowsOf(t, pub.id)).toHaveLength(0);
    expect(await t.run((ctx) => ctx.storage.get(storageId))).toBeNull();
  });
});

describe('PDF — échecs bornés', () => {
  it('trois tentatives au plus pour une panne de passerelle', async () => {
    const t = convexTest(schema, modules);
    const pub = await seedPublication(t);
    await approve(t, pub.id);
    const [row] = await rowsOf(t, pub.id);

    for (let attempt = 1; attempt <= 3; attempt++) {
      const job = await t.mutation(internal.documentJobs.claimDocumentJob, {
        id: row._id,
      });
      expect(job).not.toBeNull();
      await t.mutation(internal.documentJobs.finishDocumentJob, {
        id: row._id,
        leaseUntil: job!.leaseUntil,
        fileId: job!.fileId,
        outcome: { ok: false, code: 'AI_GATEWAY_HTTP_ERROR' },
      });
      // Past the retry delay, without running what the scheduler holds.
      vi.setSystemTime(Date.now() + 60 * 60 * 1000);
    }
    const after = await t.run((ctx) => ctx.db.get(row._id));
    expect(after?.status).toBe('failed');
    expect(after?.attempts).toBe(3);
  });

  it('un fichier illisible échoue tout de suite, sans nouvelle tentative', async () => {
    const t = convexTest(schema, modules);
    const pub = await seedPublication(t);
    await approve(t, pub.id);
    const [row] = await rowsOf(t, pub.id);
    const job = await t.mutation(internal.documentJobs.claimDocumentJob, {
      id: row._id,
    });
    await t.mutation(internal.documentJobs.finishDocumentJob, {
      id: row._id,
      leaseUntil: job!.leaseUntil,
      fileId: job!.fileId,
      outcome: { ok: false, code: 'PDF_UNREADABLE' },
    });
    const after = await t.run((ctx) => ctx.db.get(row._id));
    expect(after?.status).toBe('failed');
    expect(after?.error).toBe('PDF_UNREADABLE');
  });

  it('sans clé de passerelle, la tâche échoue sans rien appeler', async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    const pub = await seedPublication(t);
    await approve(t, pub.id);
    const [row] = await rowsOf(t, pub.id);
    expect(
      await t.mutation(internal.documentJobs.claimDocumentJob, { id: row._id }),
    ).toBeNull();
    const after = await t.run((ctx) => ctx.db.get(row._id));
    expect(after?.status).toBe('failed');
    expect(after?.error).toBe('AI_GATEWAY_NOT_CONFIGURED');
  });

  it('au-delà du plafond quotidien, la tâche attend', async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv('DOCUMENT_TRANSLATION_DAILY_CAP', '1');
    const pub = await seedPublication(t);
    await approve(t, pub.id);
    const [a, b] = await rowsOf(t, pub.id);
    expect(
      await t.mutation(internal.documentJobs.claimDocumentJob, { id: a._id }),
    ).not.toBeNull();
    expect(
      await t.mutation(internal.documentJobs.claimDocumentJob, { id: b._id }),
    ).toBeNull();
    const waiting = await t.run((ctx) => ctx.db.get(b._id));
    expect(waiting?.status).toBe('pending');
    expect(waiting?.nextAttemptAt).toBeGreaterThan(Date.now());
  });
});

describe('PDF — rattrapage de l’existant', () => {
  it('compte sans rien écrire, puis met en file', async () => {
    const t = convexTest(schema, modules);
    const pub = await seedPublication(t, {
      status: 'published',
      publishedAt: Date.now(),
      doi: '10.59000/dt.ancien',
    });

    const estimate = await t.mutation(internal.documentJobs.backfillDocuments, {
      dryRun: true,
    });
    expect(estimate).toMatchObject({ documents: 1, translations: 4 });
    expect(estimate.totalBytes).toBeGreaterThan(0);
    expect(await rowsOf(t, pub.id)).toHaveLength(0);

    await t.mutation(internal.documentJobs.backfillDocuments, {
      dryRun: false,
    });
    expect(await rowsOf(t, pub.id)).toHaveLength(4);
    // Idempotent: nothing more the second time.
    const again = await t.mutation(internal.documentJobs.backfillDocuments, {
      dryRun: true,
    });
    expect(again.translations).toBe(0);
  });
});
