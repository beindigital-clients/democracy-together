import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Id } from './_generated/dataModel';
import { deleteUserDataReports, exportUserDataReports } from './annualReports';

// PERSONAL DATA of the "editorial" workstream — called by account
// deletion and export (wired by the orchestrator). No `ctx.auth`
// here: the caller has already established who deletes what.
//
// What these tables hold about a person:
//  - annual reports: attribution of the last write (removed);
//  - manuscripts (author): their versions — texts, files, response
//    letters. For an UNPUBLISHED manuscript, its whole review file goes
//    with it (versions, decisions, reviews and assignments: they only concern
//    its text). For a PUBLISHED manuscript, the publication stays (it
//    belongs to the library) and with it its reviews and decisions; only
//    its versions — hence its response letters — are deleted;
//  - reviews (reviewer): their assignments and reviews, deleted.
//
// Each read is bounded; an account exceeding these bounds (more than
// 200 versions or reviews) would be processed in several calls.

const BATCH = 200;

export async function deleteUserDataEditorial(
  ctx: MutationCtx,
  userId: Id<'users'>,
): Promise<void> {
  await deleteUserDataReports(ctx, userId);

  // --- Author --------------------------------------------------------------
  const versions = await ctx.db
    .query('manuscriptVersions')
    .withIndex('by_submitter', (q) => q.eq('submittedBy', userId))
    .take(BATCH);
  const publications = new Set<Id<'publications'>>();
  for (const ver of versions) {
    publications.add(ver.publicationId);
    const pub = await ctx.db.get(ver.publicationId);
    if (ver.blindFileId) await ctx.storage.delete(ver.blindFileId);
    // The file served by the publication no longer belongs to the review
    // file: it is not deleted here.
    if (ver.fileId && ver.fileId !== pub?.fileId) {
      await ctx.storage.delete(ver.fileId);
    }
    await ctx.db.delete(ver._id);
  }
  for (const publicationId of publications) {
    const pub = await ctx.db.get(publicationId);
    if (pub?.status === 'published') continue;
    for (const table of [
      'manuscriptDecisions',
      'peerReviews',
      'peerReviewAssignments',
    ] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex('by_publication', (q) =>
          q.eq('publicationId', publicationId),
        )
        .take(BATCH);
      for (const row of rows) await ctx.db.delete(row._id);
    }
  }

  // --- Reviewer ------------------------------------------------------------
  const assignments = await ctx.db
    .query('peerReviewAssignments')
    .withIndex('by_reviewer', (q) => q.eq('reviewerUserId', userId))
    .take(BATCH);
  for (const a of assignments) await ctx.db.delete(a._id);
  const reviews = await ctx.db
    .query('peerReviews')
    .withIndex('by_reviewer', (q) => q.eq('reviewerUserId', userId))
    .take(BATCH);
  for (const r of reviews) await ctx.db.delete(r._id);
}

export type EditorialExport = {
  reports: { year: number; role: 'created' | 'updated' }[];
  manuscriptVersions: {
    publicationId: Id<'publications'>;
    version: number;
    title: string;
    abstract: string;
    keywords: string[];
    fileName: string | null;
    responseLetter: string | null;
    createdAt: number;
  }[];
  reviews: {
    publicationId: Id<'publications'>;
    version: number;
    recommendation: string;
    comment: string;
    commentToEditor: string | null;
    createdAt: number;
  }[];
  assignments: {
    publicationId: Id<'publications'>;
    version: number;
    assignedAt: number;
    dueAt: number | null;
    conflict: { hasConflict: boolean; details: string | null } | null;
  }[];
};

export async function exportUserDataEditorial(
  ctx: QueryCtx,
  userId: Id<'users'>,
): Promise<EditorialExport> {
  const versions = await ctx.db
    .query('manuscriptVersions')
    .withIndex('by_submitter', (q) => q.eq('submittedBy', userId))
    .take(BATCH);
  const reviews = await ctx.db
    .query('peerReviews')
    .withIndex('by_reviewer', (q) => q.eq('reviewerUserId', userId))
    .take(BATCH);
  const assignments = await ctx.db
    .query('peerReviewAssignments')
    .withIndex('by_reviewer', (q) => q.eq('reviewerUserId', userId))
    .take(BATCH);
  return {
    reports: await exportUserDataReports(ctx, userId),
    manuscriptVersions: versions.map((ver) => ({
      publicationId: ver.publicationId,
      version: ver.version,
      title: ver.title,
      abstract: ver.abstract,
      keywords: ver.keywords,
      fileName: ver.fileName ?? null,
      responseLetter: ver.responseLetter ?? null,
      createdAt: ver.createdAt,
    })),
    reviews: reviews.map((r) => ({
      publicationId: r.publicationId,
      version: r.version ?? 1,
      recommendation: r.recommendation,
      comment: r.comment,
      commentToEditor: r.commentToEditor ?? null,
      createdAt: r.createdAt,
    })),
    assignments: assignments.map((a) => ({
      publicationId: a.publicationId,
      version: a.version ?? 1,
      assignedAt: a.assignedAt,
      dueAt: a.dueAt ?? null,
      conflict: a.conflict
        ? {
            hasConflict: a.conflict.hasConflict,
            details: a.conflict.details ?? null,
          }
        : null,
    })),
  };
}
