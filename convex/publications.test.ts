// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import {
  matchesPublication,
  sortPublications,
  computePublicationFacets,
  slugify,
  type PublicationLike,
} from './lib/publications';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// Pagination: back-office lists now take `paginationOpts`
// (issue #8). One large page is enough for these tests — what they check is not
// the slicing but the content.
const PAGE = { paginationOpts: { numItems: 50, cursor: null } };

// --- Helpers ---
function pub(overrides: Partial<PublicationLike> = {}): PublicationLike {
  return {
    title: 'Titre',
    type: 'rapport',
    theme: 'transitions',
    region: 'mondial',
    languages: ['fr'],
    access: 'open',
    authors: [{ name: 'A. Auteur' }],
    year: 2025,
    publishedAt: 0,
    downloads: 0,
    citations: 0,
    ...overrides,
  };
}

const docBase = {
  abstract: 'Résumé.',
  keypoints: [] as string[],
  body: [] as string[],
  doi: '10.59000/dt.x',
  image: '/library/parliament.jpg',
  createdAt: 0,
  status: 'published' as const,
};

describe('Bibliothèque — logique pure (lib/publications)', () => {
  it('matchesPublication ignore les accents et la casse (« democratie » trouve « Démocratie »)', () => {
    const p = pub({
      title: 'L’état de la Démocratie en Afrique',
      authors: [{ name: 'Aïssatou Ndiaye' }],
    });
    expect(matchesPublication(p, { q: 'democratie' })).toBe(true);
    expect(matchesPublication(p, { q: 'DÉMOCRATIE' })).toBe(true);
    expect(matchesPublication(p, { q: 'aissatou' })).toBe(true);
    expect(matchesPublication(p, { q: 'senegal' })).toBe(false);
  });

  it('matchesPublication cherche aussi le résumé et les points clés', () => {
    // Measured on 27/09: "institutions" (present in the abstracts) -> 0.
    const p = pub({
      title: 'Titre neutre',
      abstract: 'Le rôle des institutions dans la transition.',
      keypoints: ['Financement de la société civile'],
    });
    expect(matchesPublication(p, { q: 'institutions' })).toBe(true);
    expect(matchesPublication(p, { q: 'société civile' })).toBe(true);
    expect(matchesPublication(p, { q: 'societe civile' })).toBe(true);
    expect(matchesPublication(p, { q: 'absent' })).toBe(false);
    // Fixture without abstract or key points: does not throw, does not match.
    expect(matchesPublication(pub(), { q: 'institutions' })).toBe(false);
  });

  it('matchesPublication ne cherche pas les guillemets littéralement', () => {
    // Measured on 27/09: `"démocratie"` -> 0 results.
    const p = pub({ title: 'L’état de la démocratie' });
    expect(matchesPublication(p, { q: '"démocratie"' })).toBe(true);
    expect(matchesPublication(p, { q: '« démocratie »' })).toBe(true);
    expect(matchesPublication(p, { q: '“democratie”' })).toBe(true);
    // Quotes alone = no search.
    expect(matchesPublication(p, { q: '""' })).toBe(true);
  });

  it('matchesPublication combine les facettes en OU intra / ET inter', () => {
    const p = pub({
      theme: 'gouvernance-numerique',
      type: 'policy-brief',
      region: 'europe',
      languages: ['fr', 'en'],
      access: 'open',
      title: 'Réguler les plateformes',
      authors: [{ name: 'K. Mensah' }],
    });
    // no filter -> match
    expect(matchesPublication(p, {})).toBe(true);
    // OR within a facet (one theme out of two matches)
    expect(
      matchesPublication(p, { themes: ['gouvernance-numerique', 'crises'] }),
    ).toBe(true);
    // AND across facets (theme OK but type KO -> rejected)
    expect(
      matchesPublication(p, {
        themes: ['gouvernance-numerique'],
        types: ['rapport'],
      }),
    ).toBe(false);
    // language: OR over the intersection
    expect(matchesPublication(p, { langs: ['en'] })).toBe(true);
    expect(
      matchesPublication(pub({ languages: ['fr'] }), { langs: ['en'] }),
    ).toBe(false);
    // access
    expect(matchesPublication(p, { access: ['members'] })).toBe(false);
    // full-text search (title + authors, case-insensitive)
    expect(matchesPublication(p, { q: 'mensah' })).toBe(true);
    expect(matchesPublication(p, { q: 'PLATEFORMES' })).toBe(true);
    expect(matchesPublication(p, { q: 'climat' })).toBe(false);
  });

  it('sortPublications trie par récence, citations ou titre', () => {
    const a = pub({
      title: 'Bravo',
      year: 2026,
      citations: 5,
      publishedAt: 10,
    });
    const b = pub({
      title: 'Alpha',
      year: 2025,
      citations: 40,
      publishedAt: 20,
    });
    expect(sortPublications([b, a], 'recent').map((p) => p.title)).toEqual([
      'Bravo',
      'Alpha',
    ]);
    expect(sortPublications([a, b], 'cited').map((p) => p.title)).toEqual([
      'Alpha',
      'Bravo',
    ]);
    expect(sortPublications([a, b], 'az').map((p) => p.title)).toEqual([
      'Alpha',
      'Bravo',
    ]);
  });

  it('computePublicationFacets compte par valeur, tri fréquence puis alpha', () => {
    const f = computePublicationFacets([
      pub({ theme: 'transitions', languages: ['fr', 'en'] }),
      pub({ theme: 'transitions', languages: ['fr'] }),
      pub({ theme: 'crises', languages: ['en'] }),
    ]);
    expect(Object.fromEntries(f.themes.map((x) => [x.value, x.count]))).toEqual(
      {
        transitions: 2,
        crises: 1,
      },
    );
    // fr appears 2x, en 2x -> alphabetical order (en before fr)
    expect(f.languages.map((x) => x.value)).toEqual(['en', 'fr']);
  });

  it('computePublicationFacets ignore une valeur cochée inconnue du corpus', () => {
    // Measured on 27/09: `?theme=zzz` rendered a checked "Zzz 0" option.
    const items = [pub({ theme: 'transitions' }), pub({ theme: 'crises' })];
    const facets = computePublicationFacets(items, { themes: ['zzz'] });
    expect(facets.themes.map((f) => f.value)).toEqual([
      'crises',
      'transitions',
    ]);
    // A known value absent from the filtered subset stays listed at 0
    // (uncheckable): that behavior is kept.
    const contextual = computePublicationFacets(items, {
      themes: ['crises'],
      types: ['note'],
    });
    expect(contextual.themes).toContainEqual({ value: 'crises', count: 0 });
  });

  it('computePublicationFacets : compteurs contextuels selon les autres filtres', () => {
    const items = [
      pub({ theme: 'gouvernance-numerique', type: 'rapport' }),
      pub({ theme: 'gouvernance-numerique', type: 'note' }),
      pub({ theme: 'crises', type: 'rapport' }),
    ];
    // no filter: totals per type
    const f0 = computePublicationFacets(items);
    expect(Object.fromEntries(f0.types.map((x) => [x.value, x.count]))).toEqual(
      {
        rapport: 2,
        note: 1,
      },
    );
    // theme=gouvernance filter: the TYPE facet counts ONLY these publications
    // -> the counter reflects what you really get by ticking.
    const f1 = computePublicationFacets(items, {
      themes: ['gouvernance-numerique'],
    });
    expect(Object.fromEntries(f1.types.map((x) => [x.value, x.count]))).toEqual(
      {
        rapport: 1,
        note: 1,
      },
    );
    // the THEME facet ignores its own selection ("OR" add counters)
    expect(
      Object.fromEntries(f1.themes.map((x) => [x.value, x.count])),
    ).toEqual({ 'gouvernance-numerique': 2, crises: 1 });
  });
});

describe('Bibliothèque — queries Convex (F-32/F-34)', () => {
  it('listPublished : exclut draft/pending, filtre et calcule les facettes', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('publications', {
        ...docBase,
        ...pub({
          title: 'Publié A',
          theme: 'transitions',
          type: 'rapport',
          region: 'mondial',
          languages: ['fr', 'en'],
        }),
        slug: 'pub-a',
      });
      await ctx.db.insert('publications', {
        ...docBase,
        ...pub({
          title: 'Publié B',
          theme: 'crises',
          type: 'note',
          region: 'europe',
          languages: ['fr'],
        }),
        slug: 'pub-b',
      });
      await ctx.db.insert('publications', {
        ...docBase,
        ...pub({ title: 'Brouillon', theme: 'transitions' }),
        slug: 'pub-draft',
        status: 'draft',
      });
    });

    const all = await t.query(api.publications.listPublished, {});
    expect(all.total).toBe(2); // draft excluded
    expect(all.items.map((p) => p.slug).sort()).toEqual(['pub-a', 'pub-b']);
    // theme facet does not count the draft
    const themes = Object.fromEntries(
      all.facets.themes.map((x) => [x.value, x.count]),
    );
    expect(themes['transitions']).toBe(1);
    expect(themes['crises']).toBe(1);

    // theme filter
    const crises = await t.query(api.publications.listPublished, {
      themes: ['crises'],
    });
    expect(crises.items.map((p) => p.slug)).toEqual(['pub-b']);
  });

  it('getBySlug : ne renvoie que les publiées', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('publications', {
        ...docBase,
        ...pub({ title: 'Visible' }),
        slug: 'visible',
      });
      await ctx.db.insert('publications', {
        ...docBase,
        ...pub({ title: 'Caché' }),
        slug: 'cache',
        status: 'pending',
      });
    });
    expect(
      (await t.query(api.publications.getBySlug, { slug: 'visible' }))?.title,
    ).toBe('Visible');
    expect(
      await t.query(api.publications.getBySlug, { slug: 'cache' }),
    ).toBeNull();
    expect(
      await t.query(api.publications.getBySlug, { slug: 'nope' }),
    ).toBeNull();
  });

  it('recordPublicationDownload : incrémente `downloads` d’une publiée, no-op sinon', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert('publications', {
        ...docBase,
        ...pub({ title: 'Publiée', downloads: 4 }),
        slug: 'publiee',
      });
      await ctx.db.insert('publications', {
        ...docBase,
        ...pub({ title: 'Brouillon', downloads: 4 }),
        slug: 'brouillon',
        status: 'draft',
      });
    });
    await t.mutation(api.publications.recordPublicationDownload, {
      slug: 'publiee',
    });
    await t.mutation(api.publications.recordPublicationDownload, {
      slug: 'brouillon',
    });
    await t.mutation(api.publications.recordPublicationDownload, {
      slug: 'inconnue',
    });
    const after = await t.query(api.publications.getBySlug, {
      slug: 'publiee',
    });
    expect(after?.downloads).toBe(5);
    const draft = await t.run((ctx) =>
      ctx.db
        .query('publications')
        .withIndex('by_slug', (q) => q.eq('slug', 'brouillon'))
        .unique(),
    );
    expect(draft?.downloads).toBe(4);
  });

  it('relatedByTheme : même thème, exclut la courante', async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (const slug of ['rel-1', 'rel-2', 'rel-3']) {
        await ctx.db.insert('publications', {
          ...docBase,
          ...pub({ title: slug, theme: 'transitions' }),
          slug,
        });
      }
      await ctx.db.insert('publications', {
        ...docBase,
        ...pub({ title: 'Autre thème', theme: 'crises' }),
        slug: 'other',
      });
    });
    const rel = await t.query(api.publications.relatedByTheme, {
      theme: 'transitions',
      excludeSlug: 'rel-1',
      limit: 3,
    });
    expect(rel.map((p) => p.slug).sort()).toEqual(['rel-2', 'rel-3']);
    expect(rel.every((p) => p.slug !== 'rel-1')).toBe(true);
  });
});

// --- Document submission (F-32) ----------------------------------------------

describe('slugify (F-32)', () => {
  it('normalise accents, casse et séparateurs ; borne la longueur', () => {
    expect(slugify('Élections & Démocratie locale')).toBe(
      'elections-democratie-locale',
    );
    expect(slugify('  Trop   d’espaces  ')).toBe('trop-d-espaces');
    expect(slugify('!!!')).toBe('publication'); // safeguard if empty
    expect(slugify('a'.repeat(120)).length).toBeLessThanOrEqual(72);
  });
});

const SUBMIT = {
  title: 'Confiance institutionnelle en Afrique de l’Ouest',
  type: 'rapport' as const,
  theme: 'participation' as const,
  region: 'afrique' as const,
  languages: ['fr' as const],
  access: 'open' as const,
  year: 2025,
  authors: [{ name: 'A. Wade' }],
  abstract: 'Une enquête comparée sur la confiance dans les institutions.',
};

describe('Dépôt de publication (F-32) — soumission membre', () => {
  it('refuse un anonyme, crée une soumission en attente liée à l’auteur', async () => {
    const t = convexTest(schema, modules);

    // anonymous refused (requireUser)
    await expect(
      t.mutation(api.publications.submitPublication, SUBMIT),
    ).rejects.toThrow();

    const memberId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'membre@test.org' }),
    );
    const asMember = t.withIdentity({ subject: `${memberId}|s` });

    const { slug } = await asMember.mutation(
      api.publications.submitPublication,
      SUBMIT,
    );

    const doc = await t.run((ctx) =>
      ctx.db
        .query('publications')
        .withIndex('by_slug', (q) => q.eq('slug', slug))
        .unique(),
    );
    expect(doc?.status).toBe('pending');
    expect(doc?.authorUserId).toBe(memberId);

    // never exposed publicly while pending
    const pub = await t.query(api.publications.listPublished, {});
    expect(pub.items.some((p) => p.slug === slug)).toBe(false);
  });

  it('valide les entrées (titre, résumé, auteurs, année)', async () => {
    const t = convexTest(schema, modules);
    const memberId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'm@test.org' }),
    );
    const asMember = t.withIdentity({ subject: `${memberId}|s` });

    await expect(
      asMember.mutation(api.publications.submitPublication, {
        ...SUBMIT,
        title: 'x',
      }),
    ).rejects.toThrow();
    await expect(
      asMember.mutation(api.publications.submitPublication, {
        ...SUBMIT,
        abstract: 'court',
      }),
    ).rejects.toThrow();
    await expect(
      asMember.mutation(api.publications.submitPublication, {
        ...SUBMIT,
        authors: [{ name: '' }],
      }),
    ).rejects.toThrow();
    await expect(
      asMember.mutation(api.publications.submitPublication, {
        ...SUBMIT,
        year: 1800,
      }),
    ).rejects.toThrow();
  });

  it('génère des slugs uniques pour des titres identiques', async () => {
    const t = convexTest(schema, modules);
    const memberId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'm@test.org' }),
    );
    const asMember = t.withIdentity({ subject: `${memberId}|s` });
    const a = await asMember.mutation(
      api.publications.submitPublication,
      SUBMIT,
    );
    const b = await asMember.mutation(
      api.publications.submitPublication,
      SUBMIT,
    );
    expect(a.slug).not.toBe(b.slug);
  });

  it('listMine ne renvoie que mes dépôts (tous statuts)', async () => {
    const t = convexTest(schema, modules);
    const meId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'me@test.org' }),
    );
    const otherId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'other@test.org' }),
    );
    const me = t.withIdentity({ subject: `${meId}|s` });
    const { slug } = await me.mutation(
      api.publications.submitPublication,
      SUBMIT,
    );

    const mine = await me.query(api.publications.listMine, {});
    expect(mine.map((m) => m.slug)).toContain(slug);
    expect(mine[0].status).toBe('pending');

    const others = await t
      .withIdentity({ subject: `${otherId}|s` })
      .query(api.publications.listMine, {});
    expect(others.length).toBe(0);

    // anonymous -> empty list (no error)
    expect((await t.query(api.publications.listMine, {})).length).toBe(0);
  });

  it('refuse le dépôt à un visiteur (modèle B)', async () => {
    const t = convexTest(schema, modules);
    // explicit visitor role
    const visitorId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'visiteur', email: 'v@test.org' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${visitorId}|s` })
        .mutation(api.publications.submitPublication, SUBMIT),
    ).rejects.toThrow();

    // account without an explicit role (= visitor by default) -> refused too
    const noRoleId = await t.run((ctx) =>
      ctx.db.insert('users', { email: 'nr@test.org' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${noRoleId}|s` })
        .mutation(api.publications.submitPublication, SUBMIT),
    ).rejects.toThrow();
  });
});

describe('Modération de publication (F-32 / F-26)', () => {
  async function setup() {
    const t = convexTest(schema, modules);
    const memberId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'membre@test.org' }),
    );
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', {
        role: 'moderateur',
        reviewChief: true,
        email: 'mod@test.org',
      }),
    );
    const { id } = await t
      .withIdentity({ subject: `${memberId}|s` })
      .mutation(api.publications.submitPublication, SUBMIT);
    return { t, memberId, modId, id };
  }

  it('refuse un membre, accepte un modérateur : publie + DOI + audit', async () => {
    const { t, memberId, modId, id } = await setup();

    // a member cannot moderate
    await expect(
      t
        .withIdentity({ subject: `${memberId}|s` })
        .mutation(api.publications.reviewPublication, {
          publicationId: id,
          decision: 'approved',
        }),
    ).rejects.toThrow();

    // moderation queue reserved for staff
    await expect(
      t
        .withIdentity({ subject: `${memberId}|s` })
        .query(api.publications.listForReview, PAGE),
    ).rejects.toThrow();

    const { page: queue } = await t
      .withIdentity({ subject: `${modId}|s` })
      .query(api.publications.listForReview, PAGE);
    expect(queue.some((p) => p._id === id)).toBe(true);
    expect(queue[0].authorEmail).toBe('membre@test.org');

    // a moderator publishes
    await t
      .withIdentity({ subject: `${modId}|s` })
      .mutation(api.publications.reviewPublication, {
        publicationId: id,
        decision: 'approved',
      });

    const doc = await t.run((ctx) => ctx.db.get(id));
    expect(doc?.status).toBe('published');
    expect(doc?.publishedAt ?? 0).toBeGreaterThan(0);
    expect(doc?.doi).toContain('10.59000/dt.');
    expect(doc?.reviewedBy).toBe(modId);

    // now public
    const pub = await t.query(api.publications.listPublished, {});
    expect(pub.items.some((p) => p._id === id)).toBe(true);

    const audit = await t.run((ctx) => ctx.db.query('auditLog').collect());
    expect(audit.some((a) => a.action === 'publication.submitted')).toBe(true);
    expect(audit.some((a) => a.action === 'publication.reviewed')).toBe(true);
  });

  it('rejet : retour en brouillon avec note pour l’auteur', async () => {
    const { t, modId, id } = await setup();
    await t
      .withIdentity({ subject: `${modId}|s` })
      .mutation(api.publications.reviewPublication, {
        publicationId: id,
        decision: 'rejected',
        notes: 'Préciser la méthodologie.',
      });
    const doc = await t.run((ctx) => ctx.db.get(id));
    expect(doc?.status).toBe('draft');
    expect(doc?.reviewNotes).toBe('Préciser la méthodologie.');
    // not published
    const pub = await t.query(api.publications.listPublished, {});
    expect(pub.items.some((p) => p._id === id)).toBe(false);
  });
});

describe('Modération de publication — machine à états (issue #9)', () => {
  // Same setup as the moderation queue: a real member submission, hence
  // a 'pending' publication with an author.
  async function setup() {
    const t = convexTest(schema, modules);
    const memberId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'membre@test.org' }),
    );
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', {
        role: 'moderateur',
        reviewChief: true,
        email: 'mod@test.org',
      }),
    );
    const { id } = await t
      .withIdentity({ subject: `${memberId}|s` })
      .mutation(api.publications.submitPublication, SUBMIT);
    return { t, asMod: t.withIdentity({ subject: `${modId}|s` }), id };
  }

  const reviewedAudit = (t: ReturnType<typeof convexTest>) =>
    t.run((ctx) =>
      ctx.db
        .query('auditLog')
        .withIndex('by_action', (q) => q.eq('action', 'publication.reviewed'))
        .collect(),
    );

  it('refuse de rejouer OU d’inverser une décision déjà prise', async () => {
    const { t, asMod, id } = await setup();
    await asMod.mutation(api.publications.reviewPublication, {
      publicationId: id,
      decision: 'approved',
    });

    // Replay (double click on "Approuver"): without a guard, the publication
    // date and the DOI would be rewritten and the log would show two
    // decisions.
    await expect(
      asMod.mutation(api.publications.reviewPublication, {
        publicationId: id,
        decision: 'approved',
      }),
    ).rejects.toThrow('ALREADY_REVIEWED');

    // Reversal: "Rejeter" after "Approuver" would silently unpublish a
    // document already online. Withdrawal is a different decision (issue #32).
    await expect(
      asMod.mutation(api.publications.reviewPublication, {
        publicationId: id,
        decision: 'rejected',
        notes: 'Finalement non.',
      }),
    ).rejects.toThrow('ALREADY_REVIEWED');

    // The publication is intact, and the log holds only ONE decision: the
    // throw rolls back the transaction, hence the audit row too.
    const doc = await t.run((ctx) => ctx.db.get(id));
    expect(doc?.status).toBe('published');
    expect(doc?.reviewNotes).toBeUndefined();
    expect(await reviewedAudit(t)).toHaveLength(1);
  });

  it('refuse de rejouer OU d’inverser un refus (il faut rouvrir)', async () => {
    const { t, asMod, id } = await setup();
    await asMod.mutation(api.publications.reviewPublication, {
      publicationId: id,
      decision: 'rejected',
      notes: 'Préciser la méthodologie.',
    });

    for (const decision of ['rejected', 'approved'] as const) {
      await expect(
        asMod.mutation(api.publications.reviewPublication, {
          publicationId: id,
          decision,
        }),
      ).rejects.toThrow('ALREADY_REVIEWED');
    }

    const doc = await t.run((ctx) => ctx.db.get(id));
    expect(doc?.status).toBe('draft');
    expect(doc?.reviewNotes).toBe('Préciser la méthodologie.');
    expect(await reviewedAudit(t)).toHaveLength(1);
    // and it did not go online on the second pass
    const published = await t.query(api.publications.listPublished, {});
    expect(published.items.some((p) => p._id === id)).toBe(false);
  });

  it('refuse d’approuver un brouillon jamais soumis', async () => {
    const t = convexTest(schema, modules);
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', {
        role: 'moderateur',
        reviewChief: true,
        email: 'mod@test.org',
      }),
    );
    const asMod = t.withIdentity({ subject: `${modId}|s` });
    // A draft: never submitted, hence never reviewed (no `reviewedAt`).
    const draftId = await t.run((ctx) =>
      ctx.db.insert('publications', {
        title: 'Notes de travail',
        slug: 'notes-de-travail',
        type: 'note',
        theme: 'participation',
        region: 'mondial',
        languages: ['fr'],
        access: 'open',
        authors: [{ name: 'A. Auteur' }],
        year: 2025,
        publishedAt: 0,
        abstract: 'Des notes qui ne sont pas prêtes.',
        keypoints: [],
        body: [],
        doi: '',
        downloads: 0,
        citations: 0,
        status: 'draft',
        createdAt: 0,
      }),
    );

    await expect(
      asMod.mutation(api.publications.reviewPublication, {
        publicationId: draftId,
        decision: 'approved',
      }),
    ).rejects.toThrow('INVALID_TRANSITION');
    // and it is not put back into the queue through the back door either
    await expect(
      asMod.mutation(api.publications.reopenPublicationReview, {
        publicationId: draftId,
      }),
    ).rejects.toThrow('INVALID_TRANSITION');

    expect(await t.run((ctx) => ctx.db.get(draftId))).toMatchObject({
      status: 'draft',
    });
  });

  it('réouverture : un refus revient dans la file, tracé, et se décide à nouveau', async () => {
    const { t, asMod, id } = await setup();
    await asMod.mutation(api.publications.reviewPublication, {
      publicationId: id,
      decision: 'rejected',
      notes: 'Refus prononcé par erreur.',
    });

    // Staff only: the author does not reopen their own rejection.
    const memberId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'autre@test.org' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${memberId}|s` })
        .mutation(api.publications.reopenPublicationReview, {
          publicationId: id,
        }),
    ).rejects.toThrow();

    await asMod.mutation(api.publications.reopenPublicationReview, {
      publicationId: id,
    });

    const reopened = await t.run((ctx) => ctx.db.get(id));
    expect(reopened?.status).toBe('pending');
    // the rejection note remains: it says why the decision was made
    expect(reopened?.reviewNotes).toBe('Refus prononcé par erreur.');
    // and the rollback carries its own name in the log
    const reopenAudit = await t.run((ctx) =>
      ctx.db
        .query('auditLog')
        .withIndex('by_action', (q) => q.eq('action', 'publication.reopened'))
        .collect(),
    );
    expect(reopenAudit).toHaveLength(1);
    expect(reopenAudit[0].metadata).toMatchObject({ from: 'rejected' });

    // back in the queue, the publication is decided again — once.
    const { page: queue } = await asMod.query(api.publications.listForReview, {
      ...PAGE,
      status: 'pending',
    });
    expect(queue).toHaveLength(1);
    // and the dashboard counter counts it again (issue #8): a queue that
    // shows "0 pending" while it contains one is a screen that
    // lies.
    const pending = await t.run((ctx) =>
      ctx.db
        .query('counters')
        .withIndex('by_key', (q) => q.eq('key', 'publications.pending'))
        .unique(),
    );
    expect(pending?.value).toBe(1);
    await asMod.mutation(api.publications.reviewPublication, {
      publicationId: id,
      decision: 'approved',
    });
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      status: 'published',
    });
  });

  it('réouverture : une publication EN LIGNE ne se rouvre pas (retrait = #32)', async () => {
    const { t, asMod, id } = await setup();
    await asMod.mutation(api.publications.reviewPublication, {
      publicationId: id,
      decision: 'approved',
    });

    await expect(
      asMod.mutation(api.publications.reopenPublicationReview, {
        publicationId: id,
      }),
    ).rejects.toThrow('ALREADY_REVIEWED');
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({
      status: 'published',
    });
  });
});

describe('Dépôt de publication (F-32) — validation serveur du fichier', () => {
  async function asMember() {
    const t = convexTest(schema, modules);
    const memberId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'm@test.org' }),
    );
    return { t, as: t.withIdentity({ subject: `${memberId}|s` }) };
  }

  it('accepte un PDF (type autorisé) et lie le fichier', async () => {
    const { t, as } = await asMember();
    const fileId = await t.run((ctx) =>
      ctx.storage.store(
        new Blob(['%PDF-1.4 contenu de test'], { type: 'application/pdf' }),
      ),
    );
    const { slug } = await as.mutation(api.publications.submitPublication, {
      ...SUBMIT,
      fileId,
      fileName: 'rapport.pdf',
    });
    const doc = await t.run((ctx) =>
      ctx.db
        .query('publications')
        .withIndex('by_slug', (q) => q.eq('slug', slug))
        .unique(),
    );
    expect(doc?.fileId).toBe(fileId);
  });

  it('rejette un fichier VIDE (INVALID_FILE) : 0 octet n’est pas un document', async () => {
    const { t, as } = await asMember();
    const fileId = await t.run((ctx) =>
      ctx.storage.store(new Blob([], { type: 'application/pdf' })),
    );
    await expect(
      as.mutation(api.publications.submitPublication, {
        ...SUBMIT,
        fileId,
        fileName: 'vide.pdf',
      }),
    ).rejects.toThrow('INVALID_FILE');
    const all = await t.run((ctx) => ctx.db.query('publications').collect());
    expect(all).toHaveLength(0);
  });

  it('rejette un fichier au-dela de la limite de taille (INVALID_FILE)', async () => {
    const { t, as } = await asMember();
    const fileId = await t.run((ctx) =>
      ctx.storage.store(new Blob([new Uint8Array(20 * 1024 * 1024 + 1)])),
    );
    await expect(
      as.mutation(api.publications.submitPublication, {
        ...SUBMIT,
        fileId,
        fileName: 'rapport.pdf',
      }),
    ).rejects.toThrow('INVALID_FILE');
    // No publication created. The rejected blob stays orphaned: the throw rolls back
    // the transaction, so a deletion would have no effect.
    const all = await t.run((ctx) => ctx.db.query('publications').collect());
    expect(all).toHaveLength(0);
  });
});
