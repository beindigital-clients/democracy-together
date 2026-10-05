import { v } from 'convex/values';
import {
  internalAction,
  internalMutation,
  internalQuery,
} from './_generated/server';
import { internal } from './_generated/api';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { levelOf } from './lib/kohop';
import { recordKohopEvent } from './lib/kohopAccess';
import {
  coSignRequestUrl,
  commonAffiliations,
  employmentsRequestUrl,
  orcidOf,
  readCoSigned,
  readEmployments,
} from './lib/kohopExternalLinks';
import { GATEWAY_ERRORS, runStructured } from './lib/aiGateway';
import { KOHOP_CONFIRMATION_MODEL } from './lib/kohopSemantic';
import {
  LINK_SYNTHESIS_INSTRUCTIONS,
  LINK_SYNTHESIS_SCHEMA,
  linkSynthesisInput,
  readLinkSynthesis,
  type LinkFact,
} from './lib/kohopLinkAi';

// KOHOP — links found outside the platform: works co-signed in the last five
// years (OpenAlex) and organisations where both held a position (the public
// ORCID record), through the iDs published on the two profiles. The check runs
// when an author designates a reviewer, and the review chief can run it again.
// Rules read what the open databases answer; the AI then writes a short
// synthesis of it, with the links to the sources. Findings are FLAGGED at most
// and read by the review chief only: the AI never blocks alone.

const TIMEOUT_MS = 8000;

export const context = internalQuery({
  args: { reviewerId: v.id('kohopReviewers') },
  returns: v.union(
    v.null(),
    v.object({
      contributionId: v.id('kohopContributions'),
      authorOrcid: v.union(v.string(), v.null()),
      reviewerOrcid: v.union(v.string(), v.null()),
      lang: v.string(),
    }),
  ),
  handler: async (ctx, { reviewerId }) => {
    const reviewer = await ctx.db.get(reviewerId);
    if (!reviewer?.userId) return null;
    const file = await ctx.db.get(reviewer.contributionId);
    if (!file) return null;
    const [a, b] = await Promise.all(
      [file.authorUserId, reviewer.userId].map((userId) =>
        ctx.db
          .query('memberProfiles')
          .withIndex('by_userId', (q) => q.eq('userId', userId))
          .unique(),
      ),
    );
    return {
      contributionId: file._id,
      authorOrcid: a ? orcidOf(a.links) : null,
      reviewerOrcid: b ? orcidOf(b.links) : null,
      lang: file.lang,
    };
  },
});

const findingValidator = v.object({
  type: v.union(
    v.literal('external_cosign'),
    v.literal('external_affiliation'),
  ),
  detail: v.string(),
  source: v.string(),
  url: v.optional(v.string()),
});

export const record = internalMutation({
  args: {
    contributionId: v.id('kohopContributions'),
    reviewerId: v.id('kohopReviewers'),
    failed: v.boolean(),
    error: v.optional(v.string()),
    findings: v.array(findingValidator),
    synthesis: v.optional(v.string()),
    synthesisModel: v.optional(v.string()),
    synthesisError: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const reviewer = await ctx.db.get(args.reviewerId);
    if (!reviewer) return null;
    // Flagged at most: no finding found outside the platform ever blocks.
    await ctx.db.insert('kohopLinkChecks', {
      contributionId: args.contributionId,
      reviewerId: args.reviewerId,
      level: levelOf(args.findings),
      findings: args.findings,
      origin: args.synthesis ? 'ai' : 'external',
      model: args.synthesis ? args.synthesisModel : 'openalex+orcid',
      synthesis: args.synthesis,
      synthesisError: args.synthesisError,
      failed: args.failed || undefined,
      error: args.error,
      checkedAt: Date.now(),
    });
    if (args.findings.length > 0) {
      await ctx.db.patch(args.reviewerId, {
        flags: [
          ...new Set([...reviewer.flags, ...args.findings.map((f) => f.type)]),
        ],
      });
    }
    await recordKohopEvent(ctx, {
      contributionId: args.contributionId,
      kind: 'link_checked',
      metadata: { reviewerId: args.reviewerId, origin: 'external' },
    });
    await recordAudit(ctx, {
      action: AUDIT.KOHOP_LINK_CHECKED,
      targetId: args.contributionId,
      metadata: {
        reviewerId: args.reviewerId,
        origin: args.synthesis ? 'ai' : 'external',
        failed: args.failed,
      },
    });
    return null;
  },
});

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  return await response.json();
}

const reason = (err: unknown) =>
  err instanceof Error ? err.message.slice(0, 120) : 'ERROR';

export const check = internalAction({
  args: { reviewerId: v.id('kohopReviewers') },
  returns: v.null(),
  handler: async (ctx, { reviewerId }) => {
    const info = await ctx.runQuery(internal.kohopLinkExternal.context, {
      reviewerId,
    });
    if (!info) return null;
    const base = { contributionId: info.contributionId, reviewerId };
    // No iD on one side: the check could not run, and it is said so.
    if (!info.authorOrcid || !info.reviewerOrcid) {
      await ctx.runMutation(internal.kohopLinkExternal.record, {
        ...base,
        failed: true,
        error: 'NO_ORCID',
        findings: [],
      });
      return null;
    }

    // Co-signed works (OpenAlex) and positions held (ORCID): two sources,
    // each allowed to fail on its own. A failure is recorded, never read as
    // "nothing found".
    const now = Date.now();
    const [works, employmentsA, employmentsB] = await Promise.allSettled([
      getJson(coSignRequestUrl(info.authorOrcid, info.reviewerOrcid, now)),
      getJson(employmentsRequestUrl(info.authorOrcid)),
      getJson(employmentsRequestUrl(info.reviewerOrcid)),
    ]);
    const errors: string[] = [];
    const findings: LinkFact[] = [];

    if (works.status === 'rejected') errors.push(reason(works.reason));
    else {
      const read = readCoSigned(works.value);
      if (read === 'invalid') errors.push('INVALID_ANSWER');
      else if (read) {
        findings.push({
          type: 'external_cosign',
          detail: `${read.count} · ${read.title}${read.year ? ` (${read.year})` : ''}`,
          source: 'OpenAlex',
          url: read.url || undefined,
        });
      }
    }

    if (employmentsA.status === 'rejected') {
      errors.push(reason(employmentsA.reason));
    } else if (employmentsB.status === 'rejected') {
      errors.push(reason(employmentsB.reason));
    } else {
      const a = readEmployments(employmentsA.value);
      const b = readEmployments(employmentsB.value);
      if (a === 'invalid' || b === 'invalid') errors.push('INVALID_ANSWER');
      else {
        for (const name of commonAffiliations(a, b, now)) {
          findings.push({
            type: 'external_affiliation',
            detail: name,
            source: 'ORCID',
            url: `https://orcid.org/${info.reviewerOrcid}`,
          });
        }
      }
    }

    // The AI summarises what was found, for the review chief. It adds nothing.
    let synthesis: string | undefined;
    let synthesisModel: string | undefined;
    let synthesisError: string | undefined;
    if (findings.length > 0) {
      const allowed = await ctx.runMutation(internal.kohopAi.reserveCalls, {
        calls: 1,
      });
      if (!allowed) synthesisError = 'DAILY_CAP';
      else {
        const answer = await runStructured({
          model: KOHOP_CONFIRMATION_MODEL,
          instructions: LINK_SYNTHESIS_INSTRUCTIONS,
          userText: linkSynthesisInput(findings, info.lang),
          schemaName: 'kohop_link_synthesis',
          schema: LINK_SYNTHESIS_SCHEMA,
          maxOutputTokens: 600,
        });
        const text = answer.ok ? readLinkSynthesis(answer.data) : null;
        if (text) {
          synthesis = text;
          synthesisModel = KOHOP_CONFIRMATION_MODEL;
        } else {
          synthesisError = answer.ok
            ? GATEWAY_ERRORS.BAD_RESPONSE
            : answer.code;
        }
      }
    }

    await ctx.runMutation(internal.kohopLinkExternal.record, {
      ...base,
      failed: errors.length > 0,
      error: errors[0],
      findings: findings.map((f) => ({
        type: f.type as 'external_cosign' | 'external_affiliation',
        detail: f.detail,
        source: f.source,
        url: f.url,
      })),
      synthesis,
      synthesisModel,
      synthesisError,
    });
    return null;
  },
});
