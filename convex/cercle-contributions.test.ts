// @vitest-environment edge-runtime
import { describe, it, expect, afterEach, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { CONTRIBUTION_MAX, validateContributionBody } from './lib/cercle';
import { cercleUserDataModule } from './lib/cercleUserData';

// CERCLE DES AMIS — PRIVATE CONTRIBUTIONS (feature 3).
//
// Server-side access filter: only the Cercle (Amis and members and above)
// reads or writes; a visitor, an anonymous caller and a suspended Ami get a
// refusal, whatever the interface shows. The doors themselves are also in the
// access matrix (`cercle-access.test.ts`).

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

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

type T = ReturnType<typeof newConvexTest>;

async function user(
  t: T,
  email: string,
  over: Record<string, unknown> = {},
): Promise<{ id: Id<'users'>; as: ReturnType<T['withIdentity']> }> {
  const id = await t.run((ctx) =>
    ctx.db.insert('users', { email, role: 'visiteur', ...over }),
  );
  return { id, as: t.withIdentity({ subject: `${id}|s` }) };
}

const ami = (t: T, email = 'ami@example.test', name?: string) =>
  user(t, email, { amiSince: Date.now(), ...(name ? { name } : {}) });

const PAGE = { paginationOpts: { numItems: 20, cursor: null } };

describe('Cercle contributions — rules', () => {
  it('trims and bounds the text', () => {
    expect(validateContributionBody('  assez long pour passer  ')).toEqual({
      ok: true,
      body: 'assez long pour passer',
    });
    expect(validateContributionBody('court')).toEqual({
      ok: false,
      code: 'INVALID_BODY',
    });
    expect(validateContributionBody(' '.repeat(50))).toEqual({
      ok: false,
      code: 'INVALID_BODY',
    });
    expect(validateContributionBody('x'.repeat(CONTRIBUTION_MAX + 1)).ok).toBe(
      false,
    );
    expect(validateContributionBody('x'.repeat(CONTRIBUTION_MAX)).ok).toBe(
      true,
    );
  });
});

describe('Cercle contributions — who may read and write', () => {
  it('refuses a visitor without the status, an anonymous caller and a suspended Ami', async () => {
    const t = newConvexTest();
    const visitor = await user(t, 'v@example.test');
    const suspended = await ami(t, 's@example.test');
    await t.run((ctx) =>
      ctx.db.patch(suspended.id, {
        suspendedAt: Date.now(),
        suspensionReason: 'test',
      }),
    );
    for (const who of [t, visitor.as, suspended.as]) {
      await expect(
        who.mutation(api.cercleContributions.submit, {
          body: 'Une contribution fictive.',
        }),
      ).rejects.toThrow();
      await expect(
        who.query(api.cercleContributions.list, PAGE),
      ).rejects.toThrow();
    }
    expect(
      await t.run((ctx) => ctx.db.query('cercleContributions').collect()),
    ).toHaveLength(0);
  });

  it('an Ami and a member write and read each other, newest first', async () => {
    const t = newConvexTest();
    const a = await ami(t, 'ami@example.test', 'Amie Test');
    const m = await user(t, 'm@example.test', { role: 'membre' });
    await a.as.mutation(api.cercleContributions.submit, {
      body: 'Première contribution de l’Ami.',
    });
    await m.as.mutation(api.cercleContributions.submit, {
      body: 'Contribution du membre, plusieurs lignes.\nDeuxième ligne.',
    });
    // Several submissions by the same person are allowed.
    await a.as.mutation(api.cercleContributions.submit, {
      body: 'Seconde contribution de l’Ami.',
    });

    const asMember = await m.as.query(api.cercleContributions.list, PAGE);
    expect(asMember.page.map((c) => c.body)).toEqual([
      'Seconde contribution de l’Ami.',
      'Contribution du membre, plusieurs lignes.\nDeuxième ligne.',
      'Première contribution de l’Ami.',
    ]);
    expect(asMember.page.map((c) => c.mine)).toEqual([false, true, false]);
    expect(asMember.page[0].authorName).toBe('Amie Test');
    // A member who set no name is shown without one, never by address.
    expect(asMember.page[1].authorName).toBeNull();
    expect(JSON.stringify(asMember)).not.toContain('example.test');

    const asAmi = await a.as.query(api.cercleContributions.list, PAGE);
    expect(asAmi.page).toHaveLength(3);
  });

  it('refuses a text that is too short or too long', async () => {
    const t = newConvexTest();
    const a = await ami(t);
    await expect(
      a.as.mutation(api.cercleContributions.submit, { body: 'ok' }),
    ).rejects.toThrow(/INVALID_BODY/);
    await expect(
      a.as.mutation(api.cercleContributions.submit, {
        body: 'x'.repeat(CONTRIBUTION_MAX + 1),
      }),
    ).rejects.toThrow(/INVALID_BODY/);
  });

  it('is rate limited per account', async () => {
    const t = newConvexTest();
    const a = await ami(t);
    for (let i = 0; i < 20; i++) {
      await a.as.mutation(api.cercleContributions.submit, {
        body: `Contribution numéro ${i} de test.`,
      });
    }
    await expect(
      a.as.mutation(api.cercleContributions.submit, {
        body: 'Une de trop pour la journée.',
      }),
    ).rejects.toThrow(/RATE_LIMITED/);
  });

  it('withdrawing the Ami status, or suspending, closes the reading at once', async () => {
    const t = newConvexTest();
    const a = await ami(t);
    await a.as.mutation(api.cercleContributions.submit, {
      body: 'Une contribution fictive.',
    });
    await t.run((ctx) => ctx.db.patch(a.id, { amiSince: undefined }));
    await expect(
      a.as.query(api.cercleContributions.list, PAGE),
    ).rejects.toThrow();
  });
});

describe('Cercle contributions — taking one down', () => {
  async function setup() {
    const t = newConvexTest();
    const author = await ami(t, 'a@example.test');
    const other = await ami(t, 'o@example.test');
    const mod = await user(t, 'mod@example.test', { role: 'moderateur' });
    const id = await author.as.mutation(api.cercleContributions.submit, {
      body: 'Contribution à retirer.',
    });
    return { t, author, other, mod, id };
  }

  it('the author removes their own: the text is erased and it leaves the list', async () => {
    const { t, author, other, id } = await setup();
    await author.as.mutation(api.cercleContributions.remove, {
      contributionId: id,
    });
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row).toMatchObject({ status: 'removed', body: '' });
    expect(
      (await other.as.query(api.cercleContributions.list, PAGE)).page,
    ).toHaveLength(0);
    // Not audited: it is the author's own gesture.
    const audit = await t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(audit.some((a) => a.action === 'cercle.contribution_removed')).toBe(
      false,
    );
    await expect(
      author.as.mutation(api.cercleContributions.remove, {
        contributionId: id,
      }),
    ).rejects.toThrow(/NOT_FOUND/);
  });

  it('another Ami cannot remove it; a moderator can, and it is audited', async () => {
    const { t, other, mod, id } = await setup();
    await expect(
      other.as.mutation(api.cercleContributions.remove, { contributionId: id }),
    ).rejects.toThrow();
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe('visible');
    await mod.as.mutation(api.cercleContributions.remove, {
      contributionId: id,
    });
    expect((await t.run((ctx) => ctx.db.get(id)))?.status).toBe('removed');
    const audit = await t.run((ctx) => ctx.db.query('auditLog').collect());
    const removal = audit.filter(
      (a) => a.action === 'cercle.contribution_removed',
    );
    expect(removal).toHaveLength(1);
    expect(removal[0]).toMatchObject({ actorId: mod.id, targetId: id });
  });
});

describe('Cercle contributions — account deletion and export', () => {
  it('are deleted with the account and exported to its owner', async () => {
    const t = newConvexTest();
    const a = await ami(t, 'gone@example.test');
    const b = await ami(t, 'stays@example.test');
    await a.as.mutation(api.cercleContributions.submit, {
      body: 'Mes mots, à emporter avec moi.',
    });
    await b.as.mutation(api.cercleContributions.submit, {
      body: 'Les mots de quelqu’un d’autre.',
    });

    const exported = await t.run((ctx) =>
      cercleUserDataModule.export!(ctx, a.id, { email: 'gone@example.test' }),
    );
    expect(exported).toMatchObject({
      contributions: [{ body: 'Mes mots, à emporter avec moi.' }],
    });

    await t.run((ctx) =>
      cercleUserDataModule.delete(ctx, a.id, { email: 'gone@example.test' }),
    );
    const left = await t.run((ctx) =>
      ctx.db.query('cercleContributions').collect(),
    );
    expect(left.map((c) => c.authorUserId)).toEqual([b.id]);
  });
});
