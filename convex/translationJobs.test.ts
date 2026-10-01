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

// TRANSLATION AT PUBLICATION — the jobs, end to end in the database.
//
// What these tests guard is what a reader would otherwise find out first:
// content online in one language only because a job was lost, a
// translation of an older text served as current, a members-only text
// leaking through its translation, or a gateway outage turning into an
// endless bill. The gateway is MOCKED: no network call leaves a test.

type Ctx = ReturnType<typeof convexTest>;

const CODES: Record<string, string> = {
  French: 'fr',
  English: 'en',
  Spanish: 'es',
  Portuguese: 'pt',
  'Arabic (Modern Standard Arabic)': 'ar',
};

/**
 * A gateway that translates: each string comes back prefixed with the
 * target language code (`[es] …`). It reads the request the way the real
 * one does — instructions for the language, the input text for the fields —
 * so a test proves what was SENT as much as what is stored.
 */
function translatingGateway() {
  const calls: { target: string; model: string }[] = [];
  const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
    // `body` is a `BodyInit`: the adapter only ever puts a JSON string in it.
    const req = JSON.parse(init?.body as string) as {
      model: string;
      instructions: string;
      input: { content: { text: string }[] }[];
    };
    const name = /into (.+)\.$/m.exec(req.instructions)?.[1] ?? '';
    const target = CODES[name] ?? '??';
    const source = JSON.parse(req.input[0].content[0].text) as {
      title: string;
      abstract?: string;
      keypoints?: string[];
      body: string[];
    };
    const tr = (s: string) => `[${target}] ${s}`;
    const out = {
      title: tr(source.title),
      body: source.body.map(tr),
      ...(source.abstract !== undefined
        ? { abstract: tr(source.abstract) }
        : {}),
      ...(source.keypoints ? { keypoints: source.keypoints.map(tr) } : {}),
    };
    calls.push({ target, model: req.model });
    return new Response(
      JSON.stringify({
        output_text: JSON.stringify(out),
        usage: { input_tokens: 100, output_tokens: 120 },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, calls };
}

function failingGateway() {
  const fetchMock = vi.fn(
    async () => new Response('upstream unavailable', { status: 503 }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function seedUser(
  t: Ctx,
  role: 'membre' | 'moderateur' | 'editeur' | 'admin',
  email = `${role}@dt.test`,
) {
  const id = await t.run((ctx) => ctx.db.insert('users', { email, role }));
  return { id, as: t.withIdentity({ subject: `${id}|s` }) };
}

async function seedPublication(
  t: Ctx,
  over: Record<string, unknown> = {},
): Promise<Id<'publications'>> {
  const author = await seedUser(t, 'membre', `auteur-${Math.random()}@dt.test`);
  return await t.run((ctx) =>
    ctx.db.insert('publications', {
      title: 'Budgets participatifs locaux',
      slug: `budgets-${Math.random().toString(36).slice(2, 8)}`,
      type: 'note',
      theme: 'participation',
      region: 'afrique',
      languages: ['fr'],
      access: 'open',
      authors: [{ name: 'A. Auteur' }],
      year: 2026,
      publishedAt: 0,
      abstract: 'Une note sur dix budgets participatifs.',
      keypoints: ['Participation faible', 'Exécution lente'],
      body: [],
      doi: '',
      downloads: 0,
      citations: 0,
      views: 0,
      status: 'pending',
      authorUserId: author.id,
      submittedAt: Date.now(),
      createdAt: Date.now(),
      ...over,
    }),
  );
}

async function rowsOf(t: Ctx, sourceType: string, sourceId: string) {
  return await t.run((ctx) =>
    ctx.db
      .query('contentTranslations')
      .withIndex('by_source', (q) =>
        q
          .eq('sourceType', sourceType as 'publication')
          .eq('sourceId', sourceId),
      )
      .collect(),
  );
}

async function approve(t: Ctx, publicationId: Id<'publications'>) {
  const moderator = await seedUser(
    t,
    'moderateur',
    `mod-${Math.random()}@dt.test`,
  );
  await moderator.as.mutation(api.publications.reviewPublication, {
    publicationId,
    decision: 'approved',
  });
}

beforeEach(() => {
  vi.stubEnv('AI_GATEWAY_API_KEY', 'vck_test');
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('Publication — traduite à sa mise en ligne', () => {
  it('met en file les quatre autres langues, puis les traduit', async () => {
    const t = convexTest(schema, modules);
    const { calls } = translatingGateway();
    const pub = await seedPublication(t);

    await approve(t, pub);

    // In the SAME transaction as the publication: the jobs exist as soon
    // as the content is public.
    const queued = await rowsOf(t, 'publication', pub);
    expect(queued.map((r) => r.targetLocale).sort()).toEqual([
      'ar',
      'en',
      'es',
      'pt',
    ]);
    expect(queued.every((r) => r.status === 'pending')).toBe(true);

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const done = await rowsOf(t, 'publication', pub);
    expect(done.every((r) => r.status === 'ready')).toBe(true);
    const es = done.find((r) => r.targetLocale === 'es')!;
    expect(es.fields).toEqual({
      title: '[es] Budgets participatifs locaux',
      abstract: '[es] Une note sur dix budgets participatifs.',
      keypoints: ['[es] Participation faible', '[es] Exécution lente'],
      body: [],
    });
    // One call per language, on the translation model (not moderation's).
    expect(calls.map((c) => c.target).sort()).toEqual(['ar', 'en', 'es', 'pt']);
    expect(new Set(calls.map((c) => c.model))).toEqual(
      new Set(['anthropic/claude-sonnet-5.5']),
    );
  });

  it('sert la langue choisie au lecteur, et la liste des langues', async () => {
    const t = convexTest(schema, modules);
    translatingGateway();
    const pub = await seedPublication(t);
    await approve(t, pub);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const reading = await t.query(api.translation.getReading, {
      sourceType: 'publication',
      sourceId: pub,
      locale: 'pt',
    });
    expect(reading?.sourceLocale).toBe('fr');
    expect(reading?.translation?.fields.title).toBe(
      '[pt] Budgets participatifs locaux',
    );
    expect(reading?.versions).toEqual([
      { locale: 'fr', status: 'original' },
      { locale: 'en', status: 'ready' },
      { locale: 'es', status: 'ready' },
      { locale: 'pt', status: 'ready' },
      { locale: 'ar', status: 'ready' },
    ]);

    // The original is not a translation of itself.
    const original = await t.query(api.translation.getReading, {
      sourceType: 'publication',
      sourceId: pub,
      locale: 'fr',
    });
    expect(original?.translation).toBeNull();
  });

  it('ne retraduit pas ce qui l’est déjà (rattrapage, nouvelle mise en ligne)', async () => {
    const t = convexTest(schema, modules);
    const { fetchMock } = translatingGateway();
    const pub = await seedPublication(t);
    await approve(t, pub);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).toHaveBeenCalledTimes(4);

    const report = await t.mutation(internal.translationJobs.backfill, {
      dryRun: false,
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(report.translations).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('un contenu réservé aux membres garde sa porte, traduction comprise', async () => {
    const t = convexTest(schema, modules);
    translatingGateway();
    const pub = await seedPublication(t, { access: 'members' });
    await approve(t, pub);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const visitor = await t.query(api.translation.getReading, {
      sourceType: 'publication',
      sourceId: pub,
      locale: 'en',
    });
    expect(visitor).toBeNull();

    const member = await seedUser(t, 'membre', 'lecteur@dt.test');
    const asMember = await member.as.query(api.translation.getReading, {
      sourceType: 'publication',
      sourceId: pub,
      locale: 'en',
    });
    expect(asMember?.translation?.fields.title).toBe(
      '[en] Budgets participatifs locaux',
    );
  });
});

describe('Échecs — bornés, et dits', () => {
  it('trois tentatives au plus, puis un échec définitif', async () => {
    const t = convexTest(schema, modules);
    const fetchMock = failingGateway();
    const pub = await seedPublication(t);
    await approve(t, pub);

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const rows = await rowsOf(t, 'publication', pub);
    expect(rows).toHaveLength(4);
    for (const r of rows) {
      expect(r.status).toBe('failed');
      expect(r.attempts).toBe(3);
      expect(r.error).toBe('AI_GATEWAY_HTTP_ERROR');
      expect(r.fields).toBeUndefined();
    }
    // 4 languages × 3 attempts, and not one more.
    expect(fetchMock).toHaveBeenCalledTimes(12);

    const reading = await t.query(api.translation.getReading, {
      sourceType: 'publication',
      sourceId: pub,
      locale: 'es',
    });
    expect(reading?.translation).toBeNull();
    expect(reading?.versions.find((v) => v.locale === 'es')?.status).toBe(
      'failed',
    );
  });

  it('sans clé de passerelle : échec immédiat, aucun appel', async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    const { fetchMock } = translatingGateway();
    const pub = await seedPublication(t);
    await approve(t, pub);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const rows = await rowsOf(t, 'publication', pub);
    expect(rows.every((r) => r.status === 'failed')).toBe(true);
    expect(rows.every((r) => r.error === 'AI_GATEWAY_NOT_CONFIGURED')).toBe(
      true,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('au-delà du plafond quotidien, la tâche attend sans échouer', async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv('TRANSLATION_DAILY_CAP', '2');
    const { fetchMock } = translatingGateway();
    const pub = await seedPublication(t);
    await approve(t, pub);
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const rows = await rowsOf(t, 'publication', pub);
    expect(rows.filter((r) => r.status === 'ready')).toHaveLength(2);
    const waiting = rows.filter((r) => r.status === 'pending');
    expect(waiting).toHaveLength(2);
    // Not tried, not failed: no attempt counted, no error.
    for (const r of waiting) {
      expect(r.attempts).toBe(0);
      expect(r.error).toBeUndefined();
      expect(r.nextAttemptAt).toBeGreaterThan(Date.now());
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('Concurrence — rien n’est écrit pour un texte qui n’existe plus', () => {
  it('un texte modifié pendant l’appel est retraduit, pas enregistré', async () => {
    const t = convexTest(schema, modules);
    const pub = await seedPublication(t);
    await approve(t, pub);
    const [row] = (await rowsOf(t, 'publication', pub)).filter(
      (r) => r.targetLocale === 'en',
    );

    const job = await t.mutation(internal.translationJobs.claimJob, {
      id: row._id,
    });
    expect(job).not.toBeNull();
    // The source changes while the model is translating it.
    await t.run((ctx) =>
      ctx.db.patch(pub, { abstract: 'Un résumé corrigé par l’autrice.' }),
    );
    await t.mutation(internal.translationJobs.finishJob, {
      id: row._id,
      leaseUntil: job!.leaseUntil,
      sourceHash: job!.sourceHash,
      outcome: {
        ok: true,
        fields: { ...job!.fields, title: 'Stale translation' },
        model: 'test',
      },
    });

    const after = await t.run((ctx) => ctx.db.get(row._id));
    expect(after?.status).toBe('pending');
    expect(after?.fields).toBeUndefined();

    // The job starts again, on the current text.
    translatingGateway();
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const done = await t.run((ctx) => ctx.db.get(row._id));
    expect(done?.status).toBe('ready');
    expect(done?.fields?.abstract).toBe(
      '[en] Un résumé corrigé par l’autrice.',
    );
  });

  it('une exécution dont le bail a expiré n’écrit rien', async () => {
    const t = convexTest(schema, modules);
    const pub = await seedPublication(t);
    await approve(t, pub);
    const [row] = (await rowsOf(t, 'publication', pub)).filter(
      (r) => r.targetLocale === 'es',
    );

    const first = await t.mutation(internal.translationJobs.claimJob, {
      id: row._id,
    });
    // While held, nobody else can take it.
    expect(
      await t.mutation(internal.translationJobs.claimJob, { id: row._id }),
    ).toBeNull();

    // The first run never comes back; its lease runs out and the job is
    // taken over.
    vi.advanceTimersByTime(6 * 60 * 1000);
    const second = await t.mutation(internal.translationJobs.claimJob, {
      id: row._id,
    });
    expect(second).not.toBeNull();

    // The first run finally answers: dropped.
    await t.mutation(internal.translationJobs.finishJob, {
      id: row._id,
      leaseUntil: first!.leaseUntil,
      sourceHash: first!.sourceHash,
      outcome: { ok: true, fields: first!.fields, model: 'late' },
    });
    const after = await t.run((ctx) => ctx.db.get(row._id));
    expect(after?.status).toBe('pending');
    expect(after?.leaseUntil).toBe(second!.leaseUntil);
  });

  it('un contenu retiré avant sa traduction n’est pas traduit', async () => {
    const t = convexTest(schema, modules);
    const { fetchMock } = translatingGateway();
    const pub = await seedPublication(t);
    await approve(t, pub);
    // Taken offline before the jobs ran (e.g. an auto-publication reverted).
    await t.run((ctx) => ctx.db.patch(pub, { status: 'pending' }));

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(await rowsOf(t, 'publication', pub)).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('le balayage relance une tâche abandonnée en cours de route', async () => {
    const t = convexTest(schema, modules);
    const pub = await seedPublication(t);
    await approve(t, pub);
    const rows = await rowsOf(t, 'publication', pub);
    // Every run is claimed, then lost (a crash: no answer ever comes).
    for (const r of rows) {
      await t.mutation(internal.translationJobs.claimJob, { id: r._id });
    }
    vi.advanceTimersByTime(6 * 60 * 1000);

    translatingGateway();
    const restarted = await t.mutation(internal.translationJobs.sweep, {});
    expect(restarted).toBe(4);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const done = await rowsOf(t, 'publication', pub);
    expect(done.every((r) => r.status === 'ready')).toBe(true);
  });
});

describe('Tribune — un billet est traduit quand il paraît', () => {
  it('passe par `onPostPublished`, quel que soit le chemin', async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv('AUTH_DEV_OTP', 'true');
    translatingGateway();
    const author = await seedUser(t, 'membre', 'plume@dt.test');
    const postId = await t.run((ctx) =>
      ctx.db.insert('tribunePosts', {
        authorUserId: author.id,
        authorName: 'Plume',
        theme: 'participation',
        format: 'court',
        title: 'Billet TRADUCTION-TEST',
        body: 'Premier paragraphe.\n\nSecond paragraphe.',
        lang: 'fr',
        status: 'pending',
        commentCount: 0,
        createdAt: Date.now(),
      }),
    );

    await t.mutation(internal.communityModeration.devApprovePendingByTitle, {
      marker: 'TRADUCTION-TEST',
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const reading = await t.query(api.translation.getReading, {
      sourceType: 'tribunePost',
      sourceId: postId,
      locale: 'ar',
    });
    expect(reading?.translation?.fields).toEqual({
      title: '[ar] Billet TRADUCTION-TEST',
      body: ['[ar] Premier paragraphe.', '[ar] Second paragraphe.'],
    });
  });
});

describe('Actualités — la traduction comble les vides, jamais plus', () => {
  async function seedNews(t: Ctx) {
    return await t.run((ctx) =>
      ctx.db.insert('contentNews', {
        slug: 'sommet-dakar',
        publishedOn: '2026-10-01',
        title: { fr: 'Sommet de Dakar', en: 'Dakar summit' },
        excerpt: { fr: 'Le réseau se réunit.', en: 'The network meets.' },
        body: {
          fr: ['Premier paragraphe.'],
          en: ['First paragraph, written by hand.'],
        },
        status: 'draft',
        updatedAt: Date.now(),
      }),
    );
  }

  it('traduit les seules langues laissées vides, et les sert au lecteur', async () => {
    const t = convexTest(schema, modules);
    const { calls } = translatingGateway();
    const editor = await seedUser(t, 'editeur');
    const id = await seedNews(t);

    await editor.as.mutation(api.contenus.news.setStatus, {
      id,
      status: 'published',
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    // English was written by hand: never translated.
    expect(calls.map((c) => c.target).sort()).toEqual(['ar', 'es', 'pt']);

    const es = await t.query(api.contenus.news.getPublic, {
      slug: 'sommet-dakar',
      locale: 'es',
    });
    expect(es.article).toMatchObject({
      title: '[es] Sommet de Dakar',
      excerpt: '[es] Le réseau se réunit.',
      body: ['[es] Premier paragraphe.'],
      lang: 'es',
      machineFrom: 'fr',
    });

    const en = await t.query(api.contenus.news.getPublic, {
      slug: 'sommet-dakar',
      locale: 'en',
    });
    expect(en.article).toMatchObject({
      title: 'Dakar summit',
      body: ['First paragraph, written by hand.'],
      lang: 'en',
    });
    expect(en.article?.machineFrom).toBeUndefined();

    const list = await t.query(api.contenus.news.listPublic, { locale: 'pt' });
    expect(list[0]).toMatchObject({
      title: '[pt] Sommet de Dakar',
      machineFrom: 'fr',
    });
  });

  it('une modification de l’article publié est retraduite', async () => {
    const t = convexTest(schema, modules);
    translatingGateway();
    const editor = await seedUser(t, 'editeur');
    const id = await seedNews(t);
    await editor.as.mutation(api.contenus.news.setStatus, {
      id,
      status: 'published',
    });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    await editor.as.mutation(api.contenus.news.save, {
      id,
      title: { fr: 'Sommet de Dakar, édition 2027', en: 'Dakar summit' },
      excerpt: { fr: 'Le réseau se réunit.', en: 'The network meets.' },
      body: {
        fr: ['Premier paragraphe.'],
        en: ['First paragraph, written by hand.'],
      },
      publishedOn: '2026-10-01',
    });
    // Until the new translation is in, the old one is NOT served as current.
    const meanwhile = await t.query(api.contenus.news.getPublic, {
      slug: 'sommet-dakar',
      locale: 'es',
    });
    expect(meanwhile.article?.title).toBe('Sommet de Dakar, édition 2027');
    expect(meanwhile.article?.machineFrom).toBeUndefined();

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const after = await t.query(api.contenus.news.getPublic, {
      slug: 'sommet-dakar',
      locale: 'es',
    });
    expect(after.article?.title).toBe('[es] Sommet de Dakar, édition 2027');
  });
});

describe('Rattrapage de l’existant', () => {
  it('estime d’abord, sans rien écrire ni appeler, puis traduit', async () => {
    const t = convexTest(schema, modules);
    const { fetchMock } = translatingGateway();
    // Published BEFORE translation at publication existed: no rows.
    const pub = await seedPublication(t, {
      status: 'published',
      publishedAt: Date.now(),
      doi: '10.59000/dt.ancien',
    });

    const estimate = await t.mutation(internal.translationJobs.backfill, {
      dryRun: true,
    });
    expect(estimate).toMatchObject({ sources: 1, translations: 4 });
    expect(estimate.sourceChars).toBeGreaterThan(0);
    expect(estimate.estimatedOutputTokens).toBeGreaterThan(0);
    expect(await rowsOf(t, 'publication', pub)).toHaveLength(0);

    await t.mutation(internal.translationJobs.backfill, { dryRun: false });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    const rows = await rowsOf(t, 'publication', pub);
    expect(rows.every((r) => r.status === 'ready')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
