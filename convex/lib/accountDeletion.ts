import type { MutationCtx, QueryCtx } from '../_generated/server';
import type { Doc, Id } from '../_generated/dataModel';
import { deleteUserDataSocial, exportUserDataSocial } from '../social/account';
import {
  deleteUserDataProgrammes,
  exportUserDataProgrammes,
} from '../programmes';
import { deleteUserDataEditorial, exportUserDataEditorial } from '../editorial';
import {
  deleteUserDataCommunaute,
  exportUserDataCommunaute,
} from '../communaute';
import { deleteUserDataContenus } from './contenus/userData';
import { deleteUserDataPaiements } from './payments/ledger';
import { deleteUserDataDiffusion } from '../newsletter';
import {
  COUNTER,
  bumpCounter,
  trackMembershipApplicationStatus,
  trackPublicationStatus,
  trackTribuneCommentStatus,
  trackTribunePostStatus,
  trackYouthApplicationStatus,
} from './counters';

// DELETION AND EXPORT OF AN ACCOUNT'S DATA — SINGLE ENTRY POINT
// (accounts workstream; GDPR art. 15, 17 and 20).
//
// Every table that holds an account's data is declared HERE, by a
// module of the ordered registry `USER_DATA_MODULES`. Deletion (by an
// administrator or self-service) and export ("mes données") read the
// same registry: a table added tomorrow without its entry would be neither
// erased nor exported, and that is precisely what this file makes visible.
//
// THE RULE, AND WHY (detailed in docs/backlog/comptes.md):
//
//  1. DELETED — everything that exists only for the account: sessions, sign-in
//     methods, 2FA, notifications, affiliations, applications, UNPUBLISHED
//     submissions, sign-ups by address (newsletter, reminders, youth,
//     mentorship), project proposals, workspace notes.
//     Basis: art. 17(1)(a)/(b), the purpose disappears with the account.
//
//  2. ALSO DELETED — published PERSONAL EXPRESSION: Tribune posts and
//     comments, reactions, reports. A signed political opinion
//     is sensitive data (art. 9) in a network that
//     works on authoritarian regimes (security framing §: risk of
//     "doxing" contributors). No exception in art. 17(3)
//     justifies keeping it against its author's will. Comments by
//     OTHER members under a deleted post go with it:
//     a reply without the text it comments on no longer makes sense and
//     could be misread.
//
//  3. KEPT BUT DE-ATTRIBUTED — the library's PUBLISHED publications
//     and the reviews submitted. These are citable research
//     documents (DOI, incoming citations): removing them would break
//     other people's references. Art. 17(3)(d) (scientific research
//     and archiving purposes): the link to the ACCOUNT is cut (`authorUserId`
//     removed, reviewer name erased), the printed author line — a
//     bibliographic mention just as in a distributed PDF — stays.
//
//  4. KEPT — the audit log (legitimate interest: security, evidence of
//     moderation decisions). It only keeps the identifier of an account that
//     no longer exists, and no row links that identifier to a
//     person anymore.
//
// Known limits (tables without an index on the address or the account): contact
// messages, event registrations — docs/backlog/comptes.md.

export type UserDataMeta = { email: string | null };

/**
 * Deletes (or anonymizes) ONE BATCH of an account's data.
 *
 * Returns `false` if some remains — the orchestrator will call the module
 * again in a new transaction —, `true` or nothing when the module is empty for
 * this account. Internal, no `ctx.auth`: the orchestrator made the decision.
 */
export type DeleteUserData = (
  ctx: MutationCtx,
  userId: Id<'users'>,
  meta: UserDataMeta,
) => Promise<boolean | void>;

/** The account's data in this module, for the "mes données" export. */
export type ExportUserData = (
  ctx: QueryCtx,
  userId: Id<'users'>,
  meta: UserDataMeta,
) => Promise<unknown>;

export type UserDataModule = {
  key: string;
  delete: DeleteUserData;
  export?: ExportUserData;
};

// Batch size: a module touches no more than BATCH "main" documents
// per call (their direct dependencies follow, bounded).
const BATCH = 50;
// Export cap per module: beyond it, the file says it is truncated.
export const EXPORT_MAX = 500;

async function deleteStorage(ctx: MutationCtx, id: Id<'_storage'>) {
  try {
    await ctx.storage.delete(id);
  } catch {
    // Fichier déjà absent : la suppression du document continue.
  }
}

// --- Sessions and sign-in ----------------------------------------------------

/** Deletes all of an account's sessions and their refresh tokens. */
export async function invalidateAllSessions(
  ctx: MutationCtx,
  userId: Id<'users'>,
): Promise<number> {
  const sessions = await ctx.db
    .query('authSessions')
    .withIndex('userId', (q) => q.eq('userId', userId))
    .take(200);
  for (const session of sessions) {
    const tokens = await ctx.db
      .query('authRefreshTokens')
      .withIndex('sessionId', (q) => q.eq('sessionId', session._id))
      .take(500);
    for (const token of tokens) await ctx.db.delete(token._id);
    await ctx.db.delete(session._id);
  }
  const proofs = await ctx.db
    .query('twoFactorSessionProofs')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .take(500);
  for (const proof of proofs) await ctx.db.delete(proof._id);
  return sessions.length;
}

const sessionsModule: UserDataModule = {
  key: 'sessions',
  delete: async (ctx, userId) => {
    await invalidateAllSessions(ctx, userId);
    const left = await ctx.db
      .query('authSessions')
      .withIndex('userId', (q) => q.eq('userId', userId))
      .first();
    return left === null;
  },
  export: async (ctx, userId) => {
    const sessions = await ctx.db
      .query('authSessions')
      .withIndex('userId', (q) => q.eq('userId', userId))
      .take(EXPORT_MAX);
    return sessions.map((s) => ({
      openedAt: s._creationTime,
      expiresAt: s.expirationTime,
    }));
  },
};

const twoFactorModule: UserDataModule = {
  key: 'twoFactor',
  delete: async (ctx, userId) => {
    const cred = await ctx.db
      .query('twoFactorCredentials')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    if (cred) await ctx.db.delete(cred._id);
    const codes = await ctx.db
      .query('accountConfirmationCodes')
      .withIndex('by_user_and_purpose', (q) => q.eq('userId', userId))
      .take(BATCH);
    for (const c of codes) await ctx.db.delete(c._id);
    return codes.length < BATCH;
  },
  // The SECRET is never exported: a "mes données" file that
  // contained the second factor would make it useless.
  export: async (ctx, userId) => {
    const cred = await ctx.db
      .query('twoFactorCredentials')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .unique();
    return cred
      ? {
          status: cred.status,
          activatedAt: cred.activatedAt ?? null,
          backupCodesRemaining: cred.backupCodes.filter((b) => !b.usedAt)
            .length,
        }
      : null;
  },
};

// --- Notifications -----------------------------------------------------------

const notificationsModule: UserDataModule = {
  key: 'notifications',
  delete: async (ctx, userId) => {
    const rows = await ctx.db
      .query('notifications')
      .withIndex('by_user_and_read', (q) => q.eq('userId', userId))
      .take(BATCH);
    for (const n of rows) await ctx.db.delete(n._id);
    return rows.length < BATCH;
  },
  export: async (ctx, userId) => {
    const rows = await ctx.db
      .query('notifications')
      .withIndex('by_user_and_read', (q) => q.eq('userId', userId))
      .take(EXPORT_MAX);
    return rows.map((n) => ({
      type: n.type,
      titleKey: n.titleKey,
      params: n.params ?? null,
      link: n.link ?? null,
      read: n.read,
      createdAt: n.createdAt,
    }));
  },
};

// --- Organizations -----------------------------------------------------------

const organizationsModule: UserDataModule = {
  key: 'organizations',
  delete: async (ctx, userId) => {
    const memberships = await ctx.db
      .query('organizationMemberships')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .take(BATCH);
    for (const m of memberships) await ctx.db.delete(m._id);
    // PENDING profile revisions: proposed by this account, no one will
    // be able to answer the moderator's questions anymore. Revisions already
    // decided only contain the organization's data.
    const revisions = await ctx.db
      .query('organizationRevisions')
      .withIndex('by_submitter', (q) => q.eq('submittedBy', userId))
      .take(BATCH);
    for (const r of revisions) {
      if (r.status !== 'pending') continue;
      if (r.logoFileId) await deleteStorage(ctx, r.logoFileId);
      await ctx.db.delete(r._id);
    }
    const uploads = await ctx.db
      .query('organizationLogoUploads')
      .withIndex('by_uploader', (q) => q.eq('uploadedBy', userId))
      .take(BATCH);
    for (const u of uploads) await ctx.db.delete(u._id);
    return (
      memberships.length < BATCH &&
      revisions.length < BATCH &&
      uploads.length < BATCH
    );
  },
  export: async (ctx, userId) => {
    const memberships = await ctx.db
      .query('organizationMemberships')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .take(EXPORT_MAX);
    return await Promise.all(
      memberships.map(async (m) => {
        const org = await ctx.db.get(m.orgId);
        return {
          organization: org?.name ?? null,
          slug: org?.slug ?? null,
          orgRole: m.orgRole,
          since: m.createdAt,
        };
      }),
    );
  },
};

// --- Library -----------------------------------------------------------------

async function deletePublicationCompletely(
  ctx: MutationCtx,
  pub: Doc<'publications'>,
) {
  if (pub.fileId) await deleteStorage(ctx, pub.fileId);
  const views = await ctx.db
    .query('publicationViews')
    .withIndex('by_publication', (q) => q.eq('publicationId', pub._id))
    .unique();
  if (views) await ctx.db.delete(views._id);
  const translations = await ctx.db
    .query('contentTranslations')
    .withIndex('by_source', (q) =>
      q.eq('sourceType', 'publication').eq('sourceId', pub._id),
    )
    .take(16);
  for (const tr of translations) await ctx.db.delete(tr._id);
  const extraction = await ctx.db
    .query('documentExtractions')
    .withIndex('by_publication', (q) => q.eq('publicationId', pub._id))
    .unique();
  if (extraction) {
    for (const img of extraction.images ?? []) {
      await deleteStorage(ctx, img.storageId);
    }
    const renditions = await ctx.db
      .query('documentRenditions')
      .withIndex('by_extraction', (q) => q.eq('extractionId', extraction._id))
      .take(16);
    for (const r of renditions) await ctx.db.delete(r._id);
    await ctx.db.delete(extraction._id);
  }
  const aiReviews = await ctx.db
    .query('aiModerationReviews')
    .withIndex('by_publication', (q) => q.eq('publicationId', pub._id))
    .take(50);
  for (const r of aiReviews) await ctx.db.delete(r._id);
  const reviews = await ctx.db
    .query('peerReviews')
    .withIndex('by_publication', (q) => q.eq('publicationId', pub._id))
    .take(50);
  for (const r of reviews) await ctx.db.delete(r._id);
  const assignments = await ctx.db
    .query('peerReviewAssignments')
    .withIndex('by_publication', (q) => q.eq('publicationId', pub._id))
    .take(50);
  for (const a of assignments) await ctx.db.delete(a._id);
  await trackPublicationStatus(ctx, pub.status, null);
  await ctx.db.delete(pub._id);
}

const publicationsModule: UserDataModule = {
  key: 'publications',
  delete: async (ctx, userId) => {
    const pubs = await ctx.db
      .query('publications')
      .withIndex('by_author', (q) => q.eq('authorUserId', userId))
      .take(BATCH);
    for (const pub of pubs) {
      if (pub.status === 'published') {
        // Rule 3: kept, de-attributed. The patch removes `authorUserId`
        // — the row therefore leaves the `by_author` index and does not come
        // back in the next batch.
        await ctx.db.patch(pub._id, { authorUserId: undefined });
      } else {
        await deletePublicationCompletely(ctx, pub);
      }
    }
    return pubs.length < BATCH;
  },
  export: async (ctx, userId) => {
    const pubs = await ctx.db
      .query('publications')
      .withIndex('by_author', (q) => q.eq('authorUserId', userId))
      .take(EXPORT_MAX);
    return pubs.map((p) => ({
      title: p.title,
      slug: p.slug,
      type: p.type,
      theme: p.theme,
      status: p.status,
      year: p.year,
      authors: p.authors,
      abstract: p.abstract,
      keypoints: p.keypoints,
      fileName: p.fileName ?? null,
      submittedAt: p.submittedAt ?? null,
      reviewNotes: p.reviewNotes ?? null,
    }));
  },
};

const peerReviewModule: UserDataModule = {
  key: 'peerReview',
  delete: async (ctx, userId) => {
    // Submitted reviews: rule 3 — kept (they grounded an editorial decision),
    // the reviewer's name erased. The patch does not take the row out of the
    // `by_reviewer` index: so we only reprocess those that still carry a name.
    const reviews = await ctx.db
      .query('peerReviews')
      .withIndex('by_reviewer', (q) => q.eq('reviewerUserId', userId))
      .filter((q) => q.neq(q.field('reviewerName'), ''))
      .take(BATCH);
    for (const r of reviews) await ctx.db.patch(r._id, { reviewerName: '' });
    const assignments = await ctx.db
      .query('peerReviewAssignments')
      .withIndex('by_reviewer', (q) => q.eq('reviewerUserId', userId))
      .take(BATCH);
    for (const a of assignments) await ctx.db.delete(a._id);
    return reviews.length < BATCH && assignments.length < BATCH;
  },
  export: async (ctx, userId) => {
    const reviews = await ctx.db
      .query('peerReviews')
      .withIndex('by_reviewer', (q) => q.eq('reviewerUserId', userId))
      .take(EXPORT_MAX);
    return reviews.map((r) => ({
      publicationId: r.publicationId,
      recommendation: r.recommendation,
      comment: r.comment,
      createdAt: r.createdAt,
    }));
  },
};

// --- Tribune ----------------------------------------------------------------

async function deleteTribunePost(ctx: MutationCtx, post: Doc<'tribunePosts'>) {
  const comments = await ctx.db
    .query('tribuneComments')
    .withIndex('by_post', (q) => q.eq('postId', post._id))
    .take(500);
  for (const c of comments) {
    await trackTribuneCommentStatus(ctx, c.status, null);
    await ctx.db.delete(c._id);
  }
  const reactions = await ctx.db
    .query('tribuneReactions')
    .withIndex('by_post_and_user', (q) => q.eq('postId', post._id))
    .take(1000);
  for (const r of reactions) await ctx.db.delete(r._id);
  const translations = await ctx.db
    .query('contentTranslations')
    .withIndex('by_source', (q) =>
      q.eq('sourceType', 'tribunePost').eq('sourceId', post._id),
    )
    .take(16);
  for (const tr of translations) await ctx.db.delete(tr._id);
  await trackTribunePostStatus(ctx, post.status, null);
  await ctx.db.delete(post._id);
}

const tribuneModule: UserDataModule = {
  key: 'tribune',
  delete: async (ctx, userId) => {
    const posts = await ctx.db
      .query('tribunePosts')
      .withIndex('by_author', (q) => q.eq('authorUserId', userId))
      .take(10);
    for (const post of posts) await deleteTribunePost(ctx, post);

    const comments = await ctx.db
      .query('tribuneComments')
      .withIndex('by_author', (q) => q.eq('authorUserId', userId))
      .take(BATCH);
    for (const c of comments) {
      const post = await ctx.db.get(c.postId);
      if (post && post.commentCount > 0 && c.status === 'published') {
        await ctx.db.patch(post._id, { commentCount: post.commentCount - 1 });
      }
      await trackTribuneCommentStatus(ctx, c.status, null);
      await ctx.db.delete(c._id);
    }
    const reactions = await ctx.db
      .query('tribuneReactions')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .take(BATCH);
    for (const r of reactions) await ctx.db.delete(r._id);
    const reports = await ctx.db
      .query('tribuneReports')
      .withIndex('by_reporter', (q) => q.eq('reporterUserId', userId))
      .take(BATCH);
    for (const r of reports) await ctx.db.delete(r._id);
    return (
      posts.length < 10 &&
      comments.length < BATCH &&
      reactions.length < BATCH &&
      reports.length < BATCH
    );
  },
  export: async (ctx, userId) => {
    const posts = await ctx.db
      .query('tribunePosts')
      .withIndex('by_author', (q) => q.eq('authorUserId', userId))
      .take(EXPORT_MAX);
    const comments = await ctx.db
      .query('tribuneComments')
      .withIndex('by_author', (q) => q.eq('authorUserId', userId))
      .take(EXPORT_MAX);
    return {
      posts: posts.map((p) => ({
        title: p.title,
        body: p.body,
        theme: p.theme,
        format: p.format,
        status: p.status,
        createdAt: p.createdAt,
      })),
      comments: comments.map((c) => ({
        postId: c.postId,
        body: c.body,
        status: c.status,
        createdAt: c.createdAt,
      })),
    };
  },
};

// --- Workspaces --------------------------------------------------------------

const workspacesModule: UserDataModule = {
  key: 'workspaces',
  delete: async (ctx, userId) => {
    const notes = await ctx.db
      .query('workspaceNotes')
      .withIndex('by_author', (q) => q.eq('authorUserId', userId))
      .take(BATCH);
    for (const n of notes) await ctx.db.delete(n._id);

    // Workspaces the account OWNS: handed over to the longest-standing of the other
    // members, so as not to deprive them of their own notes; deleted
    // if the account was alone.
    const owned = await ctx.db
      .query('workspaces')
      .withIndex('by_owner', (q) => q.eq('ownerUserId', userId))
      .take(10);
    for (const ws of owned) {
      const heir = await ctx.db
        .query('workspaceMembers')
        .withIndex('by_workspace', (q) => q.eq('workspaceId', ws._id))
        .filter((q) => q.neq(q.field('userId'), userId))
        .first();
      if (heir) {
        await ctx.db.patch(ws._id, {
          ownerUserId: heir.userId,
          ownerName: heir.userName,
        });
        await ctx.db.patch(heir._id, { role: 'owner' });
      } else {
        const left = await ctx.db
          .query('workspaceNotes')
          .withIndex('by_workspace', (q) => q.eq('workspaceId', ws._id))
          .take(200);
        for (const n of left) await ctx.db.delete(n._id);
        await ctx.db.delete(ws._id);
      }
    }

    const memberships = await ctx.db
      .query('workspaceMembers')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .take(BATCH);
    for (const m of memberships) {
      const ws = await ctx.db.get(m.workspaceId);
      if (ws && ws.memberCount > 0) {
        await ctx.db.patch(ws._id, { memberCount: ws.memberCount - 1 });
      }
      await ctx.db.delete(m._id);
    }
    return (
      notes.length < BATCH && owned.length < 10 && memberships.length < BATCH
    );
  },
  export: async (ctx, userId) => {
    const memberships = await ctx.db
      .query('workspaceMembers')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .take(EXPORT_MAX);
    const notes = await ctx.db
      .query('workspaceNotes')
      .withIndex('by_author', (q) => q.eq('authorUserId', userId))
      .take(EXPORT_MAX);
    return {
      memberships: memberships.map((m) => ({
        workspaceId: m.workspaceId,
        role: m.role,
        joinedAt: m.joinedAt,
      })),
      notes: notes.map((n) => ({
        workspaceId: n.workspaceId,
        body: n.body,
        createdAt: n.createdAt,
      })),
    };
  },
};

// --- Projects, applications --------------------------------------------------

const projectsModule: UserDataModule = {
  key: 'projects',
  delete: async (ctx, userId) => {
    const rows = await ctx.db
      .query('projectProposals')
      .withIndex('by_author', (q) => q.eq('authorUserId', userId))
      .take(BATCH);
    for (const p of rows) await ctx.db.delete(p._id);
    return rows.length < BATCH;
  },
  export: async (ctx, userId) => {
    const rows = await ctx.db
      .query('projectProposals')
      .withIndex('by_author', (q) => q.eq('authorUserId', userId))
      .take(EXPORT_MAX);
    return rows.map((p) => ({
      title: p.title,
      summary: p.summary,
      theme: p.theme,
      status: p.status,
      createdAt: p.createdAt,
    }));
  },
};

const membershipModule: UserDataModule = {
  key: 'membershipApplications',
  delete: async (ctx, userId) => {
    const rows = await ctx.db
      .query('membershipApplications')
      .withIndex('by_applicant', (q) => q.eq('applicantUserId', userId))
      .take(BATCH);
    for (const a of rows) {
      await trackMembershipApplicationStatus(ctx, a.status, null);
      await ctx.db.delete(a._id);
    }
    return rows.length < BATCH;
  },
  export: async (ctx, userId) => {
    const rows = await ctx.db
      .query('membershipApplications')
      .withIndex('by_applicant', (q) => q.eq('applicantUserId', userId))
      .take(EXPORT_MAX);
    return rows.map((a) => ({
      type: a.type,
      organizationName: a.organizationName,
      contactEmail: a.contactEmail,
      country: a.country,
      message: a.message ?? null,
      status: a.status,
      submittedAt: a.submittedAt,
    }));
  },
};

// --- Sign-ups linked by ADDRESS ----------------------------------------------

const byEmailModule: UserDataModule = {
  key: 'byEmail',
  delete: async (ctx, _userId, { email }) => {
    if (!email) return true;
    let full = false;
    const news = await ctx.db
      .query('newsletterSubscriptions')
      .withIndex('by_email', (q) => q.eq('email', email))
      .take(BATCH);
    for (const n of news) await ctx.db.delete(n._id);
    full ||= news.length === BATCH;
    for (const sent of [false, true]) {
      const reminders = await ctx.db
        .query('eventReminders')
        .withIndex('by_email_and_sent', (q) =>
          q.eq('email', email).eq('sent', sent),
        )
        .take(BATCH);
      for (const r of reminders) await ctx.db.delete(r._id);
      full ||= reminders.length === BATCH;
    }
    const youth = await ctx.db
      .query('youthApplications')
      .withIndex('by_email', (q) => q.eq('email', email))
      .take(BATCH);
    for (const y of youth) {
      await trackYouthApplicationStatus(ctx, y.status, null);
      await ctx.db.delete(y._id);
    }
    full ||= youth.length === BATCH;
    const mentorship = await ctx.db
      .query('mentorshipRequests')
      .withIndex('by_email', (q) => q.eq('email', email))
      .take(BATCH);
    for (const m of mentorship) await ctx.db.delete(m._id);
    full ||= mentorship.length === BATCH;
    const devCodes = await ctx.db
      .query('devOtpCodes')
      .withIndex('by_email', (q) => q.eq('email', email))
      .take(BATCH);
    for (const d of devCodes) await ctx.db.delete(d._id);
    full ||= devCodes.length === BATCH;
    return !full;
  },
  export: async (ctx, _userId, { email }) => {
    if (!email) return null;
    const news = await ctx.db
      .query('newsletterSubscriptions')
      .withIndex('by_email', (q) => q.eq('email', email))
      .first();
    const reminders = await ctx.db
      .query('eventReminders')
      .withIndex('by_email_and_sent', (q) => q.eq('email', email))
      .take(EXPORT_MAX);
    const youth = await ctx.db
      .query('youthApplications')
      .withIndex('by_email', (q) => q.eq('email', email))
      .take(EXPORT_MAX);
    const mentorship = await ctx.db
      .query('mentorshipRequests')
      .withIndex('by_email', (q) => q.eq('email', email))
      .take(EXPORT_MAX);
    return {
      newsletter: news
        ? { subscribedAt: news.createdAt, locale: news.locale ?? null }
        : null,
      eventReminders: reminders.map((r) => ({
        eventSlug: r.eventSlug,
        eventDate: r.eventDate,
        sent: r.sent,
      })),
      youthApplications: youth.map((y) => ({
        name: y.name,
        country: y.country,
        motivation: y.motivation,
        status: y.status,
        createdAt: y.createdAt,
      })),
      mentorshipRequests: mentorship.map((m) => ({
        name: m.name,
        role: m.role,
        message: m.message,
        status: m.status,
        createdAt: m.createdAt,
      })),
    };
  },
};

// --- Sign-in methods, then the account itself (ALWAYS LAST) -----------------

const authAccountsModule: UserDataModule = {
  key: 'authAccounts',
  delete: async (ctx, userId) => {
    const accounts = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) => q.eq('userId', userId))
      .take(20);
    for (const account of accounts) {
      const codes = await ctx.db
        .query('authVerificationCodes')
        .withIndex('accountId', (q) => q.eq('accountId', account._id))
        .take(50);
      for (const c of codes) await ctx.db.delete(c._id);
      await ctx.db.delete(account._id);
    }
    return accounts.length < 20;
  },
  // Neither secret nor password hash: only the known methods.
  export: async (ctx, userId) => {
    const accounts = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) => q.eq('userId', userId))
      .take(20);
    return accounts.map((a) => ({ provider: a.provider }));
  },
};

// --- WORKSTREAM REGISTRY -----------------------------------------------------
//
// Wired in when the backlog workstreams were merged (27/09). Each workstream
// carries its rule (deletion or anonymization, justified in docs/backlog/*.md);
// this registry only calls them. The calls go through arrow
// functions: the imported modules themselves import `lib/`, and a read
// at module load time would hit a circular import not yet
// initialized.
//
// COMMUNITY runs BEFORE the core "tribune" and "workspaces" modules
// (cf. USER_DATA_MODULES): it knows a workspace's files, versions and invitations
// and a post's moderation history, which the core, written
// before it, is unaware of — the core then finds nothing left to do.
const communauteModule: UserDataModule = {
  key: 'communaute',
  delete: async (ctx, userId) =>
    (await deleteUserDataCommunaute(ctx, userId)).complete,
  export: (ctx, userId) => exportUserDataCommunaute(ctx, userId),
};

export const CHANTIER_USER_DATA_MODULES: UserDataModule[] = [
  {
    key: 'social',
    delete: async (ctx, userId) =>
      (await deleteUserDataSocial(ctx, userId)).done,
    export: (ctx, userId) => exportUserDataSocial(ctx, userId),
  },
  {
    key: 'programmes',
    delete: async (ctx, userId) => {
      await deleteUserDataProgrammes(ctx, userId);
    },
    export: (ctx, userId) => exportUserDataProgrammes(ctx, userId),
  },
  {
    key: 'editorial',
    delete: (ctx, userId) => deleteUserDataEditorial(ctx, userId),
    export: (ctx, userId) => exportUserDataEditorial(ctx, userId),
  },
  {
    key: 'contenus',
    delete: (ctx, userId) => deleteUserDataContenus(ctx, userId),
  },
  {
    // Accounting records are KEPT (legal obligation) and only
    // detached from the account; the export shows the member what remains in their name.
    key: 'paiements',
    delete: (ctx, userId) => deleteUserDataPaiements(ctx, userId),
    export: async (ctx, userId) => {
      const transactions = await ctx.db
        .query('paymentTransactions')
        .withIndex('by_user_and_paidAt', (q) => q.eq('userId', userId))
        .take(EXPORT_MAX);
      const receipts = await ctx.db
        .query('paymentReceipts')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .take(EXPORT_MAX);
      const subscriptions = await ctx.db
        .query('paymentSubscriptions')
        .withIndex('by_user', (q) => q.eq('userId', userId))
        .take(EXPORT_MAX);
      return {
        transactions: transactions.map((t) => ({
          kind: t.kind,
          amountMinor: t.amountMinor,
          currency: t.currency,
          status: t.status,
          paidAt: t.paidAt,
        })),
        receipts: receipts.map((r) => ({ number: r.number, year: r.year })),
        subscriptions: subscriptions.map((sub) => ({
          status: sub.status,
          amountMinor: sub.amountMinor,
          currency: sub.currency,
        })),
      };
    },
  },
  {
    key: 'diffusion',
    delete: (ctx, userId) => deleteUserDataDiffusion(ctx, userId),
  },
];

/** Ordered registry — the order is the deletion order. */
export const USER_DATA_MODULES: readonly UserDataModule[] = [
  sessionsModule,
  twoFactorModule,
  notificationsModule,
  organizationsModule,
  publicationsModule,
  peerReviewModule,
  communauteModule,
  tribuneModule,
  workspacesModule,
  projectsModule,
  membershipModule,
  byEmailModule,
  ...CHANTIER_USER_DATA_MODULES,
  authAccountsModule,
];

// Number of modules processed per transaction: each touches at most a few
// hundred documents, the transaction stays far from Convex's limits.
export const MODULES_PER_RUN = 4;

/**
 * Advances a deletion by one step. Returns the step reached, and `done`
 * when all modules are empty — all that remains then is to delete the
 * `users` row (done by the caller, which logs it).
 */
export async function advanceDeletion(
  ctx: MutationCtx,
  userId: Id<'users'>,
  fromStep: number,
  meta: UserDataMeta,
): Promise<{ step: number; done: boolean }> {
  let step = fromStep;
  let processed = 0;
  while (step < USER_DATA_MODULES.length && processed < MODULES_PER_RUN) {
    const finished = await USER_DATA_MODULES[step].delete(ctx, userId, meta);
    processed++;
    if (finished === false) return { step, done: false };
    step++;
  }
  return { step, done: step >= USER_DATA_MODULES.length };
}

/** Deletes the `users` row and maintains the counter. */
export async function deleteUserRow(ctx: MutationCtx, userId: Id<'users'>) {
  const user = await ctx.db.get(userId);
  if (!user) return;
  await ctx.db.delete(userId);
  await bumpCounter(ctx, COUNTER.USERS, -1);
}

/** All of an account's exportable data, module by module. */
export async function collectUserData(
  ctx: QueryCtx,
  userId: Id<'users'>,
  meta: UserDataMeta,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {};
  for (const entry of USER_DATA_MODULES) {
    if (entry.export) out[entry.key] = await entry.export(ctx, userId, meta);
  }
  return out;
}
