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

// KOHOP batch 4 — revision by the author and decision by the review chief.
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
const DAY = 24 * 60 * 60 * 1000;

type Reviewer = Awaited<ReturnType<typeof account>>;

// A file in review: both titulars invited, the substitute approved.
async function inReview() {
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
  // The internal originality report is a precondition of the review.
  vi.useFakeTimers();
  try {
    await w.t.finishAllScheduledFunctions(vi.runAllTimers);
  } finally {
    vi.useRealTimers();
  }
  for (const reviewerId of ids) {
    await w.chief.as.mutation(api.kohopChief.approveReviewer, { reviewerId });
  }
  await w.chief.as.mutation(api.kohopChief.startReview, { contributionId: id });
  return { ...w, id, ids };
}

async function accept(r: Reviewer, reviewerId: Id<'kohopReviewers'>) {
  await r.as.mutation(api.kohopReviews.respond, {
    reviewerId,
    accept: true,
    hasConflict: false,
    consent: true,
  });
}

const review = (reviewerId: Id<'kohopReviewers'>, over = {}) => ({
  reviewerId,
  recommendation: 'favorable' as const,
  analysis: ANALYSIS,
  noteToEditor: 'Note confidentielle pour le chef de revue.',
  ...over,
});

// A file in REVISION: both analyses in.
async function inRevision(
  recs: ('favorable' | 'reserves' | 'defavorable')[] = [
    'favorable',
    'reserves',
  ],
) {
  const w = await inReview();
  await accept(w.rev1, w.ids[0]);
  await accept(w.rev2, w.ids[1]);
  await w.rev1.as.mutation(
    api.kohopReviews.saveReview,
    review(w.ids[0], { recommendation: recs[0] }),
  );
  await w.rev2.as.mutation(
    api.kohopReviews.saveReview,
    review(w.ids[1], { recommendation: recs[1] }),
  );
  return w;
}
// Runs the scheduled functions (e-mails, originality checks) to completion.
async function drain(t: T) {
  vi.useFakeTimers();
  try {
    await t.finishAllScheduledFunctions(vi.runAllTimers);
  } finally {
    vi.useRealTimers();
  }
}

// Originality is a precondition of acceptance: reports done, external check
// acknowledged (no provider is configured by default).
async function clearOriginality(w: {
  t: T;
  chief: Reviewer;
  id: Id<'kohopContributions'>;
}) {
  await drain(w.t);
  await w.chief.as.mutation(api.kohopOriginality.acknowledgeWithoutExternal, {
    contributionId: w.id,
  });
}

const REPLY =
  'Merci pour ces lectures attentives : j’ai précisé la méthode et ajouté une source.';

describe('Lecture des analyses par l’auteur', () => {
  it('l’auteur lit les analyses publiques, jamais la note confidentielle, jamais avant la fin', async () => {
    const w = await inReview();
    const before = await w.author.as.query(api.kohop.getMine, {
      contributionId: w.id,
    });
    expect(before?.reviews).toEqual([]);
    const done = await inRevision();
    const mine = await done.author.as.query(api.kohop.getMine, {
      contributionId: done.id,
    });
    expect(mine?.reviews).toHaveLength(2);
    expect(mine?.reviews.map((r) => r.displayName).sort()).toEqual([
      'Rita Relectrice',
      'Rémi Relecteur',
    ]);
    expect(JSON.stringify(mine)).not.toContain('confidentielle');
    expect(mine?.revisable).toBe(true);
    expect(mine?.reviewedBody).toContain('Introduction');
  });
});

describe('Révision par l’auteur', () => {
  it('la première modification crée la version suivante, la version relue est conservée', async () => {
    const { t, author, id } = await inRevision();
    const body = `## Introduction\n\n${words(320)}\n\n${words(300)}`;
    const saved = await author.as.mutation(api.kohopRevision.saveRevision, {
      contributionId: id,
      title: 'Titre revu',
      standfirst: STANDFIRST,
      body,
      links: [],
    });
    expect(saved.version).toBe(2);
    await author.as.mutation(api.kohopRevision.saveRevision, {
      contributionId: id,
      title: 'Titre revu',
      standfirst: STANDFIRST,
      body: `${body} ajout`,
      links: [],
    });
    const versions = await t.run((ctx) =>
      ctx.db.query('kohopVersions').collect(),
    );
    expect(versions.map((v) => [v.version, v.kind]).sort()).toEqual([
      [1, 'submission'],
      [2, 'revision'],
    ]);
    const reviewed = versions.find((v) => v.version === 1);
    expect(reviewed?.body).toBe(BODY);
  });

  it('on ne révise ni hors de l’étape ni le texte d’un autre', async () => {
    const w = await inReview();
    await expect(
      w.author.as.mutation(api.kohopRevision.saveRevision, {
        contributionId: w.id,
        title: 'T titre',
        standfirst: STANDFIRST,
        body: BODY,
        links: [],
      }),
    ).rejects.toThrow('NOT_EDITABLE');
    const done = await inRevision();
    await expect(
      done.rev1.as.mutation(api.kohopRevision.saveRevision, {
        contributionId: done.id,
        title: 'T titre',
        standfirst: STANDFIRST,
        body: BODY,
        links: [],
      }),
    ).rejects.toThrow('NOT_FOUND');
  });

  it('la réponse est obligatoire (1 à 800 mots) et ne s’écrit pas si elle est refusée', async () => {
    const { t, author, id } = await inRevision();
    const before = await counts(t);
    await expect(
      author.as.mutation(api.kohopRevision.submitRevision, {
        contributionId: id,
        response: '   ',
      }),
    ).rejects.toThrow('REPLY_REQUIRED');
    await expect(
      author.as.mutation(api.kohopRevision.submitRevision, {
        contributionId: id,
        response: words(801),
      }),
    ).rejects.toThrow('REPLY_TOO_LONG');
    expect(await counts(t)).toEqual(before);
    expect((await t.run((ctx) => ctx.db.get(id)))?.stage).toBe('revision');
  });

  it('rendre la révision garde le texte tel quel si besoin, passe à la décision et prévient les chefs', async () => {
    const { t, author, id, chief, admin } = await inRevision();
    await author.as.mutation(api.kohopRevision.submitRevision, {
      contributionId: id,
      response: REPLY,
    });
    const doc = await t.run((ctx) => ctx.db.get(id));
    expect(doc?.stage).toBe('decision');
    expect(doc?.revisionDueAt).toBeUndefined();
    expect(doc?.submittedVersion).toBe(2);
    const v2 = await t.run((ctx) => ctx.db.query('kohopVersions').collect());
    expect(v2.find((v) => v.version === 2)?.responseToReviewers).toBe(REPLY);
    const notified = await t.run(async (ctx) =>
      (await ctx.db.query('notifications').collect())
        .filter((n) => n.titleKey === 'kohopRevisionSubmitted')
        .map((n) => n.userId),
    );
    expect(notified.sort()).toEqual([chief.id, admin.id].sort());
    // Not twice.
    await expect(
      author.as.mutation(api.kohopRevision.submitRevision, {
        contributionId: id,
        response: REPLY,
      }),
    ).rejects.toThrow('INVALID_TRANSITION');
  });

  it('une prolongation de 7 jours, une seule fois', async () => {
    const { t, author, id } = await inRevision();
    const before = (await t.run((ctx) => ctx.db.get(id)))?.revisionDueAt ?? 0;
    const due = await author.as.mutation(api.kohopRevision.requestExtension, {
      contributionId: id,
    });
    expect(due).toBe(before + 7 * DAY);
    await expect(
      author.as.mutation(api.kohopRevision.requestExtension, {
        contributionId: id,
      }),
    ).rejects.toThrow('EXTENSION_USED');
    expect((await t.run((ctx) => ctx.db.get(id)))?.revisionDueAt).toBe(due);
  });

  it('le cron rappelle puis fait passer le dossier à la décision à l’échéance', async () => {
    const { t, id, chief } = await inRevision();
    await t.run((ctx) =>
      ctx.db.patch(id, { revisionDueAt: Date.now() + 2 * DAY }),
    );
    expect(await t.mutation(internal.kohopDeadlines.run, {})).toEqual({
      reminded: 1,
      expired: 0,
    });
    expect(await t.mutation(internal.kohopDeadlines.run, {})).toEqual({
      reminded: 0,
      expired: 0,
    });
    await t.run((ctx) =>
      ctx.db.patch(id, { revisionDueAt: Date.now() - 1000 }),
    );
    expect(await t.mutation(internal.kohopDeadlines.run, {})).toEqual({
      reminded: 0,
      expired: 1,
    });
    expect((await t.run((ctx) => ctx.db.get(id)))?.stage).toBe('decision');
    const notes = await t.run(async (ctx) =>
      (await ctx.db.query('notifications').collect())
        .filter((n) => n.titleKey === 'kohopDecisionDue')
        .map((n) => n.userId),
    );
    expect(notes).toContain(chief.id);
  });
});

describe('Décision du chef de revue', () => {
  async function inDecision(
    recs?: ('favorable' | 'reserves' | 'defavorable')[],
  ) {
    const w = await inRevision(recs);
    await w.author.as.mutation(api.kohopRevision.submitRevision, {
      contributionId: w.id,
      response: REPLY,
    });
    await drain(w.t);
    return w;
  }

  it('le dossier du chef montre les analyses AVEC la note confidentielle, et la présomption', async () => {
    const { chief, id } = await inDecision();
    const d = await chief.as.query(api.kohopChief.dossier, {
      contributionId: id,
    });
    expect(d.reviews).toHaveLength(2);
    expect(d.reviews[0].noteToEditor).toContain('confidentielle');
    expect(d.presumption).toBe(true);
    expect(d.positiveReviews).toBe(2);
  });

  it('seul le chef de revue ou l’administrateur décide : ni l’auteur, ni un modérateur sans la fonction', async () => {
    const { t, author, id, rev1 } = await inDecision();
    const mod = await account(t, 'moderateur', 'simple2@dt.org');
    for (const who of [author, rev1, mod]) {
      await expect(
        who.as.mutation(api.kohopDecision.accept, { contributionId: id }),
      ).rejects.toThrow();
    }
    expect((await t.run((ctx) => ctx.db.get(id)))?.stage).toBe('decision');
  });

  it('accepter : production, version retenue, slug, journal, auteur prévenu — et rien n’est publié', async () => {
    const { t, chief, author, id } = await inDecision();
    await clearOriginality({ t, chief, id });
    await chief.as.mutation(api.kohopDecision.accept, { contributionId: id });
    const doc = await t.run((ctx) => ctx.db.get(id));
    expect(doc?.stage).toBe('production');
    expect(doc?.acceptedVersion).toBe(2);
    expect(doc?.slug).toMatch(/^la-participation-citoyenne/);
    expect(doc?.publishedAt).toBeUndefined();
    const audit = await t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(audit.map((a) => a.action)).toContain('kohop.accepted');
    const mine = await author.as.query(api.kohop.getMine, {
      contributionId: id,
    });
    expect(mine?.lastDecision?.kind).toBe('accepted');
    await expect(
      chief.as.mutation(api.kohopDecision.accept, { contributionId: id }),
    ).rejects.toThrow('INVALID_TRANSITION');
  });

  it('refuser malgré deux avis positifs : seulement outrance, charte ou plagiat', async () => {
    const { t, chief, id } = await inDecision();
    const before = await counts(t);
    await expect(
      chief.as.mutation(api.kohopDecision.refuseContribution, {
        contributionId: id,
        code: 'hors_champ',
        reason: 'Le sujet est hors du champ de la revue.',
      }),
    ).rejects.toThrow('PRESUMPTION_REASON');
    await expect(
      chief.as.mutation(api.kohopDecision.refuseContribution, {
        contributionId: id,
        code: 'plagiat',
        reason: 'court',
      }),
    ).rejects.toThrow('REASON_REQUIRED');
    expect(await counts(t)).toEqual(before);
    await chief.as.mutation(api.kohopDecision.refuseContribution, {
      contributionId: id,
      code: 'plagiat',
      reason: 'Des passages recopient un texte déjà publié.',
    });
    expect((await t.run((ctx) => ctx.db.get(id)))?.stage).toBe('refused');
    const audit = await t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(audit.map((a) => a.action)).toContain(
      'kohop.refused_against_presumption',
    );
  });

  it('avis partagés : le chef refuse librement, avec un motif ; le refus est final', async () => {
    const { t, chief, author, id } = await inDecision([
      'favorable',
      'defavorable',
    ]);
    const d = await chief.as.query(api.kohopChief.dossier, {
      contributionId: id,
    });
    expect(d.presumption).toBe(false);
    await chief.as.mutation(api.kohopDecision.refuseContribution, {
      contributionId: id,
      code: 'hors_champ',
      reason: 'Le sujet est hors du champ de la revue.',
    });
    const mine = await author.as.query(api.kohop.getMine, {
      contributionId: id,
    });
    expect(mine?.lastDecision?.reason).toContain('hors du champ');
    await expect(
      chief.as.mutation(api.kohopDecision.accept, { contributionId: id }),
    ).rejects.toThrow('ALREADY_FINAL');
    void t;
  });

  it('on ne décide pas avant l’étape « decision »', async () => {
    const { chief, id } = await inRevision();
    await expect(
      chief.as.mutation(api.kohopDecision.accept, { contributionId: id }),
    ).rejects.toThrow('INVALID_TRANSITION');
  });
});

describe('Originalité', () => {
  async function inDecision() {
    const w = await inRevision();
    await w.author.as.mutation(api.kohopRevision.submitRevision, {
      contributionId: w.id,
      response: REPLY,
    });
    return w;
  }

  it('accepter est refusé tant que les rapports ne sont pas là, sans rien écrire', async () => {
    const { t, chief, id } = await inDecision();
    // The checks scheduled by the revision write to the history and the audit log
    // while they run: let them finish, THEN remove the reports, so the counts below
    // are measured with nothing running in the background.
    await drain(t);
    await t.run(async (ctx) => {
      for (const r of await ctx.db.query('originalityReports').collect()) {
        await ctx.db.delete(r._id);
      }
    });
    const before = await counts(t);
    await expect(
      chief.as.mutation(api.kohopDecision.accept, { contributionId: id }),
    ).rejects.toThrow('ORIGINALITY_REQUIRED');
    expect(await counts(t)).toEqual(before);
    expect((await t.run((ctx) => ctx.db.get(id)))?.stage).toBe('decision');
  });

  it('sans prestataire externe : rapport « indisponible », reconnaissance explicite et auditée', async () => {
    const w = await inDecision();
    await drain(w.t);
    const r = await w.chief.as.query(api.kohopOriginality.reports, {
      contributionId: w.id,
    });
    expect(r?.reports.find((x) => x.scope === 'platform')?.report?.status).toBe(
      'done',
    );
    expect(r?.reports.find((x) => x.scope === 'external')?.report?.status).toBe(
      'unavailable',
    );
    await expect(
      w.chief.as.mutation(api.kohopDecision.accept, { contributionId: w.id }),
    ).rejects.toThrow('ORIGINALITY_REQUIRED');
    await w.chief.as.mutation(api.kohopOriginality.acknowledgeWithoutExternal, {
      contributionId: w.id,
    });
    await w.chief.as.mutation(api.kohopDecision.accept, {
      contributionId: w.id,
    });
    const decisions = await w.t.run((ctx) =>
      ctx.db.query('kohopDecisions').collect(),
    );
    expect(
      decisions.find((d) => d.kind === 'accepted')?.withoutExternalCheck,
    ).toBe(true);
    const audit = await w.t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(audit.map((a) => a.action)).toContain(
      'kohop.accepted_without_external_check',
    );
  });

  it('avec un prestataire qui a répondu : pas de reconnaissance nécessaire', async () => {
    vi.stubEnv('PLAGIARISM_PROVIDER', 'fake');
    try {
      const w = await inDecision();
      await drain(w.t);
      await w.chief.as.mutation(api.kohopDecision.accept, {
        contributionId: w.id,
      });
      const decisions = await w.t.run((ctx) =>
        ctx.db.query('kohopDecisions').collect(),
      );
      expect(
        decisions.find((d) => d.kind === 'accepted')?.withoutExternalCheck,
      ).toBe(false);
      await expect(
        w.chief.as.mutation(api.kohopOriginality.acknowledgeWithoutExternal, {
          contributionId: w.id,
        }),
      ).rejects.toThrow();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('on ne reconnaît pas une vérification qui a abouti', async () => {
    vi.stubEnv('PLAGIARISM_PROVIDER', 'fake');
    try {
      const w = await inDecision();
      await drain(w.t);
      await expect(
        w.chief.as.mutation(api.kohopOriginality.acknowledgeWithoutExternal, {
          contributionId: w.id,
        }),
      ).rejects.toThrow('NOTHING_TO_ACKNOWLEDGE');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('le rapport de plateforme trouve un passage repris d’une contribution déjà déposée, et prévient les chefs', async () => {
    const w = await inDecision();
    const other = await account(w.t, 'membre', 'autre@x.org');
    await w.t.run(async (ctx) => {
      const id = await ctx.db.insert('kohopContributions', {
        stage: 'published',
        authorUserId: other.id,
        lang: 'fr',
        fields: [],
        keywords: [],
        coAuthors: [],
        currentVersion: 1,
        submittedVersion: 1,
        title: 'Un texte déjà paru',
        licence: 'CC BY 4.0',
        priorWorks: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.insert('kohopVersions', {
        contributionId: id,
        version: 1,
        kind: 'submission',
        title: 'Un texte déjà paru',
        standfirst: STANDFIRST,
        body: BODY,
        links: [],
        wordCount: 600,
        createdBy: other.id,
        createdAt: Date.now(),
      });
    });
    await drain(w.t);
    const r = await w.chief.as.query(api.kohopOriginality.reports, {
      contributionId: w.id,
    });
    const platform = r?.reports.find((x) => x.scope === 'platform')?.report;
    expect(platform?.matches.length).toBeGreaterThan(0);
    expect(platform?.matches[0].sourceTitle).toBe('Un texte déjà paru');
    expect(platform?.matches[0].classification).toBe('borrowing');
    const notified = await w.t.run(async (ctx) =>
      (await ctx.db.query('notifications').collect())
        .filter((n) => n.titleKey === 'kohopOriginalityReady')
        .map((n) => n.userId),
    );
    expect(notified).toContain(w.chief.id);
  });

  it('les rapports sont réservés au chef de revue : ni l’auteur ni un relecteur', async () => {
    const w = await inDecision();
    await drain(w.t);
    for (const who of [w.author, w.rev1]) {
      await expect(
        who.as.query(api.kohopOriginality.reports, { contributionId: w.id }),
      ).rejects.toThrow();
    }
    const mine = await w.author.as.query(api.kohop.getMine, {
      contributionId: w.id,
    });
    expect(mine?.events.map((e) => e.kind)).not.toContain(
      'originality_checked',
    );
    expect(mine?.events.map((e) => e.kind)).not.toContain('link_checked');
  });
});
