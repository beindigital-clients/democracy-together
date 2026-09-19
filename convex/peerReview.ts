import { v } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { requireNetworkRole } from './lib/rbac';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { notify } from './lib/notify';
import {
  assertTransition,
  reviewStateError,
  type ReviewMachine,
} from './lib/reviewState';

// Revue à comité de lecture (F-43) — RÉSERVÉE AU STAFF. Couche AU-DESSUS de la
// modération (convex/publications.ts). Les relecteurs (moderateur+) déposent un
// avis ; la décision (revision / reviewed) revient à l'éditeur+. Cette couche
// ne touche jamais `status` (draft/pending/published) : elle pilote uniquement
// `reviewStage` et la table `peerReviews`.

// Recommandations possibles d'un relecteur (vocabulaire académique neutre).
const recommendationValidator = v.union(
  v.literal('accept'),
  v.literal('minor'),
  v.literal('major'),
  v.literal('reject'),
);

function reviewerName(user: Doc<'users'>): string {
  return user.name?.trim() || user.email?.trim() || 'Relecteur';
}

// --- Machine à états de la revue par les pairs (audit M6 · issue #9) --------
//
// L'axe est `reviewStage`, indépendant de `status` (modération). `none` = le
// champ est absent : la publication n'est jamais entrée en revue.
//
//   none | revision | reviewed ──assignReviewer──► in_review
//   in_review ──assignReviewer──► in_review        (2e relecteur : la revue
//                                                   reste ouverte)
//   in_review ──decideReview('revision')──► revision
//   in_review ──decideReview('reviewed')──► reviewed
//
// `assignReviewer` est la SEULE porte d'ouverture — et donc de RÉOUVERTURE
// d'une revue close. Elle est explicite, notifiée et auditée : rouvrir une
// revue demande de désigner qui la reprend, pas un second clic sur un bouton
// de décision. C'est pourquoi elle n'a pas de garde ici, quand tout le reste
// passe par `assertTransition`.
//
// `decideReview` n'accepte donc qu'une revue OUVERTE : arbitrer une revue
// jamais assignée (`none`) n'a pas d'objet, et repasser de `reviewed` à
// `revision` inverserait un arbitrage rendu.
type PeerStage = NonNullable<Doc<'publications'>['reviewStage']> | 'none';

const PEER_REVIEW: ReviewMachine<PeerStage> = {
  transitions: {
    none: ['in_review'],
    in_review: ['in_review', 'revision', 'reviewed'],
    revision: ['in_review'],
    reviewed: ['in_review'],
  },
  decided: ['revision', 'reviewed'],
};

function peerStage(pub: Doc<'publications'>): PeerStage {
  return pub.reviewStage ?? 'none';
}

// Assigne un relecteur à une publication (éditeur+). Place la publication en
// revue ('in_review') et notifie le relecteur. N'altère pas `status`.
//
// C'est la transition d'OUVERTURE, et la seule de RÉOUVERTURE (issue #9) :
// désigner un relecteur sur une revue arbitrée la rouvre explicitement, sous
// une notification et une entrée d'audit nominatives.
export const assignReviewer = mutation({
  args: {
    publicationId: v.id('publications'),
    reviewerUserId: v.id('users'),
  },
  handler: async (ctx, { publicationId, reviewerUserId }) => {
    const editor = await requireNetworkRole(ctx, 'editeur');
    const pub = await ctx.db.get(publicationId);
    if (!pub) throw new Error('NOT_FOUND');
    const reviewer = await ctx.db.get(reviewerUserId);
    if (!reviewer) throw new Error('REVIEWER_NOT_FOUND');

    await ctx.db.patch(publicationId, { reviewStage: 'in_review' });

    await notify(ctx, {
      userId: reviewerUserId,
      type: 'peer_review_assigned',
      titleKey: 'peerReviewAssigned',
      params: { title: pub.title },
      link: '/admin/revue',
    });

    await recordAudit(ctx, {
      actorId: editor._id,
      action: AUDIT.PEER_REVIEW,
      targetId: publicationId,
      metadata: { kind: 'assign', reviewerUserId },
    });
    return { ok: true };
  },
});

// Dépôt d'un avis par un relecteur (moderateur+). Valide commentaire >= 10
// caractères. `reviewerName` = instantané du relecteur courant.
//
// Deux gardes (issue #9), parce qu'un avis est lui aussi une décision :
//  - la revue doit être OUVERTE. Déposer un avis sur une revue déjà arbitrée
//    glisserait une pièce dans un dossier clos, après la décision qu'elle
//    aurait dû éclairer ;
//  - UN avis par relecteur. Sans cela, le même relecteur pèse deux fois dans
//    la recommandation agrégée (`getReviewQueue` retient la plus sévère), et
//    l'écran d'arbitrage affiche deux avis d'une seule personne.
export const submitReview = mutation({
  args: {
    publicationId: v.id('publications'),
    recommendation: recommendationValidator,
    comment: v.string(),
  },
  handler: async (ctx, { publicationId, recommendation, comment }) => {
    const reviewer = await requireNetworkRole(ctx, 'moderateur');
    const pub = await ctx.db.get(publicationId);
    if (!pub) throw new Error('NOT_FOUND');

    const stage = peerStage(pub);
    if (stage !== 'in_review') throw reviewStateError(stage, PEER_REVIEW);

    const already = await ctx.db
      .query('peerReviews')
      .withIndex('by_publication_and_reviewer', (q) =>
        q.eq('publicationId', publicationId).eq('reviewerUserId', reviewer._id),
      )
      .first();
    if (already) throw new Error('ALREADY_REVIEWED');

    const text = comment.trim();
    if (text.length < 10) throw new Error('INVALID_COMMENT');

    await ctx.db.insert('peerReviews', {
      publicationId,
      reviewerUserId: reviewer._id,
      reviewerName: reviewerName(reviewer),
      recommendation,
      comment: text,
      createdAt: Date.now(),
    });

    await recordAudit(ctx, {
      actorId: reviewer._id,
      action: AUDIT.PEER_REVIEW,
      targetId: publicationId,
      metadata: { kind: 'review', recommendation },
    });
    return { ok: true };
  },
});

// File de revue (éditeur+) — publications avec `reviewStage` défini, chacune
// accompagnée de ses avis et d'une recommandation agrégée (la plus sévère
// l'emporte : reject > major > minor > accept). Sert l'écran d'arbitrage.
const SEVERITY: Record<string, number> = {
  accept: 0,
  minor: 1,
  major: 2,
  reject: 3,
};

export const getReviewQueue = query({
  args: {},
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'editeur');
    const all = await ctx.db.query('publications').collect();
    const inReview = all
      .filter((p) => p.reviewStage !== undefined)
      .sort(
        (a, b) =>
          (b.submittedAt ?? b.createdAt) - (a.submittedAt ?? a.createdAt),
      );

    return await Promise.all(
      inReview.map(async (p) => {
        const reviews = await ctx.db
          .query('peerReviews')
          .withIndex('by_publication', (q) => q.eq('publicationId', p._id))
          .collect();
        // Recommandation agrégée = la plus sévère parmi les avis (ou null).
        let aggregate: string | null = null;
        for (const r of reviews) {
          if (
            aggregate === null ||
            SEVERITY[r.recommendation] > SEVERITY[aggregate]
          ) {
            aggregate = r.recommendation;
          }
        }
        return {
          _id: p._id,
          title: p.title,
          slug: p.slug,
          type: p.type,
          theme: p.theme,
          status: p.status,
          reviewStage: p.reviewStage,
          hasAuthor: p.authorUserId !== undefined,
          aggregate,
          reviews: reviews
            .sort((a, b) => a.createdAt - b.createdAt)
            .map((r) => ({
              _id: r._id,
              reviewerName: r.reviewerName,
              recommendation: r.recommendation,
              comment: r.comment,
              createdAt: r.createdAt,
            })),
        };
      }),
    );
  },
});

// Décision de l'éditeur (éditeur+) : renvoyer pour modifications ('revision')
// ou clore la revue ('reviewed'). Patch `reviewStage`, audite, et notifie
// l'auteur si la publication en a un. N'accepte qu'une revue OUVERTE
// (cf. la machine ci-dessus) : rouvrir passe par `assignReviewer`.
export const decideReview = mutation({
  args: {
    publicationId: v.id('publications'),
    decision: v.union(v.literal('revision'), v.literal('reviewed')),
  },
  handler: async (ctx, { publicationId, decision }) => {
    const editor = await requireNetworkRole(ctx, 'editeur');
    const pub = await ctx.db.get(publicationId);
    if (!pub) throw new Error('NOT_FOUND');
    assertTransition(peerStage(pub), decision, PEER_REVIEW);

    await ctx.db.patch(publicationId, { reviewStage: decision });

    if (pub.authorUserId) {
      await notify(ctx, {
        userId: pub.authorUserId,
        type: 'peer_review_decided',
        titleKey: 'peerReviewDecided',
        params: { title: pub.title },
        link: '/espace-membre',
      });
    }

    await recordAudit(ctx, {
      actorId: editor._id,
      action: AUDIT.PEER_REVIEW,
      targetId: publicationId,
      metadata: { kind: 'decide', decision },
    });
    return { ok: true };
  },
});

// Liste des relecteurs potentiels (éditeur+) — utilisateurs moderateur et
// au-dessus, pour le sélecteur d'assignation.
export const listStaffUsers = query({
  args: {},
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'editeur');
    const users = await ctx.db.query('users').collect();
    const STAFF_ROLES = new Set(['moderateur', 'editeur', 'admin']);
    return users
      .filter((u) => u.role !== undefined && STAFF_ROLES.has(u.role))
      .map((u) => ({
        _id: u._id,
        name: u.name ?? null,
        email: u.email ?? null,
        role: u.role,
      }));
  },
});
