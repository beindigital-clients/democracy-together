import { v, ConvexError } from 'convex/values';
import { internalMutation, mutation, query } from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { requireReviewChief } from './lib/rbac';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { notify } from './lib/notify';
import { reviewChiefRecipients } from './lib/reviewChiefs';
import { buildSearchText } from './lib/searchText';
import {
  KOHOP_BOUNDS,
  KOHOP_DELAYS_MS,
  KOHOP_PROOF_TACIT_APPROVAL,
  KOHOP_REMINDERS,
  KOHOP_SCHEDULE,
  type KohopEvent,
} from './lib/kohop';
import { textChanged, toPlainText } from './lib/kohopText';
import { deadlineAction } from './lib/kohopDeadlines';
import {
  advance,
  recordKohopEvent,
  requireOwnContribution,
  versionOf,
} from './lib/kohopAccess';
import { cleanFields } from './kohop';
import { authorLine } from './kohopUserData';
import { latestReport } from './kohopOriginality';

// KOHOP — PRODUCTION and PUBLICATION (K-18/K-19). An accepted contribution is
// copy-edited (a new `copyedit` version, the accepted one is kept), the author
// approves a proof (compulsory when the text changed), and a review chief
// publishes it — now, or at a date they set (cancellable). Nothing becomes
// public by itself: even a scheduled publication was scheduled by a chief, and
// is re-checked when it fires.

function refuse(code: string): never {
  throw new ConvexError(code);
}

const linkArg = v.object({
  label: v.string(),
  url: v.optional(v.string()),
  publicationId: v.optional(v.id('publications')),
});

async function loadFile(ctx: MutationCtx, id: Id<'kohopContributions'>) {
  const file = await ctx.db.get(id);
  if (!file) refuse('NOT_FOUND');
  return file;
}

/** The version the chief ACCEPTED, before any copy-editing. */
async function acceptedOriginal(
  ctx: QueryCtx | MutationCtx,
  file: Doc<'kohopContributions'>,
): Promise<Doc<'kohopVersions'> | null> {
  const decisions = await ctx.db
    .query('kohopDecisions')
    .withIndex('by_contribution', (q) => q.eq('contributionId', file._id))
    .order('desc')
    .take(20);
  const accepted = decisions.find((d) => d.kind === 'accepted');
  return accepted ? await versionOf(ctx, file._id, accepted.version) : null;
}

/** Has the copy-editing changed the accepted text? */
async function changedSinceAcceptance(
  ctx: QueryCtx | MutationCtx,
  file: Doc<'kohopContributions'>,
): Promise<boolean> {
  const original = await acceptedOriginal(ctx, file);
  const current = await versionOf(
    ctx,
    file._id,
    file.acceptedVersion ?? file.currentVersion,
  );
  if (!original || !current) return false;
  return (
    original.title !== current.title ||
    original.standfirst !== current.standfirst ||
    textChanged(original.body, current.body)
  );
}

/**
 * May this file go public, as far as originality goes: a finished platform
 * report on the version published, and an external one finished or
 * acknowledged (at that version, or at the acceptance).
 */
async function publishGate(
  ctx: QueryCtx | MutationCtx,
  file: Doc<'kohopContributions'>,
): Promise<boolean> {
  const version = file.acceptedVersion ?? file.currentVersion;
  const platform = await latestReport(ctx, file._id, version, 'platform');
  if (platform?.status !== 'done') return false;
  const external = await latestReport(ctx, file._id, version, 'external');
  if (external?.status === 'done' || external?.acknowledgedAt !== undefined) {
    return true;
  }
  const decisions = await ctx.db
    .query('kohopDecisions')
    .withIndex('by_contribution', (q) => q.eq('contributionId', file._id))
    .order('desc')
    .take(20);
  return (
    decisions.find((d) => d.kind === 'accepted')?.withoutExternalCheck === true
  );
}

async function notifyChiefs(
  ctx: MutationCtx,
  file: Doc<'kohopContributions'>,
  titleKey: string,
  type: string,
  params: Record<string, string> = {},
) {
  for (const chief of await reviewChiefRecipients(ctx)) {
    await notify(ctx, {
      userId: chief._id,
      type,
      titleKey,
      params: { title: file.title, ...params },
      link: `/admin/kohop/${file._id}`,
    });
  }
}

// --- Copy-editing and proof (review chief) ---------------------------------------

export const saveCopyedit = mutation({
  args: {
    contributionId: v.id('kohopContributions'),
    title: v.string(),
    standfirst: v.string(),
    body: v.string(),
    links: v.array(linkArg),
  },
  returns: v.object({ version: v.number() }),
  handler: async (ctx, args) => {
    const chief = await requireReviewChief(ctx);
    const file = await loadFile(ctx, args.contributionId);
    if (file.stage !== 'production') refuse('NOT_EDITABLE');
    const original = await acceptedOriginal(ctx, file);
    if (!original) refuse('NOT_FOUND');
    const clean = await cleanFields(ctx, {
      title: args.title,
      standfirst: args.standfirst,
      body: args.body,
      links: args.links,
      lang: file.lang,
      fields: file.fields,
      keywords: file.keywords,
      coAuthors: file.coAuthors,
      priorWorks: file.priorWorks,
    });
    const row = {
      title: clean.title,
      standfirst: clean.standfirst,
      body: clean.body,
      links: clean.links,
      wordCount: toPlainText(clean.body).split(/\s+/u).filter(Boolean).length,
    };
    const now = Date.now();
    let version = file.acceptedVersion ?? original.version;
    if (version === original.version) {
      // First edit: the accepted text is kept, the copy-edit is a new version.
      version = Math.max(file.currentVersion, version) + 1;
      await ctx.db.insert('kohopVersions', {
        contributionId: file._id,
        version,
        kind: 'copyedit',
        ...row,
        createdBy: chief._id,
        createdAt: now,
      });
    } else {
      const current = await versionOf(ctx, file._id, version);
      if (!current) refuse('NOT_FOUND');
      await ctx.db.patch(current._id, row);
    }
    await ctx.db.patch(file._id, {
      title: clean.title,
      acceptedVersion: version,
      currentVersion: Math.max(file.currentVersion, version),
      updatedAt: now,
    });
    await recordKohopEvent(ctx, {
      contributionId: file._id,
      kind: 'copyedit_saved',
      actorId: chief._id,
      metadata: { version },
    });
    await recordAudit(ctx, {
      actorId: chief._id,
      action: AUDIT.KOHOP_COPYEDITED,
      targetId: file._id,
      metadata: { version },
    });
    return { version };
  },
});

/** Sends the proof to the author: 5 days to approve or ask for corrections. */
export const sendProof = mutation({
  args: { contributionId: v.id('kohopContributions') },
  returns: v.null(),
  handler: async (ctx, { contributionId }) => {
    const chief = await requireReviewChief(ctx);
    const file = await loadFile(ctx, contributionId);
    const to = advance(file.stage, 'sendProof');
    const now = Date.now();
    const dueAt = now + KOHOP_DELAYS_MS.proof;
    await ctx.db.patch(file._id, {
      stage: to,
      proofDueAt: dueAt,
      proofReminders: 0,
      updatedAt: now,
    });
    await recordKohopEvent(ctx, {
      contributionId: file._id,
      kind: 'sendProof',
      actorId: chief._id,
    });
    await recordAudit(ctx, {
      actorId: chief._id,
      action: AUDIT.KOHOP_PROOF_SENT,
      targetId: file._id,
    });
    await notify(ctx, {
      userId: file.authorUserId,
      type: 'kohop_proof_to_approve',
      titleKey: 'kohopProofToApprove',
      params: {
        title: file.title,
        date: new Date(dueAt).toISOString().slice(0, 10),
      },
      link: `/espace-membre/kohop/${file._id}`,
    });
    await ctx.scheduler.runAfter(0, internal.kohopEmail.sendProductionEmail, {
      contributionId: file._id,
      kind: 'proofToApprove',
    });
    return null;
  },
});

/**
 * Ready without a proof: only when the copy-editing left the accepted text as
 * it was. A changed text always goes through the author's approval.
 */
export const markReady = mutation({
  args: { contributionId: v.id('kohopContributions') },
  returns: v.null(),
  handler: async (ctx, { contributionId }) => {
    const chief = await requireReviewChief(ctx);
    const file = await loadFile(ctx, contributionId);
    const to = advance(file.stage, 'markReady');
    if (await changedSinceAcceptance(ctx, file)) refuse('PROOF_REQUIRED');
    await toReady(ctx, file, to, chief._id, 'markReady');
    return null;
  },
});

async function toReady(
  ctx: MutationCtx,
  file: Doc<'kohopContributions'>,
  to: Doc<'kohopContributions'>['stage'],
  actorId: Id<'users'> | undefined,
  event: Extract<KohopEvent, 'markReady' | 'approveProof'>,
) {
  const now = Date.now();
  await ctx.db.patch(file._id, {
    stage: to,
    proofDueAt: undefined,
    proofReminders: undefined,
    updatedAt: now,
  });
  await recordKohopEvent(ctx, {
    contributionId: file._id,
    kind: event,
    actorId,
  });
  await recordAudit(ctx, {
    actorId,
    action:
      event === 'markReady' ? AUDIT.KOHOP_READY : AUDIT.KOHOP_PROOF_APPROVED,
    targetId: file._id,
  });
  // A last internal check, on the very text that will be published.
  await ctx.scheduler.runAfter(0, internal.kohopOriginality.runAll, {
    contributionId: file._id,
    version: file.acceptedVersion ?? file.currentVersion,
  });
}

// --- The proof (author) ------------------------------------------------------------

export const approveProof = mutation({
  args: { contributionId: v.id('kohopContributions') },
  returns: v.null(),
  handler: async (ctx, { contributionId }) => {
    const { user, contribution } = await requireOwnContribution(
      ctx,
      contributionId,
    );
    const to = advance(contribution.stage, 'approveProof');
    await toReady(ctx, contribution, to, user._id, 'approveProof');
    await notifyChiefs(
      ctx,
      contribution,
      'kohopProofApproved',
      'kohop_proof_approved',
    );
    return null;
  },
});

export const requestCorrections = mutation({
  args: { contributionId: v.id('kohopContributions'), note: v.string() },
  returns: v.null(),
  handler: async (ctx, { contributionId, note }) => {
    const { user, contribution } = await requireOwnContribution(
      ctx,
      contributionId,
    );
    const to = advance(contribution.stage, 'requestCorrections');
    const text = note.trim();
    if (
      text.length < KOHOP_BOUNDS.reason.min ||
      text.length > KOHOP_BOUNDS.reason.max
    ) {
      refuse('REASON_REQUIRED');
    }
    const now = Date.now();
    await ctx.db.patch(contribution._id, {
      stage: to,
      proofDueAt: undefined,
      proofReminders: undefined,
      updatedAt: now,
    });
    await recordKohopEvent(ctx, {
      contributionId: contribution._id,
      kind: 'requestCorrections',
      actorId: user._id,
      metadata: { note: text },
    });
    await recordAudit(ctx, {
      actorId: user._id,
      action: AUDIT.KOHOP_CORRECTIONS_REQUESTED,
      targetId: contribution._id,
    });
    await notifyChiefs(
      ctx,
      contribution,
      'kohopProofCorrections',
      'kohop_proof_corrections',
    );
    return null;
  },
});

// --- Publication (review chief) ----------------------------------------------------

async function publishNow(
  ctx: MutationCtx,
  file: Doc<'kohopContributions'>,
  to: Doc<'kohopContributions'>['stage'],
  event: 'publish' | 'publishScheduled',
  actorId?: Id<'users'>,
) {
  const version = await versionOf(
    ctx,
    file._id,
    file.acceptedVersion ?? file.currentVersion,
  );
  if (!version) refuse('NOT_FOUND');
  const now = Date.now();
  await ctx.db.patch(file._id, {
    stage: to,
    publishedAt: now,
    // The printed author line, kept if the account is deleted one day (D-14).
    authorSnapshot: await authorLine(ctx, file.authorUserId),
    scheduledFor: undefined,
    scheduledFunctionId: undefined,
    // Folded text of the published version, for the global search.
    searchText: buildSearchText([
      version.title,
      version.standfirst,
      file.keywords.join(' '),
      toPlainText(version.body),
    ]),
    updatedAt: now,
  });
  await recordKohopEvent(ctx, {
    contributionId: file._id,
    kind: event,
    actorId,
  });
  await recordAudit(ctx, {
    actorId,
    action: AUDIT.KOHOP_PUBLISHED,
    targetId: file._id,
    metadata: {
      version: version.version,
      scheduled: event === 'publishScheduled',
    },
  });
  await notify(ctx, {
    userId: file.authorUserId,
    type: 'kohop_published',
    titleKey: 'kohopPublished',
    params: { title: file.title },
    link: `/espace-membre/kohop/${file._id}`,
  });
  await ctx.scheduler.runAfter(0, internal.kohopEmail.sendProductionEmail, {
    contributionId: file._id,
    kind: 'published',
  });
  await ctx.scheduler.runAfter(0, internal.kohopEmail.sendProductionEmail, {
    contributionId: file._id,
    kind: 'publishedReviewer',
  });
}

/** Publishes now. The chief's act, behind the machine and the originality gate. */
export const publish = mutation({
  args: { contributionId: v.id('kohopContributions') },
  returns: v.null(),
  handler: async (ctx, { contributionId }) => {
    const chief = await requireReviewChief(ctx);
    const file = await loadFile(ctx, contributionId);
    const to = advance(file.stage, 'publish');
    if (!(await publishGate(ctx, file))) refuse('ORIGINALITY_REQUIRED');
    await publishNow(ctx, file, to, 'publish', chief._id);
    return null;
  },
});

/** Schedules the publication for a date; cancellable until it fires. */
export const schedule = mutation({
  args: { contributionId: v.id('kohopContributions'), at: v.number() },
  returns: v.null(),
  handler: async (ctx, { contributionId, at }) => {
    const chief = await requireReviewChief(ctx);
    const file = await loadFile(ctx, contributionId);
    const to = advance(file.stage, 'schedule');
    const now = Date.now();
    if (
      !Number.isFinite(at) ||
      at < now + KOHOP_SCHEDULE.minLeadMs ||
      at > now + KOHOP_SCHEDULE.maxLeadMs
    ) {
      refuse('INVALID_SCHEDULE');
    }
    if (!(await publishGate(ctx, file))) refuse('ORIGINALITY_REQUIRED');
    const functionId = await ctx.scheduler.runAt(
      at,
      internal.kohopProduction.publishScheduled,
      { contributionId: file._id },
    );
    await ctx.db.patch(file._id, {
      stage: to,
      scheduledFor: at,
      scheduledFunctionId: functionId,
      updatedAt: now,
    });
    await recordKohopEvent(ctx, {
      contributionId: file._id,
      kind: 'schedule',
      actorId: chief._id,
      metadata: { at },
    });
    await recordAudit(ctx, {
      actorId: chief._id,
      action: AUDIT.KOHOP_SCHEDULED,
      targetId: file._id,
      metadata: { at },
    });
    return null;
  },
});

async function cancelSchedule(
  ctx: MutationCtx,
  file: Doc<'kohopContributions'>,
  to: Doc<'kohopContributions'>['stage'],
  actorId?: Id<'users'>,
) {
  if (file.scheduledFunctionId) {
    try {
      await ctx.scheduler.cancel(file.scheduledFunctionId);
    } catch {
      /* already run or gone: the stage guard in the function protects us */
    }
  }
  await ctx.db.patch(file._id, {
    stage: to,
    scheduledFor: undefined,
    scheduledFunctionId: undefined,
    updatedAt: Date.now(),
  });
  await recordKohopEvent(ctx, {
    contributionId: file._id,
    kind: 'unschedule',
    actorId,
  });
  await recordAudit(ctx, {
    actorId,
    action: AUDIT.KOHOP_UNSCHEDULED,
    targetId: file._id,
  });
}

export const unschedule = mutation({
  args: { contributionId: v.id('kohopContributions') },
  returns: v.null(),
  handler: async (ctx, { contributionId }) => {
    const chief = await requireReviewChief(ctx);
    const file = await loadFile(ctx, contributionId);
    const to = advance(file.stage, 'unschedule');
    await cancelSchedule(ctx, file, to, chief._id);
    return null;
  },
});

/**
 * Fires at the scheduled date (the `system` event). Re-checks everything: a
 * file that is not `scheduled` any more, a date that was changed, or an
 * originality gate that no longer holds publishes NOTHING.
 */
export const publishScheduled = internalMutation({
  args: { contributionId: v.id('kohopContributions') },
  returns: v.null(),
  handler: async (ctx, { contributionId }) => {
    const file = await ctx.db.get(contributionId);
    if (!file || file.stage !== 'scheduled') return null;
    const now = Date.now();
    if (file.scheduledFor === undefined || file.scheduledFor > now + 60_000) {
      return null;
    }
    if (!(await publishGate(ctx, file))) {
      // Back to `ready`: a chief decides again.
      await cancelSchedule(ctx, file, advance(file.stage, 'unschedule'));
      await notifyChiefs(
        ctx,
        file,
        'kohopOriginalityFailed',
        'kohop_originality_failed',
      );
      return null;
    }
    await publishNow(
      ctx,
      file,
      advance(file.stage, 'publishScheduled'),
      'publishScheduled',
    );
    return null;
  },
});

/**
 * Retracts a published contribution: the page STAYS online with a retraction
 * notice (public) — the reason is kept for the author and the chiefs.
 */
export const retract = mutation({
  args: {
    contributionId: v.id('kohopContributions'),
    reason: v.string(),
    notice: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { contributionId, reason, notice }) => {
    const chief = await requireReviewChief(ctx);
    const file = await loadFile(ctx, contributionId);
    const to = advance(file.stage, 'retract');
    const why = reason.trim();
    const note = notice.trim();
    if (
      why.length < KOHOP_BOUNDS.reason.min ||
      why.length > KOHOP_BOUNDS.reason.max ||
      note.length < KOHOP_BOUNDS.reason.min ||
      note.length > 1000
    ) {
      refuse('REASON_REQUIRED');
    }
    const now = Date.now();
    await ctx.db.patch(file._id, {
      stage: to,
      retractedAt: now,
      retraction: { reason: why, notice: note, at: now },
      updatedAt: now,
    });
    await ctx.db.insert('kohopDecisions', {
      contributionId: file._id,
      version: file.acceptedVersion ?? file.currentVersion,
      kind: 'retraction',
      reason: why,
      positiveReviews: 0,
      againstPresumption: false,
      decidedBy: chief._id,
      createdAt: now,
    });
    await recordKohopEvent(ctx, {
      contributionId: file._id,
      kind: 'retract',
      actorId: chief._id,
    });
    await recordAudit(ctx, {
      actorId: chief._id,
      action: AUDIT.KOHOP_RETRACTED,
      targetId: file._id,
    });
    await notify(ctx, {
      userId: file.authorUserId,
      type: 'kohop_retracted',
      titleKey: 'kohopRetracted',
      params: { title: file.title },
      link: `/espace-membre/kohop/${file._id}`,
    });
    await ctx.scheduler.runAfter(0, internal.kohopEmail.sendProductionEmail, {
      contributionId: file._id,
      kind: 'retracted',
    });
    return null;
  },
});

/**
 * The proof's 5 days, called by the deadline cron: a reminder before the end;
 * then, with `KOHOP_PROOF_TACIT_APPROVAL` off (the default), the chiefs are told
 * the proof is overdue and the author may still answer; with it on, silence
 * is the author's approval.
 */
export async function handleProofDeadlines(
  ctx: MutationCtx,
  now: number,
): Promise<{ reminded: number; expired: number }> {
  const files = await ctx.db
    .query('kohopContributions')
    .withIndex('by_stage_and_proofDueAt', (q) =>
      q
        .eq('stage', 'proof')
        .gt('proofDueAt', 0)
        .lte('proofDueAt', now + KOHOP_REMINDERS.beforeDeadlineMs),
    )
    .take(KOHOP_REMINDERS.batch);
  let reminded = 0;
  let expired = 0;
  for (const file of files) {
    if (file.proofDueAt === undefined) continue;
    const action = deadlineAction({
      dueAt: file.proofDueAt,
      remindersSent: file.proofReminders ?? 0,
      now,
    });
    if (action === 'remind') {
      await ctx.db.patch(file._id, {
        proofReminders: (file.proofReminders ?? 0) + 1,
        updatedAt: now,
      });
      await notify(ctx, {
        userId: file.authorUserId,
        type: 'kohop_proof_to_approve',
        titleKey: 'kohopProofToApprove',
        params: {
          title: file.title,
          date: new Date(file.proofDueAt).toISOString().slice(0, 10),
        },
        link: `/espace-membre/kohop/${file._id}`,
      });
      await ctx.scheduler.runAfter(0, internal.kohopEmail.sendProductionEmail, {
        contributionId: file._id,
        kind: 'proofToApprove',
      });
      reminded += 1;
    } else if (action === 'expire') {
      if (KOHOP_PROOF_TACIT_APPROVAL) {
        await toReady(
          ctx,
          file,
          advance(file.stage, 'approveProof'),
          undefined,
          'approveProof',
        );
      } else {
        await ctx.db.patch(file._id, {
          proofDueAt: undefined,
          proofReminders: undefined,
          updatedAt: now,
        });
        await notifyChiefs(
          ctx,
          file,
          'kohopProofOverdue',
          'kohop_proof_overdue',
        );
      }
      expired += 1;
    }
  }
  return { reminded, expired };
}

/**
 * What the production screen needs to know: may it be published (originality),
 * did the copy-editing change the accepted text (a proof is then compulsory),
 * and which version was accepted. Review chief only.
 */
export const state = query({
  args: { contributionId: v.id('kohopContributions') },
  returns: v.union(
    v.null(),
    v.object({
      gateOk: v.boolean(),
      changedSinceAcceptance: v.boolean(),
      acceptedOriginalVersion: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx, { contributionId }) => {
    await requireReviewChief(ctx);
    const file = await ctx.db.get(contributionId);
    if (!file) return null;
    const original = await acceptedOriginal(ctx, file);
    return {
      gateOk: await publishGate(ctx, file),
      changedSinceAcceptance: await changedSinceAcceptance(ctx, file),
      acceptedOriginalVersion: original?.version ?? null,
    };
  },
});
