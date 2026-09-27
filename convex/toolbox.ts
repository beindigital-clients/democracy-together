import { v, ConvexError } from 'convex/values';
import { mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { getCurrentUser, requireNetworkRole, requireUser } from './lib/rbac';
import { enforceRateLimit, RATE_LIMITS } from './lib/rateLimit';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { FIELD_MAX } from './lib/validation';
import { slugify } from './lib/slug';
import { locale } from './lib/locales';
import {
  PROGRAMME_LIMITS,
  PROGRAMME_THEMES,
  certificateCode,
  cleanVocabulary,
  isStepUrl,
  levelValidator,
  resourceKindValidator,
} from './lib/programmes';

// Boîte à outils et parcours d'apprentissage (F-56, F-57).
//
// Une RESSOURCE est un guide, une fiche, un modèle, une vidéo ou un lien, avec
// ses thèmes, sa langue, son niveau, et un fichier OU une adresse. Un PARCOURS
// ordonne des étapes ; une étape pointe une ressource de la boîte, ou une
// adresse — typiquement un replay, que le chantier « contenus » gère : le
// parcours le référence, il ne le recopie pas.
//
// Un compte connecté s'inscrit à un parcours, coche ses étapes, et obtient une
// ATTESTATION quand toutes le sont (page imprimable : aucune dépendance PDF
// n'est présente dans le dépôt, et une page d'impression suffit à la
// produire). La progression d'un membre n'est lisible que par lui.
//
// Édition : rang ÉDITEUR, comme les autres contenus éditoriaux.

const HOUR = 60 * 60 * 1000;
const PROGRESS_LIMIT = { max: 300, windowMs: HOUR };
const MAX_RESOURCE_BYTES = 20 * 1024 * 1024;
// Types acceptés pour un fichier de ressource, relus sur les métadonnées
// RÉELLES du stockage (jamais le type annoncé par le formulaire).
const RESOURCE_FILE_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.oasis.opendocument.presentation',
  'application/zip',
  'image/png',
  'image/jpeg',
  'video/mp4',
];

// --- Projections --------------------------------------------------------------

const resourceValidator = v.object({
  _id: v.id('toolboxResources'),
  slug: v.string(),
  title: v.string(),
  summary: v.string(),
  kind: resourceKindValidator,
  themes: v.array(v.string()),
  language: locale,
  level: levelValidator,
  fileName: v.union(v.string(), v.null()),
  fileUrl: v.union(v.string(), v.null()),
  url: v.union(v.string(), v.null()),
});

async function projectResource(ctx: QueryCtx, r: Doc<'toolboxResources'>) {
  return {
    _id: r._id,
    slug: r.slug,
    title: r.title,
    summary: r.summary,
    kind: r.kind,
    themes: r.themes,
    language: r.language,
    level: r.level,
    fileName: r.fileName ?? null,
    fileUrl: r.fileId ? await ctx.storage.getUrl(r.fileId) : null,
    url: r.url ?? null,
  };
}

const pathSummaryValidator = v.object({
  _id: v.id('learningPaths'),
  slug: v.string(),
  title: v.string(),
  summary: v.string(),
  language: locale,
  level: levelValidator,
  themes: v.array(v.string()),
  steps: v.number(),
});

const stepValidator = v.object({
  _id: v.id('learningPathSteps'),
  order: v.number(),
  title: v.string(),
  note: v.union(v.string(), v.null()),
  // Ressource liée (publiée), sinon adresse.
  resource: v.union(resourceValidator, v.null()),
  url: v.union(v.string(), v.null()),
});

async function stepsOf(ctx: QueryCtx, pathId: Id<'learningPaths'>) {
  return await ctx.db
    .query('learningPathSteps')
    .withIndex('by_path_and_order', (q) => q.eq('pathId', pathId))
    .take(PROGRAMME_LIMITS.maxSteps);
}

async function projectSteps(
  ctx: QueryCtx,
  pathId: Id<'learningPaths'>,
  publicOnly: boolean,
) {
  const out = [];
  for (const s of await stepsOf(ctx, pathId)) {
    const r = s.resourceId ? await ctx.db.get(s.resourceId) : null;
    out.push({
      _id: s._id,
      order: s.order,
      title: s.title,
      note: s.note ?? null,
      resource:
        r && (!publicOnly || r.status === 'published')
          ? await projectResource(ctx, r)
          : null,
      url: s.url ?? null,
    });
  }
  return out;
}

// --- Public -------------------------------------------------------------------

export const listResources = query({
  args: {},
  returns: v.array(resourceValidator),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('toolboxResources')
      .withIndex('by_status', (q) => q.eq('status', 'published'))
      .order('desc')
      .take(300);
    const out = [];
    for (const r of rows) out.push(await projectResource(ctx, r));
    return out;
  },
});

export const listPaths = query({
  args: {},
  returns: v.array(pathSummaryValidator),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query('learningPaths')
      .withIndex('by_status', (q) => q.eq('status', 'published'))
      .order('desc')
      .take(100);
    const out = [];
    for (const p of rows) {
      out.push({
        _id: p._id,
        slug: p.slug,
        title: p.title,
        summary: p.summary,
        language: p.language,
        level: p.level,
        themes: p.themes,
        steps: (await stepsOf(ctx, p._id)).length,
      });
    }
    return out;
  },
});

export const getPath = query({
  args: { slug: v.string() },
  returns: v.union(
    v.null(),
    pathSummaryValidator.extend({ stepList: v.array(stepValidator) }),
  ),
  handler: async (ctx, { slug }) => {
    const p = await ctx.db
      .query('learningPaths')
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .unique();
    if (!p || p.status !== 'published') return null;
    const stepList = await projectSteps(ctx, p._id, true);
    return {
      _id: p._id,
      slug: p.slug,
      title: p.title,
      summary: p.summary,
      language: p.language,
      level: p.level,
      themes: p.themes,
      steps: stepList.length,
      stepList,
    };
  },
});

// --- Progression (compte connecté) ------------------------------------------

async function myEnrollment(
  ctx: QueryCtx,
  pathId: Id<'learningPaths'>,
  userId: Id<'users'>,
) {
  return await ctx.db
    .query('learningEnrollments')
    .withIndex('by_path_and_user', (q) =>
      q.eq('pathId', pathId).eq('userId', userId),
    )
    .unique();
}

// La progression rendue est TOUJOURS celle de l'appelant : aucun argument ne
// désigne un autre membre, il n'y a donc rien à deviner.
export const myPathProgress = query({
  args: { pathId: v.id('learningPaths') },
  returns: v.union(
    v.null(),
    v.object({
      enrollmentId: v.id('learningEnrollments'),
      enrolledAt: v.number(),
      completedAt: v.union(v.number(), v.null()),
      doneStepIds: v.array(v.id('learningPathSteps')),
    }),
  ),
  handler: async (ctx, { pathId }) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;
    const e = await myEnrollment(ctx, pathId, user._id);
    if (!e) return null;
    const done = await ctx.db
      .query('learningProgress')
      .withIndex('by_enrollment', (q) => q.eq('enrollmentId', e._id))
      .take(PROGRAMME_LIMITS.maxSteps * 2);
    return {
      enrollmentId: e._id,
      enrolledAt: e.enrolledAt,
      completedAt: e.completedAt ?? null,
      doneStepIds: done.map((d) => d.stepId),
    };
  },
});

export const myLearning = query({
  args: {},
  returns: v.array(
    v.object({
      enrollmentId: v.id('learningEnrollments'),
      pathSlug: v.string(),
      pathTitle: v.string(),
      steps: v.number(),
      done: v.number(),
      enrolledAt: v.number(),
      completedAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];
    const rows = await ctx.db
      .query('learningEnrollments')
      .withIndex('by_user', (q) => q.eq('userId', user._id))
      .take(50);
    const out = [];
    for (const e of rows) {
      const p = await ctx.db.get(e.pathId);
      if (!p) continue;
      const done = await ctx.db
        .query('learningProgress')
        .withIndex('by_enrollment', (q) => q.eq('enrollmentId', e._id))
        .take(PROGRAMME_LIMITS.maxSteps * 2);
      out.push({
        enrollmentId: e._id,
        pathSlug: p.slug,
        pathTitle: p.title,
        steps: (await stepsOf(ctx, p._id)).length,
        done: done.length,
        enrolledAt: e.enrolledAt,
        completedAt: e.completedAt ?? null,
      });
    }
    return out.sort((a, b) => b.enrolledAt - a.enrolledAt);
  },
});

export const enroll = mutation({
  args: { pathId: v.id('learningPaths') },
  returns: v.id('learningEnrollments'),
  handler: async (ctx, { pathId }) => {
    const user = await requireUser(ctx);
    const path = await ctx.db.get(pathId);
    if (!path || path.status !== 'published')
      throw new ConvexError('NOT_FOUND');
    const existing = await myEnrollment(ctx, pathId, user._id);
    if (existing) return existing._id;
    return await ctx.db.insert('learningEnrollments', {
      pathId,
      userId: user._id,
      enrolledAt: Date.now(),
    });
  },
});

async function refreshCompletion(
  ctx: MutationCtx,
  enrollment: Doc<'learningEnrollments'>,
) {
  const steps = await stepsOf(ctx, enrollment.pathId);
  const done = await ctx.db
    .query('learningProgress')
    .withIndex('by_enrollment', (q) => q.eq('enrollmentId', enrollment._id))
    .take(PROGRAMME_LIMITS.maxSteps * 2);
  const doneIds = new Set(done.map((d) => d.stepId as string));
  const complete =
    steps.length > 0 && steps.every((s) => doneIds.has(s._id as string));
  if (complete && enrollment.completedAt === undefined) {
    const completedAt = Date.now();
    await ctx.db.patch(enrollment._id, {
      completedAt,
      certificateCode: certificateCode(enrollment._id, completedAt),
    });
  } else if (!complete && enrollment.completedAt !== undefined) {
    // Une étape décochée retire l'attestation : elle certifie un parcours
    // ACHEVÉ, pas un parcours commencé. (Une étape AJOUTÉE après coup ne la
    // retire pas : l'attestation date ce que le parcours était alors.)
    await ctx.db.patch(enrollment._id, {
      completedAt: undefined,
      certificateCode: undefined,
    });
  }
}

export const setStepDone = mutation({
  args: {
    stepId: v.id('learningPathSteps'),
    done: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, { stepId, done }) => {
    const user = await requireUser(ctx);
    const step = await ctx.db.get(stepId);
    if (!step) throw new ConvexError('NOT_FOUND');
    const enrollment = await myEnrollment(ctx, step.pathId, user._id);
    if (!enrollment) throw new ConvexError('NOT_ENROLLED');
    await enforceRateLimit(ctx, {
      key: `learning:${user._id}`,
      ...PROGRESS_LIMIT,
    });
    const rows = await ctx.db
      .query('learningProgress')
      .withIndex('by_enrollment', (q) => q.eq('enrollmentId', enrollment._id))
      .take(PROGRAMME_LIMITS.maxSteps * 2);
    const current = rows.filter((r) => r.stepId === stepId);
    if (done && current.length === 0) {
      await ctx.db.insert('learningProgress', {
        enrollmentId: enrollment._id,
        userId: user._id,
        stepId,
        completedAt: Date.now(),
      });
    } else if (!done) {
      for (const r of current) await ctx.db.delete(r._id);
    }
    await refreshCompletion(ctx, enrollment);
    return null;
  },
});

export const getCertificate = query({
  args: { enrollmentId: v.id('learningEnrollments') },
  returns: v.object({
    holderName: v.string(),
    pathTitle: v.string(),
    pathSlug: v.string(),
    level: levelValidator,
    steps: v.number(),
    completedAt: v.number(),
    code: v.string(),
  }),
  handler: async (ctx, { enrollmentId }) => {
    const user = await requireUser(ctx);
    const e = await ctx.db.get(enrollmentId);
    // L'attestation d'un autre membre répond comme une attestation
    // inexistante : l'identifiant ne révèle ni son titulaire ni sa progression.
    if (!e || e.userId !== user._id) throw new ConvexError('NOT_FOUND');
    if (e.completedAt === undefined || !e.certificateCode)
      throw new ConvexError('NOT_COMPLETED');
    const path = await ctx.db.get(e.pathId);
    if (!path) throw new ConvexError('NOT_FOUND');
    return {
      holderName: user.name?.trim() || user.email || '—',
      pathTitle: path.title,
      pathSlug: path.slug,
      level: path.level,
      steps: (await stepsOf(ctx, path._id)).length,
      completedAt: e.completedAt,
      code: e.certificateCode,
    };
  },
});

// --- Back-office (éditeur et au-dessus) ---------------------------------------

export const generateResourceUploadUrl = mutation({
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    const user = await requireNetworkRole(ctx, 'editeur');
    await enforceRateLimit(ctx, {
      key: `upload:${user._id}`,
      ...RATE_LIMITS.upload,
    });
    return await ctx.storage.generateUploadUrl();
  },
});

export const adminListResources = query({
  args: {},
  returns: v.array(
    resourceValidator.extend({
      status: v.union(v.literal('draft'), v.literal('published')),
    }),
  ),
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'editeur');
    const rows = await ctx.db.query('toolboxResources').order('desc').take(300);
    const out = [];
    for (const r of rows)
      out.push({ ...(await projectResource(ctx, r)), status: r.status });
    return out;
  },
});

async function uniqueSlug(
  ctx: QueryCtx,
  table: 'toolboxResources' | 'learningPaths',
  title: string,
): Promise<string> {
  const root = slugify(title);
  let slug = root;
  let n = 2;
  while (
    await ctx.db
      .query(table)
      .withIndex('by_slug', (q) => q.eq('slug', slug))
      .first()
  ) {
    slug = `${root}-${n++}`;
  }
  return slug;
}

function checkText(title: string, summary: string) {
  const t = title.trim();
  const s = summary.trim();
  if (t.length < 4 || t.length > PROGRAMME_LIMITS.shortText)
    throw new ConvexError('INVALID_TITLE');
  if (s.length < 10 || s.length > FIELD_MAX.body)
    throw new ConvexError('INVALID_SUMMARY');
  return { title: t, summary: s };
}

export const saveResource = mutation({
  args: {
    resourceId: v.optional(v.id('toolboxResources')),
    title: v.string(),
    summary: v.string(),
    kind: resourceKindValidator,
    themes: v.array(v.string()),
    language: locale,
    level: levelValidator,
    url: v.optional(v.string()),
    fileId: v.optional(v.id('_storage')),
    fileName: v.optional(v.string()),
  },
  returns: v.id('toolboxResources'),
  handler: async (ctx, args) => {
    const editor = await requireNetworkRole(ctx, 'editeur');
    const { title, summary } = checkText(args.title, args.summary);
    const themes = cleanVocabulary(args.themes, PROGRAMME_THEMES);
    if (!themes) throw new ConvexError('INVALID_THEMES');
    const url = args.url?.trim() || undefined;
    if (url && !isStepUrl(url)) throw new ConvexError('INVALID_URL');
    const existing = args.resourceId ? await ctx.db.get(args.resourceId) : null;
    if (args.resourceId && !existing) throw new ConvexError('NOT_FOUND');
    const fileId = args.fileId ?? existing?.fileId;
    if (args.fileId) {
      const meta = await ctx.db.system.get(args.fileId);
      if (
        !meta ||
        meta.size === 0 ||
        meta.size > MAX_RESOURCE_BYTES ||
        (meta.contentType && !RESOURCE_FILE_TYPES.includes(meta.contentType))
      )
        throw new ConvexError('INVALID_FILE');
    }
    // Un lien EST une adresse ; les autres formats ont un fichier ou une
    // adresse (une vidéo hébergée ailleurs, un modèle partagé en ligne).
    if (args.kind === 'lien' && !url) throw new ConvexError('URL_REQUIRED');
    if (!url && !fileId) throw new ConvexError('FILE_OR_URL_REQUIRED');

    const now = Date.now();
    const fields = {
      title,
      summary,
      kind: args.kind,
      themes,
      language: args.language,
      level: args.level,
      url,
      fileId,
      fileName: args.fileId
        ? args.fileName?.trim().slice(0, 200) || 'document'
        : existing?.fileName,
      updatedAt: now,
    };
    let id = args.resourceId;
    if (existing && id) {
      if (args.fileId && existing.fileId && existing.fileId !== args.fileId)
        await ctx.storage.delete(existing.fileId);
      await ctx.db.patch(id, fields);
    } else {
      id = await ctx.db.insert('toolboxResources', {
        slug: await uniqueSlug(ctx, 'toolboxResources', title),
        ...fields,
        status: 'draft',
        createdBy: editor._id,
        createdAt: now,
      });
    }
    await recordAudit(ctx, {
      actorId: editor._id,
      action: AUDIT.TOOLBOX_RESOURCE_SAVED,
      targetId: id,
      metadata: { title },
    });
    return id;
  },
});

export const setResourceStatus = mutation({
  args: {
    resourceId: v.id('toolboxResources'),
    status: v.union(v.literal('draft'), v.literal('published')),
  },
  returns: v.null(),
  handler: async (ctx, { resourceId, status }) => {
    const editor = await requireNetworkRole(ctx, 'editeur');
    const r = await ctx.db.get(resourceId);
    if (!r) throw new ConvexError('NOT_FOUND');
    await ctx.db.patch(resourceId, { status, updatedAt: Date.now() });
    await recordAudit(ctx, {
      actorId: editor._id,
      action: AUDIT.TOOLBOX_RESOURCE_SAVED,
      targetId: resourceId,
      metadata: { status },
    });
    return null;
  },
});

export const adminListPaths = query({
  args: {},
  returns: v.array(
    pathSummaryValidator.extend({
      status: v.union(v.literal('draft'), v.literal('published')),
      stepList: v.array(stepValidator),
      enrollments: v.number(),
    }),
  ),
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'editeur');
    const rows = await ctx.db.query('learningPaths').order('desc').take(100);
    const out = [];
    for (const p of rows) {
      const stepList = await projectSteps(ctx, p._id, false);
      const enrollments = await ctx.db
        .query('learningEnrollments')
        .withIndex('by_path_and_user', (q) => q.eq('pathId', p._id))
        .take(1000);
      out.push({
        _id: p._id,
        slug: p.slug,
        title: p.title,
        summary: p.summary,
        language: p.language,
        level: p.level,
        themes: p.themes,
        steps: stepList.length,
        status: p.status,
        stepList,
        enrollments: enrollments.length,
      });
    }
    return out;
  },
});

export const savePath = mutation({
  args: {
    pathId: v.optional(v.id('learningPaths')),
    title: v.string(),
    summary: v.string(),
    language: locale,
    level: levelValidator,
    themes: v.array(v.string()),
  },
  returns: v.id('learningPaths'),
  handler: async (ctx, args) => {
    const editor = await requireNetworkRole(ctx, 'editeur');
    const { title, summary } = checkText(args.title, args.summary);
    const themes = cleanVocabulary(args.themes, PROGRAMME_THEMES);
    if (!themes) throw new ConvexError('INVALID_THEMES');
    const now = Date.now();
    const fields = {
      title,
      summary,
      language: args.language,
      level: args.level,
      themes,
      updatedAt: now,
    };
    let id = args.pathId;
    if (id) {
      if (!(await ctx.db.get(id))) throw new ConvexError('NOT_FOUND');
      await ctx.db.patch(id, fields);
    } else {
      id = await ctx.db.insert('learningPaths', {
        slug: await uniqueSlug(ctx, 'learningPaths', title),
        ...fields,
        status: 'draft',
        createdBy: editor._id,
        createdAt: now,
      });
    }
    await recordAudit(ctx, {
      actorId: editor._id,
      action: AUDIT.TOOLBOX_PATH_SAVED,
      targetId: id,
      metadata: { title },
    });
    return id;
  },
});

export const setPathStatus = mutation({
  args: {
    pathId: v.id('learningPaths'),
    status: v.union(v.literal('draft'), v.literal('published')),
  },
  returns: v.null(),
  handler: async (ctx, { pathId, status }) => {
    const editor = await requireNetworkRole(ctx, 'editeur');
    const p = await ctx.db.get(pathId);
    if (!p) throw new ConvexError('NOT_FOUND');
    // Un parcours publié sans étape serait une page vide qu'on ne peut pas
    // achever — donc une attestation impossible.
    if (status === 'published' && (await stepsOf(ctx, pathId)).length === 0)
      throw new ConvexError('NO_STEPS');
    await ctx.db.patch(pathId, { status, updatedAt: Date.now() });
    await recordAudit(ctx, {
      actorId: editor._id,
      action: AUDIT.TOOLBOX_PATH_SAVED,
      targetId: pathId,
      metadata: { status },
    });
    return null;
  },
});

export const addStep = mutation({
  args: {
    pathId: v.id('learningPaths'),
    title: v.string(),
    note: v.optional(v.string()),
    resourceId: v.optional(v.id('toolboxResources')),
    url: v.optional(v.string()),
  },
  returns: v.id('learningPathSteps'),
  handler: async (ctx, args) => {
    const editor = await requireNetworkRole(ctx, 'editeur');
    const path = await ctx.db.get(args.pathId);
    if (!path) throw new ConvexError('NOT_FOUND');
    const title = args.title.trim();
    if (title.length < 3 || title.length > PROGRAMME_LIMITS.shortText)
      throw new ConvexError('INVALID_TITLE');
    const note = args.note?.trim() || undefined;
    if (note && note.length > FIELD_MAX.body)
      throw new ConvexError('INVALID_NOTE');
    const url = args.url?.trim() || undefined;
    if (url && !isStepUrl(url)) throw new ConvexError('INVALID_URL');
    if (args.resourceId && !(await ctx.db.get(args.resourceId)))
      throw new ConvexError('NOT_FOUND');
    if (!args.resourceId && !url)
      throw new ConvexError('RESOURCE_OR_URL_REQUIRED');
    const steps = await stepsOf(ctx, args.pathId);
    if (steps.length >= PROGRAMME_LIMITS.maxSteps)
      throw new ConvexError('TOO_MANY_STEPS');
    const order = steps.length > 0 ? steps[steps.length - 1].order + 1 : 1;
    const id = await ctx.db.insert('learningPathSteps', {
      pathId: args.pathId,
      order,
      title,
      note,
      resourceId: args.resourceId,
      url,
    });
    await recordAudit(ctx, {
      actorId: editor._id,
      action: AUDIT.TOOLBOX_PATH_SAVED,
      targetId: args.pathId,
      metadata: { stepAdded: id },
    });
    return id;
  },
});

export const moveStep = mutation({
  args: {
    stepId: v.id('learningPathSteps'),
    direction: v.union(v.literal('up'), v.literal('down')),
  },
  returns: v.null(),
  handler: async (ctx, { stepId, direction }) => {
    await requireNetworkRole(ctx, 'editeur');
    const step = await ctx.db.get(stepId);
    if (!step) throw new ConvexError('NOT_FOUND');
    const steps = await stepsOf(ctx, step.pathId);
    const i = steps.findIndex((s) => s._id === stepId);
    const j = direction === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= steps.length) return null;
    await ctx.db.patch(steps[i]._id, { order: steps[j].order });
    await ctx.db.patch(steps[j]._id, { order: steps[i].order });
    return null;
  },
});

export const removeStep = mutation({
  args: { stepId: v.id('learningPathSteps') },
  returns: v.null(),
  handler: async (ctx, { stepId }) => {
    const editor = await requireNetworkRole(ctx, 'editeur');
    const step = await ctx.db.get(stepId);
    if (!step) throw new ConvexError('NOT_FOUND');
    // La progression attachée à l'étape disparaît avec elle ; les inscrits
    // dont c'était la seule étape restante achèvent alors le parcours.
    const enrollments = await ctx.db
      .query('learningEnrollments')
      .withIndex('by_path_and_user', (q) => q.eq('pathId', step.pathId))
      .take(1000);
    await ctx.db.delete(stepId);
    for (const e of enrollments) {
      const rows = await ctx.db
        .query('learningProgress')
        .withIndex('by_enrollment', (q) => q.eq('enrollmentId', e._id))
        .take(PROGRAMME_LIMITS.maxSteps * 2);
      for (const r of rows.filter((r) => r.stepId === stepId))
        await ctx.db.delete(r._id);
      await refreshCompletion(ctx, e);
    }
    await recordAudit(ctx, {
      actorId: editor._id,
      action: AUDIT.TOOLBOX_PATH_SAVED,
      targetId: step.pathId,
      metadata: { stepRemoved: stepId },
    });
    return null;
  },
});
