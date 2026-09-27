import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { mutation, query } from './_generated/server';
import type { Doc } from './_generated/dataModel';
import { requireNetworkRole, rank } from './lib/rbac';
import { clampPageSize, paginatedValidator } from './lib/pagination';
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

// Le lien de la notification d'assignation. C'était `/admin/revue` — la file
// complète, réservée à l'éditeur : un relecteur de rang modérateur qui suivait
// sa notification tombait sur un refus (campagne du 27/09, A-02). « Mes
// relectures » est ouverte au rang modérateur et ne rend que SES assignations.
const MY_REVIEWS_LINK = '/admin/mes-relectures';

// Assigne un relecteur à une publication (éditeur+). Place la publication en
// revue ('in_review'), retient l'assignation et notifie le relecteur. N'altère
// pas `status`.
//
// C'est la transition d'OUVERTURE, et la seule de RÉOUVERTURE (issue #9) :
// désigner un relecteur sur une revue arbitrée la rouvre explicitement, sous
// une notification et une entrée d'audit nominatives.
//
// Deux refus nommés (campagne du 27/09, R-08) — l'écran les traduit, là où un
// `throw` générique se lisait « vérifiez vos droits » :
//  - REVIEWER_NOT_STAFF : le compte désigné n'a pas le rang pour déposer un
//    avis (`submitReview` exige modérateur) — l'assigner créerait une revue
//    que personne ne peut faire avancer ;
//  - ALREADY_ASSIGNED : ce relecteur est déjà désigné sur cette revue OUVERTE.
//    Le renotifier ne l'aiderait pas, et un double clic n'est pas un second
//    relecteur. Sur une revue close, la même personne peut être redésignée :
//    c'est la réouverture, et elle s'audite.
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
    if (rank(reviewer.role) < rank('moderateur')) {
      throw new Error('REVIEWER_NOT_STAFF');
    }

    const existing = await ctx.db
      .query('peerReviewAssignments')
      .withIndex('by_publication_and_reviewer', (q) =>
        q
          .eq('publicationId', publicationId)
          .eq('reviewerUserId', reviewerUserId),
      )
      .unique();
    if (existing && peerStage(pub) === 'in_review') {
      throw new Error('ALREADY_ASSIGNED');
    }
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        assignedBy: editor._id,
        assignedAt: now,
      });
    } else {
      await ctx.db.insert('peerReviewAssignments', {
        publicationId,
        reviewerUserId,
        assignedBy: editor._id,
        assignedAt: now,
      });
    }

    await ctx.db.patch(publicationId, { reviewStage: 'in_review' });

    await notify(ctx, {
      userId: reviewerUserId,
      type: 'peer_review_assigned',
      titleKey: 'peerReviewAssigned',
      params: { title: pub.title },
      link: MY_REVIEWS_LINK,
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

// --- Porte d'entrée et vue du relecteur (campagne du 27/09, R-01 / A-02) ---
//
// Mesuré le 27/09 : la revue n'avait AUCUNE porte d'entrée. `getReviewQueue`
// ne liste que ce qui est DÉJÀ en revue, et le sélecteur d'assignation ne
// vivait que dans ces cartes — le circuit était fermé sur lui-même, seule une
// écriture hors interface amorçait une revue. Et le relecteur de rang
// modérateur, notifié, n'avait aucun écran qui lui rende ses assignations.
//
// Trois lectures répondent, chacune bornée :
//  - `listOpenable` (éditeur+) : ce qu'un éditeur PEUT envoyer en revue — les
//    dépôts en attente de modération, jamais entrés en revue ;
//  - `myAssignments` (modérateur+) : les assignations DU COMPTE CONNECTÉ, et
//    rien d'autre — l'identité vient de la session, jamais d'un argument ;
//  - `reviewStagesFor` (modérateur+) : l'étape de revue d'une poignée de
//    publications, pour que la file de modération montre où en est chaque
//    ligne sans une requête par ligne.

// Ce que la file de modération peut envoyer en revue. Les dépôts en attente se
// comptent en dizaines : `by_status` puis un filtre sur l'étape (le seul
// prédicat que cet index ne porte pas) restent une lecture bornée par
// `OPENABLE_MAX`, et non par la taille de la bibliothèque.
const OPENABLE_MAX = 100;

export const listOpenable = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('publications'),
      title: v.string(),
      type: queueItemValidator.fields.type,
      submittedAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'editeur');
    const pending = await ctx.db
      .query('publications')
      .withIndex('by_status', (q) => q.eq('status', 'pending'))
      .order('desc')
      .take(OPENABLE_MAX);
    return pending
      .filter((p) => p.reviewStage === undefined)
      .map((p) => ({
        _id: p._id,
        title: p.title,
        type: p.type,
        submittedAt: p.submittedAt ?? null,
      }));
  },
});

// Les assignations du compte connecté. Plafond large : un relecteur n'en porte
// pas cinquante, et une revue arbitrée reste listée (close) pour qu'il voie
// que son avis a servi — jusqu'à ce que la liste se renouvelle.
const MY_ASSIGNMENTS_MAX = 50;

export const myAssignments = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('publications'),
      title: v.string(),
      slug: v.string(),
      type: queueItemValidator.fields.type,
      theme: v.string(),
      status: queueItemValidator.fields.status,
      reviewStage: reviewStageValidator,
      assignedAt: v.number(),
      // L'avis DU relecteur, s'il l'a déjà déposé. Les avis des autres ne sont
      // pas rendus ici : la vue sert à relire, pas à arbitrer.
      myReview: v.union(
        v.null(),
        v.object({
          recommendation: recommendationValidator,
          comment: v.string(),
          createdAt: v.number(),
        }),
      ),
    }),
  ),
  handler: async (ctx) => {
    const me = await requireNetworkRole(ctx, 'moderateur');
    const assignments = await ctx.db
      .query('peerReviewAssignments')
      .withIndex('by_reviewer', (q) => q.eq('reviewerUserId', me._id))
      .order('desc')
      .take(MY_ASSIGNMENTS_MAX);

    const items = await Promise.all(
      assignments.map(async (a) => {
        const pub = await ctx.db.get(a.publicationId);
        // Publication supprimée, ou étape effacée : rien à relire.
        if (!pub || pub.reviewStage === undefined) return null;
        const mine = await ctx.db
          .query('peerReviews')
          .withIndex('by_publication_and_reviewer', (q) =>
            q.eq('publicationId', pub._id).eq('reviewerUserId', me._id),
          )
          .first();
        return {
          _id: pub._id,
          title: pub.title,
          slug: pub.slug,
          type: pub.type,
          theme: pub.theme,
          status: pub.status,
          reviewStage: pub.reviewStage,
          assignedAt: a.assignedAt,
          myReview: mine
            ? {
                recommendation: mine.recommendation,
                comment: mine.comment,
                createdAt: mine.createdAt,
              }
            : null,
        };
      }),
    );
    return items.filter((i) => i !== null);
  },
});

// Étape de revue d'un lot de publications — celles qu'une page de la file de
// modération affiche. Borné à la taille d'une page ; au-delà, l'écran a mal
// découpé, et le validateur le dit plutôt que de lire sans limite.
const STAGES_FOR_MAX = 100;

export const reviewStagesFor = query({
  args: { publicationIds: v.array(v.id('publications')) },
  returns: v.array(
    v.object({
      publicationId: v.id('publications'),
      reviewStage: v.union(reviewStageValidator, v.null()),
      reviewerCount: v.number(),
    }),
  ),
  handler: async (ctx, { publicationIds }) => {
    await requireNetworkRole(ctx, 'moderateur');
    if (publicationIds.length > STAGES_FOR_MAX) throw new Error('TOO_MANY_IDS');
    return await Promise.all(
      publicationIds.map(async (publicationId) => {
        const pub = await ctx.db.get(publicationId);
        const assignments = pub?.reviewStage
          ? await ctx.db
              .query('peerReviewAssignments')
              .withIndex('by_publication', (q) =>
                q.eq('publicationId', publicationId),
              )
              .take(STAFF_PER_ROLE_MAX)
          : [];
        return {
          publicationId,
          reviewStage: pub?.reviewStage ?? null,
          reviewerCount: assignments.length,
        };
      }),
    );
  },
});
