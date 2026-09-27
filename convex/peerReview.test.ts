// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';
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
    // Le lien mène à « Mes relectures », ouverte au rang modérateur — et non
    // à la file éditeur, où un relecteur modérateur tombait sur un refus
    // (campagne du 27/09, A-02).
    expect(notifs[0].link).toBe('/admin/mes-relectures');

    // L'assignation est RETENUE (27/09, R-01) : c'est ce qui rend la vue du
    // relecteur possible, là où seule la notification en gardait la trace.
    const assignments = await t.run((ctx) =>
      ctx.db
        .query('peerReviewAssignments')
        .withIndex('by_publication', (q) => q.eq('publicationId', pubId))
        .collect(),
    );
    expect(assignments).toHaveLength(1);
    expect(assignments[0].reviewerUserId).toBe(mod.id);
    expect(assignments[0].assignedBy).toBe(editor.id);
  });

  it('refuse un relecteur sans rang de modérateur, et une double désignation sur une revue ouverte', async () => {
    const t = convexTest(schema, modules);
    const pubId = await t.run((ctx) =>
      ctx.db.insert('publications', pubDoc({ slug: 'garde-assign' })),
    );
    const member = await userWithRole(t, 'membre', 'm@test.org', 'Membre');
    const mod = await userWithRole(t, 'moderateur', 'mod@test.org', 'Mod');
    const editor = await userWithRole(t, 'editeur', 'ed@test.org');

    // Un membre ne peut pas déposer d'avis (`submitReview` exige modérateur) :
    // le désigner ouvrirait une revue que personne ne peut faire avancer.
    await expect(
      editor.as.mutation(api.peerReview.assignReviewer, {
        publicationId: pubId,
        reviewerUserId: member.id,
      }),
    ).rejects.toThrow('REVIEWER_NOT_STAFF');
    expect(await t.run((ctx) => ctx.db.get(pubId))).toMatchObject({
      status: 'pending',
    });

    await editor.as.mutation(api.peerReview.assignReviewer, {
      publicationId: pubId,
      reviewerUserId: mod.id,
    });
    // Double clic : le même relecteur sur la même revue OUVERTE n'est pas un
    // second relecteur — refus nommé, une seule notification.
    await expect(
      editor.as.mutation(api.peerReview.assignReviewer, {
        publicationId: pubId,
        reviewerUserId: mod.id,
      }),
    ).rejects.toThrow('ALREADY_ASSIGNED');
    expect(
      await mod.as.query(api.notifications.myNotifications, {}),
    ).toHaveLength(1);

    // Sur une revue CLOSE, la même personne peut être redésignée : c'est la
    // réouverture (issue #9), et la ligne d'assignation est mise à jour, pas
    // dupliquée.
    await editor.as.mutation(api.peerReview.decideReview, {
      publicationId: pubId,
      decision: 'reviewed',
    });
    await editor.as.mutation(api.peerReview.assignReviewer, {
      publicationId: pubId,
      reviewerUserId: mod.id,
    });
    const assignments = await t.run((ctx) =>
      ctx.db
        .query('peerReviewAssignments')
        .withIndex('by_publication', (q) => q.eq('publicationId', pubId))
        .collect(),
    );
    expect(assignments).toHaveLength(1);
    expect(
      await mod.as.query(api.notifications.myNotifications, {}),
    ).toHaveLength(2);
  });
});

// Porte d'entrée de la revue (campagne du 27/09, R-01) : ce qu'un éditeur
// peut envoyer en relecture, depuis l'interface.
describe('Peer review — listOpenable (27/09, R-01)', () => {
  it('réservé à l’éditeur ; ne rend que les dépôts en attente jamais entrés en revue', async () => {
    const t = convexTest(schema, modules);
    const pending = await t.run((ctx) =>
      ctx.db.insert(
        'publications',
        pubDoc({ slug: 'ouvrable', title: 'Ouvrable', submittedAt: 10 }),
      ),
    );
    await t.run((ctx) =>
      ctx.db.insert(
        'publications',
        pubDoc({
          slug: 'deja',
          title: 'Déjà en revue',
          reviewStage: 'in_review',
        }),
      ),
    );
    await t.run((ctx) =>
      ctx.db.insert(
        'publications',
        pubDoc({ slug: 'publiee', title: 'Publiée', status: 'published' }),
      ),
    );
    const mod = await userWithRole(t, 'moderateur', 'mod@test.org', 'Mod');
    const editor = await userWithRole(t, 'editeur', 'ed@test.org');

    await expect(
      mod.as.query(api.peerReview.listOpenable, {}),
    ).rejects.toThrow();

    const before = await editor.as.query(api.peerReview.listOpenable, {});
    expect(before.map((p) => p.title)).toEqual(['Ouvrable']);
    expect(before[0].submittedAt).toBe(10);

    // Une fois la revue ouverte, la publication quitte la liste : la porte
    // ne propose que ce qui n'est pas encore entré.
    await editor.as.mutation(api.peerReview.assignReviewer, {
      publicationId: pending,
      reviewerUserId: mod.id,
    });
    expect(await editor.as.query(api.peerReview.listOpenable, {})).toEqual([]);
  });
});

// La vue du RELECTEUR (campagne du 27/09, A-02) : un modérateur voit ce qu'on
// lui a confié, rien d'autre, et peut y déposer son avis.
describe('Peer review — myAssignments (27/09, A-02)', () => {
  it('rend au modérateur SES assignations, avec son avis une fois déposé', async () => {
    const t = convexTest(schema, modules);
    const mine = await t.run((ctx) =>
      ctx.db.insert(
        'publications',
        pubDoc({ slug: 'mienne', title: 'Mienne' }),
      ),
    );
    const theirs = await t.run((ctx) =>
      ctx.db.insert('publications', pubDoc({ slug: 'autre', title: 'Autre' })),
    );
    const member = await userWithRole(t, 'membre', 'm@test.org');
    const mod = await userWithRole(t, 'moderateur', 'mod@test.org', 'Mod');
    const other = await userWithRole(t, 'moderateur', 'mod2@test.org', 'Mod 2');
    const editor = await userWithRole(t, 'editeur', 'ed@test.org');

    await editor.as.mutation(api.peerReview.assignReviewer, {
      publicationId: mine,
      reviewerUserId: mod.id,
    });
    await editor.as.mutation(api.peerReview.assignReviewer, {
      publicationId: theirs,
      reviewerUserId: other.id,
    });

    // sous modérateur : refusé ; l'identité vient de la session, pas d'un
    // argument — il n'y a rien à falsifier.
    await expect(
      member.as.query(api.peerReview.myAssignments, {}),
    ).rejects.toThrow();
    // la file complète reste réservée à l'éditeur (A-02 ne l'ouvre pas)
    await expect(
      mod.as.query(api.peerReview.getReviewQueue, PAGE),
    ).rejects.toThrow();

    const list = await mod.as.query(api.peerReview.myAssignments, {});
    expect(list.map((p) => p.title)).toEqual(['Mienne']);
    expect(list[0].reviewStage).toBe('in_review');
    expect(list[0].myReview).toBeNull();

    // Le relecteur modérateur dépose son avis — c'est le parcours que la
    // page d'erreur interdisait — et le retrouve dans sa vue.
    await mod.as.mutation(api.peerReview.submitReview, {
      publicationId: mine,
      recommendation: 'minor',
      comment: 'Quelques précisions à apporter en section 2.',
    });
    const after = await mod.as.query(api.peerReview.myAssignments, {});
    expect(after[0].myReview).toMatchObject({ recommendation: 'minor' });

    // L'autre relecteur ne voit que la sienne.
    const others = await other.as.query(api.peerReview.myAssignments, {});
    expect(others.map((p) => p.title)).toEqual(['Autre']);
  });
});

describe('Peer review — reviewStagesFor (27/09, R-01)', () => {
  it('rend l’étape des publications demandées, null hors revue', async () => {
    const t = convexTest(schema, modules);
    const a = await t.run((ctx) =>
      ctx.db.insert(
        'publications',
        pubDoc({ slug: 'a', reviewStage: 'revision' }),
      ),
    );
    const b = await t.run((ctx) =>
      ctx.db.insert('publications', pubDoc({ slug: 'b' })),
    );
    const mod = await userWithRole(t, 'moderateur', 'mod@test.org', 'Mod');
    const member = await userWithRole(t, 'membre', 'm@test.org');

    await expect(
      member.as.query(api.peerReview.reviewStagesFor, {
        publicationIds: [a],
      }),
    ).rejects.toThrow();

    const stages = await mod.as.query(api.peerReview.reviewStagesFor, {
      publicationIds: [a, b],
    });
    expect(stages).toEqual([
      { publicationId: a, reviewStage: 'revision', reviewerCount: 0 },
      { publicationId: b, reviewStage: null, reviewerCount: 0 },
    ]);
  });
});

describe('Peer review — submitReview (F-43)', () => {
  it('réservé au modérateur ; stocke l’avis ; valide le commentaire', async () => {
    const t = convexTest(schema, modules);
    // `reviewStage: 'in_review'` : un avis ne se dépose que sur une revue
    // OUVERTE (issue #9) — c'est `assignReviewer` qui l'ouvre.
    const pubId = await t.run((ctx) =>
      ctx.db.insert(
        'publications',
        pubDoc({ slug: 'p-review', reviewStage: 'in_review' }),
      ),
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

describe('Peer review — machine à états (issue #9)', () => {
  // Compte les avis d'une publication : c'est la preuve que la transaction
  // refusée n'a RIEN écrit (le throw annule tout, ligne d'audit comprise).
  async function reviewsOf(
    t: ReturnType<typeof convexTest>,
    publicationId: Id<'publications'>,
  ) {
    return await t.run((ctx) =>
      ctx.db
        .query('peerReviews')
        .withIndex('by_publication', (q) =>
          q.eq('publicationId', publicationId),
        )
        .collect(),
    );
  }

  const AVIS = {
    recommendation: 'minor' as const,
    comment: 'Texte solide, quelques précisions à apporter en section 2.',
  };

  it('submitReview : un relecteur ne dépose qu’UN avis (rejeu refusé)', async () => {
    const t = convexTest(schema, modules);
    const pubId = await t.run((ctx) =>
      ctx.db.insert('publications', pubDoc({ slug: 'un-avis' })),
    );
    const mod = await userWithRole(t, 'moderateur', 'mod@test.org', 'Mod');
    const other = await userWithRole(t, 'moderateur', 'mod2@test.org', 'Mod 2');
    const editor = await userWithRole(t, 'editeur', 'ed@test.org');
    await editor.as.mutation(api.peerReview.assignReviewer, {
      publicationId: pubId,
      reviewerUserId: mod.id,
    });

    await mod.as.mutation(api.peerReview.submitReview, {
      publicationId: pubId,
      ...AVIS,
    });
    // Rejeu : le même relecteur revient, avec une autre recommandation. Sans
    // garde, il pèserait deux fois dans l'agrégat (le plus sévère l'emporte).
    await expect(
      mod.as.mutation(api.peerReview.submitReview, {
        publicationId: pubId,
        recommendation: 'reject',
        comment: 'Je change d’avis après relecture de la section 4.',
      }),
    ).rejects.toThrow('ALREADY_REVIEWED');
    expect(await reviewsOf(t, pubId)).toHaveLength(1);

    // un AUTRE relecteur, lui, reste attendu : la garde est par personne.
    await other.as.mutation(api.peerReview.submitReview, {
      publicationId: pubId,
      recommendation: 'major',
      comment: 'La revue de littérature demande un développement.',
    });
    expect(await reviewsOf(t, pubId)).toHaveLength(2);
    const { page: queue } = await editor.as.query(
      api.peerReview.getReviewQueue,
      PAGE,
    );
    expect(queue[0].aggregate).toBe('major');
  });

  it('submitReview : refuse un avis hors revue ouverte (jamais assignée, close)', async () => {
    const t = convexTest(schema, modules);
    const never = await t.run((ctx) =>
      ctx.db.insert('publications', pubDoc({ slug: 'jamais-assignee' })),
    );
    const closed = await t.run((ctx) =>
      ctx.db.insert(
        'publications',
        pubDoc({ slug: 'close', reviewStage: 'reviewed' }),
      ),
    );
    const mod = await userWithRole(t, 'moderateur', 'mod@test.org', 'Mod');

    // jamais entrée en revue : il n'y a rien à éclairer.
    await expect(
      mod.as.mutation(api.peerReview.submitReview, {
        publicationId: never,
        ...AVIS,
      }),
    ).rejects.toThrow('INVALID_TRANSITION');
    // revue close : l'avis arriverait APRÈS l'arbitrage qu'il devait éclairer.
    await expect(
      mod.as.mutation(api.peerReview.submitReview, {
        publicationId: closed,
        ...AVIS,
      }),
    ).rejects.toThrow('ALREADY_REVIEWED');

    expect(await reviewsOf(t, never)).toHaveLength(0);
    expect(await reviewsOf(t, closed)).toHaveLength(0);
  });

  it('decideReview : refuse le rejeu, l’inversion, et la décision sans relecteur', async () => {
    const t = convexTest(schema, modules);
    const pubId = await t.run((ctx) =>
      ctx.db.insert('publications', pubDoc({ slug: 'arbitrage' })),
    );
    const mod = await userWithRole(t, 'moderateur', 'mod@test.org', 'Mod');
    const editor = await userWithRole(t, 'editeur', 'ed@test.org');

    // Aucune revue ouverte : il n'y a pas d'arbitrage à rendre.
    await expect(
      editor.as.mutation(api.peerReview.decideReview, {
        publicationId: pubId,
        decision: 'reviewed',
      }),
    ).rejects.toThrow('INVALID_TRANSITION');

    await editor.as.mutation(api.peerReview.assignReviewer, {
      publicationId: pubId,
      reviewerUserId: mod.id,
    });
    await editor.as.mutation(api.peerReview.decideReview, {
      publicationId: pubId,
      decision: 'reviewed',
    });

    // Rejeu et inversion : la revue est close, elle ne se rejuge pas.
    await expect(
      editor.as.mutation(api.peerReview.decideReview, {
        publicationId: pubId,
        decision: 'reviewed',
      }),
    ).rejects.toThrow('ALREADY_REVIEWED');
    await expect(
      editor.as.mutation(api.peerReview.decideReview, {
        publicationId: pubId,
        decision: 'revision',
      }),
    ).rejects.toThrow('ALREADY_REVIEWED');
    expect(await t.run((ctx) => ctx.db.get(pubId))).toMatchObject({
      reviewStage: 'reviewed',
    });

    // Un refus n'écrit rien : la seule trace d'audit « décision » reste celle
    // de l'arbitrage rendu.
    const audits = await t.run((ctx) =>
      ctx.db
        .query('auditLog')
        .withIndex('by_action', (q) =>
          q.eq('action', 'publication.peer_review'),
        )
        .collect(),
    );
    expect(audits.filter((a) => a.metadata?.kind === 'decide')).toHaveLength(1);
  });

  it('decideReview : rouvrir passe par assignReviewer, et se voit', async () => {
    const t = convexTest(schema, modules);
    const pubId = await t.run((ctx) =>
      ctx.db.insert(
        'publications',
        pubDoc({ slug: 'rouverte', reviewStage: 'reviewed' }),
      ),
    );
    const mod = await userWithRole(t, 'moderateur', 'mod@test.org', 'Mod');
    const editor = await userWithRole(t, 'editeur', 'ed@test.org');

    // La réouverture est NOMMÉE : elle désigne qui reprend la revue, notifie
    // cette personne et s'audite — là où un second clic sur « décider »
    // n'aurait rien dit.
    await editor.as.mutation(api.peerReview.assignReviewer, {
      publicationId: pubId,
      reviewerUserId: mod.id,
    });
    expect(await t.run((ctx) => ctx.db.get(pubId))).toMatchObject({
      reviewStage: 'in_review',
    });

    // et l'arbitrage redevient possible, une fois.
    await editor.as.mutation(api.peerReview.decideReview, {
      publicationId: pubId,
      decision: 'revision',
    });
    expect(await t.run((ctx) => ctx.db.get(pubId))).toMatchObject({
      reviewStage: 'revision',
    });
    expect(
      await mod.as.query(api.notifications.myNotifications, {}),
    ).toHaveLength(1);
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
