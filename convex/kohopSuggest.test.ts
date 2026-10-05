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

// KOHOP batch 5 — suggestions of reviewers.
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

async function tagged(
  t: T,
  userId: Id<'users'>,
  over: { themes?: string[]; text?: string },
) {
  const row = await t.run((ctx) =>
    ctx.db
      .query('memberProfiles')
      .withIndex('by_userId', (q) => q.eq('userId', userId))
      .unique(),
  );
  await t.run((ctx) =>
    ctx.db.patch(row!._id, {
      themes: over.themes ?? row!.themes,
      searchText: over.text ?? row!.searchText,
    }),
  );
}

describe('Suggestions de relecteurs', () => {
  it('propose jusqu’à cinq membres dont le thème ou les mots recoupent le texte, avec la raison', async () => {
    const w = await world();
    const id = await draft(w.author);
    await tagged(w.t, w.rev1.id, { themes: ['participation'] });
    await tagged(w.t, w.rev2.id, {
      text: 'spécialiste du participation budget',
    });
    const out = await w.author.as.mutation(api.kohopSuggest.suggestReviewers, {
      contributionId: id,
    });
    expect(out.map((c) => c.displayName).sort()).toEqual([
      'Rita Relectrice',
      'Rémi Relecteur',
    ]);
    expect(
      out.find((c) => c.displayName === 'Rémi Relecteur')?.reasons,
    ).toContain('field');
    expect(
      out.find((c) => c.displayName === 'Rita Relectrice')?.reasons,
    ).toContain('keyword');
    // Nobody suggested without a reason.
    expect(out.map((c) => c.displayName)).not.toContain('Remplaçant Suppléant');
  });

  it('écarte l’auteur, ceux qui ont refusé, les déjà désignés et les liens bloquants — sans rien dire à l’auteur', async () => {
    const w = await world();
    const id = await draft(w.author);
    for (const u of [w.rev1, w.rev2, w.rev3])
      await tagged(w.t, u.id, { themes: ['participation'] });
    // rev3 opted out of being proposed.
    const p3 = await w.t.run((ctx) =>
      ctx.db
        .query('memberProfiles')
        .withIndex('by_userId', (q) => q.eq('userId', w.rev3.id))
        .unique(),
    );
    await w.t.run((ctx) => ctx.db.patch(p3!._id, { notReviewer: true }));
    // rev2 belongs to the author's organization: a blocking link.
    await attach(w.t, w.rev2.id, w.pilot);
    // rev1 is already designated.
    await w.author.as.mutation(api.kohop.proposeReviewer, {
      contributionId: id,
      userId: w.rev1.id,
      slot: 'titular',
      declaredRelationship: 'none',
    });
    const out = await w.author.as.mutation(api.kohopSuggest.suggestReviewers, {
      contributionId: id,
    });
    expect(out).toEqual([]);
  });

  it('un lien signalé reste pour le chef : l’historique le garde, la réponse à l’auteur ne le montre pas', async () => {
    const w = await world();
    const id = await draft(w.author);
    // Following each other is a flagged link (rule), not a blocking one.
    await w.t.run(async (ctx) => {
      const createdAt = Date.now();
      await ctx.db.insert('follows', {
        followerId: w.author.id,
        followeeId: w.rev1.id,
        createdAt,
      });
      await ctx.db.insert('follows', {
        followerId: w.rev1.id,
        followeeId: w.author.id,
        createdAt,
      });
    });
    await tagged(w.t, w.rev1.id, { themes: ['participation'] });
    const out = await w.author.as.mutation(api.kohopSuggest.suggestReviewers, {
      contributionId: id,
    });
    expect(out).toHaveLength(1);
    expect(JSON.stringify(out)).not.toContain('mutual_follow');
    const stored = await w.t.run((ctx) =>
      ctx.db.query('kohopSuggestions').collect(),
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].candidates[0].level).toBe('flagged');
    const audit = await w.t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(audit.map((a) => a.action)).toContain('kohop.suggested');
  });

  it('seul l’auteur demande des suggestions, et une désignation passe toujours par les règles du serveur', async () => {
    const w = await world();
    const id = await draft(w.author);
    await expect(
      w.rev1.as.mutation(api.kohopSuggest.suggestReviewers, {
        contributionId: id,
      }),
    ).rejects.toThrow('NOT_FOUND');
    await w.author.as.mutation(api.kohop.withdraw, { contributionId: id });
    await expect(
      w.author.as.mutation(api.kohopSuggest.suggestReviewers, {
        contributionId: id,
      }),
    ).rejects.toThrow('NOT_EDITABLE');
  });
});
