import { v, ConvexError } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Id, Doc } from './_generated/dataModel';
import { requireNetworkRole, requireUser } from './lib/rbac';
import { roleRank } from './lib/roles';
import { TRIBUNE_BODY, TRIBUNE_COMMENT, isEmail } from './lib/validation';
import { enforceRateLimit, RATE_LIMITS } from './lib/rateLimit';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { notify } from './lib/notify';
import { normalizeEmail } from './lib/onboarding';
import { isNetworkTheme, networkThemeValidator } from './lib/themes';
import { slugify } from './lib/slug';
import { locale } from './schema';
import { tribuneSearchText, yearOf } from './lib/searchText';
import {
  trackPublicationStatus,
  trackTribunePostStatus,
  trackTribuneCommentStatus,
} from './lib/counters';
import { contentStatusValidator, excerpt } from './lib/communaute';
import {
  loadCommunitySettings,
  logModerationEvent,
  scheduleTribuneAiReview,
} from './lib/moderationHistory';
import { loadSettings as loadAiSettings } from './aiModeration';
import { internal } from './_generated/api';

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
  // Contribution de fond qui prolonge un billet court (F-48).
  isDeepening: v.boolean(),
});

const linkedPostValidator = v.object({
  _id: v.id('tribunePosts'),
  title: v.string(),
  authorName: v.string(),
  createdAt: v.number(),
});

const postDetailValidator = v.object({
  _id: v.id('tribunePosts'),
  theme: v.string(),
  format: v.union(v.literal('court'), v.literal('fond')),
  title: v.string(),
  body: v.string(),
  // Langue de rédaction : la fiche en a besoin pour son canonical et pour
  // l'attribut `lang` de l'article (issue #35). Absente sur les billets
  // antérieurs au champ — le repli appartient à `resolveLocale`, côté Next.
  lang: v.optional(locale),
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
  // APPROFONDISSEMENT (F-48) — les deux contenus se renvoient l'un à l'autre,
  // publiquement : le billet court liste ses contributions de fond PUBLIÉES,
  // la contribution de fond nomme le billet qu'elle prolonge.
  parent: v.union(linkedPostValidator, v.null()),
  deepenings: v.array(linkedPostValidator),
});

// Tribune démocratique (F-44/F-47/F-50). Lecture publique, écriture membre.
// Modération A PRIORI par défaut (F-45, chantier communauté) : un billet soumis
// reste `pending`, invisible du public, jusqu'à la décision d'un modérateur
// (convex/communityModeration.ts). L'administrateur peut revenir à la
// modération a posteriori. `theme` = un des 5 axes du réseau.

function authorName(user: Doc<'users'>): string {
  return user.name?.trim() || 'Membre';
}

// --- Effets de la mise en ligne ----------------------------------------------
//
// Ce qu'entraîne la PARUTION d'un contenu, qu'elle vienne de la soumission (a
// posteriori), d'un modérateur ou de l'IA (a priori). Écrit une fois, appelé
// des trois chemins : les notifications et les compteurs ne suivent plus le
// geste de l'auteur, mais le moment où le public voit le contenu.

export async function onPostPublished(
  ctx: MutationCtx,
  post: Doc<'tribunePosts'>,
  from: Doc<'tribunePosts'>['status'] | null,
): Promise<void> {
  await trackTribunePostStatus(ctx, from, 'published');
  // Une contribution de fond paraît : l'auteur du billet qu'elle prolonge
  // l'apprend (sauf s'il en est lui-même l'auteur).
  if (post.parentPostId) {
    const parent = await ctx.db.get(post.parentPostId);
    if (parent && parent.authorUserId !== post.authorUserId) {
      await notify(ctx, {
        userId: parent.authorUserId,
        type: 'tribune_deepened',
        titleKey: 'tribuneDeepened',
        params: { title: parent.title },
        link: `/tribune/${post._id}`,
      });
    }
  }
}

export async function onCommentPublished(
  ctx: MutationCtx,
  comment: Doc<'tribuneComments'>,
  from: Doc<'tribuneComments'>['status'] | null,
): Promise<void> {
  const post = await ctx.db.get(comment.postId);
  await trackTribuneCommentStatus(ctx, from, 'published');
  if (!post) return;
  await ctx.db.patch(post._id, { commentCount: post.commentCount + 1 });

  // Participants distincts (auteurs des AUTRES commentaires publiés du fil).
  // Sert à notifier les autres intervenants. F-25/F-51.
  const existingComments = await ctx.db
    .query('tribuneComments')
    .withIndex('by_post', (q) => q.eq('postId', post._id))
    .take(1000);
  const participantIds = new Set<Id<'users'>>();
  for (const c of existingComments) {
    if (c.status === 'published' && c._id !== comment._id)
      participantIds.add(c.authorUserId);
  }
  // Le commentateur ne se notifie jamais lui-même, et l'auteur du post est
  // notifié séparément (pas de doublon).
  participantIds.delete(comment.authorUserId);
  participantIds.delete(post.authorUserId);

  if (post.authorUserId !== comment.authorUserId) {
    await notify(ctx, {
      userId: post.authorUserId,
      type: 'tribune_comment',
      titleKey: 'tribuneComment',
      params: { title: post.title },
      link: `/tribune/${post._id}`,
    });
  }
  for (const userId of participantIds) {
    await notify(ctx, {
      userId,
      type: 'tribune_thread',
      titleKey: 'tribuneThreadReply',
      params: { title: post.title },
      link: `/tribune/${post._id}`,
    });
  }
}

// Un membre peut-il ouvrir une contribution de fond sur ce billet ? Son
// auteur, ou un membre qu'il y a invité (invitation en cours).
async function canDeepen(
  ctx: QueryCtx,
  parent: Doc<'tribunePosts'>,
  user: Doc<'users'>,
): Promise<boolean> {
  if (parent.authorUserId === user._id) return true;
  const byUser = await ctx.db
    .query('tribuneDeepeningInvites')
    .withIndex('by_user', (q) => q.eq('invitedUserId', user._id))
    .take(200);
  if (byUser.some((i) => i.postId === parent._id && i.status === 'pending'))
    return true;
  if (!user.email) return false;
  const byEmail = await ctx.db
    .query('tribuneDeepeningInvites')
    .withIndex('by_email', (q) => q.eq('email', normalizeEmail(user.email!)))
    .take(200);
  return byEmail.some((i) => i.postId === parent._id && i.status === 'pending');
}

// Un billet court PUBLIÉ est le seul qu'on approfondit : une contribution de
// fond ne prolonge pas un texte que le public ne voit pas.
function isDeepenable(post: Doc<'tribunePosts'> | null): boolean {
  return !!post && post.status === 'published' && post.format === 'court';
}

// --- Écriture (membre et au-dessus) -----------------------------------------
export const createPost = mutation({
  args: {
    theme: v.string(),
    format: v.union(v.literal('court'), v.literal('fond')),
    title: v.string(),
    body: v.string(),
    // Déclarée par l'auteur (le composer la pré-remplit avec la langue de
    // l'interface, sans l'imposer : on écrit en anglais depuis une interface
    // française). Vocabulaire fermé : une valeur hors `locale` est refusée par
    // le validateur, jamais repliée en silence.
    lang: locale,
    // APPROFONDISSEMENT (F-48) : le billet court que cette contribution de
    // fond prolonge.
    parentPostId: v.optional(v.id('tribunePosts')),
  },
  returns: v.id('tribunePosts'),
  handler: async (ctx, args) => {
    const user = await requireNetworkRole(ctx, 'membre');
    let theme = args.theme.trim();
    const title = args.title.trim();
    const body = args.body.trim();

    if (args.parentPostId) {
      const parent = await ctx.db.get(args.parentPostId);
      if (!parent || !isDeepenable(parent)) {
        throw new ConvexError('NOT_DEEPENABLE');
      }
      if (!(await canDeepen(ctx, parent, user))) {
        throw new ConvexError('NOT_INVITED');
      }
      // Une contribution de fond est… de fond : format long (bornes F-46), et
      // sur l'axe du billet qu'elle prolonge.
      if (args.format !== 'fond') throw new ConvexError('DEEPENING_FORMAT');
      theme = parent.theme;
    }

    if (!isNetworkTheme(theme)) throw new Error('INVALID_THEME');
    if (title.length < 4 || title.length > 160)
      throw new Error('INVALID_TITLE');
    // Bornes PAR FORMAT (F-46, A-05) : une « Brève » n'a pas la longueur
    // d'une « Analyse ». `ConvexError` et non `Error` : le code traverse
    // jusqu'au navigateur (le message d'un `Error` nu est masqué en prod), et
    // le composer peut dire « trop long pour ce format » au lieu d'un échec
    // générique — c'est ce que 21 000 caractères produisaient le 27/09.
    const bounds = TRIBUNE_BODY[args.format];
    if (body.length < bounds.min) throw new ConvexError('INVALID_BODY');
    if (body.length > bounds.max) throw new ConvexError('BODY_TOO_LONG');

    await enforceRateLimit(ctx, {
      key: `tribunePost:${user._id}`,
      ...RATE_LIMITS.tribunePost,
    });

    const now = Date.now();
    const name = authorName(user);
    // A PRIORI (défaut) : en attente, invisible du public. A POSTERIORI :
    // publié aussitôt, modéré sur signalement.
    const { postMode } = await loadCommunitySettings(ctx);
    const status: 'pending' | 'published' =
      postMode === 'a_priori' ? 'pending' : 'published';

    const postId = await ctx.db.insert('tribunePosts', {
      authorUserId: user._id,
      authorName: name,
      theme,
      format: args.format,
      title,
      body,
      lang: args.lang,
      status,
      commentCount: 0,
      createdAt: now,
      // Recherche globale (chantier diffusion) : meule tenue à l'écriture.
      searchText: tribuneSearchText({ title, body, authorName: name }),
      searchYear: yearOf(now),
      ...(args.parentPostId ? { parentPostId: args.parentPostId } : {}),
    });
    await logModerationEvent(ctx, {
      targetType: 'post',
      targetId: postId,
      postId,
      kind: 'submitted',
      actorId: user._id,
      statusTo: status,
    });
    if (status === 'published') {
      const post = await ctx.db.get(postId);
      if (post) await onPostPublished(ctx, post, null);
    }
    await scheduleTribuneAiReview(ctx, 'post', postId);
    return postId;
  },
});

// Modifier SON billet tant qu'il n'est pas en ligne : en attente (correction
// avant décision) ou rejeté (reprise après motif). Un billet rejeté puis
// corrigé repart en file — c'est une nouvelle soumission, qu'un humain relit.
// L'historique garde la trace de la modification.
export const updatePost = mutation({
  args: {
    postId: v.id('tribunePosts'),
    title: v.string(),
    body: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const post = await ctx.db.get(args.postId);
    if (!post || post.authorUserId !== user._id) {
      throw new ConvexError('NOT_FOUND');
    }
    if (post.status !== 'pending' && post.status !== 'rejected') {
      throw new ConvexError('NOT_EDITABLE');
    }
    const title = args.title.trim();
    const body = args.body.trim();
    if (title.length < 4 || title.length > 160)
      throw new ConvexError('INVALID_TITLE');
    const bounds = TRIBUNE_BODY[post.format];
    if (body.length < bounds.min) throw new ConvexError('INVALID_BODY');
    if (body.length > bounds.max) throw new ConvexError('BODY_TOO_LONG');
    await enforceRateLimit(ctx, {
      key: `tribuneEdit:${user._id}`,
      ...RATE_LIMITS.tribuneEdit,
    });

    await ctx.db.patch(post._id, {
      title,
      body,
      // La meule de recherche suit le texte (chantier diffusion) : un billet
      // corrigé puis validé doit se trouver par ses NOUVEAUX mots.
      searchText: tribuneSearchText({
        title,
        body,
        authorName: post.authorName,
      }),
      status: 'pending',
      updatedAt: Date.now(),
      rejectionReason: undefined,
      aiReview: undefined,
    });
    await logModerationEvent(ctx, {
      targetType: 'post',
      targetId: post._id,
      postId: post._id,
      kind: 'edited',
      actorId: user._id,
      statusFrom: post.status,
      statusTo: 'pending',
    });
    await scheduleTribuneAiReview(ctx, 'post', post._id);
    return null;
  },
});

export const addComment = mutation({
  args: { postId: v.id('tribunePosts'), body: v.string() },
  // `status` dit à l'écran si le commentaire est en ligne ou en attente de
  // modération (mode a priori des commentaires).
  returns: v.object({
    ok: v.boolean(),
    status: v.union(v.literal('published'), v.literal('pending')),
  }),
  handler: async (ctx, { postId, body }) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const text = body.trim();
    // `ConvexError` : le refus (« 1 caractère », « 4 001 caractères ») était
    // avalé par le formulaire faute de code lisible côté client (A-06).
    if (text.length < TRIBUNE_COMMENT.min || text.length > TRIBUNE_COMMENT.max)
      throw new ConvexError('INVALID_COMMENT');
    const post = await ctx.db.get(postId);
    if (!post || post.status !== 'published') throw new Error('NOT_FOUND');

    await enforceRateLimit(ctx, {
      key: `tribuneComment:${user._id}`,
      ...RATE_LIMITS.tribuneComment,
    });

    const { commentMode } = await loadCommunitySettings(ctx);
    const status: 'pending' | 'published' =
      commentMode === 'a_priori' ? 'pending' : 'published';

    const commentId = await ctx.db.insert('tribuneComments', {
      postId,
      authorUserId: user._id,
      authorName: authorName(user),
      body: text,
      status,
      createdAt: Date.now(),
    });
    await logModerationEvent(ctx, {
      targetType: 'comment',
      targetId: commentId,
      postId,
      kind: 'submitted',
      actorId: user._id,
      statusTo: status,
    });
    if (status === 'published') {
      const comment = await ctx.db.get(commentId);
      if (comment) await onCommentPublished(ctx, comment, null);
    }
    await scheduleTribuneAiReview(ctx, 'comment', commentId);
    return { ok: true, status };
  },
});

// Réaction « soutien » (comme un like) — réservée aux membres. Une réaction par
// membre et par post : bascule (toggle). Renvoie l'état après bascule.
export const toggleReaction = mutation({
  args: { postId: v.id('tribunePosts') },
  returns: v.object({ reacted: v.boolean() }),
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
  returns: v.object({ ok: v.boolean() }),
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
    let postId: Id<'tribunePosts'> | undefined;
    let normalized: string;
    if (targetType === 'post') {
      const id = ctx.db.normalizeId('tribunePosts', targetId);
      if (!id || !(await ctx.db.get(id))) throw new Error('INVALID_TARGET');
      normalized = id;
      postId = id;
    } else {
      const id = ctx.db.normalizeId('tribuneComments', targetId);
      const c = id ? await ctx.db.get(id) : null;
      if (!id || !c) throw new Error('INVALID_TARGET');
      normalized = id;
      postId = c.postId;
    }
    // Un signalement OUVERT par personne et par cible : rechargeant la page,
    // le même compte pouvait signaler le même billet à volonté, et la file
    // des modérateurs se remplissait de doublons (mesuré le 27/09). Le second
    // appel est idempotent — l'écran dit « signalé » dans les deux cas.
    const existing = await ctx.db
      .query('tribuneReports')
      .withIndex('by_target', (q) => q.eq('targetId', normalized))
      .filter((q) =>
        q.and(
          q.eq(q.field('resolved'), false),
          q.eq(q.field('reporterUserId'), user._id),
        ),
      )
      .first();
    if (existing) return { ok: true } as const;
    const cleanReason = reason?.trim().slice(0, 1000) || undefined;
    await ctx.db.insert('tribuneReports', {
      targetType,
      targetId: normalized,
      reason: cleanReason,
      reporterUserId: user._id,
      resolved: false,
      createdAt: Date.now(),
    });
    // Le signalement entre dans l'HISTORIQUE du contenu (F-49).
    await logModerationEvent(ctx, {
      targetType,
      targetId: normalized,
      postId,
      kind: 'reported',
      actorId: user._id,
      ...(cleanReason ? { reason: cleanReason } : {}),
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
    // SEULS les billets `published` : un billet en attente, rejeté ou retiré
    // n'existe pas pour le public.
    const posts = theme
      ? await ctx.db
          .query('tribunePosts')
          .withIndex('by_status_and_theme', (q) =>
            q.eq('status', 'published').eq('theme', theme),
          )
          .order('desc')
          .take(100)
      : await ctx.db
          .query('tribunePosts')
          .withIndex('by_status', (q) => q.eq('status', 'published'))
          .order('desc')
          .take(100);
    return posts
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((p) => ({
        _id: p._id,
        theme: p.theme,
        format: p.format,
        title: p.title,
        excerpt: p.body.length > 220 ? `${p.body.slice(0, 220)}…` : p.body,
        authorName: p.authorName,
        commentCount: p.commentCount,
        createdAt: p.createdAt,
        isDeepening: p.parentPostId !== undefined,
      }));
  },
});

function linked(p: Doc<'tribunePosts'>) {
  return {
    _id: p._id,
    title: p.title,
    authorName: p.authorName,
    createdAt: p.createdAt,
  };
}

export const getPost = query({
  args: { postId: v.id('tribunePosts') },
  returns: v.union(postDetailValidator, v.null()),
  handler: async (ctx, { postId }) => {
    const post = await ctx.db.get(postId);
    if (!post || post.status !== 'published') return null;
    const comments = await ctx.db
      .query('tribuneComments')
      .withIndex('by_post', (q) => q.eq('postId', postId))
      .take(1000);
    const parent = post.parentPostId
      ? await ctx.db.get(post.parentPostId)
      : null;
    const deepenings = await ctx.db
      .query('tribunePosts')
      .withIndex('by_parent_and_status', (q) =>
        q.eq('parentPostId', postId).eq('status', 'published'),
      )
      .take(20);
    return {
      _id: post._id,
      theme: post.theme,
      format: post.format,
      title: post.title,
      body: post.body,
      lang: post.lang,
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
      // Le lien vers le billet court n'est servi que s'il est lui-même en
      // ligne : un billet retiré ne se découvre pas par ses contributions.
      parent: parent && parent.status === 'published' ? linked(parent) : null,
      deepenings: deepenings
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(linked),
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
      .take(5000);
    const userId = await getAuthUserId(ctx);
    const mine = userId ? reactions.some((r) => r.userId === userId) : false;
    return { count: reactions.length, mine };
  },
});

// Réglage de modération en vigueur, pour que l'écran dise AVANT l'envoi ce
// qui arrivera (« soumis à validation » ou « publié aussitôt »). Public : ce
// n'est pas un secret, c'est une règle du lieu.
export const moderationPolicy = query({
  args: {},
  returns: v.object({
    postMode: v.union(v.literal('a_priori'), v.literal('a_posteriori')),
    commentMode: v.union(v.literal('a_priori'), v.literal('a_posteriori')),
  }),
  handler: async (ctx) => await loadCommunitySettings(ctx),
});

// --- Mes billets (auteur) ----------------------------------------------------
// Un membre voit l'ÉTAT de ses propres contributions (F-45) : en attente,
// publiée, rejetée (avec le motif), retirée. Le corps n'est pas rendu ici :
// la liste dit l'état ; l'aperçu intégral passe par `getOwnPost`.
// Un visiteur anonyme reçoit une liste vide, pas une erreur : la query est
// montée sur une page publique.
const MY_POSTS_MAX = 50;

const myPostValidator = v.object({
  _id: v.id('tribunePosts'),
  theme: v.string(),
  format: v.union(v.literal('court'), v.literal('fond')),
  title: v.string(),
  status: contentStatusValidator,
  rejectionReason: v.union(v.string(), v.null()),
  parentPostId: v.union(v.id('tribunePosts'), v.null()),
  libraryPublicationId: v.union(v.id('publications'), v.null()),
  commentCount: v.number(),
  createdAt: v.number(),
});

export const myPosts = query({
  args: {},
  returns: v.array(myPostValidator),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const posts = await ctx.db
      .query('tribunePosts')
      .withIndex('by_author', (q) => q.eq('authorUserId', userId))
      .order('desc')
      .take(MY_POSTS_MAX);
    return posts
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((p) => ({
        _id: p._id,
        theme: p.theme,
        format: p.format,
        title: p.title,
        status: p.status,
        // Le motif d'un REJET est dû à l'auteur ; celui d'un retrait aussi.
        rejectionReason: p.rejectionReason ?? null,
        parentPostId: p.parentPostId ?? null,
        libraryPublicationId: p.libraryPublicationId ?? null,
        commentCount: p.commentCount,
        createdAt: p.createdAt,
      }));
  },
});

// Aperçu d'UN de ses billets, quel que soit son état — c'est ainsi que
// l'auteur relit un texte en attente ou rejeté, que la page publique ne sert
// pas. Tout autre compte reçoit `null`.
export const getOwnPost = query({
  args: { postId: v.string() },
  returns: v.union(
    v.object({
      _id: v.id('tribunePosts'),
      theme: v.string(),
      format: v.union(v.literal('court'), v.literal('fond')),
      title: v.string(),
      body: v.string(),
      status: contentStatusValidator,
      rejectionReason: v.union(v.string(), v.null()),
      parent: v.union(linkedPostValidator, v.null()),
      createdAt: v.number(),
      updatedAt: v.union(v.number(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const id = ctx.db.normalizeId('tribunePosts', args.postId);
    const post = id ? await ctx.db.get(id) : null;
    if (!post || post.authorUserId !== userId) return null;
    const parent = post.parentPostId
      ? await ctx.db.get(post.parentPostId)
      : null;
    return {
      _id: post._id,
      theme: post.theme,
      format: post.format,
      title: post.title,
      body: post.body,
      status: post.status,
      rejectionReason: post.rejectionReason ?? null,
      parent: parent ? linked(parent) : null,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt ?? null,
    };
  },
});

// Mes commentaires, avec leur état (utile en mode a priori des
// commentaires, et pour lire le motif d'un rejet).
export const myComments = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('tribuneComments'),
      postId: v.id('tribunePosts'),
      postTitle: v.string(),
      excerpt: v.string(),
      status: contentStatusValidator,
      rejectionReason: v.union(v.string(), v.null()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const comments = await ctx.db
      .query('tribuneComments')
      .withIndex('by_author', (q) => q.eq('authorUserId', userId))
      .order('desc')
      .take(MY_POSTS_MAX);
    const out = [];
    for (const c of comments) {
      const post = await ctx.db.get(c.postId);
      if (!post) continue;
      out.push({
        _id: c._id,
        postId: c.postId,
        postTitle: post.title,
        excerpt: excerpt(c.body, 160),
        status: c.status,
        rejectionReason: c.rejectionReason ?? null,
        createdAt: c.createdAt,
      });
    }
    return out;
  },
});

// --- Approfondissement (F-48) -------------------------------------------------

// Ce que l'utilisateur courant peut faire autour d'un billet publié :
// l'approfondir (auteur ou invité), inviter (auteur d'un billet court), le
// proposer à la bibliothèque (auteur d'une contribution de fond). Anonyme :
// rien, sans erreur — la query est montée sur une page publique.
export const deepeningState = query({
  args: { postId: v.id('tribunePosts') },
  returns: v.object({
    canDeepen: v.boolean(),
    isAuthor: v.boolean(),
    invites: v.array(
      v.object({ _id: v.id('tribuneDeepeningInvites'), email: v.string() }),
    ),
    canProposeToLibrary: v.boolean(),
    proposedToLibrary: v.boolean(),
  }),
  handler: async (ctx, { postId }) => {
    const none = {
      canDeepen: false,
      isAuthor: false,
      invites: [],
      canProposeToLibrary: false,
      proposedToLibrary: false,
    };
    const userId = await getAuthUserId(ctx);
    if (!userId) return none;
    const user = await ctx.db.get(userId);
    const post = await ctx.db.get(postId);
    if (!user || !post || post.status !== 'published') return none;
    if (roleRank(user.role) < roleRank('membre')) return none;
    const isAuthor = post.authorUserId === user._id;
    const invites = isAuthor
      ? (
          await ctx.db
            .query('tribuneDeepeningInvites')
            .withIndex('by_post', (q) => q.eq('postId', postId))
            .take(100)
        )
          .filter((i) => i.status === 'pending')
          .map((i) => ({ _id: i._id, email: i.email }))
      : [];
    return {
      canDeepen: isDeepenable(post) && (await canDeepen(ctx, post, user)),
      isAuthor,
      invites,
      canProposeToLibrary:
        isAuthor && post.format === 'fond' && !post.libraryPublicationId,
      proposedToLibrary: !!post.libraryPublicationId,
    };
  },
});

// L'auteur d'un billet court invite un membre du réseau à le prolonger. Même
// règle que les invitations d'espace : désigné par son adresse, réponse
// identique qu'un compte existe ou non (pas d'oracle d'existence).
export const inviteDeepening = mutation({
  args: { postId: v.id('tribunePosts'), email: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { postId, email: raw }) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const post = await ctx.db.get(postId);
    if (!post || post.authorUserId !== user._id) {
      throw new ConvexError('NOT_FOUND');
    }
    if (!isDeepenable(post)) throw new ConvexError('NOT_DEEPENABLE');
    if (!isEmail(raw)) throw new ConvexError('INVALID_EMAIL');
    const email = normalizeEmail(raw);
    if (user.email && normalizeEmail(user.email) === email) {
      throw new ConvexError('INVALID_INVITEE');
    }
    await enforceRateLimit(ctx, {
      key: `deepeningInvite:${user._id}`,
      ...RATE_LIMITS.deepeningInvite,
    });
    const already = (
      await ctx.db
        .query('tribuneDeepeningInvites')
        .withIndex('by_post', (q) => q.eq('postId', postId))
        .take(100)
    ).find((i) => i.email === email && i.status === 'pending');
    if (already) return { ok: true };

    const invitee = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', email))
      .first();
    const invitedUserId =
      invitee && roleRank(invitee.role) >= roleRank('membre')
        ? invitee._id
        : undefined;
    await ctx.db.insert('tribuneDeepeningInvites', {
      postId,
      email,
      ...(invitedUserId ? { invitedUserId } : {}),
      invitedBy: user._id,
      status: 'pending',
      createdAt: Date.now(),
    });
    if (invitedUserId) {
      await notify(ctx, {
        userId: invitedUserId,
        type: 'tribune_deepening_invite',
        titleKey: 'tribuneDeepeningInvite',
        params: { title: post.title, name: authorName(user) },
        link: `/tribune/${postId}`,
      });
    }
    return { ok: true };
  },
});

export const revokeDeepeningInvite = mutation({
  args: { inviteId: v.id('tribuneDeepeningInvites') },
  returns: v.null(),
  handler: async (ctx, { inviteId }) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const invite = await ctx.db.get(inviteId);
    if (!invite || invite.invitedBy !== user._id) {
      throw new ConvexError('NOT_FOUND');
    }
    await ctx.db.patch(inviteId, { status: 'revoked' });
    return null;
  },
});

// Invitations à approfondir reçues par l'utilisateur courant.
export const myDeepeningInvites = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id('tribuneDeepeningInvites'),
      postId: v.id('tribunePosts'),
      postTitle: v.string(),
      authorName: v.string(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (!user) return [];
    const byUser = await ctx.db
      .query('tribuneDeepeningInvites')
      .withIndex('by_user', (q) => q.eq('invitedUserId', user._id))
      .take(100);
    const byEmail = user.email
      ? await ctx.db
          .query('tribuneDeepeningInvites')
          .withIndex('by_email', (q) =>
            q.eq('email', normalizeEmail(user.email!)),
          )
          .take(100)
      : [];
    const seen = new Set<string>();
    const out = [];
    for (const i of [...byUser, ...byEmail]) {
      if (seen.has(i._id) || i.status !== 'pending') continue;
      seen.add(i._id);
      const post = await ctx.db.get(i.postId);
      if (!isDeepenable(post) || !post) continue;
      out.push({
        _id: i._id,
        postId: post._id,
        postTitle: post.title,
        authorName: post.authorName,
        createdAt: i.createdAt,
      });
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  },
});

// Proposer sa contribution de fond PUBLIÉE à la bibliothèque (F-48 → F-32).
//
// Le modèle existant le permet simplement : une publication naît `pending`,
// dans la file de /admin/publications, où la modération éditoriale (et son
// pré-tri par l'IA) décide comme pour tout dépôt. Rien n'est publié ici. Les
// métadonnées que la Tribune ne connaît pas prennent la valeur la plus neutre
// — type `note`, région `mondial`, accès libre — et le modérateur les ajuste.
export const proposeToLibrary = mutation({
  args: { postId: v.id('tribunePosts') },
  returns: v.id('publications'),
  handler: async (ctx, { postId }) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const post = await ctx.db.get(postId);
    if (!post || post.authorUserId !== user._id) {
      throw new ConvexError('NOT_FOUND');
    }
    if (post.status !== 'published' || post.format !== 'fond') {
      throw new ConvexError('NOT_ELIGIBLE');
    }
    if (post.libraryPublicationId) throw new ConvexError('ALREADY_PROPOSED');
    await enforceRateLimit(ctx, {
      key: `pub:${user._id}`,
      ...RATE_LIMITS.publicationSubmit,
    });

    const paragraphs = post.body
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);
    const abstract = excerpt(post.body, 600);

    const root = slugify(post.title);
    let slug = root;
    let n = 2;
    while (
      await ctx.db
        .query('publications')
        .withIndex('by_slug', (q) => q.eq('slug', slug))
        .first()
    ) {
      slug = `${root}-${n++}`;
    }
    const now = Date.now();
    const pubId = await ctx.db.insert('publications', {
      title: post.title,
      slug,
      type: 'note',
      theme: post.theme,
      region: 'mondial',
      languages: [post.lang ?? 'fr'],
      access: 'open',
      authors: [{ name: post.authorName }],
      year: new Date(now).getUTCFullYear(),
      publishedAt: 0,
      abstract,
      keypoints: [],
      body: paragraphs,
      doi: '',
      downloads: 0,
      citations: 0,
      views: 0,
      status: 'pending',
      authorUserId: user._id,
      submittedAt: now,
      createdAt: now,
    });
    await trackPublicationStatus(ctx, null, 'pending');
    await ctx.db.patch(post._id, { libraryPublicationId: pubId });
    await recordAudit(ctx, {
      actorId: user._id,
      action: AUDIT.PUBLICATION_SUBMITTED,
      targetId: pubId,
      metadata: { type: 'note', theme: post.theme, fromTribunePost: post._id },
    });
    // Même pré-tri que tout dépôt de la bibliothèque (convex/aiModeration.ts).
    const ai = await loadAiSettings(ctx);
    if (ai.mode !== 'off') {
      await ctx.scheduler.runAfter(0, internal.aiModeration.runReview, {
        publicationId: pubId,
      });
    }
    return pubId;
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
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { reportId, action }) => {
    const mod = await requireNetworkRole(ctx, 'moderateur');
    const report = await ctx.db.get(reportId);
    if (!report) throw new Error('NOT_FOUND');

    let postId: Id<'tribunePosts'> | undefined;
    if (action === 'remove') {
      // Même précaution que dans `listReports` : la cible est normalisée avant
      // toute lecture. Sans cela, un signalement à la cible illisible ne
      // pouvait même pas être TRAITÉ (« retirer » levait), et restait donc
      // indéfiniment dans la file (audit M1).
      if (report.targetType === 'post') {
        const id = ctx.db.normalizeId('tribunePosts', report.targetId);
        const p = id ? await ctx.db.get(id) : null;
        if (p) {
          postId = p._id;
          if (p.status !== 'removed') {
            await ctx.db.patch(p._id, {
              status: 'removed',
              moderatedBy: mod._id,
              moderatedAt: Date.now(),
            });
            await trackTribunePostStatus(ctx, p.status, 'removed');
            await logModerationEvent(ctx, {
              targetType: 'post',
              targetId: p._id,
              postId: p._id,
              kind: 'removed',
              actorId: mod._id,
              statusFrom: p.status,
              statusTo: 'removed',
            });
          }
        }
      } else {
        const id = ctx.db.normalizeId('tribuneComments', report.targetId);
        const c = id ? await ctx.db.get(id) : null;
        if (c) {
          postId = c.postId;
          if (c.status !== 'removed') {
            await ctx.db.patch(c._id, {
              status: 'removed',
              moderatedBy: mod._id,
              moderatedAt: Date.now(),
            });
            await trackTribuneCommentStatus(ctx, c.status, 'removed');
            const post = await ctx.db.get(c.postId);
            if (c.status === 'published' && post && post.commentCount > 0) {
              await ctx.db.patch(post._id, {
                commentCount: post.commentCount - 1,
              });
            }
            await logModerationEvent(ctx, {
              targetType: 'comment',
              targetId: c._id,
              postId: c.postId,
              kind: 'removed',
              actorId: mod._id,
              statusFrom: c.status,
              statusTo: 'removed',
            });
          }
        }
      }
    } else {
      await logModerationEvent(ctx, {
        targetType: report.targetType,
        targetId: report.targetId,
        kind: 'reports_dismissed',
        actorId: mod._id,
      });
    }

    await ctx.db.patch(reportId, { resolved: true });
    await recordAudit(ctx, {
      actorId: mod._id,
      action: AUDIT.TRIBUNE_MODERATED,
      targetId: reportId,
      metadata: { action, targetType: report.targetType, postId },
    });
    return { ok: true };
  },
});
