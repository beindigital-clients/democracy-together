import { v } from 'convex/values';
import { paginationOptsValidator } from 'convex/server';
import {
  query,
  mutation,
  action,
  internalQuery,
  internalMutation,
  internalAction,
  type QueryCtx,
  type MutationCtx,
} from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { requireNetworkRole } from './lib/rbac';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { notify } from './lib/notify';
import { consumeRateLimit } from './lib/rateLimit';
import {
  bumpCounter,
  COUNTER,
  readCounters,
  trackPublicationStatus,
} from './lib/counters';
import { clampPageSize, paginatedValidator } from './lib/pagination';
import { PUB_TYPES } from './lib/publications';
import {
  isGatewayConfigured,
  runStructuredAnalysis,
  toBase64,
  GATEWAY_ERRORS,
  type GatewayAttachment,
} from './lib/aiGateway';
import {
  APPLY_REASONS,
  BASELINE_RULES,
  DEFAULT_SETTINGS,
  SETTINGS_BOUNDS,
  aiModerationApplied,
  aiModerationMode,
  aiModerationSeverity,
  aiModerationVerdict,
  buildDocumentPrompt,
  buildResponseSchema,
  buildRuleset,
  buildSystemPrompt,
  countSignals,
  decideApplication,
  parseVerdict,
  shouldAlertStaff,
  type AiDocument,
  type AiFinding,
  type AiMode,
  type AiModerationSettings,
  type AiRule,
} from './lib/aiModeration';

// MODÉRATION ÉDITORIALE ASSISTÉE PAR IA — orchestration.
//
// Le dispositif en une phrase : à la soumission d'un dépôt (F-32), une action
// interne fait analyser le document par un modèle via la passerelle Vercel,
// puis une mutation décide — en relisant l'état courant — de publier ou de
// laisser la main à un humain.
//
// TROIS INVARIANTS, tenus par le code et couverts par convex/aiModeration.test.ts :
//
//  1. RIEN N'EST PUBLIÉ SUR UN SILENCE. Clé absente, passerelle injoignable,
//     réponse illisible, plafond de coût atteint : le dépôt reste `pending`.
//     C'est le fail-closed de `lib/recaptcha.ts`, appliqué à une décision de
//     publication — l'absence d'avis n'est jamais un avis favorable.
//  2. LE MODÈLE PROPOSE, LE SERVEUR DÉCIDE. `applyVerdict` relit le mode, le
//     périmètre, le seuil ET l'état de la publication DANS LA TRANSACTION qui
//     écrit. Un avis « conforme » ne publie rien si l'administrateur a éteint
//     le dispositif entre-temps, ou si un modérateur a déjà tranché.
//  3. TOUT EST TRAÇABLE. Chaque analyse écrit une ligne `aiModerationReviews`
//     — y compris celles qui échouent, sans quoi le journal ferait paraître le
//     dispositif plus fiable qu'il n'est — et chaque mise en ligne automatique
//     écrit une entrée d'audit à elle.
//
// Le découpage query/action/mutation n'est pas un choix de style : une
// mutation Convex n'a pas `fetch`, et une action n'a pas de transaction. D'où
// trois temps — lire le contexte (internalQuery), appeler le modèle
// (internalAction), appliquer (internalMutation) — et d'où, aussi, la
// nécessité de revérifier en temps 3 ce qui était vrai en temps 1.

// --- Réglages : lecture ------------------------------------------------------

const SETTINGS_KEY = 'default' as const;

async function loadConfigDoc(
  ctx: QueryCtx,
): Promise<Doc<'aiModerationConfig'> | null> {
  return await ctx.db
    .query('aiModerationConfig')
    .withIndex('by_key', (q) => q.eq('key', SETTINGS_KEY))
    .unique();
}

// Réglages effectifs. Un déploiement qui n'a jamais ouvert le panneau n'a pas
// de ligne : il obtient DEFAULT_SETTINGS, donc `mode: 'off'`. La
// fonctionnalité déployée est inerte tant que personne ne l'a armée.
export async function loadSettings(
  ctx: QueryCtx,
): Promise<AiModerationSettings> {
  const doc = await loadConfigDoc(ctx);
  if (!doc) return DEFAULT_SETTINGS;
  return {
    mode: doc.mode,
    model: doc.model,
    fallbackModel: doc.fallbackModel,
    autoPublishMinConfidence: doc.autoPublishMinConfidence,
    instructions: doc.instructions,
    eligibleTypes: doc.eligibleTypes,
    analyzeAttachments: doc.analyzeAttachments,
    maxAttachmentMb: doc.maxAttachmentMb,
    dailyCallCap: doc.dailyCallCap,
    version: doc.version,
  };
}

// Barème de l'administrateur, règles actives seulement, dans son ordre.
async function loadEnabledRules(ctx: QueryCtx): Promise<AiRule[]> {
  const rows = await ctx.db
    .query('aiModerationRules')
    .withIndex('by_order')
    .take(SETTINGS_BOUNDS.maxRules);
  return rows
    .filter((r) => r.enabled)
    .map((r) => ({
      // La clé du critère est son identifiant, tel quel : c'est ce qui permet
      // à un avis de nommer la règle qui l'a produit après sa suppression.
      key: r._id,
      label: r.label,
      description: r.description,
      severity: r.severity,
    }));
}

// --- Validateurs de retour ---------------------------------------------------

const ruleValidator = v.object({
  key: v.string(),
  label: v.string(),
  description: v.string(),
  severity: aiModerationSeverity,
});

const findingValidator = v.object({
  ruleKey: v.string(),
  ruleLabel: v.string(),
  severity: aiModerationSeverity,
  outcome: v.union(v.literal('pass'), v.literal('fail'), v.literal('unsure')),
  explanation: v.string(),
  quote: v.optional(v.string()),
});

const settingsValidator = v.object({
  mode: aiModerationMode,
  model: v.string(),
  fallbackModel: v.union(v.string(), v.null()),
  autoPublishMinConfidence: v.number(),
  instructions: v.string(),
  eligibleTypes: v.array(v.string()),
  analyzeAttachments: v.boolean(),
  maxAttachmentMb: v.number(),
  dailyCallCap: v.number(),
  version: v.number(),
});

const reviewValidator = v.object({
  _id: v.id('aiModerationReviews'),
  publicationId: v.id('publications'),
  verdict: aiModerationVerdict,
  applied: aiModerationApplied,
  reason: v.string(),
  confidence: v.number(),
  summary: v.string(),
  findings: v.array(findingValidator),
  model: v.string(),
  configVersion: v.number(),
  attachmentAnalyzed: v.boolean(),
  promptTokens: v.union(v.number(), v.null()),
  completionTokens: v.union(v.number(), v.null()),
  latencyMs: v.union(v.number(), v.null()),
  error: v.union(v.string(), v.null()),
  createdAt: v.number(),
});

function projectReview(doc: Doc<'aiModerationReviews'>) {
  return {
    _id: doc._id,
    publicationId: doc.publicationId,
    verdict: doc.verdict,
    applied: doc.applied,
    reason: doc.reason,
    confidence: doc.confidence,
    summary: doc.summary,
    findings: doc.findings,
    model: doc.model,
    configVersion: doc.configVersion,
    attachmentAnalyzed: doc.attachmentAnalyzed,
    promptTokens: doc.promptTokens ?? null,
    completionTokens: doc.completionTokens ?? null,
    latencyMs: doc.latencyMs ?? null,
    error: doc.error ?? null,
    createdAt: doc.createdAt,
  };
}

// Forme de TRANSIT des réglages : ce que traversent une frontière de
// validateur Convex (`v.union(v.string(), v.null())`, pas d'`undefined`).
// `fromWire` la reconvertit en réglages applicatifs — sans quoi un
// `fallbackModel` absent voyagerait en `null` et cesserait d'être un
// « pas de repli » pour devenir un modèle nommé « null ».
type WireSettings = {
  mode: AiMode;
  model: string;
  fallbackModel: string | null;
  autoPublishMinConfidence: number;
  instructions: string;
  eligibleTypes: string[];
  analyzeAttachments: boolean;
  maxAttachmentMb: number;
  dailyCallCap: number;
  version: number;
};

function fromWire(s: WireSettings): AiModerationSettings {
  return {
    mode: s.mode,
    model: s.model,
    ...(s.fallbackModel ? { fallbackModel: s.fallbackModel } : {}),
    autoPublishMinConfidence: s.autoPublishMinConfidence,
    instructions: s.instructions,
    eligibleTypes: s.eligibleTypes,
    analyzeAttachments: s.analyzeAttachments,
    maxAttachmentMb: s.maxAttachmentMb,
    dailyCallCap: s.dailyCallCap,
    version: s.version,
  };
}

function settingsOut(s: AiModerationSettings): WireSettings {
  return {
    mode: s.mode,
    model: s.model,
    fallbackModel: s.fallbackModel ?? null,
    autoPublishMinConfidence: s.autoPublishMinConfidence,
    instructions: s.instructions,
    eligibleTypes: [...s.eligibleTypes],
    analyzeAttachments: s.analyzeAttachments,
    maxAttachmentMb: s.maxAttachmentMb,
    dailyCallCap: s.dailyCallCap,
    version: s.version,
  };
}

// --- Panneau d'administration : lecture --------------------------------------

// Réglages + barème + socle + état de la clé. Réservé à l'administrateur :
// c'est l'écran qui décide de ce qui se publie sans relecture.
//
// `configured` dit si la clé de passerelle est posée sur le déploiement. C'est
// une information SERVEUR — la clé ne sort jamais, seul son existence est
// rapportée — et elle évite le scénario où l'on arme le mode `auto` sur un
// déploiement qui ne peut appeler personne, pour ne le découvrir qu'au
// premier dépôt resté en file sans explication.
export const getSettings = query({
  args: {},
  returns: v.object({
    settings: settingsValidator,
    rules: v.array(
      v.object({
        _id: v.id('aiModerationRules'),
        label: v.string(),
        description: v.string(),
        severity: aiModerationSeverity,
        enabled: v.boolean(),
        order: v.number(),
      }),
    ),
    baseline: v.array(ruleValidator),
    configured: v.boolean(),
    availableTypes: v.array(v.string()),
    stats: v.object({
      analyzed: v.number(),
      published: v.number(),
      escalated: v.number(),
    }),
  }),
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'admin');
    const rows = await ctx.db
      .query('aiModerationRules')
      .withIndex('by_order')
      .take(SETTINGS_BOUNDS.maxRules);
    const counts = await readCounters(ctx, [
      COUNTER.AI_REVIEWS,
      COUNTER.AI_REVIEWS_PUBLISHED,
      COUNTER.AI_REVIEWS_ESCALATED,
    ]);
    return {
      settings: settingsOut(await loadSettings(ctx)),
      rules: rows.map((r) => ({
        _id: r._id,
        label: r.label,
        description: r.description,
        severity: r.severity,
        enabled: r.enabled,
        order: r.order,
      })),
      baseline: BASELINE_RULES.map((r) => ({ ...r })),
      configured: isGatewayConfigured(),
      availableTypes: [...PUB_TYPES],
      stats: {
        analyzed: counts[COUNTER.AI_REVIEWS],
        published: counts[COUNTER.AI_REVIEWS_PUBLISHED],
        escalated: counts[COUNTER.AI_REVIEWS_ESCALATED],
      },
    };
  },
});

// --- Panneau d'administration : écriture -------------------------------------

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

// Écrit les réglages et incrémente la version.
//
// Les bornes sont appliquées ICI, pas seulement dans le formulaire : l'écran
// n'est qu'un confort, et un seuil de confiance à 0 posé par un appel direct
// ouvrirait l'auto-publication à tout.
export const updateSettings = mutation({
  args: {
    mode: aiModerationMode,
    model: v.string(),
    fallbackModel: v.optional(v.string()),
    autoPublishMinConfidence: v.number(),
    instructions: v.string(),
    eligibleTypes: v.array(v.string()),
    analyzeAttachments: v.boolean(),
    maxAttachmentMb: v.number(),
    dailyCallCap: v.number(),
  },
  returns: v.object({ version: v.number() }),
  handler: async (ctx, args) => {
    const admin = await requireNetworkRole(ctx, 'admin');

    const model = args.model.trim();
    if (model.length < 3 || model.length > 120)
      throw new Error('INVALID_MODEL');
    const fallbackModel = args.fallbackModel?.trim() || undefined;
    if (fallbackModel && fallbackModel.length > 120)
      throw new Error('INVALID_MODEL');

    // Périmètre : seuls les types du vocabulaire fermé sont retenus. Un slug
    // inconnu ne peut donc pas élargir l'auto-publication à des dépôts que le
    // panneau ne montre pas.
    const eligibleTypes = [
      ...new Set(
        args.eligibleTypes.filter((t) =>
          (PUB_TYPES as readonly string[]).includes(t),
        ),
      ),
    ];

    const next = {
      mode: args.mode,
      model,
      fallbackModel,
      autoPublishMinConfidence: clampNumber(
        args.autoPublishMinConfidence,
        SETTINGS_BOUNDS.confidence.min,
        SETTINGS_BOUNDS.confidence.max,
      ),
      instructions: args.instructions
        .trim()
        .slice(0, SETTINGS_BOUNDS.instructionsMaxLength),
      eligibleTypes,
      analyzeAttachments: args.analyzeAttachments,
      maxAttachmentMb: clampNumber(
        args.maxAttachmentMb,
        SETTINGS_BOUNDS.attachmentMb.min,
        SETTINGS_BOUNDS.attachmentMb.max,
      ),
      dailyCallCap: clampNumber(
        args.dailyCallCap,
        SETTINGS_BOUNDS.dailyCap.min,
        SETTINGS_BOUNDS.dailyCap.max,
      ),
      updatedBy: admin._id,
      updatedAt: Date.now(),
    };

    const existing = await loadConfigDoc(ctx);
    const version = (existing?.version ?? 0) + 1;
    if (existing) {
      await ctx.db.patch(existing._id, { ...next, version });
    } else {
      await ctx.db.insert('aiModerationConfig', {
        key: SETTINGS_KEY,
        ...next,
        version,
      });
    }

    // Le mode est la seule valeur qui change ce que la plateforme fait sans
    // humain : il est nommé dans l'audit, pas noyé dans un « réglages
    // modifiés ».
    await recordAudit(ctx, {
      actorId: admin._id,
      action: AUDIT.AI_MODERATION_CONFIGURED,
      metadata: {
        mode: next.mode,
        model: next.model,
        minConfidence: next.autoPublishMinConfidence,
        eligibleTypes,
        version,
      },
    });
    return { version };
  },
});

// Incrémente la version des réglages après une modification du barème : un
// avis rendu doit pouvoir être rapporté à l'état EXACT du barème qui l'a
// produit, et une règle ajoutée change ce barème autant qu'un seuil déplacé.
async function bumpConfigVersion(ctx: MutationCtx, actorId: Id<'users'>) {
  const existing = await loadConfigDoc(ctx);
  if (existing) {
    await ctx.db.patch(existing._id, {
      version: existing.version + 1,
      updatedBy: actorId,
      updatedAt: Date.now(),
    });
    return;
  }
  await ctx.db.insert('aiModerationConfig', {
    key: SETTINGS_KEY,
    ...DEFAULT_SETTINGS,
    fallbackModel: DEFAULT_SETTINGS.fallbackModel,
    eligibleTypes: [...DEFAULT_SETTINGS.eligibleTypes],
    version: 1,
    updatedBy: actorId,
    updatedAt: Date.now(),
  });
}

export const upsertRule = mutation({
  args: {
    ruleId: v.optional(v.id('aiModerationRules')),
    label: v.string(),
    description: v.string(),
    severity: aiModerationSeverity,
    enabled: v.boolean(),
  },
  returns: v.object({ ruleId: v.id('aiModerationRules') }),
  handler: async (ctx, args) => {
    const admin = await requireNetworkRole(ctx, 'admin');
    const label = args.label
      .trim()
      .slice(0, SETTINGS_BOUNDS.ruleLabelMaxLength);
    const description = args.description
      .trim()
      .slice(0, SETTINGS_BOUNDS.ruleDescriptionMaxLength);
    if (label.length < 3) throw new Error('INVALID_RULE_LABEL');
    // Un critère sans énoncé ne s'évalue pas : c'est la description, et elle
    // seule, qui est soumise au modèle. Un libellé n'est qu'une étiquette
    // d'écran.
    if (description.length < 10) throw new Error('INVALID_RULE_DESCRIPTION');

    const now = Date.now();
    if (args.ruleId) {
      const existing = await ctx.db.get(args.ruleId);
      if (!existing) throw new Error('NOT_FOUND');
      await ctx.db.patch(args.ruleId, {
        label,
        description,
        severity: args.severity,
        enabled: args.enabled,
        updatedAt: now,
      });
      await bumpConfigVersion(ctx, admin._id);
      await recordAudit(ctx, {
        actorId: admin._id,
        action: AUDIT.AI_MODERATION_RULE_CHANGED,
        targetId: args.ruleId,
        metadata: { change: 'updated', label, severity: args.severity },
      });
      return { ruleId: args.ruleId };
    }

    // Plafond du barème : au-delà, le prompt grossit sans que la qualité de
    // l'arbitrage suive, et le coût par dépôt monte pour rien.
    const count = (
      await ctx.db
        .query('aiModerationRules')
        .withIndex('by_order')
        .take(SETTINGS_BOUNDS.maxRules)
    ).length;
    if (count >= SETTINGS_BOUNDS.maxRules) throw new Error('TOO_MANY_RULES');

    const ruleId = await ctx.db.insert('aiModerationRules', {
      label,
      description,
      severity: args.severity,
      enabled: args.enabled,
      order: count,
      createdBy: admin._id,
      createdAt: now,
      updatedAt: now,
    });
    await bumpConfigVersion(ctx, admin._id);
    await recordAudit(ctx, {
      actorId: admin._id,
      action: AUDIT.AI_MODERATION_RULE_CHANGED,
      targetId: ruleId,
      metadata: { change: 'created', label, severity: args.severity },
    });
    return { ruleId };
  },
});

export const deleteRule = mutation({
  args: { ruleId: v.id('aiModerationRules') },
  returns: v.null(),
  handler: async (ctx, { ruleId }) => {
    const admin = await requireNetworkRole(ctx, 'admin');
    const existing = await ctx.db.get(ruleId);
    if (!existing) throw new Error('NOT_FOUND');
    await ctx.db.delete(ruleId);
    await bumpConfigVersion(ctx, admin._id);
    // Les avis déjà rendus gardent le libellé de la règle supprimée : c'est
    // pourquoi `findings.ruleKey` est une chaîne et non un `v.id`. Un barème
    // qui évolue ne doit pas rendre illisibles les décisions passées.
    await recordAudit(ctx, {
      actorId: admin._id,
      action: AUDIT.AI_MODERATION_RULE_CHANGED,
      targetId: ruleId,
      metadata: { change: 'deleted', label: existing.label },
    });
    return null;
  },
});

// --- Lecture des avis (file de modération et journal) ------------------------

export const getReview = query({
  args: { publicationId: v.id('publications') },
  returns: v.union(reviewValidator, v.null()),
  handler: async (ctx, { publicationId }) => {
    await requireNetworkRole(ctx, 'moderateur');
    // Le DERNIER avis : une publication rouverte, ou analysée à la demande,
    // en porte plusieurs, et c'est le plus récent qui décrit l'état courant.
    const latest = await ctx.db
      .query('aiModerationReviews')
      .withIndex('by_publication', (q) => q.eq('publicationId', publicationId))
      .order('desc')
      .first();
    return latest ? projectReview(latest) : null;
  },
});

export const listReviews = query({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginatedValidator(
    v.object({
      ...reviewValidator.fields,
      publicationTitle: v.union(v.string(), v.null()),
      publicationSlug: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, { paginationOpts }) => {
    await requireNetworkRole(ctx, 'moderateur');
    const result = await ctx.db
      .query('aiModerationReviews')
      .order('desc')
      .paginate(clampPageSize(paginationOpts));
    return {
      ...result,
      page: await Promise.all(
        result.page.map(async (doc) => {
          const pub = await ctx.db.get(doc.publicationId);
          return {
            ...projectReview(doc),
            publicationTitle: pub?.title ?? null,
            publicationSlug: pub?.slug ?? null,
          };
        }),
      ),
    };
  },
});

// --- Déclenchement manuel ----------------------------------------------------

// « Analyser ce dépôt » depuis la file de modération (modérateur+).
//
// Utile dans deux cas que le déclenchement automatique ne couvre pas : un
// dépôt arrivé alors que le dispositif était éteint, et un dépôt qu'on veut
// réexaminer après avoir durci le barème. Le mode `off` reste respecté — on
// ne rallume pas le dispositif par un bouton.
export const requestReview = mutation({
  args: { publicationId: v.id('publications') },
  returns: v.object({ scheduled: v.boolean() }),
  handler: async (ctx, { publicationId }) => {
    const staff = await requireNetworkRole(ctx, 'moderateur');
    const pub = await ctx.db.get(publicationId);
    if (!pub) throw new Error('NOT_FOUND');
    // Un dépôt déjà tranché n'a plus rien à gagner à une analyse, et
    // `reviewContext` l'écarterait de toute façon. Le dire ICI évite
    // d'annoncer au modérateur une analyse dont aucun avis ne sortira.
    if (pub.status !== 'pending') return { scheduled: false };
    const settings = await loadSettings(ctx);
    if (settings.mode === 'off') return { scheduled: false };
    await ctx.scheduler.runAfter(0, internal.aiModeration.runReview, {
      publicationId,
      triggeredBy: staff._id,
    });
    return { scheduled: true };
  },
});

// --- Orchestration : temps 1, lire le contexte -------------------------------

const contextValidator = v.union(
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
      fileName: v.union(v.string(), v.null()),
    }),
    file: v.union(
      v.null(),
      v.object({
        id: v.id('_storage'),
        size: v.number(),
        contentType: v.union(v.string(), v.null()),
      }),
    ),
    settings: settingsValidator,
    rules: v.array(ruleValidator),
  }),
);

// Forme lue par l'action. Écrite à la main plutôt qu'inférée : l'action et la
// query vivant dans le même fichier, l'inférence y serait circulaire.
type ReviewContext = {
  document: AiDocument & { fileName: string | null };
  file: { id: Id<'_storage'>; size: number; contentType: string | null } | null;
  settings: WireSettings;
  rules: AiRule[];
} | null;

export const reviewContext = internalQuery({
  args: { publicationId: v.id('publications') },
  returns: contextValidator,
  handler: async (ctx, { publicationId }) => {
    const pub = await ctx.db.get(publicationId);
    // Un dépôt déjà tranché n'a plus à être analysé : l'analyse coûte un appel
    // et ne peut plus rien changer.
    if (!pub || pub.status !== 'pending') return null;
    const settings = await loadSettings(ctx);
    if (settings.mode === 'off') return null;

    // Les métadonnées du blob viennent de la table système, jamais du client
    // (même défiance que `submitPublication`) : c'est la taille RÉELLE qui
    // décide si le fichier part chez le modèle.
    const meta = pub.fileId ? await ctx.db.system.get(pub.fileId) : null;

    return {
      document: {
        title: pub.title,
        type: pub.type,
        theme: pub.theme,
        region: pub.region,
        languages: [...pub.languages],
        year: pub.year,
        authors: pub.authors.map((a) => ({ name: a.name, role: a.role })),
        abstract: pub.abstract,
        keypoints: [...pub.keypoints],
        body: [...pub.body],
        fileName: pub.fileName ?? null,
      },
      file:
        pub.fileId && meta
          ? {
              id: pub.fileId,
              size: meta.size,
              contentType: meta.contentType ?? null,
            }
          : null,
      settings: settingsOut(settings),
      rules: await loadEnabledRules(ctx),
    };
  },
});

// Réserve un appel sur le quota quotidien. Consomme le jeton DANS une
// transaction, avant l'appel : deux dépôts simultanés ne peuvent pas passer
// tous les deux par le dernier jeton.
export const reserveCall = internalMutation({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const settings = await loadSettings(ctx);
    return await consumeRateLimit(ctx, {
      key: 'aiModeration:daily',
      max: settings.dailyCallCap,
      windowMs: 24 * 60 * 60 * 1000,
    });
  },
});

// --- Orchestration : temps 3, appliquer --------------------------------------

export const applyVerdict = internalMutation({
  args: {
    publicationId: v.id('publications'),
    verdict: aiModerationVerdict,
    confidence: v.number(),
    summary: v.string(),
    findings: v.array(findingValidator),
    model: v.string(),
    configVersion: v.number(),
    hasAttachment: v.boolean(),
    attachmentAnalyzed: v.boolean(),
    promptTokens: v.optional(v.number()),
    completionTokens: v.optional(v.number()),
    latencyMs: v.optional(v.number()),
    error: v.optional(v.string()),
    triggeredBy: v.optional(v.id('users')),
  },
  returns: v.object({ applied: aiModerationApplied, reason: v.string() }),
  handler: async (ctx, args) => {
    const pub = await ctx.db.get(args.publicationId);
    // La publication a disparu entre l'analyse et son application : on
    // n'écrit pas un avis orphelin dont la ligne de journal ne pourrait plus
    // nommer sa cible.
    if (!pub)
      return {
        applied: 'superseded' as const,
        reason: APPLY_REASONS.ALREADY_DECIDED,
      };

    // Les réglages sont RELUS ici, dans la transaction qui écrit. Entre le
    // déclenchement et maintenant, un administrateur a pu éteindre le
    // dispositif, resserrer le périmètre ou monter le seuil : c'est l'état au
    // moment de PUBLIER qui fait foi, pas celui au moment de demander.
    const settings = await loadSettings(ctx);
    const decision = decideApplication({
      mode: settings.mode,
      verdict: args.verdict,
      confidence: args.confidence,
      findings: args.findings,
      publicationType: pub.type,
      eligibleTypes: settings.eligibleTypes,
      minConfidence: settings.autoPublishMinConfidence,
      hasAttachment: args.hasAttachment,
      attachmentAnalyzed: args.attachmentAnalyzed,
    });

    // Un modérateur a tranché pendant l'analyse. La décision humaine gagne,
    // sans discussion : l'avis est conservé pour le journal, il n'est pas
    // appliqué.
    //
    // C'est la même garde que l'arête `pending -> published` de la machine de
    // `publications.ts` (assertTransition). Elle est écrite ici en condition
    // et non en `throw` parce qu'un refus de transition n'est pas, dans ce
    // contexte, une erreur à remonter : c'est une ISSUE à journaliser.
    const superseded = pub.status !== 'pending';
    const applied = superseded ? ('superseded' as const) : decision.applied;
    const reason = superseded ? APPLY_REASONS.ALREADY_DECIDED : decision.reason;

    const now = Date.now();
    const signals = countSignals(args.findings);

    if (applied === 'published') {
      await ctx.db.patch(args.publicationId, {
        status: 'published',
        publishedAt: pub.publishedAt || now,
        doi: pub.doi || `10.59000/dt.${pub.slug}`,
        // `reviewedBy` reste VIDE : personne n'a relu. C'est ce vide, lu avec
        // `autoPublished`, qui permet à la file d'afficher « publiée sans
        // relecture humaine » plutôt que d'attribuer la décision à quelqu'un.
        reviewedAt: now,
        autoPublished: true,
      });
      await trackPublicationStatus(ctx, pub.status, 'published');
    }

    // Résumé dénormalisé — écrit dès que le dispositif est VISIBLE. La file
    // doit pouvoir dire « analysé, mis en attente pour telle raison » plutôt
    // que rester muette.
    //
    // Sauf en mode observation, et c'est toute la définition de ce mode :
    // l'analyse tourne, le journal la garde, mais RIEN n'atteint la file. Un
    // badge posé ici suffirait à orienter la décision du modérateur, et
    // l'observation cesserait d'observer — elle influencerait ce qu'elle
    // mesure, ce qui la rend inutile comme étape de calibrage. L'avis complet
    // reste lisible dans le journal de /admin/moderation-ia, qui est
    // l'endroit où on le relit pour régler le barème.
    if (applied !== 'shadow') {
      await ctx.db.patch(args.publicationId, {
        aiReview: {
          verdict: args.verdict,
          applied,
          reason,
          confidence: args.confidence,
          blocking: signals.blocking,
          warnings: signals.warnings,
          at: now,
        },
      });
    }

    await ctx.db.insert('aiModerationReviews', {
      publicationId: args.publicationId,
      verdict: args.verdict,
      applied,
      reason,
      confidence: args.confidence,
      summary: args.summary,
      findings: args.findings,
      model: args.model,
      configVersion: args.configVersion,
      attachmentAnalyzed: args.attachmentAnalyzed,
      promptTokens: args.promptTokens,
      completionTokens: args.completionTokens,
      latencyMs: args.latencyMs,
      error: args.error,
      triggeredBy: args.triggeredBy,
      createdAt: now,
    });

    await bumpCounter(ctx, COUNTER.AI_REVIEWS, 1);
    if (applied === 'published')
      await bumpCounter(ctx, COUNTER.AI_REVIEWS_PUBLISHED, 1);
    if (applied === 'escalated')
      await bumpCounter(ctx, COUNTER.AI_REVIEWS_ESCALATED, 1);

    // L'auteur apprend la mise en ligne par le MÊME message que pour une
    // approbation humaine : de son point de vue, sa publication est en ligne.
    if (applied === 'published' && pub.authorUserId) {
      await notify(ctx, {
        userId: pub.authorUserId,
        type: 'publication_published',
        titleKey: 'pubPublished',
        params: { title: pub.title },
        link: `/bibliotheque/${pub.slug}`,
      });
    }

    // « Faire intervenir l'administrateur » : un signal BLOQUANT sort le
    // dossier du rythme normal de la file et va chercher quelqu'un. Les
    // signaux d'avertissement, eux, attendent leur tour — notifier sur tout
    // reviendrait à ne notifier sur rien.
    if (shouldAlertStaff(applied, args.verdict, args.findings)) {
      await alertStaff(ctx, pub.title, args.publicationId);
    }

    await recordAudit(ctx, {
      actorId: args.triggeredBy,
      action:
        applied === 'published'
          ? AUDIT.PUBLICATION_AI_PUBLISHED
          : AUDIT.PUBLICATION_AI_REVIEWED,
      targetId: args.publicationId,
      metadata: {
        verdict: args.verdict,
        applied,
        reason,
        confidence: args.confidence,
        model: args.model,
        configVersion: args.configVersion,
        blocking: signals.blocking,
        warnings: signals.warnings,
        ...(args.error ? { error: args.error } : {}),
      },
    });

    return { applied, reason };
  },
});

// Prévient le staff (modérateur et au-dessus). Même lecture indexée que le
// sélecteur de relecteurs (peerReview.listStaffUsers) : on ne parcourt pas la
// table `users` pour en garder quelques comptes.
const STAFF_ROLES = ['moderateur', 'editeur', 'admin'] as const;
const STAFF_PER_ROLE_MAX = 200;

async function alertStaff(
  ctx: MutationCtx,
  title: string,
  publicationId: Id<'publications'>,
) {
  const byRole = await Promise.all(
    STAFF_ROLES.map((role) =>
      ctx.db
        .query('users')
        .withIndex('by_role', (q) => q.eq('role', role))
        .take(STAFF_PER_ROLE_MAX),
    ),
  );
  for (const user of byRole.flat()) {
    await notify(ctx, {
      userId: user._id,
      type: 'publication_ai_flagged',
      titleKey: 'pubAiFlagged',
      params: { title },
      link: `/admin/publications?pub=${publicationId}`,
    });
  }
}

// --- Orchestration : temps 2, l'appel ----------------------------------------

// Jetons de sortie. L'avis est structuré et borné (résumé court, un constat
// par critère) : de quoi laisser respirer un barème fourni sans payer une
// dissertation.
const MAX_OUTPUT_TOKENS = 4000;

type AnalysisOutcome = {
  verdict: 'approve' | 'flag' | 'reject' | 'error';
  confidence: number;
  summary: string;
  findings: AiFinding[];
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  error?: string;
};

// Analyse un document : construit le barème, appelle la passerelle (avec un
// repli si un modèle de secours est réglé), normalise la réponse.
//
// Ne lève jamais. Tout échec devient un avis `error` — journalisable, et qui
// laisse le dépôt en file par construction (cf. `decideApplication`).
async function analyse(
  document: AiDocument,
  settings: AiModerationSettings,
  adminRules: readonly AiRule[],
  attachment: GatewayAttachment | null,
  hasAttachment: boolean,
): Promise<AnalysisOutcome> {
  const rules = buildRuleset(adminRules);
  const instructions = buildSystemPrompt(rules, settings.instructions, {
    hasAttachment,
    attachmentAnalyzed: attachment !== null,
  });
  const userText = buildDocumentPrompt(document);
  const schema = buildResponseSchema(rules);

  const models = [settings.model, settings.fallbackModel].filter(
    (m): m is string => Boolean(m),
  );
  let lastError: string = GATEWAY_ERRORS.NOT_CONFIGURED;
  let lastDetail: string | undefined;

  for (const model of models) {
    const result = await runStructuredAnalysis({
      model,
      instructions,
      userText,
      ...(attachment ? { attachment } : {}),
      schemaName: 'avis_moderation',
      schema,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
    });

    if (!result.ok) {
      lastError = result.code;
      lastDetail = result.detail;
      // Une clé absente ne se rattrape pas en changeant de modèle : le repli
      // ne sert que les pannes propres à un modèle.
      if (result.code === GATEWAY_ERRORS.NOT_CONFIGURED) break;
      continue;
    }

    const parsed = parseVerdict(result.data, rules);
    if (!parsed) {
      lastError = GATEWAY_ERRORS.BAD_RESPONSE;
      continue;
    }
    return {
      verdict: parsed.verdict,
      confidence: parsed.confidence,
      summary: parsed.summary,
      findings: parsed.findings,
      model,
      promptTokens: result.usage.promptTokens,
      completionTokens: result.usage.completionTokens,
    };
  }

  // Aucun constat : le modèle n'en a rendu aucun, et on n'en invente pas.
  //
  // Le remplir de « indéterminé » aurait paru plus complet ; ce serait faux à
  // deux titres. L'écran afficherait « n bloquants » pour une analyse qui n'a
  // pas eu lieu, et le résumé dénormalisé de la publication porterait ce
  // décompte. Ce qui s'est passé tient dans deux champs — verdict `error` et
  // le code d'échec — et c'est ce que le journal doit montrer.
  return {
    verdict: 'error',
    confidence: 0,
    summary: '',
    findings: [],
    model: models[0] ?? settings.model,
    error: lastDetail ? `${lastError}: ${lastDetail}` : lastError,
  };
}

// Télécharge et encode la pièce jointe, si les réglages et sa taille le
// permettent. Rend `null` dans tous les autres cas — et ce `null` fait ensuite
// barrage à l'auto-publication (`ATTACHMENT_NOT_READ`), il n'est jamais
// silencieux.
async function loadAttachment(
  ctx: { storage: { get: (id: Id<'_storage'>) => Promise<Blob | null> } },
  file: { id: Id<'_storage'>; size: number; contentType: string | null } | null,
  settings: AiModerationSettings,
  fileName: string | null,
): Promise<GatewayAttachment | null> {
  if (!file || !settings.analyzeAttachments) return null;
  if (file.size > settings.maxAttachmentMb * 1024 * 1024) return null;
  const blob = await ctx.storage.get(file.id);
  if (!blob) return null;
  return {
    filename: fileName ?? 'document.pdf',
    base64: toBase64(new Uint8Array(await blob.arrayBuffer())),
    contentType: file.contentType ?? 'application/pdf',
  };
}

// L'ACTION planifiée à la soumission (et par le bouton « analyser »).
//
// `internalAction` : elle n'est pas appelable depuis un client. Elle n'écrit
// rien elle-même — elle lit, appelle, et confie l'écriture à `applyVerdict`,
// qui est transactionnelle.
export const runReview = internalAction({
  args: {
    publicationId: v.id('publications'),
    triggeredBy: v.optional(v.id('users')),
  },
  returns: v.null(),
  handler: async (ctx, { publicationId, triggeredBy }) => {
    // Annotation explicite : `ctx.runQuery` sur une fonction du MÊME fichier
    // rend l'inférence circulaire (guidelines Convex du dépôt).
    const context: ReviewContext = await ctx.runQuery(
      internal.aiModeration.reviewContext,
      { publicationId },
    );
    // Dispositif éteint, dépôt déjà tranché ou disparu : rien à faire, et rien
    // à journaliser — aucune analyse n'a été tentée.
    if (!context) return null;

    const settings = fromWire(context.settings);
    const hasAttachment = context.file !== null;
    const attachment = await loadAttachment(
      ctx,
      context.file,
      settings,
      context.document.fileName,
    );

    // Le quota est consommé AVANT l'appel. Dépassé, on écrit tout de même un
    // avis en échec : sans cette trace, un plafond mal réglé ferait stagner la
    // file sans que rien n'en dise la cause.
    const started = Date.now();
    const allowed: boolean = await ctx.runMutation(
      internal.aiModeration.reserveCall,
      {},
    );
    const outcome: AnalysisOutcome = allowed
      ? await analyse(
          context.document,
          settings,
          context.rules,
          attachment,
          hasAttachment,
        )
      : {
          verdict: 'error',
          confidence: 0,
          summary: '',
          findings: [],
          model: settings.model,
          error: 'DAILY_CAP_REACHED',
        };

    await ctx.runMutation(internal.aiModeration.applyVerdict, {
      publicationId,
      verdict: outcome.verdict,
      confidence: outcome.confidence,
      summary: outcome.summary,
      findings: outcome.findings,
      model: outcome.model,
      configVersion: context.settings.version,
      hasAttachment,
      attachmentAnalyzed: attachment !== null,
      ...(outcome.promptTokens !== undefined
        ? { promptTokens: outcome.promptTokens }
        : {}),
      ...(outcome.completionTokens !== undefined
        ? { completionTokens: outcome.completionTokens }
        : {}),
      latencyMs: Date.now() - started,
      ...(outcome.error ? { error: outcome.error } : {}),
      ...(triggeredBy ? { triggeredBy } : {}),
    });
    return null;
  },
});

// --- Banc d'essai ------------------------------------------------------------

// Contexte du banc d'essai : le barème courant, sans publication.
export const testContext = internalQuery({
  args: {},
  returns: v.object({
    settings: settingsValidator,
    rules: v.array(ruleValidator),
  }),
  handler: async (ctx) => {
    // L'appelant est un administrateur authentifié : `ctx.runQuery` depuis une
    // action propage son identité, donc la garde de rôle tient ici aussi.
    await requireNetworkRole(ctx, 'admin');
    return {
      settings: settingsOut(await loadSettings(ctx)),
      rules: await loadEnabledRules(ctx),
    };
  },
});

// Éprouver le barème sur un texte, SANS RIEN ÉCRIRE.
//
// C'est l'outil qui rend le réglage praticable : un administrateur qui rédige
// un critère veut savoir ce qu'il déclenche avant de le laisser décider de
// vraies publications. Aucune ligne d'avis, aucun compteur, aucune
// notification — seul le quota quotidien est consommé, parce que l'appel, lui,
// est bien réel.
//
// Le mode n'entre pas en jeu : on montre l'avis brut, et ce que le dispositif
// EN FERAIT si le mode était `auto`. Le second est la question que
// l'administrateur se pose vraiment.
export const testRuleset = action({
  args: {
    title: v.string(),
    abstract: v.string(),
    body: v.optional(v.string()),
    type: v.optional(v.string()),
  },
  returns: v.object({
    verdict: aiModerationVerdict,
    confidence: v.number(),
    summary: v.string(),
    findings: v.array(findingValidator),
    model: v.string(),
    wouldAutoPublish: v.boolean(),
    reason: v.string(),
    error: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const context: { settings: WireSettings; rules: AiRule[] } =
      await ctx.runQuery(internal.aiModeration.testContext, {});
    const settings = fromWire(context.settings);
    const allowed: boolean = await ctx.runMutation(
      internal.aiModeration.reserveCall,
      {},
    );
    if (!allowed) {
      return {
        verdict: 'error' as const,
        confidence: 0,
        summary: '',
        findings: [],
        model: settings.model,
        wouldAutoPublish: false,
        reason: APPLY_REASONS.ANALYSIS_FAILED,
        error: 'DAILY_CAP_REACHED',
      };
    }

    const type =
      args.type && (PUB_TYPES as readonly string[]).includes(args.type)
        ? args.type
        : PUB_TYPES[0];

    const outcome = await analyse(
      {
        title: args.title.trim().slice(0, 300),
        type,
        theme: 'banc-d-essai',
        region: 'mondial',
        languages: ['fr'],
        year: new Date(Date.now()).getUTCFullYear(),
        authors: [],
        abstract: args.abstract.trim().slice(0, 8000),
        keypoints: [],
        body: args.body ? [args.body.trim().slice(0, 40000)] : [],
        fileName: null,
      },
      settings,
      context.rules,
      null,
      false,
    );

    // Ce que le dispositif ferait, mode `auto` supposé : la question du
    // réglage n'est pas « le modèle est-il content ? » mais « ce dépôt
    // passerait-il tout seul ? ».
    const decision = decideApplication({
      mode: 'auto',
      verdict: outcome.verdict,
      confidence: outcome.confidence,
      findings: outcome.findings,
      publicationType: type,
      eligibleTypes: settings.eligibleTypes,
      minConfidence: settings.autoPublishMinConfidence,
      hasAttachment: false,
      attachmentAnalyzed: false,
    });

    return {
      verdict: outcome.verdict,
      confidence: outcome.confidence,
      summary: outcome.summary,
      findings: outcome.findings,
      model: outcome.model,
      wouldAutoPublish: decision.applied === 'published',
      reason: decision.reason,
      error: outcome.error ?? null,
    };
  },
});
