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

// Pagination : les listes du back-office prennent désormais `paginationOpts`
// (issue #8). Une page large suffit à ces tests — ce qu'ils vérifient n'est pas
// le découpage mais le contenu.
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
    // sans filtre -> match
    expect(matchesPublication(p, {})).toBe(true);
    // OU intra-facette (un thème sur deux correspond)
    expect(
      matchesPublication(p, { themes: ['gouvernance-numerique', 'crises'] }),
    ).toBe(true);
    // ET inter-facette (thème OK mais type KO -> rejet)
    expect(
      matchesPublication(p, {
        themes: ['gouvernance-numerique'],
        types: ['rapport'],
      }),
    ).toBe(false);
    // langue : OU sur l'intersection
    expect(matchesPublication(p, { langs: ['en'] })).toBe(true);
    expect(
      matchesPublication(pub({ languages: ['fr'] }), { langs: ['en'] }),
    ).toBe(false);
    // accès
    expect(matchesPublication(p, { access: ['members'] })).toBe(false);
    // recherche plein texte (titre + auteurs, insensible à la casse)
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
    // fr apparaît 2x, en 2x -> ordre alpha (en avant fr)
    expect(f.languages.map((x) => x.value)).toEqual(['en', 'fr']);
  });

  it('computePublicationFacets : compteurs contextuels selon les autres filtres', () => {
    const items = [
      pub({ theme: 'gouvernance-numerique', type: 'rapport' }),
      pub({ theme: 'gouvernance-numerique', type: 'note' }),
      pub({ theme: 'crises', type: 'rapport' }),
    ];
    // sans filtre : totaux par type
    const f0 = computePublicationFacets(items);
    expect(Object.fromEntries(f0.types.map((x) => [x.value, x.count]))).toEqual(
      {
        rapport: 2,
        note: 1,
      },
    );
    // filtre theme=gouvernance : la facette TYPE ne compte QUE ces publications
    // -> le compteur reflète ce qu'on obtient vraiment en cochant.
    const f1 = computePublicationFacets(items, {
      themes: ['gouvernance-numerique'],
    });
    expect(Object.fromEntries(f1.types.map((x) => [x.value, x.count]))).toEqual(
      {
        rapport: 1,
        note: 1,
      },
    );
    // la facette THEME ignore sa propre sélection (compteurs d'ajout « OU »)
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
    expect(all.total).toBe(2); // brouillon exclu
    expect(all.items.map((p) => p.slug).sort()).toEqual(['pub-a', 'pub-b']);
    // facette thème ne compte pas le brouillon
    const themes = Object.fromEntries(
      all.facets.themes.map((x) => [x.value, x.count]),
    );
    expect(themes['transitions']).toBe(1);
    expect(themes['crises']).toBe(1);

    // filtre thème
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

// --- Dépôt documentaire (F-32) -----------------------------------------------

describe('slugify (F-32)', () => {
  it('normalise accents, casse et séparateurs ; borne la longueur', () => {
    expect(slugify('Élections & Démocratie locale')).toBe(
      'elections-democratie-locale',
    );
    expect(slugify('  Trop   d’espaces  ')).toBe('trop-d-espaces');
    expect(slugify('!!!')).toBe('publication'); // garde-fou si vide
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

    // anonyme refusé (requireUser)
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

    // jamais exposée publiquement tant qu’en attente
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

    // anonyme -> liste vide (pas d’erreur)
    expect((await t.query(api.publications.listMine, {})).length).toBe(0);
  });

  it('refuse le dépôt à un visiteur (modèle B)', async () => {
    const t = convexTest(schema, modules);
    // rôle visiteur explicite
    const visitorId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'visiteur', email: 'v@test.org' }),
    );
    await expect(
      t
        .withIdentity({ subject: `${visitorId}|s` })
        .mutation(api.publications.submitPublication, SUBMIT),
    ).rejects.toThrow();

    // compte sans rôle explicite (= visiteur par défaut) -> refusé aussi
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
      ctx.db.insert('users', { role: 'moderateur', email: 'mod@test.org' }),
    );
    const { id } = await t
      .withIdentity({ subject: `${memberId}|s` })
      .mutation(api.publications.submitPublication, SUBMIT);
    return { t, memberId, modId, id };
  }

  it('refuse un membre, accepte un modérateur : publie + DOI + audit', async () => {
    const { t, memberId, modId, id } = await setup();

    // un membre ne peut pas modérer
    await expect(
      t
        .withIdentity({ subject: `${memberId}|s` })
        .mutation(api.publications.reviewPublication, {
          publicationId: id,
          decision: 'approved',
        }),
    ).rejects.toThrow();

    // file de modération réservée au staff
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

    // un modérateur publie
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

    // désormais publique
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
    // pas publiée
    const pub = await t.query(api.publications.listPublished, {});
    expect(pub.items.some((p) => p._id === id)).toBe(false);
  });
});

describe('Modération de publication — machine à états (issue #9)', () => {
  // Même mise en place que la file de modération : un dépôt membre réel, donc
  // une publication en 'pending' avec un auteur.
  async function setup() {
    const t = convexTest(schema, modules);
    const memberId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'membre@test.org' }),
    );
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'mod@test.org' }),
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

    // Rejeu (double clic sur « Approuver ») : sans garde, la date de
    // publication et le DOI seraient réécrits et le journal montrerait deux
    // décisions.
    await expect(
      asMod.mutation(api.publications.reviewPublication, {
        publicationId: id,
        decision: 'approved',
      }),
    ).rejects.toThrow('ALREADY_REVIEWED');

    // Inversion : « Rejeter » après « Approuver » dépublierait en silence un
    // document déjà en ligne. Le retrait est une autre décision (issue #32).
    await expect(
      asMod.mutation(api.publications.reviewPublication, {
        publicationId: id,
        decision: 'rejected',
        notes: 'Finalement non.',
      }),
    ).rejects.toThrow('ALREADY_REVIEWED');

    // La publication est intacte, et le journal ne porte qu'UNE décision : le
    // throw annule la transaction, donc aussi la ligne d'audit.
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
    // et elle n'est pas passée en ligne au second tour
    const published = await t.query(api.publications.listPublished, {});
    expect(published.items.some((p) => p._id === id)).toBe(false);
  });

  it('refuse d’approuver un brouillon jamais soumis', async () => {
    const t = convexTest(schema, modules);
    const modId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'moderateur', email: 'mod@test.org' }),
    );
    const asMod = t.withIdentity({ subject: `${modId}|s` });
    // Un brouillon : jamais soumis, donc jamais relu (pas de `reviewedAt`).
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
    // et on ne la remet pas non plus dans la file par la porte de derrière
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

    // Réservé au staff : l'auteur ne rouvre pas son propre refus.
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
    // la note du refus reste : elle dit pourquoi la décision avait été prise
    expect(reopened?.reviewNotes).toBe('Refus prononcé par erreur.');
    // et le retour en arrière porte son propre nom dans le journal
    const reopenAudit = await t.run((ctx) =>
      ctx.db
        .query('auditLog')
        .withIndex('by_action', (q) => q.eq('action', 'publication.reopened'))
        .collect(),
    );
    expect(reopenAudit).toHaveLength(1);
    expect(reopenAudit[0].metadata).toMatchObject({ from: 'rejected' });

    // de retour dans la file, la publication se décide à nouveau — une fois.
    const { page: queue } = await asMod.query(api.publications.listForReview, {
      ...PAGE,
      status: 'pending',
    });
    expect(queue).toHaveLength(1);
    // et le compteur du tableau de bord la recompte (issue #8) : une file qui
    // affiche « 0 en attente » alors qu'elle en contient une est un écran qui
    // ment.
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
    // Aucune publication creee. Le blob rejete reste orphelin : le throw annule
    // la transaction (rollback), donc une suppression serait sans effet.
    const all = await t.run((ctx) => ctx.db.query('publications').collect());
    expect(all).toHaveLength(0);
  });
});
