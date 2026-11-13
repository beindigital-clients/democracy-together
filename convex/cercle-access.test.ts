// @vitest-environment edge-runtime
import { describe, it, expect, afterEach, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { ROLE_ORDER, hasCercleAccess, isAmi } from './lib/roles';

// CERCLE DES AMIS — ACCESS MATRIX (visitor / Ami / member / moderator / admin).
//
// The Ami status is a flag, NOT a rank (convex/lib/roles.ts). What these tests
// pin is the promise that follows from it: an Ami sees NOTHING more than a
// visitor in the rest of the platform (not too much), and sees everything the
// Cercle gives them (not too little). Every row of the matrix goes through the
// real public functions with a simulated identity — the guard is the server's.
//
// New Cercle functions join `CERCLE_PROBES` below, so the matrix grows with the
// feature instead of being rewritten.

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

type Persona =
  | 'anonymous'
  | 'visiteur'
  | 'ami'
  | 'membre'
  | 'moderateur'
  | 'editeur'
  | 'admin';

const PERSONAS: Persona[] = [
  'anonymous',
  'visiteur',
  'ami',
  'membre',
  'moderateur',
  'editeur',
  'admin',
];

// The rank an account holds for the PLATFORM. An Ami is a visitor there.
function rankOf(p: Persona): number {
  if (p === 'anonymous' || p === 'ami') return ROLE_ORDER.indexOf('visiteur');
  return ROLE_ORDER.indexOf(p);
}

async function seed(t: ReturnType<typeof newConvexTest>) {
  const ids = {} as Record<Exclude<Persona, 'anonymous'>, Id<'users'>>;
  for (const p of PERSONAS) {
    if (p === 'anonymous') continue;
    ids[p] = await t.run((ctx) =>
      ctx.db.insert('users', {
        email: `${p}@example.test`,
        role: p === 'ami' ? 'visiteur' : p,
        ...(p === 'ami' ? { amiSince: Date.now() } : {}),
      }),
    );
  }
  const as = (p: Persona) =>
    p === 'anonymous' ? t : t.withIdentity({ subject: `${ids[p]}|s` });
  return { ids, as };
}

// A refusal by a GUARD, as opposed to any later failure (bad arguments…).
const GUARD_REFUSAL =
  /Accès refusé|Non authentifié|CERCLE_ACCESS_REQUIRED|ACCOUNT_SUSPENDED/;

async function passesGuard(call: () => Promise<unknown>): Promise<boolean> {
  try {
    await call();
    return true;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const data = (e as { data?: unknown }).data;
    return !GUARD_REFUSAL.test(`${message} ${JSON.stringify(data ?? '')}`);
  }
}

type Probe = {
  name: string;
  // Lowest PLATFORM rank that passes, or `cercle` for the Cercle's own guard.
  min: number | 'cercle';
  call: (
    run: ReturnType<typeof seed> extends Promise<infer S>
      ? S extends { as: (p: Persona) => infer T }
        ? T
        : never
      : never,
  ) => Promise<unknown>;
};

// The platform's rank-guarded doors: one per rank that matters. If an Ami
// passes any of these, the status leaked into the rank ladder.
const PLATFORM_PROBES: Probe[] = [
  {
    name: 'publications.generateUploadUrl (membre)',
    min: ROLE_ORDER.indexOf('membre'),
    call: (c) => c.mutation(api.publications.generateUploadUrl, {}),
  },
  {
    name: 'projects.submitProject (membre)',
    min: ROLE_ORDER.indexOf('membre'),
    call: (c) =>
      c.mutation(api.projects.submitProject, {
        theme: 'inconnu',
        title: 'Titre fictif',
        summary: 'Résumé fictif trop court',
      }),
  },
  {
    name: 'publications.listForReview (moderateur)',
    min: ROLE_ORDER.indexOf('moderateur'),
    call: (c) =>
      c.query(api.publications.listForReview, {
        paginationOpts: { numItems: 5, cursor: null },
      }),
  },
  {
    name: 'newsletter.listCampaigns (editeur)',
    min: ROLE_ORDER.indexOf('editeur'),
    call: (c) => c.query(api.newsletter.listCampaigns, {}),
  },
  {
    name: 'admin.listUsers (admin)',
    min: ROLE_ORDER.indexOf('admin'),
    call: (c) =>
      c.query(api.admin.listUsers, {
        paginationOpts: { numItems: 5, cursor: null },
      }),
  },
];

// The Cercle's own doors. Grows with each Cercle function.
const CERCLE_PROBES: Probe[] = [
  {
    name: 'cercleContributions.list',
    min: 'cercle',
    call: (c) =>
      c.query(api.cercleContributions.list, {
        paginationOpts: { numItems: 5, cursor: null },
      }),
  },
  {
    name: 'cercleContributions.submit',
    min: 'cercle',
    call: (c) =>
      c.mutation(api.cercleContributions.submit, {
        body: 'Une contribution fictive pour la matrice.',
      }),
  },
];

describe('Cercle — pure rules', () => {
  it('isAmi reads the status only, never the rank', () => {
    expect(isAmi({ amiSince: 1 })).toBe(true);
    expect(isAmi({ amiSince: undefined })).toBe(false);
    expect(isAmi({})).toBe(false);
    expect(isAmi({ amiSince: null })).toBe(false);
  });

  it('hasCercleAccess: Ami OR member and above, nobody else', () => {
    expect(hasCercleAccess({ role: 'visiteur' })).toBe(false);
    expect(hasCercleAccess({ role: undefined })).toBe(false);
    expect(hasCercleAccess({ role: 'visiteur', amiSince: 1 })).toBe(true);
    for (const role of ['membre', 'moderateur', 'editeur', 'admin']) {
      expect(hasCercleAccess({ role })).toBe(true);
    }
    // A role outside the hierarchy (legacy data) never opens the space.
    expect(hasCercleAccess({ role: 'super-admin' })).toBe(false);
  });

  it('the status is not a rank: ROLE_ORDER does not contain it', () => {
    expect(ROLE_ORDER).not.toContain('ami');
  });
});

describe('Cercle — platform doors stay shut for an Ami (not too much)', () => {
  for (const probe of PLATFORM_PROBES) {
    it(`${probe.name}: only the required rank passes`, async () => {
      const t = newConvexTest();
      const { as } = await seed(t);
      for (const p of PERSONAS) {
        const passed = await passesGuard(() => probe.call(as(p)));
        const expected =
          rankOf(p) >= (probe.min as number) && p !== 'anonymous';
        expect(passed, `${p} on ${probe.name}`).toBe(expected);
      }
    });
  }

  it('an Ami who is also a member keeps the member rank', async () => {
    const t = newConvexTest();
    const id = await t.run((ctx) =>
      ctx.db.insert('users', {
        email: 'both@example.test',
        role: 'membre',
        amiSince: Date.now(),
      }),
    );
    const me = t.withIdentity({ subject: `${id}|s` });
    expect(
      await passesGuard(() =>
        me.mutation(api.publications.generateUploadUrl, {}),
      ),
    ).toBe(true);
    expect(await me.query(api.cercle.access, {})).toEqual({ level: 'member' });
  });
});

describe('Cercle — what each profile sees of the Cercle', () => {
  it('cercle.access reports none / ami / member per profile', async () => {
    const t = newConvexTest();
    const { as } = await seed(t);
    const expected: Record<Persona, 'none' | 'ami' | 'member'> = {
      anonymous: 'none',
      visiteur: 'none',
      ami: 'ami',
      membre: 'member',
      moderateur: 'member',
      editeur: 'member',
      admin: 'member',
    };
    for (const p of PERSONAS) {
      expect(await as(p).query(api.cercle.access, {}), p).toEqual({
        level: expected[p],
      });
    }
  });

  it('users.current exposes the status without changing the role', async () => {
    const t = newConvexTest();
    const { as } = await seed(t);
    const ami = await as('ami').query(api.users.current, {});
    expect(ami).toMatchObject({
      role: 'visiteur',
      ami: true,
      cercleAccess: true,
    });
    const visitor = await as('visiteur').query(api.users.current, {});
    expect(visitor).toMatchObject({ ami: false, cercleAccess: false });
    expect(await as('anonymous').query(api.users.current, {})).toBeNull();
  });

  for (const probe of CERCLE_PROBES) {
    it(`${probe.name}: open to the Cercle only`, async () => {
      const t = newConvexTest();
      const { as } = await seed(t);
      for (const p of PERSONAS) {
        const passed = await passesGuard(() => probe.call(as(p)));
        const inCercle =
          p === 'ami' || rankOf(p) >= ROLE_ORDER.indexOf('membre');
        expect(passed, `${p} on ${probe.name}`).toBe(inCercle);
      }
    });
  }
});

describe('Cercle — granting and withdrawing the status', () => {
  it('only an administrator grants it; the rank is untouched; audited', async () => {
    const t = newConvexTest();
    const { ids, as } = await seed(t);
    const target = ids.visiteur;

    for (const p of [
      'anonymous',
      'visiteur',
      'ami',
      'membre',
      'moderateur',
      'editeur',
    ] as Persona[]) {
      await expect(
        as(p).mutation(api.users.setAmi, { userId: target, value: true }),
        p,
      ).rejects.toThrow();
    }

    expect(
      await as('admin').mutation(api.users.setAmi, {
        userId: target,
        value: true,
      }),
    ).toEqual({ changed: true });
    const granted = await t.run((ctx) => ctx.db.get(target));
    expect(granted?.role).toBe('visiteur');
    expect(typeof granted?.amiSince).toBe('number');
    expect(granted?.amiGrantedBy).toBe(ids.admin);

    // Idempotent: nothing written the second time.
    expect(
      await as('admin').mutation(api.users.setAmi, {
        userId: target,
        value: true,
      }),
    ).toEqual({ changed: false });

    expect(
      await as('admin').mutation(api.users.setAmi, {
        userId: target,
        value: false,
      }),
    ).toEqual({ changed: true });
    const revoked = await t.run((ctx) => ctx.db.get(target));
    expect(revoked?.amiSince).toBeUndefined();
    expect(revoked?.role).toBe('visiteur');

    const audit = await t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(audit.filter((a) => a.action === 'user.ami_granted')).toHaveLength(
      1,
    );
    expect(audit.filter((a) => a.action === 'user.ami_revoked')).toHaveLength(
      1,
    );
  });

  it('withdrawing the status closes the Cercle but never lowers a member', async () => {
    const t = newConvexTest();
    const { ids, as } = await seed(t);
    await as('admin').mutation(api.users.setAmi, {
      userId: ids.ami,
      value: false,
    });
    expect(await as('ami').query(api.cercle.access, {})).toEqual({
      level: 'none',
    });

    await t.run((ctx) => ctx.db.patch(ids.membre, { amiSince: Date.now() }));
    await as('admin').mutation(api.users.setAmi, {
      userId: ids.membre,
      value: false,
    });
    expect(await as('membre').query(api.cercle.access, {})).toEqual({
      level: 'member',
    });
  });

  it('listUsers shows the status for the administrator', async () => {
    const t = newConvexTest();
    const { ids, as } = await seed(t);
    const page = await as('admin').query(api.admin.listUsers, {
      paginationOpts: { numItems: 20, cursor: null },
    });
    const byId = new Map(page.page.map((u) => [u._id as string, u]));
    expect(byId.get(ids.ami)?.ami).toBe(true);
    expect(byId.get(ids.visiteur)?.ami).toBe(false);
  });
});

describe('Cercle — a suspended Ami is cut off at once', () => {
  it('suspension overrides the status: no access, no Cercle', async () => {
    const t = newConvexTest();
    const { ids, as } = await seed(t);
    await t.run((ctx) =>
      ctx.db.patch(ids.ami, {
        suspendedAt: Date.now(),
        suspensionReason: 'test',
      }),
    );
    // `getCurrentUser` treats a suspended account as a visitor.
    expect(await as('ami').query(api.cercle.access, {})).toEqual({
      level: 'none',
    });
    expect(await as('ami').query(api.users.current, {})).toBeNull();
  });
});
