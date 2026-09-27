import { v, ConvexError } from 'convex/values';
import { action, internalMutation, mutation, query } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { getAuthUserId } from '@convex-dev/auth/server';
import {
  getCurrentUser,
  rank,
  requireNetworkRole,
  requireUser,
} from './lib/rbac';
import { enforceRateLimit, RATE_LIMITS } from './lib/rateLimit';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { notify } from './lib/notify';
import { FIELD_MAX } from './lib/validation';
import { slugify } from './lib/slug';
import { locale } from './lib/locales';
import {
  PROGRAMME_LANGUAGES,
  PROGRAMME_LIMITS,
  PROGRAMME_THEMES,
  callApplicationStatusValidator,
  callDecisionValidator,
  callWindowState,
  cleanVocabulary,
  isValidTimeZone,
  rankApplications,
  sniffFileType,
  weightedScore,
  type CallApplicationStatus,
} from './lib/programmes';

// Appels à projets datés (F-60) : publication, candidature, évaluation,
// sélection.
//
// DÉCISION SUR LE DÉPÔT LIBRE EXISTANT (convex/projects.ts). Il est CONSERVÉ
// tel quel, présenté comme « proposition hors appel ». Le rattacher à ce
// modèle aurait demandé un appel fictif sans fenêtre, sans fonds ni grille —
// c'est-à-dire exactement les trois choses qui définissent un appel, et la
// règle « refusé hors fenêtre » aurait dû souffrir une exception. Les deux
// dispositifs ne répondent pas au même besoin : la proposition libre met en
// relation autour d'une idée, à tout moment ; l'appel sélectionne, à date,
// des projets pour un fonds, sur critères. Leurs données restent séparées,
// leurs files aussi (/admin/projets et /admin/projets/appels).
//
// Règles tenues ici, toutes côté serveur :
//  - une candidature n'est créée, complétée ou déposée QUE dans la fenêtre
//    de l'appel (ouverture incluse, clôture exclue) ;
//  - une pièce jointe n'est acceptée qu'après lecture de ses premiers octets
//    (PDF, PNG, JPEG, document bureautique) — jamais sur son extension ;
//  - un évaluateur désigné qui déclare un conflit d'intérêts est EXCLU de la
//    candidature : il n'en lit plus le contenu et sa note ne compte pas ;
//  - la décision (sélectionné / liste d'attente / refusé) est notifiée au
//    porteur et tracée au journal.

const HOUR = 60 * 60 * 1000;
const WRITE_LIMIT = { max: 60, windowMs: HOUR };

// --- Projections --------------------------------------------------------------

const criterionValidator = v.object({
  key: v.string(),
  label: v.string(),
  weight: v.number(),
});
const documentValidator = v.object({
  key: v.string(),
  label: v.string(),
  required: v.boolean(),
});

const publicCallValidator = v.object({
  _id: v.id('projectCalls'),
  slug: v.string(),
  title: v.string(),
  summary: v.string(),
  opensAt: v.number(),
  closesAt: v.number(),
  timeZone: v.string(),
  fundAmount: v.number(),
  fundCurrency: v.string(),
  themes: v.array(v.string()),
  languages: v.array(locale),
  criteria: v.array(criterionValidator),
  requiredDocuments: v.array(documentValidator),
});

function projectCall(c: Doc<'projectCalls'>) {
  return {
    _id: c._id,
    slug: c.slug,
    title: c.title,
    summary: c.summary,
    opensAt: c.opensAt,
    closesAt: c.closesAt,
    timeZone: c.timeZone,
    fundAmount: c.fundAmount,
    fundCurrency: c.fundCurrency,
    themes: c.themes,
    languages: c.languages,
    criteria: c.criteria,
    requiredDocuments: c.requiredDocuments,
  };
}

const attachmentValidator = v.object({
  _id: v.id('projectCallAttachments'),
  docKey: v.string(),
  fileName: v.string(),
  contentType: v.string(),
  size: v.number(),
});

async function attachmentsOf(
  ctx: QueryCtx,
  applicationId: Id<'projectCallApplications'>,
) {
  const rows = await ctx.db
    .query('projectCallAttachments')
    .withIndex('by_application', (q) => q.eq('applicationId', applicationId))
    .take(PROGRAMME_LIMITS.maxDocuments * 2);
  return rows.map((a) => ({
    _id: a._id,
    docKey: a.docKey,
    fileName: a.fileName,
    contentType: a.contentType,
    size: a.size,
  }));
}

function requireOpen(call: Doc<'projectCalls'>, now: number) {
  if (call.status !== 'published') throw new ConvexError('NOT_FOUND');
  const state = callWindowState(call, now);
  if (state === 'upcoming') throw new ConvexError('CALL_NOT_OPEN');
  if (state === 'closed') throw new ConvexError('CALL_CLOSED');
}

async function isEvaluator(
  ctx: QueryCtx,
  callId: Id<'projectCalls'>,
  userId: Id<'users'>,
): Promise<boolean> {
  const rows = await ctx.db
    .query('projectCallEvaluators')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .take(200);
  return rows.some((r) => r.callId === callId);
}

async function evaluationOf(
  ctx: QueryCtx,
  applicationId: Id<'projectCallApplications'>,
  evaluatorId: Id<'users'>,
) {
  const rows = await ctx.db
    .query('projectEvaluations')
    .withIndex('by_application', (q) => q.eq('applicationId', applicationId))
    .take(100);
  return rows.find((e) => e.evaluatorId === evaluatorId) ?? null;
}

// --- Public -------------------------------------------------------------------

// Tous les appels PUBLIÉS ; la page les range en « ouverts », « à venir » et
// « archivés » avec l'heure du visiteur (une query ne lit pas l'horloge).
export const listPublicCalls = query({
  args: {},
  returns: v.array(publicCallValidator),
  handler: async (ctx) => {
    const calls = await ctx.db
      .query('projectCalls')
      .withIndex('by_status_and_closes', (q) => q.eq('status', 'published'))
      .order('desc')
      .take(100);
    return calls.map(projectCall);
  },
});

export const getPublicCall = query({
  args: { slug: v.string() },
  returns: v.union(publicCallValidator, v.null()),
  handler: async (ctx, { slug }) => {
    const call = await ctx.db
      .query('projectCalls')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    return call && call.status === 'published' ? projectCall(call) : null;
  },
});

// --- Candidat (membre et au-dessus) ------------------------------------------

const myApplicationValidator = v.object({
  _id: v.id('projectCallApplications'),
  callId: v.id('projectCalls'),
  callSlug: v.string(),
  callTitle: v.string(),
  closesAt: v.number(),
  title: v.string(),
  summary: v.string(),
  language: locale,
  status: callApplicationStatusValidator,
  submittedAt: v.union(v.number(), v.null()),
  decidedAt: v.union(v.number(), v.null()),
  decisionNote: v.union(v.string(), v.null()),
  attachments: v.array(attachmentValidator),
});

async function projectMyApplication(
  ctx: QueryCtx,
  a: Doc<'projectCallApplications'>,
) {
  const call = await ctx.db.get(a.callId);
  const decided =
    a.status === 'selected' ||
    a.status === 'waitlisted' ||
    a.status === 'rejected';
  return {
    _id: a._id,
    callId: a.callId,
    callSlug: call?.slug ?? '',
    callTitle: call?.title ?? '—',
    closesAt: call?.closesAt ?? 0,
    title: a.title,
    summary: a.summary,
    language: a.language,
    status: a.status,
    submittedAt: a.submittedAt ?? null,
    decidedAt: decided ? (a.decidedAt ?? null) : null,
    // La note de décision n'est rendue qu'une fois la décision prise.
    decisionNote: decided ? (a.decisionNote ?? null) : null,
    attachments: await attachmentsOf(ctx, a._id),
  };
}

export const myCallApplications = query({
  args: {},
  returns: v.array(myApplicationValidator),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const rows = await ctx.db
      .query('projectCallApplications')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .order('desc')
      .take(50);
    const out = [];
    for (const a of rows) out.push(await projectMyApplication(ctx, a));
    return out;
  },
});

export const myApplicationForCall = query({
  args: { callId: v.id('projectCalls') },
  returns: v.union(myApplicationValidator, v.null()),
  handler: async (ctx, { callId }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const a = await ctx.db
      .query('projectCallApplications')
      .withIndex('by_call_and_user', (q) =>
        q.eq('callId', callId).eq('userId', user._id),
      )
      .unique();
    return a ? await projectMyApplication(ctx, a) : null;
  },
});

// Crée ou met à jour le BROUILLON. Une candidature par appel et par compte :
// le doublon est structurel (index `by_call_and_user`), pas un avertissement.
export const saveCallApplication = mutation({
  args: {
    callId: v.id('projectCalls'),
    title: v.string(),
    summary: v.string(),
    language: locale,
  },
  returns: v.id('projectCallApplications'),
  handler: async (ctx, { callId, title, summary, language }) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const call = await ctx.db.get(callId);
    if (!call) throw new ConvexError('NOT_FOUND');
    requireOpen(call, Date.now());
    const t = title.trim();
    const s = summary.trim();
    if (t.length < 4 || t.length > PROGRAMME_LIMITS.shortText)
      throw new ConvexError('INVALID_TITLE');
    if (s.length < 20 || s.length > FIELD_MAX.body)
      throw new ConvexError('INVALID_SUMMARY');
    // La langue du dossier doit être une de celles que l'appel accepte.
    if (call.languages.length > 0 && !call.languages.includes(language))
      throw new ConvexError('INVALID_LANGUAGE');
    await enforceRateLimit(ctx, {
      key: `projectCall:${user._id}`,
      ...WRITE_LIMIT,
    });

    const existing = await ctx.db
      .query('projectCallApplications')
      .withIndex('by_call_and_user', (q) =>
        q.eq('callId', callId).eq('userId', user._id),
      )
      .unique();
    if (existing) {
      if (existing.status !== 'draft')
        throw new ConvexError('ALREADY_SUBMITTED');
      await ctx.db.patch(existing._id, { title: t, summary: s, language });
      return existing._id;
    }
    return await ctx.db.insert('projectCallApplications', {
      callId,
      userId: user._id,
      applicantName: user.name?.trim() || user.email || '—',
      title: t,
      summary: s,
      language,
      status: 'draft',
      createdAt: Date.now(),
    });
  },
});

export const generateAttachmentUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const user = await requireNetworkRole(ctx, 'membre');
    await enforceRateLimit(ctx, {
      key: `upload:${user._id}`,
      ...RATE_LIMITS.upload,
    });
    return await ctx.storage.generateUploadUrl();
  },
});

// Pièce jointe : l'ACTION lit le fichier (une mutation n'a pas accès au
// contenu du stockage), en reconnaît le type par ses premiers octets, puis
// confie l'enregistrement à une mutation interne qui refait TOUS les
// contrôles d'appartenance et de fenêtre. Un fichier refusé est supprimé du
// stockage aussitôt : il ne reste pas orphelin.
export const attachDocument = action({
  args: {
    applicationId: v.id('projectCallApplications'),
    docKey: v.string(),
    storageId: v.id('_storage'),
    fileName: v.string(),
  },
  returns: v.id('projectCallAttachments'),
  handler: async (ctx, args): Promise<Id<'projectCallAttachments'>> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new ConvexError('NOT_AUTHENTICATED');
    const blob = await ctx.storage.get(args.storageId);
    const reject = async (code: string): Promise<never> => {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError(code);
    };
    if (!blob || blob.size === 0) return await reject('INVALID_FILE');
    if (blob.size > PROGRAMME_LIMITS.maxFileBytes)
      return await reject('FILE_TOO_LARGE');
    const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    const contentType = sniffFileType(head);
    if (!contentType) return await reject('INVALID_FILE');
    try {
      return await ctx.runMutation(internal.projectCalls.recordAttachment, {
        userId,
        applicationId: args.applicationId,
        docKey: args.docKey,
        storageId: args.storageId,
        fileName: args.fileName.trim().slice(0, 200) || 'document',
        contentType,
        size: blob.size,
      });
    } catch (err) {
      await ctx.storage.delete(args.storageId);
      throw err;
    }
  },
});

export const recordAttachment = internalMutation({
  args: {
    userId: v.id('users'),
    applicationId: v.id('projectCallApplications'),
    docKey: v.string(),
    storageId: v.id('_storage'),
    fileName: v.string(),
    contentType: v.string(),
    size: v.number(),
  },
  returns: v.id('projectCallAttachments'),
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user || rank(user.role) < rank('membre'))
      throw new ConvexError('FORBIDDEN');
    const application = await ctx.db.get(args.applicationId);
    if (!application || application.userId !== args.userId)
      throw new ConvexError('NOT_FOUND');
    if (application.status !== 'draft')
      throw new ConvexError('ALREADY_SUBMITTED');
    const call = await ctx.db.get(application.callId);
    if (!call) throw new ConvexError('NOT_FOUND');
    requireOpen(call, Date.now());
    if (!call.requiredDocuments.some((d) => d.key === args.docKey))
      throw new ConvexError('INVALID_DOCUMENT');
    // Une pièce par document demandé : la nouvelle remplace l'ancienne.
    const previous = await ctx.db
      .query('projectCallAttachments')
      .withIndex('by_application', (q) =>
        q.eq('applicationId', args.applicationId),
      )
      .take(PROGRAMME_LIMITS.maxDocuments * 2);
    for (const p of previous.filter((a) => a.docKey === args.docKey)) {
      await ctx.storage.delete(p.storageId);
      await ctx.db.delete(p._id);
    }
    return await ctx.db.insert('projectCallAttachments', {
      applicationId: args.applicationId,
      docKey: args.docKey,
      storageId: args.storageId,
      fileName: args.fileName,
      contentType: args.contentType,
      size: args.size,
      uploadedAt: Date.now(),
    });
  },
});

export const removeAttachment = mutation({
  args: { attachmentId: v.id('projectCallAttachments') },
  returns: v.null(),
  handler: async (ctx, { attachmentId }) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const attachment = await ctx.db.get(attachmentId);
    if (!attachment) throw new ConvexError('NOT_FOUND');
    const application = await ctx.db.get(attachment.applicationId);
    if (!application || application.userId !== user._id)
      throw new ConvexError('NOT_FOUND');
    if (application.status !== 'draft')
      throw new ConvexError('ALREADY_SUBMITTED');
    const call = await ctx.db.get(application.callId);
    if (!call) throw new ConvexError('NOT_FOUND');
    requireOpen(call, Date.now());
    await ctx.storage.delete(attachment.storageId);
    await ctx.db.delete(attachmentId);
    return null;
  },
});

export const submitCallApplication = mutation({
  args: { applicationId: v.id('projectCallApplications') },
  returns: v.null(),
  handler: async (ctx, { applicationId }) => {
    const user = await requireNetworkRole(ctx, 'membre');
    const application = await ctx.db.get(applicationId);
    if (!application || application.userId !== user._id)
      throw new ConvexError('NOT_FOUND');
    if (application.status !== 'draft')
      throw new ConvexError('ALREADY_SUBMITTED');
    const call = await ctx.db.get(application.callId);
    if (!call) throw new ConvexError('NOT_FOUND');
    requireOpen(call, Date.now());
    const attachments = await attachmentsOf(ctx, applicationId);
    const missing = call.requiredDocuments.filter(
      (d) => d.required && !attachments.some((a) => a.docKey === d.key),
    );
    if (missing.length > 0) throw new ConvexError('MISSING_DOCUMENTS');
    await ctx.db.patch(applicationId, {
      status: 'submitted',
      submittedAt: Date.now(),
    });
    return null;
  },
});

export const withdrawCallApplication = mutation({
  args: { applicationId: v.id('projectCallApplications') },
  returns: v.null(),
  handler: async (ctx, { applicationId }) => {
    const user = await requireUser(ctx);
    const application = await ctx.db.get(applicationId);
    if (!application || application.userId !== user._id)
      throw new ConvexError('NOT_FOUND');
    if (application.status !== 'draft' && application.status !== 'submitted')
      throw new ConvexError('INVALID_TRANSITION');
    await ctx.db.patch(applicationId, { status: 'withdrawn' });
    return null;
  },
});

// Adresse d'une pièce : le porteur, le coordinateur, et les évaluateurs
// désignés NON EN CONFLIT sur cette candidature. Rien pour les autres.
export const attachmentUrl = query({
  args: { attachmentId: v.id('projectCallAttachments') },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { attachmentId }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const attachment = await ctx.db.get(attachmentId);
    if (!attachment) return null;
    const application = await ctx.db.get(attachment.applicationId);
    if (!application) return null;
    let allowed =
      application.userId === user._id || rank(user.role) >= rank('moderateur');
    if (!allowed && (await isEvaluator(ctx, application.callId, user._id))) {
      const own = await evaluationOf(ctx, application._id, user._id);
      allowed = application.status !== 'draft' && !own?.conflict;
    }
    return allowed ? await ctx.storage.getUrl(attachment.storageId) : null;
  },
});

// --- Évaluateur désigné -------------------------------------------------------

export const myEvaluationAssignments = query({
  args: {},
  returns: v.array(
    v.object({
      call: publicCallValidator,
      applications: v.array(
        v.object({
          _id: v.id('projectCallApplications'),
          // Contenu masqué (`null`) quand l'évaluateur est en conflit.
          title: v.union(v.string(), v.null()),
          summary: v.union(v.string(), v.null()),
          applicantName: v.union(v.string(), v.null()),
          attachments: v.array(attachmentValidator),
          conflict: v.boolean(),
          scores: v.array(
            v.object({ criterionKey: v.string(), score: v.number() }),
          ),
          comment: v.union(v.string(), v.null()),
          evaluated: v.boolean(),
        }),
      ),
    }),
  ),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const assignments = await ctx.db
      .query('projectCallEvaluators')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .take(50);
    const out = [];
    for (const assignment of assignments) {
      const call = await ctx.db.get(assignment.callId);
      if (!call || call.status !== 'published') continue;
      const submitted = await ctx.db
        .query('projectCallApplications')
        .withIndex('by_call_and_status', (q) =>
          q.eq('callId', call._id).eq('status', 'submitted'),
        )
        .take(200);
      const applications = [];
      for (const a of submitted) {
        const own = await evaluationOf(ctx, a._id, user._id);
        // Sa propre candidature : conflit d'office, sans déclaration.
        const conflict = own?.conflict === true || a.userId === user._id;
        applications.push({
          _id: a._id,
          title: conflict ? null : a.title,
          summary: conflict ? null : a.summary,
          applicantName: conflict ? null : a.applicantName,
          attachments: conflict ? [] : await attachmentsOf(ctx, a._id),
          conflict,
          scores: own?.scores ?? [],
          comment: own?.comment ?? null,
          evaluated: own !== null,
        });
      }
      out.push({ call: projectCall(call), applications });
    }
    return out;
  },
});

export const submitEvaluation = mutation({
  args: {
    applicationId: v.id('projectCallApplications'),
    conflict: v.boolean(),
    scores: v.array(v.object({ criterionKey: v.string(), score: v.number() })),
    comment: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { applicationId, conflict, scores, comment }) => {
    const user = await requireUser(ctx);
    const application = await ctx.db.get(applicationId);
    if (!application) throw new ConvexError('NOT_FOUND');
    if (!(await isEvaluator(ctx, application.callId, user._id)))
      throw new ConvexError('NOT_FOUND');
    if (application.userId === user._id) throw new ConvexError('CONFLICT_OWN');
    // On évalue un dossier DÉPOSÉ et pas encore tranché.
    if (application.status !== 'submitted')
      throw new ConvexError('NOT_EVALUABLE');
    const call = await ctx.db.get(application.callId);
    if (!call) throw new ConvexError('NOT_FOUND');
    const existing = await evaluationOf(ctx, applicationId, user._id);
    // Un conflit déclaré est DÉFINITIF : l'évaluateur a dit ne pas pouvoir
    // juger ce dossier ; il ne peut plus le noter ensuite.
    if (existing?.conflict) throw new ConvexError('CONFLICT_DECLARED');

    const text = comment?.trim().slice(0, PROGRAMME_LIMITS.review) || undefined;
    let clean: { criterionKey: string; score: number }[] = [];
    if (!conflict) {
      clean = call.criteria.map((c) => {
        const s = scores.find((x) => x.criterionKey === c.key);
        if (
          !s ||
          !Number.isInteger(s.score) ||
          s.score < 0 ||
          s.score > PROGRAMME_LIMITS.maxScore
        )
          throw new ConvexError('INVALID_SCORES');
        return { criterionKey: c.key, score: s.score };
      });
    }
    const fields = {
      conflict,
      scores: clean,
      comment: conflict ? undefined : text,
      submittedAt: Date.now(),
    };
    if (existing) await ctx.db.patch(existing._id, fields);
    else
      await ctx.db.insert('projectEvaluations', {
        applicationId,
        callId: application.callId,
        evaluatorId: user._id,
        ...fields,
      });
    return null;
  },
});

// --- Back-office (modérateur et au-dessus) ------------------------------------

export const adminListCalls = query({
  args: {},
  returns: v.array(
    publicCallValidator.extend({
      status: v.union(v.literal('draft'), v.literal('published')),
      applications: v.number(),
      evaluators: v.array(
        v.object({
          userId: v.id('users'),
          name: v.string(),
          email: v.union(v.string(), v.null()),
        }),
      ),
    }),
  ),
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'moderateur');
    const calls = await ctx.db.query('projectCalls').order('desc').take(100);
    const out = [];
    for (const c of calls) {
      const apps = await ctx.db
        .query('projectCallApplications')
        .withIndex('by_call_and_status', (q) => q.eq('callId', c._id))
        .take(500);
      const evaluatorRows = await ctx.db
        .query('projectCallEvaluators')
        .withIndex('by_call', (q) => q.eq('callId', c._id))
        .take(50);
      const evaluators = [];
      for (const e of evaluatorRows) {
        const u = await ctx.db.get(e.userId);
        evaluators.push({
          userId: e.userId,
          name: u?.name?.trim() || u?.email || '—',
          email: u?.email ?? null,
        });
      }
      out.push({
        ...projectCall(c),
        status: c.status,
        applications: apps.filter((a) => a.status !== 'draft').length,
        evaluators,
      });
    }
    return out;
  },
});

function cleanList<T extends { key: string; label: string }>(
  items: readonly T[],
  max: number,
  code: string,
): T[] {
  if (items.length === 0 || items.length > max) throw new ConvexError(code);
  const keys = new Set<string>();
  return items.map((item) => {
    const label = item.label.trim();
    const key = slugify(item.key.trim() || label);
    if (label.length < 2 || label.length > PROGRAMME_LIMITS.shortText)
      throw new ConvexError(code);
    if (keys.has(key)) throw new ConvexError(code);
    keys.add(key);
    return { ...item, key, label };
  });
}

export const saveCall = mutation({
  args: {
    callId: v.optional(v.id('projectCalls')),
    title: v.string(),
    summary: v.string(),
    opensAt: v.number(),
    closesAt: v.number(),
    timeZone: v.string(),
    fundAmount: v.number(),
    fundCurrency: v.string(),
    themes: v.array(v.string()),
    languages: v.array(locale),
    criteria: v.array(criterionValidator),
    requiredDocuments: v.array(documentValidator),
  },
  returns: v.id('projectCalls'),
  handler: async (ctx, args) => {
    const admin = await requireNetworkRole(ctx, 'moderateur');
    const title = args.title.trim();
    const summary = args.summary.trim();
    if (title.length < 4 || title.length > PROGRAMME_LIMITS.shortText)
      throw new ConvexError('INVALID_TITLE');
    if (summary.length < 20 || summary.length > FIELD_MAX.body)
      throw new ConvexError('INVALID_SUMMARY');
    if (
      !Number.isFinite(args.opensAt) ||
      !Number.isFinite(args.closesAt) ||
      args.closesAt <= args.opensAt
    )
      throw new ConvexError('INVALID_WINDOW');
    if (!isValidTimeZone(args.timeZone))
      throw new ConvexError('INVALID_TIMEZONE');
    if (!Number.isFinite(args.fundAmount) || args.fundAmount < 0)
      throw new ConvexError('INVALID_FUND');
    const currency = args.fundCurrency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new ConvexError('INVALID_FUND');
    const themes = cleanVocabulary(args.themes, PROGRAMME_THEMES);
    if (!themes) throw new ConvexError('INVALID_THEMES');
    const languages = cleanVocabulary(args.languages, PROGRAMME_LANGUAGES);
    if (!languages || languages.length === 0)
      throw new ConvexError('INVALID_LANGUAGES');
    const criteria = cleanList(
      args.criteria,
      PROGRAMME_LIMITS.maxCriteria,
      'INVALID_CRITERIA',
    ).map((c) => {
      if (!Number.isInteger(c.weight) || c.weight < 1 || c.weight > 10)
        throw new ConvexError('INVALID_CRITERIA');
      return c;
    });
    const requiredDocuments = cleanList(
      args.requiredDocuments,
      PROGRAMME_LIMITS.maxDocuments,
      'INVALID_DOCUMENTS',
    );

    const now = Date.now();
    const fields = {
      title,
      summary,
      opensAt: args.opensAt,
      closesAt: args.closesAt,
      timeZone: args.timeZone,
      fundAmount: args.fundAmount,
      fundCurrency: currency,
      themes,
      languages: languages as Doc<'projectCalls'>['languages'],
      criteria,
      requiredDocuments,
      updatedAt: now,
    };
    let callId = args.callId;
    if (callId) {
      const call = await ctx.db.get(callId);
      if (!call) throw new ConvexError('NOT_FOUND');
      // La grille ne change plus une fois qu'une évaluation existe : on ne
      // compare pas des notes données sur deux grilles différentes.
      const evaluated = await ctx.db
        .query('projectEvaluations')
        .withIndex('by_call', (q) => q.eq('callId', callId!))
        .first();
      if (
        evaluated &&
        JSON.stringify(call.criteria) !== JSON.stringify(criteria)
      )
        throw new ConvexError('CRITERIA_LOCKED');
      await ctx.db.patch(callId, fields);
    } else {
      const root = slugify(title);
      let slug = root;
      let n = 2;
      while (
        await ctx.db
          .query('projectCalls')
          .withIndex('by_slug', (q) => q.eq('slug', slug))
          .first()
      ) {
        slug = `${root}-${n++}`;
      }
      callId = await ctx.db.insert('projectCalls', {
        slug,
        ...fields,
        status: 'draft',
        createdBy: admin._id,
        createdAt: now,
      });
    }
    await recordAudit(ctx, {
      actorId: admin._id,
      action: AUDIT.PROJECT_CALL_SAVED,
      targetId: callId,
      metadata: { title },
    });
    return callId;
  },
});

export const setCallStatus = mutation({
  args: {
    callId: v.id('projectCalls'),
    status: v.union(v.literal('draft'), v.literal('published')),
  },
  returns: v.null(),
  handler: async (ctx, { callId, status }) => {
    const admin = await requireNetworkRole(ctx, 'moderateur');
    const call = await ctx.db.get(callId);
    if (!call) throw new ConvexError('NOT_FOUND');
    if (status === 'draft') {
      // Dépublier un appel qui a reçu des dossiers les rendrait orphelins.
      const any = await ctx.db
        .query('projectCallApplications')
        .withIndex('by_call_and_status', (q) => q.eq('callId', callId))
        .first();
      if (any) throw new ConvexError('HAS_APPLICATIONS');
    }
    await ctx.db.patch(callId, { status, updatedAt: Date.now() });
    await recordAudit(ctx, {
      actorId: admin._id,
      action: AUDIT.PROJECT_CALL_SAVED,
      targetId: callId,
      metadata: { status },
    });
    return null;
  },
});

export const addEvaluator = mutation({
  args: { callId: v.id('projectCalls'), email: v.string() },
  returns: v.null(),
  handler: async (ctx, { callId, email }) => {
    const admin = await requireNetworkRole(ctx, 'moderateur');
    const call = await ctx.db.get(callId);
    if (!call) throw new ConvexError('NOT_FOUND');
    const user = await ctx.db
      .query('users')
      .withIndex('email', (q) => q.eq('email', email.trim().toLowerCase()))
      .first();
    // Un évaluateur est un compte du réseau (membre et au-dessus).
    if (!user || rank(user.role) < rank('membre'))
      throw new ConvexError('USER_NOT_FOUND');
    const rows = await ctx.db
      .query('projectCallEvaluators')
      .withIndex('by_call', (q) => q.eq('callId', callId))
      .take(50);
    if (rows.some((r) => r.userId === user._id)) return null;
    if (rows.length >= 20) throw new ConvexError('TOO_MANY_EVALUATORS');
    await ctx.db.insert('projectCallEvaluators', {
      callId,
      userId: user._id,
      assignedBy: admin._id,
      createdAt: Date.now(),
    });
    await notify(ctx, {
      userId: user._id,
      type: 'projectCall.evaluator',
      titleKey: 'projectCallEvaluator',
      params: { title: call.title },
      link: '/espace-membre/evaluations',
    });
    await recordAudit(ctx, {
      actorId: admin._id,
      action: AUDIT.PROJECT_CALL_EVALUATORS,
      targetId: callId,
      metadata: { added: user._id },
    });
    return null;
  },
});

export const removeEvaluator = mutation({
  args: { callId: v.id('projectCalls'), userId: v.id('users') },
  returns: v.null(),
  handler: async (ctx, { callId, userId }) => {
    const admin = await requireNetworkRole(ctx, 'moderateur');
    const rows = await ctx.db
      .query('projectCallEvaluators')
      .withIndex('by_call', (q) => q.eq('callId', callId))
      .take(50);
    for (const r of rows.filter((r) => r.userId === userId))
      await ctx.db.delete(r._id);
    await recordAudit(ctx, {
      actorId: admin._id,
      action: AUDIT.PROJECT_CALL_EVALUATORS,
      targetId: callId,
      metadata: { removed: userId },
    });
    return null;
  },
});

const DECIDED: readonly CallApplicationStatus[] = [
  'selected',
  'waitlisted',
  'rejected',
];

export const callRanking = query({
  args: { callId: v.id('projectCalls') },
  returns: v.array(
    v.object({
      _id: v.id('projectCallApplications'),
      rank: v.number(),
      average: v.union(v.number(), v.null()),
      evaluations: v.number(),
      excluded: v.number(),
      title: v.string(),
      summary: v.string(),
      applicantName: v.string(),
      status: callApplicationStatusValidator,
      decisionNote: v.union(v.string(), v.null()),
      attachments: v.array(attachmentValidator),
    }),
  ),
  handler: async (ctx, { callId }) => {
    await requireNetworkRole(ctx, 'moderateur');
    const call = await ctx.db.get(callId);
    if (!call) throw new ConvexError('NOT_FOUND');
    const apps = (
      await ctx.db
        .query('projectCallApplications')
        .withIndex('by_call_and_status', (q) => q.eq('callId', callId))
        .take(500)
    ).filter((a) => a.status === 'submitted' || DECIDED.includes(a.status));
    const byId = new Map(apps.map((a) => [a._id as string, a]));
    const inputs = [];
    for (const a of apps) {
      const evaluations = await ctx.db
        .query('projectEvaluations')
        .withIndex('by_application', (q) => q.eq('applicationId', a._id))
        .take(100);
      inputs.push({
        id: a._id as string,
        evaluations: evaluations.map((e) => ({
          // L'évaluateur qui est le porteur lui-même est exclu d'office.
          conflict: e.conflict || e.evaluatorId === a.userId,
          score: e.conflict ? null : weightedScore(call.criteria, e.scores),
        })),
      });
    }
    const out = [];
    for (const row of rankApplications(inputs)) {
      const a = byId.get(row.id)!;
      out.push({
        _id: a._id,
        rank: row.rank,
        average: row.average,
        evaluations: row.evaluations,
        excluded: row.excluded,
        title: a.title,
        summary: a.summary,
        applicantName: a.applicantName,
        status: a.status,
        decisionNote: a.decisionNote ?? null,
        attachments: await attachmentsOf(ctx, a._id),
      });
    }
    return out;
  },
});

// Décision : d'un dossier déposé vers sélectionné, liste d'attente ou refusé ;
// la liste d'attente peut encore basculer (un sélectionné se désiste). Une
// sélection ou un refus est définitif — le porteur en a été notifié.
export const decideCallApplication = mutation({
  args: {
    applicationId: v.id('projectCallApplications'),
    decision: callDecisionValidator,
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { applicationId, decision, note }) => {
    const admin = await requireNetworkRole(ctx, 'moderateur');
    const application = await ctx.db.get(applicationId);
    if (!application) throw new ConvexError('NOT_FOUND');
    const allowed =
      application.status === 'submitted' ||
      (application.status === 'waitlisted' && decision !== 'waitlisted');
    if (!allowed) throw new ConvexError('INVALID_TRANSITION');
    const call = await ctx.db.get(application.callId);
    const text = note?.trim().slice(0, FIELD_MAX.body) || undefined;
    await ctx.db.patch(applicationId, {
      status: decision,
      decidedAt: Date.now(),
      decidedBy: admin._id,
      decisionNote: text,
    });
    await notify(ctx, {
      userId: application.userId,
      type: 'projectCall.decision',
      titleKey:
        decision === 'selected'
          ? 'projectCallSelected'
          : decision === 'waitlisted'
            ? 'projectCallWaitlisted'
            : 'projectCallRejected',
      params: { title: call?.title ?? '' },
      link: '/espace-membre/projets',
    });
    await recordAudit(ctx, {
      actorId: admin._id,
      action: AUDIT.PROJECT_CALL_DECIDED,
      targetId: applicationId,
      metadata: { decision, callId: application.callId },
    });
    return null;
  },
});
