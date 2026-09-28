import { v } from 'convex/values';
import { internalAction } from './_generated/server';
import { internal } from './_generated/api';
import { anonymizePdf } from './lib/pdfAnonymize';

// ANONYMIZED COPY of a manuscript version's file (F-43, double
// blind). Scheduled on each new version (convex/peerReview.ts):
// the author does not wait, and the reviewer only receives the file once
// this copy is made.
//
// Default Convex runtime (no `"use node"`): pdf-lib is pure
// JavaScript. An unreadable PDF (encrypted, corrupted) is NOT passed on as is: the
// version switches to `unreadable`, the editor is alerted in their queue and decides
// whether to release the original after checking it.
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
