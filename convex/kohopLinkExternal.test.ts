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

// KOHOP batch 5 — links found outside the platform (OpenAlex through ORCID).
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

async function proposed() {
  const w = await world();
  const id = await draft(w.author);
  const reviewerId = await w.author.as.mutation(api.kohop.proposeReviewer, {
    contributionId: id,
    userId: w.rev1.id,
    slot: 'titular',
    declaredRelationship: 'none',
  });
  return { ...w, id, reviewerId };
}

async function orcid(t: T, userId: Id<'users'>, iD: string) {
  const find = () =>
    t.run((ctx) =>
      ctx.db
        .query('memberProfiles')
        .withIndex('by_userId', (q) => q.eq('userId', userId))
        .unique(),
    );
  // The author has no directory profile in this world: one is created.
  if (!(await find())) await profile(t, userId, `Membre ${String(userId)}`);
  const row = await find();
  await t.run((ctx) =>
    ctx.db.patch(row!._id, {
      links: [{ kind: 'orcid', url: `https://orcid.org/${iD}` }],
    }),
  );
}

const lastCheck = (t: T, reviewerId: Id<'kohopReviewers'>) =>
  t.run(async (ctx) =>
    (
      await ctx.db
        .query('kohopLinkChecks')
        .withIndex('by_reviewer', (q) => q.eq('reviewerId', reviewerId))
        .order('desc')
        .collect()
    ).find((c) => c.origin === 'external'),
  );

/** The host of a requested URL — compared whole, never searched for as a substring. */
const hostOf = (url: string) => new URL(url).host;

describe('Liens trouvés hors plateforme', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('deux ORCID et une cosignature récente : lien signalé (jamais bloquant), vu du chef seul', async () => {
    const w = await proposed();
    await orcid(w.t, w.author.id, '0000-0002-1825-0097');
    await orcid(w.t, w.rev1.id, '0000-0001-5109-370X');
    const fetchMock = vi.fn(async (url: string) => {
      // ORCID employments: none published. Only the works answer matters here.
      if (hostOf(url) === 'pub.orcid.org') {
        return new Response(JSON.stringify({ 'affiliation-group': [] }), {
          status: 200,
        });
      }
      expect(hostOf(url)).toBe('api.openalex.org');
      expect(new URL(url).pathname).toBe('/works');
      return new Response(
        JSON.stringify({
          meta: { count: 1 },
          results: [
            {
              id: 'https://openalex.org/W1',
              title: 'Un article commun',
              publication_year: 2024,
            },
          ],
        }),
        { status: 200 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);
    await w.t.action(internal.kohopLinkExternal.check, {
      reviewerId: w.reviewerId,
    });
    const check = await lastCheck(w.t, w.reviewerId);
    expect(check?.level).toBe('flagged');
    expect(check?.findings[0].type).toBe('external_cosign');
    expect(check?.failed).toBeUndefined();
    const row = await w.t.run((ctx) => ctx.db.get(w.reviewerId));
    expect(row?.flags).toContain('external_cosign');
    expect(row?.status).toBe('proposed');

    const dossier = await w.chief.as.query(api.kohopChief.dossier, {
      contributionId: w.id,
    });
    const checks = dossier.reviewers[0].linkChecks;
    expect(
      checks.some((c) => c.origin === 'external' && c.findings.length === 1),
    ).toBe(true);
    const mine = JSON.stringify(
      await w.author.as.query(api.kohop.getMine, { contributionId: w.id }),
    );
    expect(mine).not.toContain('external_cosign');
    expect(mine).not.toContain('Un article commun');
  });

  it('sans ORCID d’un côté : la vérification n’a pas pu avoir lieu, et c’est dit', async () => {
    const w = await proposed();
    await orcid(w.t, w.author.id, '0000-0002-1825-0097');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await w.t.action(internal.kohopLinkExternal.check, {
      reviewerId: w.reviewerId,
    });
    const check = await lastCheck(w.t, w.reviewerId);
    expect(check?.failed).toBe(true);
    expect(check?.error).toBe('NO_ORCID');
    expect(check?.findings).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('une base injoignable ou une réponse inattendue : échec enregistré, jamais « rien à signaler »', async () => {
    const w = await proposed();
    await orcid(w.t, w.author.id, '0000-0002-1825-0097');
    await orcid(w.t, w.rev1.id, '0000-0001-5109-370X');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    await w.t.action(internal.kohopLinkExternal.check, {
      reviewerId: w.reviewerId,
    });
    expect((await lastCheck(w.t, w.reviewerId))?.failed).toBe(true);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"oops":1}', { status: 200 })),
    );
    await w.t.action(internal.kohopLinkExternal.check, {
      reviewerId: w.reviewerId,
    });
    const last = await lastCheck(w.t, w.reviewerId);
    expect(last?.failed).toBe(true);
    expect(last?.error).toBe('INVALID_ANSWER');
  });

  it('aucune cosignature : rien de signalé, sans échec', async () => {
    const w = await proposed();
    await orcid(w.t, w.author.id, '0000-0002-1825-0097');
    await orcid(w.t, w.rev1.id, '0000-0001-5109-370X');
    vi.stubGlobal('fetch', fetchAnswering({ works: 0, employments: [] }));
    await w.t.action(internal.kohopLinkExternal.check, {
      reviewerId: w.reviewerId,
    });
    const check = await lastCheck(w.t, w.reviewerId);
    expect(check?.level).toBe('none');
    expect(check?.failed).toBeUndefined();
  });

  const employment = (name: string, from: number, to?: number) => ({
    summaries: [
      {
        'employment-summary': {
          organization: { name },
          'start-date': { year: { value: String(from) } },
          'end-date': to ? { year: { value: String(to) } } : null,
        },
      },
    ],
  });

  /** A fetch that answers OpenAlex, ORCID, and (optionally) the AI gateway. */
  function fetchAnswering(options: {
    works: number;
    employments: ReturnType<typeof employment>[];
    gateway?: 'ok' | 'down';
  }) {
    return vi.fn(async (url: string) => {
      if (hostOf(url) === 'api.openalex.org') {
        return Response.json({
          meta: { count: options.works },
          results:
            options.works > 0
              ? [
                  {
                    id: 'https://openalex.org/W9',
                    title: 'Un article commun',
                    publication_year: 2025,
                  },
                ]
              : [],
        });
      }
      if (hostOf(url) === 'pub.orcid.org') {
        return Response.json({ 'affiliation-group': options.employments });
      }
      if (options.gateway === 'down')
        return new Response('no', { status: 500 });
      return Response.json({
        output_text: JSON.stringify({
          summary: 'Les deux personnes ont une affiliation commune récente.',
        }),
      });
    });
  }

  it('une affiliation commune dans les cinq ans : lien signalé, et l’IA en fait une synthèse avec les liens vers les sources', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'test-key');
    const w = await proposed();
    await orcid(w.t, w.author.id, '0000-0002-1825-0097');
    await orcid(w.t, w.rev1.id, '0000-0001-5109-370X');
    const year = new Date().getUTCFullYear();
    vi.stubGlobal(
      'fetch',
      fetchAnswering({
        works: 0,
        employments: [employment('Université de Dakar', year - 2)],
      }),
    );
    await w.t.action(internal.kohopLinkExternal.check, {
      reviewerId: w.reviewerId,
    });
    const check = await w.t.run(
      async (ctx) =>
        (await ctx.db
          .query('kohopLinkChecks')
          .withIndex('by_reviewer', (q) => q.eq('reviewerId', w.reviewerId))
          .order('desc')
          .first())!,
    );
    expect(check.level).toBe('flagged');
    expect(check.findings.map((f) => f.type)).toEqual(['external_affiliation']);
    expect(check.findings[0].url).toBe('https://orcid.org/0000-0001-5109-370X');
    expect(check.origin).toBe('ai');
    expect(check.synthesis).toContain('affiliation commune');
    expect(check.model).toBeDefined();
    const row = await w.t.run((ctx) => ctx.db.get(w.reviewerId));
    expect(row?.flags).toContain('external_affiliation');
    expect(row?.status).toBe('proposed');
    // The review chief reads it; the author never does.
    const dossier = await w.chief.as.query(api.kohopChief.dossier, {
      contributionId: w.id,
    });
    expect(
      dossier.reviewers[0].linkChecks.some((c) => c.synthesis !== null),
    ).toBe(true);
    const mine = JSON.stringify(
      await w.author.as.query(api.kohop.getMine, { contributionId: w.id }),
    );
    expect(mine).not.toContain('external_affiliation');
    expect(mine).not.toContain('synthesis');
    expect(mine).not.toContain('affiliation commune');
  });

  it('l’IA en panne : les faits restent, la synthèse manquante est dite, rien ne devient bloquant', async () => {
    vi.stubEnv('AI_GATEWAY_API_KEY', 'test-key');
    const w = await proposed();
    await orcid(w.t, w.author.id, '0000-0002-1825-0097');
    await orcid(w.t, w.rev1.id, '0000-0001-5109-370X');
    vi.stubGlobal(
      'fetch',
      fetchAnswering({ works: 2, employments: [], gateway: 'down' }),
    );
    await w.t.action(internal.kohopLinkExternal.check, {
      reviewerId: w.reviewerId,
    });
    const check = await lastCheck(w.t, w.reviewerId);
    expect(check?.findings[0].type).toBe('external_cosign');
    expect(check?.level).toBe('flagged');
    expect(check?.synthesis).toBeUndefined();
    expect(check?.synthesisError).toBe('AI_GATEWAY_HTTP_ERROR');
    expect(check?.failed).toBeUndefined();
  });

  it('sans passerelle IA : les faits sont gardés, sans synthèse', async () => {
    const w = await proposed();
    await orcid(w.t, w.author.id, '0000-0002-1825-0097');
    await orcid(w.t, w.rev1.id, '0000-0001-5109-370X');
    vi.stubGlobal('fetch', fetchAnswering({ works: 1, employments: [] }));
    await w.t.action(internal.kohopLinkExternal.check, {
      reviewerId: w.reviewerId,
    });
    const check = await lastCheck(w.t, w.reviewerId);
    expect(check?.findings).toHaveLength(1);
    expect(check?.synthesisError).toBe('AI_GATEWAY_NOT_CONFIGURED');
  });

  it('une des deux sources injoignable : ce qui a été trouvé est gardé et l’échec est enregistré', async () => {
    const w = await proposed();
    await orcid(w.t, w.author.id, '0000-0002-1825-0097');
    await orcid(w.t, w.rev1.id, '0000-0001-5109-370X');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (hostOf(url) === 'pub.orcid.org') throw new Error('orcid down');
        return Response.json({
          meta: { count: 1 },
          results: [{ id: 'https://openalex.org/W1', title: 'T' }],
        });
      }),
    );
    await w.t.action(internal.kohopLinkExternal.check, {
      reviewerId: w.reviewerId,
    });
    const check = await lastCheck(w.t, w.reviewerId);
    expect(check?.failed).toBe(true);
    expect(check?.error).toBe('orcid down');
    expect(check?.findings).toHaveLength(1);
  });

  it('le chef de revue relance la vérification ; ni l’auteur ni un relecteur ne le peuvent', async () => {
    const w = await proposed();
    await w.t.run((ctx) => ctx.db.patch(w.id, { stage: 'submitted' }));
    await expect(
      w.author.as.mutation(api.kohopChief.recheckLinks, {
        reviewerId: w.reviewerId,
      }),
    ).rejects.toThrow();
    await w.chief.as.mutation(api.kohopChief.recheckLinks, {
      reviewerId: w.reviewerId,
    });
    const audit = await w.t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(
      audit.some(
        (a) => a.metadata && JSON.stringify(a.metadata).includes('requested'),
      ),
    ).toBe(true);
  });
});
