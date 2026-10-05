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

// KOHOP batch 3 — the reviewer's side: invitations, answer, analysis, deadlines.
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

describe('Invitations au lancement de la relecture', () => {
  it('invite les deux titulaires (5 jours pour répondre), garde le suppléant en réserve', async () => {
    const { t, id, ids } = await inReview();
    const rows = await Promise.all(
      ids.map((i) => t.run((ctx) => ctx.db.get(i))),
    );
    expect(rows.map((r) => r?.status)).toEqual([
      'invited',
      'invited',
      'approved',
    ]);
    const now = Date.now();
    for (const r of rows.slice(0, 2)) {
      expect(r?.dueAt).toBeGreaterThan(now + 4.9 * DAY);
      expect(r?.dueAt).toBeLessThan(now + 5.1 * DAY);
    }
    expect(rows[2]?.dueAt).toBeUndefined();
    const notes = await t.run(async (ctx) =>
      (await ctx.db.query('notifications').collect()).filter(
        (n) => n.titleKey === 'kohopReviewInvitation',
      ),
    );
    expect(notes).toHaveLength(2);
    expect(notes[0].link).toContain('/espace-membre/relectures/');
    expect((await t.run((ctx) => ctx.db.get(id)))?.stage).toBe('in_review');
  });

  it('chaque relecteur ne voit que sa propre invitation ; le suppléant ne voit rien', async () => {
    const { rev1, rev2, rev3, ids } = await inReview();
    expect(await rev1.as.query(api.kohopReviews.mine, {})).toHaveLength(1);
    expect(await rev3.as.query(api.kohopReviews.mine, {})).toHaveLength(0);
    expect(
      await rev2.as.query(api.kohopReviews.assignment, { reviewerId: ids[0] }),
    ).toBeNull();
    expect(
      await rev3.as.query(api.kohopReviews.assignment, { reviewerId: ids[2] }),
    ).toBeNull();
    await expect(
      rev2.as.mutation(api.kohopReviews.respond, {
        reviewerId: ids[0],
        accept: true,
        hasConflict: false,
        consent: true,
      }),
    ).rejects.toThrow('NOT_FOUND');
  });

  it('le texte n’est lisible qu’après l’acceptation', async () => {
    const { rev1, ids } = await inReview();
    const before = await rev1.as.query(api.kohopReviews.assignment, {
      reviewerId: ids[0],
    });
    expect(before?.body).toBeNull();
    expect(before?.contribution.title).toBeTruthy();
    await accept(rev1, ids[0]);
    const after = await rev1.as.query(api.kohopReviews.assignment, {
      reviewerId: ids[0],
    });
    expect(after?.body).toContain('Introduction');
  });
});

describe('Réponse à l’invitation', () => {
  it('accepter exige la déclaration d’absence de conflit et le consentement de publication', async () => {
    const { t, rev1, ids } = await inReview();
    const before = await counts(t);
    await expect(
      rev1.as.mutation(api.kohopReviews.respond, {
        reviewerId: ids[0],
        accept: true,
        hasConflict: true,
        consent: true,
      }),
    ).rejects.toThrow('CONFLICT_DECLARED');
    await expect(
      rev1.as.mutation(api.kohopReviews.respond, {
        reviewerId: ids[0],
        accept: true,
        hasConflict: false,
        consent: false,
      }),
    ).rejects.toThrow('CONSENT_REQUIRED');
    expect(await counts(t)).toEqual(before);
    await accept(rev1, ids[0]);
    const row = await t.run((ctx) => ctx.db.get(ids[0]));
    expect(row?.status).toBe('accepted');
    expect(row?.publicationConsentAt).toBeTypeOf('number');
    expect(row?.conflict?.hasConflict).toBe(false);
    expect(row?.dueAt).toBeGreaterThan(Date.now() + 13.9 * DAY);
  });

  it('une réponse ne se donne qu’une fois : la seconde n’écrit rien', async () => {
    const { t, rev1, ids } = await inReview();
    await accept(rev1, ids[0]);
    const before = await counts(t);
    await expect(accept(rev1, ids[0])).rejects.toThrow('INVALID_TRANSITION');
    expect(await counts(t)).toEqual(before);
  });

  it('un refus appelle le suppléant, qui devient titulaire et est invité', async () => {
    const { t, rev1, ids, id } = await inReview();
    await rev1.as.mutation(api.kohopReviews.respond, {
      reviewerId: ids[0],
      accept: false,
      hasConflict: false,
      suggestedName: 'Quelqu’un d’autre',
      note: 'Pas ma spécialité.',
    });
    const [declined, , substitute] = await Promise.all(
      ids.map((i) => t.run((ctx) => ctx.db.get(i))),
    );
    expect(declined?.status).toBe('declined');
    expect(declined?.dueAt).toBeUndefined();
    expect(declined?.suggestedInstead?.name).toBe('Quelqu’un d’autre');
    expect(substitute?.status).toBe('invited');
    expect(substitute?.slot).toBe('titular');
    expect((await t.run((ctx) => ctx.db.get(id)))?.stage).toBe('in_review');
  });

  it('sans suppléant, les chefs de revue et l’auteur sont prévenus', async () => {
    const { t, rev1, rev3, ids, chief } = await inReview();
    // The substitute was never invited: the call finds nothing.
    await expect(
      rev3.as.mutation(api.kohopReviews.respond, {
        reviewerId: ids[2],
        accept: false,
        hasConflict: false,
      }),
    ).rejects.toThrow('NOT_FOUND');
    await rev1.as.mutation(api.kohopReviews.respond, {
      reviewerId: ids[0],
      accept: false,
      hasConflict: false,
    });
    // The substitute took the place; the second refusal finds nobody left.
    const second = (await rev3.as.query(api.kohopReviews.mine, {}))[0];
    await rev3.as.mutation(api.kohopReviews.respond, {
      reviewerId: second._id,
      accept: false,
      hasConflict: false,
    });
    const needed = await t.run(async (ctx) =>
      (await ctx.db.query('notifications').collect()).filter(
        (n) => n.titleKey === 'kohopReviewerNeeded',
      ),
    );
    expect(needed.map((n) => n.userId)).toContain(chief.id);
  });
});

describe('Analyse', () => {
  it('exige 150 à 1 500 mots, du texte simple et une note de 2 000 signes au plus', async () => {
    const { t, rev1, ids } = await inReview();
    await accept(rev1, ids[0]);
    const before = await counts(t);
    await expect(
      rev1.as.mutation(
        api.kohopReviews.saveReview,
        review(ids[0], { analysis: words(40) }),
      ),
    ).rejects.toThrow('ANALYSIS_TOO_SHORT');
    await expect(
      rev1.as.mutation(
        api.kohopReviews.saveReview,
        review(ids[0], { analysis: words(1600) }),
      ),
    ).rejects.toThrow('ANALYSIS_TOO_LONG');
    await expect(
      rev1.as.mutation(
        api.kohopReviews.saveReview,
        review(ids[0], { analysis: `<script>x</script> ${words(200)}` }),
      ),
    ).rejects.toThrow('ANALYSIS_UNSUPPORTED');
    await expect(
      rev1.as.mutation(
        api.kohopReviews.saveReview,
        review(ids[0], { noteToEditor: 'x'.repeat(2001) }),
      ),
    ).rejects.toThrow('INVALID_NOTE');
    expect(await counts(t)).toEqual(before);
  });

  it('on ne rend pas d’analyse avant d’avoir accepté', async () => {
    const { rev1, ids } = await inReview();
    await expect(
      rev1.as.mutation(api.kohopReviews.saveReview, review(ids[0])),
    ).rejects.toThrow('INVALID_TRANSITION');
  });

  it('deux analyses font passer le dossier en révision, l’auteur est prévenu, la note reste confidentielle', async () => {
    const { t, rev1, rev2, author, ids, id } = await inReview();
    await accept(rev1, ids[0]);
    await accept(rev2, ids[1]);
    await rev1.as.mutation(api.kohopReviews.saveReview, review(ids[0]));
    expect((await t.run((ctx) => ctx.db.get(id)))?.stage).toBe('in_review');
    await rev2.as.mutation(
      api.kohopReviews.saveReview,
      review(ids[1], { recommendation: 'reserves' }),
    );
    const doc = await t.run((ctx) => ctx.db.get(id));
    expect(doc?.stage).toBe('revision');
    expect(doc?.revisionDueAt).toBeGreaterThan(Date.now() + 13.9 * DAY);
    const notified = await t.run(async (ctx) =>
      (await ctx.db.query('notifications').collect()).filter(
        (n) => n.titleKey === 'kohopReviewsReady',
      ),
    );
    expect(notified.map((n) => n.userId)).toEqual([author.id]);
    // The confidential note is in no author-facing answer.
    const mine = JSON.stringify(
      await author.as.query(api.kohop.getMine, { contributionId: id }),
    );
    expect(mine).not.toContain('confidentielle');
    // Frozen once the review is complete.
    await expect(
      rev1.as.mutation(
        api.kohopReviews.saveReview,
        review(ids[0], { recommendation: 'defavorable' }),
      ),
    ).rejects.toThrow('INVALID_TRANSITION');
  });

  it('une analyse se corrige tant que la relecture est ouverte', async () => {
    const { t, rev1, ids } = await inReview();
    await accept(rev1, ids[0]);
    await rev1.as.mutation(api.kohopReviews.saveReview, review(ids[0]));
    await rev1.as.mutation(
      api.kohopReviews.saveReview,
      review(ids[0], { recommendation: 'reserves' }),
    );
    const rows = await t.run((ctx) => ctx.db.query('kohopReviews').collect());
    expect(rows).toHaveLength(1);
    expect(rows[0].recommendation).toBe('reserves');
    expect(rows[0].displayName).toBe('Rémi Relecteur');
  });
});

describe('Échéances (cron)', () => {
  it('rappelle une fois avant l’échéance, sans répéter', async () => {
    const { t, ids } = await inReview();
    await t.run((ctx) => ctx.db.patch(ids[0], { dueAt: Date.now() + 2 * DAY }));
    expect(await t.mutation(internal.kohopDeadlines.run, {})).toEqual({
      reminded: 1,
      expired: 0,
    });
    expect(await t.mutation(internal.kohopDeadlines.run, {})).toEqual({
      reminded: 0,
      expired: 0,
    });
    expect((await t.run((ctx) => ctx.db.get(ids[0])))?.remindersSent).toBe(1);
  });

  it('une invitation sans réponse expire, et le suppléant est invité', async () => {
    const { t, ids } = await inReview();
    await t.run((ctx) => ctx.db.patch(ids[0], { dueAt: Date.now() - 1000 }));
    expect(await t.mutation(internal.kohopDeadlines.run, {})).toEqual({
      reminded: 0,
      expired: 1,
    });
    const [gone, , substitute] = await Promise.all(
      ids.map((i) => t.run((ctx) => ctx.db.get(i))),
    );
    expect(gone?.status).toBe('expired');
    expect(gone?.dueAt).toBeUndefined();
    expect(substitute?.status).toBe('invited');
    const audit = await t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(audit.map((a) => a.action)).toContain('kohop.reviewer_expired');
  });

  it('une réponse tardive à une invitation expirée est refusée', async () => {
    const { t, rev1, ids } = await inReview();
    await t.run((ctx) => ctx.db.patch(ids[0], { dueAt: Date.now() - 1000 }));
    await expect(accept(rev1, ids[0])).rejects.toThrow('INVITATION_EXPIRED');
  });

  it('ne touche ni un relecteur qui a déjà rendu son analyse, ni un dossier hors relecture', async () => {
    const { t, rev1, ids } = await inReview();
    await accept(rev1, ids[0]);
    await rev1.as.mutation(api.kohopReviews.saveReview, review(ids[0]));
    expect((await t.run((ctx) => ctx.db.get(ids[0])))?.dueAt).toBeUndefined();
    expect(await t.mutation(internal.kohopDeadlines.run, {})).toEqual({
      reminded: 0,
      expired: 0,
    });
  });
});

describe('Récusation par le chef pendant la relecture', () => {
  it('un titulaire invité récusé est remplacé par le suppléant', async () => {
    const { t, chief, ids } = await inReview();
    await chief.as.mutation(api.kohopChief.recuseReviewer, {
      reviewerId: ids[0],
      reason: 'insufficient_expertise',
    });
    const substitute = await t.run((ctx) => ctx.db.get(ids[2]));
    expect(substitute?.status).toBe('invited');
    expect(substitute?.slot).toBe('titular');
  });
});
