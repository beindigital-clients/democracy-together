// @vitest-environment edge-runtime
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import { SEARCH_SOURCES } from './lib/searchSources';
import { SITE_LOCALES } from './lib/locales';
import { DEFAULT_SETTINGS } from './lib/aiModeration';

// CERCLE DES AMIS — LEAK CONTROL (feature 4), at run time.
//
// The Cercle's text lives in tables nothing public reads. These tests do not
// trust that: they put recognisable markers in every Cercle table, then ask
// each PUBLIC surface — as an anonymous caller, as a plain visitor, as a
// suspended Ami — and require the markers to be absent. A control marker in a
// public record proves the same calls do return real data (so an empty answer
// is not mistaken for "no leak"). The static side (which code may read the
// Cercle tables, HTTP routes, sitemap) is in tests/unit/cercle-leaks.test.ts.

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
beforeEach(() => {
  vi.stubEnv('RECAPTCHA_DISABLED', 'true');
});
afterEach(async () => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useFakeTimers();
  try {
    for (const drain of drains.splice(0)) await drain();
  } finally {
    vi.useRealTimers();
  }
});

type T = ReturnType<typeof newConvexTest>;

// Unlikely to occur in any real content, and one single token so a full-text
// search for it would match.
const SECRET = 'zqxsecretcerclemarker';
const CONTROL = 'zqxpubliccontrolmarker';

async function seed(t: T) {
  const author = await t.run((ctx) =>
    ctx.db.insert('users', {
      email: `${SECRET}@example.test`,
      name: `Name ${SECRET}`,
      role: 'visiteur',
      amiSince: Date.now(),
    }),
  );
  await t.run(async (ctx) => {
    await ctx.db.insert('cercleContributions', {
      authorUserId: author,
      body: `Private text ${SECRET}`,
      createdAt: Date.now(),
      status: 'visible',
    });
    const cv = await ctx.storage.store(new Blob(['%PDF-1.4 cv']));
    await ctx.db.insert('cercleRequests', {
      email: `${SECRET}-request@example.test`,
      name: `Applicant ${SECRET}`,
      motivation: `Motivation ${SECRET}`,
      cvStorageId: cv,
      cvFileName: `${SECRET}.pdf`,
      consent: { at: Date.now(), charterVersion: 'v', noticeVersion: 'v' },
      status: 'pending',
      submittedAt: Date.now(),
    });
  });
  // A real, published publication: the control.
  await t.run((ctx) =>
    ctx.db.insert('publications', {
      title: `Public ${CONTROL}`,
      slug: 'public-control',
      type: 'rapport',
      theme: 'transitions',
      region: 'mondial',
      languages: ['fr'],
      access: 'open',
      authors: [{ name: 'Auteur public' }],
      year: 2026,
      publishedAt: Date.now(),
      abstract: `Résumé public ${CONTROL}`,
      keypoints: [],
      body: [],
      doi: '10.59000/dt.control',
      downloads: 0,
      citations: 0,
      views: 0,
      status: 'published',
      createdAt: Date.now(),
      searchText: `public ${CONTROL}`,
      searchLang: 'fr',
    }),
  );
  return author;
}

// Every PUBLIC read the platform offers a visitor, as a function of a caller.
async function publicSurface(caller: T | ReturnType<T['withIdentity']>) {
  const out: Record<string, unknown> = {};
  out.publications = await caller.query(api.publications.listPublished, {});
  out.globalSearch = await caller.query(api.search.globalSearch, {
    q: SECRET,
  });
  for (const source of SEARCH_SOURCES) {
    out[`search:${source}`] = await caller.query(api.search.searchBySource, {
      source,
      q: SECRET,
      paginationOpts: { numItems: 10, cursor: null },
    });
  }
  out.kohop = await caller.query(api.kohopPublic.list, {});
  out.tribune = await caller.query(api.tribune.listPosts, {});
  out.directory = await caller.query(api.organizations.listDirectory, {});
  out.experts = await caller.query(api.experts.listExperts, {});
  for (const locale of SITE_LOCALES) {
    out[`events:${locale}`] = await caller.query(
      api.contenus.events.listPublic,
      { locale },
    );
    out[`news:${locale}`] = await caller.query(api.contenus.news.listPublic, {
      locale,
    });
    out[`partners:${locale}`] = await caller.query(
      api.contenus.partners.listPublic,
      { locale },
    );
    out[`press:${locale}`] = await caller.query(api.contenus.press.listPublic, {
      locale,
    });
    out[`replays:${locale}`] = await caller.query(
      api.contenus.replays.listPublic,
      { locale },
    );
    out[`themes:${locale}`] = await caller.query(
      api.contenus.themes.listPublic,
      { locale },
    );
  }
  return out;
}

describe('Cercle leaks — public reads never return the Cercle’s text', () => {
  it('the control is found by the same calls (the test is not vacuous)', async () => {
    const t = newConvexTest();
    await seed(t);
    const result = await t.query(api.publications.listPublished, {});
    expect(JSON.stringify(result)).toContain(CONTROL);
    // The search finds the control and, for the same index, nothing of the
    // Cercle: the guard below would be meaningless if search returned nothing.
    const found = await t.query(api.search.globalSearch, { q: CONTROL });
    expect(JSON.stringify(found)).toContain(CONTROL);
    const notFound = await t.query(api.search.globalSearch, { q: SECRET });
    expect(JSON.stringify(notFound)).not.toContain(SECRET);
  });

  it('an anonymous caller sees none of the markers', async () => {
    const t = newConvexTest();
    await seed(t);
    expect(JSON.stringify(await publicSurface(t))).not.toContain(SECRET);
  });

  it('a plain visitor, signed in, sees none of the markers', async () => {
    const t = newConvexTest();
    await seed(t);
    const visitor = await t.run((ctx) =>
      ctx.db.insert('users', { email: 'plain@example.test', role: 'visiteur' }),
    );
    const as = t.withIdentity({ subject: `${visitor}|s` });
    expect(JSON.stringify(await publicSurface(as))).not.toContain(SECRET);
  });

  it('a suspended Ami sees none of the markers on the public surface either', async () => {
    const t = newConvexTest();
    const author = await seed(t);
    await t.run((ctx) =>
      ctx.db.patch(author, { suspendedAt: Date.now(), suspensionReason: 't' }),
    );
    const as = t.withIdentity({ subject: `${author}|s` });
    expect(JSON.stringify(await publicSurface(as))).not.toContain(SECRET);
  });

  it('even a member only reads the Cercle through the Cercle’s own doors', async () => {
    const t = newConvexTest();
    await seed(t);
    const member = await t.run((ctx) =>
      ctx.db.insert('users', { email: 'member@example.test', role: 'membre' }),
    );
    const as = t.withIdentity({ subject: `${member}|s` });
    // The public surface is the same for a member: no marker.
    expect(JSON.stringify(await publicSurface(as))).not.toContain(SECRET);
    // …and the door that IS meant to show it does.
    const list = await as.query(api.cercleContributions.list, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(JSON.stringify(list)).toContain(SECRET);
  });
});

describe('Cercle leaks — search, translation, indexing', () => {
  it('the Cercle is not a search source', () => {
    expect([...SEARCH_SOURCES].some((s) => /cercle/i.test(s))).toBe(false);
  });

  it('no Cercle table carries a search or vector index, nor a search haystack', () => {
    for (const name of [
      'cercleContributions',
      'cercleRequests',
      'cercleUploads',
    ] as const) {
      // `export()` is the table definition's own serialisation: not part of
      // the public type, but what the deployment is given.
      const exported = (
        schema.tables[name] as unknown as {
          export(): {
            searchIndexes: unknown[];
            vectorIndexes: unknown[];
            documentType: { value?: Record<string, unknown> };
          };
        }
      ).export();
      expect(exported.searchIndexes, name).toHaveLength(0);
      expect(exported.vectorIndexes, name).toHaveLength(0);
      const fields = Object.keys(exported.documentType.value ?? {});
      expect(
        fields.filter((f) => /search/i.test(f)),
        name,
      ).toEqual([]);
    }
  });

  it('automatic translation refuses a Cercle contribution as a source', async () => {
    const t = newConvexTest();
    const author = await seed(t);
    const contribution = await t.run(
      async (ctx) => (await ctx.db.query('cercleContributions').first())!._id,
    );
    const as = t.withIdentity({ subject: `${author}|s` });
    await expect(
      as.action(api.translation.requestTranslation, {
        // The source types are a closed union: a Cercle one is refused by the
        // validator before any code runs.
        sourceType: 'cercleContribution' as never,
        sourceId: contribution,
        targetLocale: 'en',
      }),
    ).rejects.toThrow();
    // And the Cercle's tables never reach the translation tables.
    expect(
      await t.run((ctx) => ctx.db.query('contentTranslations').collect()),
    ).toHaveLength(0);
  });
});

describe('Cercle leaks — AI moderation (third-party provider)', () => {
  it('a private contribution is never sent to the AI provider, even with moderation on', async () => {
    const t = newConvexTest();
    const author = await t.run((ctx) =>
      ctx.db.insert('users', {
        email: 'ami@example.test',
        role: 'visiteur',
        amiSince: Date.now(),
      }),
    );
    // Both moderation configurations armed: the library's and the tribune's.
    await t.run(async (ctx) => {
      await ctx.db.insert('aiModerationConfig', {
        key: 'default',
        ...DEFAULT_SETTINGS,
        mode: 'auto',
        eligibleTypes: ['note', 'rapport'],
        fallbackModel: undefined,
        version: 1,
        updatedAt: Date.now(),
      });
    });
    const fetchSpy = vi.fn(() => {
      throw new Error('no network call is allowed here');
    });
    vi.stubGlobal('fetch', fetchSpy);

    const as = t.withIdentity({ subject: `${author}|s` });
    await as.mutation(api.cercleContributions.submit, {
      body: `Texte privé ${SECRET}, jamais envoyé à un tiers.`,
    });

    // Nothing scheduled — no `runReview` for a Cercle text — and no request out.
    const scheduled = await t.run((ctx) =>
      ctx.db.system.query('_scheduled_functions').collect(),
    );
    expect(scheduled).toHaveLength(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    // Nor does reading or removing it call out.
    await as.query(api.cercleContributions.list, {
      paginationOpts: { numItems: 5, cursor: null },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
