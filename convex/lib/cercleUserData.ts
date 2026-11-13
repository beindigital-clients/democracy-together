import type { Id } from '../_generated/dataModel';
import type { MutationCtx } from '../_generated/server';
import type { UserDataModule } from './accountDeletion';

// CERCLE DES AMIS — what the account deletion and the "mes données" export
// cover. The Cercle keeps data by ADDRESS (a request made before any account
// existed) and by account (once approved); both are removed together.
//
// Extended by each Cercle feature as its tables arrive (contributions,
// mailing-list contact).

const BATCH = 50;
const EXPORT_MAX = 500;

async function deleteStorage(ctx: MutationCtx, id: Id<'_storage'>) {
  try {
    await ctx.storage.delete(id);
  } catch {
    // Already gone: deleting the document carries on.
  }
}

export const cercleUserDataModule: UserDataModule = {
  key: 'cercle',
  delete: async (ctx, userId, { email }) => {
    let full = false;
    // The requests the account made or was made an Ami by, and — through the
    // address — the ones made before the account existed. Duplicates across
    // the three reads are harmless: a row is deleted once, then absent.
    const seen = new Set<string>();
    const reads = [
      await ctx.db
        .query('cercleRequests')
        .withIndex('by_member', (q) => q.eq('memberUserId', userId))
        .take(BATCH),
      await ctx.db
        .query('cercleRequests')
        .withIndex('by_applicant', (q) => q.eq('applicantUserId', userId))
        .take(BATCH),
      email
        ? await ctx.db
            .query('cercleRequests')
            .withIndex('by_email', (q) => q.eq('email', email))
            .take(BATCH)
        : [],
    ];
    for (const rows of reads) {
      full ||= rows.length === BATCH;
      for (const r of rows) {
        if (seen.has(r._id)) continue;
        seen.add(r._id);
        if (r.cvStorageId) await deleteStorage(ctx, r.cvStorageId);
        await ctx.db.delete(r._id);
      }
    }
    return !full;
  },
  export: async (ctx, userId, { email }) => {
    const byMember = await ctx.db
      .query('cercleRequests')
      .withIndex('by_member', (q) => q.eq('memberUserId', userId))
      .take(EXPORT_MAX);
    const byAddress = email
      ? await ctx.db
          .query('cercleRequests')
          .withIndex('by_email', (q) => q.eq('email', email))
          .take(EXPORT_MAX)
      : [];
    const unique = new Map([...byMember, ...byAddress].map((r) => [r._id, r]));
    return {
      requests: [...unique.values()].map((r) => ({
        name: r.name,
        country: r.country ?? null,
        motivation: r.motivation ?? null,
        status: r.status,
        submittedAt: r.submittedAt,
        cvFileName: r.cvFileName ?? null,
        cvDeleted: r.cvDeletedAt !== undefined,
        charterVersion: r.consent.charterVersion,
        noticeVersion: r.consent.noticeVersion,
      })),
    };
  },
};
