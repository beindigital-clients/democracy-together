import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { requireNetworkRole, rank } from './lib/rbac';
import { clampPageSize, paginatedValidator } from './lib/pagination';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { notify } from './lib/notify';
import { enforceRateLimit, RATE_LIMITS } from './lib/rateLimit';
import { trackPublicationStatus } from './lib/counters';
import {
  assertLength,
  blindStatus,
  DECIDED_STAGES,
  DECISION_EVENT,
  manuscriptDecision,
  manuscriptStage,
  MANUSCRIPT_BOUNDS,
  metadataDiff,
  nextStage,
  normalizeKeywords,
  REMINDER,
  resolveDueAt,
  stageAfterAssignment,
  type StageOrNone,
} from './lib/manuscripts';

// REVUE À COMITÉ DE LECTURE (F-43).
//
// Couche AU-DESSUS de la modération (convex/publications.ts) : elle pilote
// l'étape du manuscrit (`publications.reviewStage`), ses versions
// (`manuscriptVersions`), ses relecteurs (`peerReviewAssignments`), leurs avis
// (`peerReviews`) et les décisions motivées (`manuscriptDecisions`). Elle ne
// touche `status` (draft / pending / published) qu'au moment de la DÉCISION :
// un manuscrit accepté est publié dans la bibliothèque, un manuscrit rejeté
// sort de la file de modération.
//
// LA MACHINE À ÉTATS vit dans convex/lib/manuscripts.ts — une seule table de
// transitions, testée paire par paire. Aucune mutation de ce module n'écrit
// `reviewStage` sans passer par `nextStage` (ou `stageAfterAssignment`, qui
// la compose).
//
// DOUBLE AVEUGLE. Trois règles, tenues ICI et non dans l'interface :
//  1. aucune réponse destinée à un relecteur ne porte l'identité de l'auteur
//     — ni `authors`, ni l'adresse, ni le nom du fichier d'origine (souvent
//     « Dupont_article.pdf »), ni le fichier lui-même : le relecteur reçoit la
//     COPIE ANONYMISÉE (métadonnées retirées, convex/peerReviewFiles.ts) ;
//  2. aucune réponse destinée à l'auteur ne porte l'identité d'un relecteur :
//     les avis lui sont rendus numérotés, sans nom ni identifiant ;
//  3. l'éditeur voit tout.
// `convex/peerReview.test.ts` appelle chaque requête accessible à un relecteur
// et vérifie que ni le nom ni l'adresse de l'auteur n'apparaissent dans la
// réponse sérialisée.

const recommendationValidator = v.union(
  v.literal('accept'),
  v.literal('minor'),
  v.literal('major'),
  v.literal('reject'),
);
type Recommendation = Doc<'peerReviews'>['recommendation'];

const SEVERITY: Record<Recommendation, number> = {
  accept: 0,
  minor: 1,
  major: 2,
  reject: 3,
};

const pubTypeValidator = v.union(
  v.literal('rapport'),
  v.literal('policy-brief'),
  v.literal('working-paper'),
  v.literal('note'),
  v.literal('dataset'),
);
const pubStatusValidator = v.union(
  v.literal('draft'),
  v.literal('pending'),
  v.literal('published'),
);

// Le lien de la notification d'assignation : « Mes relectures », ouverte au
// rang modérateur et qui ne rend que SES assignations (campagne du 27/09,
// A-02) — la file complète est réservée à l'éditeur.
const MY_REVIEWS_LINK = '/admin/mes-relectures';
const EDITOR_QUEUE_LINK = '/admin/revue';
const AUTHOR_LINK = '/espace-membre/manuscrits';

const ASSIGNMENTS_MAX = 50;
const VERSIONS_MAX = 50;
const REVIEWS_MAX = 200;

function reviewerName(user: Doc<'users'>): string {
  return user.name?.trim() || user.email?.trim() || 'Relecteur';
}

function stageOf(pub: Doc<'publications'>): StageOrNone {
  return pub.reviewStage ?? 'none';
}

// Les avis et assignations antérieurs aux versions portent sur la version 1.
const versionOfReview = (r: Doc<'peerReviews'>) => r.version ?? 1;
const versionOfAssignment = (a: Doc<'peerReviewAssignments'>) => a.version ?? 1;

async function versionsOf(
  ctx: QueryCtx,
  publicationId: Id<'publications'>,
): Promise<Doc<'manuscriptVersions'>[]> {
  return await ctx.db
    .query('manuscriptVersions')
    .withIndex('by_publication_and_version', (q) =>
      q.eq('publicationId', publicationId),
    )
    .take(VERSIONS_MAX);
}

async function latestVersion(
  ctx: QueryCtx,
  publicationId: Id<'publications'>,
): Promise<Doc<'manuscriptVersions'> | null> {
  return await ctx.db
    .query('manuscriptVersions')
    .withIndex('by_publication_and_version', (q) =>
      q.eq('publicationId', publicationId),
    )
    .order('desc')
    .first();
}

async function assignmentsOf(
  ctx: QueryCtx,
  publicationId: Id<'publications'>,
): Promise<Doc<'peerReviewAssignments'>[]> {
  return await ctx.db
    .query('peerReviewAssignments')
    .withIndex('by_publication', (q) => q.eq('publicationId', publicationId))
    .take(ASSIGNMENTS_MAX);
}

async function reviewsOf(
  ctx: QueryCtx,
  publicationId: Id<'publications'>,
): Promise<Doc<'peerReviews'>[]> {
  return await ctx.db
    .query('peerReviews')
    .withIndex('by_publication', (q) => q.eq('publicationId', publicationId))
    .take(REVIEWS_MAX);
}

async function assignmentFor(
  ctx: QueryCtx,
  publicationId: Id<'publications'>,
  reviewerUserId: Id<'users'>,
): Promise<Doc<'peerReviewAssignments'> | null> {
  return await ctx.db
    .query('peerReviewAssignments')
    .withIndex('by_publication_and_reviewer', (q) =>
      q.eq('publicationId', publicationId).eq('reviewerUserId', reviewerUserId),
    )
    .unique();
}

// Planifie la copie anonymisée du fichier d'une version.
async function scheduleBlindCopy(
  ctx: MutationCtx,
  versionId: Id<'manuscriptVersions'>,
) {
  await ctx.scheduler.runAfter(0, internal.peerReviewFiles.anonymizeVersion, {
    versionId,
  });
}

/**
 * Version 1 d'un manuscrit, créée à partir de la publication si elle n'existe
 * pas encore (ouverture depuis la file de modération, ou revue ouverte avant
 * l'existence des versions). Renvoie la DERNIÈRE version.
 */
async function ensureVersion(
  ctx: MutationCtx,
  pub: Doc<'publications'>,
  fallbackSubmitter: Id<'users'>,
): Promise<Doc<'manuscriptVersions'>> {
  const latest = await latestVersion(ctx, pub._id);
  if (latest) return latest;
  const id = await ctx.db.insert('manuscriptVersions', {
    publicationId: pub._id,
    version: 1,
    title: pub.title,
    abstract: pub.abstract,
    keywords: normalizeKeywords(pub.keypoints),
    ...(pub.fileId ? { fileId: pub.fileId } : {}),
    ...(pub.fileName ? { fileName: pub.fileName } : {}),
    blindStatus: pub.fileId ? 'pending' : 'none',
    submittedBy: pub.authorUserId ?? fallbackSubmitter,
    createdAt: Date.now(),
  });
  if (pub.fileId) await scheduleBlindCopy(ctx, id);
  return (await ctx.db.get(id)) as Doc<'manuscriptVersions'>;
}

// Le relecteur ne reçoit le fichier que si sa copie est anonymisée — ou que
// l'éditeur a vérifié et libéré l'original d'un PDF illisible.
function blindFileFor(
  version: Doc<'manuscriptVersions'>,
): Id<'_storage'> | null {
  if (version.blindStatus === 'released') return version.fileId ?? null;
  if (version.blindStatus === 'clean' || version.blindStatus === 'stripped') {
    return version.blindFileId ?? null;
  }
  return null;
}

// État de la déclaration de conflit d'intérêts d'une assignation.
type ConflictState = 'undeclared' | 'clear' | 'conflict';
const conflictStateValidator = v.union(
  v.literal('undeclared'),
  v.literal('clear'),
  v.literal('conflict'),
);
function conflictState(a: Doc<'peerReviewAssignments'>): ConflictState {
  if (!a.conflict) return 'undeclared';
  return a.conflict.hasConflict ? 'conflict' : 'clear';
}

async function notifyEditors(
  ctx: MutationCtx,
  entry: { titleKey: string; type: string; title: string },
) {
  // Le comité éditorial : éditeurs et administrateurs. Borné — un réseau en
  // compte quelques-uns ; au-delà, la file de l'éditeur reste la référence.
  for (const role of ['editeur', 'admin'] as const) {
    const staff = await ctx.db
      .query('users')
      .withIndex('by_role', (q) => q.eq('role', role))
      .take(25);
    for (const u of staff) {
      await notify(ctx, {
        userId: u._id,
        type: entry.type,
        titleKey: entry.titleKey,
        params: { title: entry.title },
        link: EDITOR_QUEUE_LINK,
      });
    }
  }
}

// === Éditeur ===================================================================

/**
 * Désigne un relecteur (éditeur+), avec une échéance.
 *
 * Sur une publication jamais entrée en revue, c'est l'OUVERTURE (soumission
 * puis évaluation — la porte historique depuis la file de modération) ; sur
 * un manuscrit soumis ou re-soumis, c'est le début d'un tour d'évaluation de
 * la DERNIÈRE version ; sur une revue en évaluation, un relecteur de plus.
 * Ailleurs (révision attendue de l'auteur, décision rendue), refus : la
 * machine à états le dit.
 *
 * Refus nommés : REVIEWER_NOT_STAFF (le compte ne pourrait pas déposer
 * d'avis), REVIEWER_IS_AUTHOR (double aveugle), ALREADY_ASSIGNED (déjà
 * désigné pour cette version), CONFLICT_DECLARED (il s'est récusé),
 * INVALID_DUE_DATE.
 */
export const assignReviewer = mutation({
  args: {
    publicationId: v.id('publications'),
    reviewerUserId: v.id('users'),
    dueAt: v.optional(v.number()),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { publicationId, reviewerUserId, dueAt }) => {
    const editor = await requireNetworkRole(ctx, 'editeur');
    const pub = await ctx.db.get(publicationId);
    if (!pub) throw new Error('NOT_FOUND');
    const reviewer = await ctx.db.get(reviewerUserId);
    if (!reviewer) throw new Error('REVIEWER_NOT_FOUND');
    if (rank(reviewer.role) < rank('moderateur')) {
      throw new Error('REVIEWER_NOT_STAFF');
    }
    if (pub.authorUserId === reviewerUserId) {
      throw new Error('REVIEWER_IS_AUTHOR');
    }
    const from = stageOf(pub);
    const to = stageAfterAssignment(from);
    const now = Date.now();
    const due = resolveDueAt(now, dueAt);

    const version = await ensureVersion(ctx, pub, editor._id);
    const existing = await assignmentFor(ctx, publicationId, reviewerUserId);
    if (existing) {
      if (existing.conflict?.hasConflict) throw new Error('CONFLICT_DECLARED');
      if (
        from === 'in_review' &&
        versionOfAssignment(existing) === version.version
      ) {
        throw new Error('ALREADY_ASSIGNED');
      }
      // Nouveau tour pour le même relecteur : la déclaration d'absence de
      // conflit vaut toujours, les relances repartent de zéro.
      await ctx.db.patch(existing._id, {
        assignedBy: editor._id,
        assignedAt: now,
        version: version.version,
        dueAt: due,
        remindersSent: 0,
        lastReminderAt: undefined,
        overdueNotifiedAt: undefined,
      });
    } else {
      await ctx.db.insert('peerReviewAssignments', {
        publicationId,
        reviewerUserId,
        assignedBy: editor._id,
        assignedAt: now,
        version: version.version,
        dueAt: due,
        remindersSent: 0,
      });
    }

    await ctx.db.patch(publicationId, { reviewStage: to });

    await notify(ctx, {
      userId: reviewerUserId,
      type: 'peer_review_assigned',
      titleKey: 'peerReviewAssigned',
      params: { title: version.title },
      link: MY_REVIEWS_LINK,
    });
    await recordAudit(ctx, {
      actorId: editor._id,
      action: AUDIT.PEER_REVIEW,
      targetId: publicationId,
      metadata: {
        kind: 'assign',
        reviewerUserId,
        from,
        to,
        version: version.version,
        dueAt: due,
      },
    });
    return { ok: true };
  },
});

/**
 * Décision éditoriale MOTIVÉE (éditeur+) : révision demandée, acceptation ou
 * rejet. Le motif (20 caractères au moins) est notifié à l'auteur et reste
 * dans l'historique du manuscrit.
 *
 * Demander une révision ou accepter à l'issue d'une évaluation exige au moins
 * un avis sur la version évaluée (NO_REVIEWS) — trancher sans avis n'est pas
 * une revue par les pairs. Le rejet sans évaluation reste possible depuis
 * `submitted` (refus éditorial d'un texte hors champ).
 *
 * À l'ACCEPTATION, la publication entre dans la bibliothèque : statut
 * `published`, date et DOI interne attribués comme par la modération, et
 * titre / résumé / mots-clés / fichier de la version acceptée. Au REJET, le
 * dépôt sort de la file de modération (brouillon refusé, motif en note).
 */
export const decideManuscript = mutation({
  args: {
    publicationId: v.id('publications'),
    decision: manuscriptDecision,
    reason: v.string(),
  },
  returns: v.object({ ok: v.boolean(), published: v.boolean() }),
  handler: async (ctx, { publicationId, decision, reason }) => {
    const editor = await requireNetworkRole(ctx, 'editeur');
    const pub = await ctx.db.get(publicationId);
    if (!pub) throw new Error('NOT_FOUND');
    const from = stageOf(pub);
    const to = nextStage(from, DECISION_EVENT[decision]);
    const motive = assertLength(
      reason,
      MANUSCRIPT_BOUNDS.reason,
      'INVALID_REASON',
    );
    const version = await ensureVersion(ctx, pub, editor._id);

    if (from === 'in_review' && decision !== 'rejected') {
      const reviews = await reviewsOf(ctx, publicationId);
      if (!reviews.some((r) => versionOfReview(r) === version.version)) {
        throw new Error('NO_REVIEWS');
      }
    }

    const now = Date.now();
    await ctx.db.insert('manuscriptDecisions', {
      publicationId,
      version: version.version,
      decision,
      reason: motive,
      decidedBy: editor._id,
      createdAt: now,
    });

    // Le tour est clos : plus aucune relecture n'est attendue, donc plus de
    // relance.
    for (const a of await assignmentsOf(ctx, publicationId)) {
      if (a.dueAt !== undefined)
        await ctx.db.patch(a._id, { dueAt: undefined });
    }

    let published = false;
    if (decision === 'accepted' && pub.status !== 'published') {
      await ctx.db.patch(publicationId, {
        reviewStage: to,
        status: 'published',
        publishedAt: pub.publishedAt || now,
        doi: pub.doi || `10.59000/dt.${pub.slug}`,
        reviewedBy: editor._id,
        reviewedAt: now,
        title: version.title,
        abstract: version.abstract,
        keypoints: version.keywords,
        ...(version.fileId
          ? { fileId: version.fileId, fileName: version.fileName }
          : {}),
      });
      await trackPublicationStatus(ctx, pub.status, 'published');
      published = true;
    } else if (decision === 'rejected' && pub.status === 'pending') {
      await ctx.db.patch(publicationId, {
        reviewStage: to,
        status: 'draft',
        reviewedBy: editor._id,
        reviewedAt: now,
        reviewNotes: motive,
      });
      await trackPublicationStatus(ctx, 'pending', 'draft');
    } else {
      await ctx.db.patch(publicationId, { reviewStage: to });
    }

    if (pub.authorUserId) {
      await notify(ctx, {
        userId: pub.authorUserId,
        type: 'peer_review_decided',
        titleKey:
          decision === 'revision'
            ? 'peerReviewRevisionRequested'
            : decision === 'accepted'
              ? 'peerReviewAccepted'
              : 'peerReviewRejected',
        params: { title: version.title },
        link: AUTHOR_LINK,
      });
    }
    await recordAudit(ctx, {
      actorId: editor._id,
      action: AUDIT.MANUSCRIPT_DECIDED,
      targetId: publicationId,
      metadata: { from, to, decision, version: version.version, published },
    });
    return { ok: true, published };
  },
});

/**
 * Libère le fichier ORIGINAL d'une version que l'anonymisation n'a pas pu
 * relire (PDF chiffré, corrompu). L'éditeur atteste l'avoir vérifié : c'est
 * lui qui engage le double aveugle, et l'audit le retient.
 */
export const releaseVersionFile = mutation({
  args: { publicationId: v.id('publications'), version: v.number() },
  returns: v.null(),
  handler: async (ctx, { publicationId, version }) => {
    const editor = await requireNetworkRole(ctx, 'editeur');
    const row = await ctx.db
      .query('manuscriptVersions')
      .withIndex('by_publication_and_version', (q) =>
        q.eq('publicationId', publicationId).eq('version', version),
      )
      .unique();
    if (!row) throw new Error('NOT_FOUND');
    if (row.blindStatus !== 'unreadable') throw new Error('INVALID_TRANSITION');
    await ctx.db.patch(row._id, { blindStatus: 'released' });
    await recordAudit(ctx, {
      actorId: editor._id,
      action: AUDIT.MANUSCRIPT_FILE_RELEASED,
      targetId: publicationId,
      metadata: { version },
    });
    return null;
  },
});

// --- File de l'éditeur ---------------------------------------------------------

const assignmentView = v.object({
  reviewerUserId: v.id('users'),
  reviewerName: v.string(),
  version: v.number(),
  assignedAt: v.number(),
  dueAt: v.union(v.number(), v.null()),
  remindersSent: v.number(),
  conflict: conflictStateValidator,
  conflictDetails: v.union(v.string(), v.null()),
  reviewed: v.boolean(),
});

const editorReviewView = v.object({
  _id: v.id('peerReviews'),
  reviewerName: v.string(),
  version: v.number(),
  recommendation: recommendationValidator,
  comment: v.string(),
  commentToEditor: v.union(v.string(), v.null()),
  createdAt: v.number(),
});

const queueItemValidator = v.object({
  _id: v.id('publications'),
  title: v.string(),
  slug: v.string(),
  type: pubTypeValidator,
  theme: v.string(),
  status: pubStatusValidator,
  reviewStage: manuscriptStage,
  // L'éditeur voit l'auteur (règle 3 du double aveugle).
  hasAuthor: v.boolean(),
  authorName: v.union(v.string(), v.null()),
  authorEmail: v.union(v.string(), v.null()),
  version: v.number(),
  blindStatus: v.union(blindStatus, v.null()),
  aggregate: v.union(recommendationValidator, v.null()),
  assignments: v.array(assignmentView),
  // Avis de la version COURANTE (les précédents sont dans le détail).
  reviews: v.array(editorReviewView),
});

async function assignmentViews(
  ctx: QueryCtx,
  assignments: Doc<'peerReviewAssignments'>[],
  reviews: Doc<'peerReviews'>[],
) {
  return await Promise.all(
    assignments.map(async (a) => {
      const user = await ctx.db.get(a.reviewerUserId);
      const version = versionOfAssignment(a);
      return {
        reviewerUserId: a.reviewerUserId,
        reviewerName: user ? reviewerName(user) : 'Relecteur',
        version,
        assignedAt: a.assignedAt,
        dueAt: a.dueAt ?? null,
        remindersSent: a.remindersSent ?? 0,
        conflict: conflictState(a),
        conflictDetails: a.conflict?.details ?? null,
        reviewed: reviews.some(
          (r) =>
            r.reviewerUserId === a.reviewerUserId &&
            versionOfReview(r) === version,
        ),
      };
    }),
  );
}

function editorReview(r: Doc<'peerReviews'>) {
  return {
    _id: r._id,
    reviewerName: r.reviewerName,
    version: versionOfReview(r),
    recommendation: r.recommendation,
    comment: r.comment,
    commentToEditor: r.commentToEditor ?? null,
    createdAt: r.createdAt,
  };
}

// File de revue (éditeur+), paginée par l'index `by_reviewStage` : la plage
// `> undefined` est exactement « les publications engagées dans une revue »
// (issue #8). Les étapes qui attendent une décision de l'éditeur passent
// avant celles qui attendent les relecteurs, par l'ordre de l'index.
export const getReviewQueue = query({
  args: {
    paginationOpts: paginationOptsValidator,
    stage: v.optional(manuscriptStage),
  },
  returns: paginatedValidator(queueItemValidator),
  handler: async (ctx, { paginationOpts, stage }) => {
    await requireNetworkRole(ctx, 'editeur');
    const result = await ctx.db
      .query('publications')
      .withIndex('by_reviewStage', (q) =>
        stage ? q.eq('reviewStage', stage) : q.gt('reviewStage', undefined),
      )
      .order('desc')
      .paginate(clampPageSize(paginationOpts));

    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (p) => {
          const latest = await latestVersion(ctx, p._id);
          const current = latest?.version ?? 1;
          const allReviews = await reviewsOf(ctx, p._id);
          const reviews = allReviews
            .filter((r) => versionOfReview(r) === current)
            .sort((a, b) => a.createdAt - b.createdAt);
          let aggregate: Recommendation | null = null;
          for (const r of reviews) {
            if (
              aggregate === null ||
              SEVERITY[r.recommendation] > SEVERITY[aggregate]
            ) {
              aggregate = r.recommendation;
            }
          }
          const author = p.authorUserId
            ? await ctx.db.get(p.authorUserId)
            : null;
          return {
            _id: p._id,
            title: latest?.title ?? p.title,
            slug: p.slug,
            type: p.type,
            theme: p.theme,
            status: p.status,
            reviewStage: p.reviewStage ?? 'in_review',
            hasAuthor: p.authorUserId !== undefined,
            authorName:
              author?.name ?? (p.authors.map((a) => a.name).join(', ') || null),
            authorEmail: author?.email ?? null,
            version: current,
            blindStatus: latest?.blindStatus ?? null,
            aggregate,
            assignments: await assignmentViews(
              ctx,
              await assignmentsOf(ctx, p._id),
              allReviews,
            ),
            reviews: reviews.map(editorReview),
          };
        }),
      ),
    };
  },
});

const versionEditorView = v.object({
  version: v.number(),
  title: v.string(),
  abstract: v.string(),
  keywords: v.array(v.string()),
  fileName: v.union(v.string(), v.null()),
  fileUrl: v.union(v.string(), v.null()),
  blindFileUrl: v.union(v.string(), v.null()),
  blindStatus,
  strippedFields: v.array(v.string()),
  responseLetter: v.union(v.string(), v.null()),
  createdAt: v.number(),
});

const decisionView = v.object({
  version: v.number(),
  decision: manuscriptDecision,
  reason: v.string(),
  createdAt: v.number(),
});

/** Dossier complet d'un manuscrit (éditeur+) : versions, avis, décisions. */
export const getManuscriptForEditor = query({
  args: { publicationId: v.id('publications') },
  returns: v.union(
    v.null(),
    v.object({
      publicationId: v.id('publications'),
      reviewStage: v.union(manuscriptStage, v.null()),
      authorName: v.union(v.string(), v.null()),
      authorEmail: v.union(v.string(), v.null()),
      versions: v.array(versionEditorView),
      reviews: v.array(editorReviewView),
      decisions: v.array(decisionView),
      assignments: v.array(assignmentView),
    }),
  ),
  handler: async (ctx, { publicationId }) => {
    await requireNetworkRole(ctx, 'editeur');
    const pub = await ctx.db.get(publicationId);
    if (!pub) return null;
    const versions = await versionsOf(ctx, publicationId);
    const reviews = await reviewsOf(ctx, publicationId);
    const decisions = await ctx.db
      .query('manuscriptDecisions')
      .withIndex('by_publication', (q) => q.eq('publicationId', publicationId))
      .take(VERSIONS_MAX * 2);
    const author = pub.authorUserId ? await ctx.db.get(pub.authorUserId) : null;
    return {
      publicationId,
      reviewStage: pub.reviewStage ?? null,
      authorName:
        author?.name ?? (pub.authors.map((a) => a.name).join(', ') || null),
      authorEmail: author?.email ?? null,
      versions: await Promise.all(
        versions.map(async (ver) => ({
          version: ver.version,
          title: ver.title,
          abstract: ver.abstract,
          keywords: ver.keywords,
          fileName: ver.fileName ?? null,
          fileUrl: ver.fileId ? await ctx.storage.getUrl(ver.fileId) : null,
          blindFileUrl: ver.blindFileId
            ? await ctx.storage.getUrl(ver.blindFileId)
            : null,
          blindStatus: ver.blindStatus,
          strippedFields: ver.strippedFields ?? [],
          responseLetter: ver.responseLetter ?? null,
          createdAt: ver.createdAt,
        })),
      ),
      reviews: reviews
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(editorReview),
      decisions: decisions
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((d) => ({
          version: d.version,
          decision: d.decision,
          reason: d.reason,
          createdAt: d.createdAt,
        })),
      assignments: await assignmentViews(
        ctx,
        await assignmentsOf(ctx, publicationId),
        reviews,
      ),
    };
  },
});

// Liste des relecteurs potentiels (éditeur+) — le staff, par l'index
// `by_role` (issue #8) : on ne lit que des relecteurs possibles.
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

// Ce que la file de modération peut envoyer en revue : les dépôts en attente,
// jamais entrés en revue (campagne du 27/09, R-01).
const OPENABLE_MAX = 100;

export const listOpenable = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('publications'),
      title: v.string(),
      type: pubTypeValidator,
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

// Étape de revue d'un lot de publications (file de modération, modérateur+).
// Ne rend QUE l'étape et un compte : rien qui nomme l'auteur ou un relecteur.
const STAGES_FOR_MAX = 100;

export const reviewStagesFor = query({
  args: { publicationIds: v.array(v.id('publications')) },
  returns: v.array(
    v.object({
      publicationId: v.id('publications'),
      reviewStage: v.union(manuscriptStage, v.null()),
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
          ? await assignmentsOf(ctx, publicationId)
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

// === Relecteur ================================================================

const myReviewView = v.object({
  version: v.number(),
  recommendation: recommendationValidator,
  comment: v.string(),
  createdAt: v.number(),
});

/**
 * Les assignations du compte connecté (modérateur+), et rien d'autre —
 * l'identité vient de la session. Aucune donnée d'auteur : ni `authors`, ni
 * adresse, ni nom de fichier d'origine.
 */
export const myAssignments = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('publications'),
      title: v.string(),
      type: pubTypeValidator,
      theme: v.string(),
      reviewStage: manuscriptStage,
      version: v.number(),
      assignedAt: v.number(),
      dueAt: v.union(v.number(), v.null()),
      conflict: conflictStateValidator,
      // Un avis est-il attendu de moi, maintenant ?
      open: v.boolean(),
      myReview: v.union(myReviewView, v.null()),
    }),
  ),
  handler: async (ctx) => {
    const me = await requireNetworkRole(ctx, 'moderateur');
    const assignments = await ctx.db
      .query('peerReviewAssignments')
      .withIndex('by_reviewer', (q) => q.eq('reviewerUserId', me._id))
      .order('desc')
      .take(ASSIGNMENTS_MAX);

    const items = await Promise.all(
      assignments.map(async (a) => {
        const pub = await ctx.db.get(a.publicationId);
        if (!pub || pub.reviewStage === undefined) return null;
        const version = versionOfAssignment(a);
        const ver = await ctx.db
          .query('manuscriptVersions')
          .withIndex('by_publication_and_version', (q) =>
            q.eq('publicationId', pub._id).eq('version', version),
          )
          .unique();
        const latest = await latestVersion(ctx, pub._id);
        const mine = (
          await ctx.db
            .query('peerReviews')
            .withIndex('by_publication_and_reviewer', (q) =>
              q.eq('publicationId', pub._id).eq('reviewerUserId', me._id),
            )
            .take(VERSIONS_MAX)
        ).find((r) => versionOfReview(r) === version);
        const conflict = conflictState(a);
        return {
          _id: pub._id,
          title: ver?.title ?? pub.title,
          type: pub.type,
          theme: pub.theme,
          reviewStage: pub.reviewStage,
          version,
          assignedAt: a.assignedAt,
          dueAt: a.dueAt ?? null,
          conflict,
          open:
            pub.reviewStage === 'in_review' &&
            version === (latest?.version ?? 1) &&
            conflict !== 'conflict' &&
            !mine,
          myReview: mine
            ? {
                version,
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

/**
 * Le manuscrit tel que le voit SON relecteur : la version qu'il évalue, le
 * différentiel de métadonnées avec la précédente, la lettre de réponse de
 * l'auteur, et le fichier ANONYMISÉ — seulement une fois le conflit
 * d'intérêts déclaré absent. Aucun champ d'identité de l'auteur.
 */
export const getAssignment = query({
  args: { publicationId: v.id('publications') },
  returns: v.union(
    v.null(),
    v.object({
      publicationId: v.id('publications'),
      type: pubTypeValidator,
      theme: v.string(),
      reviewStage: manuscriptStage,
      version: v.number(),
      title: v.string(),
      abstract: v.string(),
      keywords: v.array(v.string()),
      responseLetter: v.union(v.string(), v.null()),
      diff: v.union(
        v.null(),
        v.object({
          fromVersion: v.number(),
          title: v.union(
            v.null(),
            v.object({ from: v.string(), to: v.string() }),
          ),
          abstract: v.union(
            v.null(),
            v.object({ from: v.string(), to: v.string() }),
          ),
          keywordsAdded: v.array(v.string()),
          keywordsRemoved: v.array(v.string()),
          fileReplaced: v.boolean(),
        }),
      ),
      dueAt: v.union(v.number(), v.null()),
      conflict: conflictStateValidator,
      file: v.object({
        // Nom NEUTRE (« manuscrit-v2.pdf ») : le nom d'origine nomme souvent
        // l'auteur.
        name: v.union(v.string(), v.null()),
        url: v.union(v.string(), v.null()),
        blindStatus: v.union(blindStatus, v.null()),
      }),
      open: v.boolean(),
      myReviews: v.array(myReviewView),
    }),
  ),
  handler: async (ctx, { publicationId }) => {
    const me = await requireNetworkRole(ctx, 'moderateur');
    const pub = await ctx.db.get(publicationId);
    if (!pub || pub.reviewStage === undefined) return null;
    const assignment = await assignmentFor(ctx, publicationId, me._id);
    if (!assignment) return null;
    const version = versionOfAssignment(assignment);
    const versions = await versionsOf(ctx, publicationId);
    const ver = versions.find((x) => x.version === version) ?? null;
    const prev = versions.find((x) => x.version === version - 1) ?? null;
    const latest = versions[versions.length - 1] ?? null;
    const mine = (
      await ctx.db
        .query('peerReviews')
        .withIndex('by_publication_and_reviewer', (q) =>
          q.eq('publicationId', publicationId).eq('reviewerUserId', me._id),
        )
        .take(VERSIONS_MAX)
    ).map((r) => ({
      version: versionOfReview(r),
      recommendation: r.recommendation,
      comment: r.comment,
      createdAt: r.createdAt,
    }));
    const conflict = conflictState(assignment);
    const blindId = ver && conflict === 'clear' ? blindFileFor(ver) : null;
    const title = ver?.title ?? pub.title;
    return {
      publicationId,
      type: pub.type,
      theme: pub.theme,
      reviewStage: pub.reviewStage,
      version,
      title,
      abstract: ver?.abstract ?? pub.abstract,
      keywords: ver?.keywords ?? normalizeKeywords(pub.keypoints),
      responseLetter: ver?.responseLetter ?? null,
      diff:
        ver && prev
          ? {
              fromVersion: prev.version,
              ...metadataDiff(
                {
                  title: prev.title,
                  abstract: prev.abstract,
                  keywords: prev.keywords,
                  hasFile: prev.fileId !== undefined,
                },
                {
                  title: ver.title,
                  abstract: ver.abstract,
                  keywords: ver.keywords,
                  hasFile: ver.fileId !== undefined,
                },
              ),
            }
          : null,
      dueAt: assignment.dueAt ?? null,
      conflict,
      file: {
        name: ver?.fileId ? `manuscrit-v${version}.pdf` : null,
        url: blindId ? await ctx.storage.getUrl(blindId) : null,
        blindStatus: ver?.blindStatus ?? null,
      },
      open:
        pub.reviewStage === 'in_review' &&
        version === (latest?.version ?? 1) &&
        conflict === 'clear' &&
        !mine.some((r) => r.version === version),
      myReviews: mine,
    };
  },
});

/**
 * Déclaration de conflit d'intérêts (relecteur assigné), PRÉALABLE à l'accès
 * au fichier et au dépôt d'un avis. Une déclaration de conflit récuse le
 * relecteur : son échéance tombe, et l'éditeur qui l'a désigné est prévenu
 * pour en désigner un autre. Elle ne se modifie pas (CONFLICT_ALREADY_DECLARED).
 */
export const declareConflict = mutation({
  args: {
    publicationId: v.id('publications'),
    hasConflict: v.boolean(),
    details: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { publicationId, hasConflict, details }) => {
    const me = await requireNetworkRole(ctx, 'moderateur');
    const pub = await ctx.db.get(publicationId);
    if (!pub) throw new Error('NOT_FOUND');
    if (stageOf(pub) !== 'in_review') {
      throw new Error(
        DECIDED_STAGES.includes(stageOf(pub))
          ? 'ALREADY_REVIEWED'
          : 'INVALID_TRANSITION',
      );
    }
    const assignment = await assignmentFor(ctx, publicationId, me._id);
    if (!assignment) throw new Error('NOT_ASSIGNED');
    if (assignment.conflict) throw new Error('CONFLICT_ALREADY_DECLARED');
    const text = details?.trim() || undefined;
    if (text && text.length > MANUSCRIPT_BOUNDS.conflictDetails.max) {
      throw new Error('INVALID_DETAILS');
    }
    await ctx.db.patch(assignment._id, {
      conflict: { hasConflict, details: text, declaredAt: Date.now() },
      ...(hasConflict ? { dueAt: undefined } : {}),
    });
    if (hasConflict) {
      const ver = await latestVersion(ctx, publicationId);
      await notify(ctx, {
        userId: assignment.assignedBy,
        type: 'peer_review_conflict',
        titleKey: 'peerReviewConflict',
        params: { title: ver?.title ?? pub.title },
        link: EDITOR_QUEUE_LINK,
      });
    }
    await recordAudit(ctx, {
      actorId: me._id,
      action: AUDIT.PEER_REVIEW_CONFLICT,
      targetId: publicationId,
      metadata: { hasConflict },
    });
    return null;
  },
});

/**
 * Dépôt d'un avis par le relecteur ASSIGNÉ à la version courante, après sa
 * déclaration d'absence de conflit. Un avis par version (ALREADY_REVIEWED) :
 * sans cela un même relecteur pèserait deux fois dans la recommandation
 * agrégée. Le commentaire à l'éditeur reste confidentiel.
 */
export const submitReview = mutation({
  args: {
    publicationId: v.id('publications'),
    recommendation: recommendationValidator,
    comment: v.string(),
    commentToEditor: v.optional(v.string()),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (
    ctx,
    { publicationId, recommendation, comment, commentToEditor },
  ) => {
    const reviewer = await requireNetworkRole(ctx, 'moderateur');
    const pub = await ctx.db.get(publicationId);
    if (!pub) throw new Error('NOT_FOUND');
    const stage = stageOf(pub);
    if (stage !== 'in_review') {
      throw new Error(
        DECIDED_STAGES.includes(stage)
          ? 'ALREADY_REVIEWED'
          : 'INVALID_TRANSITION',
      );
    }
    const assignment = await assignmentFor(ctx, publicationId, reviewer._id);
    const latest = await latestVersion(ctx, publicationId);
    const current = latest?.version ?? 1;
    if (!assignment || versionOfAssignment(assignment) !== current) {
      throw new Error('NOT_ASSIGNED');
    }
    const conflict = conflictState(assignment);
    if (conflict === 'undeclared') throw new Error('CONFLICT_NOT_DECLARED');
    if (conflict === 'conflict') throw new Error('CONFLICT_DECLARED');

    const already = (
      await ctx.db
        .query('peerReviews')
        .withIndex('by_publication_and_reviewer', (q) =>
          q
            .eq('publicationId', publicationId)
            .eq('reviewerUserId', reviewer._id),
        )
        .take(VERSIONS_MAX)
    ).some((r) => versionOfReview(r) === current);
    if (already) throw new Error('ALREADY_REVIEWED');

    const text = assertLength(
      comment,
      MANUSCRIPT_BOUNDS.comment,
      'INVALID_COMMENT',
    );
    const toEditor = commentToEditor?.trim() || undefined;
    if (toEditor && toEditor.length > MANUSCRIPT_BOUNDS.commentToEditor.max) {
      throw new Error('INVALID_COMMENT');
    }

    await ctx.db.insert('peerReviews', {
      publicationId,
      reviewerUserId: reviewer._id,
      reviewerName: reviewerName(reviewer),
      recommendation,
      comment: text,
      version: current,
      ...(toEditor ? { commentToEditor: toEditor } : {}),
      createdAt: Date.now(),
    });
    await ctx.db.patch(assignment._id, { dueAt: undefined });

    await notify(ctx, {
      userId: assignment.assignedBy,
      type: 'peer_review_submitted',
      titleKey: 'peerReviewSubmitted',
      params: { title: latest?.title ?? pub.title },
      link: EDITOR_QUEUE_LINK,
    });
    await recordAudit(ctx, {
      actorId: reviewer._id,
      action: AUDIT.PEER_REVIEW,
      targetId: publicationId,
      metadata: { kind: 'review', recommendation, version: current },
    });
    return { ok: true };
  },
});

// === Auteur ===================================================================

// Bornes du fichier d'une révision : celles du dépôt (convex/publications.ts).
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_FILE_TYPES = ['application/pdf'];

async function assertOwnedPublication(
  ctx: QueryCtx,
  publicationId: Id<'publications'>,
  userId: Id<'users'>,
): Promise<Doc<'publications'>> {
  const pub = await ctx.db.get(publicationId);
  // Le dépôt d'un autre se lit comme un dépôt inexistant : rien à apprendre.
  if (!pub || pub.authorUserId !== userId) throw new Error('NOT_FOUND');
  return pub;
}

/**
 * L'auteur soumet SON dépôt en attente au comité de lecture (membre+).
 * Transition `submit` : la version 1 est figée à partir du dépôt, sa copie
 * anonymisée est planifiée, le comité éditorial est prévenu.
 */
export const submitManuscript = mutation({
  args: {
    publicationId: v.id('publications'),
    keywords: v.optional(v.array(v.string())),
  },
  returns: v.object({ ok: v.boolean(), version: v.number() }),
  handler: async (ctx, { publicationId, keywords }) => {
    const me = await requireNetworkRole(ctx, 'membre');
    const pub = await assertOwnedPublication(ctx, publicationId, me._id);
    // Seul un dépôt EN ATTENTE entre en revue : un texte publié ou refusé
    // n'est plus un manuscrit.
    if (pub.status !== 'pending') throw new Error('INVALID_TRANSITION');
    const to = nextStage(stageOf(pub), 'submit');
    await enforceRateLimit(ctx, {
      key: `manuscript:${me._id}`,
      ...RATE_LIMITS.publicationSubmit,
    });
    const id = await ctx.db.insert('manuscriptVersions', {
      publicationId,
      version: 1,
      title: pub.title,
      abstract: pub.abstract,
      keywords: normalizeKeywords(keywords ?? pub.keypoints),
      ...(pub.fileId ? { fileId: pub.fileId } : {}),
      ...(pub.fileName ? { fileName: pub.fileName } : {}),
      blindStatus: pub.fileId ? 'pending' : 'none',
      submittedBy: me._id,
      createdAt: Date.now(),
    });
    if (pub.fileId) await scheduleBlindCopy(ctx, id);
    await ctx.db.patch(publicationId, { reviewStage: to });
    await notifyEditors(ctx, {
      type: 'manuscript_submitted',
      titleKey: 'manuscriptSubmitted',
      title: pub.title,
    });
    await recordAudit(ctx, {
      actorId: me._id,
      action: AUDIT.MANUSCRIPT_SUBMITTED,
      targetId: publicationId,
      metadata: { version: 1 },
    });
    return { ok: true, version: 1 };
  },
});

/**
 * Révision (auteur, sur une révision DEMANDÉE) : une NOUVELLE version —
 * nouveau fichier, métadonnées éventuellement corrigées — et une lettre de
 * réponse aux relecteurs, obligatoire. Rien n'est réécrit dans les versions
 * précédentes. L'éditeur qui a demandé la révision est prévenu ; c'est lui
 * qui ouvre le tour suivant (ou accepte directement une révision mineure).
 */
export const submitRevision = mutation({
  args: {
    publicationId: v.id('publications'),
    title: v.string(),
    abstract: v.string(),
    keywords: v.array(v.string()),
    fileId: v.id('_storage'),
    fileName: v.string(),
    responseLetter: v.string(),
  },
  returns: v.object({ ok: v.boolean(), version: v.number() }),
  handler: async (ctx, args) => {
    const me = await requireNetworkRole(ctx, 'membre');
    const pub = await assertOwnedPublication(ctx, args.publicationId, me._id);
    const to = nextStage(stageOf(pub), 'resubmit');
    const B = MANUSCRIPT_BOUNDS;
    const title = assertLength(args.title, B.title, 'INVALID_TITLE');
    const abstract = assertLength(
      args.abstract,
      B.abstract,
      'INVALID_ABSTRACT',
    );
    const responseLetter = assertLength(
      args.responseLetter,
      B.responseLetter,
      'INVALID_RESPONSE_LETTER',
    );
    // Le blob se juge sur ses métadonnées RÉELLES, jamais sur ce qu'annonce
    // le client (même défiance que le dépôt).
    const meta = await ctx.db.system.get(args.fileId);
    if (
      !meta ||
      meta.size === 0 ||
      meta.size > MAX_FILE_BYTES ||
      (meta.contentType && !ALLOWED_FILE_TYPES.includes(meta.contentType))
    ) {
      throw new Error('INVALID_FILE');
    }
    await enforceRateLimit(ctx, {
      key: `manuscript:${me._id}`,
      ...RATE_LIMITS.publicationSubmit,
    });

    const latest = await ensureVersion(ctx, pub, me._id);
    const version = latest.version + 1;
    const id = await ctx.db.insert('manuscriptVersions', {
      publicationId: args.publicationId,
      version,
      title,
      abstract,
      keywords: normalizeKeywords(args.keywords),
      fileId: args.fileId,
      fileName: args.fileName.trim().slice(0, 200) || `v${version}.pdf`,
      blindStatus: 'pending',
      responseLetter,
      submittedBy: me._id,
      createdAt: Date.now(),
    });
    await scheduleBlindCopy(ctx, id);
    await ctx.db.patch(args.publicationId, { reviewStage: to });

    const decisions = await ctx.db
      .query('manuscriptDecisions')
      .withIndex('by_publication', (q) =>
        q.eq('publicationId', args.publicationId),
      )
      .order('desc')
      .first();
    if (decisions) {
      await notify(ctx, {
        userId: decisions.decidedBy,
        type: 'manuscript_resubmitted',
        titleKey: 'manuscriptResubmitted',
        params: { title },
        link: EDITOR_QUEUE_LINK,
      });
    } else {
      await notifyEditors(ctx, {
        type: 'manuscript_resubmitted',
        titleKey: 'manuscriptResubmitted',
        title,
      });
    }
    await recordAudit(ctx, {
      actorId: me._id,
      action: AUDIT.MANUSCRIPT_REVISED,
      targetId: args.publicationId,
      metadata: { version },
    });
    return { ok: true, version };
  },
});

/**
 * Suivi de l'auteur (espace membre) : ses manuscrits, leurs versions, les
 * décisions motivées et les avis — NUMÉROTÉS, sans nom ni identifiant de
 * relecteur, et seulement pour une version déjà tranchée (un avis n'est pas
 * montré à l'auteur avant que l'éditeur l'ait pesé). Et les dépôts qu'il peut
 * encore soumettre au comité.
 */
export const myManuscripts = query({
  args: {},
  returns: v.object({
    manuscripts: v.array(
      v.object({
        publicationId: v.id('publications'),
        title: v.string(),
        reviewStage: manuscriptStage,
        status: pubStatusValidator,
        slug: v.string(),
        currentVersion: v.number(),
        canRevise: v.boolean(),
        versions: v.array(
          v.object({
            version: v.number(),
            title: v.string(),
            fileName: v.union(v.string(), v.null()),
            hasResponseLetter: v.boolean(),
            createdAt: v.number(),
          }),
        ),
        decisions: v.array(decisionView),
        reviews: v.array(
          v.object({
            version: v.number(),
            // « Relecteur 1 », « Relecteur 2 » — un rang, pas une identité.
            index: v.number(),
            recommendation: recommendationValidator,
            comment: v.string(),
          }),
        ),
      }),
    ),
    eligible: v.array(
      v.object({
        publicationId: v.id('publications'),
        title: v.string(),
        submittedAt: v.number(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const me = await requireNetworkRole(ctx, 'membre');
    const mine = await ctx.db
      .query('publications')
      .withIndex('by_author', (q) => q.eq('authorUserId', me._id))
      .order('desc')
      .take(100);
    const manuscripts = [];
    for (const pub of mine.filter((p) => p.reviewStage !== undefined)) {
      const versions = await versionsOf(ctx, pub._id);
      const decisions = (
        await ctx.db
          .query('manuscriptDecisions')
          .withIndex('by_publication', (q) => q.eq('publicationId', pub._id))
          .take(VERSIONS_MAX * 2)
      ).sort((a, b) => a.createdAt - b.createdAt);
      const decided = new Set(decisions.map((d) => d.version));
      const reviews = (await reviewsOf(ctx, pub._id))
        .filter((r) => decided.has(versionOfReview(r)))
        .sort((a, b) => a.createdAt - b.createdAt);
      // Rang du relecteur dans le manuscrit : stable d'une version à l'autre
      // (le « Relecteur 1 » de la v1 est celui de la v2), sans rien révéler.
      const order: Id<'users'>[] = [];
      for (const r of reviews) {
        if (!order.includes(r.reviewerUserId)) order.push(r.reviewerUserId);
      }
      const latest = versions[versions.length - 1];
      manuscripts.push({
        publicationId: pub._id,
        title: latest?.title ?? pub.title,
        reviewStage: pub.reviewStage as NonNullable<typeof pub.reviewStage>,
        status: pub.status,
        slug: pub.slug,
        currentVersion: latest?.version ?? 1,
        canRevise: pub.reviewStage === 'revision',
        versions: versions.map((ver) => ({
          version: ver.version,
          title: ver.title,
          fileName: ver.fileName ?? null,
          hasResponseLetter: ver.responseLetter !== undefined,
          createdAt: ver.createdAt,
        })),
        decisions: decisions.map((d) => ({
          version: d.version,
          decision: d.decision,
          reason: d.reason,
          createdAt: d.createdAt,
        })),
        reviews: reviews.map((r) => ({
          version: versionOfReview(r),
          index: order.indexOf(r.reviewerUserId) + 1,
          recommendation: r.recommendation,
          comment: r.comment,
        })),
      });
    }
    return {
      manuscripts,
      eligible: mine
        .filter((p) => p.reviewStage === undefined && p.status === 'pending')
        .map((p) => ({
          publicationId: p._id,
          title: p.title,
          submittedAt: p.submittedAt ?? p.createdAt,
        })),
    };
  },
});

/** Le dossier d'une version pour préparer la révision (auteur). */
export const myRevisionContext = query({
  args: { publicationId: v.id('publications') },
  returns: v.union(
    v.null(),
    v.object({
      title: v.string(),
      abstract: v.string(),
      keywords: v.array(v.string()),
      version: v.number(),
    }),
  ),
  handler: async (ctx, { publicationId }) => {
    const me = await requireNetworkRole(ctx, 'membre');
    const pub = await ctx.db.get(publicationId);
    if (!pub || pub.authorUserId !== me._id) return null;
    const latest = await latestVersion(ctx, publicationId);
    return {
      title: latest?.title ?? pub.title,
      abstract: latest?.abstract ?? pub.abstract,
      keywords: latest?.keywords ?? normalizeKeywords(pub.keypoints),
      version: latest?.version ?? 1,
    };
  },
});

// === Relances (tâche planifiée) ===============================================

/**
 * Relance les relecteurs en retard — appelée chaque jour par convex/crons.ts.
 *
 * L'index `by_dueAt` ne contient que les relectures ATTENDUES (l'échéance est
 * effacée dès que l'avis est rendu, le relecteur récusé ou le tour clos) : la
 * plage « échue » se lit sans parcourir les assignations closes. Chaque ligne
 * est revérifiée ici — une échéance restée posée sur un tour dépassé est
 * effacée plutôt que relancée.
 */
export const sendDueReminders = internalMutation({
  args: {},
  returns: v.object({
    reminded: v.number(),
    escalated: v.number(),
    closed: v.number(),
  }),
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query('peerReviewAssignments')
      .withIndex('by_dueAt', (q) => q.gt('dueAt', undefined).lte('dueAt', now))
      .take(REMINDER.batch);
    let reminded = 0;
    let escalated = 0;
    let closed = 0;
    for (const a of due) {
      const pub = await ctx.db.get(a.publicationId);
      const latest = pub ? await latestVersion(ctx, pub._id) : null;
      const version = versionOfAssignment(a);
      const reviewed = pub
        ? (
            await ctx.db
              .query('peerReviews')
              .withIndex('by_publication_and_reviewer', (q) =>
                q
                  .eq('publicationId', pub._id)
                  .eq('reviewerUserId', a.reviewerUserId),
              )
              .take(VERSIONS_MAX)
          ).some((r) => versionOfReview(r) === version)
        : false;
      if (
        !pub ||
        pub.reviewStage !== 'in_review' ||
        version !== (latest?.version ?? 1) ||
        reviewed ||
        a.conflict?.hasConflict
      ) {
        await ctx.db.patch(a._id, { dueAt: undefined });
        closed++;
        continue;
      }
      if (a.lastReminderAt && now - a.lastReminderAt < REMINDER.intervalMs) {
        continue;
      }
      const title = latest?.title ?? pub.title;
      const sent = a.remindersSent ?? 0;
      if (sent < REMINDER.max) {
        await notify(ctx, {
          userId: a.reviewerUserId,
          type: 'peer_review_reminder',
          titleKey: 'peerReviewReminder',
          params: { title },
          link: MY_REVIEWS_LINK,
        });
        await ctx.db.patch(a._id, {
          remindersSent: sent + 1,
          lastReminderAt: now,
        });
        reminded++;
      } else if (!a.overdueNotifiedAt) {
        await notify(ctx, {
          userId: a.assignedBy,
          type: 'peer_review_overdue',
          titleKey: 'peerReviewOverdue',
          params: { title },
          link: EDITOR_QUEUE_LINK,
        });
        await ctx.db.patch(a._id, { overdueNotifiedAt: now });
        escalated++;
      }
    }
    return { reminded, escalated, closed };
  },
});

// === Fichiers anonymisés (appelé par convex/peerReviewFiles.ts) ================

export const versionForBlindCopy = internalQuery({
  args: { versionId: v.id('manuscriptVersions') },
  returns: v.union(
    v.null(),
    v.object({ fileId: v.id('_storage'), title: v.string() }),
  ),
  handler: async (ctx, { versionId }) => {
    const ver = await ctx.db.get(versionId);
    if (!ver || !ver.fileId || ver.blindStatus !== 'pending') return null;
    return { fileId: ver.fileId, title: ver.title };
  },
});

export const saveBlindCopy = internalMutation({
  args: {
    versionId: v.id('manuscriptVersions'),
    blindFileId: v.optional(v.id('_storage')),
    status: v.union(
      v.literal('clean'),
      v.literal('stripped'),
      v.literal('unreadable'),
    ),
    stripped: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { versionId, blindFileId, status, stripped }) => {
    const ver = await ctx.db.get(versionId);
    if (!ver) {
      if (blindFileId) await ctx.storage.delete(blindFileId);
      return null;
    }
    if (ver.blindFileId && ver.blindFileId !== blindFileId) {
      await ctx.storage.delete(ver.blindFileId);
    }
    await ctx.db.patch(versionId, {
      blindStatus: status,
      blindFileId,
      strippedFields: stripped,
    });
    return null;
  },
});
