import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import { anonymizePdf } from './lib/pdfAnonymize';

// COPIE ANONYMISÉE du fichier d'une version de manuscrit (F-43, double
// aveugle). Planifiée à chaque nouvelle version (convex/peerReview.ts) :
// l'auteur n'attend pas, et le relecteur ne reçoit le fichier qu'une fois
// cette copie faite.
//
// Runtime Convex par défaut (pas de `"use node"`) : pdf-lib est du JavaScript
// pur. Un PDF illisible (chiffré, corrompu) n'est PAS transmis tel quel : la
// version passe en `unreadable`, l'éditeur est averti dans sa file et décide
// de libérer l'original après l'avoir vérifié.
export const anonymizeVersion = internalAction({
  args: { versionId: v.id('manuscriptVersions') },
  returns: v.null(),
  handler: async (ctx, { versionId }) => {
    const source = await ctx.runQuery(internal.peerReview.versionForBlindCopy, {
      versionId,
    });
    if (!source) return null;
    const blob = await ctx.storage.get(source.fileId);
    if (!blob) {
      await ctx.runMutation(internal.peerReview.saveBlindCopy, {
        versionId,
        status: 'unreadable',
        stripped: [],
      });
      return null;
    }
    const result = await anonymizePdf(
      new Uint8Array(await blob.arrayBuffer()),
      {
        title: source.title,
      },
    );
    if (result.status === 'unreadable') {
      await ctx.runMutation(internal.peerReview.saveBlindCopy, {
        versionId,
        status: 'unreadable',
        stripped: [],
      });
      return null;
    }
    const blindFileId = await ctx.storage.store(
      new Blob([new Uint8Array(result.bytes)], { type: 'application/pdf' }),
    );
    await ctx.runMutation(internal.peerReview.saveBlindCopy, {
      versionId,
      blindFileId,
      status: result.status,
      stripped: result.stripped,
    });
    return null;
  },
});
