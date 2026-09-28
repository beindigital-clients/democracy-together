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
import { TRIBUNE_AI_SCOPE } from './lib/communaute';
import {
  isGatewayConfigured,
  runStructured,
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

// AI-ASSISTED EDITORIAL MODERATION — orchestration.
//
// The system in one sentence: when a submission is made (F-32), an internal
// action has the document analyzed by a model via the Vercel gateway,
// then a mutation decides — by re-reading the current state — whether to publish or
// hand over to a human.
//
// THREE INVARIANTS, upheld by the code and covered by convex/aiModeration.test.ts:
//
//  1. NOTHING IS PUBLISHED ON SILENCE. Missing key, unreachable gateway,
//     unreadable response, cost cap reached: the submission stays `pending`.
//     This is the fail-closed of `lib/recaptcha.ts`, applied to a publication
//     decision — the absence of a verdict is never a favorable verdict.
//  2. THE MODEL PROPOSES, THE SERVER DECIDES. `applyVerdict` re-reads the mode, the
//     scope, the threshold AND the publication's state IN THE TRANSACTION that
//     writes. A "compliant" verdict publishes nothing if the administrator switched off
//     the system in the meantime, or if a moderator has already decided.
//  3. EVERYTHING IS TRACEABLE. Each analysis writes an `aiModerationReviews` row
//     — including those that fail, otherwise the log would make the
//     system look more reliable than it is — and each automatic publication
//     writes its own audit entry.
//
// The query/action/mutation split is not a style choice: a
// Convex mutation has no `fetch`, and an action has no transaction. Hence
// three steps — read the context (internalQuery), call the model
// (internalAction), apply (internalMutation) — and hence, too, the
// need to re-check at step 3 what was true at step 1.

// --- Settings: read ----------------------------------------------------------

const SETTINGS_KEY = 'default' as const;

async function loadConfigDoc(
  ctx: QueryCtx,
): Promise<Doc<'aiModerationConfig'> | null> {
  return await ctx.db
    .query('aiModerationConfig')
    .withIndex('by_key', (q) => q.eq('key', SETTINGS_KEY))
    .unique();
}

// Effective settings. A deployment that has never opened the panel has no
// row: it gets DEFAULT_SETTINGS, hence `mode: 'off'`. The
// deployed feature is inert until someone has armed it.
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

// The administrator's scale, active rules only, in its order.
export async function loadEnabledRules(ctx: QueryCtx): Promise<AiRule[]> {
  const rows = await ctx.db
    .query('aiModerationRules')
    .withIndex('by_order')
    .take(SETTINGS_BOUNDS.maxRules);
  return rows
    .filter((r) => r.enabled)
    .map((r) => ({
      // The criterion key is its identifier, as-is: this is what allows
      // a verdict to name the rule that produced it after the rule's deletion.
      key: r._id,
      label: r.label,
      description: r.description,
      severity: r.severity,
    }));
}

// --- Return validators -------------------------------------------------------

export const ruleValidator = v.object({
  key: v.string(),
  label: v.string(),
  description: v.string(),
  severity: aiModerationSeverity,
});

export const findingValidator = v.object({
  ruleKey: v.string(),
  ruleLabel: v.string(),
  severity: aiModerationSeverity,
  outcome: v.union(v.literal('pass'), v.literal('fail'), v.literal('unsure')),
  explanation: v.string(),
  quote: v.optional(v.string()),
});

export const settingsValidator = v.object({
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

// TRANSIT shape of the settings: what crosses a Convex
// validator boundary (`v.union(v.string(), v.null())`, no `undefined`).
// `fromWire` converts it back into application settings — otherwise an
// absent `fallbackModel` would travel as `null` and stop being a
// "no fallback" to become a model named "null".
export type WireSettings = {
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

export function fromWire(s: WireSettings): AiModerationSettings {
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

export function settingsOut(s: AiModerationSettings): WireSettings {
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

// --- Administration panel: read ----------------------------------------------

// Settings + scale + baseline + key status. Reserved to the administrator:
// it is the screen that decides what gets published without review.
//
// `configured` says whether the gateway key is set on the deployment. It is
// SERVER information — the key never leaves, only its existence is
// reported — and it avoids the scenario where `auto` mode is armed on a
// deployment that cannot call anyone, only to discover it at the
// first submission left in the queue without explanation.
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
      // `tribune` is added to the library types: checking this box is
      // the ONLY way to open auto-acceptance to Tribune posts
      // (convex/communityModeration.ts). Unchecked, the AI only proposes there.
      availableTypes: [...PUB_TYPES, TRIBUNE_AI_SCOPE],
      stats: {
        analyzed: counts[COUNTER.AI_REVIEWS],
        published: counts[COUNTER.AI_REVIEWS_PUBLISHED],
        escalated: counts[COUNTER.AI_REVIEWS_ESCALATED],
      },
    };
  },
});

// --- Administration panel: write ---------------------------------------------

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

// Writes the settings and increments the version.
//
// Bounds are enforced HERE, not only in the form: the screen
// is just a convenience, and a confidence threshold of 0 set by a direct call
// would open auto-publication to everything.
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

    // Scope: only types from the closed vocabulary are kept. An unknown
    // slug therefore cannot widen auto-publication to submissions the
    // panel does not show.
    const eligibleTypes = [
      ...new Set(
        args.eligibleTypes.filter(
          (t) =>
            (PUB_TYPES as readonly string[]).includes(t) ||
            t === TRIBUNE_AI_SCOPE,
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

    // The mode is the only value that changes what the platform does without a
    // human: it is named in the audit, not buried in a "settings
    // modified".
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

// Increments the settings version after a change to the scale: a
// returned verdict must be traceable to the EXACT state of the scale that
// produced it, and an added rule changes that scale as much as a moved threshold.
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
    // A criterion without a statement cannot be evaluated: it is the description, and it
    // alone, that is submitted to the model. A label is just a screen
    // tag.
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

    // Cap on the scale: beyond it, the prompt grows without the quality of the
    // judgment following, and the cost per submission rises for nothing.
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
    // Verdicts already returned keep the label of the deleted rule: that is
    // why `findings.ruleKey` is a string and not a `v.id`. A scale
    // that evolves must not make past decisions unreadable.
    await recordAudit(ctx, {
      actorId: admin._id,
      action: AUDIT.AI_MODERATION_RULE_CHANGED,
      targetId: ruleId,
      metadata: { change: 'deleted', label: existing.label },
    });
    return null;
  },
});

// --- Reading verdicts (moderation queue and log) -----------------------------

export const getReview = query({
  args: { publicationId: v.id('publications') },
  returns: v.union(reviewValidator, v.null()),
  handler: async (ctx, { publicationId }) => {
    await requireNetworkRole(ctx, 'moderateur');
    // The LATEST verdict: a reopened publication, or one analyzed on demand,
    // carries several, and it is the most recent that describes the current state.
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

// --- Manual trigger ----------------------------------------------------------

// "Analyze this submission" from the moderation queue (moderator+).
//
// Useful in two cases the automatic trigger does not cover: a
// submission that arrived while the system was off, and a submission to
// re-examine after tightening the scale. `off` mode is still respected — you
// don't turn the system back on with a button.
export const requestReview = mutation({
  args: { publicationId: v.id('publications') },
  returns: v.object({ scheduled: v.boolean() }),
  handler: async (ctx, { publicationId }) => {
    const staff = await requireNetworkRole(ctx, 'moderateur');
    const pub = await ctx.db.get(publicationId);
    if (!pub) throw new Error('NOT_FOUND');
    // A submission already decided has nothing more to gain from an analysis, and
    // `reviewContext` would discard it anyway. Saying so HERE avoids
    // announcing to the moderator an analysis from which no verdict will come.
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

// --- Orchestration: step 1, read the context ---------------------------------

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

// Shape read by the action. Written by hand rather than inferred: the action and the
// query living in the same file, inference would be circular there.
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
    // A submission already decided no longer needs analysis: the analysis costs a call
    // and can no longer change anything.
    if (!pub || pub.status !== 'pending') return null;
    const settings = await loadSettings(ctx);
    if (settings.mode === 'off') return null;

    // The blob's metadata comes from the system table, never from the client
    // (same distrust as `submitPublication`): it is the REAL size that
    // decides whether the file goes to the model.
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

// Reserves a call against the daily quota. Consumes the token IN a
// transaction, before the call: two simultaneous submissions cannot both
// get through on the last token.
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

// --- Orchestration: step 3, apply --------------------------------------------

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
    // The publication disappeared between the analysis and its application: we
    // do not write an orphan verdict whose log line could no longer
    // name its target.
    if (!pub)
      return {
        applied: 'superseded' as const,
        reason: APPLY_REASONS.ALREADY_DECIDED,
      };

    // Settings are RE-READ here, in the transaction that writes. Between the
    // trigger and now, an administrator may have switched off the
    // system, narrowed the scope or raised the threshold: it is the state at the
    // time of PUBLISHING that counts, not the one at the time of requesting.
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

    // A moderator decided during the analysis. The human decision wins,
    // no discussion: the verdict is kept for the log, it is not
    // applied.
    //
    // This is the same guard as the `pending -> published` edge of the
    // `publications.ts` state machine (assertTransition). It is written here as a condition
    // and not as a `throw` because a transition refusal is not, in this
    // context, an error to propagate: it is an OUTCOME to log.
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
        // `reviewedBy` stays EMPTY: nobody reviewed. It is this emptiness, read with
        // `autoPublished`, that lets the queue display "published without
        // human review" rather than attributing the decision to someone.
        reviewedAt: now,
        autoPublished: true,
      });
      await trackPublicationStatus(ctx, pub.status, 'published');
    }

    // Denormalized summary — written as soon as the system is VISIBLE. The queue
    // must be able to say "analyzed, put on hold for such-and-such reason" rather
    // than stay silent.
    //
    // Except in observation mode, and that is the whole definition of that mode:
    // the analysis runs, the log keeps it, but NOTHING reaches the queue. A
    // badge set here would be enough to steer the moderator's decision, and
    // observation would stop observing — it would influence what it
    // measures, which makes it useless as a calibration step. The full verdict
    // stays readable in the /admin/moderation-ia log, which is
    // where it is reread to tune the scale.
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

    // The author learns of the publication through the SAME message as for a human
    // approval: from their point of view, their publication is online.
    if (applied === 'published' && pub.authorUserId) {
      await notify(ctx, {
        userId: pub.authorUserId,
        type: 'publication_published',
        titleKey: 'pubPublished',
        params: { title: pub.title },
        link: `/bibliotheque/${pub.slug}`,
      });
    }

    // "Bring in the administrator": a BLOCKING signal takes the
    // case out of the queue's normal pace and goes to fetch someone. The
    // warning signals, for their part, wait their turn — notifying on everything
    // would amount to notifying on nothing.
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

// Notifies staff (moderator and above). Same indexed read as the
// reviewer selector (peerReview.listStaffUsers): we do not scan the
// `users` table to keep a few accounts from it.
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

// --- Orchestration: step 2, the call -----------------------------------------

// Output tokens. The verdict is structured and bounded (short summary, one finding
// per criterion): enough to give a detailed scale room without paying for an
// essay.
const MAX_OUTPUT_TOKENS = 4000;

export type AnalysisOutcome = {
  verdict: 'approve' | 'flag' | 'reject' | 'error';
  confidence: number;
  summary: string;
  findings: AiFinding[];
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  error?: string;
};

// Analyzes a document: builds the scale, calls the gateway (with a
// fallback if a backup model is configured), normalizes the response.
//
// Never throws. Every failure becomes an `error` verdict — loggable, and which
// leaves the submission in the queue by construction (see `decideApplication`).
export async function analyse(
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
    const result = await runStructured({
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
      // A missing key cannot be recovered by switching models: the fallback
      // only serves failures specific to a model.
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

  // No findings: the model returned none, and we don't invent any.
  //
  // Filling it with "undetermined" would have looked more complete; it would be wrong on
  // two counts. The screen would display "n blocking" for an analysis that did not
  // take place, and the publication's denormalized summary would carry that
  // count. What happened fits in two fields — `error` verdict and
  // the failure code — and that is what the log must show.
  return {
    verdict: 'error',
    confidence: 0,
    summary: '',
    findings: [],
    model: models[0] ?? settings.model,
    error: lastDetail ? `${lastError}: ${lastDetail}` : lastError,
  };
}

// Downloads and encodes the attachment, if the settings and its size
// allow it. Returns `null` in every other case — and that `null` then
// blocks auto-publication (`ATTACHMENT_NOT_READ`), it is never
// silent.
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

// The ACTION scheduled on submission (and by the "analyze" button).
//
// `internalAction`: it cannot be called from a client. It writes
// nothing itself — it reads, calls, and delegates the write to `applyVerdict`,
// which is transactional.
export const runReview = internalAction({
  args: {
    publicationId: v.id('publications'),
    triggeredBy: v.optional(v.id('users')),
  },
  returns: v.null(),
  handler: async (ctx, { publicationId, triggeredBy }) => {
    // Explicit annotation: `ctx.runQuery` on a function in the SAME file
    // makes inference circular (the repo's Convex guidelines).
    const context: ReviewContext = await ctx.runQuery(
      internal.aiModeration.reviewContext,
      { publicationId },
    );
    // System off, submission already decided or gone: nothing to do, and nothing
    // to log — no analysis was attempted.
    if (!context) return null;

    const settings = fromWire(context.settings);
    const hasAttachment = context.file !== null;
    const attachment = await loadAttachment(
      ctx,
      context.file,
      settings,
      context.document.fileName,
    );

    // The quota is consumed BEFORE the call. When exceeded, we still write a
    // failed verdict: without this trace, a misconfigured cap would make the
    // queue stagnate with nothing saying why.
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

// --- Test bench --------------------------------------------------------------

// Test-bench context: the current scale, with no publication.
export const testContext = internalQuery({
  args: {},
  returns: v.object({
    settings: settingsValidator,
    rules: v.array(ruleValidator),
  }),
  handler: async (ctx) => {
    // The caller is an authenticated administrator: `ctx.runQuery` from an
    // action propagates their identity, so the role guard holds here too.
    await requireNetworkRole(ctx, 'admin');
    return {
      settings: settingsOut(await loadSettings(ctx)),
      rules: await loadEnabledRules(ctx),
    };
  },
});

// Try the scale on a text, WITHOUT WRITING ANYTHING.
//
// This is the tool that makes tuning practical: an administrator drafting
// a criterion wants to know what it triggers before letting it decide on
// real publications. No verdict row, no counter, no
// notification — only the daily quota is consumed, because the call itself
// is very real.
//
// The mode does not come into play: we show the raw verdict, and what the system
// WOULD DO WITH IT if the mode were `auto`. The latter is the question the
// administrator is really asking.
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

    // What the system would do, assuming `auto` mode: the tuning
    // question is not "is the model happy?" but "would this submission
    // go through on its own?".
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
