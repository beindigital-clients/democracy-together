import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { displayedOrganization } from './lib/socialAccess';
import { KOHOP_PUBLIC_STAGES } from './lib/kohop';
import { replaceTitular } from './lib/kohopReviewing';
import { versionOf } from './lib/kohopAccess';
import { dropSource } from './kohopIndex';

// KOHOP — DELETION AND EXPORT OF AN ACCOUNT'S DATA (D-14; GDPR art. 15, 17, 20).
// Registered in `convex/lib/accountDeletion.ts` (`CHANTIER_USER_DATA_MODULES`).
//
// THE RULE:
//  - everything the account wrote that is NOT public is DELETED: drafts, files in
//    review, refused or withdrawn contributions, with their versions, reviewers,
//    analyses, decisions, history, link checks, suggestions and originality
//    reports;
//  - a PUBLISHED (or retracted) text and the signed analyses published with it
//    STAY ONLINE (D-14): the link to the account is cut, the printed author or
//    reviewer line stays — the same rule as the library's published documents
//    (art. 17(3)(d): scientific research). Co-authors' private e-mail addresses
//    are removed from what is kept;
//  - a reviewer's PERSONAL fields (account, e-mail, public page, reasons,
//    declarations) are erased everywhere; on a file still in review the analysis
//    stays for the process, de-attributed;
//  - external invitations held by the account's address (declined, expired,
//    never answered…) go too.
//
// Known limit: history lines carry the identifier of an account that no longer
// exists (no index by actor), like the audit log.

const BATCH = 50;
const PUBLIC: readonly Doc<'kohopContributions'>['stage'][] =
  KOHOP_PUBLIC_STAGES;
const ANON = '—';

type Meta = { email: string | null };

async function deleteSubordinates(
  ctx: MutationCtx,
  file: Doc<'kohopContributions'>,
) {
  const id = file._id;
  if (file.scheduledFunctionId) {
    try {
      await ctx.scheduler.cancel(file.scheduledFunctionId);
    } catch {
      /* already run */
    }
  }
  for (const v of await ctx.db
    .query('kohopVersions')
    .withIndex('by_contribution_and_version', (q) => q.eq('contributionId', id))
    .take(100)) {
    await ctx.db.delete(v._id);
  }
  for (const r of await ctx.db
    .query('kohopReviewers')
    .withIndex('by_contribution', (q) => q.eq('contributionId', id))
    .take(100)) {
    for (const c of await ctx.db
      .query('kohopLinkChecks')
      .withIndex('by_reviewer', (q) => q.eq('reviewerId', r._id))
      .take(100)) {
      await ctx.db.delete(c._id);
    }
    await ctx.db.delete(r._id);
  }
  for (const [table, index] of [
    ['kohopReviews', 'by_contribution'],
    ['kohopDecisions', 'by_contribution'],
    ['kohopEvents', 'by_contribution'],
    ['kohopSuggestions', 'by_contribution'],
  ] as const) {
    const rows = await ctx.db
      .query(table)
      .withIndex(index, (q) => q.eq('contributionId', id))
      .take(200);
    for (const row of rows) await ctx.db.delete(row._id);
  }
  for (const r of await ctx.db
    .query('originalityReports')
    .withIndex('by_contribution_and_version', (q) => q.eq('contributionId', id))
    .take(100)) {
    await ctx.db.delete(r._id);
  }
  // The text's place in the originality index goes with it.
  await dropSource(ctx, 'kohop', id);
}

/** The reviewer's personal fields, erased. The structure the file needs stays. */
async function scrubReviewer(ctx: MutationCtx, row: Doc<'kohopReviewers'>) {
  for (const c of await ctx.db
    .query('kohopLinkChecks')
    .withIndex('by_reviewer', (q) => q.eq('reviewerId', row._id))
    .take(100)) {
    await ctx.db.delete(c._id);
  }
  await ctx.db.patch(row._id, {
    userId: undefined,
    name: ANON,
    email: undefined,
    affiliation: undefined,
    publicUrl: undefined,
    rationale: undefined,
    declaredRelationship: undefined,
    suggestedInstead: undefined,
    conflict: undefined,
    recusal: undefined,
    inviteTokenHash: undefined,
    inviteTokenExpiresAt: undefined,
    flags: [],
    updatedAt: Date.now(),
  });
}

/**
 * The author's printed line at this moment (name, organization): kept with a
 * published text so that it survives the deletion of the account (D-14).
 */
export async function authorLine(
  ctx: QueryCtx,
  userId: Id<'users'>,
): Promise<NonNullable<Doc<'kohopContributions'>['authorSnapshot']>> {
  const user = await ctx.db.get(userId);
  const profile = await ctx.db
    .query('memberProfiles')
    .withIndex('by_userId', (q) => q.eq('userId', userId))
    .unique();
  const org = await displayedOrganization(ctx, userId);
  return {
    name: profile?.displayName || user?.name?.trim() || ANON,
    ...(org ? { organizationName: org.name, organizationSlug: org.slug } : {}),
  };
}

export async function deleteUserDataKohop(
  ctx: MutationCtx,
  userId: Id<'users'>,
  meta: Meta,
): Promise<boolean> {
  let more = false;

  // --- As an author -----------------------------------------------------------
  const files = await ctx.db
    .query('kohopContributions')
    .withIndex('by_author', (q) => q.eq('authorUserId', userId))
    .take(200);
  let deleted = 0;
  for (const file of files) {
    if (PUBLIC.includes(file.stage)) {
      // The snapshot taken at publication wins: by now the organization
      // membership may already have been erased by an earlier module.
      const snapshot = file.authorSnapshot ?? (await authorLine(ctx, userId));
      if (
        file.authorSnapshot &&
        file.originalityDeclaration === undefined &&
        file.priorWorks.length === 0 &&
        file.coAuthors.every((c) => c.email === undefined)
      ) {
        continue; // already de-attributed
      }
      await ctx.db.patch(file._id, {
        authorSnapshot: snapshot,
        // Co-authors stay as printed; their private addresses do not.
        coAuthors: file.coAuthors.map((c) => ({
          name: c.name,
          affiliation: c.affiliation,
        })),
        // What the author declared about themselves, not published.
        originalityDeclaration: undefined,
        priorWorks: [],
        updatedAt: Date.now(),
      });
      continue;
    }
    if (deleted >= BATCH) {
      more = true;
      break;
    }
    await deleteSubordinates(ctx, file);
    await ctx.db.delete(file._id);
    deleted += 1;
  }

  // --- The originality index ------------------------------------------------------
  // Whatever the index holds of this account's texts is derived data: dropped
  // now (a text that stays public is read again by the next indexing pass,
  // without the link to the account).
  const indexed = await ctx.db
    .query('textSources')
    .withIndex('by_author', (q) => q.eq('authorUserId', userId))
    .take(BATCH);
  for (const source of indexed) {
    await dropSource(ctx, source.sourceKind, source.sourceId);
  }
  if (indexed.length === BATCH) more = true;

  // --- As a reviewer ------------------------------------------------------------
  const rows = await ctx.db
    .query('kohopReviewers')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .take(BATCH);
  for (const row of rows) {
    const file = await ctx.db.get(row.contributionId);
    if (!file) {
      await ctx.db.delete(row._id);
      continue;
    }
    const published = PUBLIC.includes(file.stage);
    // Still awaited and the review is open: the chiefs and the author are told
    // (or the substitute steps in), exactly as for a refusal.
    if (
      !published &&
      file.stage === 'in_review' &&
      (row.status === 'invited' || row.status === 'accepted')
    ) {
      await ctx.db.patch(row._id, { status: 'expired', dueAt: undefined });
      if (row.slot === 'titular') await replaceTitular(ctx, file, row);
    }
    // A submitted analysis: printed signature kept on a published text (D-14),
    // de-attributed on a file still in progress; its confidential note goes.
    const review = await ctx.db
      .query('kohopReviews')
      .withIndex('by_reviewer', (q) => q.eq('reviewerId', row._id))
      .unique();
    if (review) {
      if (published) {
        await ctx.db.patch(review._id, { noteToEditor: undefined });
      } else {
        await ctx.db.patch(review._id, {
          displayName: ANON,
          affiliation: undefined,
          noteToEditor: undefined,
        });
      }
    }
    await scrubReviewer(ctx, row);
  }
  if (rows.length === BATCH) more = true;

  // --- Invitations held by the account's ADDRESS (no account needed) ------------
  if (meta.email) {
    const email = meta.email;
    const byAddress = await ctx.db
      .query('kohopReviewers')
      .withIndex('by_email', (q) => q.eq('email', email))
      .take(BATCH);
    for (const row of byAddress) {
      if (row.source !== 'external') continue;
      const file = await ctx.db.get(row.contributionId);
      if (row.status === 'submitted') {
        await scrubReviewer(ctx, row);
      } else {
        if (file?.stage === 'in_review' && row.status === 'invited') {
          if (row.slot === 'titular') await replaceTitular(ctx, file, row);
        }
        for (const c of await ctx.db
          .query('kohopLinkChecks')
          .withIndex('by_reviewer', (q) => q.eq('reviewerId', row._id))
          .take(100)) {
          await ctx.db.delete(c._id);
        }
        await ctx.db.delete(row._id);
      }
    }
    if (byAddress.length === BATCH) more = true;
  }

  return !more;
}

/** The account's KOHOP data, for the "mes données" export. */
export async function exportUserDataKohop(
  ctx: QueryCtx,
  userId: Id<'users'>,
  meta: Meta,
) {
  const files = await ctx.db
    .query('kohopContributions')
    .withIndex('by_author', (q) => q.eq('authorUserId', userId))
    .take(BATCH);
  const contributions = [];
  for (const f of files) {
    const versions = await ctx.db
      .query('kohopVersions')
      .withIndex('by_contribution_and_version', (q) =>
        q.eq('contributionId', f._id),
      )
      .take(20);
    const reviewers = await ctx.db
      .query('kohopReviewers')
      .withIndex('by_contribution', (q) => q.eq('contributionId', f._id))
      .take(30);
    const decisions = await ctx.db
      .query('kohopDecisions')
      .withIndex('by_contribution', (q) => q.eq('contributionId', f._id))
      .take(20);
    contributions.push({
      stage: f.stage,
      lang: f.lang,
      title: f.title,
      fields: f.fields,
      keywords: f.keywords,
      coAuthors: f.coAuthors.map((c) => ({
        name: c.name,
        affiliation: c.affiliation,
      })),
      priorWorks: f.priorWorks,
      originalityDeclaration: f.originalityDeclaration ?? null,
      charterAcceptedAt: f.charterAcceptedAt ?? null,
      submittedAt: f.submittedAt ?? null,
      publishedAt: f.publishedAt ?? null,
      slug: f.slug ?? null,
      createdAt: f.createdAt,
      versions: versions.map((v) => ({
        version: v.version,
        kind: v.kind,
        title: v.title,
        standfirst: v.standfirst,
        body: v.body,
        responseToReviewers: v.responseToReviewers ?? null,
        createdAt: v.createdAt,
      })),
      // Who was designated: names and status only — never someone's address.
      reviewers: reviewers.map((r) => ({
        name: r.name,
        slot: r.slot,
        status: r.status,
      })),
      // What was decided, with the reason the author received.
      decisions: decisions.map((d) => ({
        kind: d.kind,
        reason: d.reason,
        createdAt: d.createdAt,
      })),
    });
  }

  const reviewerRows = await ctx.db
    .query('kohopReviewers')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .take(BATCH);
  const asReviewer = [];
  for (const r of reviewerRows) {
    const file = await ctx.db.get(r.contributionId);
    const review = await ctx.db
      .query('kohopReviews')
      .withIndex('by_reviewer', (q) => q.eq('reviewerId', r._id))
      .unique();
    const version = file
      ? await versionOf(
          ctx,
          file._id,
          file.reviewedVersion ?? file.currentVersion,
        )
      : null;
    asReviewer.push({
      contributionTitle: version?.title ?? file?.title ?? null,
      slot: r.slot,
      status: r.status,
      source: r.source,
      invitedAt: r.invitedAt ?? null,
      respondedAt: r.respondedAt ?? null,
      conflictDeclared: r.conflict?.hasConflict ?? null,
      publicationConsentAt: r.publicationConsentAt ?? null,
      review: review
        ? {
            recommendation: review.recommendation,
            analysis: review.analysis,
            noteToEditor: review.noteToEditor ?? null,
            submittedAt: review.submittedAt,
          }
        : null,
    });
  }

  // Invitations held by the address itself (an outsider who never had an account).
  let byAddress: { status: string; slot: string; invitedAt: number | null }[] =
    [];
  if (meta.email) {
    const email = meta.email;
    byAddress = (
      await ctx.db
        .query('kohopReviewers')
        .withIndex('by_email', (q) => q.eq('email', email))
        .take(BATCH)
    )
      .filter((r) => r.source === 'external' && r.userId === undefined)
      .map((r) => ({
        status: r.status,
        slot: r.slot,
        invitedAt: r.invitedAt ?? null,
      }));
  }

  return { contributions, asReviewer, invitationsByAddress: byAddress };
}
