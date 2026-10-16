// @vitest-environment edge-runtime
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { convexTest, type TestConvex } from 'convex-test';
import { ConvexError } from 'convex/values';
import schema from './schema';
import { api, internal } from './_generated/api';
import { DEFAULT_SETTINGS } from './lib/aiModeration';
import { TRIBUNE_BODY } from './lib/validation';
import {
  deleteUserDataCommunaute,
  exportUserDataCommunaute,
} from './communaute';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// PRE-MODERATION OF THE TRIBUNE (F-45), UNIFIED QUEUE AND HISTORY
// (F-49), FOLLOW-UP CONTRIBUTIONS (F-48) — community workstream.
//
// The default mode is PRE-MODERATION for posts: this file configures nothing
// before publishing, and that is precisely what it checks.

type T = TestConvex<typeof schema>;
type As = ReturnType<T['withIdentity']>;

async function user(
  t: T,
  email: string,
  role: 'membre' | 'moderateur' | 'admin' | 'visiteur' = 'membre',
  name?: string,
) {
  const id = await t.run((ctx) =>
    ctx.db.insert('users', { role, email, name }),
  );
  return { id, as: t.withIdentity({ subject: `${id}|s` }) };
}

const POST = {
  theme: 'transitions',
  format: 'court' as const,
  lang: 'fr' as const,
  title: 'Sur les transitions',
  body: 'Une contribution courte mais valable.',
};

const FOND_BODY = 'Une analyse de fond. '.repeat(20);

function code(err: unknown): unknown {
  return err instanceof ConvexError ? err.data : String(err);
}

async function expectCode(p: Promise<unknown>, expected: string) {
  let caught: unknown = null;
  try {
    await p;
  } catch (err) {
    caught = err;
  }
  expect(caught, `attendu : refus ${expected}`).not.toBeNull();
  expect(code(caught)).toBe(expected);
}

async function setup() {
  const t = convexTest(schema, modules);
  const author = await user(t, 'auteur@test.org', 'membre', 'Awa Diop');
  const other = await user(t, 'autre@test.org', 'membre', 'Bakary');
  const mod = await user(t, 'mod@test.org', 'moderateur', 'Modératrice');
  const admin = await user(t, 'admin@test.org', 'admin', 'Admin');
  return { t, author, other, mod, admin };
}

async function approve(
  mod: { as: As },
  targetId: string,
  targetType: 'post' | 'comment' = 'post',
) {
  return await mod.as.mutation(api.communityModeration.decide, {
    targetType,
    targetId,
    decision: 'approve',
  });
}

describe('Modération a priori — un billet soumis attend la décision (F-45)', () => {
  it('le billet en attente est invisible du public et visible de son auteur', async () => {
    const { t, author, other } = await setup();
    const postId = await author.as.mutation(api.tribune.createPost, POST);

    const doc = await t.run((ctx) => ctx.db.get(postId));
    expect(doc?.status).toBe('pending');

    // Public (anonymous): neither in the feed nor on the detail page.
    expect(await t.query(api.tribune.listPosts, {})).toEqual([]);
    expect(await t.query(api.tribune.getPost, { postId })).toBeNull();
    // Another member neither, not even through the author preview.
    expect(await other.as.query(api.tribune.getOwnPost, { postId })).toBeNull();

    // The author sees the state, and rereads their text.
    const mine = await author.as.query(api.tribune.myPosts, {});
    expect(mine.map((p) => [p._id, p.status])).toEqual([[postId, 'pending']]);
    const own = await author.as.query(api.tribune.getOwnPost, { postId });
    expect(own?.body).toBe(POST.body);
    expect(own?.status).toBe('pending');

    // The public counter does not move as long as nothing is online.
    const counter = await t.run((ctx) =>
      ctx.db
        .query('counters')
        .withIndex('by_key', (q) => q.eq('key', 'tribunePosts.published'))
        .unique(),
    );
    expect(counter?.value ?? 0).toBe(0);
  });

  it('seul un modérateur décide ; la validation met le billet en ligne et prévient l’auteur', async () => {
    const { t, author, other } = await setup();
    const postId = await author.as.mutation(api.tribune.createPost, POST);
    const args = {
      targetType: 'post' as const,
      targetId: postId,
      decision: 'approve' as const,
    };
    // Neither the author, nor another member, nor an anonymous user.
    await expect(
      author.as.mutation(api.communityModeration.decide, args),
    ).rejects.toThrow(/rôle « moderateur » requis/);
    await expect(
      other.as.mutation(api.communityModeration.decide, args),
    ).rejects.toThrow(/rôle « moderateur » requis/);
    await expect(
      t.mutation(api.communityModeration.decide, args),
    ).rejects.toThrow();
    // The queue does not open to them either.
    await expect(
      author.as.query(api.communityModeration.listQueue, { tab: 'pending' }),
    ).rejects.toThrow();
    expect((await t.run((ctx) => ctx.db.get(postId)))?.status).toBe('pending');

    const { mod } = await setup_mod(t);
    await approve(mod, postId);
    expect(
      (await t.query(api.tribune.listPosts, {})).map((p) => p._id),
    ).toEqual([postId]);
    expect((await t.query(api.tribune.getPost, { postId }))?.title).toBe(
      POST.title,
    );
    const notifs = await t.run((ctx) =>
      ctx.db
        .query('notifications')
        .withIndex('by_user_and_read', (q) => q.eq('userId', author.id))
        .collect(),
    );
    expect(notifs.map((n) => n.titleKey)).toContain('tribunePostApproved');
    const audit = await t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(audit.map((a) => a.action)).toContain('tribune.approved');
  });

  it('un rejet exige un motif ; l’auteur le lit, corrige, et le billet repart en file', async () => {
    const { t, author, mod } = await setup();
    const postId = await author.as.mutation(api.tribune.createPost, POST);
    await expectCode(
      mod.as.mutation(api.communityModeration.decide, {
        targetType: 'post',
        targetId: postId,
        decision: 'reject',
      }),
      'REASON_REQUIRED',
    );
    await mod.as.mutation(api.communityModeration.decide, {
      targetType: 'post',
      targetId: postId,
      decision: 'reject',
      reason: 'Sources manquantes pour les chiffres cités.',
    });
    const mine = await author.as.query(api.tribune.myPosts, {});
    expect(mine[0].status).toBe('rejected');
    expect(mine[0].rejectionReason).toBe(
      'Sources manquantes pour les chiffres cités.',
    );
    expect(await t.query(api.tribune.getPost, { postId })).toBeNull();

    // A rejected post is not "approved" twice through a transition
    // error: rejecting a rejected post is refused.
    await expectCode(
      mod.as.mutation(api.communityModeration.decide, {
        targetType: 'post',
        targetId: postId,
        decision: 'reject',
        reason: 'Encore.',
      }),
      'INVALID_TRANSITION',
    );

    await author.as.mutation(api.tribune.updatePost, {
      postId,
      title: 'Sur les transitions (sourcé)',
      body: `${POST.body} Source : rapport 2025.`,
    });
    const again = await author.as.query(api.tribune.myPosts, {});
    expect(again[0].status).toBe('pending');
    expect(again[0].rejectionReason).toBeNull();
  });

  it('un autre membre ne modifie pas le billet d’autrui ; un billet en ligne ne se modifie plus', async () => {
    const { author, other, mod } = await setup();
    const postId = await author.as.mutation(api.tribune.createPost, POST);
    await expectCode(
      other.as.mutation(api.tribune.updatePost, {
        postId,
        title: 'Détourné',
        body: POST.body,
      }),
      'NOT_FOUND',
    );
    await approve(mod, postId);
    await expectCode(
      author.as.mutation(api.tribune.updatePost, {
        postId,
        title: 'Après coup',
        body: POST.body,
      }),
      'NOT_EDITABLE',
    );
  });

  it('retirer un billet en ligne exige un motif et tranche ses signalements', async () => {
    const { t, author, other, mod } = await setup();
    const postId = await author.as.mutation(api.tribune.createPost, POST);
    await approve(mod, postId);
    await other.as.mutation(api.tribune.reportContent, {
      targetType: 'post',
      targetId: postId,
      reason: 'Propos injurieux',
    });
    const reported = await mod.as.query(api.communityModeration.listQueue, {
      tab: 'reported',
    });
    expect(reported.map((i) => [i.targetId, i.openReports])).toEqual([
      [postId, 1],
    ]);
    await mod.as.mutation(api.communityModeration.decide, {
      targetType: 'post',
      targetId: postId,
      decision: 'remove',
      reason: 'Attaque personnelle.',
    });
    expect(await t.query(api.tribune.getPost, { postId })).toBeNull();
    expect(
      await mod.as.query(api.communityModeration.listQueue, {
        tab: 'reported',
      }),
    ).toEqual([]);
    expect(
      (
        await mod.as.query(api.communityModeration.listQueue, {
          tab: 'removed',
        })
      ).map((i) => i.targetId),
    ).toEqual([postId]);
  });
});

// Helper: a moderator in an already created environment.
async function setup_mod(t: T) {
  return { mod: await user(t, 'mod2@test.org', 'moderateur', 'Mod 2') };
}

describe('Réglage du mode (administrateur)', () => {
  it('a priori par défaut ; seul l’administrateur passe en a posteriori, et c’est journalisé', async () => {
    const { t, author, mod, admin } = await setup();
    expect(await t.query(api.tribune.moderationPolicy, {})).toEqual({
      postMode: 'a_priori',
      commentMode: 'a_posteriori',
    });
    await expect(
      mod.as.mutation(api.communityModeration.updateSettings, {
        postMode: 'a_posteriori',
        commentMode: 'a_posteriori',
      }),
    ).rejects.toThrow(/rôle « admin » requis/);
    await admin.as.mutation(api.communityModeration.updateSettings, {
      postMode: 'a_posteriori',
      commentMode: 'a_priori',
    });
    const postId = await author.as.mutation(api.tribune.createPost, POST);
    expect((await t.run((ctx) => ctx.db.get(postId)))?.status).toBe(
      'published',
    );
    const audit = await t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(audit.map((a) => a.action)).toContain(
      'tribune.moderation_configured',
    );
  });

  it('commentaires a priori : en attente, hors du fil et du compteur, jusqu’à validation', async () => {
    const { t, author, other, mod, admin } = await setup();
    const postId = await author.as.mutation(api.tribune.createPost, POST);
    await approve(mod, postId);
    await admin.as.mutation(api.communityModeration.updateSettings, {
      postMode: 'a_priori',
      commentMode: 'a_priori',
    });
    const res = await other.as.mutation(api.tribune.addComment, {
      postId,
      body: 'Un commentaire à relire.',
    });
    expect(res.status).toBe('pending');
    const before = await t.query(api.tribune.getPost, { postId });
    expect(before?.comments).toEqual([]);
    expect(before?.commentCount).toBe(0);
    // The post's author is not notified yet.
    const notifsBefore = await t.run((ctx) =>
      ctx.db
        .query('notifications')
        .withIndex('by_user_and_read', (q) => q.eq('userId', author.id))
        .collect(),
    );
    expect(notifsBefore.map((n) => n.titleKey)).not.toContain('tribuneComment');

    const [item] = await mod.as.query(api.communityModeration.listQueue, {
      tab: 'pending',
      targetType: 'comment',
    });
    await approve(mod, item.targetId, 'comment');
    const after = await t.query(api.tribune.getPost, { postId });
    expect(after?.comments.map((c) => c.body)).toEqual([
      'Un commentaire à relire.',
    ]);
    expect(after?.commentCount).toBe(1);
    const notifsAfter = await t.run((ctx) =>
      ctx.db
        .query('notifications')
        .withIndex('by_user_and_read', (q) => q.eq('userId', author.id))
        .collect(),
    );
    expect(notifsAfter.map((n) => n.titleKey)).toContain('tribuneComment');
  });
});

describe('File unifiée — onglets et filtres (F-49)', () => {
  it('liste billets et commentaires en attente, filtre par type, axe et format', async () => {
    const { author, other, mod, admin } = await setup();
    const a = await author.as.mutation(api.tribune.createPost, POST);
    await other.as.mutation(api.tribune.createPost, {
      ...POST,
      theme: 'participation',
      title: 'Sur la participation',
    });
    await approve(mod, a);
    await admin.as.mutation(api.communityModeration.updateSettings, {
      postMode: 'a_priori',
      commentMode: 'a_priori',
    });
    await other.as.mutation(api.tribune.addComment, {
      postId: a,
      body: 'Commentaire en attente.',
    });

    const all = await mod.as.query(api.communityModeration.listQueue, {
      tab: 'pending',
    });
    expect(all.map((i) => i.targetType).sort()).toEqual(['comment', 'post']);
    const posts = await mod.as.query(api.communityModeration.listQueue, {
      tab: 'pending',
      targetType: 'post',
    });
    expect(posts.map((i) => i.title)).toEqual(['Sur la participation']);
    const byTheme = await mod.as.query(api.communityModeration.listQueue, {
      tab: 'pending',
      theme: 'transitions',
    });
    expect(byTheme.map((i) => i.targetType)).toEqual(['comment']);
    const fond = await mod.as.query(api.communityModeration.listQueue, {
      tab: 'pending',
      format: 'fond',
    });
    expect(fond).toEqual([]);
    const validated = await mod.as.query(api.communityModeration.listQueue, {
      tab: 'published',
    });
    expect(validated.map((i) => i.targetId)).toEqual([a]);
    expect(await mod.as.query(api.communityModeration.queueCounts, {})).toEqual(
      { pending: 2, reported: 0 },
    );
  });

  it('classer les signalements laisse le contenu en ligne et l’écrit à l’historique', async () => {
    const { t, author, other, mod } = await setup();
    const postId = await author.as.mutation(api.tribune.createPost, POST);
    await approve(mod, postId);
    await other.as.mutation(api.tribune.reportContent, {
      targetType: 'post',
      targetId: postId,
    });
    const res = await mod.as.mutation(api.communityModeration.dismissReports, {
      targetType: 'post',
      targetId: postId,
    });
    expect(res.dismissed).toBe(1);
    expect(await t.query(api.tribune.getPost, { postId })).not.toBeNull();
    const item = await mod.as.query(api.communityModeration.getItem, {
      targetType: 'post',
      targetId: postId,
    });
    expect(item?.history.map((h) => h.kind)).toEqual([
      'submitted',
      'approved',
      'reported',
      'reports_dismissed',
    ]);
  });
});

// --- AI pre-screening ------------------------------------------------------------

const BASELINE_KEYS = [
  'socle:injection',
  'socle:illegal',
  'socle:personal-data',
  'socle:defamation',
];

function mockGateway(overall: 'approve' | 'flag', blocking = false) {
  const verdict = {
    overall,
    confidence: 95,
    summary: overall === 'approve' ? 'Rien à signaler.' : 'À relire.',
    findings: BASELINE_KEYS.map((ruleKey, i) => ({
      ruleKey,
      outcome: blocking && i === 1 ? ('fail' as const) : ('pass' as const),
      explanation: 'Examen du critère.',
    })),
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            output_text: JSON.stringify(verdict),
            usage: { input_tokens: 100, output_tokens: 50 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
    ),
  );
}

async function setAi(
  t: T,
  mode: 'off' | 'shadow' | 'assist' | 'auto',
  eligibleTypes: string[] = [],
) {
  await t.run((ctx) =>
    ctx.db.insert('aiModerationConfig', {
      key: 'default',
      ...DEFAULT_SETTINGS,
      mode,
      eligibleTypes,
      fallbackModel: undefined,
      version: 3,
      updatedAt: Date.now(),
    }),
  );
}

describe('Pré-tri par l’IA — le modèle propose, un humain décide', () => {
  beforeEach(() => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'vck_test');
    // As in the history tests below: `createPost` schedules its own AI review,
    // and each test runs that review itself, once the gateway is mocked. On a
    // real `setTimeout` the scheduled copy ran after the test, with the key and
    // the mock gone, and logged its failure outside any test. Faking
    // `setTimeout` alone keeps it parked; `Date` stays real.
    vi.useFakeTimers({ toFake: ['setTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('mode assist : l’avis est joint, le billet reste en file', async () => {
    const { t, author, mod } = await setup();
    await setAi(t, 'assist');
    const postId = await author.as.mutation(api.tribune.createPost, POST);
    mockGateway('approve');
    await t.action(internal.communityModeration.runTribuneReview, {
      targetType: 'post',
      targetId: postId,
    });
    const doc = await t.run((ctx) => ctx.db.get(postId));
    expect(doc?.status).toBe('pending');
    expect(doc?.aiReview?.applied).toBe('escalated');
    const [item] = await mod.as.query(api.communityModeration.listQueue, {
      tab: 'pending',
    });
    expect(item.aiReview?.verdict).toBe('approve');
  });

  it('mode auto SANS « tribune » dans le périmètre : la décision reste humaine', async () => {
    const { t, author } = await setup();
    await setAi(t, 'auto', ['note']);
    const postId = await author.as.mutation(api.tribune.createPost, POST);
    mockGateway('approve');
    await t.action(internal.communityModeration.runTribuneReview, {
      targetType: 'post',
      targetId: postId,
    });
    const doc = await t.run((ctx) => ctx.db.get(postId));
    expect(doc?.status).toBe('pending');
    expect(doc?.aiReview?.reason).toBe('type_out_of_scope');
  });

  it('mode auto AVEC « tribune » coché : un avis conforme met en ligne, sans relecteur, et le journalise', async () => {
    const { t, author, mod } = await setup();
    await setAi(t, 'auto', ['tribune']);
    const postId = await author.as.mutation(api.tribune.createPost, POST);
    mockGateway('approve');
    await t.action(internal.communityModeration.runTribuneReview, {
      targetType: 'post',
      targetId: postId,
    });
    const doc = await t.run((ctx) => ctx.db.get(postId));
    expect(doc?.status).toBe('published');
    expect(doc?.autoPublished).toBe(true);
    expect(doc?.moderatedBy).toBeUndefined();
    const item = await mod.as.query(api.communityModeration.getItem, {
      targetType: 'post',
      targetId: postId,
    });
    expect(item?.history.map((h) => h.kind)).toEqual([
      'submitted',
      'ai_review',
      'ai_published',
    ]);
    const audit = await t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(audit.map((a) => a.action)).toContain('tribune.ai_published');
  });

  it('un signal bloquant garde le billet en file et prévient le staff', async () => {
    const { t, author, mod } = await setup();
    await setAi(t, 'auto', ['tribune']);
    const postId = await author.as.mutation(api.tribune.createPost, POST);
    mockGateway('flag', true);
    await t.action(internal.communityModeration.runTribuneReview, {
      targetType: 'post',
      targetId: postId,
    });
    expect((await t.run((ctx) => ctx.db.get(postId)))?.status).toBe('pending');
    const notifs = await t.run((ctx) =>
      ctx.db
        .query('notifications')
        .withIndex('by_user_and_read', (q) => q.eq('userId', mod.id))
        .collect(),
    );
    expect(notifs.map((n) => n.titleKey)).toContain('tribuneAiFlagged');
  });

  it('mode observation : l’avis n’atteint pas le modérateur, l’administrateur le lit', async () => {
    const { t, author, mod, admin } = await setup();
    await setAi(t, 'shadow');
    const postId = await author.as.mutation(api.tribune.createPost, POST);
    mockGateway('approve');
    await t.action(internal.communityModeration.runTribuneReview, {
      targetType: 'post',
      targetId: postId,
    });
    const doc = await t.run((ctx) => ctx.db.get(postId));
    expect(doc?.aiReview).toBeUndefined();
    const forMod = await mod.as.query(api.communityModeration.getItem, {
      targetType: 'post',
      targetId: postId,
    });
    expect(forMod?.history.map((h) => h.kind)).toEqual(['submitted']);
    const forAdmin = await admin.as.query(api.communityModeration.getItem, {
      targetType: 'post',
      targetId: postId,
    });
    expect(forAdmin?.history.map((h) => h.kind)).toEqual([
      'submitted',
      'ai_review',
    ]);
  });

  it('un humain qui a tranché pendant l’analyse l’emporte', async () => {
    const { t, author, mod } = await setup();
    await setAi(t, 'auto', ['tribune']);
    const postId = await author.as.mutation(api.tribune.createPost, POST);
    await mod.as.mutation(api.communityModeration.decide, {
      targetType: 'post',
      targetId: postId,
      decision: 'reject',
      reason: 'Hors sujet.',
    });
    mockGateway('approve');
    await t.action(internal.communityModeration.runTribuneReview, {
      targetType: 'post',
      targetId: postId,
    });
    expect((await t.run((ctx) => ctx.db.get(postId)))?.status).toBe('rejected');
  });
});

describe('Historique complet et ordonné (F-49)', () => {
  beforeEach(() => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'vck_test');
    // `createPost` and `updatePost` schedule their own AI review
    // (`runAfter(0)`), which convex-test fires on a real `setTimeout`: it
    // could land before `getItem` and add a second "ai_review" entry — a
    // race seen in CI. Faking `setTimeout` alone keeps those scheduled runs
    // parked, so the only review is the explicit one below; `Date` stays
    // real, so the timestamps keep their order.
    vi.useFakeTimers({ toFake: ['setTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('soumission, avis IA, rejet, modification, validation, signalement, retrait — avec leurs auteurs', async () => {
    const { t, author, other, mod } = await setup();
    await setAi(t, 'assist');
    const postId = await author.as.mutation(api.tribune.createPost, POST);
    mockGateway('flag');
    await t.action(internal.communityModeration.runTribuneReview, {
      targetType: 'post',
      targetId: postId,
    });
    await mod.as.mutation(api.communityModeration.decide, {
      targetType: 'post',
      targetId: postId,
      decision: 'reject',
      reason: 'À sourcer.',
    });
    await author.as.mutation(api.tribune.updatePost, {
      postId,
      title: POST.title,
      body: `${POST.body} (sourcé)`,
    });
    await approve(mod, postId);
    await other.as.mutation(api.tribune.reportContent, {
      targetType: 'post',
      targetId: postId,
      reason: 'Doute',
    });
    await mod.as.mutation(api.communityModeration.decide, {
      targetType: 'post',
      targetId: postId,
      decision: 'remove',
      reason: 'Signalement fondé.',
    });

    // Non-moderator: no access to the history.
    await expect(
      author.as.query(api.communityModeration.getItem, {
        targetType: 'post',
        targetId: postId,
      }),
    ).rejects.toThrow();

    const item = await mod.as.query(api.communityModeration.getItem, {
      targetType: 'post',
      targetId: postId,
    });
    expect(item?.history.map((h) => [h.kind, h.actorName, h.statusTo])).toEqual(
      [
        ['submitted', 'Awa Diop', 'pending'],
        ['ai_review', null, null],
        ['rejected', 'Modératrice', 'rejected'],
        ['edited', 'Awa Diop', 'pending'],
        ['approved', 'Modératrice', 'published'],
        ['reported', 'Bakary', null],
        ['removed', 'Modératrice', 'removed'],
      ],
    );
    const times = item!.history.map((h) => h.createdAt);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(item?.history[1].ai?.verdict).toBe('flag');
    expect(item?.history[2].reason).toBe('À sourcer.');
    expect(item?.status).toBe('removed');
    expect(item?.rejectionReason).toBe('Signalement fondé.');

    // Each decision is ALSO in the audit log (convex/journal.ts).
    const audit = await t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining([
        'tribune.rejected',
        'tribune.approved',
        'tribune.removed',
      ]),
    );
  });
});

describe('Approfondissement — du billet court à la contribution de fond (F-48)', () => {
  async function published(t: T, author: { as: As }, mod: { as: As }) {
    const postId = await author.as.mutation(api.tribune.createPost, POST);
    await approve(mod, postId);
    return postId;
  }

  it('l’auteur ouvre une contribution de fond liée, modérée, et les deux se renvoient l’une à l’autre', async () => {
    const { t, author, mod } = await setup();
    const parentId = await published(t, author, mod);
    const state = await author.as.query(api.tribune.deepeningState, {
      postId: parentId,
    });
    expect(state.canDeepen).toBe(true);

    const childId = await author.as.mutation(api.tribune.createPost, {
      ...POST,
      // The axis is that of the extended post, whatever is sent.
      theme: 'etat-de-droit',
      format: 'fond',
      title: 'Les transitions, en profondeur',
      body: FOND_BODY,
      parentPostId: parentId,
    });
    const child = await t.run((ctx) => ctx.db.get(childId));
    expect(child?.status).toBe('pending');
    expect(child?.theme).toBe('transitions');
    // Submitted to moderation: nothing public before approval.
    expect(
      (await t.query(api.tribune.getPost, { postId: parentId }))?.deepenings,
    ).toEqual([]);

    await approve(mod, childId);
    const parent = await t.query(api.tribune.getPost, { postId: parentId });
    expect(parent?.deepenings.map((d) => d._id)).toEqual([childId]);
    const fond = await t.query(api.tribune.getPost, { postId: childId });
    expect(fond?.parent?._id).toBe(parentId);
    expect(
      (await t.query(api.tribune.listPosts, {})).find((p) => p._id === childId)
        ?.isDeepening,
    ).toBe(true);
  });

  it('refusé sans invitation, sur un format court, ou sur un billet non publié', async () => {
    const { t, author, other, mod } = await setup();
    const parentId = await published(t, author, mod);
    const deep = {
      ...POST,
      format: 'fond' as const,
      title: 'Prolongement',
      body: FOND_BODY,
      parentPostId: parentId,
    };
    await expectCode(
      other.as.mutation(api.tribune.createPost, deep),
      'NOT_INVITED',
    );
    await expectCode(
      author.as.mutation(api.tribune.createPost, {
        ...deep,
        format: 'court',
      }),
      'DEEPENING_FORMAT',
    );
    const pendingId = await author.as.mutation(api.tribune.createPost, POST);
    await expectCode(
      author.as.mutation(api.tribune.createPost, {
        ...deep,
        parentPostId: pendingId,
      }),
      'NOT_DEEPENABLE',
    );
    // A substantive contribution does not follow up on itself.
    await approve(mod, pendingId);
    const fondId = await author.as.mutation(api.tribune.createPost, {
      ...deep,
      parentPostId: pendingId,
    });
    await approve(mod, fondId);
    await expectCode(
      author.as.mutation(api.tribune.createPost, {
        ...deep,
        parentPostId: fondId,
      }),
      'NOT_DEEPENABLE',
    );
    void t;
  });

  it('un membre invité par l’auteur peut approfondir ; l’auteur du billet est prévenu à la parution', async () => {
    const { t, author, other, mod } = await setup();
    const parentId = await published(t, author, mod);
    await expectCode(
      other.as.mutation(api.tribune.inviteDeepening, {
        postId: parentId,
        email: 'autre@test.org',
      }),
      'NOT_FOUND',
    );
    await author.as.mutation(api.tribune.inviteDeepening, {
      postId: parentId,
      email: 'Autre@Test.org',
    });
    const invites = await other.as.query(api.tribune.myDeepeningInvites, {});
    expect(invites.map((i) => i.postId)).toEqual([parentId]);
    expect(
      (await other.as.query(api.tribune.deepeningState, { postId: parentId }))
        .canDeepen,
    ).toBe(true);
    const childId = await other.as.mutation(api.tribune.createPost, {
      ...POST,
      format: 'fond',
      title: 'Prolongement invité',
      body: FOND_BODY,
      parentPostId: parentId,
    });
    await approve(mod, childId);
    const notifs = await t.run((ctx) =>
      ctx.db
        .query('notifications')
        .withIndex('by_user_and_read', (q) => q.eq('userId', author.id))
        .collect(),
    );
    expect(notifs.map((n) => n.titleKey)).toContain('tribuneDeepened');
  });

  it('proposer sa contribution de fond à la bibliothèque crée un dépôt EN FILE, une seule fois', async () => {
    const { t, author, other, mod } = await setup();
    const fondId = await author.as.mutation(api.tribune.createPost, {
      ...POST,
      format: 'fond',
      body: FOND_BODY,
    });
    await expectCode(
      author.as.mutation(api.tribune.proposeToLibrary, { postId: fondId }),
      'NOT_ELIGIBLE',
    );
    await approve(mod, fondId);
    await expectCode(
      other.as.mutation(api.tribune.proposeToLibrary, { postId: fondId }),
      'NOT_FOUND',
    );
    const pubId = await author.as.mutation(api.tribune.proposeToLibrary, {
      postId: fondId,
    });
    const pub = await t.run((ctx) => ctx.db.get(pubId));
    expect(pub?.status).toBe('pending');
    expect(pub?.title).toBe(POST.title);
    expect(pub?.authorUserId).toBe(author.id);
    await expectCode(
      author.as.mutation(api.tribune.proposeToLibrary, { postId: fondId }),
      'ALREADY_PROPOSED',
    );
    expect(
      (await author.as.query(api.tribune.deepeningState, { postId: fondId }))
        .proposedToLibrary,
    ).toBe(true);
  });
});

describe('Données d’un compte — suppression et export (chantier communauté)', () => {
  it('supprime billets, commentaires, réactions, signalements, notes ; transmet l’espace', async () => {
    const { t, author, other, mod } = await setup();
    const postId = await author.as.mutation(api.tribune.createPost, POST);
    await approve(mod, postId);
    await author.as.mutation(api.tribune.addComment, {
      postId,
      body: 'Mon propre commentaire.',
    });
    const otherPost = await other.as.mutation(api.tribune.createPost, {
      ...POST,
      title: 'Billet de Bakary',
    });
    await approve(mod, otherPost);
    await author.as.mutation(api.tribune.toggleReaction, { postId: otherPost });
    await author.as.mutation(api.tribune.reportContent, {
      targetType: 'post',
      targetId: otherPost,
    });
    const wsId = await author.as.mutation(api.workspaces.createWorkspace, {
      title: 'Espace partagé',
      theme: 'transitions',
      description: 'Un espace de travail commun.',
    });
    await other.as.mutation(api.workspaces.joinWorkspace, {
      workspaceId: wsId,
    });
    await author.as.mutation(api.workspaces.addNote, {
      workspaceId: wsId,
      body: 'Note de l’auteur.',
    });

    const exported = await t.run((ctx) =>
      exportUserDataCommunaute(ctx, author.id),
    );
    expect(exported.tribunePosts.map((p) => p.title)).toEqual([POST.title]);
    expect(exported.tribuneComments).toHaveLength(1);
    expect(exported.workspaces[0].role).toBe('animateur');
    expect(exported.workspaceNotes).toHaveLength(1);

    const report = await t.run((ctx) =>
      deleteUserDataCommunaute(ctx, author.id),
    );
    expect(report.complete).toBe(true);
    expect(report.posts).toBe(1);

    expect(await t.query(api.tribune.getPost, { postId })).toBeNull();
    const ws = await t.run((ctx) => ctx.db.get(wsId));
    expect(ws?.ownerUserId).toBe(other.id);
    const detail = await other.as.query(api.workspaces.getWorkspace, {
      workspaceId: wsId,
    });
    expect(detail?.myRole).toBe('animateur');
    expect(detail?.notes).toEqual([]);
    const remaining = await t.run(async (ctx) => ({
      reactions: await ctx.db.query('tribuneReactions').collect(),
      reports: await ctx.db.query('tribuneReports').collect(),
      comments: await ctx.db.query('tribuneComments').collect(),
    }));
    expect(remaining).toEqual({ reactions: [], reports: [], comments: [] });
    // Moderation acts PERFORMED BY an account remain, anonymized.
    await t.run((ctx) => deleteUserDataCommunaute(ctx, mod.id));
    const acts = await t.run((ctx) =>
      ctx.db
        .query('moderationEvents')
        .withIndex('by_actor', (q) => q.eq('actorId', mod.id))
        .collect(),
    );
    expect(acts).toEqual([]);
    const anonymised = await t.run((ctx) =>
      ctx.db
        .query('moderationEvents')
        .withIndex('by_target', (q) =>
          q.eq('targetType', 'post').eq('targetId', otherPost),
        )
        .collect(),
    );
    expect(anonymised.some((e) => e.kind === 'approved' && !e.actorId)).toBe(
      true,
    );
  });

  it('le dernier membre parti, l’espace disparaît avec ses notes', async () => {
    const t = convexTest(schema, modules);
    const solo = await user(t, 'solo@test.org', 'membre', 'Solo');
    const wsId = await solo.as.mutation(api.workspaces.createWorkspace, {
      title: 'Espace solitaire',
      theme: 'transitions',
      description: 'Personne d’autre ici.',
    });
    await solo.as.mutation(api.workspaces.addNote, {
      workspaceId: wsId,
      body: 'Seule note.',
    });
    const report = await t.run((ctx) => deleteUserDataCommunaute(ctx, solo.id));
    expect(report.workspacesDeleted).toBe(1);
    expect(await t.run((ctx) => ctx.db.get(wsId))).toBeNull();
    expect(
      await t.run((ctx) => ctx.db.query('workspaceNotes').collect()),
    ).toEqual([]);
  });
});

describe('Aide E2E — validation de billets de test (garde AUTH_DEV_OTP)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('refuse hors développement, valide par marqueur en développement', async () => {
    const { t, author } = await setup();
    const postId = await author.as.mutation(api.tribune.createPost, {
      ...POST,
      title: 'E2E marqueur 123456',
    });
    vi.stubEnv('AUTH_DEV_OTP', '');
    await expect(
      t.mutation(internal.communityModeration.devApprovePendingByTitle, {
        marker: 'marqueur 123456',
      }),
    ).rejects.toThrow(/AUTH_DEV_OTP/);
    vi.stubEnv('AUTH_DEV_OTP', 'true');
    const res = await t.mutation(
      internal.communityModeration.devApprovePendingByTitle,
      { marker: 'marqueur 123456' },
    );
    expect(res.approved).toBe(1);
    expect((await t.query(api.tribune.getPost, { postId }))?.title).toBe(
      'E2E marqueur 123456',
    );
  });
});

// Bounds guard: a substantive contribution respects the F-46 bounds.
describe('Approfondissement — bornes du format long (F-46)', () => {
  it('une contribution de fond trop courte est refusée', async () => {
    const { author, mod } = await setup();
    const parentId = await author.as.mutation(api.tribune.createPost, POST);
    await approve(mod, parentId);
    await expectCode(
      author.as.mutation(api.tribune.createPost, {
        ...POST,
        format: 'fond',
        body: 'x'.repeat(TRIBUNE_BODY.fond.min - 1),
        parentPostId: parentId,
      }),
      'INVALID_BODY',
    );
  });
});
