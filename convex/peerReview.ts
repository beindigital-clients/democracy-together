import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { mutation, query } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { requireNetworkRole } from './lib/rbac';
import { clampPageSize, paginatedValidator } from './lib/pagination';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { notify } from './lib/notify';

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

// Assigne un relecteur à une publication (éditeur+). Place la publication en
// revue ('in_review') et notifie le relecteur. N'altère pas `status`.
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
type Recommendation = Doc<'peerReviews'>['recommendation'];

const SEVERITY: Record<Recommendation, number> = {
  accept: 0,
  minor: 1,
  major: 2,
  reject: 3,
};

const reviewStageValidator = v.union(
  v.literal('in_review'),
  v.literal('revision'),
  v.literal('reviewed'),
);

const queueItemValidator = v.object({
  _id: v.id('publications'),
  title: v.string(),
  slug: v.string(),
  type: v.union(
    v.literal('rapport'),
    v.literal('policy-brief'),
    v.literal('working-paper'),
    v.literal('note'),
    v.literal('dataset'),
  ),
  theme: v.string(),
  status: v.union(
    v.literal('draft'),
    v.literal('pending'),
    v.literal('published'),
  ),
  reviewStage: reviewStageValidator,
  hasAuthor: v.boolean(),
  aggregate: v.union(recommendationValidator, v.null()),
  reviews: v.array(
    v.object({
      _id: v.id('peerReviews'),
      reviewerName: v.string(),
      recommendation: recommendationValidator,
      comment: v.string(),
      createdAt: v.number(),
    }),
  ),
});

// La file chargeait la table `publications` ENTIÈRE, puis écartait en mémoire
// tout ce qui n'était pas en revue — c'est-à-dire la quasi-totalité de la
// bibliothèque, pour afficher une poignée de lignes (issue #8).
//
// L'index `by_reviewStage` ne contient que ce qui compte. Une publication sans
// étape de revue y est rangée sous `undefined`, qui PRÉCÈDE toute valeur dans
// l'ordre Convex : la plage `> undefined` est donc exactement « les
// publications engagées dans une revue », en une lecture indexée contiguë, sans
// énumérer les étapes une à une (une nouvelle étape au schéma n'aurait pas à
// être ajoutée ici).
//
// ORDRE. Il vient maintenant de l'index — (étape, ancienneté) décroissant — et
// non d'un tri en mémoire : c'est ce qui rend la pagination possible. En
// pratique l'écran d'arbitrage y gagne, les étapes qui attendent une décision
// de l'éditeur ('revision', 'reviewed') passant avant celles qui attendent les
// relecteurs ('in_review').
export const getReviewQueue = query({
  args: {
    paginationOpts: paginationOptsValidator,
    stage: v.optional(reviewStageValidator),
  },
  returns: paginatedValidator(queueItemValidator),
  handler: async (ctx, { paginationOpts, stage }) => {
    await requireNetworkRole(ctx, 'editeur');
    const opts = clampPageSize(paginationOpts);
    const result = await ctx.db
      .query('publications')
      .withIndex('by_reviewStage', (q) =>
        stage ? q.eq('reviewStage', stage) : q.gt('reviewStage', undefined),
      )
      .order('desc')
      .paginate(opts);

    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (p) => {
          // Un aller-retour par ligne AFFICHÉE (les avis d'une publication ne
          // se lisent pas autrement) — borné par la taille de page, plus par
          // la taille de la bibliothèque.
          const reviews = await ctx.db
            .query('peerReviews')
            .withIndex('by_publication', (q) => q.eq('publicationId', p._id))
            .collect();
          // Recommandation agrégée = la plus sévère parmi les avis (ou null).
          let aggregate: Recommendation | null = null;
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
            // La plage d'index garantit que l'étape est définie ; le
            // validateur de retour l'exige, ce repli ne sert qu'au typage.
            reviewStage: p.reviewStage ?? 'in_review',
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
      ),
    };
  },
});

// Décision de l'éditeur (éditeur+) : renvoyer pour modifications ('revision')
// ou clore la revue ('reviewed'). Patch `reviewStage`, audite, et notifie
// l'auteur si la publication en a un.
export const decideReview = mutation({
  args: {
    publicationId: v.id('publications'),
    decision: v.union(v.literal('revision'), v.literal('reviewed')),
  },
  handler: async (ctx, { publicationId, decision }) => {
    const editor = await requireNetworkRole(ctx, 'editeur');
    const pub = await ctx.db.get(publicationId);
    if (!pub) throw new Error('NOT_FOUND');

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
// Le sélecteur d'assignation chargeait la table `users` ENTIÈRE pour n'en garder
// que le staff — quelques comptes sur un annuaire appelé à grandir (issue #8).
// L'index `by_role` va chercher directement les trois rôles concernés : on ne
// lit plus que des relecteurs possibles. Chaque rôle est borné, le staff d'un
// réseau se compte en dizaines, et un sélecteur n'est pas une liste paginée.
const STAFF_ROLES = ['moderateur', 'editeur', 'admin'] as const;
const STAFF_PER_ROLE_MAX = 200;

export const listStaffUsers = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('users'),
      name: v.union(v.string(), v.null()),
      email: v.union(v.string(), v.null()),
      role: v.union(...STAFF_ROLES.map((r) => v.literal(r))),
    }),
  ),
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'editeur');
    const byRole = await Promise.all(
      STAFF_ROLES.map((role) =>
        ctx.db
          .query('users')
          .withIndex('by_role', (q) => q.eq('role', role))
          .take(STAFF_PER_ROLE_MAX),
      ),
    );
    return STAFF_ROLES.flatMap((role, i) =>
      byRole[i].map((u) => ({
        _id: u._id,
        name: u.name ?? null,
        email: u.email ?? null,
        role,
      })),
    );
  },
});
