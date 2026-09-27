import type { MutationCtx } from '../../_generated/server';
import type { Id } from '../../_generated/dataModel';

// SUPPRESSION DE COMPTE — ce que les contenus éditoriaux gardent d'un compte.
//
// Les contenus n'appartiennent pas à leur auteur : un événement publié par un
// éditeur reste au réseau quand l'éditeur part. Ils ne portent de lui qu'une
// TRACE (`updatedBy`, `uploadedBy`), que cette fonction efface. Le journal
// d'audit, lui, garde l'identifiant — c'est sa raison d'être, et il relève de
// la politique de conservation du journal, pas de ce chantier.
//
// Interne, sans `ctx.auth` : c'est la suppression de compte qui l'appelle,
// après ses propres contrôles. Tables petites (quelques centaines de lignes au
// plus) : la lecture bornée suffit.
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
