// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import {
  projectPublication,
  truncateAbstract,
  isPublicationLocked,
  MEMBERS_TEASER_CHARS,
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

// Résumé assez long pour être tronqué (> MEMBERS_TEASER_CHARS).
const LONG_ABSTRACT =
  'Ce rapport analyse les mécanismes de participation citoyenne dans huit pays ' +
  "d'Afrique de l'Ouest, à partir d'une enquête de terrain menée sur dix-huit " +
  'mois auprès de quatre cents organisations locales. Il documente les écarts ' +
  'entre les cadres juridiques et les pratiques observées, puis formule douze ' +
  'recommandations opérationnelles à destination des bailleurs et des autorités.';

const BODY = ['Premier paragraphe du corps.', 'Second paragraphe du corps.'];

function doc(access: 'open' | 'members', slug: string) {
  return {
    title: `Publication ${slug}`,
    slug,
    type: 'rapport' as const,
    theme: 'participation',
    region: 'afrique' as const,
    languages: ['fr' as const],
    access,
    authors: [{ name: 'A. Auteur' }],
    year: 2025,
    publishedAt: 1_700_000_000_000,
    abstract: LONG_ABSTRACT,
    keypoints: ['Point clé 1'],
    body: BODY,
    doi: `10.59000/dt.${slug}`,
    downloads: 3,
    citations: 1,
    views: 0,
    status: 'published' as const,
    createdAt: 0,
  };
}

// ---------------------------------------------------------------------------
// Logique pure
// ---------------------------------------------------------------------------

describe('Gating membres — logique pure (F-35)', () => {
  it('isPublicationLocked : seul « members » + non-membre est verrouillé', () => {
    expect(isPublicationLocked('members', false)).toBe(true);
    expect(isPublicationLocked('members', true)).toBe(false);
    expect(isPublicationLocked('open', false)).toBe(false);
    expect(isPublicationLocked('open', true)).toBe(false);
  });

  it('truncateAbstract : coupe sur une frontière de mot et ajoute une ellipse', () => {
    const out = truncateAbstract(LONG_ABSTRACT);
    expect(out.length).toBeLessThanOrEqual(MEMBERS_TEASER_CHARS + 1);
    expect(out.endsWith('…')).toBe(true);
    // pas de mot coupé en deux : le texte tronqué est un préfixe du résumé
    expect(LONG_ABSTRACT.startsWith(out.slice(0, -1).trimEnd())).toBe(true);
  });

  it('truncateAbstract : laisse intact un résumé déjà court', () => {
    expect(truncateAbstract('Résumé court.')).toBe('Résumé court.');
  });

  it('projectPublication : publication ouverte -> tout est servi', () => {
    const out = projectPublication(doc('open', 'ouverte'), 'https://files/x.pdf', false);
    expect(out.locked).toBe(false);
    expect(out.fileUrl).toBe('https://files/x.pdf');
    expect(out.body).toEqual(BODY);
    expect(out.abstract).toBe(LONG_ABSTRACT);
  });

  it('projectPublication : réservée + non-membre -> corps, fichier et résumé masqués', () => {
    const out = projectPublication(doc('members', 'reservee'), 'https://files/x.pdf', false);
    expect(out.locked).toBe(true);
    expect(out.fileUrl).toBeNull();
    expect(out.body).toEqual([]);
    expect(out.abstract).not.toBe(LONG_ABSTRACT);
    expect(out.abstract.endsWith('…')).toBe(true);
    // Les métadonnées de découverte restent publiques (SEO, décision d'adhérer).
    expect(out.title).toBe('Publication reservee');
    expect(out.doi).toBe('10.59000/dt.reservee');
  });

  it('projectPublication : réservée + membre -> tout est servi', () => {
    const out = projectPublication(doc('members', 'reservee'), 'https://files/x.pdf', true);
    expect(out.locked).toBe(false);
    expect(out.fileUrl).toBe('https://files/x.pdf');
    expect(out.body).toEqual(BODY);
    expect(out.abstract).toBe(LONG_ABSTRACT);
  });
});

// ---------------------------------------------------------------------------
// Queries Convex — c'est ici que vivait la faille (audit H1 / pentest H-1)
// ---------------------------------------------------------------------------

async function seed() {
  const t = convexTest(schema, modules);
  const fileId = await t.run((ctx) =>
    ctx.storage.store(
      new Blob(['%PDF-1.4 document reserve'], { type: 'application/pdf' }),
    ),
  );
  await t.run(async (ctx) => {
    await ctx.db.insert('publications', { ...doc('members', 'reservee'), fileId });
    await ctx.db.insert('publications', { ...doc('open', 'ouverte'), fileId });
  });
  return { t, fileId };
}

async function userWithRole(
  t: Awaited<ReturnType<typeof seed>>['t'],
  role: string | undefined,
  email: string,
) {
  const id = await t.run((ctx) =>
    ctx.db.insert('users', { ...(role ? { role } : {}), email } as never),
  );
  return t.withIdentity({ subject: `${id}|s` });
}

describe('getBySlug — publications réservées aux membres (F-35)', () => {
  it('anonyme : ne reçoit ni URL de fichier ni corps pour une publication réservée', async () => {
    const { t } = await seed();
    const pub = await t.query(api.publications.getBySlug, { slug: 'reservee' });
    expect(pub).not.toBeNull();
    expect(pub!.locked).toBe(true);
    expect(pub!.fileUrl).toBeNull();
    expect(pub!.body).toEqual([]);
    expect(pub!.abstract.endsWith('…')).toBe(true);
  });

  it('anonyme : reçoit tout pour une publication ouverte', async () => {
    const { t } = await seed();
    const pub = await t.query(api.publications.getBySlug, { slug: 'ouverte' });
    expect(pub!.locked).toBe(false);
    expect(pub!.fileUrl).toBeTruthy();
    expect(pub!.body).toEqual(BODY);
  });

  it('compte authentifié sans adhésion validée (visiteur) : verrouillé', async () => {
    const { t } = await seed();
    const asVisitor = await userWithRole(t, 'visiteur', 'v@test.org');
    const pub = await asVisitor.query(api.publications.getBySlug, { slug: 'reservee' });
    expect(pub!.locked).toBe(true);
    expect(pub!.fileUrl).toBeNull();

    // compte sans rôle explicite (= visiteur par défaut) -> verrouillé aussi
    const asNoRole = await userWithRole(t, undefined, 'nr@test.org');
    const pub2 = await asNoRole.query(api.publications.getBySlug, { slug: 'reservee' });
    expect(pub2!.locked).toBe(true);
    expect(pub2!.fileUrl).toBeNull();
  });

  it('membre : reçoit le corps et l’URL signée du document', async () => {
    const { t } = await seed();
    const asMember = await userWithRole(t, 'membre', 'm@test.org');
    const pub = await asMember.query(api.publications.getBySlug, { slug: 'reservee' });
    expect(pub!.locked).toBe(false);
    expect(pub!.fileUrl).toBeTruthy();
    expect(pub!.body).toEqual(BODY);
    expect(pub!.abstract).toBe(LONG_ABSTRACT);
  });

  it('modérateur (rôle supérieur) : reçoit aussi le document', async () => {
    const { t } = await seed();
    const asMod = await userWithRole(t, 'moderateur', 'mod@test.org');
    const pub = await asMod.query(api.publications.getBySlug, { slug: 'reservee' });
    expect(pub!.locked).toBe(false);
    expect(pub!.fileUrl).toBeTruthy();
  });
});

describe('listPublished — la liste ne fuit pas le contenu réservé (F-35)', () => {
  it('anonyme : corps vidé et résumé tronqué sur les réservées, intact sur les ouvertes', async () => {
    const { t } = await seed();
    const { items } = await t.query(api.publications.listPublished, {});
    const reservee = items.find((p) => p.slug === 'reservee')!;
    const ouverte = items.find((p) => p.slug === 'ouverte')!;

    expect(reservee.locked).toBe(true);
    expect(reservee.body).toEqual([]);
    expect(reservee.abstract.endsWith('…')).toBe(true);

    expect(ouverte.locked).toBe(false);
    expect(ouverte.body).toEqual(BODY);
    expect(ouverte.abstract).toBe(LONG_ABSTRACT);
  });

  it('membre : le corps des réservées est servi', async () => {
    const { t } = await seed();
    const asMember = await userWithRole(t, 'membre', 'm@test.org');
    const { items } = await asMember.query(api.publications.listPublished, {});
    const reservee = items.find((p) => p.slug === 'reservee')!;
    expect(reservee.locked).toBe(false);
    expect(reservee.body).toEqual(BODY);
  });

  it('les facettes comptent toujours les réservées (découvrabilité)', async () => {
    const { t } = await seed();
    const { facets, total } = await t.query(api.publications.listPublished, {});
    expect(total).toBe(2);
    const access = Object.fromEntries(facets.access.map((f) => [f.value, f.count]));
    expect(access['members']).toBe(1);
    expect(access['open']).toBe(1);
  });
});

describe('relatedByTheme — le bloc « même thématique » ne fuit pas non plus', () => {
  it('anonyme : corps vidé sur une réservée liée', async () => {
    const { t } = await seed();
    const related = await t.query(api.publications.relatedByTheme, {
      theme: 'participation',
      excludeSlug: 'ouverte',
    });
    const reservee = related.find((p) => p.slug === 'reservee')!;
    expect(reservee.locked).toBe(true);
    expect(reservee.body).toEqual([]);
  });
});
