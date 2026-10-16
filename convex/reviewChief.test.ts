// @vitest-environment edge-runtime
import { describe, it, expect, afterEach, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { reviewChiefRecipients } from './lib/reviewChiefs';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// REVIEW CHIEF FUNCTION (KOHOP, batch 0).
//
// The review chief and the administrator are the only accounts that validate
// a publication in the library (D-7), and the function is granted by an
// administrator on top of a staff rank. Every refusal below must also leave
// the database untouched: a refused decision writes no document, no audit
// line and no notification.

type T = ReturnType<typeof convexTest>;
type Role = 'visiteur' | 'membre' | 'moderateur' | 'editeur' | 'admin';

const drains: (() => Promise<void>)[] = [];
function newConvexTest() {
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
  }
});

async function account(
  t: T,
  role: Role,
  email: string,
  extra: { reviewChief?: boolean; suspendedAt?: number } = {},
) {
  const id = await t.run((ctx) =>
    ctx.db.insert('users', { role, email, ...extra }),
  );
  return { id, as: t.withIdentity({ subject: `${id}|s` }) };
}

async function pending(
  t: T,
  over: Record<string, unknown> = {},
): Promise<Id<'publications'>> {
  const authorUserId = await t.run((ctx) =>
    ctx.db.insert('users', { role: 'membre', email: 'auteur@test.org' }),
  );
  return await t.run((ctx) =>
    ctx.db.insert('publications', {
      title: 'Note sur les budgets participatifs',
      slug: 'budgets-participatifs',
      type: 'note',
      theme: 'transitions',
      region: 'europe',
      languages: ['fr'],
      access: 'open',
      authors: [{ name: 'A. Auteur' }],
      year: 2026,
      publishedAt: 0,
      abstract: 'Un résumé.',
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

async function rejected(t: T): Promise<Id<'publications'>> {
  return await pending(t, { status: 'draft', reviewedAt: Date.now() });
}

const counts = (t: T) =>
  t.run(async (ctx) => ({
    audit: (await ctx.db.query('auditLog').collect()).length,
    notifications: (await ctx.db.query('notifications').collect()).length,
  }));

describe('Fonction « chef de revue » — attribution', () => {
  it('est réservée à l’administrateur', async () => {
    const t = newConvexTest();
    const editor = await account(t, 'editeur', 'e@test.org');
    const moderator = await account(t, 'moderateur', 'm@test.org');

    for (const actor of [editor, moderator]) {
      await expect(
        actor.as.mutation(api.users.setReviewChief, {
          userId: moderator.id,
          value: true,
        }),
      ).rejects.toThrow(/admin/);
    }
    expect((await t.run((ctx) => ctx.db.get(moderator.id)))?.reviewChief).toBe(
      undefined,
    );
  });

  it('est refusée sous le rang modérateur, sans rien écrire', async () => {
    const t = newConvexTest();
    const admin = await account(t, 'admin', 'a@test.org');
    const member = await account(t, 'membre', 'membre@test.org');
    const visitor = await account(t, 'visiteur', 'v@test.org');

    for (const target of [member, visitor]) {
      await expect(
        admin.as.mutation(api.users.setReviewChief, {
          userId: target.id,
          value: true,
        }),
      ).rejects.toThrow('REVIEW_CHIEF_ROLE_TOO_LOW');
      expect((await t.run((ctx) => ctx.db.get(target.id)))?.reviewChief).toBe(
        undefined,
      );
    }
    expect((await counts(t)).audit).toBe(0);
  });

  it('s’accorde et se retire sur un modérateur, avec une trace d’audit chaque fois', async () => {
    const t = newConvexTest();
    const admin = await account(t, 'admin', 'a@test.org');
    const moderator = await account(t, 'moderateur', 'm@test.org');

    expect(
      await admin.as.mutation(api.users.setReviewChief, {
        userId: moderator.id,
        value: true,
      }),
    ).toEqual({ changed: true });
    expect((await t.run((ctx) => ctx.db.get(moderator.id)))?.reviewChief).toBe(
      true,
    );

    expect(
      await admin.as.mutation(api.users.setReviewChief, {
        userId: moderator.id,
        value: false,
      }),
    ).toEqual({ changed: true });
    expect((await t.run((ctx) => ctx.db.get(moderator.id)))?.reviewChief).toBe(
      undefined,
    );

    const audit = await t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(audit.map((a) => a.action)).toEqual([
      'user.review_chief_granted',
      'user.review_chief_revoked',
    ]);
    expect(audit.every((a) => a.actorId === admin.id)).toBe(true);
    expect(audit.every((a) => a.targetId === moderator.id)).toBe(true);
  });

  it('ne change rien et n’écrit rien quand la valeur est déjà celle demandée', async () => {
    const t = newConvexTest();
    const admin = await account(t, 'admin', 'a@test.org');
    const chief = await account(t, 'editeur', 'c@test.org', {
      reviewChief: true,
    });
    const plain = await account(t, 'moderateur', 'p@test.org');

    expect(
      await admin.as.mutation(api.users.setReviewChief, {
        userId: chief.id,
        value: true,
      }),
    ).toEqual({ changed: false });
    expect(
      await admin.as.mutation(api.users.setReviewChief, {
        userId: plain.id,
        value: false,
      }),
    ).toEqual({ changed: false });
    expect((await counts(t)).audit).toBe(0);
  });

  it('se retire dans la même mutation que la rétrogradation sous « modérateur »', async () => {
    const t = newConvexTest();
    const admin = await account(t, 'admin', 'a@test.org');
    const chief = await account(t, 'moderateur', 'c@test.org', {
      reviewChief: true,
    });

    // Staying in the team keeps the function.
    await admin.as.mutation(api.users.setRole, {
      userId: chief.id,
      role: 'editeur',
    });
    expect((await t.run((ctx) => ctx.db.get(chief.id)))?.reviewChief).toBe(
      true,
    );

    // Dropping below `moderateur` withdraws it, and says so in the audit.
    await admin.as.mutation(api.users.setRole, {
      userId: chief.id,
      role: 'membre',
    });
    const after = await t.run((ctx) => ctx.db.get(chief.id));
    expect(after?.role).toBe('membre');
    expect(after?.reviewChief).toBe(undefined);

    const actions = (
      await t.run((ctx) => ctx.db.query('auditLog').collect())
    ).map((a) => a.action);
    expect(actions).toContain('user.role_changed');
    expect(actions).toContain('user.review_chief_revoked');
  });

  it('est exposée par users.current', async () => {
    const t = newConvexTest();
    const chief = await account(t, 'moderateur', 'c@test.org', {
      reviewChief: true,
    });
    const plain = await account(t, 'moderateur', 'p@test.org');
    expect((await chief.as.query(api.users.current, {}))?.reviewChief).toBe(
      true,
    );
    expect((await plain.as.query(api.users.current, {}))?.reviewChief).toBe(
      false,
    );
  });
});

describe('Bibliothèque (D-7) — seuls le chef de revue et l’administrateur décident', () => {
  it('un modérateur et un éditeur sans la fonction ne peuvent ni approuver, ni rejeter, ni rouvrir', async () => {
    const t = newConvexTest();
    const moderator = await account(t, 'moderateur', 'm@test.org');
    const editor = await account(t, 'editeur', 'e@test.org');
    const pendingId = await pending(t);
    const refusedId = await rejected(t);
    const before = await counts(t);

    for (const actor of [moderator, editor]) {
      for (const decision of ['approved', 'rejected'] as const) {
        await expect(
          actor.as.mutation(api.publications.reviewPublication, {
            publicationId: pendingId,
            decision,
          }),
        ).rejects.toThrow(/chef de revue/);
      }
      await expect(
        actor.as.mutation(api.publications.reopenPublicationReview, {
          publicationId: refusedId,
        }),
      ).rejects.toThrow(/chef de revue/);
    }

    // Nothing was written: not the deposit, not the audit, not a notification.
    expect((await t.run((ctx) => ctx.db.get(pendingId)))?.status).toBe(
      'pending',
    );
    expect((await t.run((ctx) => ctx.db.get(refusedId)))?.status).toBe('draft');
    expect(await counts(t)).toEqual(before);
  });

  it('un chef de revue approuve, rejette et rouvre', async () => {
    const t = newConvexTest();
    const chief = await account(t, 'moderateur', 'c@test.org', {
      reviewChief: true,
    });
    const toApprove = await pending(t);
    const toReject = await pending(t, { slug: 'autre' });
    const toReopen = await rejected(t);

    await chief.as.mutation(api.publications.reviewPublication, {
      publicationId: toApprove,
      decision: 'approved',
    });
    await chief.as.mutation(api.publications.reviewPublication, {
      publicationId: toReject,
      decision: 'rejected',
      notes: 'Hors périmètre.',
    });
    await chief.as.mutation(api.publications.reopenPublicationReview, {
      publicationId: toReopen,
    });

    expect((await t.run((ctx) => ctx.db.get(toApprove)))?.status).toBe(
      'published',
    );
    expect((await t.run((ctx) => ctx.db.get(toReject)))?.status).toBe('draft');
    expect((await t.run((ctx) => ctx.db.get(toReopen)))?.status).toBe(
      'pending',
    );
  });

  it('un administrateur décide sans avoir la fonction', async () => {
    const t = newConvexTest();
    const admin = await account(t, 'admin', 'a@test.org');
    const id = await pending(t);
    await admin.as.mutation(api.publications.reviewPublication, {
      publicationId: id,
      decision: 'approved',
    });
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe('published');
  });

  it('un compte qui a gardé le drapeau sous le rang modérateur ne décide pas', async () => {
    // Legacy or hand-edited data: the flag alone is never enough.
    const t = newConvexTest();
    const stale = await account(t, 'membre', 's@test.org', {
      reviewChief: true,
    });
    const id = await pending(t);
    await expect(
      stale.as.mutation(api.publications.reviewPublication, {
        publicationId: id,
        decision: 'approved',
      }),
    ).rejects.toThrow(/chef de revue/);
  });

  it('un chef de revue suspendu est refusé comme tout compte suspendu', async () => {
    const t = newConvexTest();
    const suspended = await account(t, 'moderateur', 'c@test.org', {
      reviewChief: true,
      suspendedAt: Date.now(),
    });
    const id = await pending(t);
    await expect(
      suspended.as.mutation(api.publications.reviewPublication, {
        publicationId: id,
        decision: 'approved',
      }),
    ).rejects.toThrow('ACCOUNT_SUSPENDED');
  });

  it('le rang modérateur garde la remise en file d’une publication automatique', async () => {
    // `revertAutoPublication` stays at `moderateur`: it undoes a decision
    // nobody reviewed, it does not take one.
    const t = newConvexTest();
    const moderator = await account(t, 'moderateur', 'm@test.org');
    const id = await pending(t, {
      status: 'published',
      autoPublished: true,
      reviewedAt: Date.now(),
    });
    await moderator.as.mutation(api.publications.revertAutoPublication, {
      publicationId: id,
    });
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe('pending');
  });
});

describe('A-1 — le contournement de la revue par les pairs (F-43)', () => {
  const OPEN_STAGES = [
    'submitted',
    'in_review',
    'revision',
    'resubmitted',
    'reviewed',
  ] as const;

  it.each(OPEN_STAGES)(
    'un manuscrit à l’étape « %s » ne se publie ni ne se rejette depuis la file, et rien n’est écrit',
    async (stage) => {
      const t = newConvexTest();
      const admin = await account(t, 'admin', 'a@test.org');
      const id = await pending(t, { reviewStage: stage });
      const before = await counts(t);

      for (const decision of ['approved', 'rejected'] as const) {
        await expect(
          admin.as.mutation(api.publications.reviewPublication, {
            publicationId: id,
            decision,
          }),
        ).rejects.toThrow('IN_PEER_REVIEW');
      }

      const pub = await t.run((ctx) => ctx.db.get(id));
      expect(pub?.status).toBe('pending');
      expect(pub?.reviewedAt).toBeUndefined();
      expect(await counts(t)).toEqual(before);
    },
  );

  it('une revue terminée (acceptée ou rejetée) ne bloque plus la file', async () => {
    const t = newConvexTest();
    const admin = await account(t, 'admin', 'a@test.org');
    for (const stage of ['accepted', 'rejected'] as const) {
      const id = await pending(t, { reviewStage: stage, slug: stage });
      await admin.as.mutation(api.publications.reviewPublication, {
        publicationId: id,
        decision: 'approved',
      });
      expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe('published');
    }
  });

  it('l’analyse IA à la demande est refusée sur une revue ouverte, sans rien planifier', async () => {
    const t = newConvexTest();
    const moderator = await account(t, 'moderateur', 'm@test.org');
    const id = await pending(t, { reviewStage: 'in_review' });
    await t.run((ctx) =>
      ctx.db.insert('aiModerationConfig', {
        key: 'default',
        mode: 'assist',
        model: 'anthropic/claude-opus-5',
        autoPublishMinConfidence: 85,
        instructions: '',
        eligibleTypes: [],
        analyzeAttachments: true,
        maxAttachmentMb: 6,
        dailyCallCap: 200,
        version: 1,
        updatedAt: Date.now(),
      }),
    );

    await expect(
      moderator.as.mutation(api.aiModeration.requestReview, {
        publicationId: id,
      }),
    ).rejects.toThrow('IN_PEER_REVIEW');
    const scheduled = await t.run((ctx) =>
      ctx.db.system.query('_scheduled_functions').collect(),
    );
    expect(scheduled).toEqual([]);
  });
});

describe('Notifications de la rédaction', () => {
  it('vont aux chefs de revue et aux administrateurs, pas au reste de l’équipe', async () => {
    const t = newConvexTest();
    const admin = await account(t, 'admin', 'a@test.org');
    const chief = await account(t, 'moderateur', 'c@test.org', {
      reviewChief: true,
    });
    await account(t, 'moderateur', 'p@test.org');
    await account(t, 'editeur', 'e@test.org');
    await account(t, 'membre', 'm@test.org', { reviewChief: true });
    await account(t, 'admin', 'susp@test.org', { suspendedAt: Date.now() });

    const recipients = await t.run((ctx) => reviewChiefRecipients(ctx));
    expect(recipients.map((u) => u._id).sort()).toEqual(
      [admin.id, chief.id].sort(),
    );
  });
});
