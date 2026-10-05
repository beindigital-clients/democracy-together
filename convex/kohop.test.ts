// @vitest-environment edge-runtime
import { describe, it, expect, afterEach, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
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

// KOHOP batch 2 — deposit, choice of the reviewers, admissibility.
//
// The questions each test asks: can the wrong person do it (they must not), and
// does a refusal leave NO trace (no document, no history line, no audit line,
// no notification).

type T = ReturnType<typeof convexTest>;
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

// Runs the scheduled functions (e-mails, originality reports) to completion.
async function drain(t: T) {
  vi.useFakeTimers();
  try {
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  } finally {
    vi.useRealTimers();
  }
}

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

describe('Accès pilote (D-15)', () => {
  it('par défaut le dépôt est réservé : aucune organisation n’est listée', async () => {
    const t = newT();
    const author = await account(t, 'membre', 'a@x.org');
    expect(await author.as.query(api.kohop.myAccess, {})).toEqual({
      access: 'pilot',
      canDeposit: false,
    });
    await expect(
      author.as.mutation(api.kohop.createDraft, { lang: 'fr' }),
    ).rejects.toThrow('PILOT_ONLY');
    expect((await counts(t)).events).toBe(0);
  });

  it('un compte d’une organisation listée dépose, pas un autre', async () => {
    const { t, author, rev1 } = await world();
    await expect(
      author.as.mutation(api.kohop.createDraft, { lang: 'fr' }),
    ).resolves.toBeTruthy();
    await expect(
      rev1.as.mutation(api.kohop.createDraft, { lang: 'fr' }),
    ).rejects.toThrow('PILOT_ONLY');
    expect((await rev1.as.query(api.kohop.myAccess, {})).canDeposit).toBe(
      false,
    );
    void t;
  });

  it('en accès ouvert, tout membre dépose ; un visiteur n’a aucun droit', async () => {
    const t = newT();
    await setAccess(t, 'open');
    const member = await account(t, 'membre', 'm@x.org');
    const visitor = await account(t, 'visiteur', 'v@x.org');
    await expect(
      member.as.mutation(api.kohop.createDraft, { lang: 'en' }),
    ).resolves.toBeTruthy();
    await expect(
      visitor.as.mutation(api.kohop.createDraft, { lang: 'en' }),
    ).rejects.toThrow(/membre/);
  });

  it('le réglage est réservé à l’administrateur, même au chef de revue', async () => {
    const { chief, admin, pilot } = await world();
    await expect(
      chief.as.mutation(api.kohopChief.setSettings, {
        access: 'open',
        pilotOrganizations: [],
      }),
    ).rejects.toThrow(/admin/);
    await admin.as.mutation(api.kohopChief.setSettings, {
      access: 'open',
      pilotOrganizations: [pilot],
    });
    expect((await admin.as.query(api.kohopChief.getSettings, {})).access).toBe(
      'open',
    );
  });
});

describe('Le dossier d’un auteur est le sien', () => {
  it('un autre membre le lit comme inexistant et ne peut ni le sauvegarder ni le retirer', async () => {
    const { t, author, rev1 } = await world();
    await setAccessOpen(t);
    const id = await draft(author);
    expect(
      await rev1.as.query(api.kohop.getMine, { contributionId: id }),
    ).toBeNull();
    await expect(
      rev1.as.mutation(api.kohop.saveDraft, {
        contributionId: id,
        title: 'x',
        standfirst: '',
        body: '',
        lang: 'fr',
        fields: [],
        keywords: [],
        coAuthors: [],
        links: [],
        priorWorks: [],
      }),
    ).rejects.toThrow('NOT_FOUND');
    await expect(
      rev1.as.mutation(api.kohop.withdraw, { contributionId: id }),
    ).rejects.toThrow('NOT_FOUND');
    expect(await rev1.as.query(api.kohop.listMine, {})).toEqual([]);
    expect(
      (await author.as.query(api.kohop.listMine, {})).map((c) => c._id),
    ).toEqual([id]);
  });
});

async function setAccessOpen(t: T) {
  const row = await t.run((ctx) => ctx.db.query('kohopSettings').first());
  if (row) await t.run((ctx) => ctx.db.patch(row._id, { access: 'open' }));
  else await setAccess(t, 'open');
}

describe('Brouillon', () => {
  it('refuse un lien qui n’est pas en https, et un document de la bibliothèque non publié', async () => {
    const { author, t } = await world();
    const id = await author.as.mutation(api.kohop.createDraft, { lang: 'fr' });
    const base = {
      contributionId: id,
      title: 'T',
      standfirst: '',
      body: '',
      lang: 'fr' as const,
      fields: [],
      keywords: [],
      coAuthors: [],
      priorWorks: [],
    };
    await expect(
      author.as.mutation(api.kohop.saveDraft, {
        ...base,
        links: [{ label: 'x', url: 'http://exemple.org' }],
      }),
    ).rejects.toThrow('INVALID_LINKS');
    await expect(
      author.as.mutation(api.kohop.saveDraft, {
        ...base,
        links: [{ label: 'x', url: 'javascript:alert(1)' }],
      }),
    ).rejects.toThrow('INVALID_LINKS');
    const pubId = await t.run((ctx) =>
      ctx.db.insert('publications', {
        title: 'Doc',
        slug: 'doc',
        type: 'rapport',
        theme: 'participation',
        region: 'afrique',
        languages: ['fr'],
        access: 'open',
        authors: [{ name: 'A' }],
        year: 2026,
        publishedAt: 0,
        abstract: 'r',
        keypoints: [],
        body: [],
        doi: '',
        downloads: 0,
        citations: 0,
        status: 'pending',
        createdAt: 0,
      }),
    );
    await expect(
      author.as.mutation(api.kohop.saveDraft, {
        ...base,
        links: [{ label: 'x', publicationId: pubId }],
      }),
    ).rejects.toThrow('INVALID_LINKS');
    await t.run((ctx) => ctx.db.patch(pubId, { status: 'published' }));
    await expect(
      author.as.mutation(api.kohop.saveDraft, {
        ...base,
        links: [{ label: 'x', publicationId: pubId }],
      }),
    ).resolves.toBeTruthy();
  });

  it('compte les mots comme le fait l’écran, et garde au plus un ou deux champs', async () => {
    const { author } = await world();
    const id = await author.as.mutation(api.kohop.createDraft, { lang: 'fr' });
    const saved = await author.as.mutation(api.kohop.saveDraft, {
      contributionId: id,
      title: 'T',
      standfirst: '',
      body: 'Un deux trois — quatre.',
      lang: 'fr',
      fields: ['health', 'norms', 'science', 'inconnu'],
      keywords: [],
      coAuthors: [],
      links: [],
      priorWorks: [],
    });
    expect(saved.wordCount).toBe(4);
    const mine = await author.as.query(api.kohop.getMine, {
      contributionId: id,
    });
    expect(mine.fields).toEqual(['health', 'norms']);
  });

  it('limite le nombre de brouillons ouverts', async () => {
    const { author } = await world();
    for (let i = 0; i < 5; i++)
      await author.as.mutation(api.kohop.createDraft, { lang: 'fr' });
    await expect(
      author.as.mutation(api.kohop.createDraft, { lang: 'fr' }),
    ).rejects.toThrow('TOO_MANY_DRAFTS');
  });
});

describe('Choix des relecteurs — liens bloquants refusés côté serveur', () => {
  async function setup() {
    const w = await world();
    const id = await draft(w.author);
    return { ...w, id };
  }

  it('l’annuaire ne propose ni l’auteur, ni un profil qui a refusé, ni un profil privé', async () => {
    const { t, author, id, rev1 } = await setup();
    const optedOut = await account(t, 'membre', 'refus@autre.org', {
      name: 'Refus Relecteur',
    });
    await profile(t, optedOut.id, 'Refus Relecteur', { notReviewer: true });
    const hidden = await account(t, 'membre', 'prive@autre.org', {
      name: 'Privé Relecteur',
    });
    await profile(t, hidden.id, 'Privé Relecteur', { listed: false });
    await profile(t, author.id, 'Awa Auteure');
    const names = (
      await author.as.query(api.kohop.searchReviewers, { contributionId: id })
    ).map((c) => c.displayName);
    expect(names).toEqual(
      expect.arrayContaining(['Rémi Relecteur', 'Rita Relectrice']),
    );
    expect(names).not.toContain('Refus Relecteur');
    expect(names).not.toContain('Privé Relecteur');
    expect(names).not.toContain('Awa Auteure');
    void rev1;
  });

  it('refuse l’auteur lui-même, avec le message générique, sans créer de relecteur', async () => {
    const { t, author, id } = await setup();
    await profile(t, author.id, 'Awa Auteure');
    const before = await counts(t);
    await expect(
      author.as.mutation(api.kohop.proposeReviewer, {
        contributionId: id,
        userId: author.id,
        slot: 'titular',
        declaredRelationship: 'none',
      }),
    ).rejects.toThrow('REVIEWER_NOT_ELIGIBLE');
    expect((await counts(t)).reviewers).toBe(before.reviewers);
  });

  it('refuse un membre de la même organisation, un binôme de mentorat, un coauteur, un lien déclaré', async () => {
    const { t, author, id, pilot } = await setup();
    const colleague = await account(t, 'membre', 'collegue@pilote.org', {
      name: 'Collègue Pilote',
    });
    await attach(t, colleague.id, pilot);
    await profile(t, colleague.id, 'Collègue Pilote');

    const mentor = await account(t, 'membre', 'mentor@x.org', {
      name: 'Mentor Binôme',
    });
    await profile(t, mentor.id, 'Mentor Binôme');
    const mentorProfile = (userId: Id<'users'>, role: 'mentor' | 'mentore') =>
      t.run((ctx) =>
        ctx.db.insert('mentorProfiles', {
          userId,
          role,
          displayName: role,
          themes: [],
          languages: ['fr'],
          region: 'afrique',
          availability: 'mensuelle',
          goals: '',
          capacity: 1,
          active: true,
          createdAt: 0,
          updatedAt: 0,
        } as never),
      );
    const mentorProfileId = await mentorProfile(mentor.id, 'mentor');
    const menteeProfileId = await mentorProfile(author.id, 'mentore');
    await t.run((ctx) =>
      ctx.db.insert('mentorPairs', {
        mentorProfileId,
        menteeProfileId,
        mentorUserId: mentor.id,
        menteeUserId: author.id,
        status: 'active',
        mentorAccepted: true,
        menteeAccepted: true,
        score: 1,
        scoreReasons: [],
        proposedAt: Date.now(),
      } as never),
    );

    const co = await account(t, 'membre', 'co@x.org', { name: 'Co Auteur' });
    await profile(t, co.id, 'Co Auteur');
    await author.as.mutation(api.kohop.saveDraft, {
      contributionId: id,
      title: 'Titre valable',
      standfirst: STANDFIRST,
      body: BODY,
      lang: 'fr',
      fields: ['health'],
      keywords: [],
      coAuthors: [{ name: 'Co Auteur', affiliation: 'X', email: 'co@x.org' }],
      links: [],
      priorWorks: [],
    });
    const friend = await account(t, 'membre', 'ami@x.org', {
      name: 'Ami Proche',
    });
    await profile(t, friend.id, 'Ami Proche');

    const attempt = (userId: Id<'users'>, declared = 'none') =>
      author.as.mutation(api.kohop.proposeReviewer, {
        contributionId: id,
        userId,
        slot: 'titular',
        declaredRelationship: declared,
      });
    await expect(attempt(colleague.id)).rejects.toThrow(
      'REVIEWER_NOT_ELIGIBLE',
    );
    await expect(attempt(mentor.id)).rejects.toThrow('REVIEWER_NOT_ELIGIBLE');
    await expect(attempt(co.id)).rejects.toThrow('REVIEWER_NOT_ELIGIBLE');
    await expect(attempt(friend.id, 'family')).rejects.toThrow(
      'REVIEWER_NOT_ELIGIBLE',
    );
    await expect(attempt(friend.id, 'hierarchical')).rejects.toThrow(
      'REVIEWER_NOT_ELIGIBLE',
    );
    expect((await counts(t)).reviewers).toBe(0);
    // Without a declared link, the same friend is eligible.
    await expect(attempt(friend.id, 'none')).resolves.toBeTruthy();
  });

  it('un lien signalé est accepté, enregistré pour le chef de revue, et caché à l’auteur', async () => {
    const { t, author, id, rev1, other } = await setup();
    // Same workspace: flagged, never blocking.
    const ws = await t.run((ctx) =>
      ctx.db.insert('workspaces', {
        title: 'Espace',
        theme: 'participation',
        description: '',
        ownerUserId: author.id,
        ownerName: 'Awa',
        memberCount: 2,
        createdAt: 0,
      }),
    );
    for (const u of [author, rev1]) {
      await t.run((ctx) =>
        ctx.db.insert('workspaceMembers', {
          workspaceId: ws,
          userId: u.id,
          userName: 'x',
          role: 'contributeur',
          joinedAt: 0,
        } as never),
      );
    }
    void other;
    const reviewerId = await author.as.mutation(api.kohop.proposeReviewer, {
      contributionId: id,
      userId: rev1.id,
      slot: 'titular',
      declaredRelationship: 'none',
    });
    const mine = await author.as.query(api.kohop.getMine, {
      contributionId: id,
    });
    const serialized = JSON.stringify(mine);
    // The author never sees e-mails, flags, findings or the declared link.
    for (const secret of [
      'rev1@autre.org',
      'same_workspace',
      'findings',
      'declaredRelationship',
      'flags',
      'linkChecks',
    ]) {
      expect(serialized, secret).not.toContain(secret);
    }
    expect(mine.reviewers[0]).toMatchObject({
      _id: reviewerId,
      status: 'proposed',
      slot: 'titular',
    });
    const checks = await t.run((ctx) =>
      ctx.db.query('kohopLinkChecks').collect(),
    );
    expect(checks).toHaveLength(1);
    expect(checks[0].origin).toBe('rules');
    expect(checks[0].level).toBe('flagged');
    expect(checks[0].findings.map((f) => f.type)).toContain('same_workspace');
  });

  it('deux titulaires et un suppléant au plus, pas deux fois la même personne', async () => {
    const { author, id, rev1, rev2, rev3, t } = await setup();
    const p = (userId: Id<'users'>, slot: 'titular' | 'substitute') =>
      author.as.mutation(api.kohop.proposeReviewer, {
        contributionId: id,
        userId,
        slot,
        declaredRelationship: 'none',
      });
    await p(rev1.id, 'titular');
    await expect(p(rev1.id, 'substitute')).rejects.toThrow(
      'REVIEWER_ALREADY_PROPOSED',
    );
    await p(rev2.id, 'titular');
    const extra = await account(t, 'membre', 'extra@autre.org', {
      name: 'Extra Relecteur',
    });
    await profile(t, extra.id, 'Extra Relecteur');
    await expect(p(extra.id, 'titular')).rejects.toThrow('SLOT_FULL');
    await p(rev3.id, 'substitute');
    await expect(p(extra.id, 'substitute')).rejects.toThrow('SLOT_FULL');
  });

  it('l’auteur retire une désignation que personne n’a encore traitée', async () => {
    const { author, id, rev1 } = await setup();
    const reviewerId = await author.as.mutation(api.kohop.proposeReviewer, {
      contributionId: id,
      userId: rev1.id,
      slot: 'titular',
      declaredRelationship: 'none',
    });
    await author.as.mutation(api.kohop.removeReviewer, { reviewerId });
    expect(
      (await author.as.query(api.kohop.getMine, { contributionId: id }))
        .reviewers,
    ).toEqual([]);
  });
});

describe('Dépôt', () => {
  async function ready() {
    const w = await world();
    const id = await draft(w.author);
    for (const [u, slot] of [
      [w.rev1, 'titular'],
      [w.rev2, 'titular'],
      [w.rev3, 'substitute'],
    ] as const) {
      await w.author.as.mutation(api.kohop.proposeReviewer, {
        contributionId: id,
        userId: u.id,
        slot,
        declaredRelationship: 'none',
      });
    }
    return { ...w, id };
  }

  it('exige les trois engagements, deux relecteurs titulaires et un texte de 500 à 1 000 mots', async () => {
    const { author, id, t } = await ready();
    const before = await counts(t);
    for (const patch of [
      { acceptCharter: false },
      { acceptAgreement: false },
      { declareOriginality: false },
    ]) {
      await expect(
        author.as.mutation(api.kohop.submit, {
          contributionId: id,
          ...COMMIT,
          ...patch,
        }),
      ).rejects.toThrow('COMMITMENTS_REQUIRED');
    }
    expect(await counts(t)).toEqual(before);
    expect(
      (await author.as.query(api.kohop.getMine, { contributionId: id })).stage,
    ).toBe('draft');

    const short = await draft(author, { body: words(499) });
    await expect(
      author.as.mutation(api.kohop.submit, {
        contributionId: short,
        ...COMMIT,
      }),
    ).rejects.toThrow('BODY_TOO_SHORT');
    const long = await draft(author, { body: words(1001) });
    await expect(
      author.as.mutation(api.kohop.submit, { contributionId: long, ...COMMIT }),
    ).rejects.toThrow('BODY_TOO_LONG');
    const html = await draft(author, { body: `${BODY}\n\n<b>gras</b>` });
    await expect(
      author.as.mutation(api.kohop.submit, { contributionId: html, ...COMMIT }),
    ).rejects.toThrow('BODY_UNSUPPORTED');
    const noReviewers = await draft(author);
    await expect(
      author.as.mutation(api.kohop.submit, {
        contributionId: noReviewers,
        ...COMMIT,
      }),
    ).rejects.toThrow('REVIEWERS_INCOMPLETE');
  });

  it('dépose : fige la version, prévient les chefs de revue, journalise, planifie l’e-mail', async () => {
    const { author, id, t, chief, admin } = await ready();
    const mod = await account(t, 'moderateur', 'simple@dt.org');
    expect(
      await author.as.mutation(api.kohop.submit, {
        contributionId: id,
        ...COMMIT,
      }),
    ).toEqual({ stage: 'submitted' });

    const doc = await t.run((ctx) => ctx.db.get(id));
    expect(doc?.stage).toBe('submitted');
    expect(doc?.submittedVersion).toBe(1);
    expect(doc?.charterAcceptedAt).toBeTypeOf('number');
    expect(doc?.organizationId).toBeTruthy();

    const notified = await t.run(async (ctx) =>
      (await ctx.db.query('notifications').collect())
        .filter((n) => n.titleKey === 'kohopSubmitted')
        .map((n) => n.userId),
    );
    expect(notified.sort()).toEqual([chief.id, admin.id].sort());
    expect(notified).not.toContain(mod.id);
    const audit = await t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(audit.map((a) => a.action)).toContain('kohop.submitted');
  });

  it('un texte déjà déposé ne se réécrit pas, et un deuxième dépôt est refusé sans rien écrire', async () => {
    const { author, id, t } = await ready();
    await author.as.mutation(api.kohop.submit, {
      contributionId: id,
      ...COMMIT,
    });
    const before = await counts(t);
    await expect(
      author.as.mutation(api.kohop.submit, { contributionId: id, ...COMMIT }),
    ).rejects.toThrow('INVALID_TRANSITION');
    await expect(
      author.as.mutation(api.kohop.saveDraft, {
        contributionId: id,
        title: 'Modifié',
        standfirst: STANDFIRST,
        body: BODY,
        lang: 'fr',
        fields: ['health'],
        keywords: [],
        coAuthors: [],
        links: [],
        priorWorks: [],
      }),
    ).rejects.toThrow('NOT_EDITABLE');
    expect(await counts(t)).toEqual(before);
  });

  it('l’auteur peut se retirer, une fois', async () => {
    const { author, id } = await ready();
    await author.as.mutation(api.kohop.withdraw, { contributionId: id });
    expect(
      (await author.as.query(api.kohop.getMine, { contributionId: id })).stage,
    ).toBe('withdrawn');
    await expect(
      author.as.mutation(api.kohop.withdraw, { contributionId: id }),
    ).rejects.toThrow('ALREADY_FINAL');
  });
});

describe('Chef de revue — recevabilité', () => {
  async function submitted() {
    const w = await world();
    const id = await draft(w.author);
    const ids: Id<'kohopReviewers'>[] = [];
    for (const [u, slot] of [
      [w.rev1, 'titular'],
      [w.rev2, 'titular'],
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
    return { ...w, id, ids };
  }

  it('la file et le dossier sont fermés à un modérateur, un éditeur et à l’auteur sans la fonction', async () => {
    const { t, id, author } = await submitted();
    const mod = await account(t, 'moderateur', 'm@dt.org');
    const editor = await account(t, 'editeur', 'e@dt.org');
    for (const actor of [mod, editor, author]) {
      await expect(actor.as.query(api.kohopChief.queue, {})).rejects.toThrow(
        /chef de revue/,
      );
      await expect(
        actor.as.query(api.kohopChief.dossier, { contributionId: id }),
      ).rejects.toThrow(/chef de revue/);
    }
  });

  it('seul le chef de revue (ou l’administrateur) fait sortir un dossier de « submitted »', async () => {
    const { t, id, author, rev1, ids } = await submitted();
    const mod = await account(t, 'moderateur', 'm@dt.org');
    const editor = await account(t, 'editeur', 'e@dt.org');
    const before = await counts(t);
    for (const actor of [mod, editor, author, rev1]) {
      await expect(
        actor.as.mutation(api.kohopChief.startReview, { contributionId: id }),
      ).rejects.toThrow();
      await expect(
        actor.as.mutation(api.kohopChief.returnToAuthor, {
          contributionId: id,
          reason: 'Un motif suffisamment long.',
        }),
      ).rejects.toThrow();
      await expect(
        actor.as.mutation(api.kohopChief.declareInadmissible, {
          contributionId: id,
          code: 'charte',
          reason: 'Un motif suffisamment long.',
        }),
      ).rejects.toThrow();
      await expect(
        actor.as.mutation(api.kohopChief.approveReviewer, {
          reviewerId: ids[0],
        }),
      ).rejects.toThrow();
      await expect(
        actor.as.mutation(api.kohopChief.recuseReviewer, {
          reviewerId: ids[0],
          reason: 'other',
        }),
      ).rejects.toThrow();
    }
    expect((await t.run((ctx) => ctx.db.get(id)))?.stage).toBe('submitted');
    expect(await counts(t)).toEqual(before);
  });

  it('le dossier montre au chef de revue les liens trouvés, l’e-mail et le lien déclaré', async () => {
    const { chief, id } = await submitted();
    const file = await chief.as.query(api.kohopChief.dossier, {
      contributionId: id,
    });
    expect(file.author.email).toBe('auteur@pilote.org');
    expect(file.reviewers).toHaveLength(3);
    expect(file.reviewers[0].email).toBeTruthy();
    expect(file.reviewers[0].linkChecks.map((c) => c.origin)).toContain(
      'rules',
    );
    expect(file.chiefActions.sort()).toEqual([
      'declareInadmissible',
      'return',
      'startReview',
    ]);
  });

  it('lancer la relecture attend le rapport d’originalité interne, et ne laisse aucune trace sinon', async () => {
    const w = await submitted();
    await w.t.run(async (ctx) => {
      for (const r of await ctx.db.query('originalityReports').collect()) {
        await ctx.db.delete(r._id);
      }
    });
    for (const reviewerId of w.ids) {
      await w.chief.as.mutation(api.kohopChief.approveReviewer, { reviewerId });
    }
    const before = await counts(w.t);
    await expect(
      w.chief.as.mutation(api.kohopChief.startReview, { contributionId: w.id }),
    ).rejects.toThrow('ORIGINALITY_REQUIRED');
    expect(await counts(w.t)).toEqual(before);
    await w.chief.as.mutation(api.kohopOriginality.requestChecks, {
      contributionId: w.id,
    });
    await drain(w.t);
    await w.chief.as.mutation(api.kohopChief.startReview, {
      contributionId: w.id,
    });
  });

  it('lancer la relecture exige deux titulaires validés', async () => {
    const { chief, id, ids, t } = await submitted();
    const before = await counts(t);
    await expect(
      chief.as.mutation(api.kohopChief.startReview, { contributionId: id }),
    ).rejects.toThrow('REVIEWERS_NOT_VALIDATED');
    await chief.as.mutation(api.kohopChief.approveReviewer, {
      reviewerId: ids[0],
    });
    await expect(
      chief.as.mutation(api.kohopChief.startReview, { contributionId: id }),
    ).rejects.toThrow('REVIEWERS_NOT_VALIDATED');
    expect((await counts(t)).events).toBe(before.events + 1);
    await chief.as.mutation(api.kohopChief.approveReviewer, {
      reviewerId: ids[1],
    });
    await chief.as.mutation(api.kohopChief.startReview, { contributionId: id });
    const doc = await t.run((ctx) => ctx.db.get(id));
    expect(doc?.stage).toBe('in_review');
    expect(doc?.reviewedVersion).toBe(1);
    // Not twice.
    await expect(
      chief.as.mutation(api.kohopChief.startReview, { contributionId: id }),
    ).rejects.toThrow('INVALID_TRANSITION');
  });

  it('un administrateur peut aussi valider et lancer', async () => {
    const { admin, id, ids } = await submitted();
    await admin.as.mutation(api.kohopChief.approveReviewer, {
      reviewerId: ids[0],
    });
    await admin.as.mutation(api.kohopChief.approveReviewer, {
      reviewerId: ids[1],
    });
    await admin.as.mutation(api.kohopChief.startReview, { contributionId: id });
  });

  it('récuser un relecteur : motif enregistré, auteur prévenu, place libérée pour un remplaçant', async () => {
    const { chief, author, id, ids, t, rev3 } = await submitted();
    await chief.as.mutation(api.kohopChief.recuseReviewer, {
      reviewerId: ids[0],
      reason: 'same_institution',
      note: 'Même institution.',
    });
    const row = await t.run((ctx) => ctx.db.get(ids[0]));
    expect(row?.status).toBe('recused');
    expect(row?.recusal?.reason).toBe('same_institution');
    const notified = await t.run(async (ctx) =>
      (await ctx.db.query('notifications').collect()).filter(
        (n) => n.titleKey === 'kohopReviewerReplaced',
      ),
    );
    expect(notified).toHaveLength(1);
    expect(notified[0].userId).toBe(author.id);
    // The author refills the freed place (a replacement stage).
    const extra = await account(t, 'membre', 'extra@autre.org', {
      name: 'Extra Relecteur',
    });
    await profile(t, extra.id, 'Extra Relecteur');
    await expect(
      author.as.mutation(api.kohop.proposeReviewer, {
        contributionId: id,
        userId: extra.id,
        slot: 'titular',
        declaredRelationship: 'none',
      }),
    ).resolves.toBeTruthy();
    void rev3;
    // Rejected twice is refused.
    await expect(
      chief.as.mutation(api.kohopChief.recuseReviewer, {
        reviewerId: ids[0],
        reason: 'other',
      }),
    ).rejects.toThrow('INVALID_TRANSITION');
  });

  it('renvoyer à l’auteur : motif obligatoire, délai de 14 jours, nouvelle version, nouveau dépôt', async () => {
    const { chief, author, id, t } = await submitted();
    await expect(
      chief.as.mutation(api.kohopChief.returnToAuthor, {
        contributionId: id,
        reason: 'court',
      }),
    ).rejects.toThrow('REASON_REQUIRED');
    expect((await t.run((ctx) => ctx.db.get(id)))?.stage).toBe('submitted');

    await chief.as.mutation(api.kohopChief.returnToAuthor, {
      contributionId: id,
      reason: 'Merci de préciser la méthode et de réduire les citations.',
    });
    const doc = await t.run((ctx) => ctx.db.get(id));
    expect(doc?.stage).toBe('returned');
    expect(doc!.returnedDueAt! - Date.now()).toBeGreaterThan(
      13 * 24 * 3600 * 1000,
    );

    const mine = await author.as.query(api.kohop.getMine, {
      contributionId: id,
    });
    expect(mine.lastDecision?.reason).toContain('préciser la méthode');
    expect(mine.editable).toBe(true);

    // Editing a text already sent creates the NEXT version.
    await author.as.mutation(api.kohop.saveDraft, {
      contributionId: id,
      title: 'La participation citoyenne, version corrigée',
      standfirst: STANDFIRST,
      body: BODY,
      lang: 'fr',
      fields: ['citizen-participation'],
      keywords: [],
      coAuthors: [],
      links: [],
      priorWorks: [],
    });
    const versions = await t.run((ctx) =>
      ctx.db.query('kohopVersions').collect(),
    );
    expect(versions.map((v2) => v2.version).sort()).toEqual([1, 2]);
    expect(versions.find((v2) => v2.version === 1)?.title).toBe(
      'La participation citoyenne en Afrique de l’Ouest',
    );

    await author.as.mutation(api.kohop.submit, {
      contributionId: id,
      ...COMMIT,
    });
    const again = await t.run((ctx) => ctx.db.get(id));
    expect(again?.stage).toBe('submitted');
    expect(again?.submittedVersion).toBe(2);
    expect(again?.returnedDueAt).toBeUndefined();
  });

  it('déclarer irrecevable : final, avec un code et un texte pour l’auteur', async () => {
    const { chief, author, id } = await submitted();
    await chief.as.mutation(api.kohopChief.declareInadmissible, {
      contributionId: id,
      code: 'hors_champ',
      reason: 'Le sujet est hors du champ de KOHOP.',
    });
    const mine = await author.as.query(api.kohop.getMine, {
      contributionId: id,
    });
    expect(mine.stage).toBe('refused');
    expect(mine.lastDecision).toMatchObject({
      kind: 'inadmissible',
      reasonCode: 'hors_champ',
    });
    await expect(
      chief.as.mutation(api.kohopChief.declareInadmissible, {
        contributionId: id,
        code: 'autre',
        reason: 'Encore un motif suffisamment long.',
      }),
    ).rejects.toThrow('ALREADY_FINAL');
  });
});
