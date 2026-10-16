// @vitest-environment edge-runtime
import { describe, it, expect, afterEach, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { KOHOP_AI_DAILY_CAP } from './lib/kohopSemantic';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// KOHOP batch 5 — the originality INDEX and the three-stage platform check:
// shared runs of words (fingerprints), paragraphs close in meaning (embeddings),
// and the AI's confirmation. The gateway is replaced by a stub that answers
// deterministically; nothing here reaches the network.

type T = ReturnType<typeof newT>;

const drains: (() => Promise<void>)[] = [];
function newT() {
  const t = convexTest(schema, modules);
  drains.push(() => t.finishAllScheduledFunctions(vi.runAllTimers));
  return t;
}
afterEach(async () => {
  vi.useFakeTimers();
  try {
    for (const drain of drains.splice(0)) await drain();
  } finally {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  }
});

const DIMENSIONS = 1536;

/** A paragraph of `n` distinct words, all starting with `tag`. */
const para = (n: number, tag: string) =>
  Array.from({ length: n }, (_, i) => `${tag}${i}`).join(' ');

/** Deterministic embedding: a concept marker decides the direction. */
function embed(text: string): number[] {
  const v = new Array<number>(DIMENSIONS).fill(0);
  const concept = /CONCEPT_([A-Z])/.exec(text)?.[1];
  if (concept) {
    v[concept.charCodeAt(0) - 65] = 1;
    return v;
  }
  // No marker: a direction of its own, spread by the words.
  for (const word of text.split(/\s+/)) {
    let h = 7;
    for (let i = 0; i < word.length; i++)
      h = (h * 31 + word.charCodeAt(i)) >>> 0;
    v[100 + (h % 1000)] += 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

type GatewayStub = {
  embeddingCalls: number;
  confirmationCalls: number;
  failEmbeddings?: boolean;
};

function stubGateway(options: { failEmbeddings?: boolean } = {}): GatewayStub {
  const stub: GatewayStub = {
    embeddingCalls: 0,
    confirmationCalls: 0,
    failEmbeddings: options.failEmbeddings,
  };
  vi.stubEnv('AI_GATEWAY_API_KEY', 'test-key');
  vi.stubGlobal('fetch', async (url: string, init: { body: string }) => {
    const body = JSON.parse(init.body) as {
      input: string[] | { content: { text: string }[] }[];
    };
    if (String(url).endsWith('/v1/embeddings')) {
      stub.embeddingCalls += 1;
      if (stub.failEmbeddings) return new Response('boom', { status: 500 });
      const inputs = body.input as string[];
      return Response.json({
        data: inputs.map((t, index) => ({ index, embedding: embed(t) })),
        usage: { prompt_tokens: 1 },
      });
    }
    stub.confirmationCalls += 1;
    const text = (body.input as { content: { text: string }[] }[])[0].content[0]
      .text;
    const ids = [...text.matchAll(/### PAIR (\d+)/g)].map((m) => Number(m[1]));
    const blocks = text.split('### PAIR ').slice(1);
    const assessments = ids.map((id, i) => ({
      id,
      verdict: blocks[i].includes('CONCEPT_X') ? 'translation' : 'topic_only',
      classification: 'borrowing',
      rationale: 'Stub rationale.',
    }));
    return Response.json({
      output_text: JSON.stringify({ assessments }),
      usage: { input_tokens: 1, output_tokens: 1 },
    });
  });
  return stub;
}

async function member(t: T, email: string) {
  return await t.run((ctx) =>
    ctx.db.insert('users', { role: 'membre', email, name: email }),
  );
}

async function contribution(
  t: T,
  authorId: Id<'users'>,
  body: string,
  over: {
    stage?: 'submitted' | 'published' | 'draft';
    lang?: 'fr' | 'en';
  } = {},
) {
  return await t.run(async (ctx) => {
    const id = await ctx.db.insert('kohopContributions', {
      stage: over.stage ?? 'submitted',
      authorUserId: authorId,
      lang: over.lang ?? 'fr',
      fields: [],
      keywords: [],
      coAuthors: [],
      currentVersion: 1,
      submittedVersion: 1,
      title: 'Titre ' + body.slice(0, 12),
      licence: 'CC BY 4.0',
      priorWorks: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    await ctx.db.insert('kohopVersions', {
      contributionId: id,
      version: 1,
      kind: 'submission',
      title: 'Titre ' + body.slice(0, 12),
      standfirst: 'Un chapô.',
      body,
      links: [],
      wordCount: body.split(/\s+/).length,
      createdBy: authorId,
      createdAt: Date.now(),
    });
    return id;
  });
}

async function publication(
  t: T,
  body: string[],
  over: {
    title?: string;
    status?: 'published' | 'draft';
    lang?: 'fr' | 'en';
  } = {},
) {
  return await t.run((ctx) =>
    ctx.db.insert('publications', {
      title: over.title ?? 'Une publication',
      slug: `pub-${Math.random().toString(36).slice(2)}`,
      type: 'note',
      theme: 'gouvernance',
      region: 'afrique',
      languages: [over.lang ?? 'fr'],
      access: 'open',
      authors: [{ name: 'Auteur' }],
      year: 2025,
      publishedAt: Date.now(),
      abstract: '',
      keypoints: [],
      body,
      doi: '',
      downloads: 0,
      citations: 0,
      status: over.status ?? 'published',
      createdAt: Date.now(),
    }),
  );
}

async function check(
  t: T,
  id: Id<'kohopContributions'>,
): Promise<NonNullable<Awaited<ReturnType<typeof platformReport>>>> {
  await t.action(internal.kohopOriginality.runAll, {
    contributionId: id,
    version: 1,
  });
  const report = await platformReport(t, id);
  expect(report).not.toBeNull();
  return report!;
}

async function platformReport(t: T, id: Id<'kohopContributions'>) {
  return await t.run(async (ctx) => {
    const rows = await ctx.db
      .query('originalityReports')
      .withIndex('by_contribution_and_version', (q) =>
        q.eq('contributionId', id).eq('version', 1),
      )
      .order('desc')
      .take(10);
    return rows.find((r) => r.scope === 'platform') ?? null;
  });
}

const stage = (
  report: { stages?: { stage: string; status: string; error?: string }[] },
  name: string,
) => report.stages?.find((s) => s.stage === name);

describe('Étape 1 — suites de mots, par l’index d’empreintes', () => {
  it('retrouve une reprise dans la bibliothèque, la Tribune, un PDF extrait et une autre contribution', async () => {
    const t = newT();
    const me = await member(t, 'moi@x.org');
    const other = await member(t, 'autre@x.org');
    const shared = (tag: string) => para(40, tag);
    const body = [
      `## Intro\n\n${para(30, 'seul')}`,
      shared('lib'),
      shared('trib'),
      shared('pdf'),
      shared('koh'),
    ].join('\n\n');
    await publication(t, [para(20, 'avant'), shared('lib')], {
      title: 'Rapport phare',
    });
    await t.run(async (ctx) => {
      await ctx.db.insert('tribunePosts', {
        authorUserId: other,
        authorName: 'Autre',
        theme: 'gouvernance',
        format: 'court',
        title: 'Billet de la Tribune',
        body: `${para(10, 'x')}\n\n${shared('trib')}`,
        status: 'published',
        commentCount: 0,
        createdAt: Date.now(),
      });
    });
    const pdfPub = await publication(t, [para(12, 'z')], {
      title: 'Étude en PDF',
    });
    await t.run(async (ctx) => {
      const fileId = await ctx.storage.store(new Blob(['pdf']));
      await ctx.db.insert('documentExtractions', {
        publicationId: pdfPub,
        fileId,
        status: 'ready',
        sourceLocale: 'fr',
        title: 'Étude en PDF (texte extrait)',
        blocks: [{ type: 'paragraph', text: shared('pdf') }],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
    });
    await contribution(
      t,
      other,
      `## A\n\n${shared('koh')}\n\n${para(30, 'q')}`,
      {
        stage: 'published',
      },
    );
    const id = await contribution(t, me, body);

    const report = await check(t, id);
    expect(stage(report, 'words')?.status).toBe('done');
    const bySource = new Map(
      report.matches
        .filter((m) => m.method === 'words')
        .map((m) => [m.sourceType, m.sourceTitle]),
    );
    expect(bySource.get('publication')).toBe('Rapport phare');
    expect(bySource.get('tribune')).toBe('Billet de la Tribune');
    expect(bySource.get('document')).toBe('Étude en PDF (texte extrait)');
    expect(bySource.get('kohop')).toContain('Titre');
    for (const m of report.matches) expect(m.classification).toBe('borrowing');
  });

  it('ne compare jamais une contribution avec ses propres versions', async () => {
    const t = newT();
    const me = await member(t, 'moi@x.org');
    const id = await contribution(t, me, `## A\n\n${para(60, 'mien')}`);
    // A later version of the same contribution is indexed too, then checked.
    await t.run(async (ctx) => {
      await ctx.db.patch(id, { currentVersion: 2, submittedVersion: 2 });
      await ctx.db.insert('kohopVersions', {
        contributionId: id,
        version: 2,
        kind: 'revision',
        title: 'Titre',
        standfirst: 'Un chapô.',
        body: `## A\n\n${para(60, 'mien')}`,
        links: [],
        wordCount: 60,
        createdBy: me,
        createdAt: Date.now(),
      });
    });
    await t.action(internal.kohopOriginality.runAll, {
      contributionId: id,
      version: 2,
    });
    const rows = await t.run((ctx) =>
      ctx.db.query('originalityReports').collect(),
    );
    const platform = rows.find((r) => r.scope === 'platform')!;
    expect(platform.matches).toEqual([]);
    expect(stage(platform, 'words')?.status).toBe('done');
  });

  it('une contribution refusée, retirée ou en brouillon ne fait pas partie du corpus', async () => {
    const t = newT();
    const me = await member(t, 'moi@x.org');
    const other = await member(t, 'autre@x.org');
    const copy = para(60, 'copie');
    await contribution(t, other, `## A\n\n${copy}`, { stage: 'draft' });
    await publication(t, [copy], { status: 'draft' });
    const id = await contribution(t, me, `## A\n\n${copy}`);
    const report = await check(t, id);
    expect(report.matches).toEqual([]);
  });

  it('indexe de nouveau seulement ce qui a changé, et oublie ce qui a quitté le corpus', async () => {
    const t = newT();
    await member(t, 'moi@x.org');
    const pub = await publication(t, [para(80, 'idx')]);
    const run = async () => {
      let finished = false;
      for (let i = 0; i < 4 && !finished; i++) {
        ({ finished } = await t.mutation(internal.kohopIndex.indexBatch, {
          kind: 'publication',
        }));
      }
    };
    await run();
    const count = () =>
      t.run(async (ctx) => ({
        sources: (await ctx.db.query('textSources').collect()).length,
        prints: (await ctx.db.query('textFingerprints').collect()).length,
        passages: (await ctx.db.query('textPassages').collect()).length,
      }));
    const first = await count();
    expect(first.sources).toBe(1);
    expect(first.prints).toBeGreaterThan(0);
    expect(first.passages).toBeGreaterThan(0);
    const stamp = await t.run(
      async (ctx) => (await ctx.db.query('textSources').first())!.indexedAt,
    );
    await run();
    expect(await count()).toEqual(first);
    expect(
      await t.run(
        async (ctx) => (await ctx.db.query('textSources').first())!.indexedAt,
      ),
    ).toBe(stamp);
    // The publication goes back to draft: the sweep drops it.
    await t.run((ctx) => ctx.db.patch(pub, { status: 'draft' }));
    for (let i = 0; i < 3; i++)
      await t.mutation(internal.kohopIndex.pruneBatch, {});
    expect(await count()).toEqual({ sources: 0, prints: 0, passages: 0 });
  });
});

describe('Étape 2 et 3 — le sens, dans toutes les langues, puis l’avis de l’IA', () => {
  it('rapproche un paragraphe traduit, le marque d’une langue à l’autre et garde l’avis de l’IA à côté', async () => {
    const stub = stubGateway();
    const t = newT();
    const me = await member(t, 'moi@x.org');
    await publication(
      t,
      [`CONCEPT_X ${para(40, 'english')}`, `CONCEPT_Y ${para(40, 'other')}`],
      { title: 'English paper', lang: 'en' },
    );
    const id = await contribution(
      t,
      me,
      `## Intro\n\nCONCEPT_X ${para(40, 'francais')}\n\n${para(40, 'neuf')}`,
    );
    const report = await check(t, id);
    expect(stage(report, 'semantic')?.status).toBe('done');
    expect(stage(report, 'ai')?.status).toBe('done');
    const semantic = report.matches.filter((m) => m.method === 'semantic');
    expect(semantic).toHaveLength(1);
    expect(semantic[0].sourceTitle).toBe('English paper');
    expect(semantic[0].crossLanguage).toBe(true);
    expect(semantic[0].similarity).toBeGreaterThan(0.99);
    expect(semantic[0].aiVerdict).toBe('translation');
    expect(semantic[0].aiRationale).toBe('Stub rationale.');
    expect(report.model).toBeDefined();
    expect(stub.confirmationCalls).toBe(1);
    // A paragraph with another subject is NOT a candidate.
    expect(report.matches.some((m) => m.passage.includes('neuf'))).toBe(false);
  });

  it('une reprise de mots est aussi confirmée par l’IA, sans que sa classe de règles change', async () => {
    stubGateway();
    const t = newT();
    const me = await member(t, 'moi@x.org');
    const copy = `CONCEPT_X ${para(50, 'mot')}`;
    await publication(t, [copy]);
    const id = await contribution(t, me, `## A\n\n${copy}`);
    const report = await check(t, id);
    const words = report.matches.filter((m) => m.method === 'words');
    expect(words.length).toBeGreaterThan(0);
    expect(words[0].classification).toBe('borrowing');
    expect(words[0].aiVerdict).toBeDefined();
  });

  it('sans passerelle : les étapes de sens et d’IA sont « indisponibles », jamais « rien à signaler » ; les chefs sont prévenus', async () => {
    const t = newT();
    const me = await member(t, 'moi@x.org');
    await t.run((ctx) =>
      ctx.db.insert('users', {
        role: 'moderateur',
        email: 'chef@x.org',
        name: 'Chef',
        reviewChief: true,
      }),
    );
    await publication(t, [para(50, 'mot')]);
    const id = await contribution(t, me, `## A\n\n${para(50, 'mot')}`);
    const report = await check(t, id);
    expect(report.status).toBe('done');
    expect(stage(report, 'words')?.status).toBe('done');
    expect(stage(report, 'semantic')?.status).toBe('unavailable');
    expect(stage(report, 'ai')?.status).toBe('unavailable');
    expect(report.summary).toContain('semantic: unavailable');
    const notes = await t.run((ctx) => ctx.db.query('notifications').collect());
    expect(notes.map((n) => n.titleKey)).toContain('kohopOriginalityFailed');
    expect(notes.map((n) => n.titleKey)).toContain('kohopOriginalityReady');
  });

  it('une panne de la passerelle marque l’étape en échec', async () => {
    stubGateway({ failEmbeddings: true });
    const t = newT();
    const me = await member(t, 'moi@x.org');
    await publication(t, [`CONCEPT_X ${para(40, 'a')}`]);
    const id = await contribution(t, me, `## A\n\nCONCEPT_X ${para(40, 'b')}`);
    const report = await check(t, id);
    expect(stage(report, 'semantic')?.status).toBe('failed');
    expect(stage(report, 'semantic')?.error).toBeDefined();
    expect(report.matches.filter((m) => m.method === 'semantic')).toEqual([]);
  });

  it('le plafond quotidien d’appels est respecté : l’étape échoue, rien n’est appelé', async () => {
    const stub = stubGateway();
    const t = newT();
    const me = await member(t, 'moi@x.org');
    await publication(t, [`CONCEPT_X ${para(40, 'a')}`]);
    // A first check embeds the corpus; then the day's calls run out.
    await check(t, await contribution(t, me, `## A\n\n${para(40, 'zz')}`));
    const before = stub.embeddingCalls;
    await t.run(async (ctx) => {
      const row = (await ctx.db.query('kohopAiUsage').first())!;
      await ctx.db.patch(row._id, { calls: KOHOP_AI_DAILY_CAP });
    });
    const id = await contribution(t, me, `## A\n\nCONCEPT_X ${para(40, 'b')}`);
    const report = await check(t, id);
    expect(stage(report, 'semantic')?.status).toBe('failed');
    expect(stage(report, 'semantic')?.error).toBe('DAILY_CAP');
    expect(stub.embeddingCalls).toBe(before);
  });

  it('réserver des appels est atomique et s’arrête au plafond', async () => {
    const t = newT();
    expect(
      await t.mutation(internal.kohopAi.reserveCalls, {
        calls: KOHOP_AI_DAILY_CAP,
      }),
    ).toBe(true);
    expect(await t.mutation(internal.kohopAi.reserveCalls, { calls: 1 })).toBe(
      false,
    );
  });
});

describe('Indexation planifiée et reprise de l’existant', () => {
  it('le cycle indexe par lots, calcule les vecteurs en attente et lance le contrôle des contributions déjà déposées', async () => {
    stubGateway();
    vi.useFakeTimers();
    const t = newT();
    const me = await member(t, 'moi@x.org');
    await publication(t, [`CONCEPT_X ${para(40, 'a')}`]);
    const id = await contribution(t, me, `## A\n\n${para(60, 'dep')}`);
    expect(await platformReport(t, id)).toBeNull();
    await t.action(internal.kohopIndex.cycle, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const passages = await t.run((ctx) =>
      ctx.db.query('textPassages').collect(),
    );
    expect(passages.length).toBeGreaterThan(0);
    expect(passages.every((p) => p.embedding?.length === DIMENSIONS)).toBe(
      true,
    );
    expect(await platformReport(t, id)).not.toBeNull();
  });

  it('le chef peut relancer le contrôle ; l’auteur ne le peut pas', async () => {
    const t = newT();
    const me = await member(t, 'moi@x.org');
    const chefId = await t.run((ctx) =>
      ctx.db.insert('users', {
        role: 'moderateur',
        email: 'chef@x.org',
        name: 'Chef',
        reviewChief: true,
      }),
    );
    const id = await contribution(t, me, `## A\n\n${para(60, 'dep')}`);
    await t.run((ctx) => ctx.db.patch(id, { stage: 'decision' }));
    const chief = t.withIdentity({ subject: `${chefId}|s` });
    await chief.mutation(api.kohopOriginality.requestChecks, {
      contributionId: id,
    });
    await expect(
      t
        .withIdentity({ subject: `${me}|s` })
        .mutation(api.kohopOriginality.requestChecks, { contributionId: id }),
    ).rejects.toThrow();
  });
});
