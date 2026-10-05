import { v, ConvexError } from 'convex/values';
import { query, mutation } from './_generated/server';
import type { QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { requireNetworkRole, requireReviewChief } from './lib/rbac';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { internal } from './_generated/api';
import { notify } from './lib/notify';
import {
  KOHOP_BOUNDS,
  KOHOP_DELAYS_MS,
  KOHOP_RECUSAL_REASONS,
  KOHOP_STAGES,
  kohopAccessMode,
  kohopReasonCode,
  eventsFor,
  positiveCount,
  presumptionOfAcceptance,
  type KohopStage,
} from './lib/kohop';
import {
  advance,
  getKohopSettings,
  recordKohopEvent,
  SETTINGS_KEY,
  versionOf,
} from './lib/kohopAccess';
import { inviteReviewer, replaceTitular } from './lib/kohopReviewing';
import { latestReport } from './kohopOriginality';

// KOHOP — the REVIEW CHIEF's side. Every function passes `requireReviewChief`
// (the administrator included); a moderator or an editor without the function
// has no access at all. The state machine decides what is possible: a refused
// transition throws before anything is written.

function refuse(code: string): never {
  throw new ConvexError(code);
}

function reasonOf(text: string): string {
  const reason = text.trim();
  if (
    reason.length < KOHOP_BOUNDS.reason.min ||
    reason.length > KOHOP_BOUNDS.reason.max
  ) {
    refuse('REASON_REQUIRED');
  }
  return reason;
}

async function loadFile(
  ctx: QueryCtx,
  id: Id<'kohopContributions'>,
): Promise<Doc<'kohopContributions'>> {
  const file = await ctx.db.get(id);
  if (!file) refuse('NOT_FOUND');
  return file;
}

// --- Queue and file -----------------------------------------------------------

const COUNT_CAP = 200;

/** Counters per stage, and the list of one stage (default: submitted). */
export const queue = query({
  args: { stage: v.optional(v.string()) },
  handler: async (ctx, { stage }) => {
    await requireReviewChief(ctx);
    const wanted: KohopStage = (KOHOP_STAGES as readonly string[]).includes(
      stage ?? '',
    )
      ? (stage as KohopStage)
      : 'submitted';

    const counts: Record<string, number> = {};
    for (const s of KOHOP_STAGES) {
      if (s === 'draft') continue;
      counts[s] = (
        await ctx.db
          .query('kohopContributions')
          .withIndex('by_stage', (q) => q.eq('stage', s))
          .take(COUNT_CAP)
      ).length;
    }

    const rows = await ctx.db
      .query('kohopContributions')
      .withIndex('by_stage', (q) => q.eq('stage', wanted))
      .order('desc')
      .take(50);
    const items = [];
    for (const c of rows) {
      const author = await ctx.db.get(c.authorUserId);
      const org = c.organizationId ? await ctx.db.get(c.organizationId) : null;
      const reviewers = await ctx.db
        .query('kohopReviewers')
        .withIndex('by_contribution', (q) => q.eq('contributionId', c._id))
        .take(30);
      items.push({
        _id: c._id,
        title: c.title,
        stage: c.stage,
        lang: c.lang,
        authorName: author?.name?.trim() || author?.email || '—',
        organization: org?.name ?? null,
        submittedAt: c.submittedAt ?? null,
        revisionDueAt: c.revisionDueAt ?? null,
        proofDueAt: c.proofDueAt ?? null,
        returnedDueAt: c.returnedDueAt ?? null,
        reviewersApproved: reviewers.filter(
          (r) =>
            r.slot === 'titular' &&
            r.status !== 'proposed' &&
            r.status !== 'recused',
        ).length,
        reviewersProposed: reviewers.filter(
          (r) => r.slot === 'titular' && r.status === 'proposed',
        ).length,
      });
    }
    return { stage: wanted, counts, items };
  },
});

/**
 * The full file. This is the ONLY place where the link findings, their
 * sources, the declared relationships and the reviewers' e-mails are shown.
 */
export const dossier = query({
  args: { contributionId: v.id('kohopContributions') },
  handler: async (ctx, { contributionId }) => {
    await requireReviewChief(ctx);
    const file = await loadFile(ctx, contributionId);
    const author = await ctx.db.get(file.authorUserId);
    const org = file.organizationId
      ? await ctx.db.get(file.organizationId)
      : null;

    const versions = await ctx.db
      .query('kohopVersions')
      .withIndex('by_contribution_and_version', (q) =>
        q.eq('contributionId', contributionId),
      )
      .order('desc')
      .take(20);

    const reviewerRows = await ctx.db
      .query('kohopReviewers')
      .withIndex('by_contribution', (q) =>
        q.eq('contributionId', contributionId),
      )
      .take(30);
    const reviewers = [];
    for (const r of reviewerRows) {
      const checks = await ctx.db
        .query('kohopLinkChecks')
        .withIndex('by_reviewer', (q) => q.eq('reviewerId', r._id))
        .order('desc')
        .take(10);
      reviewers.push({
        _id: r._id,
        slot: r.slot,
        source: r.source,
        name: r.name,
        email: r.email ?? null,
        affiliation: r.affiliation ?? null,
        publicUrl: r.publicUrl ?? null,
        rationale: r.rationale ?? null,
        declaredRelationship: r.declaredRelationship ?? null,
        status: r.status,
        recusal: r.recusal
          ? {
              reason: r.recusal.reason,
              note: r.recusal.note ?? null,
              at: r.recusal.at,
            }
          : null,
        dueAt: r.dueAt ?? null,
        linkChecks: checks.map((c) => ({
          level: c.level,
          origin: c.origin,
          failed: c.failed === true,
          error: c.error ?? null,
          model: c.model ?? null,
          synthesis: c.synthesis ?? null,
          synthesisError: c.synthesisError ?? null,
          checkedAt: c.checkedAt,
          findings: c.findings.map((f) => ({
            type: f.type,
            detail: f.detail,
            source: f.source ?? null,
            url: f.url ?? null,
          })),
        })),
      });
    }

    const events = await ctx.db
      .query('kohopEvents')
      .withIndex('by_contribution', (q) =>
        q.eq('contributionId', contributionId),
      )
      .order('desc')
      .take(100);
    const actors = new Map<string, string>();
    for (const e of events) {
      if (e.actorId && !actors.has(e.actorId)) {
        const u = await ctx.db.get(e.actorId);
        actors.set(e.actorId, u?.name?.trim() || u?.email || '—');
      }
    }
    const decisions = await ctx.db
      .query('kohopDecisions')
      .withIndex('by_contribution', (q) =>
        q.eq('contributionId', contributionId),
      )
      .order('desc')
      .take(20);

    // The analyses, WITH the confidential note: the chief's eyes only.
    const reviewRows = await ctx.db
      .query('kohopReviews')
      .withIndex('by_contribution', (q) =>
        q.eq('contributionId', contributionId),
      )
      .take(10);

    return {
      _id: file._id,
      stage: file.stage,
      lang: file.lang,
      title: file.title,
      reviewedVersion: file.reviewedVersion ?? null,
      acceptedVersion: file.acceptedVersion ?? null,
      slug: file.slug ?? null,
      scheduledFor: file.scheduledFor ?? null,
      reviews: reviewRows.map((r) => ({
        _id: r._id,
        recommendation: r.recommendation,
        analysis: r.analysis,
        noteToEditor: r.noteToEditor ?? null,
        displayName: r.displayName,
        affiliation: r.affiliation ?? null,
        version: r.version,
        submittedAt: r.submittedAt,
      })),
      positiveReviews: positiveCount(reviewRows),
      presumption: presumptionOfAcceptance(reviewRows),
      fields: file.fields,
      keywords: file.keywords,
      coAuthors: file.coAuthors,
      priorWorks: file.priorWorks,
      originalityDeclaration: file.originalityDeclaration ?? '',
      charterVersion: file.charterVersion ?? null,
      charterAcceptedAt: file.charterAcceptedAt ?? null,
      licence: file.licence,
      currentVersion: file.currentVersion,
      submittedVersion: file.submittedVersion ?? null,
      submittedAt: file.submittedAt ?? null,
      revisionDueAt: file.revisionDueAt ?? null,
      proofDueAt: file.proofDueAt ?? null,
      returnedDueAt: file.returnedDueAt ?? null,
      author: {
        _id: file.authorUserId,
        name: author?.name?.trim() || null,
        email: author?.email ?? null,
        organization: org ? { name: org.name, slug: org.slug } : null,
      },
      versions: versions.map((x) => ({
        version: x.version,
        kind: x.kind,
        title: x.title,
        standfirst: x.standfirst,
        body: x.body,
        links: x.links,
        wordCount: x.wordCount,
        response: x.responseToReviewers ?? null,
        createdAt: x.createdAt,
      })),
      reviewers,
      events: events.map((e) => ({
        kind: e.kind,
        at: e.at,
        actor: e.actorId ? (actors.get(e.actorId) ?? null) : null,
      })),
      decisions: decisions.map((d) => ({
        kind: d.kind,
        reasonCode: d.reasonCode ?? null,
        reason: d.reason,
        at: d.createdAt,
      })),
      chiefActions: eventsFor(file.stage, 'chief'),
    };
  },
});

// --- Reviewers ----------------------------------------------------------------

const REVIEWER_STAGES: readonly KohopStage[] = [
  'submitted',
  'in_review',
  'revision',
];

/** The review chief approves a designated reviewer (no invitation before). */
export const approveReviewer = mutation({
  args: { reviewerId: v.id('kohopReviewers') },
  returns: v.null(),
  handler: async (ctx, { reviewerId }) => {
    const chief = await requireReviewChief(ctx);
    const reviewer = await ctx.db.get(reviewerId);
    if (!reviewer) refuse('NOT_FOUND');
    const file = await loadFile(ctx, reviewer.contributionId);
    if (!REVIEWER_STAGES.includes(file.stage)) refuse('INVALID_TRANSITION');
    if (reviewer.status !== 'proposed') refuse('INVALID_TRANSITION');

    await ctx.db.patch(reviewerId, {
      status: 'approved',
      updatedAt: Date.now(),
    });
    await recordKohopEvent(ctx, {
      contributionId: file._id,
      kind: 'reviewer_approved',
      actorId: chief._id,
      metadata: { reviewerId },
    });
    await recordAudit(ctx, {
      actorId: chief._id,
      action: AUDIT.KOHOP_REVIEWER_APPROVED,
      targetId: file._id,
      metadata: { reviewerId },
    });
    // A titular approved while the review is under way is invited at once.
    if (
      file.stage === 'in_review' &&
      reviewer.slot === 'titular' &&
      (reviewer.userId || reviewer.source === 'external')
    ) {
      await inviteReviewer(ctx, file, reviewer, chief._id);
    }
    return null;
  },
});

/**
 * The review chief runs the links check outside the platform again (a failed
 * check, an ORCID added since). Nothing changes on the file but a new check row.
 */
export const recheckLinks = mutation({
  args: { reviewerId: v.id('kohopReviewers') },
  returns: v.null(),
  handler: async (ctx, { reviewerId }) => {
    const chief = await requireReviewChief(ctx);
    const reviewer = await ctx.db.get(reviewerId);
    if (!reviewer) refuse('NOT_FOUND');
    const file = await loadFile(ctx, reviewer.contributionId);
    if (!REVIEWER_STAGES.includes(file.stage)) refuse('INVALID_TRANSITION');
    await ctx.scheduler.runAfter(0, internal.kohopLinkExternal.check, {
      reviewerId,
    });
    await recordAudit(ctx, {
      actorId: chief._id,
      action: AUDIT.KOHOP_LINK_CHECKED,
      targetId: file._id,
      metadata: { reviewerId, requested: true },
    });
    return null;
  },
});

/** The review chief rejects a reviewer, with a reason, at any time. */
export const recuseReviewer = mutation({
  args: {
    reviewerId: v.id('kohopReviewers'),
    reason: v.union(...KOHOP_RECUSAL_REASONS.map((r) => v.literal(r))),
    note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { reviewerId, reason, note }) => {
    const chief = await requireReviewChief(ctx);
    const reviewer = await ctx.db.get(reviewerId);
    if (!reviewer) refuse('NOT_FOUND');
    const file = await loadFile(ctx, reviewer.contributionId);
    if (reviewer.status === 'recused' || reviewer.status === 'submitted') {
      // An analysis already handed in is not undone by a recusal: the review
      // chief decides with it, or the file goes on without it.
      refuse('INVALID_TRANSITION');
    }
    if (!REVIEWER_STAGES.includes(file.stage)) refuse('INVALID_TRANSITION');
    const cleanNote = note?.trim() || undefined;
    if (cleanNote && cleanNote.length > KOHOP_BOUNDS.recusalReason.max)
      refuse('REASON_REQUIRED');

    const now = Date.now();
    await ctx.db.patch(reviewerId, {
      status: 'recused',
      recusal: { reason, note: cleanNote, by: chief._id, at: now },
      // Nothing is awaited from a rejected reviewer any more.
      dueAt: undefined,
      inviteTokenHash: undefined,
      inviteTokenExpiresAt: undefined,
      updatedAt: now,
    });
    await recordKohopEvent(ctx, {
      contributionId: file._id,
      kind: 'reviewer_recused',
      actorId: chief._id,
      metadata: { reviewerId, reason },
    });
    await recordAudit(ctx, {
      actorId: chief._id,
      action: AUDIT.KOHOP_REVIEWER_RECUSED,
      targetId: file._id,
      metadata: { reviewerId, reason },
    });
    // During the review, a rejected titular is replaced by the substitute (or
    // the chiefs and the author are told that a reviewer is missing). Before
    // it, the author designates a replacement.
    if (
      file.stage === 'in_review' &&
      reviewer.slot === 'titular' &&
      (reviewer.status === 'invited' || reviewer.status === 'accepted')
    ) {
      await replaceTitular(ctx, file, reviewer);
    } else {
      await notify(ctx, {
        userId: file.authorUserId,
        type: 'kohop_reviewer_replaced',
        titleKey: 'kohopReviewerReplaced',
        params: { title: file.title },
        link: `/espace-membre/kohop/${file._id}`,
      });
    }
    return null;
  },
});

// --- Admissibility -------------------------------------------------------------

/** Sends the file back to the author (corrections expected within 14 days). */
export const returnToAuthor = mutation({
  args: { contributionId: v.id('kohopContributions'), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, { contributionId, reason }) => {
    const chief = await requireReviewChief(ctx);
    const file = await loadFile(ctx, contributionId);
    const to = advance(file.stage, 'return');
    const text = reasonOf(reason);
    const now = Date.now();

    await ctx.db.patch(file._id, {
      stage: to,
      returnedDueAt: now + KOHOP_DELAYS_MS.returned,
      updatedAt: now,
    });
    await ctx.db.insert('kohopDecisions', {
      contributionId: file._id,
      version: file.submittedVersion ?? file.currentVersion,
      kind: 'returned',
      reason: text,
      positiveReviews: 0,
      againstPresumption: false,
      decidedBy: chief._id,
      createdAt: now,
    });
    await recordKohopEvent(ctx, {
      contributionId: file._id,
      kind: 'return',
      actorId: chief._id,
    });
    await recordAudit(ctx, {
      actorId: chief._id,
      action: AUDIT.KOHOP_RETURNED,
      targetId: file._id,
    });
    await notify(ctx, {
      userId: file.authorUserId,
      type: 'kohop_returned',
      titleKey: 'kohopReturned',
      params: { title: file.title },
      link: `/espace-membre/kohop/${file._id}`,
    });
    return null;
  },
});

/** Declares the file inadmissible: final, with a code and a text for the author. */
export const declareInadmissible = mutation({
  args: {
    contributionId: v.id('kohopContributions'),
    code: kohopReasonCode,
    reason: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { contributionId, code, reason }) => {
    const chief = await requireReviewChief(ctx);
    const file = await loadFile(ctx, contributionId);
    const to = advance(file.stage, 'declareInadmissible');
    const text = reasonOf(reason);
    const now = Date.now();

    await ctx.db.patch(file._id, { stage: to, decidedAt: now, updatedAt: now });
    await ctx.db.insert('kohopDecisions', {
      contributionId: file._id,
      version: file.submittedVersion ?? file.currentVersion,
      kind: 'inadmissible',
      reasonCode: code,
      reason: text,
      positiveReviews: 0,
      againstPresumption: false,
      decidedBy: chief._id,
      createdAt: now,
    });
    await recordKohopEvent(ctx, {
      contributionId: file._id,
      kind: 'declareInadmissible',
      actorId: chief._id,
      metadata: { code },
    });
    await recordAudit(ctx, {
      actorId: chief._id,
      action: AUDIT.KOHOP_INADMISSIBLE,
      targetId: file._id,
      metadata: { code },
    });
    await notify(ctx, {
      userId: file.authorUserId,
      type: 'kohop_inadmissible',
      titleKey: 'kohopInadmissible',
      params: { title: file.title },
      link: `/espace-membre/kohop/${file._id}`,
    });
    return null;
  },
});

/**
 * Starts the review. At least two titular reviewers must be APPROVED first:
 * no invitation can go to someone the review chief has not validated.
 */
export const startReview = mutation({
  args: { contributionId: v.id('kohopContributions') },
  returns: v.null(),
  handler: async (ctx, { contributionId }) => {
    const chief = await requireReviewChief(ctx);
    const file = await loadFile(ctx, contributionId);
    // The machine first: a stage that does not accept it writes nothing.
    const to = advance(file.stage, 'startReview');
    // The review waits for the internal originality report: the reviewers must
    // not read a text whose borrowings the chief has not seen.
    const submitted = file.submittedVersion ?? file.currentVersion;
    const platform = await latestReport(ctx, file._id, submitted, 'platform');
    if (platform?.status !== 'done') refuse('ORIGINALITY_REQUIRED');
    const reviewers = await ctx.db
      .query('kohopReviewers')
      .withIndex('by_contribution', (q) =>
        q.eq('contributionId', contributionId),
      )
      .take(30);
    const approved = reviewers.filter(
      (r) => r.slot === 'titular' && r.status === 'approved',
    );
    if (approved.length < KOHOP_BOUNDS.reviewers.titular) {
      refuse('REVIEWERS_NOT_VALIDATED');
    }

    const now = Date.now();
    await ctx.db.patch(file._id, {
      stage: to,
      reviewedVersion: file.submittedVersion ?? file.currentVersion,
      handlingEditorId: chief._id,
      updatedAt: now,
    });
    // The titulars are invited now (5 days to reply); the substitute stays
    // approved, ready to take the place of a titular who steps back.
    for (const reviewer of approved) {
      await inviteReviewer(ctx, file, reviewer, chief._id);
    }
    await recordKohopEvent(ctx, {
      contributionId: file._id,
      kind: 'startReview',
      actorId: chief._id,
      metadata: { version: file.submittedVersion ?? file.currentVersion },
    });
    await recordAudit(ctx, {
      actorId: chief._id,
      action: AUDIT.KOHOP_REVIEW_STARTED,
      targetId: file._id,
    });
    await notify(ctx, {
      userId: file.authorUserId,
      type: 'kohop_review_started',
      titleKey: 'kohopReviewStarted',
      params: { title: file.title },
      link: `/espace-membre/kohop/${file._id}`,
    });
    return null;
  },
});

// --- Pilot access (administrator) ---------------------------------------------

export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    await requireNetworkRole(ctx, 'admin');
    const settings = await getKohopSettings(ctx);
    const organizations = await ctx.db
      .query('organizations')
      .withIndex('by_status', (q) => q.eq('status', 'active'))
      .take(300);
    return {
      access: settings.access,
      pilotOrganizations: settings.pilotOrganizations,
      options: organizations
        .map((o) => ({ _id: o._id, name: o.name, country: o.country }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    };
  },
});

export const setSettings = mutation({
  args: {
    access: kohopAccessMode,
    pilotOrganizations: v.array(v.id('organizations')),
  },
  returns: v.null(),
  handler: async (ctx, { access, pilotOrganizations }) => {
    const admin = await requireNetworkRole(ctx, 'admin');
    const unique = [...new Set(pilotOrganizations)];
    if (unique.length > 100) refuse('INVALID_ORGANIZATIONS');
    for (const id of unique) {
      if (!(await ctx.db.get(id))) refuse('INVALID_ORGANIZATIONS');
    }
    const existing = await ctx.db
      .query('kohopSettings')
      .withIndex('by_key', (q) => q.eq('key', SETTINGS_KEY))
      .unique();
    const row = {
      access,
      pilotOrganizations: unique,
      updatedBy: admin._id,
      updatedAt: Date.now(),
    };
    if (existing) await ctx.db.patch(existing._id, row);
    else await ctx.db.insert('kohopSettings', { key: SETTINGS_KEY, ...row });
    await recordAudit(ctx, {
      actorId: admin._id,
      action: AUDIT.KOHOP_SETTINGS_CHANGED,
      metadata: { access, organizations: unique.length },
    });
    return null;
  },
});

// Exposed so the file screen can read a version's body without loading all of
// them (the dossier already carries the last twenty).
export const versionBody = query({
  args: {
    contributionId: v.id('kohopContributions'),
    version: v.number(),
  },
  handler: async (ctx, { contributionId, version }) => {
    await requireReviewChief(ctx);
    const row = await versionOf(ctx, contributionId, version);
    return row
      ? { title: row.title, standfirst: row.standfirst, body: row.body }
      : null;
  },
});
