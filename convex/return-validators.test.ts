// @vitest-environment edge-runtime
//
// Issue #30 — RETURN validators as a structural barrier.
//
// Flaw H1 (restricted publications served to everyone) came down to a
// `return { ...pub }`: the whole document went out. PR #4 fixed the
// GATING, but the spread stayed — an open publication still served
// `reviewNotes`, `authorUserId`, `reviewedBy`, `fileId`…
//
// These tests check both halves of the fix:
//  1. the projection does not let a private field out;
//  2. the return validator does not DECLARE it, so Convex would fail the
//     query if a future projection put it back — the leak would become a
//     failure, never data served silently.
//
// Each test is written so as not to be vacuous: we first prove that the private
// field IS in the database, then that it does not come out.
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import { publicPublicationValidator } from './lib/publications';
import { publicOrganizationValidator } from './lib/directory';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// Moderation / internal-use fields: none has any business leaving a public
// query. `reviewNotes` is the worst of the lot — it is a moderator's note.
const PRIVATE_PUBLICATION_FIELDS = [
  'authorUserId',
  'submittedAt',
  'reviewedBy',
  'reviewedAt',
  'reviewNotes',
  'reviewStage',
  'fileId',
  'fileName',
  'status',
  'createdAt',
  '_creationTime',
] as const;

async function seedPublication(t: ReturnType<typeof convexTest>) {
  const moderatorId = await t.run((ctx) =>
    ctx.db.insert('users', { role: 'moderateur', email: 'mod@test.org' }),
  );
  const authorId = await t.run((ctx) =>
    ctx.db.insert('users', { role: 'membre', email: 'auteur@test.org' }),
  );
  const pubId = await t.run((ctx) =>
    ctx.db.insert('publications', {
      title: 'Participation citoyenne en Afrique de l’Ouest',
      slug: 'participation-afrique-ouest',
      type: 'rapport',
      theme: 'participation',
      region: 'afrique',
      languages: ['fr'],
      access: 'open',
      authors: [{ name: 'A. Auteur', role: 'Chercheuse' }],
      year: 2025,
      publishedAt: 1_700_000_000_000,
      abstract: 'Un résumé public, suffisamment long pour rester intact.',
      keypoints: ['Point clé'],
      body: ['Corps du rapport.'],
      doi: '10.59000/dt.participation-afrique-ouest',
      downloads: 3,
      citations: 1,
      views: 7,
      status: 'published',
      createdAt: 1_699_000_000_000,
      // --- everything below must NEVER go out -----------------------------------
      authorUserId: authorId,
      submittedAt: 1_698_000_000_000,
      reviewedBy: moderatorId,
      reviewedAt: 1_699_500_000_000,
      reviewNotes: 'NOTE INTERNE : relancer l’auteur sur la méthodologie.',
      reviewStage: 'reviewed',
      fileName: 'rapport-interne.pdf',
    }),
  );
  return { pubId, authorId, moderatorId };
}

describe('Validateurs de retour — publications (issue #30)', () => {
  it('le document en base porte bien les champs privés (le test n’est pas creux)', async () => {
    const t = convexTest(schema, modules);
    const { pubId } = await seedPublication(t);
    const stored = await t.run((ctx) => ctx.db.get(pubId));
    expect(stored?.reviewNotes).toContain('NOTE INTERNE');
    expect(stored?.authorUserId).toBeDefined();
    expect(stored?.reviewedBy).toBeDefined();
    expect(stored?.reviewStage).toBe('reviewed');
  });

  it('getBySlug : aucun champ privé ne sort', async () => {
    const t = convexTest(schema, modules);
    await seedPublication(t);

    const pub = await t.query(api.publications.getBySlug, {
      slug: 'participation-afrique-ouest',
    });
    expect(pub).not.toBeNull();

    for (const field of PRIVATE_PUBLICATION_FIELDS) {
      expect(Object.keys(pub!)).not.toContain(field);
    }
    // and in particular, the moderation note
    expect(JSON.stringify(pub)).not.toContain('NOTE INTERNE');

    // The legitimate content, however, is indeed served: the projection is not
    // simply "throw everything away".
    expect(pub!.title).toBe('Participation citoyenne en Afrique de l’Ouest');
    expect(pub!.body).toEqual(['Corps du rapport.']);
    expect(pub!.views).toBe(7);
    expect(pub!.locked).toBe(false);
  });

  it('getBySlug : la sortie a EXACTEMENT les champs déclarés par le validateur', async () => {
    const t = convexTest(schema, modules);
    await seedPublication(t);
    const pub = await t.query(api.publications.getBySlug, {
      slug: 'participation-afrique-ouest',
    });

    // `image`, `license` and `pages` are optional and absent from this document:
    // the output is therefore a SUBSET of the declared fields, never more.
    const declared = Object.keys(publicPublicationValidator.fields);
    for (const key of Object.keys(pub!)) {
      expect(declared).toContain(key);
    }
    // And the validator itself declares no private field: even a
    // future projection that put them back would make the query fail.
    for (const field of PRIVATE_PUBLICATION_FIELDS) {
      expect(declared).not.toContain(field);
    }
  });

  it('listPublished et relatedByTheme : mêmes bornes que le détail', async () => {
    const t = convexTest(schema, modules);
    await seedPublication(t);
    const declared = Object.keys(publicPublicationValidator.fields);

    const { items } = await t.query(api.publications.listPublished, {});
    expect(items).toHaveLength(1);
    for (const key of Object.keys(items[0])) expect(declared).toContain(key);
    expect(JSON.stringify(items)).not.toContain('NOTE INTERNE');

    const related = await t.query(api.publications.relatedByTheme, {
      theme: 'participation',
      excludeSlug: 'un-autre-slug',
    });
    expect(related).toHaveLength(1);
    for (const key of Object.keys(related[0])) expect(declared).toContain(key);
    expect(JSON.stringify(related)).not.toContain('NOTE INTERNE');
  });
});

describe('Validateurs de retour — annuaire (issue #30)', () => {
  async function seedOrg(t: ReturnType<typeof convexTest>) {
    return await t.run((ctx) =>
      ctx.db.insert('organizations', {
        name: 'Institut Démo Sahel',
        slug: 'institut-demo-sahel',
        country: 'SN',
        region: 'afrique-ouest',
        languages: ['fr'],
        themes: ['gouvernance'],
        description: 'Description publique.',
        status: 'active',
        createdAt: 1_700_000_000_000,
      }),
    );
  }

  it('getBySlug et listDirectory : ni statut ni horodatage interne', async () => {
    const t = convexTest(schema, modules);
    const orgId = await seedOrg(t);

    // not vacuous: the document in the database does carry a status.
    expect((await t.run((ctx) => ctx.db.get(orgId)))?.status).toBe('active');

    const declared = Object.keys(publicOrganizationValidator.fields);
    const fiche = await t.query(api.organizations.getBySlug, {
      slug: 'institut-demo-sahel',
    });
    expect(fiche).not.toBeNull();
    for (const key of Object.keys(fiche!)) expect(declared).toContain(key);
    for (const field of ['status', 'createdAt', '_creationTime']) {
      expect(Object.keys(fiche!)).not.toContain(field);
    }
    expect(fiche!.name).toBe('Institut Démo Sahel');

    const { items } = await t.query(api.organizations.listDirectory, {});
    expect(items).toHaveLength(1);
    for (const key of Object.keys(items[0])) expect(declared).toContain(key);
  });
});

describe('Validateurs de retour — Tribune (issue #30)', () => {
  it('listPosts et getPost : ni auteur interne, ni statut, ni corps intégral en liste', async () => {
    const t = convexTest(schema, modules);
    const authorId = await t.run((ctx) =>
      ctx.db.insert('users', { role: 'membre', email: 'membre@test.org' }),
    );
    const longBody = `DEBUT ${'x'.repeat(400)} FIN`;
    const postId = await t.run((ctx) =>
      ctx.db.insert('tribunePosts', {
        authorUserId: authorId,
        authorName: 'Membre Démo',
        theme: 'participation',
        format: 'fond',
        title: 'Un billet de fond',
        body: longBody,
        status: 'published',
        commentCount: 0,
        createdAt: 1_700_000_000_000,
      }),
    );
    // not vacuous: the post in the database does carry an internal author.
    expect((await t.run((ctx) => ctx.db.get(postId)))?.authorUserId).toBe(
      authorId,
    );

    const posts = await t.query(api.tribune.listPosts, {});
    expect(posts).toHaveLength(1);
    for (const field of ['authorUserId', 'status', 'body', '_creationTime']) {
      expect(Object.keys(posts[0])).not.toContain(field);
    }
    // the excerpt is bounded: the full body does not travel through the list
    expect(posts[0].excerpt.endsWith('…')).toBe(true);
    expect(posts[0].excerpt).not.toContain('FIN');

    const post = await t.query(api.tribune.getPost, { postId });
    expect(post).not.toBeNull();
    for (const field of ['authorUserId', 'status', '_creationTime']) {
      expect(Object.keys(post!)).not.toContain(field);
    }
    // the detail, however, does serve the full body
    expect(post!.body).toBe(longBody);
  });
});
