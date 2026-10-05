// @vitest-environment edge-runtime
import { describe, it, expect, afterEach, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import { USER_DATA_MODULES, advanceDeletion } from './lib/accountDeletion';
import { exportUserDataKohop } from './kohopUserData';
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

// KOHOP batch 8 — deletion and export of an account's KOHOP data (D-14).
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

async function published() {
  const w = await accepted();
  await w.chief.as.mutation(api.kohopProduction.markReady, {
    contributionId: w.id,
  });
  await drain(w.t);
  await w.chief.as.mutation(api.kohopProduction.publish, {
    contributionId: w.id,
  });
  return w;
}

// Runs the REAL deletion registry for an account, then removes the row like the
// caller does.
async function eraseAccount(t: T, userId: Id<'users'>) {
  const email = (await t.run((ctx) => ctx.db.get(userId)))?.email ?? null;
  await t.run(async (ctx) => {
    let step = 0;
    for (let i = 0; i < 80; i++) {
      const r = await advanceDeletion(ctx, userId, step, { email });
      step = r.step;
      if (r.done) break;
    }
    expect(step).toBe(USER_DATA_MODULES.length);
    await ctx.db.delete(userId);
  });
}

const slugOf = async (t: T, id: Id<'kohopContributions'>) =>
  (await t.run((ctx) => ctx.db.get(id)))!.slug!;

describe('Suppression de compte — KOHOP', () => {
  it('le registre appelle KOHOP', () => {
    expect(USER_DATA_MODULES.map((m) => m.key)).toContain('kohop');
  });

  it('auteur : le texte publié et les analyses restent en ligne, sans lien avec le compte ; le reste disparaît', async () => {
    const w = await published();
    await w.t.run((ctx) =>
      ctx.db.patch(w.id, {
        coAuthors: [
          {
            name: 'Co Auteur',
            affiliation: 'Univ X',
            email: 'secret-co@example.org',
          },
        ],
      }),
    );
    // A second file of the same author, still a draft, with its subordinate rows.
    const draftId = await draft(w.author);
    const slug = await slugOf(w.t, w.id);
    const before = await w.t.query(api.kohopPublic.bySlug, { slug });
    const name = before!.authors[0].name;

    await eraseAccount(w.t, w.author.id);

    const page = await w.t.query(api.kohopPublic.bySlug, { slug });
    expect(page).not.toBeNull();
    expect(page!.authors[0].name).toBe(name);
    expect(page!.organization?.name).toBe('Institut Pilote');
    expect(page!.reviews).toHaveLength(2);
    expect(page!.response).toContain('Merci pour ces lectures');
    expect(JSON.stringify(page)).not.toContain('secret-co@');
    expect(
      (await w.t.query(api.kohopPublic.list, {})).map((c) => c.slug),
    ).toContain(slug);

    const kept = await w.t.run((ctx) => ctx.db.get(w.id));
    expect(kept?.coAuthors).toEqual([
      { name: 'Co Auteur', affiliation: 'Univ X' },
    ]);
    expect(kept?.authorSnapshot?.name).toBe(name);

    // The draft and everything that hangs on it are gone.
    expect(await w.t.run((ctx) => ctx.db.get(draftId))).toBeNull();
    const rows = await w.t.run(async (ctx) => ({
      versions: (await ctx.db.query('kohopVersions').collect()).filter(
        (v) => v.contributionId === draftId,
      ),
      events: (await ctx.db.query('kohopEvents').collect()).filter(
        (e) => e.contributionId === draftId,
      ),
    }));
    expect(rows.versions).toHaveLength(0);
    expect(rows.events).toHaveLength(0);
  });

  it('auteur : un dossier non publié (relecture en cours) est supprimé avec toutes ses dépendances', async () => {
    const w = await inReview();
    await eraseAccount(w.t, w.author.id);
    expect(await w.t.run((ctx) => ctx.db.get(w.id))).toBeNull();
    const left = await w.t.run(async (ctx) => ({
      reviewers: (await ctx.db.query('kohopReviewers').collect()).length,
      reviews: (await ctx.db.query('kohopReviews').collect()).length,
      versions: (await ctx.db.query('kohopVersions').collect()).length,
      reports: (await ctx.db.query('originalityReports').collect()).length,
      events: (await ctx.db.query('kohopEvents').collect()).length,
    }));
    expect(left).toEqual({
      reviewers: 0,
      reviews: 0,
      versions: 0,
      reports: 0,
      events: 0,
    });
  });

  it('relecteur : son analyse publiée reste signée, ses données personnelles et sa note confidentielle disparaissent', async () => {
    const w = await published();
    const slug = await slugOf(w.t, w.id);
    await eraseAccount(w.t, w.rev1.id);
    const page = await w.t.query(api.kohopPublic.bySlug, { slug });
    expect(page!.reviews.map((r) => r.displayName).sort()).toEqual([
      'Rita Relectrice',
      'Rémi Relecteur',
    ]);
    const dump = await w.t.run(async (ctx) => ({
      reviewers: await ctx.db.query('kohopReviewers').collect(),
      reviews: await ctx.db.query('kohopReviews').collect(),
    }));
    const scrubbed = dump.reviewers.find(
      (r) => r.userId === undefined && r.slot === 'titular' && r.name === '—',
    );
    expect(scrubbed).toBeTruthy();
    expect(scrubbed?.email).toBeUndefined();
    expect(scrubbed?.status).toBe('submitted');
    expect(scrubbed?.publicationConsentAt).toBeTypeOf('number');
    const own = dump.reviews.find((r) => r.displayName === 'Rémi Relecteur');
    expect(own?.noteToEditor).toBeUndefined();
    // The other reviewer is intact.
    expect(
      dump.reviews.find((r) => r.displayName === 'Rita Relectrice')
        ?.noteToEditor,
    ).toBeTruthy();
  });

  it('relecteur invité sur un dossier en cours : le suppléant prend sa place, sans trace du compte', async () => {
    const w = await inReview();
    await eraseAccount(w.t, w.rev1.id);
    const [first, , substitute] = await Promise.all(
      w.ids.map((i) => w.t.run((ctx) => ctx.db.get(i))),
    );
    expect(first?.userId).toBeUndefined();
    expect(first?.email).toBeUndefined();
    expect(first?.name).toBe('—');
    expect(first?.status).toBe('expired');
    expect(substitute?.status).toBe('invited');
    expect(substitute?.slot).toBe('titular');
  });

  it('relecteur : une analyse rendue sur un dossier en cours est conservée, sans nom', async () => {
    const w = await inRevision();
    await eraseAccount(w.t, w.rev1.id);
    const reviews = await w.t.run((ctx) =>
      ctx.db.query('kohopReviews').collect(),
    );
    expect(reviews).toHaveLength(2);
    expect(reviews.filter((r) => r.displayName === '—')).toHaveLength(1);
    expect(
      reviews.every(
        (r) => r.noteToEditor === undefined || r.displayName !== '—',
      ),
    ).toBe(true);
  });

  it('une personne extérieure sans compte : ses invitations par adresse sont supprimées', async () => {
    const w = await world();
    const id = await draft(w.author);
    const row = await w.t.run((ctx) =>
      ctx.db.insert('kohopReviewers', {
        contributionId: id,
        slot: 'titular',
        source: 'external',
        name: 'Ève Externe',
        email: 'eve@univ-externe.org',
        publicUrl: 'https://univ-externe.org/eve',
        status: 'declined',
        flags: [],
        remindersSent: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }),
    );
    // The account of the same address (created at acceptance) is erased.
    const eve = await account(w.t, 'visiteur', 'eve@univ-externe.org', {
      name: 'Ève Externe',
    });
    await eraseAccount(w.t, eve.id);
    expect(await w.t.run((ctx) => ctx.db.get(row))).toBeNull();
    // Someone else's file is untouched.
    expect(await w.t.run((ctx) => ctx.db.get(id))).not.toBeNull();
  });

  it('l’export contient les textes, les versions, les décisions et les analyses du compte — jamais l’adresse d’un tiers', async () => {
    const w = await published();
    const mine = await w.t.run((ctx) =>
      exportUserDataKohop(ctx, w.author.id, { email: 'auteur@pilote.org' }),
    );
    expect(mine.contributions).toHaveLength(1);
    expect(mine.contributions[0].versions.length).toBeGreaterThan(1);
    expect(mine.contributions[0].decisions.map((d) => d.kind)).toContain(
      'accepted',
    );
    expect(JSON.stringify(mine)).not.toContain('rev1@autre.org');
    const theirs = await w.t.run((ctx) =>
      exportUserDataKohop(ctx, w.rev1.id, { email: 'rev1@autre.org' }),
    );
    expect(theirs.asReviewer).toHaveLength(1);
    expect(theirs.asReviewer[0].review?.analysis).toContain('claire');
    expect(theirs.asReviewer[0].review?.noteToEditor).toContain(
      'confidentielle',
    );
    expect(theirs.contributions).toHaveLength(0);
  });
});
