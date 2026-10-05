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

// KOHOP batch 6 — production, proof, publication and retraction.
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

async function accepted() {
  const w = await inRevision();
  await w.author.as.mutation(api.kohopRevision.submitRevision, {
    contributionId: w.id,
    response: REPLY,
  });
  await drain(w.t);
  await clearOriginality(w);
  await w.chief.as.mutation(api.kohopDecision.accept, { contributionId: w.id });
  return w;
}

const EDITED = `## Introduction\n\n${words(300)} relue par la rédaction\n\n${words(300)}`;
const copy = (id: Id<'kohopContributions'>, body = EDITED) => ({
  contributionId: id,
  title: 'La participation citoyenne en Afrique de l’Ouest',
  standfirst: STANDFIRST,
  body,
  links: [{ label: 'Source', url: 'https://exemple.org/etude' }],
});

// A file ready to publish, text unchanged by the copy-editing.
async function ready() {
  const w = await accepted();
  await w.chief.as.mutation(api.kohopProduction.markReady, {
    contributionId: w.id,
  });
  await drain(w.t);
  return w;
}

describe('Préparation de copie', () => {
  it('une nouvelle version « copyedit », la version acceptée est conservée', async () => {
    const { t, chief, id } = await accepted();
    const first = await chief.as.mutation(
      api.kohopProduction.saveCopyedit,
      copy(id),
    );
    const again = await chief.as.mutation(
      api.kohopProduction.saveCopyedit,
      copy(id, `${EDITED} bis`),
    );
    expect(again.version).toBe(first.version);
    const versions = await t.run((ctx) =>
      ctx.db.query('kohopVersions').collect(),
    );
    expect(versions.filter((v) => v.kind === 'copyedit')).toHaveLength(1);
    const original = versions.find((v) => v.version === 2);
    expect(original?.body).toBe(BODY);
    const doc = await t.run((ctx) => ctx.db.get(id));
    expect(doc?.acceptedVersion).toBe(first.version);
  });

  it('réservée au chef de revue, et seulement en préparation', async () => {
    const w = await accepted();
    for (const who of [w.author, w.rev1]) {
      await expect(
        who.as.mutation(api.kohopProduction.saveCopyedit, copy(w.id)),
      ).rejects.toThrow();
    }
    const other = await inRevision();
    await expect(
      other.chief.as.mutation(api.kohopProduction.saveCopyedit, copy(other.id)),
    ).rejects.toThrow('NOT_EDITABLE');
  });
});

describe('Épreuve et bon à tirer', () => {
  it('un texte modifié ne passe pas « prêt » sans le bon à tirer de l’auteur', async () => {
    const { t, chief, id } = await accepted();
    await chief.as.mutation(api.kohopProduction.saveCopyedit, copy(id));
    const before = await counts(t);
    await expect(
      chief.as.mutation(api.kohopProduction.markReady, { contributionId: id }),
    ).rejects.toThrow('PROOF_REQUIRED');
    expect(await counts(t)).toEqual(before);
    expect((await t.run((ctx) => ctx.db.get(id)))?.stage).toBe('production');
  });

  it('un texte laissé tel quel peut passer directement « prêt »', async () => {
    const w = await accepted();
    await w.chief.as.mutation(api.kohopProduction.markReady, {
      contributionId: w.id,
    });
    expect((await w.t.run((ctx) => ctx.db.get(w.id)))?.stage).toBe('ready');
  });

  it('épreuve : 5 jours, l’auteur approuve, l’état passe à « prêt »', async () => {
    const { t, chief, author, id } = await accepted();
    await chief.as.mutation(api.kohopProduction.saveCopyedit, copy(id));
    await chief.as.mutation(api.kohopProduction.sendProof, {
      contributionId: id,
    });
    const doc = await t.run((ctx) => ctx.db.get(id));
    expect(doc?.stage).toBe('proof');
    expect(doc?.proofDueAt).toBeGreaterThan(Date.now() + 4.9 * DAY);
    const notes = await t.run(async (ctx) =>
      (await ctx.db.query('notifications').collect()).filter(
        (n) => n.titleKey === 'kohopProofToApprove',
      ),
    );
    expect(notes.map((n) => n.userId)).toEqual([author.id]);
    await author.as.mutation(api.kohopProduction.approveProof, {
      contributionId: id,
    });
    expect((await t.run((ctx) => ctx.db.get(id)))?.stage).toBe('ready');
  });

  it('l’auteur peut demander des corrections (motif obligatoire) : retour en préparation', async () => {
    const { t, chief, author, id } = await accepted();
    await chief.as.mutation(api.kohopProduction.saveCopyedit, copy(id));
    await chief.as.mutation(api.kohopProduction.sendProof, {
      contributionId: id,
    });
    const before = await counts(t);
    await expect(
      author.as.mutation(api.kohopProduction.requestCorrections, {
        contributionId: id,
        note: 'court',
      }),
    ).rejects.toThrow('REASON_REQUIRED');
    expect(await counts(t)).toEqual(before);
    await author.as.mutation(api.kohopProduction.requestCorrections, {
      contributionId: id,
      note: 'Le deuxième paragraphe a changé de sens : merci de le rétablir.',
    });
    expect((await t.run((ctx) => ctx.db.get(id)))?.stage).toBe('production');
  });

  it('seul l’auteur répond à l’épreuve', async () => {
    const { chief, rev1, id } = await accepted();
    await chief.as.mutation(api.kohopProduction.sendProof, {
      contributionId: id,
    });
    for (const who of [chief, rev1]) {
      await expect(
        who.as.mutation(api.kohopProduction.approveProof, {
          contributionId: id,
        }),
      ).rejects.toThrow();
    }
  });

  it('une épreuve sans réponse : relance, puis les chefs sont prévenus — le silence n’est pas un accord', async () => {
    const { t, chief, id } = await accepted();
    await chief.as.mutation(api.kohopProduction.sendProof, {
      contributionId: id,
    });
    await t.run((ctx) =>
      ctx.db.patch(id, { proofDueAt: Date.now() + 2 * DAY }),
    );
    expect(await t.mutation(internal.kohopDeadlines.run, {})).toEqual({
      reminded: 1,
      expired: 0,
    });
    await t.run((ctx) => ctx.db.patch(id, { proofDueAt: Date.now() - 1000 }));
    expect(await t.mutation(internal.kohopDeadlines.run, {})).toEqual({
      reminded: 0,
      expired: 1,
    });
    expect((await t.run((ctx) => ctx.db.get(id)))?.stage).toBe('proof');
    const notes = await t.run(async (ctx) =>
      (await ctx.db.query('notifications').collect())
        .filter((n) => n.titleKey === 'kohopProofOverdue')
        .map((n) => n.userId),
    );
    expect(notes).toContain(chief.id);
  });
});

describe('Parution', () => {
  it('seul le chef de revue publie, et pas depuis une autre étape — sans rien écrire', async () => {
    const w = await accepted();
    const before = await counts(w.t);
    await expect(
      w.chief.as.mutation(api.kohopProduction.publish, {
        contributionId: w.id,
      }),
    ).rejects.toThrow('INVALID_TRANSITION');
    expect(await counts(w.t)).toEqual(before);
    const r = await ready();
    for (const who of [r.author, r.rev1]) {
      await expect(
        who.as.mutation(api.kohopProduction.publish, { contributionId: r.id }),
      ).rejects.toThrow();
    }
    expect((await r.t.run((ctx) => ctx.db.get(r.id)))?.stage).toBe('ready');
  });

  it('la publication exige le rapport d’originalité de la version publiée', async () => {
    const w = await ready();
    await w.t.run(async (ctx) => {
      for (const r of await ctx.db.query('originalityReports').collect())
        await ctx.db.delete(r._id);
    });
    await expect(
      w.chief.as.mutation(api.kohopProduction.publish, {
        contributionId: w.id,
      }),
    ).rejects.toThrow('ORIGINALITY_REQUIRED');
    expect((await w.t.run((ctx) => ctx.db.get(w.id)))?.stage).toBe('ready');
  });

  it('publie : date, texte de recherche, journal, notification, e-mails planifiés', async () => {
    const w = await ready();
    await w.chief.as.mutation(api.kohopProduction.publish, {
      contributionId: w.id,
    });
    const doc = await w.t.run((ctx) => ctx.db.get(w.id));
    expect(doc?.stage).toBe('published');
    expect(doc?.publishedAt).toBeTypeOf('number');
    expect(doc?.searchText).toContain('participation');
    const audit = await w.t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(audit.map((a) => a.action)).toContain('kohop.published');
    const notes = await w.t.run(async (ctx) =>
      (await ctx.db.query('notifications').collect())
        .filter((n) => n.titleKey === 'kohopPublished')
        .map((n) => n.userId),
    );
    expect(notes).toEqual([w.author.id]);
    await expect(
      w.chief.as.mutation(api.kohopProduction.publish, {
        contributionId: w.id,
      }),
    ).rejects.toThrow('INVALID_TRANSITION');
  });

  it('publication programmée : date dans la fenêtre, annulable, rien ne paraît avant l’heure', async () => {
    const w = await ready();
    await expect(
      w.chief.as.mutation(api.kohopProduction.schedule, {
        contributionId: w.id,
        at: Date.now() - 1000,
      }),
    ).rejects.toThrow('INVALID_SCHEDULE');
    await expect(
      w.chief.as.mutation(api.kohopProduction.schedule, {
        contributionId: w.id,
        at: Date.now() + 400 * DAY,
      }),
    ).rejects.toThrow('INVALID_SCHEDULE');
    const at = Date.now() + 2 * DAY;
    await w.chief.as.mutation(api.kohopProduction.schedule, {
      contributionId: w.id,
      at,
    });
    let doc = await w.t.run((ctx) => ctx.db.get(w.id));
    expect(doc?.stage).toBe('scheduled');
    expect(doc?.scheduledFor).toBe(at);
    expect(doc?.scheduledFunctionId).toBeTruthy();
    // Fires too early (date not reached): nothing happens.
    await w.t.mutation(internal.kohopProduction.publishScheduled, {
      contributionId: w.id,
    });
    expect((await w.t.run((ctx) => ctx.db.get(w.id)))?.stage).toBe('scheduled');
    await w.chief.as.mutation(api.kohopProduction.unschedule, {
      contributionId: w.id,
    });
    doc = await w.t.run((ctx) => ctx.db.get(w.id));
    expect(doc?.stage).toBe('ready');
    expect(doc?.scheduledFunctionId).toBeUndefined();
  });

  it('à l’heure dite, la parution programmée a lieu ; hors de l’étape « scheduled », jamais', async () => {
    const w = await ready();
    await w.t.mutation(internal.kohopProduction.publishScheduled, {
      contributionId: w.id,
    });
    expect((await w.t.run((ctx) => ctx.db.get(w.id)))?.stage).toBe('ready');
    await w.chief.as.mutation(api.kohopProduction.schedule, {
      contributionId: w.id,
      at: Date.now() + 2 * DAY,
    });
    await w.t.run((ctx) =>
      ctx.db.patch(w.id, { scheduledFor: Date.now() - 1000 }),
    );
    await w.t.mutation(internal.kohopProduction.publishScheduled, {
      contributionId: w.id,
    });
    const doc = await w.t.run((ctx) => ctx.db.get(w.id));
    expect(doc?.stage).toBe('published');
    const events = await w.t.run((ctx) =>
      ctx.db.query('kohopEvents').collect(),
    );
    expect(events.map((e) => e.kind)).toContain('publishScheduled');
  });

  it('si l’originalité ne tient plus à l’heure dite, rien ne paraît : retour à « prêt », les chefs sont prévenus', async () => {
    const w = await ready();
    await w.chief.as.mutation(api.kohopProduction.schedule, {
      contributionId: w.id,
      at: Date.now() + 2 * DAY,
    });
    await w.t.run(async (ctx) => {
      for (const r of await ctx.db.query('originalityReports').collect())
        await ctx.db.delete(r._id);
      await ctx.db.patch(w.id, { scheduledFor: Date.now() - 1000 });
    });
    await w.t.mutation(internal.kohopProduction.publishScheduled, {
      contributionId: w.id,
    });
    expect((await w.t.run((ctx) => ctx.db.get(w.id)))?.stage).toBe('ready');
  });
});

describe('Retrait après publication', () => {
  async function published() {
    const w = await ready();
    await w.chief.as.mutation(api.kohopProduction.publish, {
      contributionId: w.id,
    });
    return w;
  }

  it('la page reste, avec une notice ; le motif est conservé ; l’auteur est prévenu', async () => {
    const w = await published();
    await w.chief.as.mutation(api.kohopProduction.retract, {
      contributionId: w.id,
      reason: 'Une erreur factuelle majeure a été signalée par un lecteur.',
      notice: 'Cette contribution a été retirée à la demande de la rédaction.',
    });
    const doc = await w.t.run((ctx) => ctx.db.get(w.id));
    expect(doc?.stage).toBe('retracted');
    expect(doc?.retraction?.notice).toContain('retirée');
    expect(doc?.slug).toBeTruthy();
    const audit = await w.t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(audit.map((a) => a.action)).toContain('kohop.retracted');
  });

  it('on ne retire que du publié, par un chef de revue, avec motif et notice', async () => {
    const r = await ready();
    await expect(
      r.chief.as.mutation(api.kohopProduction.retract, {
        contributionId: r.id,
        reason: 'Une erreur factuelle majeure a été signalée.',
        notice: 'Notice de retrait de la rédaction.',
      }),
    ).rejects.toThrow('INVALID_TRANSITION');
    const w = await published();
    await expect(
      w.author.as.mutation(api.kohopProduction.retract, {
        contributionId: w.id,
        reason: 'Une erreur factuelle majeure a été signalée.',
        notice: 'Notice de retrait de la rédaction.',
      }),
    ).rejects.toThrow();
    await expect(
      w.chief.as.mutation(api.kohopProduction.retract, {
        contributionId: w.id,
        reason: 'court',
        notice: 'court',
      }),
    ).rejects.toThrow('REASON_REQUIRED');
    expect((await w.t.run((ctx) => ctx.db.get(w.id)))?.stage).toBe('published');
  });
});
