// @vitest-environment edge-runtime
import { describe, it, expect, afterEach, vi } from 'vitest';
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

// KOHOP batch 7 — external reviewers (one-time link, no account).
//
// The questions each test asks: can the wrong person do it (they must not), and
// does a refusal leave NO trace (no document, no history line, no audit line,
// no notification).

type T = ReturnType<typeof newT>;
type Role = 'visiteur' | 'membre' | 'moderateur' | 'editeur' | 'admin';

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
  }
});

async function account(
  t: T,
  role: Role,
  email: string,
  extra: { name?: string; reviewChief?: boolean } = {},
) {
  const id = await t.run((ctx) =>
    ctx.db.insert('users', {
      role,
      email,
      name: extra.name ?? email,
      ...extra,
    }),
  );
  return { id, as: t.withIdentity({ subject: `${id}|s` }) };
}

async function org(t: T, name: string, websiteUrl?: string) {
  return await t.run((ctx) =>
    ctx.db.insert('organizations', {
      name,
      slug: name.toLowerCase().replace(/\W+/g, '-'),
      country: 'SN',
      region: 'afrique',
      languages: ['fr'],
      themes: [],
      status: 'active',
      websiteUrl,
      createdAt: Date.now(),
    }),
  );
}

async function attach(t: T, userId: Id<'users'>, orgId: Id<'organizations'>) {
  await t.run((ctx) =>
    ctx.db.insert('organizationMemberships', {
      userId,
      orgId,
      orgRole: 'member',
      createdAt: Date.now(),
    }),
  );
}

async function profile(
  t: T,
  userId: Id<'users'>,
  displayName: string,
  over: { listed?: boolean; notReviewer?: boolean } = {},
) {
  await t.run((ctx) =>
    ctx.db.insert('memberProfiles', {
      userId,
      handle: displayName.toLowerCase().replace(/\W+/g, '-'),
      displayName,
      themes: [],
      languages: ['fr'],
      links: [],
      visibility: 'members',
      messagePolicy: 'members',
      mutedNotificationTypes: [],
      messageEmail: false,
      listed: over.listed ?? true,
      notReviewer: over.notReviewer,
      searchText: displayName.toLowerCase(),
      nameKey: displayName.toLowerCase(),
      followerCount: 0,
      followingCount: 0,
      updatedAt: Date.now(),
    }),
  );
}

async function setAccess(
  t: T,
  access: 'pilot' | 'open',
  pilotOrganizations: Id<'organizations'>[] = [],
) {
  await t.run((ctx) =>
    ctx.db.insert('kohopSettings', {
      key: 'default',
      access,
      pilotOrganizations,
      updatedAt: Date.now(),
    }),
  );
}

const words = (n: number) =>
  Array.from({ length: n }, (_, i) => `mot${i % 7}`).join(' ');
const BODY = `## Introduction\n\n${words(300)}\n\n${words(300)}`;
const STANDFIRST =
  'Un chapô de cent caractères au moins, qui résume la contribution en une ou deux phrases claires et utiles au lecteur.';

type Author = Awaited<ReturnType<typeof account>>;

async function draft(author: Author, over: { body?: string } = {}) {
  const id = await author.as.mutation(api.kohop.createDraft, { lang: 'fr' });
  await author.as.mutation(api.kohop.saveDraft, {
    contributionId: id,
    title: 'La participation citoyenne en Afrique de l’Ouest',
    standfirst: STANDFIRST,
    body: over.body ?? BODY,
    lang: 'fr',
    fields: ['citizen-participation'],
    keywords: ['participation', 'budget'],
    coAuthors: [],
    links: [{ label: 'Source', url: 'https://exemple.org/etude' }],
    priorWorks: [],
  });
  return id;
}

const counts = (t: T) =>
  t.run(async (ctx) => ({
    events: (await ctx.db.query('kohopEvents').collect()).length,
    audit: (await ctx.db.query('auditLog').collect()).length,
    notifications: (await ctx.db.query('notifications').collect()).length,
    reviewers: (await ctx.db.query('kohopReviewers').collect()).length,
  }));

const COMMIT = {
  acceptCharter: true,
  acceptAgreement: true,
  declareOriginality: true,
};

// A world: an author in the pilot organization, three directory members, a
// review chief and an administrator.
async function world() {
  const t = newT();
  const pilot = await org(t, 'Institut Pilote', 'https://pilote.org');
  const other = await org(t, 'Autre Institut');
  const author = await account(t, 'membre', 'auteur@pilote.org', {
    name: 'Awa Auteure',
  });
  await attach(t, author.id, pilot);
  await setAccess(t, 'pilot', [pilot]);
  const rev1 = await account(t, 'membre', 'rev1@autre.org', {
    name: 'Rémi Relecteur',
  });
  const rev2 = await account(t, 'membre', 'rev2@autre.org', {
    name: 'Rita Relectrice',
  });
  const rev3 = await account(t, 'membre', 'rev3@autre.org', {
    name: 'Remplaçant Suppléant',
  });
  for (const [u, n] of [
    [rev1, 'Rémi Relecteur'],
    [rev2, 'Rita Relectrice'],
    [rev3, 'Remplaçant Suppléant'],
  ] as const) {
    await attach(t, u.id, other);
    await profile(t, u.id, n);
  }
  const chief = await account(t, 'moderateur', 'chef@dt.org', {
    reviewChief: true,
    name: 'Chef',
  });
  const admin = await account(t, 'admin', 'admin@dt.org', { name: 'Admin' });
  return { t, pilot, other, author, rev1, rev2, rev3, chief, admin };
}

const ANALYSIS = `Cette contribution est claire et bien documentée. ${words(180)}`;
const review = (reviewerId: Id<'kohopReviewers'>) => ({
  reviewerId,
  recommendation: 'favorable' as const,
  analysis: ANALYSIS,
});
const DAY = 24 * 60 * 60 * 1000;
const EXTERNAL = {
  name: 'Ève Externe',
  email: 'eve.externe@univ-externe.org',
  affiliation: 'Université Externe',
  publicUrl: 'https://univ-externe.org/equipe/eve-externe',
  rationale:
    'Spécialiste reconnue des budgets participatifs, sans lien avec moi.',
  declaredRelationship: 'none',
};

async function drain(t: T) {
  vi.useFakeTimers();
  try {
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  } finally {
    vi.useRealTimers();
  }
}

// A file with one external titular, one directory titular and a substitute.
async function withExternal() {
  const w = await world();
  const id = await draft(w.author);
  const ext = await w.author.as.mutation(
    api.kohopExternal.proposeExternalReviewer,
    {
      contributionId: id,
      slot: 'titular',
      ...EXTERNAL,
    },
  );
  const ids = [ext];
  for (const [u, slot] of [
    [w.rev1, 'titular'],
    [w.rev3, 'substitute'],
  ] as const) {
    ids.push(
      await w.author.as.mutation(api.kohop.proposeReviewer, {
        contributionId: id,
        userId: u.id,
        slot,
        declaredRelationship: 'none',
      }),
    );
  }
  await w.author.as.mutation(api.kohop.submit, {
    contributionId: id,
    ...COMMIT,
  });
  await drain(w.t);
  for (const reviewerId of ids) {
    await w.chief.as.mutation(api.kohopChief.approveReviewer, { reviewerId });
  }
  return { ...w, id, ids, ext };
}

// The invitation link "sent" (dev outbox), and the token it carries.
async function linkOf(t: T, email = EXTERNAL.email) {
  const link = await t.query(internal.kohopExternal.devInvitationLink, {
    email,
  });
  return link ? { link, token: link.split('/').pop()! } : null;
}

async function started() {
  vi.stubEnv('AUTH_DEV_OTP', 'true');
  const w = await withExternal();
  await w.chief.as.mutation(api.kohopChief.startReview, {
    contributionId: w.id,
  });
  await drain(w.t);
  const sent = await linkOf(w.t);
  return { ...w, ...sent! };
}

afterEach(() => vi.unstubAllEnvs());

describe('Proposer une personne extérieure', () => {
  it('exige un nom, une adresse, un lien public https et une raison — sans rien écrire sinon', async () => {
    const w = await world();
    const id = await draft(w.author);
    const before = await counts(w.t);
    for (const bad of [
      { name: 'E' },
      { email: 'pas-une-adresse' },
      { publicUrl: 'http://univ-externe.org/eve' },
      { publicUrl: 'javascript:alert(1)' },
      { rationale: 'court' },
    ]) {
      await expect(
        w.author.as.mutation(api.kohopExternal.proposeExternalReviewer, {
          contributionId: id,
          slot: 'titular',
          ...EXTERNAL,
          ...bad,
        }),
      ).rejects.toThrow('INVALID_EXTERNAL');
    }
    expect(await counts(w.t)).toEqual(before);
  });

  it('l’auteur lui-même, un coauteur et un lien déclaré sont refusés avec le message générique', async () => {
    const w = await world();
    const id = await draft(w.author);
    await w.t.run((ctx) =>
      ctx.db.patch(id, {
        coAuthors: [
          { name: 'Co Auteur', affiliation: 'U', email: 'co@univ-externe.org' },
        ],
      }),
    );
    for (const over of [
      { email: 'auteur@pilote.org' },
      { email: 'co@univ-externe.org' },
      { declaredRelationship: 'family' },
    ]) {
      await expect(
        w.author.as.mutation(api.kohopExternal.proposeExternalReviewer, {
          contributionId: id,
          slot: 'titular',
          ...EXTERNAL,
          ...over,
        }),
      ).rejects.toThrow('REVIEWER_NOT_ELIGIBLE');
    }
    expect(
      (await w.t.run((ctx) => ctx.db.query('kohopReviewers').collect())).length,
    ).toBe(0);
  });

  it('une proposition valable : stockée sans e-mail visible de l’auteur, deux fois la même adresse refusée', async () => {
    const w = await world();
    const id = await draft(w.author);
    await w.author.as.mutation(api.kohopExternal.proposeExternalReviewer, {
      contributionId: id,
      slot: 'titular',
      ...EXTERNAL,
    });
    await expect(
      w.author.as.mutation(api.kohopExternal.proposeExternalReviewer, {
        contributionId: id,
        slot: 'substitute',
        ...EXTERNAL,
        email: 'EVE.externe@univ-externe.org',
      }),
    ).rejects.toThrow('REVIEWER_ALREADY_PROPOSED');
    const mine = JSON.stringify(
      await w.author.as.query(api.kohop.getMine, { contributionId: id }),
    );
    expect(mine).not.toContain('eve.externe@');
    expect(mine).toContain('Ève Externe');
    // The chief sees the address, the public link and the reason.
    await w.author.as.mutation(api.kohop.proposeReviewer, {
      contributionId: id,
      userId: w.rev1.id,
      slot: 'titular',
      declaredRelationship: 'none',
    });
    await w.author.as.mutation(api.kohop.submit, {
      contributionId: id,
      ...COMMIT,
    });
    const d = await w.chief.as.query(api.kohopChief.dossier, {
      contributionId: id,
    });
    const row = d.reviewers.find((r) => r.source === 'external');
    expect(row?.email).toBe(EXTERNAL.email);
    expect(row?.publicUrl).toBe(EXTERNAL.publicUrl);
    expect(row?.rationale).toContain('budgets participatifs');
  });
});

describe('Invitation par lien à usage unique', () => {
  it('au lancement : e-mail avec un jeton de 256 bits, seul son SHA-256 est stocké', async () => {
    const w = await started();
    expect(w.token).toMatch(/^[0-9a-f]{64}$/);
    const row = await w.t.run((ctx) => ctx.db.get(w.ext));
    expect(row?.status).toBe('invited');
    expect(row?.inviteTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row?.inviteTokenHash).not.toBe(w.token);
    expect(row?.inviteTokenExpiresAt).toBe(row?.dueAt);
    // The raw token is nowhere in the stored documents.
    const dump = JSON.stringify(
      await w.t.run(async (ctx) => ({
        reviewers: await ctx.db.query('kohopReviewers').collect(),
        audit: await ctx.db.query('auditLog').collect(),
        events: await ctx.db.query('kohopEvents').collect(),
      })),
    );
    expect(dump).not.toContain(w.token);
  });

  it('la page ne montre que le nécessaire, et la même réponse pour tout jeton invalide', async () => {
    const w = await started();
    const ok = await w.t.query(api.kohopExternal.getInvitation, {
      token: w.token,
    });
    expect(ok).toMatchObject({ valid: true });
    expect(JSON.stringify(ok)).not.toContain('@');
    for (const bad of ['', 'abc', 'g'.repeat(64), 'a'.repeat(64)]) {
      expect(
        await w.t.query(api.kohopExternal.getInvitation, { token: bad }),
      ).toEqual({ valid: false });
    }
  });

  it('accepter : compte créé SANS rang, audité « via kohop », jeton consommé, lecture et analyse possibles', async () => {
    const w = await started();
    await expect(
      w.t.mutation(api.kohopExternal.respondExternal, {
        token: w.token,
        email: EXTERNAL.email,
        accept: true,
        hasConflict: false,
      }),
    ).rejects.toThrow('CONSENT_REQUIRED');
    const res = await w.t.mutation(api.kohopExternal.respondExternal, {
      token: w.token,
      email: EXTERNAL.email.toUpperCase(),
      accept: true,
      hasConflict: false,
      consent: true,
    });
    expect(res).toEqual({ ok: true, accepted: true });
    const user = await w.t.run((ctx) =>
      ctx.db
        .query('users')
        .withIndex('email', (q) => q.eq('email', EXTERNAL.email))
        .first(),
    );
    expect(user?.role).toBe('visiteur');
    const audit = await w.t.run((ctx) => ctx.db.query('auditLog').collect());
    const invited = audit.find((a) => a.action === 'user.invited');
    expect(invited?.metadata).toMatchObject({ via: 'kohop', role: 'visiteur' });
    const row = await w.t.run((ctx) => ctx.db.get(w.ext));
    expect(row?.status).toBe('accepted');
    expect(row?.userId).toBe(user?._id);
    expect(row?.inviteTokenHash).toBeUndefined();

    // Single use.
    expect(
      await w.t.mutation(api.kohopExternal.respondExternal, {
        token: w.token,
        email: EXTERNAL.email,
        accept: false,
        hasConflict: false,
      }),
    ).toEqual({ ok: false, accepted: false });

    // The same journey as a member: the visitor reads and hands in an analysis.
    const reviewer = { as: w.t.withIdentity({ subject: `${user!._id}|s` }) };
    const mine = await reviewer.as.query(api.kohopReviews.mine, {});
    expect(mine).toHaveLength(1);
    const a = await reviewer.as.query(api.kohopReviews.assignment, {
      reviewerId: w.ext,
    });
    expect(a?.body).toContain('Introduction');
    await reviewer.as.mutation(api.kohopReviews.saveReview, review(w.ext));
    expect((await w.t.run((ctx) => ctx.db.get(w.ext)))?.status).toBe(
      'submitted',
    );
  });

  it('un compte existant est lié sans changer son rang, et la réponse est identique', async () => {
    vi.stubEnv('AUTH_DEV_OTP', 'true');
    const w = await withExternal();
    const existing = await account(w.t, 'membre', EXTERNAL.email, {
      name: 'Ève Existante',
    });
    await w.chief.as.mutation(api.kohopChief.startReview, {
      contributionId: w.id,
    });
    await drain(w.t);
    const sent = (await linkOf(w.t))!;
    const res = await w.t.mutation(api.kohopExternal.respondExternal, {
      token: sent.token,
      email: EXTERNAL.email,
      accept: true,
      hasConflict: false,
      consent: true,
    });
    expect(res).toEqual({ ok: true, accepted: true });
    const row = await w.t.run((ctx) => ctx.db.get(w.ext));
    expect(row?.userId).toBe(existing.id);
    expect((await w.t.run((ctx) => ctx.db.get(existing.id)))?.role).toBe(
      'membre',
    );
    const created = (
      await w.t.run((ctx) => ctx.db.query('auditLog').collect())
    ).filter((a) => a.action === 'user.invited');
    expect(created).toHaveLength(0);
  });

  it('un jeton expiré ou utilisé avec une autre adresse est refusé, sans rien écrire', async () => {
    const w = await started();
    const before = await counts(w.t);
    expect(
      await w.t.mutation(api.kohopExternal.respondExternal, {
        token: w.token,
        email: 'autre@univ-externe.org',
        accept: true,
        hasConflict: false,
        consent: true,
      }),
    ).toEqual({ ok: false, accepted: false });
    expect(await counts(w.t)).toEqual(before);
    await w.t.run((ctx) =>
      ctx.db.patch(w.ext, { inviteTokenExpiresAt: Date.now() - 1000 }),
    );
    expect(
      await w.t.mutation(api.kohopExternal.respondExternal, {
        token: w.token,
        email: EXTERNAL.email,
        accept: true,
        hasConflict: false,
        consent: true,
      }),
    ).toEqual({ ok: false, accepted: false });
    expect(
      await w.t.query(api.kohopExternal.getInvitation, { token: w.token }),
    ).toEqual({ valid: false });
    const users = await w.t.run((ctx) =>
      ctx.db
        .query('users')
        .withIndex('email', (q) => q.eq('email', EXTERNAL.email))
        .first(),
    );
    expect(users).toBeNull();
  });

  it('un refus sans compte : jeton consommé, le suppléant prend la place', async () => {
    const w = await started();
    await w.t.mutation(api.kohopExternal.respondExternal, {
      token: w.token,
      email: EXTERNAL.email,
      accept: false,
      hasConflict: false,
      suggestedName: 'Quelqu’un d’autre',
    });
    const [ext, , substitute] = await Promise.all(
      w.ids.map((i) => w.t.run((ctx) => ctx.db.get(i))),
    );
    expect(ext?.status).toBe('declined');
    expect(ext?.inviteTokenHash).toBeUndefined();
    expect(substitute?.status).toBe('invited');
    expect(
      await w.t.query(api.kohopExternal.getInvitation, { token: w.token }),
    ).toEqual({ valid: false });
  });

  it('la relance envoie un nouveau lien : l’ancien ne marche plus', async () => {
    const w = await started();
    await w.t.run((ctx) =>
      ctx.db.patch(w.ext, {
        dueAt: Date.now() + 2 * DAY,
        inviteTokenExpiresAt: Date.now() + 2 * DAY,
      }),
    );
    expect(await w.t.mutation(internal.kohopDeadlines.run, {})).toMatchObject({
      reminded: 1,
    });
    await drain(w.t);
    const fresh = (await linkOf(w.t))!;
    expect(fresh.token).not.toBe(w.token);
    expect(
      await w.t.query(api.kohopExternal.getInvitation, { token: w.token }),
    ).toEqual({ valid: false });
    expect(
      await w.t.query(api.kohopExternal.getInvitation, { token: fresh.token }),
    ).toMatchObject({ valid: true });
  });

  it('les tentatives sont limitées par jeton', async () => {
    const w = await started();
    let last = '';
    for (let i = 0; i < 25; i++) {
      try {
        // A failed attempt answers `ok: false` AND counts against the limits.
        const r = await w.t.mutation(api.kohopExternal.respondExternal, {
          token: w.token,
          email: 'autre@univ-externe.org',
          accept: false,
          hasConflict: false,
        });
        expect(r.ok).toBe(false);
      } catch (err) {
        last = String((err as { data?: string }).data ?? err);
      }
    }
    expect(last).toContain('RATE_LIMITED');
  });
});

describe('Purge à six mois', () => {
  it('supprime les invitations extérieures déclinées, expirées ou récusées de plus de six mois — et elles seules', async () => {
    const w = await withExternal();
    const old = Date.now() - 200 * DAY;
    const mk = (
      status: 'declined' | 'expired' | 'recused' | 'submitted',
      source: 'external' | 'directory',
      updatedAt: number,
    ) =>
      w.t.run((ctx) =>
        ctx.db.insert('kohopReviewers', {
          contributionId: w.id,
          slot: 'substitute',
          source,
          name: `P ${status} ${source}`,
          email: `${status}.${source}@x.org`,
          status,
          flags: [],
          remindersSent: 0,
          createdAt: updatedAt,
          updatedAt,
        }),
      );
    const gone = [
      await mk('declined', 'external', old),
      await mk('expired', 'external', old),
      await mk('recused', 'external', old),
    ];
    const youngDeclined = await mk(
      'declined',
      'external',
      Date.now() - 10 * DAY,
    );
    const oldDirectory = await mk('declined', 'directory', old);
    const oldSubmitted = await mk('submitted', 'external', old);
    await w.t.run((ctx) =>
      ctx.db.insert('kohopLinkChecks', {
        contributionId: w.id,
        reviewerId: gone[0],
        level: 'none',
        findings: [],
        origin: 'rules',
        checkedAt: old,
      }),
    );
    expect(await w.t.mutation(internal.kohopExternal.purge, {})).toBe(3);
    for (const id of gone)
      expect(await w.t.run((ctx) => ctx.db.get(id))).toBeNull();
    for (const id of [youngDeclined, oldDirectory, oldSubmitted]) {
      expect(await w.t.run((ctx) => ctx.db.get(id))).not.toBeNull();
    }
    const checks = await w.t.run((ctx) =>
      ctx.db.query('kohopLinkChecks').collect(),
    );
    expect(checks.some((c) => c.reviewerId === gone[0])).toBe(false);
    expect(await w.t.mutation(internal.kohopExternal.purge, {})).toBe(0);
  });
});

describe('Après la parution', () => {
  it('le relecteur sans rang est invité à rejoindre le réseau, pas un membre', async () => {
    const w = await withExternal();
    const visitor = await account(w.t, 'visiteur', EXTERNAL.email, {
      name: 'Ève Externe',
    });
    await w.t.run(async (ctx) => {
      const consent = Date.now();
      await ctx.db.patch(w.ext, {
        userId: visitor.id,
        status: 'submitted',
        publicationConsentAt: consent,
      });
      await ctx.db.patch(w.ids[1], {
        status: 'submitted',
        publicationConsentAt: consent,
      });
    });
    const ctxInfo = await w.t.query(
      internal.kohopEmail.productionEmailContext,
      {
        contributionId: w.id,
        kind: 'publishedReviewer',
      },
    );
    const byEmail = Object.fromEntries(
      ctxInfo.recipients.map((r) => [r.email, r.inviteToJoin]),
    );
    expect(byEmail[EXTERNAL.email]).toBe(true);
    expect(byEmail['rev1@autre.org']).toBe(false);
  });
});
