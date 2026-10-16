import type { QueryCtx, MutationCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import { KOHOP_LINK_WINDOWS } from './kohop';
import {
  foldName,
  isPublicMailbox,
  matchesOrganizationDomain,
  type LinkFacts,
} from './kohopLinks';

// KOHOP — collects the FACTS the link rules need (convex/lib/kohopLinks.ts).
// Every read is indexed and bounded: a network has a handful of accounts per
// organization, a few workspaces and a few dozen contributions per author.

const MONTH = 30 * 24 * 60 * 60 * 1000;
const YEAR = 365 * 24 * 60 * 60 * 1000;

export type Candidate = {
  userId?: Id<'users'>;
  email?: string;
  name: string;
};

type Ctx = QueryCtx | MutationCtx;

async function orgIds(ctx: Ctx, userId: Id<'users'>): Promise<Set<string>> {
  const rows = await ctx.db
    .query('organizationMemberships')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .take(20);
  return new Set(rows.map((r) => r.orgId));
}

async function workspaceIds(
  ctx: Ctx,
  userId: Id<'users'>,
): Promise<Set<string>> {
  const rows = await ctx.db
    .query('workspaceMembers')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .take(50);
  return new Set(rows.map((r) => r.workspaceId));
}

const hasCoAuthor = (
  coAuthors: readonly { email?: string }[],
  email: string | undefined,
): boolean =>
  email !== undefined &&
  coAuthors.some((c) => c.email?.trim().toLowerCase() === email);

export async function collectLinkFacts(
  ctx: Ctx,
  input: {
    contribution: Doc<'kohopContributions'>;
    candidate: Candidate;
    declaredRelationship?: string;
  },
): Promise<LinkFacts> {
  const { contribution, candidate } = input;
  const now = Date.now();
  const authorId = contribution.authorUserId;
  const author = await ctx.db.get(authorId);
  const candidateUser = candidate.userId
    ? await ctx.db.get(candidate.userId)
    : null;
  const authorEmail = author?.email?.toLowerCase();
  const candidateEmail =
    (candidate.email ?? candidateUser?.email ?? '').toLowerCase() || undefined;
  const candidateId = candidate.userId;

  const isAuthor =
    candidateId === authorId ||
    (candidateEmail !== undefined && candidateEmail === authorEmail);
  const isCoAuthor = hasCoAuthor(contribution.coAuthors, candidateEmail);

  let sameOrganization = false;
  let sameWorkspace = false;
  let mutualFollow = false;
  let mentoringPair = false;
  let crossReviewRecent = false;
  let previousDesignations = 0;
  let sharedLibraryAuthorName = false;

  if (candidateId && candidateId !== authorId) {
    const [authorOrgs, candidateOrgs] = await Promise.all([
      orgIds(ctx, authorId),
      orgIds(ctx, candidateId),
    ]);
    sameOrganization = [...authorOrgs].some((o) => candidateOrgs.has(o));

    const [authorSpaces, candidateSpaces] = await Promise.all([
      workspaceIds(ctx, authorId),
      workspaceIds(ctx, candidateId),
    ]);
    sameWorkspace = [...authorSpaces].some((w) => candidateSpaces.has(w));

    const [forward, backward] = await Promise.all([
      ctx.db
        .query('follows')
        .withIndex('by_follower_and_followee', (q) =>
          q.eq('followerId', authorId).eq('followeeId', candidateId),
        )
        .first(),
      ctx.db
        .query('follows')
        .withIndex('by_follower_and_followee', (q) =>
          q.eq('followerId', candidateId).eq('followeeId', authorId),
        )
        .first(),
    ]);
    mutualFollow = forward !== null && backward !== null;

    const [asMentor, asMentee] = await Promise.all([
      ctx.db
        .query('mentorPairs')
        .withIndex('by_mentor_user', (q) => q.eq('mentorUserId', authorId))
        .take(50),
      ctx.db
        .query('mentorPairs')
        .withIndex('by_mentee_user', (q) => q.eq('menteeUserId', authorId))
        .take(50),
    ]);
    mentoringPair =
      asMentor.some((p) => p.menteeUserId === candidateId) ||
      asMentee.some((p) => p.mentorUserId === candidateId);

    // The author reviewed this candidate on KOHOP in the last 12 months.
    const authorAsReviewer = await ctx.db
      .query('kohopReviewers')
      .withIndex('by_user', (q) => q.eq('userId', authorId))
      .take(50);
    for (const r of authorAsReviewer) {
      const reviews = await ctx.db
        .query('kohopReviews')
        .withIndex('by_reviewer', (q) => q.eq('reviewerId', r._id))
        .take(5);
      for (const review of reviews) {
        if (
          now - review.submittedAt <
          KOHOP_LINK_WINDOWS.crossReviewMonths * MONTH
        ) {
          const reviewed = await ctx.db.get(review.contributionId);
          if (reviewed?.authorUserId === candidateId) crossReviewRecent = true;
        }
      }
    }
  }

  // Co-signed a KOHOP contribution in the last 3 years (either direction).
  const horizon = now - KOHOP_LINK_WINDOWS.coSignYears * YEAR;
  const [byAuthor, byCandidate] = await Promise.all([
    ctx.db
      .query('kohopContributions')
      .withIndex('by_author', (q) => q.eq('authorUserId', authorId))
      .take(50),
    candidateId
      ? ctx.db
          .query('kohopContributions')
          .withIndex('by_author', (q) => q.eq('authorUserId', candidateId))
          .take(50)
      : Promise.resolve([] as Doc<'kohopContributions'>[]),
  ]);
  const recent = (c: Doc<'kohopContributions'>) =>
    c._id !== contribution._id &&
    c.submittedAt !== undefined &&
    c.submittedAt >= horizon;
  const coSignedRecently =
    byAuthor.some(
      (c) => recent(c) && hasCoAuthor(c.coAuthors, candidateEmail),
    ) ||
    byCandidate.some((c) => recent(c) && hasCoAuthor(c.coAuthors, authorEmail));

  // Designated at least twice by the same author in the last 12 months.
  const designations = candidateId
    ? await ctx.db
        .query('kohopReviewers')
        .withIndex('by_user', (q) => q.eq('userId', candidateId))
        .take(100)
    : candidateEmail
      ? await ctx.db
          .query('kohopReviewers')
          .withIndex('by_email', (q) => q.eq('email', candidateEmail))
          .take(100)
      : [];
  const since = now - KOHOP_LINK_WINDOWS.recurrenceMonths * MONTH;
  for (const d of designations) {
    if (d.contributionId === contribution._id || d.createdAt < since) continue;
    const c = await ctx.db.get(d.contributionId);
    if (c?.authorUserId === authorId) previousDesignations += 1;
  }

  // Same organization's website domain.
  let organizationDomainMatch = false;
  if (contribution.organizationId && candidateEmail) {
    const org = await ctx.db.get(contribution.organizationId);
    organizationDomainMatch = matchesOrganizationDomain(
      candidateEmail,
      org?.websiteUrl,
    );
  }

  // A library document that lists both names (free text: a signal only).
  const authorName = author?.name ? foldName(author.name) : '';
  const candidateName = foldName(candidate.name);
  if (authorName && candidateName) {
    const docs = await ctx.db
      .query('publications')
      .withIndex('by_author', (q) => q.eq('authorUserId', authorId))
      .take(50);
    sharedLibraryAuthorName = docs.some((p) =>
      p.authors.some((a) => foldName(a.name) === candidateName),
    );
  }

  return {
    isAuthor,
    isCoAuthor,
    sameOrganization,
    mentoringPair,
    crossReviewRecent,
    coSignedRecently,
    declaredRelationship: input.declaredRelationship,
    sameWorkspace,
    mutualFollow,
    organizationDomainMatch,
    previousDesignations,
    sharedLibraryAuthorName,
    publicMailbox: !candidateId && isPublicMailbox(candidateEmail),
  };
}
