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

// KOHOP batch 6 — the PUBLIC projection (serialization test, plan section 5 rule 5).
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

// A file ready to publish, text unchanged by the copy-editing.
async function ready() {
  const w = await accepted();
  await w.chief.as.mutation(api.kohopProduction.markReady, {
    contributionId: w.id,
  });
  await drain(w.t);
  return w;
}

async function published() {
  const w = await ready();
  await w.chief.as.mutation(api.kohopProduction.publish, {
    contributionId: w.id,
  });
  return w;
}

// Everything that must never leave, planted in the database.
async function plantSecrets(w: Awaited<ReturnType<typeof published>>) {
  await w.t.run(async (ctx) => {
    await ctx.db.patch(w.id, {
      coAuthors: [
        {
          name: 'Co Auteur',
          affiliation: 'Université X',
          email: 'secret-coauthor@example.org',
        },
      ],
    });
    // A rejected reviewer, with a name nobody must read.
    await ctx.db.insert('kohopReviewers', {
      contributionId: w.id,
      slot: 'substitute',
      source: 'directory',
      name: 'Personne Récusée',
      email: 'recusee-secrete@example.org',
      status: 'recused',
      flags: [],
      remindersSent: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    // A working version nobody published.
    await ctx.db.insert('kohopVersions', {
      contributionId: w.id,
      version: 99,
      kind: 'revision',
      title: 'MARQUEUR_VERSION_TRAVAIL',
      standfirst: 'MARQUEUR_VERSION_TRAVAIL',
      body: 'MARQUEUR_VERSION_TRAVAIL',
      links: [],
      wordCount: 1,
      createdBy: w.author.id,
      createdAt: Date.now(),
    });
    await ctx.db.insert('originalityReports', {
      contributionId: w.id,
      version: 2,
      scope: 'platform',
      status: 'done',
      matches: [
        {
          sourceType: 'kohop',
          sourceTitle: 'MARQUEUR_ORIGINALITE',
          passage: 'MARQUEUR_ORIGINALITE',
        },
      ],
      summary: 'MARQUEUR_ORIGINALITE',
      checkedAt: Date.now(),
    });
    const reviewer = (await ctx.db.query('kohopReviewers').collect())[0];
    await ctx.db.insert('kohopLinkChecks', {
      contributionId: w.id,
      reviewerId: reviewer._id,
      level: 'flagged',
      findings: [
        {
          type: 'external_cosign',
          detail: 'MARQUEUR_LIEN',
          source: 'OpenAlex',
        },
      ],
      origin: 'external',
      checkedAt: Date.now(),
    });
    await ctx.db.insert('kohopSuggestions', {
      contributionId: w.id,
      candidates: [],
      createdAt: Date.now(),
    });
  });
}

const FORBIDDEN = [
  '@', // no e-mail address of anyone
  'Note confidentielle',
  'Note réservée',
  'Personne Récusée',
  'MARQUEUR_VERSION_TRAVAIL',
  'MARQUEUR_ORIGINALITE',
  'MARQUEUR_LIEN',
  'external_cosign',
  'noteToEditor',
  'inviteTokenHash',
  'reviewerId',
  'authorUserId',
];

function assertClean(value: unknown) {
  const text = JSON.stringify(value);
  for (const needle of FORBIDDEN) {
    expect(text, `must not contain ${needle}`).not.toContain(needle);
  }
}

describe('Projection publique figée', () => {
  it('une page publiée ne contient ni e-mail, ni note confidentielle, ni relecteur récusé, ni version de travail, ni rapport, ni vérification de liens', async () => {
    const w = await published();
    await plantSecrets(w);
    const slug = (await w.t.run((ctx) => ctx.db.get(w.id)))!.slug!;
    const page = await w.t.query(api.kohopPublic.bySlug, { slug });
    expect(page).not.toBeNull();
    assertClean(page);
    // Anonymous: no identity involved.
    assertClean(await w.t.query(api.kohopPublic.list, {}));
  });

  it('la forme exacte de la réponse est figée (un champ ajouté en base ne sort pas)', async () => {
    const w = await published();
    const slug = (await w.t.run((ctx) => ctx.db.get(w.id)))!.slug!;
    const page = await w.t.query(api.kohopPublic.bySlug, { slug });
    expect(Object.keys(page!).sort()).toEqual(
      [
        'authors',
        'body',
        'fields',
        'keywords',
        'lang',
        'licence',
        'links',
        'minutes',
        'organization',
        'path',
        'publishedAt',
        'response',
        'retraction',
        'reviews',
        'slug',
        'standfirst',
        'submitted',
        'title',
        'wordCount',
      ].sort(),
    );
    const list = await w.t.query(api.kohopPublic.list, {});
    expect(Object.keys(list[0]).sort()).toEqual(
      [
        'authors',
        'fields',
        'lang',
        'minutes',
        'organization',
        'publishedAt',
        'slug',
        'standfirst',
        'title',
      ].sort(),
    );
  });

  it('montre le parcours daté, les analyses signées, la réponse de l’auteur et la version soumise', async () => {
    const w = await published();
    const slug = (await w.t.run((ctx) => ctx.db.get(w.id)))!.slug!;
    const page = (await w.t.query(api.kohopPublic.bySlug, { slug }))!;
    expect(page.reviews).toHaveLength(2);
    expect(page.reviews.map((r) => r.displayName).sort()).toEqual([
      'Rita Relectrice',
      'Rémi Relecteur',
    ]);
    expect(page.response).toContain('Merci pour ces lectures');
    expect(page.submitted?.body).toContain('Introduction');
    const kinds = page.path.map((p) => p.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        'submit',
        'startReview',
        'review_submitted',
        'accept',
        'publish',
      ]),
    );
    // The path is in date order.
    expect([...page.path].sort((a, b) => a.at - b.at)).toEqual(page.path);
    expect(page.licence).toBe('CC BY 4.0');
    expect(page.authors[0].name).toBeTruthy();
  });

  it('un relecteur qui n’a pas consenti à la publication n’y figure pas', async () => {
    const w = await published();
    const reviewers = await w.t.run((ctx) =>
      ctx.db.query('kohopReviewers').collect(),
    );
    const target = reviewers.find((r) => r.name === 'Rémi Relecteur')!;
    await w.t.run((ctx) =>
      ctx.db.patch(target._id, { publicationConsentAt: undefined }),
    );
    const slug = (await w.t.run((ctx) => ctx.db.get(w.id)))!.slug!;
    const page = (await w.t.query(api.kohopPublic.bySlug, { slug }))!;
    expect(page.reviews.map((r) => r.displayName)).toEqual(['Rita Relectrice']);
  });

  it('un dossier non publié n’existe pas pour le public : ni par adresse, ni dans la liste', async () => {
    const w = await ready();
    const slug = (await w.t.run((ctx) => ctx.db.get(w.id)))!.slug!;
    expect(await w.t.query(api.kohopPublic.bySlug, { slug })).toBeNull();
    expect(await w.t.query(api.kohopPublic.list, {})).toEqual([]);
    expect(
      await w.t.query(api.kohopPublic.bySlug, { slug: 'inexistant' }),
    ).toBeNull();
  });

  it('un retrait garde la page avec la notice, jamais le motif interne', async () => {
    const w = await published();
    await w.chief.as.mutation(api.kohopProduction.retract, {
      contributionId: w.id,
      reason:
        'MOTIF_INTERNE_CONFIDENTIEL : le texte reprend un passage sans citer.',
      notice: 'Cette contribution a été retirée à la demande de la rédaction.',
    });
    const slug = (await w.t.run((ctx) => ctx.db.get(w.id)))!.slug!;
    const page = (await w.t.query(api.kohopPublic.bySlug, { slug }))!;
    expect(page.retraction?.notice).toContain('retirée');
    expect(JSON.stringify(page)).not.toContain('MOTIF_INTERNE_CONFIDENTIEL');
    // Retracted pages leave the list.
    expect(await w.t.query(api.kohopPublic.list, {})).toEqual([]);
  });

  it('filtres par champ et par langue, et page d’organisation', async () => {
    const w = await published();
    expect(
      await w.t.query(api.kohopPublic.list, { field: 'citizen-participation' }),
    ).toHaveLength(1);
    expect(
      await w.t.query(api.kohopPublic.list, { field: 'health' }),
    ).toHaveLength(0);
    expect(await w.t.query(api.kohopPublic.list, { lang: 'fr' })).toHaveLength(
      1,
    );
    expect(await w.t.query(api.kohopPublic.list, { lang: 'en' })).toHaveLength(
      0,
    );
    const org = await w.t.run((ctx) => ctx.db.get(w.pilot));
    expect(
      await w.t.query(api.kohopPublic.byOrganization, {
        organizationSlug: org!.slug,
      }),
    ).toHaveLength(1);
    expect(
      await w.t.query(api.kohopPublic.byOrganization, {
        organizationSlug: 'autre',
      }),
    ).toEqual([]);
  });

  it('la recherche globale ne trouve que les contributions PUBLIÉES', async () => {
    const w = await ready();
    // convex-test's search filter cannot read a document WITHOUT `searchText`
    // (the real engine skips it): give every unpublished file an empty one.
    await w.t.run(async (ctx) => {
      for (const o of await ctx.db.query('organizations').collect()) {
        if (o.searchText === undefined)
          await ctx.db.patch(o._id, { searchText: '' });
      }
      for (const c of await ctx.db.query('kohopContributions').collect()) {
        if (c.searchText === undefined)
          await ctx.db.patch(c._id, { searchText: '' });
      }
    });
    const before = await w.t.query(api.search.globalSearch, {
      q: 'participation',
    });
    expect(JSON.stringify(before)).not.toContain('/kohop/');
    await w.chief.as.mutation(api.kohopProduction.publish, {
      contributionId: w.id,
    });
    const after = await w.t.query(api.search.globalSearch, {
      q: 'participation',
    });
    const hits = after.sections.flatMap(
      (x: { hits: { path: string }[] }) => x.hits,
    );
    expect(
      hits.some((h: { path: string }) => h.path.startsWith('/kohop/')),
    ).toBe(true);
    // Retracted: out of the search, still reachable by address.
    await w.chief.as.mutation(api.kohopProduction.retract, {
      contributionId: w.id,
      reason: 'Une erreur factuelle majeure a été signalée par un lecteur.',
      notice: 'Cette contribution a été retirée à la demande de la rédaction.',
    });
    const retracted = await w.t.query(api.search.globalSearch, {
      q: 'participation',
    });
    expect(JSON.stringify(retracted)).not.toContain('/kohop/');
  });
});
