import { v, ConvexError } from 'convex/values';
import {
  query,
  action,
  internalQuery,
  internalMutation,
  type ActionCtx,
  type QueryCtx,
} from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { getAuthUserId } from '@convex-dev/auth/server';
import { locale, type SiteLocale } from './lib/locales';
import { getCurrentUser, rank } from './lib/rbac';
import { enforceRateLimit } from './lib/rateLimit';
import {
  isGatewayConfigured,
  runStructured,
  GATEWAY_ERRORS,
} from './lib/aiGateway';
import {
  buildTranslationInput,
  buildTranslationInstructions,
  buildTranslationSchema,
  outputTokenBudget,
  parseTranslation,
  sourceFingerprint,
  sourceLength,
  translatableFields,
  translationModel,
  translationSourceType,
  translationStatus,
  MAX_SOURCE_CHARS,
  type TranslatableFields,
  type TranslationSourceType,
} from './lib/translation';

// TRADUCTION DES CONTENUS DÉPOSÉS PAR LES MEMBRES — orchestration.
//
// Le dispositif en une phrase : un lecteur ouvre un contenu écrit dans une
// langue qu'il ne lit pas, la page lui propose une traduction, et la traduction
// obtenue est MISE EN CACHE pour tous les suivants.
//
// TROIS RÈGLES, tenues par le code et couvertes par convex/translation.test.ts :
//
//  1. L'ORIGINAL NE DISPARAÎT JAMAIS. Aucune écriture ne touche le document
//     source. Une traduction est une ligne à côté, que la page peut ignorer —
//     et qu'elle ignore effectivement dès que l'empreinte du texte a changé.
//  2. RIEN NE S'AFFICHE COMME TRADUIT SANS L'ÊTRE. Une analyse en échec écrit
//     une ligne `failed` plutôt que rien : c'est ce qui permet à l'interface de
//     distinguer « pas encore demandé » de « demandé, et ça n'a pas marché ».
//     Le fail-closed de `lib/recaptcha.ts`, appliqué à une lecture.
//  3. C'EST LE SERVEUR QUI LIT LE TEXTE SOURCE. Le client envoie un
//     identifiant, jamais du contenu : sans cela, n'importe qui ferait traduire
//     n'importe quoi aux frais du réseau, et une publication réservée aux
//     membres sortirait par la porte de la traduction.
//
// Le découpage query / action / mutation est celui de `aiModeration.ts`, et
// pour la même raison : une mutation Convex n'a pas `fetch`, une action n'a pas
// de transaction. D'où trois temps — lire la source, appeler le modèle,
// écrire — et la nécessité de revérifier en temps 3 ce qui était vrai en 1.

// --- Forme publique ---------------------------------------------------------

const translationValidator = v.object({
  status: translationStatus,
  sourceLocale: locale,
  targetLocale: locale,
  fields: v.optional(translatableFields),
  error: v.optional(v.string()),
  model: v.optional(v.string()),
  updatedAt: v.number(),
  /**
   * La traduction décrit-elle le texte tel qu'il est AUJOURD'HUI ?
   *
   * Calculé à la lecture en comparant l'empreinte stockée à celle du contenu
   * courant. `false` -> l'auteur a modifié son texte depuis : la page sert
   * l'original et propose de retraduire.
   */
  fresh: v.boolean(),
});

// --- Lecture du contenu source ----------------------------------------------
//
// Une seule fonction pour les deux familles de contenus, parce qu'une seule
// forme les couvre (cf. `TranslatableFields`). Elle renvoie AUSSI la langue
// source, que les deux tables ne stockent pas de la même façon : un billet de
// Tribune porte un `lang` unique, une publication une LISTE de langues dont la
// première est la langue de rédaction.
type Source = {
  fields: TranslatableFields;
  sourceLocale: SiteLocale;
  /** Contenu réservé aux membres : la traduction l'est aussi. */
  membersOnly: boolean;
};

async function readSource(
  ctx: QueryCtx,
  sourceType: TranslationSourceType,
  sourceId: string,
): Promise<Source | null> {
  if (sourceType === 'tribunePost') {
    // `normalizeId` AVANT `db.get`, et ce n'est pas une précaution de style :
    // la surcharge à un argument de `db.get` ne vérifie PAS la table. Avec
    // `sourceType` fourni par le client, un identifiant de publication réservée
    // passé comme « billet » chargeait le document publication puis prenait la
    // branche ci-dessous, qui pose `membersOnly: false` EN DUR. Seul un
    // `TypeError` fortuit (le corps d'une publication est un tableau) refermait
    // la porte. `normalizeId` rend `null` dès que l'identifiant vient d'une
    // autre table : le discriminant du client cesse d'être une autorité.
    const postId = ctx.db.normalizeId('tribunePosts', sourceId);
    if (!postId) return null;
    const post = await ctx.db.get(postId);
    if (!post || post.status !== 'published') return null;
    return {
      // Le corps d'un billet est un seul champ de saisie : on le découpe en
      // paragraphes sur les lignes vides, comme le fait le rendu de la page.
      // Traduire un bloc de 4 000 signes en une seule chaîne donne au modèle
      // toute latitude pour en recomposer le découpage.
      fields: { title: post.title, body: splitParagraphs(post.body) },
      sourceLocale: post.lang ?? 'fr',
      membersOnly: false,
    };
  }

  const pubId = ctx.db.normalizeId('publications', sourceId);
  if (!pubId) return null;
  const pub = await ctx.db.get(pubId);
  if (!pub || pub.status !== 'published') return null;
  return {
    fields: {
      title: pub.title,
      abstract: pub.abstract,
      keypoints: pub.keypoints.length > 0 ? pub.keypoints : undefined,
      body: pub.body,
    },
    // `languages` est une liste ; la PREMIÈRE est la langue de rédaction. Une
    // publication déposée sans langue retombe sur le français, comme partout
    // ailleurs dans le dépôt.
    sourceLocale: pub.languages[0] ?? 'fr',
    membersOnly: pub.access === 'members',
  };
}

/**
 * Le lecteur a-t-il au moins le rang « membre » ?
 *
 * Même barème que `viewerIsMember` dans `convex/publications.ts`, et c'est
 * délibéré : la traduction d'une publication réservée est le texte intégral de
 * cette publication. Deux barèmes différents pour la même donnée, c'est une
 * porte dérobée qui s'ouvre à la première divergence.
 */
async function viewerIsMember(ctx: QueryCtx): Promise<boolean> {
  const user = await getCurrentUser(ctx);
  return rank(user?.role) >= rank('membre');
}

/**
 * Découpe un texte libre en paragraphes.
 *
 * Sur les lignes vides, et sur elles seules : un simple retour à la ligne à
 * l'intérieur d'un paragraphe n'en ouvre pas un nouveau, c'est déjà ainsi que
 * la Tribune rend les billets.
 */
export function splitParagraphs(body: string): string[] {
  const parts = body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  // Un texte sans ligne vide reste un paragraphe : renvoyer un tableau vide
  // ferait échouer le schéma de sortie (`minItems: 0`), et perdrait le texte.
  return parts.length > 0 ? parts : [body.trim()].filter(Boolean);
}

// --- Query publique ---------------------------------------------------------

/**
 * La traduction en cache d'un contenu, pour une langue de lecture.
 *
 * Renvoie `null` quand rien n'a jamais été demandé — ce que l'interface
 * distingue d'une ligne `failed`, qui a une histoire à raconter.
 *
 * L'ACCÈS EST REVÉRIFIÉ ICI. Une publication réservée aux membres ne livre pas
 * sa traduction à un visiteur : ce serait le texte intégral, servi par une
 * autre porte que celle qui est gardée.
 */
export const getTranslation = query({
  args: {
    sourceType: translationSourceType,
    sourceId: v.string(),
    targetLocale: locale,
  },
  returns: v.union(translationValidator, v.null()),
  handler: async (ctx, args) => {
    const source = await readSource(ctx, args.sourceType, args.sourceId);
    if (!source) return null;

    if (source.membersOnly && !(await viewerIsMember(ctx))) return null;

    const row = await ctx.db
      .query('contentTranslations')
      .withIndex('by_source_and_target', (q) =>
        q
          .eq('sourceType', args.sourceType)
          .eq('sourceId', args.sourceId)
          .eq('targetLocale', args.targetLocale),
      )
      .unique();
    if (!row) return null;

    return {
      status: row.status,
      sourceLocale: row.sourceLocale,
      targetLocale: row.targetLocale,
      fields: row.fields,
      error: row.error,
      model: row.model,
      updatedAt: row.updatedAt,
      fresh: row.sourceHash === sourceFingerprint(source.fields),
    };
  },
});

/**
 * Les langues dans lesquelles ce contenu est déjà traduit et à jour.
 *
 * Sert le sélecteur de langue du document : proposer « lire en portugais »
 * quand la traduction existe déjà coûte une lecture, là où la demander coûte
 * un appel au modèle.
 */
export const listAvailableTranslations = query({
  args: { sourceType: translationSourceType, sourceId: v.string() },
  returns: v.array(locale),
  handler: async (ctx, args) => {
    const source = await readSource(ctx, args.sourceType, args.sourceId);
    if (!source) return [];
    if (source.membersOnly && !(await viewerIsMember(ctx))) return [];
    const fingerprint = sourceFingerprint(source.fields);
    const rows = await ctx.db
      .query('contentTranslations')
      .withIndex('by_source', (q) =>
        q.eq('sourceType', args.sourceType).eq('sourceId', args.sourceId),
      )
      // Cinq langues au maximum, moins la langue source : la borne est
      // structurelle, pas arbitraire.
      .take(8);
    return rows
      .filter((r) => r.status === 'ready' && r.sourceHash === fingerprint)
      .map((r) => r.targetLocale);
  },
});

// --- Temps 1 : lire le contexte ---------------------------------------------

const contextValidator = v.union(
  v.object({
    ok: v.literal(true),
    fields: translatableFields,
    sourceLocale: locale,
    fingerprint: v.string(),
  }),
  v.object({ ok: v.literal(false), reason: v.string() }),
);

export const loadSource = internalQuery({
  args: {
    sourceType: translationSourceType,
    sourceId: v.string(),
    targetLocale: locale,
    userId: v.union(v.id('users'), v.null()),
  },
  returns: contextValidator,
  handler: async (ctx, args) => {
    const source = await readSource(ctx, args.sourceType, args.sourceId);
    if (!source) return { ok: false as const, reason: 'NOT_FOUND' };

    if (source.membersOnly) {
      const user = args.userId ? await ctx.db.get(args.userId) : null;
      if (rank(user?.role) < rank('membre')) {
        return { ok: false as const, reason: 'FORBIDDEN' };
      }
    }
    if (source.sourceLocale === args.targetLocale) {
      return { ok: false as const, reason: 'SAME_LANGUAGE' };
    }
    if (sourceLength(source.fields) > MAX_SOURCE_CHARS) {
      return { ok: false as const, reason: 'TOO_LONG' };
    }

    return {
      ok: true as const,
      fields: source.fields,
      sourceLocale: source.sourceLocale,
      fingerprint: sourceFingerprint(source.fields),
    };
  },
});

// --- Temps 3 : écrire le résultat -------------------------------------------

export const saveTranslation = internalMutation({
  args: {
    sourceType: translationSourceType,
    sourceId: v.string(),
    sourceLocale: locale,
    targetLocale: locale,
    sourceHash: v.string(),
    status: translationStatus,
    fields: v.optional(translatableFields),
    model: v.optional(v.string()),
    error: v.optional(v.string()),
    requestedBy: v.union(v.id('users'), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query('contentTranslations')
      .withIndex('by_source_and_target', (q) =>
        q
          .eq('sourceType', args.sourceType)
          .eq('sourceId', args.sourceId)
          .eq('targetLocale', args.targetLocale),
      )
      .unique();

    // `replace` et non `patch` : une traduction qui réussit après un échec doit
    // PERDRE son `error`, et une qui échoue après un succès doit perdre ses
    // `fields`. Un patch laisserait les deux cohabiter, et la page afficherait
    // un texte périmé sous un message d'erreur.
    const row = {
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      sourceLocale: args.sourceLocale,
      targetLocale: args.targetLocale,
      sourceHash: args.sourceHash,
      status: args.status,
      ...(args.fields ? { fields: args.fields } : {}),
      ...(args.model ? { model: args.model } : {}),
      ...(args.error ? { error: args.error } : {}),
      ...(args.requestedBy ? { requestedBy: args.requestedBy } : {}),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    if (existing) await ctx.db.replace(existing._id, row);
    else await ctx.db.insert('contentTranslations', row);
    return null;
  },
});

/**
 * Consomme un jeton de débit AVANT l'appel au modèle.
 *
 * Une action n'a pas de transaction : le quota se prend donc dans une mutation
 * à part, et il est pris même si la traduction échoue ensuite. C'est voulu —
 * ce qui coûte, c'est l'appel, pas son résultat.
 */
export const consumeQuota = internalMutation({
  args: { key: v.string() },
  returns: v.null(),
  handler: async (ctx, { key }) => {
    await enforceRateLimit(ctx, {
      key,
      // Dix traductions par heure et par acteur. Une page de lecture en
      // demande une ; dix, c'est déjà un usage inhabituel, et le cache sert
      // tous les lecteurs suivants sans rien consommer.
      max: 10,
      windowMs: 60 * 60 * 1000,
    });
    return null;
  },
});

// --- Temps 2 : l'appel ------------------------------------------------------

const requestResultValidator = v.object({
  ok: v.boolean(),
  /** Code stable, journalisé et affiché traduit. */
  code: v.optional(v.string()),
});

/**
 * Traduit un contenu vers une langue, et met le résultat en cache.
 *
 * Idempotente à la lecture près : si une traduction À JOUR existe déjà, l'appel
 * ne consomme ni quota ni jeton de modèle. C'est ce qui rend sûr d'appeler
 * cette action depuis un bouton que plusieurs lecteurs peuvent presser en même
 * temps.
 */
export const requestTranslation = action({
  args: {
    sourceType: translationSourceType,
    sourceId: v.string(),
    targetLocale: locale,
  },
  returns: requestResultValidator,
  handler: async (ctx, args): Promise<{ ok: boolean; code?: string }> => {
    const userId = await getAuthUserId(ctx);

    const context = await ctx.runQuery(internal.translation.loadSource, {
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      targetLocale: args.targetLocale,
      userId,
    });
    if (!context.ok) return { ok: false, code: context.reason };

    // Déjà traduit et à jour : on ne rappelle pas le modèle. La vérification
    // est ici plutôt que dans le client, parce que c'est ici qu'elle protège
    // la dépense.
    const cached: { status: string; fresh: boolean } | null =
      await ctx.runQuery(internal.translation.peekCached, {
        sourceType: args.sourceType,
        sourceId: args.sourceId,
        targetLocale: args.targetLocale,
        fingerprint: context.fingerprint,
      });
    if (cached?.status === 'ready' && cached.fresh) return { ok: true };

    if (!isGatewayConfigured()) {
      await persistFailure(
        ctx,
        args,
        context,
        userId,
        GATEWAY_ERRORS.NOT_CONFIGURED,
      );
      return { ok: false, code: GATEWAY_ERRORS.NOT_CONFIGURED };
    }

    // Le quota est pris au nom de l'utilisateur quand il y en a un, et du
    // contenu sinon : un visiteur anonyme ne doit pas pouvoir épuiser le quota
    // de tous les autres en changeant d'onglet.
    try {
      await ctx.runMutation(internal.translation.consumeQuota, {
        key: userId
          ? `translate:user:${userId}`
          : `translate:anon:${args.sourceType}:${args.sourceId}`,
      });
    } catch (error) {
      if (error instanceof ConvexError)
        return { ok: false, code: 'RATE_LIMITED' };
      throw error;
    }

    const model = translationModel();
    const result = await runStructured({
      model,
      instructions: buildTranslationInstructions(
        context.sourceLocale,
        args.targetLocale,
      ),
      userText: buildTranslationInput(context.fields),
      schemaName: 'translation',
      schema: buildTranslationSchema(context.fields),
      maxOutputTokens: outputTokenBudget(context.fields),
    });

    if (!result.ok) {
      await persistFailure(ctx, args, context, userId, result.code);
      return { ok: false, code: result.code };
    }

    // La sortie est revalidée ici : le schéma est appliqué PAR LA PASSERELLE,
    // et une traduction dont il manquerait un paragraphe doit être refusée
    // plutôt que servie amputée.
    const translated = parseTranslation(context.fields, result.data);
    if (!translated) {
      await persistFailure(
        ctx,
        args,
        context,
        userId,
        GATEWAY_ERRORS.BAD_RESPONSE,
      );
      return { ok: false, code: GATEWAY_ERRORS.BAD_RESPONSE };
    }

    await ctx.runMutation(internal.translation.saveTranslation, {
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      sourceLocale: context.sourceLocale,
      targetLocale: args.targetLocale,
      sourceHash: context.fingerprint,
      status: 'ready',
      fields: translated,
      model: result.model,
      requestedBy: userId,
    });
    return { ok: true };
  },
});

type FailureContext = { sourceLocale: SiteLocale; fingerprint: string };

async function persistFailure(
  ctx: ActionCtx,
  args: {
    sourceType: TranslationSourceType;
    sourceId: string;
    targetLocale: SiteLocale;
  },
  context: FailureContext,
  userId: Id<'users'> | null,
  code: string,
): Promise<void> {
  // Une trace est écrite MÊME quand l'appel n'a pas eu lieu (clé absente,
  // quota) : sans elle, la page ne pourrait qu'afficher indéfiniment le même
  // bouton, et personne ne saurait que le dispositif est en panne.
  await ctx.runMutation(internal.translation.saveTranslation, {
    sourceType: args.sourceType,
    sourceId: args.sourceId,
    sourceLocale: context.sourceLocale,
    targetLocale: args.targetLocale,
    sourceHash: context.fingerprint,
    status: 'failed',
    error: code,
    requestedBy: userId,
  });
}

export const peekCached = internalQuery({
  args: {
    sourceType: translationSourceType,
    sourceId: v.string(),
    targetLocale: locale,
    fingerprint: v.string(),
  },
  returns: v.union(
    v.object({ status: translationStatus, fresh: v.boolean() }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const row: Doc<'contentTranslations'> | null = await ctx.db
      .query('contentTranslations')
      .withIndex('by_source_and_target', (q) =>
        q
          .eq('sourceType', args.sourceType)
          .eq('sourceId', args.sourceId)
          .eq('targetLocale', args.targetLocale),
      )
      .unique();
    if (!row) return null;
    return { status: row.status, fresh: row.sourceHash === args.fingerprint };
  },
});
