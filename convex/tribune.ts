import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query } from './_generated/server';
import type { Id, Doc } from './_generated/dataModel';
import { requireNetworkRole, requireUser } from './lib/rbac';
import { enforceRateLimit, RATE_LIMITS } from './lib/rateLimit';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { notify } from './lib/notify';
import { isNetworkTheme, networkThemeValidator } from './lib/themes';
import {
  trackTribunePostStatus,
  trackTribuneCommentStatus,
} from './lib/counters';

// Formes publiques de la Tribune. Les handlers projetaient déjà champ par
// champ ; les déclarer ici FIGE cette projection : le jour où l'un d'eux
// renverra `{ ...post }`, la query échouera au lieu de servir `authorUserId`,
// `status` et le corps intégral des billets retirés (issue #30).
const postSummaryValidator = v.object({
  _id: v.id('tribunePosts'),
  theme: v.string(),
  format: v.union(v.literal('court'), v.literal('fond')),
  title: v.string(),
  excerpt: v.string(),
  authorName: v.string(),
  commentCount: v.number(),
  createdAt: v.number(),
});

const postDetailValidator = v.object({
  _id: v.id('tribunePosts'),
  theme: v.string(),
  format: v.union(v.literal('court'), v.literal('fond')),
  title: v.string(),
  body: v.string(),
  authorName: v.string(),
  commentCount: v.number(),
  createdAt: v.number(),
  comments: v.array(
    v.object({
      _id: v.id('tribuneComments'),
      authorName: v.string(),
      body: v.string(),
      createdAt: v.number(),
    }),
  ),
});

// Tribune démocratique (F-44/F-47/F-50). Lecture publique, écriture membre,
// modération a posteriori par signalement. `theme` = un des 5 axes du réseau.

function authorName(user: Doc<'users'>): string {
  return user.name?.trim() || 'Membre';
}

// --- Écriture (membre et au-dessus) -----------------------------------------
export const createPost = mutation({
  args: {
    theme: v.string(),
    format: v.union(v.literal('court'), v.literal('fond')),
    title: v.string(),
    body: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const theme = args.theme.trim();
    const title = args.title.trim();
    const body = args.body.trim();
    if (!isNetworkTheme(theme)) throw new Error('INVALID_THEME');
    if (title.length < 4 || title.length > 160)
      throw new Error('INVALID_TITLE');
    const min = args.format === 'court' ? 10 : 200;
    if (body.length < min || body.length > 20000)
      throw new Error('INVALID_BODY');

    await enforceRateLimit(ctx, {
      key: `tribunePost:${user._id}`,
      ...RATE_LIMITS.tribunePost,
    });

    const postId = await ctx.db.insert('tribunePosts', {
      authorUserId: user._id,
      authorName: authorName(user),
      theme,
      format: args.format,
      title,
      body,
      status: 'published',
      commentCount: 0,
      createdAt: Date.now(),
    });
    await trackTribunePostStatus(ctx, null, 'published');
    return postId;
  },
});

export const addComment = mutation({
  args: { postId: v.id('tribunePosts'), body: v.string() },
  handler: async (ctx, { postId, body }) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const text = body.trim();
    if (text.length < 2 || text.length > 4000)
      throw new Error('INVALID_COMMENT');
    const post = await ctx.db.get(postId);
    if (!post || post.status !== 'published') throw new Error('NOT_FOUND');

    await enforceRateLimit(ctx, {
      key: `tribuneComment:${user._id}`,
      ...RATE_LIMITS.tribuneComment,
    });

    // Participants distincts AVANT insertion (auteurs des commentaires déjà
    // publiés sur ce fil). Sert à notifier les autres intervenants. F-25/F-51.
    const existingComments = await ctx.db
      .query('tribuneComments')
      .withIndex('by_post', (q) => q.eq('postId', postId))
      .collect();
    const participantIds = new Set<Id<'users'>>();
    for (const c of existingComments) {
      if (c.status === 'published') participantIds.add(c.authorUserId);
    }
    // Le nouveau commentateur ne se notifie jamais lui-même, et l'auteur du
    // post est notifié séparément (pas de doublon).
    participantIds.delete(user._id);
    participantIds.delete(post.authorUserId);

    await ctx.db.insert('tribuneComments', {
      postId,
      authorUserId: user._id,
      authorName: authorName(user),
      body: text,
      status: 'published',
      createdAt: Date.now(),
    });
    await ctx.db.patch(postId, { commentCount: post.commentCount + 1 });
    await trackTribuneCommentStatus(ctx, null, 'published');

    // Notifie l'auteur du post d'un nouveau commentaire (sauf le sien). F-25/F-51.
    if (post.authorUserId !== user._id) {
      await notify(ctx, {
        userId: post.authorUserId,
        type: 'tribune_comment',
        titleKey: 'tribuneComment',
        params: { title: post.title },
        link: `/tribune/${postId}`,
      });
    }

    // Notifie les autres participants du fil (hors auteur du post et hors
    // nouveau commentateur, déjà exclus du Set ci-dessus).
    for (const userId of participantIds) {
      await notify(ctx, {
        userId,
        type: 'tribune_thread',
        titleKey: 'tribuneThreadReply',
        params: { title: post.title },
        link: `/tribune/${postId}`,
      });
    }
    return { ok: true };
  },
});

// Réaction « soutien » (comme un like) — réservée aux membres. Une réaction par
// membre et par post : bascule (toggle). Renvoie l'état après bascule.
export const toggleReaction = mutation({
  args: { postId: v.id('tribunePosts') },
  handler: async (ctx, { postId }) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const post = await ctx.db.get(postId);
    if (!post || post.status !== 'published') throw new Error('NOT_FOUND');

    const existing = await ctx.db
      .query('tribuneReactions')
      .withIndex('by_post_and_user', (q) =>
        q.eq('postId', postId).eq('userId', user._id),
      )
      .unique();

    if (existing) {
      await ctx.db.delete(existing._id);
      return { reacted: false };
    }
    await ctx.db.insert('tribuneReactions', {
      postId,
      userId: user._id,
      createdAt: Date.now(),
    });
    return { reacted: true };
  },
});

// Signalement (F-50) — tout compte authentifié peut signaler.
export const reportContent = mutation({
  args: {
    targetType: v.union(v.literal('post'), v.literal('comment')),
    targetId: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, { targetType, targetId, reason }) => {
    const user = await requireUser(ctx);
    await enforceRateLimit(ctx, {
      key: `tribuneReport:${user._id}`,
      ...RATE_LIMITS.tribuneReport,
    });
    // La cible doit être un identifiant Convex de la BONNE table, et exister
    // (audit M1 / pentest H-2). Sans cette validation, n'importe quel compte
    // authentifié pouvait écrire une chaîne arbitraire ici : `listReports` la
    // relisait ensuite via ctx.db.get et la file de modération devenait
    // inaccessible à TOUS les modérateurs — sans moyen de résoudre le
    // signalement fautif, qui ne se résout que depuis cette même page.
    const table = targetType === 'post' ? 'tribunePosts' : 'tribuneComments';
    const normalized = ctx.db.normalizeId(table, targetId);
    if (!normalized || !(await ctx.db.get(normalized))) {
      throw new Error('INVALID_TARGET');
    }
    await ctx.db.insert('tribuneReports', {
      targetType,
      targetId: normalized,
      reason: reason?.trim() || undefined,
      reporterUserId: user._id,
      resolved: false,
      createdAt: Date.now(),
    });
    return { ok: true };
  },
});

// --- Lecture publique --------------------------------------------------------
export const listPosts = query({
  // `theme` est un domaine FERMÉ : le validateur le dit, plutôt que de laisser
  // passer n'importe quelle chaîne pour la filtrer ensuite dans le handler.
  // L'appelant (src/app/[locale]/tribune/page.tsx) assainit le paramètre d'URL
  // en amont, pour qu'un `?theme=` fantaisiste reste « pas de filtre » au lieu
  // de devenir une erreur d'argument sur une page publique.
  args: { theme: v.optional(networkThemeValidator) },
  returns: v.array(postSummaryValidator),
  handler: async (ctx, { theme }) => {
    const posts = theme
      ? await ctx.db
          .query('tribunePosts')
          .withIndex('by_status_and_theme', (q) =>
            q.eq('status', 'published').eq('theme', theme),
          )
          .collect()
      : await ctx.db
          .query('tribunePosts')
          .withIndex('by_status', (q) => q.eq('status', 'published'))
          .collect();
    return posts
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 100)
      .map((p) => ({
        _id: p._id,
        theme: p.theme,
        format: p.format,
        title: p.title,
        excerpt: p.body.length > 220 ? `${p.body.slice(0, 220)}…` : p.body,
        authorName: p.authorName,
        commentCount: p.commentCount,
        createdAt: p.createdAt,
      }));
  },
});

export const getPost = query({
  args: { postId: v.id('tribunePosts') },
  returns: v.union(postDetailValidator, v.null()),
  handler: async (ctx, { postId }) => {
    const post = await ctx.db.get(postId);
    if (!post || post.status !== 'published') return null;
    const comments = await ctx.db
      .query('tribuneComments')
      .withIndex('by_post', (q) => q.eq('postId', postId))
      .collect();
    return {
      _id: post._id,
      theme: post.theme,
      format: post.format,
      title: post.title,
      body: post.body,
      authorName: post.authorName,
      commentCount: post.commentCount,
      createdAt: post.createdAt,
      comments: comments
        .filter((c) => c.status === 'published')
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((c) => ({
          _id: c._id,
          authorName: c.authorName,
          body: c.body,
          createdAt: c.createdAt,
        })),
    };
  },
});

// État des réactions d'un post : décompte + si l'utilisateur courant a réagi.
// Lecture publique : `mine` vaut false pour un visiteur anonyme (pas de throw).
export const reactionState = query({
  args: { postId: v.id('tribunePosts') },
  returns: v.object({ count: v.number(), mine: v.boolean() }),
  handler: async (ctx, { postId }) => {
    const reactions = await ctx.db
      .query('tribuneReactions')
      .withIndex('by_post_and_user', (q) => q.eq('postId', postId))
      .collect();
    const userId = await getAuthUserId(ctx);
    const mine = userId ? reactions.some((r) => r.userId === userId) : false;
    return { count: reactions.length, mine };
  },
});

// --- Back-office : file de signalements (modérateur et au-dessus) -----------
const REPORTS_QUEUE_MAX = 200;

export const listReports = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('tribuneReports'),
      targetType: v.union(v.literal('post'), v.literal('comment')),
      reason: v.union(v.string(), v.null()),
      excerpt: v.string(),
      // `normalizeId` peut ne rien rendre (cible supprimée) : d'où le null.
      postId: v.union(v.id('tribunePosts'), v.null()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'moderateur');
    // File de TRAVAIL : l'index ne contient que les signalements NON résolus,
    // et résoudre retire la ligne de la file. Le plafond découvre donc la suite
    // au fur et à mesure du traitement, au lieu de faire grossir une lecture
    // sans limite (issue #8).
    const reports = await ctx.db
      .query('tribuneReports')
      .withIndex('by_resolved', (q) => q.eq('resolved', false))
      .order('desc')
      .take(REPORTS_QUEUE_MAX);

    // N+1 : la cible était relue signalement par signalement. Or le cas normal
    // est justement que PLUSIEURS signalements visent le MÊME contenu — dix
    // personnes signalent le même billet. On dédoublonne donc les cibles avant
    // de les lire, une fois chacune.
    //
    // `normalizeId` AVANT tout ctx.db.get : `targetId` est une colonne
    // `v.string()`, donc une ligne écrite avant le correctif (ou par une future
    // voie d'écriture) peut contenir n'importe quoi. Un cast aveugle y faisait
    // échouer la requête entière, condamnant la file pour tous les modérateurs
    // (audit M1). Une cible illisible est simplement affichée « (supprimé) » et
    // reste résolvable.
    const targetKey = (
      r: Pick<Doc<'tribuneReports'>, 'targetType' | 'targetId'>,
    ) => `${r.targetType}:${r.targetId}`;

    const uniqueTargets = new Map(
      reports.map((r) => [
        targetKey(r),
        { targetType: r.targetType, targetId: r.targetId },
      ]),
    );
    const targets = new Map<
      string,
      { excerpt: string; postId: Id<'tribunePosts'> | null }
    >();
    await Promise.all(
      [...uniqueTargets].map(async ([key, { targetType, targetId }]) => {
        if (targetType === 'post') {
          const id = ctx.db.normalizeId('tribunePosts', targetId);
          const p = id ? await ctx.db.get(id) : null;
          if (p) targets.set(key, { excerpt: p.title, postId: p._id });
        } else {
          const id = ctx.db.normalizeId('tribuneComments', targetId);
          const c = id ? await ctx.db.get(id) : null;
          if (c) {
            targets.set(key, {
              excerpt:
                c.body.length > 140 ? `${c.body.slice(0, 140)}…` : c.body,
              postId: c.postId,
            });
          }
        }
      }),
    );

    return reports.map((r) => {
      const target = targets.get(targetKey(r));
      return {
        _id: r._id,
        targetType: r.targetType,
        reason: r.reason ?? null,
        excerpt: target?.excerpt ?? '(supprimé)',
        postId: target?.postId ?? null,
        createdAt: r.createdAt,
      };
    });
  },
});

export const resolveReport = mutation({
  args: {
    reportId: v.id('tribuneReports'),
    action: v.union(v.literal('dismiss'), v.literal('remove')),
  },
  handler: async (ctx, { reportId, action }) => {
    const mod = await requireNetworkRole(ctx, 'moderateur');
    const report = await ctx.db.get(reportId);
    if (!report) throw new Error('NOT_FOUND');

    if (action === 'remove') {
      // Même précaution que dans `listReports` : la cible est normalisée avant
      // toute lecture. Sans cela, un signalement à la cible illisible ne
      // pouvait même pas être TRAITÉ (« retirer » levait), et restait donc
      // indéfiniment dans la file (audit M1).
      if (report.targetType === 'post') {
        const id = ctx.db.normalizeId('tribunePosts', report.targetId);
        const p = id ? await ctx.db.get(id) : null;
        if (p) {
          await ctx.db.patch(p._id, { status: 'removed' });
          await trackTribunePostStatus(ctx, p.status, 'removed');
        }
      } else {
        const id = ctx.db.normalizeId('tribuneComments', report.targetId);
        const c = id ? await ctx.db.get(id) : null;
        if (c) {
          await ctx.db.patch(c._id, { status: 'removed' });
          await trackTribuneCommentStatus(ctx, c.status, 'removed');
          const post = await ctx.db.get(c.postId);
          if (post && post.commentCount > 0) {
            await ctx.db.patch(post._id, {
              commentCount: post.commentCount - 1,
            });
          }
        }
      }
    }

    await ctx.db.patch(reportId, { resolved: true });
    await recordAudit(ctx, {
      actorId: mod._id,
      action: AUDIT.TRIBUNE_MODERATED,
      targetId: reportId,
      metadata: { action, targetType: report.targetType },
    });
    return { ok: true };
  },
});
