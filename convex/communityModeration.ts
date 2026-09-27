import { v, ConvexError } from 'convex/values';
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { requireNetworkRole } from './lib/rbac';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { notify } from './lib/notify';
import {
  trackTribuneCommentStatus,
  trackTribunePostStatus,
} from './lib/counters';
import {
  MODERATION_REASON,
  TRIBUNE_AI_SCOPE,
  contentStatusValidator,
  excerpt,
  moderationEventKindValidator,
  moderationModeValidator,
  moderationTargetValidator,
  nextStatus,
  type ContentStatus,
  type ModerationTarget,
} from './lib/communaute';
import {
  loadCommunitySettings,
  logModerationEvent,
} from './lib/moderationHistory';
import {
  APPLY_REASONS,
  aiModerationApplied,
  aiModerationVerdict,
  countSignals,
  decideApplication,
  shouldAlertStaff,
  type AiDocument,
  type AiRule,
} from './lib/aiModeration';
import {
  analyse,
  findingValidator,
  fromWire,
  loadEnabledRules,
  loadSettings as loadAiSettings,
  ruleValidator,
  settingsOut,
  settingsValidator,
  type AnalysisOutcome,
  type WireSettings,
} from './aiModeration';
import { onCommentPublished, onPostPublished } from './tribune';

// FILE DE MODÉRATION UNIFIÉE DE LA TRIBUNE (F-45, F-49) — chantier communauté.
//
// Trois responsabilités, un seul module :
//   1. le RÉGLAGE du mode (a priori / a posteriori), par l'administrateur ;
//   2. la FILE et les DÉCISIONS (valider, rejeter, retirer, classer les
//      signalements), par les modérateurs — chaque décision est journalisée
//      deux fois : dans l'historique du contenu (`moderationEvents`, lu par
//      l'écran) et dans le journal d'audit (convex/journal.ts, lu par
//      l'administrateur) ;
//   3. le PRÉ-TRI par l'IA, qui réutilise le dispositif de la bibliothèque
//      (convex/aiModeration.ts : mêmes réglages, même barème, même plafond,
//      même passerelle) sans le contourner. L'IA PROPOSE ; la décision reste
//      humaine, sauf si l'administrateur a coché « tribune » dans le périmètre
//      d'auto-acceptation du mode `auto` — réglage explicite, existant.

// --- Réglages ----------------------------------------------------------------

export const getSettings = query({
  args: {},
  returns: v.object({
    postMode: moderationModeValidator,
    commentMode: moderationModeValidator,
  }),
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'moderateur');
    return await loadCommunitySettings(ctx);
  },
});

export const updateSettings = mutation({
  args: {
    postMode: moderationModeValidator,
    commentMode: moderationModeValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const admin = await requireNetworkRole(ctx, 'admin');
    const existing = await ctx.db
      .query('communityModerationConfig')
      .withIndex('by_key', (q) => q.eq('key', 'default'))
      .unique();
    const next = {
      postMode: args.postMode,
      commentMode: args.commentMode,
      updatedBy: admin._id,
      updatedAt: Date.now(),
    };
    if (existing) await ctx.db.patch(existing._id, next);
    else
      await ctx.db.insert('communityModerationConfig', {
        key: 'default',
        ...next,
      });
    // Passer en a posteriori, c'est décider que des textes paraîtront sans
    // regard humain préalable : l'audit le nomme.
    await recordAudit(ctx, {
      actorId: admin._id,
      action: AUDIT.COMMUNITY_MODERATION_CONFIGURED,
      metadata: { postMode: args.postMode, commentMode: args.commentMode },
    });
    return null;
  },
});

// --- Lecture de la file ------------------------------------------------------

const aiSummaryValidator = v.union(
  v.object({
    verdict: aiModerationVerdict,
    applied: aiModerationApplied,
    reason: v.string(),
    confidence: v.number(),
    blocking: v.number(),
    warnings: v.number(),
  }),
  v.null(),
);

const queueItemValidator = v.object({
  targetType: moderationTargetValidator,
  targetId: v.string(),
  postId: v.id('tribunePosts'),
  title: v.string(),
  excerpt: v.string(),
  authorName: v.string(),
  status: contentStatusValidator,
  theme: v.string(),
  format: v.union(v.literal('court'), v.literal('fond')),
  isDeepening: v.boolean(),
  createdAt: v.number(),
  openReports: v.number(),
  aiReview: aiSummaryValidator,
});

const QUEUE_MAX = 100;

type QueueItem = {
  targetType: ModerationTarget;
  targetId: string;
  postId: Id<'tribunePosts'>;
  title: string;
  excerpt: string;
  authorName: string;
  status: ContentStatus;
  theme: string;
  format: 'court' | 'fond';
  isDeepening: boolean;
  createdAt: number;
  openReports: number;
  aiReview: Omit<NonNullable<Doc<'tribunePosts'>['aiReview']>, 'at'> | null;
};

function aiSummary(
  r: Doc<'tribunePosts'>['aiReview'] | Doc<'tribuneComments'>['aiReview'],
): QueueItem['aiReview'] {
  if (!r) return null;
  return {
    verdict: r.verdict,
    applied: r.applied,
    reason: r.reason,
    confidence: r.confidence,
    blocking: r.blocking,
    warnings: r.warnings,
  };
}

function postItem(p: Doc<'tribunePosts'>, openReports = 0): QueueItem {
  return {
    targetType: 'post',
    targetId: p._id,
    postId: p._id,
    title: p.title,
    excerpt: excerpt(p.body),
    authorName: p.authorName,
    status: p.status,
    theme: p.theme,
    format: p.format,
    isDeepening: p.parentPostId !== undefined,
    createdAt: p.createdAt,
    openReports,
    aiReview: aiSummary(p.aiReview),
  };
}

function commentItem(
  c: Doc<'tribuneComments'>,
  post: Doc<'tribunePosts'>,
  openReports = 0,
): QueueItem {
  return {
    targetType: 'comment',
    targetId: c._id,
    postId: post._id,
    title: post.title,
    excerpt: excerpt(c.body),
    authorName: c.authorName,
    status: c.status,
    theme: post.theme,
    format: post.format,
    isDeepening: post.parentPostId !== undefined,
    createdAt: c.createdAt,
    openReports,
    aiReview: aiSummary(c.aiReview),
  };
}

// File par onglet. `reported` rassemble les contenus visés par au moins un
// signalement OUVERT, quel que soit leur état ; les autres onglets suivent le
// statut. Filtres : type de contenu, axe, format.
export const listQueue = query({
  args: {
    tab: v.union(
      v.literal('pending'),
      v.literal('published'),
      v.literal('rejected'),
      v.literal('removed'),
      v.literal('reported'),
    ),
    targetType: v.optional(moderationTargetValidator),
    theme: v.optional(v.string()),
    format: v.optional(v.union(v.literal('court'), v.literal('fond'))),
  },
  returns: v.array(queueItemValidator),
  handler: async (ctx, args) => {
    await requireNetworkRole(ctx, 'moderateur');
    const items: QueueItem[] = [];
    const wantPosts = args.targetType !== 'comment';
    const wantComments = args.targetType !== 'post';

    if (args.tab === 'reported') {
      const reports = await ctx.db
        .query('tribuneReports')
        .withIndex('by_resolved', (q) => q.eq('resolved', false))
        .order('desc')
        .take(500);
      const counts = new Map<string, { type: ModerationTarget; n: number }>();
      for (const r of reports) {
        const prev = counts.get(r.targetId);
        counts.set(r.targetId, { type: r.targetType, n: (prev?.n ?? 0) + 1 });
      }
      for (const [targetId, { type, n }] of counts) {
        if (type === 'post' && wantPosts) {
          const id = ctx.db.normalizeId('tribunePosts', targetId);
          const p = id ? await ctx.db.get(id) : null;
          if (p) items.push(postItem(p, n));
        } else if (type === 'comment' && wantComments) {
          const id = ctx.db.normalizeId('tribuneComments', targetId);
          const c = id ? await ctx.db.get(id) : null;
          const post = c ? await ctx.db.get(c.postId) : null;
          if (c && post) items.push(commentItem(c, post, n));
        }
      }
    } else {
      const status = args.tab;
      if (wantPosts) {
        const posts = await ctx.db
          .query('tribunePosts')
          .withIndex('by_status', (q) => q.eq('status', status))
          .order('desc')
          .take(QUEUE_MAX);
        items.push(...posts.map((p) => postItem(p)));
      }
      if (wantComments) {
        const comments = await ctx.db
          .query('tribuneComments')
          .withIndex('by_status', (q) => q.eq('status', status))
          .order('desc')
          .take(QUEUE_MAX);
        for (const c of comments) {
          const post = await ctx.db.get(c.postId);
          if (post) items.push(commentItem(c, post));
        }
      }
    }

    return items
      .filter((i) => !args.theme || i.theme === args.theme)
      .filter((i) => !args.format || i.format === args.format)
      .sort((a, b) =>
        // La file d'attente se traite dans l'ordre d'arrivée ; les autres
        // onglets se lisent du plus récent au plus ancien.
        args.tab === 'pending'
          ? a.createdAt - b.createdAt
          : b.createdAt - a.createdAt,
      )
      .slice(0, QUEUE_MAX);
  },
});

// Compteurs des onglets (badges). Bornés : au-delà, l'écran affiche « 100+ ».
export const queueCounts = query({
  args: {},
  returns: v.object({ pending: v.number(), reported: v.number() }),
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'moderateur');
    const pendingPosts = await ctx.db
      .query('tribunePosts')
      .withIndex('by_status', (q) => q.eq('status', 'pending'))
      .take(QUEUE_MAX + 1);
    const pendingComments = await ctx.db
      .query('tribuneComments')
      .withIndex('by_status', (q) => q.eq('status', 'pending'))
      .take(QUEUE_MAX + 1);
    const reports = await ctx.db
      .query('tribuneReports')
      .withIndex('by_resolved', (q) => q.eq('resolved', false))
      .take(500);
    return {
      pending: pendingPosts.length + pendingComments.length,
      reported: new Set(reports.map((r) => r.targetId)).size,
    };
  },
});

// --- Détail d'un contenu et son HISTORIQUE COMPLET (F-49) --------------------

const historyEventValidator = v.object({
  _id: v.string(),
  kind: moderationEventKindValidator,
  // Nom de l'auteur de l'action ; null pour l'IA ou un compte supprimé.
  actorName: v.union(v.string(), v.null()),
  statusFrom: v.union(contentStatusValidator, v.null()),
  statusTo: v.union(contentStatusValidator, v.null()),
  reason: v.union(v.string(), v.null()),
  ai: v.union(
    v.object({
      verdict: aiModerationVerdict,
      applied: aiModerationApplied,
      reason: v.string(),
      confidence: v.number(),
      summary: v.string(),
      findings: v.array(findingValidator),
      model: v.string(),
      error: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  createdAt: v.number(),
});

function actorLabel(user: Doc<'users'> | null): string | null {
  if (!user) return null;
  return user.name?.trim() || user.email?.split('@')[0] || null;
}

async function loadTarget(
  ctx: QueryCtx,
  targetType: ModerationTarget,
  targetId: string,
): Promise<
  | { kind: 'post'; doc: Doc<'tribunePosts'>; post: Doc<'tribunePosts'> }
  | {
      kind: 'comment';
      doc: Doc<'tribuneComments'>;
      post: Doc<'tribunePosts'>;
    }
  | null
> {
  if (targetType === 'post') {
    const id = ctx.db.normalizeId('tribunePosts', targetId);
    const p = id ? await ctx.db.get(id) : null;
    return p ? { kind: 'post', doc: p, post: p } : null;
  }
  const id = ctx.db.normalizeId('tribuneComments', targetId);
  const c = id ? await ctx.db.get(id) : null;
  const post = c ? await ctx.db.get(c.postId) : null;
  return c && post ? { kind: 'comment', doc: c, post } : null;
}

export const getItem = query({
  args: { targetType: moderationTargetValidator, targetId: v.string() },
  returns: v.union(
    v.object({
      targetType: moderationTargetValidator,
      targetId: v.string(),
      postId: v.id('tribunePosts'),
      postTitle: v.string(),
      title: v.string(),
      body: v.string(),
      authorName: v.string(),
      status: contentStatusValidator,
      theme: v.string(),
      format: v.union(v.literal('court'), v.literal('fond')),
      rejectionReason: v.union(v.string(), v.null()),
      parent: v.union(
        v.object({ _id: v.id('tribunePosts'), title: v.string() }),
        v.null(),
      ),
      createdAt: v.number(),
      openReports: v.number(),
      history: v.array(historyEventValidator),
    }),
    v.null(),
  ),
  handler: async (ctx, { targetType, targetId }) => {
    const staff = await requireNetworkRole(ctx, 'moderateur');
    const target = await loadTarget(ctx, targetType, targetId);
    if (!target) return null;
    const id = target.doc._id as string;

    const events = await ctx.db
      .query('moderationEvents')
      .withIndex('by_target', (q) =>
        q.eq('targetType', targetType).eq('targetId', id),
      )
      .take(500);
    // L'avis en mode OBSERVATION n'atteint pas les modérateurs — c'est la
    // définition de ce mode (docs/moderation-ia.md § 2) : un avis montré
    // orienterait la décision qu'on veut mesurer. L'administrateur, qui règle
    // le barème, le voit.
    const isAdmin = staff.role === 'admin';
    const visible = events.filter(
      (e) => isAdmin || e.kind !== 'ai_review' || e.ai?.applied !== 'shadow',
    );

    const actorIds = [
      ...new Set(
        visible
          .map((e) => e.actorId)
          .filter((a): a is Id<'users'> => a !== undefined),
      ),
    ];
    const actors = new Map<string, Doc<'users'> | null>();
    for (const a of actorIds) actors.set(a, await ctx.db.get(a));

    const history: {
      _id: string;
      kind: (typeof visible)[number]['kind'];
      actorName: string | null;
      statusFrom: ContentStatus | null;
      statusTo: ContentStatus | null;
      reason: string | null;
      ai: {
        verdict: NonNullable<(typeof visible)[number]['ai']>['verdict'];
        applied: NonNullable<(typeof visible)[number]['ai']>['applied'];
        reason: string;
        confidence: number;
        summary: string;
        findings: NonNullable<(typeof visible)[number]['ai']>['findings'];
        model: string;
        error: string | null;
      } | null;
      createdAt: number;
    }[] = visible.map((e) => ({
      _id: e._id,
      kind: e.kind,
      actorName: e.actorId ? actorLabel(actors.get(e.actorId) ?? null) : null,
      statusFrom: e.statusFrom ?? null,
      statusTo: e.statusTo ?? null,
      reason: e.reason ?? null,
      ai: e.ai
        ? {
            verdict: e.ai.verdict,
            applied: e.ai.applied,
            reason: e.ai.reason,
            confidence: e.ai.confidence,
            summary: e.ai.summary,
            findings: e.ai.findings,
            model: e.ai.model,
            error: e.ai.error ?? null,
          }
        : null,
      createdAt: e.createdAt,
    }));
    // Un contenu antérieur à l'historique n'a pas d'événement de soumission :
    // on le restitue depuis sa date de création, pour que l'historique
    // commence toujours par l'entrée du contenu dans la plateforme.
    if (!history.some((h) => h.kind === 'submitted')) {
      history.unshift({
        _id: `legacy:${id}`,
        kind: 'submitted',
        actorName: target.doc.authorName,
        statusFrom: null,
        statusTo: null,
        reason: null,
        ai: null,
        createdAt: target.doc.createdAt,
      });
    }
    // Ordre CHRONOLOGIQUE, à égalité de date dans l'ordre d'écriture (l'index
    // se termine par `_creationTime`, et le tri de JavaScript est stable).
    history.sort((a, b) => a.createdAt - b.createdAt);

    const openReports = (
      await ctx.db
        .query('tribuneReports')
        .withIndex('by_target', (q) => q.eq('targetId', id))
        .take(500)
    ).filter((r) => !r.resolved).length;

    const parent =
      target.post.parentPostId !== undefined
        ? await ctx.db.get(target.post.parentPostId)
        : null;

    return {
      targetType,
      targetId: id,
      postId: target.post._id,
      postTitle: target.post.title,
      title: target.kind === 'post' ? target.doc.title : target.post.title,
      body: target.doc.body,
      authorName: target.doc.authorName,
      status: target.doc.status,
      theme: target.post.theme,
      format: target.post.format,
      rejectionReason: target.doc.rejectionReason ?? null,
      parent: parent ? { _id: parent._id, title: parent.title } : null,
      createdAt: target.doc.createdAt,
      openReports,
      history,
    };
  },
});

// --- Décisions (modérateur et au-dessus) --------------------------------------

async function resolveOpenReports(
  ctx: MutationCtx,
  targetId: string,
): Promise<number> {
  const open = (
    await ctx.db
      .query('tribuneReports')
      .withIndex('by_target', (q) => q.eq('targetId', targetId))
      .take(500)
  ).filter((r) => !r.resolved);
  for (const r of open) await ctx.db.patch(r._id, { resolved: true });
  return open.length;
}

// Valider, rejeter ou retirer. SEUL un modérateur (ou plus) décide ; un
// rejet et un retrait exigent un motif, montré à l'auteur.
export const decide = mutation({
  args: {
    targetType: moderationTargetValidator,
    targetId: v.string(),
    decision: v.union(
      v.literal('approve'),
      v.literal('reject'),
      v.literal('remove'),
    ),
    reason: v.optional(v.string()),
  },
  returns: v.object({ status: contentStatusValidator }),
  handler: async (ctx, args) => {
    const mod = await requireNetworkRole(ctx, 'moderateur');
    const target = await loadTarget(ctx, args.targetType, args.targetId);
    if (!target) throw new ConvexError('NOT_FOUND');
    const from = target.doc.status;
    const to = nextStatus(from, args.decision);
    if (!to) throw new ConvexError('INVALID_TRANSITION');

    const reason = args.reason?.trim() ?? '';
    const negative = args.decision !== 'approve';
    if (
      negative &&
      (reason.length < MODERATION_REASON.min ||
        reason.length > MODERATION_REASON.max)
    ) {
      throw new ConvexError('REASON_REQUIRED');
    }

    const now = Date.now();
    const patch = {
      status: to,
      moderatedBy: mod._id,
      moderatedAt: now,
      // Le motif d'une décision négative reste sur le contenu (l'auteur le
      // lit) ; une validation l'efface.
      rejectionReason: negative ? reason : undefined,
      autoPublished: undefined,
    };
    const id = target.doc._id as string;

    if (target.kind === 'post') {
      await ctx.db.patch(target.doc._id, patch);
      const fresh = (await ctx.db.get(target.doc._id))!;
      if (to === 'published') await onPostPublished(ctx, fresh, from);
      else await trackTribunePostStatus(ctx, from, to);
    } else {
      await ctx.db.patch(target.doc._id, patch);
      const fresh = (await ctx.db.get(target.doc._id))!;
      if (to === 'published') await onCommentPublished(ctx, fresh, from);
      else {
        await trackTribuneCommentStatus(ctx, from, to);
        if (from === 'published' && target.post.commentCount > 0) {
          await ctx.db.patch(target.post._id, {
            commentCount: target.post.commentCount - 1,
          });
        }
      }
    }

    // Un retrait (ou une validation) tranche aussi les signalements ouverts
    // sur ce contenu : ils ont reçu leur réponse.
    if (args.decision !== 'reject') await resolveOpenReports(ctx, id);

    await logModerationEvent(ctx, {
      targetType: args.targetType,
      targetId: id,
      postId: target.post._id,
      kind:
        args.decision === 'approve'
          ? 'approved'
          : args.decision === 'reject'
            ? 'rejected'
            : 'removed',
      actorId: mod._id,
      statusFrom: from,
      statusTo: to,
      ...(negative ? { reason } : {}),
    });
    await recordAudit(ctx, {
      actorId: mod._id,
      action:
        args.decision === 'approve'
          ? AUDIT.TRIBUNE_APPROVED
          : args.decision === 'reject'
            ? AUDIT.TRIBUNE_REJECTED
            : AUDIT.TRIBUNE_REMOVED,
      targetId: id,
      metadata: { targetType: args.targetType, from, to },
    });

    // L'auteur apprend la décision — et, si elle est négative, pourquoi.
    const title = target.post.title;
    const link =
      to === 'published'
        ? `/tribune/${target.post._id}`
        : '/espace-membre/contributions';
    const key =
      args.targetType === 'post'
        ? to === 'published'
          ? 'tribunePostApproved'
          : to === 'rejected'
            ? 'tribunePostRejected'
            : 'tribunePostRemoved'
        : to === 'published'
          ? 'tribuneCommentApproved'
          : 'tribuneCommentRejected';
    await notify(ctx, {
      userId: target.doc.authorUserId,
      type: 'tribune_moderation',
      titleKey: key,
      params: { title },
      link,
    });
    return { status: to };
  },
});

// Classer les signalements d'un contenu sans y toucher.
export const dismissReports = mutation({
  args: { targetType: moderationTargetValidator, targetId: v.string() },
  returns: v.object({ dismissed: v.number() }),
  handler: async (ctx, args) => {
    const mod = await requireNetworkRole(ctx, 'moderateur');
    const target = await loadTarget(ctx, args.targetType, args.targetId);
    if (!target) throw new ConvexError('NOT_FOUND');
    const id = target.doc._id as string;
    const dismissed = await resolveOpenReports(ctx, id);
    if (dismissed > 0) {
      await logModerationEvent(ctx, {
        targetType: args.targetType,
        targetId: id,
        postId: target.post._id,
        kind: 'reports_dismissed',
        actorId: mod._id,
      });
      await recordAudit(ctx, {
        actorId: mod._id,
        action: AUDIT.TRIBUNE_REPORTS_DISMISSED,
        targetId: id,
        metadata: { targetType: args.targetType, dismissed },
      });
    }
    return { dismissed };
  },
});

// --- Pré-tri par l'IA -----------------------------------------------------------

type TribuneReviewContext = {
  document: AiDocument;
  settings: WireSettings;
  rules: AiRule[];
} | null;

export const tribuneReviewContext = internalQuery({
  args: { targetType: moderationTargetValidator, targetId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      document: v.object({
        title: v.string(),
        type: v.string(),
        theme: v.string(),
        region: v.string(),
        languages: v.array(v.string()),
        year: v.number(),
        authors: v.array(
          v.object({ name: v.string(), role: v.optional(v.string()) }),
        ),
        abstract: v.string(),
        keypoints: v.array(v.string()),
        body: v.array(v.string()),
      }),
      settings: settingsValidator,
      rules: v.array(ruleValidator),
    }),
  ),
  handler: async (ctx, { targetType, targetId }) => {
    const target = await loadTarget(ctx, targetType, targetId);
    if (!target) return null;
    // Rien à analyser pour ce qui est déjà tranché NÉGATIVEMENT.
    if (target.doc.status === 'rejected' || target.doc.status === 'removed')
      return null;
    const settings = await loadAiSettings(ctx);
    if (settings.mode === 'off') return null;
    const isComment = target.kind === 'comment';
    return {
      document: {
        title: isComment
          ? `Commentaire sur « ${target.post.title} »`
          : target.post.title,
        type: TRIBUNE_AI_SCOPE,
        theme: target.post.theme,
        region: 'mondial',
        languages: [target.post.lang ?? 'fr'],
        year: new Date(target.doc.createdAt).getUTCFullYear(),
        authors: [{ name: target.doc.authorName }],
        abstract: '',
        keypoints: [],
        body: [target.doc.body],
      },
      settings: settingsOut(settings),
      rules: await loadEnabledRules(ctx),
    };
  },
});

export const runTribuneReview = internalAction({
  args: { targetType: moderationTargetValidator, targetId: v.string() },
  returns: v.null(),
  handler: async (ctx, { targetType, targetId }) => {
    const context: TribuneReviewContext = await ctx.runQuery(
      internal.communityModeration.tribuneReviewContext,
      { targetType, targetId },
    );
    if (!context) return null;
    const settings = fromWire(context.settings);
    // Même plafond quotidien que la bibliothèque : un seul budget d'appels.
    const allowed: boolean = await ctx.runMutation(
      internal.aiModeration.reserveCall,
      {},
    );
    const outcome: AnalysisOutcome = allowed
      ? await analyse(context.document, settings, context.rules, null, false)
      : {
          verdict: 'error',
          confidence: 0,
          summary: '',
          findings: [],
          model: settings.model,
          error: 'DAILY_CAP_REACHED',
        };
    await ctx.runMutation(internal.communityModeration.applyTribuneVerdict, {
      targetType,
      targetId,
      verdict: outcome.verdict,
      confidence: outcome.confidence,
      summary: outcome.summary,
      findings: outcome.findings,
      model: outcome.model,
      configVersion: context.settings.version,
      ...(outcome.error ? { error: outcome.error } : {}),
    });
    return null;
  },
});

// Le modèle propose, le serveur décide — en relisant tout, DANS la
// transaction qui écrit (même invariant que `aiModeration.applyVerdict`).
export const applyTribuneVerdict = internalMutation({
  args: {
    targetType: moderationTargetValidator,
    targetId: v.string(),
    verdict: aiModerationVerdict,
    confidence: v.number(),
    summary: v.string(),
    findings: v.array(findingValidator),
    model: v.string(),
    configVersion: v.number(),
    error: v.optional(v.string()),
  },
  returns: v.object({ applied: aiModerationApplied, reason: v.string() }),
  handler: async (ctx, args) => {
    const target = await loadTarget(ctx, args.targetType, args.targetId);
    if (!target) {
      return {
        applied: 'superseded' as const,
        reason: APPLY_REASONS.ALREADY_DECIDED,
      };
    }
    const settings = await loadAiSettings(ctx);
    const decision = decideApplication({
      mode: settings.mode,
      verdict: args.verdict,
      confidence: args.confidence,
      findings: args.findings,
      publicationType: TRIBUNE_AI_SCOPE,
      eligibleTypes: settings.eligibleTypes,
      minConfidence: settings.autoPublishMinConfidence,
      hasAttachment: false,
      attachmentAnalyzed: false,
    });
    // Un humain a tranché, ou le contenu est déjà en ligne (a posteriori) :
    // l'avis est gardé pour l'historique, il n'est pas appliqué.
    const superseded = target.doc.status !== 'pending';
    const applied = superseded ? ('superseded' as const) : decision.applied;
    const reason = superseded ? APPLY_REASONS.ALREADY_DECIDED : decision.reason;
    const now = Date.now();
    const signals = countSignals(args.findings);
    const id = target.doc._id as string;

    if (applied !== 'shadow') {
      const summary = {
        verdict: args.verdict,
        applied,
        reason,
        confidence: args.confidence,
        blocking: signals.blocking,
        warnings: signals.warnings,
        at: now,
      };
      await ctx.db.patch(target.doc._id, { aiReview: summary });
    }

    await logModerationEvent(ctx, {
      targetType: args.targetType,
      targetId: id,
      postId: target.post._id,
      kind: 'ai_review',
      ai: {
        verdict: args.verdict,
        applied,
        reason,
        confidence: args.confidence,
        summary: args.summary,
        findings: args.findings,
        model: args.model,
        configVersion: args.configVersion,
        ...(args.error ? { error: args.error } : {}),
      },
    });

    if (applied === 'published') {
      // Mise en ligne SANS relecture humaine : seul cas, et seulement si
      // l'administrateur a coché « tribune » dans le périmètre du mode auto.
      await ctx.db.patch(target.doc._id, {
        status: 'published',
        moderatedAt: now,
        autoPublished: true,
      });
      if (target.kind === 'post') {
        const fresh = (await ctx.db.get(target.doc._id))!;
        await onPostPublished(ctx, fresh, 'pending');
      } else {
        const fresh = (await ctx.db.get(target.doc._id))!;
        await onCommentPublished(ctx, fresh, 'pending');
      }
      await logModerationEvent(ctx, {
        targetType: args.targetType,
        targetId: id,
        postId: target.post._id,
        kind: 'ai_published',
        statusFrom: 'pending',
        statusTo: 'published',
      });
    }

    await recordAudit(ctx, {
      action:
        applied === 'published'
          ? AUDIT.TRIBUNE_AI_PUBLISHED
          : AUDIT.TRIBUNE_AI_REVIEWED,
      targetId: id,
      metadata: {
        targetType: args.targetType,
        verdict: args.verdict,
        applied,
        reason,
        confidence: args.confidence,
        model: args.model,
        blocking: signals.blocking,
        warnings: signals.warnings,
      },
    });

    // Un signal BLOQUANT va chercher le staff — y compris sur un contenu déjà
    // en ligne (mode a posteriori), où c'est le seul regard avant signalement.
    const blockingOnline =
      superseded &&
      target.doc.status === 'published' &&
      signals.blocking > 0 &&
      settings.mode !== 'shadow';
    if (
      shouldAlertStaff(applied, args.verdict, args.findings) ||
      blockingOnline
    ) {
      await alertStaff(ctx, target.post.title, args.targetType, id);
    }
    return { applied, reason };
  },
});

const STAFF_ROLES = ['moderateur', 'editeur', 'admin'] as const;

async function alertStaff(
  ctx: MutationCtx,
  title: string,
  targetType: ModerationTarget,
  targetId: string,
) {
  for (const role of STAFF_ROLES) {
    const users = await ctx.db
      .query('users')
      .withIndex('by_role', (q) => q.eq('role', role))
      .take(200);
    for (const u of users) {
      await notify(ctx, {
        userId: u._id,
        type: 'tribune_ai_flagged',
        titleKey: 'tribuneAiFlagged',
        params: { title },
        link: `/admin/file-moderation?type=${targetType}&id=${targetId}`,
      });
    }
  }
}

// --- DEV/TEST UNIQUEMENT --------------------------------------------------------
//
// Valide les billets en attente dont le titre contient `marker`, comme le
// ferait un modérateur. Sert aux specs E2E qui publient sur la tribune pour
// tester AUTRE CHOSE (signalement, canonical…) : elles passent par la
// validation, sans rejouer l'écran de modération à chaque fois — ce parcours-là
// a sa propre spec (tests/e2e/communaute-tribune.spec.ts). internalMutation
// (hors API publique) ET garde AUTH_DEV_OTP, comme convex/devAdmin.ts.
export const devApprovePendingByTitle = internalMutation({
  args: { marker: v.string() },
  returns: v.object({ approved: v.number() }),
  handler: async (ctx, { marker }) => {
    if (process.env.AUTH_DEV_OTP !== 'true') {
      throw new Error('Désactivé (AUTH_DEV_OTP).');
    }
    if (marker.trim().length < 6) throw new Error('MARKER_TOO_SHORT');
    const pending = await ctx.db
      .query('tribunePosts')
      .withIndex('by_status', (q) => q.eq('status', 'pending'))
      .take(500);
    let approved = 0;
    for (const p of pending) {
      if (!p.title.includes(marker)) continue;
      await ctx.db.patch(p._id, {
        status: 'published',
        moderatedAt: Date.now(),
      });
      await onPostPublished(ctx, (await ctx.db.get(p._id))!, 'pending');
      await logModerationEvent(ctx, {
        targetType: 'post',
        targetId: p._id,
        postId: p._id,
        kind: 'approved',
        statusFrom: 'pending',
        statusTo: 'published',
        reason: 'dev',
      });
      approved++;
    }
    return { approved };
  },
});
