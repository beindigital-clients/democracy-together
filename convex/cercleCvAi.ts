import { ConvexError, v } from 'convex/values';
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
} from './_generated/server';
import { internal } from './_generated/api';
import { requireNetworkRole } from './lib/rbac';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { GATEWAY_ERRORS, runStructured, toBase64 } from './lib/aiGateway';
import {
  CV_SUMMARY_INSTRUCTIONS,
  CV_SUMMARY_SCHEMA,
  MOCK_CV_SUMMARY,
  cvAiEnabled,
  cvAiMocked,
  cvAiModel,
  readCvSummary,
  summaryLanguage,
} from './lib/cercleCvAi';

// CERCLE DES AMIS — CV SUMMARY (docs/cercle-amis.md § 9).
//
// Everything here is gated THREE times, because a CV is personal data and the
// provider is a third party:
//   1. the deployment switch `CERCLE_CV_AI_ENABLED` (off by default);
//   2. the person's own optional consent at the form (`cvAiConsent`);
//   3. the request still being pending, with its CV still on file.
// Nothing leaves the deployment unless all three hold, and the tool only ever
// writes `cvSummary`: no score, no label, no decision.

const requestForSummary = v.union(
  v.null(),
  v.object({
    storageId: v.id('_storage'),
    fileName: v.string(),
    locale: v.optional(v.string()),
  }),
);

// What the action needs, or `null` when ANY of the three conditions fails.
export const _loadForSummary = internalQuery({
  args: { requestId: v.id('cercleRequests') },
  returns: requestForSummary,
  handler: async (ctx, { requestId }) => {
    if (!cvAiEnabled()) return null;
    const r = await ctx.db.get(requestId);
    if (!r || r.status !== 'pending') return null;
    if (!r.cvAiConsent || !r.cvStorageId) return null;
    return {
      storageId: r.cvStorageId,
      fileName: r.cvFileName ?? 'cv.pdf',
      locale: r.locale,
    };
  },
});

export const _saveSummary = internalMutation({
  args: {
    requestId: v.id('cercleRequests'),
    summary: v.union(
      v.null(),
      v.object({
        overview: v.string(),
        education: v.array(v.string()),
        experience: v.array(v.string()),
        languages: v.array(v.string()),
        themes: v.array(v.string()),
      }),
    ),
    model: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { requestId, summary, model }) => {
    const r = await ctx.db.get(requestId);
    // Decided, or CV gone, while the tool was working: nothing is kept (a
    // refusal deletes the CV AND what was derived from it).
    if (!r || r.status !== 'pending' || !r.cvStorageId || !r.cvAiConsent) {
      return null;
    }
    const now = Date.now();
    if (summary === null) {
      await ctx.db.patch(requestId, { cvSummaryFailedAt: now });
    } else {
      await ctx.db.patch(requestId, {
        cvSummary: { ...summary, model, at: now },
        cvSummaryFailedAt: undefined,
      });
    }
    return null;
  },
});

export const summarize = internalAction({
  args: { requestId: v.id('cercleRequests') },
  returns: v.null(),
  handler: async (ctx, { requestId }) => {
    const target = await ctx.runQuery(internal.cercleCvAi._loadForSummary, {
      requestId,
    });
    // Off, not consented, decided, or no CV: no read, no call, no data out.
    if (!target) return null;

    if (cvAiMocked()) {
      await ctx.runMutation(internal.cercleCvAi._saveSummary, {
        requestId,
        summary: MOCK_CV_SUMMARY,
        model: 'mock',
      });
      return null;
    }

    const blob = await ctx.storage.get(target.storageId);
    if (!blob) {
      await ctx.runMutation(internal.cercleCvAi._saveSummary, {
        requestId,
        summary: null,
        model: cvAiModel(),
      });
      return null;
    }
    const model = cvAiModel();
    const result = await runStructured({
      model,
      instructions: CV_SUMMARY_INSTRUCTIONS,
      userText: `language: ${summaryLanguage(target.locale)}\nSummarise the attached CV.`,
      attachment: {
        filename: 'cv.pdf',
        base64: toBase64(new Uint8Array(await blob.arrayBuffer())),
        contentType: 'application/pdf',
      },
      schemaName: 'cv_summary',
      schema: CV_SUMMARY_SCHEMA,
      maxOutputTokens: 900,
    });
    const summary = result.ok ? readCvSummary(result.data) : null;
    if (!result.ok && result.code !== GATEWAY_ERRORS.NOT_CONFIGURED) {
      console.error(`[cercle-cv-ai] échec : ${result.code}`);
    }
    await ctx.runMutation(internal.cercleCvAi._saveSummary, {
      requestId,
      summary,
      model,
    });
    return null;
  },
});

// The president asks again after a failure. Same three conditions, re-checked
// by the action; audited like every opening of the CV's content.
export const retrySummary = mutation({
  args: { requestId: v.id('cercleRequests') },
  returns: v.null(),
  handler: async (ctx, { requestId }) => {
    const admin = await requireNetworkRole(ctx, 'admin');
    if (!cvAiEnabled()) throw new ConvexError('CV_AI_DISABLED');
    const r = await ctx.db.get(requestId);
    if (!r || r.status !== 'pending' || !r.cvAiConsent || !r.cvStorageId) {
      throw new ConvexError('NOT_ELIGIBLE');
    }
    await recordAudit(ctx, {
      actorId: admin._id,
      action: AUDIT.CERCLE_CV_SUMMARY_REQUESTED,
      targetId: requestId,
    });
    await ctx.scheduler.runAfter(0, internal.cercleCvAi.summarize, {
      requestId,
    });
    return null;
  },
});
