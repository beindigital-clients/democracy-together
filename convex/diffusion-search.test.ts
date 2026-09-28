// @vitest-environment edge-runtime
import { describe, expect, it } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api, internal } from './_generated/api';
import { publicationSearchText } from './lib/searchText';

// The Tribune is moderated A PRIORI by default (community workstream, F-45): a
// newly created post awaits approval. These tests cover what happens
// AFTER publication; they therefore set a posteriori mode, like the setting
// the administrator can choose.
async function tribuneAPosteriori(t: ReturnType<typeof convexTest>) {
  await t.run(async (ctx) => {
    const admin = await ctx.db.insert('users', {
      role: 'admin',
      email: 'reglages-tribune@test.org',
    });
    await ctx.db.insert('communityModerationConfig', {
      key: 'default',
      postMode: 'a_posteriori',
      commentMode: 'a_posteriori',
      updatedBy: admin,
      updatedAt: 0,
    });
  });
}

// INDEX-BASED SEARCH (F-06 / F-34, diffusion workstream).
//
// Content is written by the REAL mutations when they exist
// (publication submission, Tribune post): what is verified is that the
// haystack is maintained on write, not just the query.

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

type T = ReturnType<typeof convexTest>;

function pub(over: Record<string, unknown> = {}) {
  const base = {
    title: 'Titre',
    slug: 's',
    type: 'rapport' as const,
    theme: 'transitions',
    region: 'mondial' as const,
    languages: ['fr' as const],
    access: 'open' as const,
    authors: [{ name: 'A. Auteur' }],
    year: 2025,
    publishedAt: 0,
    abstract: 'Résumé.',
    keypoints: [] as string[],
    body: [] as string[],
    doi: '10.59000/dt.x',
    downloads: 0,
    citations: 0,
    status: 'published' as const,
    createdAt: 0,
    ...over,
  };
  return {
    ...base,
    searchText: publicationSearchText(base),
    searchLang: base.languages[0],
  };
}

async function member(t: T, role: 'membre' | 'moderateur' = 'membre') {
  const id = await t.run((ctx) =>
    ctx.db.insert('users', {
      role,
      email: `${role}@dt.test`,
      name: 'Awa Diop',
    }),
  );
  return t.withIdentity({ subject: `${id}|s` });
}

const search = (t: T, q: string, filters = {}) =>
  t.query(api.search.globalSearch, { q, filters });

describe('Recherche — insensible aux accents, via l’index', () => {
  it('« democratie », « DÉMOCRATIE » et « démocr » trouvent « Démocratie participative »', async () => {
    const t = convexTest(schema, modules);
    await t.run((ctx) =>
      ctx.db.insert(
        'publications',
        pub({ title: 'Démocratie participative au Sahel', slug: 'dp' }),
      ),
    );
    for (const q of ['democratie', 'DÉMOCRATIE', 'démocr', 'sahel']) {
      const res = await search(t, q);
      expect(
        res.publications.map((p) => p.slug),
        q,
      ).toEqual(['dp']);
    }
    // Generic section: same result, path ready to link.
    const res = await search(t, 'democratie');
    expect(res.sections[0]).toMatchObject({
      source: 'publications',
      hits: [{ path: '/bibliotheque/dp', kind: 'rapport' }],
    });
  });

  it('un dépôt de membre est indexé à l’écriture… mais n’est JAMAIS trouvé avant publication', async () => {
    const t = convexTest(schema, modules);
    const m = await member(t);
    await m.mutation(api.publications.submitPublication, {
      title: 'Écologie électorale et démocratie locale',
      type: 'note',
      theme: 'participation',
      region: 'afrique',
      languages: ['fr'],
      access: 'open',
      year: 2025,
      authors: [{ name: 'Fatou Ndiaye' }],
      abstract: 'Une note sur la démocratie locale et ses élections.',
    });
    const [p] = await t.run((ctx) => ctx.db.query('publications').collect());
    expect(p.status).toBe('pending');
    expect(p.searchText).toContain('ecologie electorale');
    // Draft / pending: invisible, whatever the term.
    for (const q of ['ecologie', 'démocratie', 'ndiaye']) {
      expect((await search(t, q)).sections).toEqual([]);
    }
    await t.run((ctx) => ctx.db.patch(p._id, { status: 'draft' }));
    expect((await search(t, 'ecologie')).sections).toEqual([]);
    // Published: found.
    await t.run((ctx) => ctx.db.patch(p._id, { status: 'published' }));
    expect((await search(t, 'ecologie')).publications).toHaveLength(1);
    // And the author is found as an EXPERT (derived source).
    const experts = (await search(t, 'ndiaye')).sections.find(
      (s) => s.source === 'experts',
    );
    expect(experts?.hits[0]).toMatchObject({
      title: 'Fatou Ndiaye',
      count: 1,
    });
  });

  it('Tribune : billet publié trouvé, billet retiré jamais', async () => {
    const t = convexTest(schema, modules);
    await tribuneAPosteriori(t);
    const m = await member(t);
    const postId = await m.mutation(api.tribune.createPost, {
      theme: 'participation',
      format: 'court',
      title: 'Pour une réforme électorale',
      body: 'Le scrutin proportionnel mérite un débat serein et informé.',
      lang: 'fr',
    });
    const hit = (await search(t, 'reforme')).sections.find(
      (s) => s.source === 'tribune',
    );
    expect(hit?.hits[0]).toMatchObject({ path: `/tribune/${postId}` });
    await t.run((ctx) => ctx.db.patch(postId, { status: 'removed' }));
    expect((await search(t, 'reforme')).sections).toEqual([]);
  });

  it('Annuaire : fiche active trouvée par le NOM de son pays, suspendue jamais', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (const [slug, status] of [
        ['actif', 'active'],
        ['suspendu', 'suspended'],
      ] as const) {
        await ctx.db.insert('organizations', {
          name: `Institut ${slug}`,
          slug,
          country: 'KE',
          region: 'afrique-est',
          languages: ['en'],
          themes: [],
          status,
          createdAt: 0,
        });
      }
    });
    await t.mutation(internal.searchIndexing.backfill, {
      table: 'organizations',
    });
    const res = await search(t, 'kenya');
    expect(res.organizations.map((o) => o.slug)).toEqual(['actif']);
  });
});

describe('Recherche — filtres et pagination', () => {
  async function corpus(t: T) {
    await t.run(async (ctx) => {
      await ctx.db.insert(
        'publications',
        pub({ title: 'Gouvernance A', slug: 'a', type: 'rapport', year: 2024 }),
      );
      await ctx.db.insert(
        'publications',
        pub({
          title: 'Gouvernance B',
          slug: 'b',
          type: 'note',
          languages: ['en'],
          region: 'afrique',
          year: 2025,
        }),
      );
      await ctx.db.insert(
        'publications',
        pub({ title: 'Gouvernance C', slug: 'c', theme: 'numerique' }),
      );
      await ctx.db.insert('organizations', {
        name: 'Gouvernance Institute',
        slug: 'gi',
        country: 'FR',
        region: 'europe-ouest',
        languages: ['fr'],
        themes: [],
        status: 'active',
        createdAt: 0,
      });
    });
    await t.mutation(internal.searchIndexing.backfill, {
      table: 'organizations',
    });
  }

  it('type, thème, langue, région, année — en filterFields', async () => {
    const t = convexTest(schema, modules);
    await corpus(t);
    const slugs = async (filters: object) =>
      (await search(t, 'gouvernance', filters)).publications
        .map((p) => p.slug)
        .sort();
    expect(await slugs({})).toEqual(['a', 'b', 'c']);
    expect(await slugs({ type: 'note' })).toEqual(['b']);
    expect(await slugs({ theme: 'numerique' })).toEqual(['c']);
    expect(await slugs({ lang: 'en' })).toEqual(['b']);
    expect(await slugs({ region: 'afrique' })).toEqual(['b']);
    expect(await slugs({ year: 2024 })).toEqual(['a']);
    // A filter a source cannot honor EXCLUDES it: "type" has
    // no meaning for a network member.
    const res = await search(t, 'gouvernance', { type: 'note' });
    expect(res.organizations).toEqual([]);
    expect((await search(t, 'gouvernance')).organizations).toHaveLength(1);
  });

  it('pagination par source, sans doublon d’une page à l’autre', async () => {
    const t = convexTest(schema, modules);
    await corpus(t);
    const p1 = await t.query(api.search.searchBySource, {
      source: 'publications',
      q: 'gouvernance',
      paginationOpts: { numItems: 2, cursor: null },
    });
    expect(p1.page).toHaveLength(2);
    expect(p1.isDone).toBe(false);
    const p2 = await t.query(api.search.searchBySource, {
      source: 'publications',
      q: 'gouvernance',
      paginationOpts: { numItems: 2, cursor: p1.continueCursor },
    });
    const ids = [...p1.page, ...p2.page].map((h) => h.id);
    expect(new Set(ids).size).toBe(3);
  });

  it('terme trop court ou vide : aucune lecture, aucun résultat', async () => {
    const t = convexTest(schema, modules);
    await corpus(t);
    for (const q of ['', ' ', 'g', '!!', "'"]) {
      expect(await search(t, q)).toEqual({
        sections: [],
        publications: [],
        organizations: [],
      });
    }
  });
});

describe('Migration — remplissage des meules', () => {
  it('remplit l’existant, puis ne réécrit rien au second passage', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      const {
        searchText: _s,
        searchLang: _l,
        ...sansMeule
      } = pub({
        title: 'Élections libres',
        slug: 'el',
      });
      void _s;
      void _l;
      await ctx.db.insert('publications', sansMeule);
    });
    expect(
      await t.mutation(internal.searchIndexing.backfill, {
        table: 'publications',
      }),
    ).toEqual({ table: 'publications', updated: 1, done: true });
    expect(
      await t.mutation(internal.searchIndexing.backfill, {
        table: 'publications',
      }),
    ).toEqual({ table: 'publications', updated: 0, done: true });
    expect((await search(t, 'elections')).publications).toHaveLength(1);
  });
});
