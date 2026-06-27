import { v } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import { query, mutation } from './_generated/server';
import { requireNetworkRole } from './lib/rbac';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { notify } from './lib/notify';
import { enforceRateLimit, RATE_LIMITS } from './lib/rateLimit';
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
  type PubSort,
} from './lib/publications';

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
  handler: async (ctx, { sort, ...filters }) => {
    const published = await ctx.db
      .query('publications')
      .withIndex('by_status', (qi) => qi.eq('status', 'published'))
      .collect();
    const items = sortPublications(
      published.filter((p) => matchesPublication(p, filters)),
      (sort as PubSort) ?? 'recent',
    );
    return {
      items,
      facets: computePublicationFacets(published),
      total: published.length,
    };
  },
});

// Détail publication (F-34) — publique : ne renvoie QUE les publications
// publiées. Le filtrage de statut vit dans la query (et non chez l'appelant)
// pour qu'aucun consommateur ne puisse exposer un brouillon / une soumission.
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const pub = await ctx.db
      .query('publications')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (!pub || pub.status !== 'published') return null;
    // Document téléversé (F-32) : URL signée résolue côté serveur pour le
    // bouton de téléchargement. (Le verrouillage fin « réservé aux membres »
    // par fichier reste un raffinement ultérieur — une publication publiée a
    // déjà été validée en modération.)
    const fileUrl = pub.fileId ? await ctx.storage.getUrl(pub.fileId) : null;
    // `views` reste optionnel en base (seed/données anciennes) : on le normalise
    // à 0 pour le rendu serveur du compteur de consultations (F-37).
    return { ...pub, views: pub.views ?? 0, fileUrl };
  },
});

// Compteur de consultations (F-37) — mutation PUBLIQUE, sans authentification.
// Incrémente `views` sur la publication PUBLIÉE correspondant au slug. La
// déduplication par session vit côté client (sessionStorage) ; ici, no-op si la
// publication n'existe pas ou n'est pas publiée (on n'expose ni ne compte les
// brouillons / soumissions).
export const recordPublicationView = mutation({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const pub = await ctx.db
      .query('publications')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (!pub || pub.status !== 'published') return null;
    await ctx.db.patch(pub._id, { views: (pub.views ?? 0) + 1 });
    return null;
  },
});

// Publications liées (même thématique) — pour le bloc « Dans la même
// thématique » du détail. Exclut la publication courante, bornée à `limit`.
export const relatedByTheme = query({
  args: {
    theme: v.string(),
    excludeSlug: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { theme, excludeSlug, limit }) => {
    const sameTheme = await ctx.db
      .query('publications')
      .withIndex('by_status_and_theme', (q) =>
        q.eq('status', 'published').eq('theme', theme),
      )
      .collect();
    return sortPublications(
      sameTheme.filter((p) => p.slug !== excludeSlug),
      'recent',
    ).slice(0, limit ?? 3);
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
    if (title.length < 4 || title.length > 200) throw new Error('INVALID_TITLE');
    if (abstract.length < 20 || abstract.length > 4000)
      throw new Error('INVALID_ABSTRACT');
    if (authors.length === 0) throw new Error('INVALID_AUTHORS');
    if (languages.length === 0) throw new Error('INVALID_LANGUAGES');
    if (!Number.isInteger(args.year) || args.year < 1990 || args.year > nowYear + 1)
      throw new Error('INVALID_YEAR');

    await enforceRateLimit(ctx, {
      key: `pub:${user._id}`,
      ...RATE_LIMITS.publicationSubmit,
    });

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

    await recordAudit(ctx, {
      actorId: user._id,
      action: AUDIT.PUBLICATION_SUBMITTED,
      targetId: id,
      metadata: { type: args.type, theme: args.theme },
    });
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
export const listForReview = query({
  args: { status: v.optional(v.union(v.literal('pending'), v.literal('all'))) },
  handler: async (ctx, { status }) => {
    await requireNetworkRole(ctx, 'moderateur');
    const pubs =
      status === 'all'
        ? await ctx.db.query('publications').collect()
        : await ctx.db
            .query('publications')
            .withIndex('by_status', (q) => q.eq('status', 'pending'))
            .collect();
    const sorted = pubs.sort(
      (a, b) => (b.submittedAt ?? b.createdAt) - (a.submittedAt ?? a.createdAt),
    );
    return await Promise.all(
      sorted.map(async (p) => {
        const author = p.authorUserId ? await ctx.db.get(p.authorUserId) : null;
        return {
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
          reviewNotes: p.reviewNotes ?? null,
          authorEmail: author?.email ?? null,
          fileName: p.fileName ?? null,
          fileUrl: p.fileId ? await ctx.storage.getUrl(p.fileId) : null,
        };
      }),
    );
  },
});

// Décision de modération (F-32) — modérateur et au-dessus, audité.
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
      await ctx.db.patch(publicationId, {
        status: 'draft',
        reviewedBy: reviewer._id,
        reviewedAt: now,
        reviewNotes,
      });
    }

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
