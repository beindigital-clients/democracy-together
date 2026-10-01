import type { MutationCtx } from '../../_generated/server';
import type { Id } from '../../_generated/dataModel';

// ACCOUNT DELETION — what editorial content keeps of an account.
//
// Content does not belong to its author: an event published by an
// editor stays with the network when the editor leaves. It only carries a
// TRACE of them (`updatedBy`, `uploadedBy`), which this function erases. The audit
// log, for its part, keeps the identifier — that is its raison d'être, and it falls under
// the log's retention policy, not this workstream.
//
// Internal, no `ctx.auth`: account deletion calls it,
// after its own checks. Small tables (a few hundred rows at
// most): the bounded read is enough.
const SCAN_MAX = 2000;

export async function deleteUserDataContenus(
  ctx: MutationCtx,
  userId: Id<'users'>,
): Promise<void> {
  for (const table of [
    'contentEvents',
    'contentReplays',
    'contentPartners',
    'contentPress',
    'contentThemes',
    'contentNews',
  ] as const) {
    const rows = await ctx.db.query(table).take(SCAN_MAX);
    for (const row of rows) {
      if (row.updatedBy === userId) {
        await ctx.db.patch(row._id, { updatedBy: undefined });
      }
    }
  }
  const media = await ctx.db.query('contentMedia').take(SCAN_MAX);
  for (const m of media) {
    if (m.uploadedBy === userId) {
      await ctx.db.patch(m._id, { uploadedBy: undefined });
    }
  }
}
