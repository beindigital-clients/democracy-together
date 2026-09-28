// @vitest-environment edge-runtime
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { DEFAULT_SETTINGS } from './lib/aiModeration';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// AI-ASSISTED MODERATION — orchestration.
//
// What this file guards, and what pure tests cannot guard: what
// REALLY happens in the database when the model responds — or does not.
//
// The question asked by each test is the same: "does this submission end up online
// when it should not?". Failure paths are therefore deliberately
// overrepresented: that is where an auto-publishing system becomes dangerous,
// not in the nominal case.
//
// The gateway is MOCKED (`fetch` replaced): no network call leaves
// a test, and the model's response becomes an input like any
// other — including when it is absurd.

type Verdict = {
  overall: 'approve' | 'flag' | 'reject';
  confidence: number;
  summary: string;
  findings: {
    ruleKey: string;
    outcome: 'pass' | 'fail' | 'unsure';
    explanation: string;
    quote?: string;
  }[];
};

// Compliant gateway response: the verdict is a JSON string in
// `output_text`, as returned by the `/v1/responses` endpoint.
function gatewayResponse(verdict: Verdict) {
  return new Response(
    JSON.stringify({
      output_text: JSON.stringify(verdict),
      usage: { input_tokens: 1200, output_tokens: 300 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

// The baseline is ALWAYS evaluated: a verdict that ignored it would see its four
// criteria fall back to "undetermined", hence blocking. Tests that want
// a favorable verdict must therefore answer the baseline — which is exactly the
// constraint the system imposes on the model.
const BASELINE_KEYS = [
  'socle:injection',
  'socle:illegal',
  'socle:personal-data',
  'socle:defamation',
];

function cleanVerdict(over: Partial<Verdict> = {}): Verdict {
  return {
    overall: 'approve',
    confidence: 95,
    summary: 'Note sourcée, sans difficulté particulière.',
    findings: BASELINE_KEYS.map((ruleKey) => ({
      ruleKey,
      outcome: 'pass' as const,
      explanation: 'Rien à signaler.',
    })),
    ...over,
  };
}

function mockGateway(verdict: Verdict) {
  const fetchMock = vi.fn(async () => gatewayResponse(verdict));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

type Ctx = ReturnType<typeof convexTest>;

async function seedUser(
  t: Ctx,
  role: 'membre' | 'moderateur' | 'editeur' | 'admin',
) {
  return await t.run((ctx) =>
    ctx.db.insert('users', { email: `${role}@dt.test`, role }),
  );
}

async function seedPending(
  t: Ctx,
  over: Record<string, unknown> = {},
): Promise<Id<'publications'>> {
  const authorUserId = await seedUser(t, 'membre');
  return await t.run((ctx) =>
    ctx.db.insert('publications', {
      title: 'Participation citoyenne et budgets locaux',
      slug: 'participation-budgets',
      type: 'note',
      theme: 'transitions',
      region: 'europe',
      languages: ['fr'],
      access: 'open',
      authors: [{ name: 'A. Auteur' }],
      year: 2026,
      publishedAt: 0,
      abstract: 'Une note sur les budgets participatifs.',
      keypoints: [],
      body: [],
      doi: '',
      downloads: 0,
      citations: 0,
      views: 0,
      status: 'pending',
      authorUserId,
      submittedAt: Date.now(),
      createdAt: Date.now(),
      ...over,
    }),
  );
}

async function setMode(
  t: Ctx,
  over: Partial<typeof DEFAULT_SETTINGS> = {},
): Promise<void> {
  await t.run(async (ctx) => {
    await ctx.db.insert('aiModerationConfig', {
      key: 'default',
      ...DEFAULT_SETTINGS,
      eligibleTypes: ['note', 'rapport'],
      ...over,
      fallbackModel: undefined,
      version: 1,
      updatedAt: Date.now(),
    });
  });
}

async function latestReview(t: Ctx, publicationId: Id<'publications'>) {
  return await t.run((ctx) =>
    ctx.db
      .query('aiModerationReviews')
      .withIndex('by_publication', (q) => q.eq('publicationId', publicationId))
      .order('desc')
      .first(),
  );
}

beforeEach(() => {
  vi.stubEnv('AI_GATEWAY_API_KEY', 'vck_test');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('Auto-publication — le cas nominal', () => {
  it('publie un dépôt conforme, sans relecteur humain, et le dit', async () => {
    const t = convexTest(schema, modules);
    await setMode(t, { mode: 'auto' });
    const pubId = await seedPending(t);
    mockGateway(cleanVerdict());

    await t.action(internal.aiModeration.runReview, { publicationId: pubId });

    const pub = await t.run((ctx) => ctx.db.get(pubId));
    expect(pub?.status).toBe('published');
    expect(pub?.autoPublished).toBe(true);
    // Nobody reviewed: the field designating a reviewer stays EMPTY. It is
    // this emptiness that prevents the screen from attributing the decision to someone.
    expect(pub?.reviewedBy).toBeUndefined();
    expect(pub?.doi).toBe('10.59000/dt.participation-budgets');
    expect(pub?.aiReview?.applied).toBe('published');

    const review = await latestReview(t, pubId);
    expect(review?.verdict).toBe('approve');
    expect(review?.applied).toBe('published');
    expect(review?.promptTokens).toBe(1200);
  });

  it("notifie l'auteur comme le ferait une approbation humaine", async () => {
    const t = convexTest(schema, modules);
    await setMode(t, { mode: 'auto' });
    const pubId = await seedPending(t);
    mockGateway(cleanVerdict());

    await t.action(internal.aiModeration.runReview, { publicationId: pubId });

    const notifs = await t.run((ctx) =>
      ctx.db.query('notifications').collect(),
    );
    expect(notifs.map((n) => n.type)).toContain('publication_published');
  });

  it("journalise la mise en ligne sous une action d'audit distincte", async () => {
    const t = convexTest(schema, modules);
    await setMode(t, { mode: 'auto' });
    const pubId = await seedPending(t);
    mockGateway(cleanVerdict());

    await t.action(internal.aiModeration.runReview, { publicationId: pubId });

    const audit = await t.run((ctx) => ctx.db.query('auditLog').collect());
    // "published by the AI" must be distinguishable from "analyzed": it is the only
    // moment a text appears without a human having read it.
    expect(audit.map((a) => a.action)).toContain('publication.ai_published');
  });
});

describe('Fail-closed — rien ne publie sur un silence', () => {
  it('sans clé de passerelle, le dépôt reste en file et la panne est tracée', async () => {
    const t = convexTest(schema, modules);
    vi.stubEnv('AI_GATEWAY_API_KEY', '');
    await setMode(t, { mode: 'auto' });
    const pubId = await seedPending(t);
    const fetchMock = mockGateway(cleanVerdict());

    await t.action(internal.aiModeration.runReview, { publicationId: pubId });

    expect(fetchMock).not.toHaveBeenCalled();
    const pub = await t.run((ctx) => ctx.db.get(pubId));
    expect(pub?.status).toBe('pending');
    const review = await latestReview(t, pubId);
    expect(review?.verdict).toBe('error');
    expect(review?.applied).toBe('escalated');
    expect(review?.error).toContain('AI_GATEWAY_NOT_CONFIGURED');
  });

  it('une passerelle en erreur HTTP laisse le dépôt en file', async () => {
    const t = convexTest(schema, modules);
    await setMode(t, { mode: 'auto' });
    const pubId = await seedPending(t);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('model not found', { status: 404 })),
    );

    await t.action(internal.aiModeration.runReview, { publicationId: pubId });

    expect((await t.run((ctx) => ctx.db.get(pubId)))?.status).toBe('pending');
    expect((await latestReview(t, pubId))?.error).toContain(
      'AI_GATEWAY_HTTP_ERROR',
    );
  });

  it('une panne ne réveille pas le staff et n’invente aucun signal', async () => {
    const t = convexTest(schema, modules);
    await setMode(t, { mode: 'auto' });
    await seedUser(t, 'moderateur');
    await seedUser(t, 'admin');
    const pubId = await seedPending(t);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('bad gateway', { status: 502 })),
    );

    await t.action(internal.aiModeration.runReview, { publicationId: pubId });

    // Without this guard, a broken gateway would notify every
    // moderator for every submission — the system would turn its
    // unavailability into an editorial alert.
    expect(
      await t.run((ctx) => ctx.db.query('notifications').collect()),
    ).toEqual([]);
    // And the screen does not display "n blocking" for an analysis that did not
    // take place: there is no finding, because none was returned.
    const pub = await t.run((ctx) => ctx.db.get(pubId));
    expect(pub?.aiReview?.blocking).toBe(0);
    expect((await latestReview(t, pubId))?.findings).toEqual([]);
  });

  it('une réponse qui n’est pas un avis laisse le dépôt en file', async () => {
    const t = convexTest(schema, modules);
    await setMode(t, { mode: 'auto' });
    const pubId = await seedPending(t);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ output_text: 'bonjour' }), {
            status: 200,
          }),
      ),
    );

    await t.action(internal.aiModeration.runReview, { publicationId: pubId });

    expect((await t.run((ctx) => ctx.db.get(pubId)))?.status).toBe('pending');
    expect((await latestReview(t, pubId))?.verdict).toBe('error');
  });

  it('le plafond quotidien renvoie en file sans appeler la passerelle', async () => {
    const t = convexTest(schema, modules);
    await setMode(t, { mode: 'auto', dailyCallCap: 1 });
    const first = await seedPending(t);
    const second = await seedPending(t, { slug: 'second' });
    const fetchMock = mockGateway(cleanVerdict());

    await t.action(internal.aiModeration.runReview, { publicationId: first });
    await t.action(internal.aiModeration.runReview, { publicationId: second });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await t.run((ctx) => ctx.db.get(second)))?.status).toBe('pending');
    // The trace exists: a misconfigured cap must show in the log, not
    // translate into a queue that stagnates without explanation.
    expect((await latestReview(t, second))?.error).toBe('DAILY_CAP_REACHED');
  });
});

describe('Signaux — quand le dispositif va chercher un humain', () => {
  it('un signal bloquant retient le dépôt et prévient le staff', async () => {
    const t = convexTest(schema, modules);
    await setMode(t, { mode: 'auto' });
    await seedUser(t, 'moderateur');
    await seedUser(t, 'admin');
    const pubId = await seedPending(t);
    mockGateway(
      cleanVerdict({
        overall: 'flag',
        findings: [
          ...BASELINE_KEYS.filter((k) => k !== 'socle:defamation').map((k) => ({
            ruleKey: k,
            outcome: 'pass' as const,
            explanation: '',
          })),
          {
            ruleKey: 'socle:defamation',
            outcome: 'fail',
            explanation: 'Accusation nominative non sourcée.',
            quote: 'M. X a détourné des fonds.',
          },
        ],
      }),
    );

    await t.action(internal.aiModeration.runReview, { publicationId: pubId });

    const pub = await t.run((ctx) => ctx.db.get(pubId));
    expect(pub?.status).toBe('pending');
    expect(pub?.aiReview?.blocking).toBe(1);

    const notifs = await t.run((ctx) =>
      ctx.db.query('notifications').collect(),
    );
    const alerts = notifs.filter((n) => n.type === 'publication_ai_flagged');
    expect(alerts).toHaveLength(2);
  });

  it('un avertissement retient le dépôt SANS déranger personne', async () => {
    const t = convexTest(schema, modules);
    await setMode(t, { mode: 'auto' });
    await seedUser(t, 'moderateur');
    const ruleId = await t.run((ctx) =>
      ctx.db.insert('aiModerationRules', {
        label: 'Sources vérifiables',
        description: 'Le document cite-t-il ses sources de façon vérifiable ?',
        severity: 'warning',
        enabled: true,
        order: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    const pubId = await seedPending(t);
    mockGateway(
      cleanVerdict({
        findings: [
          ...BASELINE_KEYS.map((k) => ({
            ruleKey: k,
            outcome: 'pass' as const,
            explanation: '',
          })),
          {
            ruleKey: ruleId,
            outcome: 'fail',
            explanation: 'Aucune référence.',
          },
        ],
      }),
    );

    await t.action(internal.aiModeration.runReview, { publicationId: pubId });

    expect((await t.run((ctx) => ctx.db.get(pubId)))?.status).toBe('pending');
    expect((await latestReview(t, pubId))?.reason).toBe('warning_signal');
    const notifs = await t.run((ctx) =>
      ctx.db.query('notifications').collect(),
    );
    expect(notifs.filter((n) => n.type === 'publication_ai_flagged')).toEqual(
      [],
    );
  });

  it("un critère désactivé n'est pas soumis au modèle", async () => {
    const t = convexTest(schema, modules);
    await setMode(t, { mode: 'assist' });
    await t.run((ctx) =>
      ctx.db.insert('aiModerationRules', {
        label: 'Critère retiré',
        description: 'Ce critère ne doit pas être évalué.',
        severity: 'blocking',
        enabled: false,
        order: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    const pubId = await seedPending(t);
    const fetchMock = mockGateway(cleanVerdict());

    await t.action(internal.aiModeration.runReview, { publicationId: pubId });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body.instructions).not.toContain('Critère retiré');
    expect(body.instructions).toContain('socle:injection');
  });
});

describe('Modes', () => {
  it("le mode observation analyse, journalise, et n'applique rien", async () => {
    const t = convexTest(schema, modules);
    await setMode(t, { mode: 'shadow' });
    const pubId = await seedPending(t);
    mockGateway(cleanVerdict());

    await t.action(internal.aiModeration.runReview, { publicationId: pubId });

    const pub = await t.run((ctx) => ctx.db.get(pubId));
    expect(pub?.status).toBe('pending');
    // NOTHING reaches the queue: a badge would be enough to steer the
    // moderator's decision, and observation would stop observing. The verdict only exists
    // in the log.
    expect(pub?.aiReview).toBeUndefined();
    expect((await latestReview(t, pubId))?.applied).toBe('shadow');
    expect(
      await t.run((ctx) => ctx.db.query('notifications').collect()),
    ).toEqual([]);
  });

  it("le mode assistance affiche l'avis sans publier", async () => {
    const t = convexTest(schema, modules);
    await setMode(t, { mode: 'assist' });
    const pubId = await seedPending(t);
    mockGateway(cleanVerdict());

    await t.action(internal.aiModeration.runReview, { publicationId: pubId });

    expect((await t.run((ctx) => ctx.db.get(pubId)))?.status).toBe('pending');
    expect((await latestReview(t, pubId))?.reason).toBe('mode_assist');
  });

  it('le mode désactivé n’appelle personne', async () => {
    const t = convexTest(schema, modules);
    await setMode(t, { mode: 'off' });
    const pubId = await seedPending(t);
    const fetchMock = mockGateway(cleanVerdict());

    await t.action(internal.aiModeration.runReview, { publicationId: pubId });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await latestReview(t, pubId)).toBeNull();
  });
});

describe('Concurrence — le serveur décide, et il décide en dernier', () => {
  it("un dépôt tranché pendant l'analyse n'est pas publié", async () => {
    const t = convexTest(schema, modules);
    await setMode(t, { mode: 'auto' });
    const pubId = await seedPending(t);

    // The human decision lands DURING the model call: simulating it in
    // the mocked `fetch` is the only way to get the real order of
    // events — analysis started, human decides, verdict applied.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        await t.run((ctx) =>
          ctx.db.patch(pubId, { status: 'draft', reviewedAt: Date.now() }),
        );
        return gatewayResponse(cleanVerdict());
      }),
    );

    await t.action(internal.aiModeration.runReview, { publicationId: pubId });

    const pub = await t.run((ctx) => ctx.db.get(pubId));
    expect(pub?.status).toBe('draft');
    expect(pub?.autoPublished).toBeUndefined();
    expect((await latestReview(t, pubId))?.applied).toBe('superseded');
  });

  it("un mode éteint pendant l'analyse empêche la publication", async () => {
    const t = convexTest(schema, modules);
    await setMode(t, { mode: 'auto' });
    const pubId = await seedPending(t);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        // The administrator switches the system off: it is the state at the time of
        // PUBLISHING that counts, not the one at the time of requesting.
        await t.run(async (ctx) => {
          const cfg = await ctx.db.query('aiModerationConfig').first();
          if (cfg) await ctx.db.patch(cfg._id, { mode: 'off' });
        });
        return gatewayResponse(cleanVerdict());
      }),
    );

    await t.action(internal.aiModeration.runReview, { publicationId: pubId });

    expect((await t.run((ctx) => ctx.db.get(pubId)))?.status).toBe('pending');
    expect((await latestReview(t, pubId))?.reason).toBe('mode_off');
  });
});

describe('Pièce jointe', () => {
  it('transmet le PDF au modèle quand les réglages le permettent', async () => {
    const t = convexTest(schema, modules);
    await setMode(t, { mode: 'auto', analyzeAttachments: true });
    const fileId = await t.run((ctx) =>
      ctx.storage.store(
        new Blob(['%PDF-1.4 contenu'], { type: 'application/pdf' }),
      ),
    );
    const pubId = await seedPending(t, { fileId, fileName: 'note.pdf' });
    const fetchMock = mockGateway(cleanVerdict());

    await t.action(internal.aiModeration.runReview, { publicationId: pubId });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const parts = body.input[0].content;
    expect(parts.some((p: { type: string }) => p.type === 'input_file')).toBe(
      true,
    );
    expect((await t.run((ctx) => ctx.db.get(pubId)))?.status).toBe('published');
  });

  it("un PDF non transmis interdit l'auto-publication", async () => {
    const t = convexTest(schema, modules);
    // Attachment analysis disabled: the verdict then only covers
    // metadata the author fully controls.
    await setMode(t, { mode: 'auto', analyzeAttachments: false });
    const fileId = await t.run((ctx) =>
      ctx.storage.store(
        new Blob(['%PDF-1.4 contenu'], { type: 'application/pdf' }),
      ),
    );
    const pubId = await seedPending(t, { fileId, fileName: 'note.pdf' });
    mockGateway(cleanVerdict());

    await t.action(internal.aiModeration.runReview, { publicationId: pubId });

    expect((await t.run((ctx) => ctx.db.get(pubId)))?.status).toBe('pending');
    expect((await latestReview(t, pubId))?.reason).toBe('attachment_not_read');
  });

  it('un PDF au-dessus du plafond de taille est laissé de côté', async () => {
    const t = convexTest(schema, modules);
    await setMode(t, {
      mode: 'auto',
      analyzeAttachments: true,
      maxAttachmentMb: 1,
    });
    const fileId = await t.run((ctx) =>
      ctx.storage.store(
        new Blob([new Uint8Array(2 * 1024 * 1024)], {
          type: 'application/pdf',
        }),
      ),
    );
    const pubId = await seedPending(t, { fileId, fileName: 'gros.pdf' });
    const fetchMock = mockGateway(cleanVerdict());

    await t.action(internal.aiModeration.runReview, { publicationId: pubId });

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(
      body.input[0].content.some(
        (p: { type: string }) => p.type === 'input_file',
      ),
    ).toBe(false);
    expect((await t.run((ctx) => ctx.db.get(pubId)))?.status).toBe('pending');
  });
});

describe('Déclenchement à la soumission', () => {
  // `finishAllScheduledFunctions` advances the timers: these two tests
  // drain a QUEUE of scheduled functions (`runAfter(0, …)` puts them there in
  // the "pending" state, not "in progress"), whereas the others call
  // the action directly.
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("une soumission planifie l'analyse quand le dispositif est armé", async () => {
    const t = convexTest(schema, modules);
    await setMode(t, { mode: 'auto' });
    const memberId = await seedUser(t, 'membre');
    mockGateway(cleanVerdict());

    const { id } = await t
      .withIdentity({ subject: `${memberId}|s` })
      .mutation(api.publications.submitPublication, {
        title: 'Budgets participatifs en Europe',
        type: 'note',
        theme: 'transitions',
        region: 'europe',
        languages: ['fr'],
        access: 'open',
        year: 2026,
        authors: [{ name: 'A. Auteur' }],
        abstract: 'Un état des lieux des budgets participatifs en Europe.',
      });

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe('published');
  });

  it('une soumission ne planifie rien quand le dispositif est éteint', async () => {
    const t = convexTest(schema, modules);
    const memberId = await seedUser(t, 'membre');
    const fetchMock = mockGateway(cleanVerdict());

    const { id } = await t
      .withIdentity({ subject: `${memberId}|s` })
      .mutation(api.publications.submitPublication, {
        title: 'Budgets participatifs en Europe',
        type: 'note',
        theme: 'transitions',
        region: 'europe',
        languages: ['fr'],
        access: 'open',
        year: 2026,
        authors: [{ name: 'A. Auteur' }],
        abstract: 'Un état des lieux des budgets participatifs en Europe.',
      });

    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(fetchMock).not.toHaveBeenCalled();
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe('pending');
  });
});

describe('Remise en file d’une publication automatique', () => {
  it('rend le dépôt à la file et efface la trace de décision', async () => {
    const t = convexTest(schema, modules);
    await setMode(t, { mode: 'auto' });
    const modId = await seedUser(t, 'moderateur');
    const pubId = await seedPending(t);
    mockGateway(cleanVerdict());
    await t.action(internal.aiModeration.runReview, { publicationId: pubId });

    await t
      .withIdentity({ subject: `${modId}|s` })
      .mutation(api.publications.revertAutoPublication, {
        publicationId: pubId,
      });

    const pub = await t.run((ctx) => ctx.db.get(pubId));
    expect(pub?.status).toBe('pending');
    expect(pub?.autoPublished).toBe(false);
    // Without this clearing, a `pending` would carry a decision date and would
    // read as a case already decided.
    expect(pub?.reviewedAt).toBeUndefined();

    const audit = await t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(audit.map((a) => a.action)).toContain('publication.ai_reverted');
  });

  it("refuse de dépublier ce qu'un humain a approuvé", async () => {
    const t = convexTest(schema, modules);
    const modId = await seedUser(t, 'moderateur');
    const pubId = await seedPending(t, { status: 'published' });

    await expect(
      t
        .withIdentity({ subject: `${modId}|s` })
        .mutation(api.publications.revertAutoPublication, {
          publicationId: pubId,
        }),
    ).rejects.toThrow('INVALID_TRANSITION');
  });

  it('ne se joue pas deux fois', async () => {
    const t = convexTest(schema, modules);
    await setMode(t, { mode: 'auto' });
    const modId = await seedUser(t, 'moderateur');
    const pubId = await seedPending(t);
    mockGateway(cleanVerdict());
    await t.action(internal.aiModeration.runReview, { publicationId: pubId });

    const asMod = t.withIdentity({ subject: `${modId}|s` });
    await asMod.mutation(api.publications.revertAutoPublication, {
      publicationId: pubId,
    });
    await expect(
      asMod.mutation(api.publications.revertAutoPublication, {
        publicationId: pubId,
      }),
    ).rejects.toThrow('INVALID_TRANSITION');
  });
});

describe('Droits', () => {
  it('les réglages sont réservés à l’administrateur', async () => {
    const t = convexTest(schema, modules);
    const modId = await seedUser(t, 'moderateur');
    const asMod = t.withIdentity({ subject: `${modId}|s` });

    await expect(asMod.query(api.aiModeration.getSettings, {})).rejects.toThrow(
      /admin/,
    );
    await expect(
      asMod.mutation(api.aiModeration.upsertRule, {
        label: 'Critère',
        description: 'Un énoncé suffisamment long.',
        severity: 'warning',
        enabled: true,
      }),
    ).rejects.toThrow(/admin/);
  });

  it("un visiteur ne lit pas l'avis rendu sur un dépôt", async () => {
    const t = convexTest(schema, modules);
    const pubId = await seedPending(t);
    await expect(
      t.query(api.aiModeration.getReview, { publicationId: pubId }),
    ).rejects.toThrow();
  });

  it("l'administrateur règle le dispositif, et le réglage est audité", async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedUser(t, 'admin');
    const asAdmin = t.withIdentity({ subject: `${adminId}|s` });

    const { version } = await asAdmin.mutation(
      api.aiModeration.updateSettings,
      {
        mode: 'auto',
        model: 'anthropic/claude-opus-5',
        autoPublishMinConfidence: 90,
        instructions: 'Ligne éditoriale maison.',
        eligibleTypes: ['note', 'inconnu'],
        analyzeAttachments: true,
        maxAttachmentMb: 6,
        dailyCallCap: 100,
      },
    );
    expect(version).toBe(1);

    const settings = await asAdmin.query(api.aiModeration.getSettings, {});
    // An out-of-vocabulary slug cannot widen the scope.
    expect(settings.settings.eligibleTypes).toEqual(['note']);

    const audit = await t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(audit.map((a) => a.action)).toContain('aiModeration.configured');
  });

  it('borne un seuil de confiance fourni hors des limites', async () => {
    const t = convexTest(schema, modules);
    const adminId = await seedUser(t, 'admin');
    const asAdmin = t.withIdentity({ subject: `${adminId}|s` });

    // A direct call setting 0 would open auto-publication to everything: the
    // bound lives server-side, not in the form.
    await asAdmin.mutation(api.aiModeration.updateSettings, {
      mode: 'auto',
      model: 'anthropic/claude-opus-5',
      autoPublishMinConfidence: 0,
      instructions: '',
      eligibleTypes: [],
      analyzeAttachments: true,
      maxAttachmentMb: 999,
      dailyCallCap: 0,
    });

    const { settings } = await asAdmin.query(api.aiModeration.getSettings, {});
    expect(settings.autoPublishMinConfidence).toBe(50);
    expect(settings.maxAttachmentMb).toBe(20);
    expect(settings.dailyCallCap).toBe(1);
  });

  it("le bouton « analyser » d'un modérateur respecte le mode éteint", async () => {
    const t = convexTest(schema, modules);
    await setMode(t, { mode: 'off' });
    const modId = await seedUser(t, 'moderateur');
    const pubId = await seedPending(t);

    const { scheduled } = await t
      .withIdentity({ subject: `${modId}|s` })
      .mutation(api.aiModeration.requestReview, { publicationId: pubId });
    expect(scheduled).toBe(false);
  });
});

describe('Barème — traçabilité', () => {
  it("la suppression d'un critère ne rend pas illisibles les avis passés", async () => {
    const t = convexTest(schema, modules);
    await setMode(t, { mode: 'assist' });
    const adminId = await seedUser(t, 'admin');
    const asAdmin = t.withIdentity({ subject: `${adminId}|s` });
    const { ruleId } = await asAdmin.mutation(api.aiModeration.upsertRule, {
      label: 'Sources vérifiables',
      description: 'Le document cite-t-il ses sources de façon vérifiable ?',
      severity: 'warning',
      enabled: true,
    });
    const pubId = await seedPending(t);
    mockGateway(
      cleanVerdict({
        overall: 'flag',
        findings: [
          ...BASELINE_KEYS.map((k) => ({
            ruleKey: k,
            outcome: 'pass' as const,
            explanation: '',
          })),
          { ruleKey: ruleId, outcome: 'fail', explanation: 'Aucune source.' },
        ],
      }),
    );
    await t.action(internal.aiModeration.runReview, { publicationId: pubId });

    await asAdmin.mutation(api.aiModeration.deleteRule, { ruleId });

    const review = await latestReview(t, pubId);
    const finding = review?.findings.find((f) => f.ruleKey === ruleId);
    // The label is kept in the verdict: that is why `ruleKey` is a
    // string, and not an identifier that would point into the void.
    expect(finding?.ruleLabel).toBe('Sources vérifiables');
  });
});
