import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import { getAuthUserId } from '@convex-dev/auth/server';
import { query, mutation, type QueryCtx } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { requireNetworkRole, getCurrentUser, rank } from './lib/rbac';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { notify } from './lib/notify';
import { assertTransition, type ReviewMachine } from './lib/reviewState';
import { aiModerationApplied, aiModerationVerdict } from './lib/aiModeration';
import {
  enforceRateLimit,
  consumePublicationViewQuota,
  RATE_LIMITS,
} from './lib/rateLimit';
import { trackPublicationStatus } from './lib/counters';
import { clampPageSize, paginatedValidator } from './lib/pagination';
import { normalizeSearchTerm } from './lib/search';
import {
  matchesPublication,
  sortPublications,
  computePublicationFacets,
  slugify,
  PUB_SORTS,
  PUB_TYPES,
  PUB_THEMES,
  PUB_REGIONS,
  PUB_LANGS,
  PUB_ACCESS,
  projectPublication,
  isPublicationLocked,
  publicPublicationValidator,
  publicationFacetsValidator,
  type PubSort,
} from './lib/publications';

// Le lecteur a-t-il les droits « membre » (adhésion validée) ? Sert au gating des
// publications `access: 'members'` (F-35). Un compte authentifié SANS adhésion
// validée vaut « visiteur » et reste donc verrouillé.
async function viewerIsMember(ctx: QueryCtx): Promise<boolean> {
  const user = await getCurrentUser(ctx);
  return rank(user?.role) >= rank('membre');
}

// Total de consultations d'une publication (F-37). Somme des deux sources
// DISJOINTES : `publications.views` (héritage — vues comptées avant l'isolement
// du compteur, valeurs de démonstration posées par devAdmin) et la ligne
// `publicationViews` (tout ce qui est compté depuis). Aucune vue perdue, aucune
// comptée deux fois : plus rien n'écrit `publications.views` en production.
async function totalViews(ctx: QueryCtx, pub: Doc<'publications'>) {
  const row = await ctx.db
    .query('publicationViews')
    .withIndex('by_publication', (q) => q.eq('publicationId', pub._id))
    .unique();
  return (pub.views ?? 0) + (row?.count ?? 0);
}

// Bibliothèque publique (F-32/F-33) : liste filtrée + facettes calculées sur
// l'ensemble des publications *publiées* (pour ne proposer que des filtres
// utiles). Rendu côté serveur, filtres dans l'URL -> SEO + faible débit
// (F-05/F-07). Aucune publication draft/pending n'est jamais exposée ici.
const sortValidator = v.optional(
  v.union(...PUB_SORTS.map((s) => v.literal(s))),
);

// Validators de vocabulaire (slugs neutres) — réutilisés par le dépôt membre.
const typeValidator = v.union(...PUB_TYPES.map((t) => v.literal(t)));
const themeValidator = v.union(...PUB_THEMES.map((t) => v.literal(t)));
const regionValidator = v.union(...PUB_REGIONS.map((r) => v.literal(r)));
const langValidator = v.union(...PUB_LANGS.map((l) => v.literal(l)));
const accessValidator = v.union(...PUB_ACCESS.map((a) => v.literal(a)));

export const listPublished = query({
  args: {
    themes: v.optional(v.array(v.string())),
    types: v.optional(v.array(v.string())),
    regions: v.optional(v.array(v.string())),
    langs: v.optional(v.array(v.string())),
    access: v.optional(v.array(v.string())),
    q: v.optional(v.string()),
    sort: sortValidator,
  },
  // Validateur de RETOUR : décrit ce qui sort, et rien d'autre ne peut sortir.
  // Convex ÉCHOUE la query si le handler renvoie un champ non déclaré — la
  // fuite devient une panne visible plutôt qu'une donnée servie en silence.
  returns: v.object({
    items: v.array(publicPublicationValidator),
    facets: publicationFacetsValidator,
    total: v.number(),
  }),
  handler: async (ctx, { sort, ...filters }) => {
    const published = await ctx.db
      .query('publications')
      .withIndex('by_status', (qi) => qi.eq('status', 'published'))
      .collect();
    const isMember = await viewerIsMember(ctx);
    const items = sortPublications(
      published.filter((p) => matchesPublication(p, filters)),
      (sort as PubSort) ?? 'recent',
    ).map((p) => projectPublication(p, null, isMember));
    return {
      items,
      // Les facettes comptent TOUTES les publiées, réservées comprises : le
      // gating masque le contenu, pas l'existence (découvrabilité, F-35).
      facets: computePublicationFacets(published, filters),
      total: published.length,
    };
  },
});

// Détail publication (F-34) — publique : ne renvoie QUE les publications
// publiées. Le filtrage de statut vit dans la query (et non chez l'appelant)
// pour qu'aucun consommateur ne puisse exposer un brouillon / une soumission.
export const getBySlug = query({
  args: { slug: v.string() },
  returns: v.union(publicPublicationValidator, v.null()),
  handler: async (ctx, { slug }) => {
    const pub = await ctx.db
      .query('publications')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (!pub || pub.status !== 'published') return null;
    // Gating « réservé aux membres » (F-35). L'URL signée n'est même pas
    // GÉNÉRÉE quand la publication est verrouillée : rien à fuiter.
    const isMember = await viewerIsMember(ctx);
    const locked = isPublicationLocked(pub.access, isMember);
    const fileUrl =
      !locked && pub.fileId ? await ctx.storage.getUrl(pub.fileId) : null;
    // Le décompte de consultations (F-37) vient de la ligne agrégée, pas du
    // document : c'est la seule query qui l'affiche, donc la seule à payer
    // cette lecture supplémentaire.
    return projectPublication(
      pub,
      fileUrl,
      isMember,
      await totalViews(ctx, pub),
    );
  },
});

// Compteur de consultations (F-37) — mutation PUBLIQUE, sans authentification.
// No-op si la publication n'existe pas ou n'est pas publiée (on n'expose ni ne
// compte les brouillons / soumissions). La déduplication par session vit côté
// client (sessionStorage).
//
// DEUX CORRECTIFS (issue #8) :
//
//  1. PLAFOND. Endpoint public non authentifié, sans aucun quota : le compteur
//     se gonflait avec une boucle `for`. Le quota est posé sur (bloc d'adresses,
//     publication) — la seule clé non forgeable ici (cf. lib/rateLimit.ts).
//     Dépasser le quota n'est PAS une erreur remontée à la page : la
//     consultation n'est simplement pas comptée. Le quota est consommé AVANT de
//     lire la publication, pour qu'un martèlement sur des slugs inconnus ne soit
//     pas gratuit non plus.
//
//  2. CONTENTION. L'incrément patchait le document de la publication — celui
//     que lisent la bibliothèque, le détail et le bloc « même thématique ».
//     Chaque visite invalidait donc tous ces abonnements, et la publication la
//     plus lue entrait en concurrence d'écriture avec elle-même (OCC). Le
//     décompte vit maintenant dans une ligne dédiée, lue seulement par
//     `getBySlug`.
export const recordPublicationView = mutation({
  args: { slug: v.string() },
  returns: v.null(),
  handler: async (ctx, { slug }) => {
    if (!(await consumePublicationViewQuota(ctx, slug))) return null;

    const pub = await ctx.db
      .query('publications')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (!pub || pub.status !== 'published') return null;

    const row = await ctx.db
      .query('publicationViews')
      .withIndex('by_publication', (q) => q.eq('publicationId', pub._id))
      .unique();
    if (row) {
      await ctx.db.patch(row._id, { count: row.count + 1 });
    } else {
      await ctx.db.insert('publicationViews', {
        publicationId: pub._id,
        count: 1,
      });
    }
    return null;
  },
});

// Publications liées (même thématique) — pour le bloc « Dans la même
// thématique » du détail. Exclut la publication courante, bornée à `limit`.
export const relatedByTheme = query({
  args: {
    // PAS de resserrement ici : `publications.theme` est `v.string()` au schéma
    // (des publications de seed portent des thèmes hors vocabulaire), et
    // l'appelant passe le thème d'une publication existante. Un union ferait
    // échouer le bloc « dans la même thématique » sur ces publications-là.
    theme: v.string(),
    excludeSlug: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(publicPublicationValidator),
  handler: async (ctx, { theme, excludeSlug, limit }) => {
    const sameTheme = await ctx.db
      .query('publications')
      .withIndex('by_status_and_theme', (q) =>
        q.eq('status', 'published').eq('theme', theme),
      )
      .collect();
    const isMember = await viewerIsMember(ctx);
    return sortPublications(
      sameTheme.filter((p) => p.slug !== excludeSlug),
      'recent',
    )
      .slice(0, limit ?? 3)
      .map((p) => projectPublication(p, null, isMember));
  },
});

// --- Dépôt documentaire (F-32) : workflow membre -> modérateur ---------------

// URL de téléversement à usage unique pour le document (PDF, jeu de données…).
// Authentifié : seul un membre connecté peut obtenir une URL d'upload.
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await requireNetworkRole(ctx, 'membre');
    await enforceRateLimit(ctx, {
      key: `upload:${user._id}`,
      ...RATE_LIMITS.upload,
    });
    return await ctx.storage.generateUploadUrl();
  },
});

const authorValidator = v.object({
  name: v.string(),
  role: v.optional(v.string()),
});

// Bornes serveur du fichier téléversé (miroir du client MAX_FILE_MB=20). On NE
// fait JAMAIS confiance au content-type annoncé à l'upload : on relit les
// métadonnées RÉELLES du blob (ctx.db.system) au moment de la soumission.
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const ALLOWED_FILE_TYPES = ['application/pdf'];

// Soumission d'une publication par un membre (F-32). Crée un enregistrement en
// statut 'pending' — jamais exposé publiquement tant qu'un modérateur ne l'a
// pas publié. Validé côté serveur (défense en profondeur, l'UI valide aussi).
// Audité.
export const submitPublication = mutation({
  args: {
    title: v.string(),
    type: typeValidator,
    theme: themeValidator,
    region: regionValidator,
    languages: v.array(langValidator),
    access: accessValidator,
    year: v.number(),
    authors: v.array(authorValidator),
    abstract: v.string(),
    keypoints: v.optional(v.array(v.string())),
    fileId: v.optional(v.id('_storage')),
    fileName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Réservé aux membres validés (modèle d'adhésion B) — un visiteur doit
    // d'abord faire valider sa candidature d'adhésion.
    const user = await requireNetworkRole(ctx, 'membre');

    const title = args.title.trim();
    const abstract = args.abstract.trim();
    const authors = args.authors
      .map((a) => ({ name: a.name.trim(), role: a.role?.trim() || undefined }))
      .filter((a) => a.name.length >= 2);
    const languages = [...new Set(args.languages)];
    const keypoints = (args.keypoints ?? [])
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 8);

    const nowYear = new Date(Date.now()).getUTCFullYear();
    if (title.length < 4 || title.length > 200)
      throw new Error('INVALID_TITLE');
    if (abstract.length < 20 || abstract.length > 4000)
      throw new Error('INVALID_ABSTRACT');
    if (authors.length === 0) throw new Error('INVALID_AUTHORS');
    if (languages.length === 0) throw new Error('INVALID_LANGUAGES');
    if (
      !Number.isInteger(args.year) ||
      args.year < 1990 ||
      args.year > nowYear + 1
    )
      throw new Error('INVALID_YEAR');

    await enforceRateLimit(ctx, {
      key: `pub:${user._id}`,
      ...RATE_LIMITS.publicationSubmit,
    });

    // Validation serveur du blob téléversé (défense en profondeur) : on relit
    // les métadonnées RÉELLES du stockage, jamais le content-type annoncé par le
    // client. La TAILLE est toujours bornée (vecteur DoS / coût). Le TYPE n'est
    // rejeté que s'il est renseigné et hors allow-list (Convex ne le garantit pas
    // toujours ; la modération a posteriori couvre le cas où il manque).
    // NB : pas de ctx.storage.delete ici — le throw annule la transaction
    // (rollback), donc la suppression serait sans effet. Un blob rejeté reste
    // orphelin (jamais référencé par une publication ni servi) ; le nettoyage des
    // orphelins relève d'un job séparé.
    if (args.fileId) {
      const meta = await ctx.db.system.get(args.fileId);
      const typeRejected = meta?.contentType
        ? !ALLOWED_FILE_TYPES.includes(meta.contentType)
        : false;
      if (!meta || meta.size > MAX_FILE_BYTES || typeRejected) {
        throw new Error('INVALID_FILE');
      }
    }

    // Slug unique (suffixe incrémental en cas de collision de titre).
    const root = slugify(title);
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
    const id = await ctx.db.insert('publications', {
      title,
      slug,
      type: args.type,
      theme: args.theme,
      region: args.region,
      languages,
      access: args.access,
      authors,
      year: args.year,
      publishedAt: 0, // fixé à la publication
      abstract,
      keypoints,
      body: [],
      doi: '', // DOI interne attribué à la publication
      downloads: 0,
      citations: 0,
      views: 0,
      status: 'pending',
      authorUserId: user._id,
      submittedAt: now,
      createdAt: now,
      ...(args.fileId ? { fileId: args.fileId } : {}),
      ...(args.fileName ? { fileName: args.fileName.slice(0, 200) } : {}),
    });

    await trackPublicationStatus(ctx, null, 'pending');

    await recordAudit(ctx, {
      actorId: user._id,
      action: AUDIT.PUBLICATION_SUBMITTED,
      targetId: id,
      metadata: { type: args.type, theme: args.theme },
    });

    // Modération assistée par IA (convex/aiModeration.ts) — PLANIFIÉE, jamais
    // appelée ici. Trois raisons, dans cet ordre :
    //
    //  1. une mutation Convex n'a pas `fetch` : l'appel au modèle ne peut
    //     vivre que dans une action ;
    //  2. le membre qui dépose n'a pas à attendre l'arbitrage. Sa soumission
    //     est acquise à l'insertion, quoi qu'il advienne ensuite ;
    //  3. si l'analyse échoue, le dépôt reste simplement `pending` — l'état
    //     dans lequel cette mutation vient de l'écrire. L'échec du dispositif
    //     ramène donc au comportement d'avant le dispositif, jamais à une
    //     publication.
    //
    // La lecture du mode ici n'est pas une garde de sécurité (`runReview` le
    // revérifie) : elle évite simplement de planifier une action dont on sait
    // déjà qu'elle n'aura rien à faire.
    const aiConfig = await ctx.db
      .query('aiModerationConfig')
      .withIndex('by_key', (q) => q.eq('key', 'default'))
      .unique();
    if (aiConfig && aiConfig.mode !== 'off') {
      await ctx.scheduler.runAfter(0, internal.aiModeration.runReview, {
        publicationId: id,
      });
    }

    return { id, slug };
  },
});

// Mes contributions (F-32) — l'utilisateur connecté voit SES dépôts, tous
// statuts confondus (brouillon / en revue / publié), les plus récents d'abord.
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const mine = await ctx.db
      .query('publications')
      .withIndex('by_author', (q) => q.eq('authorUserId', userId))
      .collect();
    return mine
      .sort(
        (a, b) =>
          (b.submittedAt ?? b.createdAt) - (a.submittedAt ?? a.createdAt),
      )
      .map((p) => ({
        _id: p._id,
        title: p.title,
        slug: p.slug,
        type: p.type,
        status: p.status,
        submittedAt: p.submittedAt ?? p.createdAt,
        reviewNotes: p.reviewNotes ?? null,
      }));
  },
});

// File de modération des publications (F-32 / F-26) — modérateur et au-dessus.
// Renvoie les soumissions en attente (ou toutes), avec l'e-mail de l'auteur et
// l'URL du document téléversé pour examen.
//
// PAGINÉE (issue #8). La file chargeait la table `publications` ENTIÈRE dans le
// mode « toutes », puis résolvait l'auteur d'une ligne à la fois — un
// aller-retour par publication, et une URL signée par fichier. L'ordre vient
// désormais de l'index (le plus récent d'abord) au lieu d'un tri en mémoire :
// c'est ce qui rend le curseur possible.
const reviewItemValidator = v.object({
  _id: v.id('publications'),
  title: v.string(),
  slug: v.string(),
  type: typeValidator,
  theme: v.string(),
  region: regionValidator,
  languages: v.array(langValidator),
  access: accessValidator,
  year: v.number(),
  abstract: v.string(),
  authors: v.array(authorValidator),
  status: v.union(
    v.literal('draft'),
    v.literal('pending'),
    v.literal('published'),
  ),
  submittedAt: v.number(),
  // Date de la dernière décision. Un `draft` qui en porte une est un REFUS,
  // pas un brouillon jamais soumis (issue #32) : c'est ce qui décide si
  // l'écran propose « Rouvrir » (issue #9).
  reviewedAt: v.union(v.number(), v.null()),
  reviewNotes: v.union(v.string(), v.null()),
  authorEmail: v.union(v.string(), v.null()),
  fileName: v.union(v.string(), v.null()),
  fileUrl: v.union(v.string(), v.null()),
  // Avis IA — RÉSUMÉ seulement (verdict, décision, nombre de signaux). Le
  // détail (constats, extraits cités) se lit par `aiModeration.getReview`, sur
  // la ligne qu'un modérateur ouvre : le charger pour cent lignes rendrait la
  // file plus lourde que ce qu'elle affiche.
  aiReview: v.union(
    v.object({
      verdict: aiModerationVerdict,
      applied: aiModerationApplied,
      reason: v.string(),
      confidence: v.number(),
      blocking: v.number(),
      warnings: v.number(),
      at: v.number(),
    }),
    v.null(),
  ),
  // Mise en ligne SANS relecture humaine : la file le dit, et c'est ce qui
  // ouvre « remettre en file ».
  autoPublished: v.boolean(),
});

// CHERCHABLE (issue #49) : le titre, par index plein texte, avec le statut
// porté par `filterFields` — la file « en attente » reste donc une seule
// lecture d'index quand on y cherche. Filtrer côté client la page affichée
// n'aurait cherché que dans les 25 lignes déjà là, jamais dans la file.
export const listForReview = query({
  args: {
    status: v.optional(v.union(v.literal('pending'), v.literal('all'))),
    search: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginatedValidator(reviewItemValidator),
  handler: async (ctx, { status, search, paginationOpts }) => {
    await requireNetworkRole(ctx, 'moderateur');
    const opts = clampPageSize(paginationOpts);
    const term = normalizeSearchTerm(search);
    const result = term
      ? await ctx.db
          .query('publications')
          .withSearchIndex('search_title', (q) => {
            const q2 = q.search('title', term);
            return status === 'all' ? q2 : q2.eq('status', 'pending');
          })
          .paginate(opts)
      : status === 'all'
        ? await ctx.db.query('publications').order('desc').paginate(opts)
        : await ctx.db
            .query('publications')
            .withIndex('by_status', (q) => q.eq('status', 'pending'))
            .order('desc')
            .paginate(opts);

    // Un même membre dépose souvent plusieurs publications : on dédoublonne les
    // auteurs de la page avant de les lire, une fois chacun.
    const authors = await loadAuthors(
      ctx,
      result.page.map((p) => p.authorUserId),
    );

    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (p) => ({
          _id: p._id,
          title: p.title,
          slug: p.slug,
          type: p.type,
          theme: p.theme,
          region: p.region,
          languages: p.languages,
          access: p.access,
          year: p.year,
          abstract: p.abstract,
          authors: p.authors,
          status: p.status,
          submittedAt: p.submittedAt ?? p.createdAt,
          // Un `draft` AVEC `reviewedAt` est un refus, pas un brouillon jamais
          // soumis (issue #32) : c'est ce qui rend le bouton « Rouvrir ».
          reviewedAt: p.reviewedAt ?? null,
          reviewNotes: p.reviewNotes ?? null,
          authorEmail:
            (p.authorUserId ? authors.get(p.authorUserId)?.email : null) ??
            null,
          fileName: p.fileName ?? null,
          fileUrl: p.fileId ? await ctx.storage.getUrl(p.fileId) : null,
          aiReview: p.aiReview ?? null,
          autoPublished: p.autoPublished === true,
        })),
      ),
    };
  },
});

// --- Machine à états de la modération (audit M6 · issue #9) -----------------
//
//   draft ─────────────────────────────────────────► (cul-de-sac)
//   pending ──approved─► published        pending ──rejected─► rejected
//   rejected ──reopenPublicationReview──► pending
//   published ─────────────────────────────────────► (cul-de-sac ici)
//
// Trois points tranchés :
//
//  1. un `draft` ne s'approuve PAS. Un brouillon jamais soumis n'a été proposé
//     à personne ; l'approuver publierait un texte que son auteur n'a pas mis
//     en revue.
//  2. une décision ne se rejoue ni ne s'inverse. « Rejeter » après avoir
//     approuvé dépublierait en silence, sur un simple second clic, un document
//     déjà en ligne et déjà indexé.
//  3. le RETRAIT d'une publication en ligne n'est pas un rejeu de revue :
//     c'est une sortie de catalogue, qui attend l'état `archived` de l'issue
//     #32. Tant qu'il n'existe pas, `published` est un cul-de-sac ici.
//
// `rejected` n'est pas (encore) un statut au schéma — c'est l'objet de l'issue
// #32 — donc un refus retombe en `draft`. On reconstitue l'état réel avec
// `reviewedAt` : sans cela, un brouillon jamais soumis et un refus prononcé
// seraient le même état, et la garde du point 1 tomberait.
type PublicationReviewState = Doc<'publications'>['status'] | 'rejected';

const PUBLICATION_REVIEW: ReviewMachine<PublicationReviewState> = {
  transitions: {
    draft: [],
    pending: ['published', 'rejected'],
    rejected: ['pending'],
    published: [],
  },
  decided: ['published', 'rejected'],
};

function reviewState(pub: Doc<'publications'>): PublicationReviewState {
  return pub.status === 'draft' && pub.reviewedAt !== undefined
    ? 'rejected'
    : pub.status;
}

// Lit les auteurs d'une page en dédoublonnant les identifiants.
async function loadAuthors(
  ctx: QueryCtx,
  ids: (Id<'users'> | undefined)[],
): Promise<Map<Id<'users'>, Doc<'users'>>> {
  const unique = [
    ...new Set(ids.filter((id): id is Id<'users'> => id !== undefined)),
  ];
  const out = new Map<Id<'users'>, Doc<'users'>>();
  await Promise.all(
    unique.map(async (id) => {
      const user = await ctx.db.get(id);
      if (user) out.set(id, user);
    }),
  );
  return out;
}

// Décision de modération (F-32) — modérateur et au-dessus, audité. N'accepte
// qu'une publication SOUMISE (`pending`), cf. la machine ci-dessus.
//  - approved : la publication devient publique (status 'published' ; date et
//    DOI interne attribués si absents) ;
//  - rejected : retour en brouillon, avec une note pour l'auteur.
export const reviewPublication = mutation({
  args: {
    publicationId: v.id('publications'),
    decision: v.union(v.literal('approved'), v.literal('rejected')),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, { publicationId, decision, notes }) => {
    const reviewer = await requireNetworkRole(ctx, 'moderateur');
    const pub = await ctx.db.get(publicationId);
    if (!pub) throw new Error('NOT_FOUND');
    assertTransition(
      reviewState(pub),
      decision === 'approved' ? 'published' : 'rejected',
      PUBLICATION_REVIEW,
    );

    const now = Date.now();
    const reviewNotes = notes?.trim() || undefined;
    if (decision === 'approved') {
      await ctx.db.patch(publicationId, {
        status: 'published',
        publishedAt: pub.publishedAt || now,
        doi: pub.doi || `10.59000/dt.${pub.slug}`,
        reviewedBy: reviewer._id,
        reviewedAt: now,
        reviewNotes,
      });
    } else {
      // Faute d'un statut `rejected` (issue #32), un refus retombe en `draft` ;
      // c'est `reviewedAt` qui le distingue d'un brouillon jamais soumis.
      await ctx.db.patch(publicationId, {
        status: 'draft',
        reviewedBy: reviewer._id,
        reviewedAt: now,
        reviewNotes,
      });
    }

    await trackPublicationStatus(
      ctx,
      pub.status,
      decision === 'approved' ? 'published' : 'draft',
    );

    // Notifie l'auteur du dépôt de l'issue de la modération (F-25/F-51).
    if (pub.authorUserId) {
      await notify(ctx, {
        userId: pub.authorUserId,
        type:
          decision === 'approved'
            ? 'publication_published'
            : 'publication_rejected',
        titleKey: decision === 'approved' ? 'pubPublished' : 'pubRejected',
        params: { title: pub.title },
        link:
          decision === 'approved'
            ? `/bibliotheque/${pub.slug}`
            : '/espace-membre',
      });
    }

    await recordAudit(ctx, {
      actorId: reviewer._id,
      action: AUDIT.PUBLICATION_REVIEWED,
      targetId: publicationId,
      metadata: { decision },
    });
  },
});

// Réouverture d'un refus (issue #9) — modérateur et au-dessus, audité.
//
// C'est LA transition arrière de la modération, et elle porte un nom : un refus
// prononcé par erreur retourne dans la file (`pending`) sous sa propre action
// d'audit (`publication.reopened`), au lieu d'être effacé par un second clic
// sur « Approuver » qui, lui, ne laisserait aucune trace de l'hésitation.
//
// Ne rouvre QUE ce qui a été refusé : un brouillon jamais soumis (pas de
// `reviewedAt`) reste hors de la file — INVALID_TRANSITION — sinon la garde
// « une publication jamais soumise ne peut pas être approuvée » se contournerait
// en deux clics. Une publication EN LIGNE ne se rouvre pas non plus : la
// dépublier est un retrait, qui attend l'état `archived` de l'issue #32.
//
// Les champs de la décision précédente (`reviewNotes`, `reviewedBy`,
// `reviewedAt`) sont CONSERVÉS : ils disent pourquoi le refus avait été
// prononcé, et la prochaine décision les remplacera.
export const reopenPublicationReview = mutation({
  args: { publicationId: v.id('publications') },
  handler: async (ctx, { publicationId }) => {
    const reviewer = await requireNetworkRole(ctx, 'moderateur');
    const pub = await ctx.db.get(publicationId);
    if (!pub) throw new Error('NOT_FOUND');
    const from = reviewState(pub);
    assertTransition(from, 'pending', PUBLICATION_REVIEW);

    await ctx.db.patch(publicationId, { status: 'pending' });
    // La publication revient dans la file : le compteur du tableau de bord la
    // recompte (issue #8). Sans cet appel, « en attente » sous-compterait
    // chaque dossier rouvert.
    await trackPublicationStatus(ctx, pub.status, 'pending');
    await recordAudit(ctx, {
      actorId: reviewer._id,
      action: AUDIT.PUBLICATION_REOPENED,
      targetId: publicationId,
      metadata: { from },
    });
    return { ok: true };
  },
});

// Remise en file d'une publication mise en ligne par l'IA (modérateur+, audité).
//
// POURQUOI CETTE SORTIE EXISTE, alors que `published` est un cul-de-sac.
//
// La machine ci-dessus ferme `published` pour une raison précise : dépublier
// un document déjà en ligne et déjà indexé est un RETRAIT DE CATALOGUE, qui
// attend l'état `archived` de l'issue #32 — pas l'effet de bord d'un second
// clic sur un bouton de revue.
//
// Une publication automatique n'est pas ce cas-là. Personne ne l'a lue : le
// premier regard humain n'INVERSE pas une décision, il est la décision —
// celle que le dispositif a anticipée. Refuser ce retour reviendrait à rendre
// l'arbitrage du modèle plus définitif que celui d'un modérateur, dont les
// refus, eux, se rouvrent (`reopenPublicationReview`).
//
// La porte est donc étroite, et trois clefs la tiennent ensemble :
//   - `autoPublished === true` — un document validé par un humain, même
//     approuvé après un avis IA, n'entre pas ici ;
//   - `status === 'published'` — on ne « remet en file » que ce qui est
//     en ligne ;
//   - le drapeau est RETIRÉ au passage : la sortie ne sert qu'une fois, et
//     la décision qui suivra sera humaine, donc définitive au sens de la
//     machine.
//
// Auditée sous son action propre (`publication.ai_reverted`) : le journal doit
// pouvoir montrer la séquence complète — publiée par l'IA, retirée par un
// humain, puis tranchée — sans que les trois se confondent.
export const revertAutoPublication = mutation({
  args: { publicationId: v.id('publications') },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { publicationId }) => {
    const reviewer = await requireNetworkRole(ctx, 'moderateur');
    const pub = await ctx.db.get(publicationId);
    if (!pub) throw new Error('NOT_FOUND');
    if (pub.autoPublished !== true || pub.status !== 'published') {
      throw new Error('INVALID_TRANSITION');
    }

    await ctx.db.patch(publicationId, {
      status: 'pending',
      autoPublished: false,
      // `reviewedAt` posé par l'IA est EFFACÉ : le laisser ferait lire un
      // `pending` comme un dossier déjà tranché — exactement la confusion que
      // `reviewState` doit éviter sur les brouillons refusés.
      reviewedAt: undefined,
    });
    await trackPublicationStatus(ctx, 'published', 'pending');

    await recordAudit(ctx, {
      actorId: reviewer._id,
      action: AUDIT.PUBLICATION_AI_REVERTED,
      targetId: publicationId,
      metadata: {
        reason: pub.aiReview?.reason ?? null,
        confidence: pub.aiReview?.confidence ?? null,
      },
    });
    return { ok: true };
  },
});
