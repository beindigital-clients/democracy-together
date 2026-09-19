// @vitest-environment edge-runtime
//
// Issue #30 — les validateurs de RETOUR comme barrière structurelle.
//
// La faille H1 (publications réservées servies à tout le monde) tenait à un
// `return { ...pub }` : le document entier sortait. La PR #4 a corrigé le
// GATING, mais le spread est resté — une publication ouverte servait encore
// `reviewNotes`, `authorUserId`, `reviewedBy`, `fileId`…
//
// Ces tests vérifient les deux moitiés de la correction :
//  1. la projection ne laisse pas sortir un champ privé ;
//  2. le validateur de retour ne le DÉCLARE pas, donc Convex ferait échouer la
//     query si une projection future le remettait — la fuite deviendrait une
//     panne, jamais une donnée servie en silence.
//
// Chaque test est écrit pour ne pas être creux : on prouve d'abord que le champ
// privé est BIEN en base, puis qu'il ne ressort pas.
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

// Champs de modération / d'usage interne : aucun n'a à sortir d'une query
// publique. `reviewNotes` est le pire du lot — c'est la note d'un modérateur.
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
      // --- tout ce qui suit ne doit JAMAIS sortir -----------------------------
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
    // et en particulier, la note de modération
    expect(JSON.stringify(pub)).not.toContain('NOTE INTERNE');

    // Le contenu légitime, lui, est bien servi : la projection n'est pas
    // simplement « tout jeter ».
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

    // `image`, `license` et `pages` sont optionnels et absents de ce document :
    // la sortie est donc un SOUS-ENSEMBLE des champs déclarés, jamais plus.
    const declared = Object.keys(publicPublicationValidator.fields);
    for (const key of Object.keys(pub!)) {
      expect(declared).toContain(key);
    }
    // Et le validateur lui-même ne déclare aucun champ privé : même une
    // projection future qui les remettrait ferait échouer la query.
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

    // non creux : le document en base porte bien un statut.
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
    // non creux : le billet en base porte bien un auteur interne.
    expect((await t.run((ctx) => ctx.db.get(postId)))?.authorUserId).toBe(
      authorId,
    );

    const posts = await t.query(api.tribune.listPosts, {});
    expect(posts).toHaveLength(1);
    for (const field of ['authorUserId', 'status', 'body', '_creationTime']) {
      expect(Object.keys(posts[0])).not.toContain(field);
    }
    // l'extrait est borné : le corps intégral ne transite pas par la liste
    expect(posts[0].excerpt.endsWith('…')).toBe(true);
    expect(posts[0].excerpt).not.toContain('FIN');

    const post = await t.query(api.tribune.getPost, { postId });
    expect(post).not.toBeNull();
    for (const field of ['authorUserId', 'status', '_creationTime']) {
      expect(Object.keys(post!)).not.toContain(field);
    }
    // le détail, lui, sert bien le corps complet
    expect(post!.body).toBe(longBody);
  });
});
