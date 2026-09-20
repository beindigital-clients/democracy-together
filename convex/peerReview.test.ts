// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import frMessages from '../src/messages/fr.json';
import enMessages from '../src/messages/en.json';

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

// Fabrique une publication minimale (statut 'pending' par défaut, comme un dépôt
// membre) ; `over` permet d'injecter slug / authorUserId / reviewStage.
function pubDoc(over: Record<string, unknown> = {}) {
  return {
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
    status: 'pending' as const,
    createdAt: 0,
    ...over,
  };
}

async function userWithRole(
  t: ReturnType<typeof convexTest>,
  role: 'visiteur' | 'membre' | 'moderateur' | 'editeur' | 'admin',
  email: string,
  name?: string,
) {
  const id = await t.run((ctx) =>
    ctx.db.insert('users', { role, email, name }),
  );
  return { id, as: t.withIdentity({ subject: `${id}|s` }) };
}

describe('Peer review — assignReviewer (F-43)', () => {
  it('réservé à l’éditeur ; passe in_review ; notifie le relecteur', async () => {
    const t = convexTest(schema, modules);
    const pubId = await t.run((ctx) =>
      ctx.db.insert(
        'publications',
        pubDoc({ title: 'Analyse X', slug: 'analyse-x' }),
      ),
    );
    const mod = await userWithRole(
      t,
      'moderateur',
      'mod@test.org',
      'Relecteur Mod',
    );
    const editor = await userWithRole(t, 'editeur', 'ed@test.org');

    // anonyme refusé
    await expect(
      t.mutation(api.peerReview.assignReviewer, {
        publicationId: pubId,
        reviewerUserId: mod.id,
      }),
    ).rejects.toThrow();

    // modérateur (sous éditeur) refusé pour l'assignation
    await expect(
      mod.as.mutation(api.peerReview.assignReviewer, {
        publicationId: pubId,
        reviewerUserId: mod.id,
      }),
    ).rejects.toThrow();

    // éditeur : succès
    const res = await editor.as.mutation(api.peerReview.assignReviewer, {
      publicationId: pubId,
      reviewerUserId: mod.id,
    });
    expect(res.ok).toBe(true);

    // reviewStage passe à in_review ; le status de modération n'a pas bougé
    const pub = await t.run((ctx) => ctx.db.get(pubId));
    expect(pub?.reviewStage).toBe('in_review');
    expect(pub?.status).toBe('pending');

    // le relecteur est notifié (titleKey + lien + titre interpolé)
    const notifs = await mod.as.query(api.notifications.myNotifications, {});
    expect(notifs).toHaveLength(1);
    expect(notifs[0].titleKey).toBe('peerReviewAssigned');
    expect(notifs[0].params.title).toBe('Analyse X');
    expect(notifs[0].link).toBe('/admin/revue');
  });
});

describe('Peer review — submitReview (F-43)', () => {
  it('réservé au modérateur ; stocke l’avis ; valide le commentaire', async () => {
    const t = convexTest(schema, modules);
    const pubId = await t.run((ctx) =>
      ctx.db.insert('publications', pubDoc({ slug: 'p-review' })),
    );
    const member = await userWithRole(t, 'membre', 'm@test.org');
    const mod = await userWithRole(t, 'moderateur', 'mod@test.org', 'Awa Diop');

    const ok = {
      publicationId: pubId,
      recommendation: 'minor' as const,
      comment: 'Texte solide, quelques précisions à apporter en section 2.',
    };

    // anonyme refusé
    await expect(t.mutation(api.peerReview.submitReview, ok)).rejects.toThrow();
    // membre (sous modérateur) refusé
    await expect(
      member.as.mutation(api.peerReview.submitReview, ok),
    ).rejects.toThrow();

    // commentaire trop court (< 10) refusé
    await expect(
      mod.as.mutation(api.peerReview.submitReview, { ...ok, comment: 'court' }),
    ).rejects.toThrow();

    // modérateur : succès, avis stocké avec nom dénormalisé du relecteur
    const res = await mod.as.mutation(api.peerReview.submitReview, ok);
    expect(res.ok).toBe(true);
    const rows = await t.run((ctx) =>
      ctx.db
        .query('peerReviews')
        .withIndex('by_publication', (q) => q.eq('publicationId', pubId))
        .collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].recommendation).toBe('minor');
    expect(rows[0].reviewerName).toBe('Awa Diop');
    expect(rows[0].reviewerUserId).toBe(mod.id);
  });
});

describe('Peer review — getReviewQueue (F-43)', () => {
  it('réservé à l’éditeur ; ne renvoie que les publications en revue + agrège', async () => {
    const t = convexTest(schema, modules);
    // une publication en revue, une hors revue (reviewStage absent)
    const inReview = await t.run((ctx) =>
      ctx.db.insert(
        'publications',
        pubDoc({ slug: 'in', title: 'En revue', reviewStage: 'in_review' }),
      ),
    );
    await t.run((ctx) =>
      ctx.db.insert(
        'publications',
        pubDoc({ slug: 'out', title: 'Hors revue' }),
      ),
    );
    const mod = await userWithRole(t, 'moderateur', 'mod@test.org', 'Mod');
    const editor = await userWithRole(t, 'editeur', 'ed@test.org');

    // modérateur refusé pour la file
    await expect(
      mod.as.query(api.peerReview.getReviewQueue, PAGE),
    ).rejects.toThrow();

    // deux avis : minor puis reject -> l'agrégat retient le plus sévère (reject)
    await mod.as.mutation(api.peerReview.submitReview, {
      publicationId: inReview,
      recommendation: 'minor',
      comment: 'Quelques retouches mineures suffisent.',
    });
    await editor.as.mutation(api.peerReview.submitReview, {
      publicationId: inReview,
      recommendation: 'reject',
      comment: 'Méthodologie insuffisante pour publication.',
    });

    const { page: queue } = await editor.as.query(
      api.peerReview.getReviewQueue,
      PAGE,
    );
    expect(queue).toHaveLength(1);
    expect(queue[0].title).toBe('En revue');
    expect(queue[0].reviewStage).toBe('in_review');
    expect(queue[0].reviews).toHaveLength(2);
    expect(queue[0].aggregate).toBe('reject');
    expect(queue[0].hasAuthor).toBe(false);
  });
});

describe('Peer review — decideReview (F-43)', () => {
  it('réservé à l’éditeur ; patch reviewStage ; notifie l’auteur', async () => {
    const t = convexTest(schema, modules);
    const author = await userWithRole(t, 'membre', 'author@test.org', 'Auteur');
    const pubId = await t.run((ctx) =>
      ctx.db.insert(
        'publications',
        pubDoc({
          slug: 'decide',
          title: 'À décider',
          reviewStage: 'in_review',
          authorUserId: author.id,
        }),
      ),
    );
    const mod = await userWithRole(t, 'moderateur', 'mod@test.org');
    const editor = await userWithRole(t, 'editeur', 'ed@test.org');

    // modérateur refusé pour la décision
    await expect(
      mod.as.mutation(api.peerReview.decideReview, {
        publicationId: pubId,
        decision: 'revision',
      }),
    ).rejects.toThrow();

    // éditeur : décision 'revision'
    const res = await editor.as.mutation(api.peerReview.decideReview, {
      publicationId: pubId,
      decision: 'revision',
    });
    expect(res.ok).toBe(true);

    const pub = await t.run((ctx) => ctx.db.get(pubId));
    expect(pub?.reviewStage).toBe('revision');
    expect(pub?.status).toBe('pending'); // intact

    // l'auteur est notifié
    const notifs = await author.as.query(api.notifications.myNotifications, {});
    expect(notifs).toHaveLength(1);
    expect(notifs[0].titleKey).toBe('peerReviewDecided');
    expect(notifs[0].params.title).toBe('À décider');
    expect(notifs[0].link).toBe('/espace-membre');

    // une entrée d'audit a été écrite pour la revue par les pairs
    const audits = await t.run((ctx) =>
      ctx.db
        .query('auditLog')
        .withIndex('by_action', (q) =>
          q.eq('action', 'publication.peer_review'),
        )
        .collect(),
    );
    expect(audits.some((a) => a.actorId === editor.id)).toBe(true);
  });
});

describe('Peer review — listStaffUsers (F-43)', () => {
  it('réservé à l’éditeur ; ne renvoie que le staff (modérateur+)', async () => {
    const t = convexTest(schema, modules);
    await userWithRole(t, 'visiteur', 'v@test.org');
    await userWithRole(t, 'membre', 'm@test.org');
    await userWithRole(t, 'moderateur', 'mod@test.org', 'Mod');
    const editor = await userWithRole(t, 'editeur', 'ed@test.org', 'Ed');
    await userWithRole(t, 'admin', 'adm@test.org', 'Adm');

    // un membre ne peut pas lister
    const member = t.withIdentity({ subject: 'nope|s' });
    await expect(
      member.query(api.peerReview.listStaffUsers, {}),
    ).rejects.toThrow();

    const staff = await editor.as.query(api.peerReview.listStaffUsers, {});
    const roles = staff.map((u) => u.role).sort();
    expect(roles).toEqual(['admin', 'editeur', 'moderateur']);
    // ni visiteur ni membre — vérifié sur les adresses, car depuis que la
    // lecture passe par l'index `by_role` (issue #8) le TYPE de retour exclut
    // déjà ces rôles : comparer `u.role` à 'visiteur' ne compilerait plus, et
    // un test qui ne peut pas échouer ne garde rien.
    expect(staff.map((u) => u.email).sort()).toEqual([
      'adm@test.org',
      'ed@test.org',
      'mod@test.org',
    ]);
  });
});

// Convention projet : le terme « démocratie libérale » / « liberal democracy »
// est BANNI. On vérifie son absence dans les chaînes i18n que cette feature
// introduit (namespaces peerReview/notifications + admin.rev*), FR et EN.
describe('Peer review — contenu (terme banni)', () => {
  it('aucune chaîne F-43 ne contient « démocratie libérale » / « liberal democracy »', () => {
    const collect = (obj: Record<string, unknown>, prefix: string) =>
      Object.entries(obj)
        .filter(([k]) => k.startsWith(prefix))
        .map(([, v]) => String(v))
        .join(' ');

    const haystack = [
      collect(frMessages.notifications, 'peerReview'),
      collect(enMessages.notifications, 'peerReview'),
      collect(frMessages.admin, 'rev'),
      collect(enMessages.admin, 'rev'),
      (frMessages.admin as Record<string, string>).review,
      (enMessages.admin as Record<string, string>).review,
    ]
      .join(' ')
      .toLowerCase();

    expect(haystack).not.toContain('démocratie libérale');
    expect(haystack).not.toContain('democratie liberale');
    expect(haystack).not.toContain('liberal democracy');
  });
});
