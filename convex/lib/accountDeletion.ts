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

// SUPPRESSION ET EXPORT DES DONNÉES D'UN COMPTE — POINT D'ENTRÉE UNIQUE
// (chantier comptes ; RGPD art. 15, 17 et 20).
//
// Toute table qui porte des données d'un compte est déclarée ICI, par un
// module du registre ordonné `USER_DATA_MODULES`. La suppression (par un
// administrateur ou en libre-service) et l'export (« mes données ») lisent le
// même registre : une table ajoutée demain sans son entrée ne serait ni
// effacée ni exportée, et c'est précisément ce que ce fichier rend visible.
//
// LA RÈGLE, ET POURQUOI (détaillée dans docs/backlog/comptes.md) :
//
//  1. SUPPRIMÉ — tout ce qui n'existe que pour le compte : sessions, moyens
//     de connexion, 2FA, notifications, rattachements, candidatures, dépôts
//     NON publiés, inscriptions par adresse (newsletter, rappels, jeunes,
//     mentorat), propositions de projet, notes d'espace de travail.
//     Base : art. 17(1)(a)/(b), la finalité disparaît avec le compte.
//
//  2. SUPPRIMÉ AUSSI — l'EXPRESSION PERSONNELLE publiée : billets et
//     commentaires de la Tribune, réactions, signalements. Une opinion
//     politique signée est une donnée sensible (art. 9) dans un réseau qui
//     travaille sur des régimes autoritaires (cadrage § sécurité : risque de
//     « doxing » des contributeurs). Aucune exception de l'art. 17(3) ne
//     justifie de la garder contre la volonté de son auteur. Les
//     commentaires d'AUTRES membres sous un billet supprimé partent avec lui :
//     une réponse sans le texte qu'elle commente n'a plus de sens et
//     risquerait d'être mal lue.
//
//  3. CONSERVÉ MAIS DÉSATTRIBUÉ — les publications PUBLIÉES de la
//     bibliothèque et les avis de relecture rendus. Ce sont des documents de
//     recherche citables (DOI, citations entrantes) : les retirer casserait
//     les références d'autrui. Art. 17(3)(d) (fins de recherche scientifique
//     et d'archivage) : le lien au COMPTE est coupé (`authorUserId` retiré,
//     nom du relecteur effacé), la ligne d'auteurs imprimée — mention
//     bibliographique au même titre que dans un PDF diffusé — reste.
//
//  4. CONSERVÉ — le journal d'audit (intérêt légitime : sécurité, preuve des
//     décisions de modération). Il ne garde que l'identifiant d'un compte qui
//     n'existe plus, et plus aucune ligne ne relie cet identifiant à une
//     personne.
//
// Limites connues (tables sans index sur l'adresse ou le compte) : messages
// de contact, inscriptions à un événement — docs/backlog/comptes.md.

export type UserDataMeta = { email: string | null };

/**
 * Supprime (ou anonymise) UN LOT des données d'un compte.
 *
 * Rend `false` s'il en reste — l'orchestrateur rappellera le module dans une
 * nouvelle transaction —, `true` ou rien quand le module est vide pour ce
 * compte. Interne, sans `ctx.auth` : c'est l'orchestrateur qui a décidé.
 */
export type DeleteUserData = (
  ctx: MutationCtx,
  userId: Id<'users'>,
  meta: UserDataMeta,
) => Promise<boolean | void>;

/** Les données du compte dans ce module, pour l'export « mes données ». */
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

// Taille d'un lot : un module ne touche pas plus de BATCH documents
// « principaux » par appel (ses dépendances directes suivent, bornées).
const BATCH = 50;
// Plafond de l'export par module : au-delà, le fichier dit qu'il est tronqué.
export const EXPORT_MAX = 500;

async function deleteStorage(ctx: MutationCtx, id: Id<'_storage'>) {
  try {
    await ctx.storage.delete(id);
  } catch {
    // Fichier déjà absent : la suppression du document continue.
  }
}

// --- Sessions et connexion ---------------------------------------------------

/** Supprime toutes les sessions d'un compte et leurs jetons de rafraîchissement. */
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
  // Le SECRET n'est jamais exporté : un fichier « mes données » qui
  // contiendrait le second facteur le rendrait inutile.
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

// --- Organisations -----------------------------------------------------------

const organizationsModule: UserDataModule = {
  key: 'organizations',
  delete: async (ctx, userId) => {
    const memberships = await ctx.db
      .query('organizationMemberships')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .take(BATCH);
    for (const m of memberships) await ctx.db.delete(m._id);
    // Révisions de fiche EN ATTENTE : proposées par ce compte, personne ne
    // pourra plus répondre aux questions du modérateur. Les révisions déjà
    // tranchées ne contiennent que des données de l'organisation.
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

// --- Bibliothèque ------------------------------------------------------------

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
        // Règle 3 : conservée, désattribuée. Le patch retire `authorUserId`
        // — la ligne quitte donc l'index `by_author` et ne revient pas dans
        // le lot suivant.
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
    // Avis rendus : règle 3 — gardés (ils ont fondé une décision éditoriale),
    // le nom du relecteur effacé. Le patch ne sort pas la ligne de l'index
    // `by_reviewer` : on ne retraite donc que celles qui portent encore un nom.
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

// --- Espaces de travail ------------------------------------------------------

const workspacesModule: UserDataModule = {
  key: 'workspaces',
  delete: async (ctx, userId) => {
    const notes = await ctx.db
      .query('workspaceNotes')
      .withIndex('by_author', (q) => q.eq('authorUserId', userId))
      .take(BATCH);
    for (const n of notes) await ctx.db.delete(n._id);

    // Espaces DONT il est propriétaire : transmis au plus ancien des autres
    // membres, pour ne pas priver ceux-ci de leurs propres notes ; supprimés
    // s'il était seul.
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

// --- Projets, candidatures ---------------------------------------------------

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

// --- Inscriptions rattachées par l'ADRESSE -----------------------------------

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

// --- Moyens de connexion, puis le compte lui-même (TOUJOURS EN DERNIER) -----

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
  // Ni secret ni empreinte de mot de passe : seulement les moyens connus.
  export: async (ctx, userId) => {
    const accounts = await ctx.db
      .query('authAccounts')
      .withIndex('userIdAndProvider', (q) => q.eq('userId', userId))
      .take(20);
    return accounts.map((a) => ({ provider: a.provider }));
  },
};

// --- REGISTRE DES CHANTIERS --------------------------------------------------
//
// Branché à la fusion des chantiers du backlog (27/09). Chaque chantier porte
// sa règle (suppression ou anonymisation, justifiée dans docs/backlog/*.md) ;
// ce registre ne fait que les appeler. Les appels passent par des fonctions
// fléchées : les modules importés importent eux-mêmes `lib/`, et une lecture
// au chargement du module tomberait sur un import circulaire pas encore
// initialisé.
//
// La COMMUNAUTÉ passe AVANT les modules « tribune » et « workspaces » du socle
// (cf. USER_DATA_MODULES) : elle connaît les fichiers, versions et invitations
// d'un espace et l'historique de modération d'un billet, que le socle, écrit
// avant elle, ignore — le socle ne trouve ensuite plus rien à faire.
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
    // Les pièces comptables sont CONSERVÉES (obligation légale) et seulement
    // détachées du compte ; l'export montre au membre ce qui reste à son nom.
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

/** Registre ordonné — l'ordre est celui de la suppression. */
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

// Nombre de modules traités par transaction : chacun touche au plus quelques
// centaines de documents, la transaction reste loin des plafonds de Convex.
export const MODULES_PER_RUN = 4;

/**
 * Fait avancer une suppression d'un pas. Rend l'étape atteinte et `done`
 * quand tous les modules sont vides — il ne reste alors qu'à supprimer la
 * ligne `users` (fait par l'appelant, qui journalise).
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

/** Supprime la ligne `users` et tient le compteur. */
export async function deleteUserRow(ctx: MutationCtx, userId: Id<'users'>) {
  const user = await ctx.db.get(userId);
  if (!user) return;
  await ctx.db.delete(userId);
  await bumpCounter(ctx, COUNTER.USERS, -1);
}

/** Toutes les données exportables d'un compte, module par module. */
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
