import { v, ConvexError } from 'convex/values';
import { getAuthUserId } from '@convex-dev/auth/server';
import {
  query,
  action,
  internalQuery,
  internalMutation,
  internalAction,
  type ActionCtx,
  type QueryCtx,
} from './_generated/server';
import { internal } from './_generated/api';
import type { Id } from './_generated/dataModel';
import { locale, type SiteLocale } from './lib/locales';
import { getCurrentUser, rank } from './lib/rbac';
import { enforceRateLimit } from './lib/rateLimit';
import {
  isGatewayConfigured,
  runStructured,
  toBase64,
  GATEWAY_ERRORS,
} from './lib/aiGateway';
import {
  buildDocumentTranslationInstructions,
  buildDocumentTranslationSchema,
  buildExtractionInstructions,
  buildExtractionSchema,
  documentBlock,
  documentStatus,
  documentTokenBudget,
  extractedImage,
  parseDocumentTranslation,
  parseExtraction,
  MAX_IMAGES,
  MAX_PDF_BYTES,
  type DocumentBlock,
} from './lib/documents';
import { countPages, extractJpegImages, looksLikePdf } from './lib/pdfImages';
import { translationModel } from './lib/translation';

// TRADUCTION DU DOCUMENT JOINT À UNE PUBLICATION — orchestration.
//
// DEUX TEMPS, ET C'EST TOUT L'ENJEU DU DÉCOUPAGE.
//
//  1. EXTRAIRE, une fois. Le PDF part au modèle, qui en rend la structure
//     (convex/lib/documents.ts) ; en parallèle, ses images JPEG sont recopiées
//     dans le stockage (convex/lib/pdfImages.ts). C'est l'opération coûteuse —
//     plusieurs mégaoctets à l'aller — et elle ne dépend d'aucune langue.
//  2. TRADUIRE, une fois par langue demandée, à partir des blocs extraits.
//     Quelques dizaines de kilo-octets de JSON, et le fichier n'est plus jamais
//     relu. Les cinq versions décrivent donc RIGOUREUSEMENT le même document,
//     ce qu'une extraction refaite à chaque langue ne garantirait pas.
//
// L'IMAGE N'EST JAMAIS RETRADUITE NI RECOMPRESSÉE. Un bloc `figure` porte un
// index ; l'index traverse la traduction intact (`parseDocumentTranslation` le
// réimpose depuis la source). Les cinq langues servent donc les mêmes fichiers,
// aux mêmes endroits.
//
// CE QUI EST PRODUIT N'EST PAS UN PDF, et ce n'est pas un pis-aller. Aucune
// bibliothèque PDF de l'écosystème JavaScript ne sait composer l'arabe — ni la
// forme contextuelle des lettres, ni l'algorithme bidirectionnel. Un moteur de
// navigateur le fait, lui, et sans erreur. La vue document
// (`/[locale]/bibliotheque/[slug]/document`) est donc une page mise en forme
// pour l'impression, que le lecteur enregistre en PDF depuis son navigateur.

// --- Forme publique ---------------------------------------------------------

const documentViewValidator = v.object({
  status: documentStatus,
  sourceLocale: locale,
  targetLocale: locale,
  title: v.optional(v.string()),
  blocks: v.optional(v.array(documentBlock)),
  /** URL signée par image, indexée comme `imageIndex`. */
  imageUrls: v.array(v.union(v.string(), v.null())),
  skippedImages: v.number(),
  pageCount: v.optional(v.number()),
  error: v.optional(v.string()),
  /** Le PDF d'origine, quand le lecteur y a droit. */
  originalUrl: v.union(v.string(), v.null()),
  updatedAt: v.number(),
});

async function viewerIsMember(ctx: QueryCtx): Promise<boolean> {
  const user = await getCurrentUser(ctx);
  return rank(user?.role) >= rank('membre');
}

/**
 * Le document d'une publication, dans une langue.
 *
 * Renvoie `null` quand la publication n'existe pas, n'a pas de document joint,
 * ou que le lecteur n'a pas le droit de le lire. La distinction entre « pas
 * encore préparé » et « préparé » se lit dans `status`, parce que l'interface
 * en tire deux écrans différents.
 *
 * LE CONTRÔLE D'ACCÈS EST ICI, et il est le même que celui de la bibliothèque :
 * la vue document rend le TEXTE INTÉGRAL d'un rapport. Une publication
 * réservée aux membres ne doit pas sortir par cette porte-là.
 */
export const getDocument = query({
  args: { slug: v.string(), targetLocale: locale },
  returns: v.union(documentViewValidator, v.null()),
  handler: async (ctx, args) => {
    const pub = await ctx.db
      .query('publications')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .unique();
    if (!pub || pub.status !== 'published' || !pub.fileId) return null;
    if (pub.access === 'members' && !(await viewerIsMember(ctx))) return null;

    const extraction = await ctx.db
      .query('documentExtractions')
      .withIndex('by_publication', (q) => q.eq('publicationId', pub._id))
      .unique();

    const sourceLocale = extraction?.sourceLocale ?? pub.languages[0] ?? 'fr';
    const originalUrl = await ctx.storage.getUrl(pub.fileId);

    // Pas encore d'extraction, ou une extraction qui décrit un AUTRE fichier :
    // rien à servir. Le second cas arrive quand un membre remplace son PDF.
    if (!extraction || extraction.fileId !== pub.fileId) {
      return {
        status: 'pending' as const,
        sourceLocale,
        targetLocale: args.targetLocale,
        imageUrls: [],
        skippedImages: 0,
        originalUrl,
        updatedAt: extraction?.updatedAt ?? 0,
      };
    }
    if (extraction.status !== 'ready') {
      return {
        status: extraction.status,
        sourceLocale,
        targetLocale: args.targetLocale,
        imageUrls: [],
        skippedImages: extraction.skippedImages ?? 0,
        pageCount: extraction.pageCount,
        error: extraction.error,
        originalUrl,
        updatedAt: extraction.updatedAt,
      };
    }

    // Les URL d'image sont signées à la lecture : le tableau est INDEXÉ comme
    // `imageIndex`, avec des trous à `null` plutôt qu'un tableau compacté —
    // compacter décalerait toutes les figures suivantes.
    const images = extraction.images ?? [];
    const imageUrls: (string | null)[] = [];
    for (let i = 0; i < images.length; i++) {
      const img = images.find((x) => x.index === i);
      imageUrls.push(img ? await ctx.storage.getUrl(img.storageId) : null);
    }

    // La langue source se sert telle quelle : le document extrait EST déjà
    // dans cette langue, la traduire vers elle-même n'aurait pas de sens.
    if (args.targetLocale === sourceLocale) {
      return {
        status: 'ready' as const,
        sourceLocale,
        targetLocale: args.targetLocale,
        title: extraction.title,
        blocks: extraction.blocks,
        imageUrls,
        skippedImages: extraction.skippedImages ?? 0,
        pageCount: extraction.pageCount,
        originalUrl,
        updatedAt: extraction.updatedAt,
      };
    }

    const rendition = await ctx.db
      .query('documentRenditions')
      .withIndex('by_publication_and_locale', (q) =>
        q.eq('publicationId', pub._id).eq('targetLocale', args.targetLocale),
      )
      .unique();

    // Une version rattachée à une extraction remplacée décrit l'ancien PDF.
    const usable = rendition && rendition.extractionId === extraction._id;
    return {
      status: usable ? rendition.status : ('pending' as const),
      sourceLocale,
      targetLocale: args.targetLocale,
      title: usable ? rendition.title : undefined,
      blocks: usable ? rendition.blocks : undefined,
      imageUrls,
      skippedImages: extraction.skippedImages ?? 0,
      pageCount: extraction.pageCount,
      error: usable ? rendition.error : undefined,
      originalUrl,
      updatedAt: usable ? rendition.updatedAt : extraction.updatedAt,
    };
  },
});

/** Les langues dans lesquelles le document est déjà prêt. */
export const listDocumentLocales = query({
  args: { slug: v.string() },
  returns: v.array(locale),
  handler: async (ctx, { slug }) => {
    const pub = await ctx.db
      .query('publications')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (!pub || pub.status !== 'published' || !pub.fileId) return [];
    if (pub.access === 'members' && !(await viewerIsMember(ctx))) return [];

    const extraction = await ctx.db
      .query('documentExtractions')
      .withIndex('by_publication', (q) => q.eq('publicationId', pub._id))
      .unique();
    if (
      !extraction ||
      extraction.fileId !== pub.fileId ||
      extraction.status !== 'ready'
    ) {
      return [];
    }

    const renditions = await ctx.db
      .query('documentRenditions')
      .withIndex('by_publication_and_locale', (q) =>
        q.eq('publicationId', pub._id),
      )
      // Au plus une version par langue servie : la borne est structurelle.
      .take(8);

    return [
      extraction.sourceLocale,
      ...renditions
        .filter(
          (r) => r.status === 'ready' && r.extractionId === extraction._id,
        )
        .map((r) => r.targetLocale),
    ];
  },
});

// --- Temps 1 : contexte -----------------------------------------------------

export const loadDocumentContext = internalQuery({
  args: { slug: v.string(), userId: v.union(v.id('users'), v.null()) },
  returns: v.union(
    v.object({
      ok: v.literal(true),
      publicationId: v.id('publications'),
      fileId: v.id('_storage'),
      sourceLocale: locale,
      extractionId: v.union(v.id('documentExtractions'), v.null()),
      extractionFresh: v.boolean(),
      blocks: v.optional(v.array(documentBlock)),
      title: v.optional(v.string()),
      imageCount: v.number(),
    }),
    v.object({ ok: v.literal(false), reason: v.string() }),
  ),
  handler: async (ctx, args) => {
    const pub = await ctx.db
      .query('publications')
      .withIndex('by_slug', (q) => q.eq('slug', args.slug))
      .unique();
    if (!pub || pub.status !== 'published') {
      return { ok: false as const, reason: 'NOT_FOUND' };
    }
    if (!pub.fileId) return { ok: false as const, reason: 'NO_DOCUMENT' };
    if (pub.access === 'members') {
      const user = args.userId ? await ctx.db.get(args.userId) : null;
      if (rank(user?.role) < rank('membre')) {
        return { ok: false as const, reason: 'FORBIDDEN' };
      }
    }

    const extraction = await ctx.db
      .query('documentExtractions')
      .withIndex('by_publication', (q) => q.eq('publicationId', pub._id))
      .unique();
    const fresh =
      extraction !== null &&
      extraction.fileId === pub.fileId &&
      extraction.status === 'ready';

    return {
      ok: true as const,
      publicationId: pub._id,
      fileId: pub.fileId,
      sourceLocale: extraction?.sourceLocale ?? pub.languages[0] ?? 'fr',
      extractionId: extraction?._id ?? null,
      extractionFresh: fresh,
      blocks: fresh ? extraction.blocks : undefined,
      title: fresh ? extraction.title : undefined,
      imageCount: fresh ? (extraction.images?.length ?? 0) : 0,
    };
  },
});

// --- Écritures --------------------------------------------------------------

export const saveExtraction = internalMutation({
  args: {
    publicationId: v.id('publications'),
    fileId: v.id('_storage'),
    sourceLocale: locale,
    status: documentStatus,
    title: v.optional(v.string()),
    blocks: v.optional(v.array(documentBlock)),
    images: v.optional(v.array(extractedImage)),
    skippedImages: v.optional(v.number()),
    pageCount: v.optional(v.number()),
    model: v.optional(v.string()),
    error: v.optional(v.string()),
  },
  returns: v.id('documentExtractions'),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query('documentExtractions')
      .withIndex('by_publication', (q) =>
        q.eq('publicationId', args.publicationId),
      )
      .unique();

    // Le PDF a changé : les images de l'ancienne extraction ne décrivent plus
    // rien et les versions traduites non plus. On les supprime explicitement —
    // laisser des fichiers orphelins dans le stockage est une fuite lente,
    // exactement le genre que personne ne remarque avant la facture.
    if (existing && existing.fileId !== args.fileId) {
      for (const img of existing.images ?? []) {
        await ctx.storage.delete(img.storageId);
      }
      const stale = await ctx.db
        .query('documentRenditions')
        .withIndex('by_extraction', (q) => q.eq('extractionId', existing._id))
        .take(16);
      for (const r of stale) await ctx.db.delete(r._id);
    }

    const row = {
      publicationId: args.publicationId,
      fileId: args.fileId,
      sourceLocale: args.sourceLocale,
      status: args.status,
      ...(args.title ? { title: args.title } : {}),
      ...(args.blocks ? { blocks: args.blocks } : {}),
      ...(args.images ? { images: args.images } : {}),
      ...(args.skippedImages !== undefined
        ? { skippedImages: args.skippedImages }
        : {}),
      ...(args.pageCount !== undefined ? { pageCount: args.pageCount } : {}),
      ...(args.model ? { model: args.model } : {}),
      ...(args.error ? { error: args.error } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    if (existing) {
      await ctx.db.replace(existing._id, row);
      return existing._id;
    }
    return await ctx.db.insert('documentExtractions', row);
  },
});

export const saveRendition = internalMutation({
  args: {
    publicationId: v.id('publications'),
    extractionId: v.id('documentExtractions'),
    sourceLocale: locale,
    targetLocale: locale,
    status: documentStatus,
    title: v.optional(v.string()),
    blocks: v.optional(v.array(documentBlock)),
    model: v.optional(v.string()),
    error: v.optional(v.string()),
    requestedBy: v.union(v.id('users'), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query('documentRenditions')
      .withIndex('by_publication_and_locale', (q) =>
        q
          .eq('publicationId', args.publicationId)
          .eq('targetLocale', args.targetLocale),
      )
      .unique();

    const row = {
      publicationId: args.publicationId,
      extractionId: args.extractionId,
      sourceLocale: args.sourceLocale,
      targetLocale: args.targetLocale,
      status: args.status,
      ...(args.title ? { title: args.title } : {}),
      ...(args.blocks ? { blocks: args.blocks } : {}),
      ...(args.model ? { model: args.model } : {}),
      ...(args.error ? { error: args.error } : {}),
      ...(args.requestedBy ? { requestedBy: args.requestedBy } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    // `replace` : une version qui réussit après un échec doit perdre son
    // `error`, et l'inverse doit perdre ses `blocks`.
    if (existing) await ctx.db.replace(existing._id, row);
    else await ctx.db.insert('documentRenditions', row);
    return null;
  },
});

export const consumeDocumentQuota = internalMutation({
  args: { key: v.string() },
  returns: v.null(),
  handler: async (ctx, { key }) => {
    await enforceRateLimit(ctx, {
      // Préparer un document coûte beaucoup plus qu'un article : le fichier
      // entier part au modèle. Trois par heure et par acteur, et le cache sert
      // ensuite tous les lecteurs de cette langue.
      key,
      max: 3,
      windowMs: 60 * 60 * 1000,
    });
    return null;
  },
});

// --- Temps 2a : extraire ----------------------------------------------------

type ExtractionOutcome = { ok: boolean; code?: string; extractionId?: string };

export const extractDocument = internalAction({
  args: {
    publicationId: v.id('publications'),
    fileId: v.id('_storage'),
    sourceLocale: locale,
  },
  returns: v.object({
    ok: v.boolean(),
    code: v.optional(v.string()),
    extractionId: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<ExtractionOutcome> => {
    const fail = async (code: string): Promise<ExtractionOutcome> => {
      await ctx.runMutation(internal.documents.saveExtraction, {
        publicationId: args.publicationId,
        fileId: args.fileId,
        sourceLocale: args.sourceLocale,
        status: 'failed',
        error: code,
      });
      return { ok: false, code };
    };

    if (!isGatewayConfigured()) return fail(GATEWAY_ERRORS.NOT_CONFIGURED);

    const blob = await ctx.storage.get(args.fileId);
    if (!blob) return fail('FILE_MISSING');
    if (blob.size > MAX_PDF_BYTES) return fail('TOO_LARGE');

    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (!looksLikePdf(bytes)) return fail('NOT_A_PDF');

    // LES IMAGES D'ABORD. Leur nombre entre dans la consigne d'extraction :
    // le modèle doit savoir combien d'illustrations il peut référencer, sans
    // quoi il invente des index qui ne désignent rien.
    const { images, skipped } = extractJpegImages(bytes, MAX_IMAGES);
    const stored: {
      index: number;
      storageId: Id<'_storage'>;
      contentType: string;
      width?: number;
      height?: number;
    }[] = [];
    for (const img of images) {
      const id = await ctx.storage.store(
        new Blob([img.data as BlobPart], { type: img.contentType }),
      );
      stored.push({
        index: img.index,
        storageId: id,
        contentType: img.contentType,
        ...(img.width !== undefined ? { width: img.width } : {}),
        ...(img.height !== undefined ? { height: img.height } : {}),
      });
    }

    const model = translationModel();
    const result = await runStructured({
      model,
      instructions: buildExtractionInstructions(stored.length),
      userText:
        'Convert the attached PDF into the structured block representation described in your instructions.',
      attachment: {
        filename: 'document.pdf',
        base64: toBase64(bytes),
        contentType: 'application/pdf',
      },
      schemaName: 'document_extraction',
      schema: buildExtractionSchema(),
      // L'extraction rend du JSON plus verbeux que le texte du PDF : la marge
      // est large, une sortie tronquée coûte l'appel entier.
      maxOutputTokens: 64_000,
    });

    if (!result.ok) {
      // Les images déjà stockées sont conservées : la prochaine tentative
      // portera sur le même fichier et les réécrirait à l'identique.
      return fail(result.code);
    }

    const parsed = parseExtraction(result.data, stored.length);
    if (!parsed) return fail(GATEWAY_ERRORS.BAD_RESPONSE);

    const extractionId: Id<'documentExtractions'> = await ctx.runMutation(
      internal.documents.saveExtraction,
      {
        publicationId: args.publicationId,
        fileId: args.fileId,
        sourceLocale: args.sourceLocale,
        status: 'ready',
        title: parsed.title,
        blocks: parsed.blocks,
        images: stored,
        skippedImages: skipped,
        pageCount: countPages(bytes),
        model: result.model,
      },
    );
    return { ok: true, extractionId };
  },
});

// --- Temps 2b : traduire ----------------------------------------------------

/**
 * Prépare le document d'une publication dans une langue.
 *
 * Extrait d'abord si nécessaire, puis traduit. Idempotente : si la version
 * demandée existe déjà et décrit le fichier courant, l'appel ne consomme rien.
 */
export const prepareDocument = action({
  args: { slug: v.string(), targetLocale: locale },
  returns: v.object({ ok: v.boolean(), code: v.optional(v.string()) }),
  handler: async (ctx, args): Promise<{ ok: boolean; code?: string }> => {
    const userId = await getAuthUserId(ctx);
    const context = await ctx.runQuery(internal.documents.loadDocumentContext, {
      slug: args.slug,
      userId,
    });
    if (!context.ok) return { ok: false, code: context.reason };

    try {
      await ctx.runMutation(internal.documents.consumeDocumentQuota, {
        key: userId ? `document:user:${userId}` : `document:anon:${args.slug}`,
      });
    } catch (error) {
      if (error instanceof ConvexError)
        return { ok: false, code: 'RATE_LIMITED' };
      throw error;
    }

    // 1. Extraction, si elle manque ou décrit un autre fichier.
    let extractionId = context.extractionId;
    let blocks = context.blocks;
    let title = context.title;
    if (!context.extractionFresh) {
      const extracted = await ctx.runAction(
        internal.documents.extractDocument,
        {
          publicationId: context.publicationId,
          fileId: context.fileId,
          sourceLocale: context.sourceLocale,
        },
      );
      if (!extracted.ok) return { ok: false, code: extracted.code };
      // Relire plutôt que se fier au retour : l'extraction vient d'écrire, et
      // c'est la base qui fait foi sur ce qui a effectivement été enregistré.
      const after = await ctx.runQuery(internal.documents.loadDocumentContext, {
        slug: args.slug,
        userId,
      });
      if (!after.ok || !after.extractionFresh) {
        return { ok: false, code: GATEWAY_ERRORS.BAD_RESPONSE };
      }
      extractionId = after.extractionId;
      blocks = after.blocks;
      title = after.title;
    }

    // 2. La langue source est servie par l'extraction elle-même.
    if (args.targetLocale === context.sourceLocale) return { ok: true };
    if (!extractionId || !blocks || blocks.length === 0) {
      return { ok: false, code: 'EMPTY_DOCUMENT' };
    }

    const saveFailure = async (code: string) => {
      await ctx.runMutation(internal.documents.saveRendition, {
        publicationId: context.publicationId,
        extractionId,
        sourceLocale: context.sourceLocale,
        targetLocale: args.targetLocale,
        status: 'failed',
        error: code,
        requestedBy: userId,
      });
      return { ok: false, code };
    };

    const model = translationModel();
    const result = await runStructured({
      model,
      instructions: buildDocumentTranslationInstructions(
        context.sourceLocale,
        args.targetLocale,
      ),
      userText: JSON.stringify({ title: title ?? '', blocks }),
      schemaName: 'document_translation',
      schema: buildDocumentTranslationSchema(blocks),
      maxOutputTokens: documentTokenBudget(blocks),
    });
    if (!result.ok) return saveFailure(result.code);

    const parsed = parseDocumentTranslation(blocks, result.data);
    if (!parsed) return saveFailure(GATEWAY_ERRORS.BAD_RESPONSE);

    await ctx.runMutation(internal.documents.saveRendition, {
      publicationId: context.publicationId,
      extractionId,
      sourceLocale: context.sourceLocale,
      targetLocale: args.targetLocale,
      status: 'ready',
      title: parsed.title,
      blocks: parsed.blocks,
      model: result.model,
      requestedBy: userId,
    });
    return { ok: true };
  },
});

// Ré-exports utiles aux tests et aux appelants, pour que le type du bloc ne
// soit pas réimporté depuis deux endroits différents.
export type { DocumentBlock };
export type { ActionCtx, SiteLocale };
