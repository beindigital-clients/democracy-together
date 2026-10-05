import { v, ConvexError } from 'convex/values';
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import type { MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { requireReviewChief } from './lib/rbac';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { notify } from './lib/notify';
import { reviewChiefRecipients } from './lib/reviewChiefs';
import { KOHOP_MATCH_CLASSES } from './lib/kohop';
import { countWords, toPlainText } from './lib/kohopText';
import { recordKohopEvent, versionOf } from './lib/kohopAccess';
import {
  classifyPassage,
  coverage,
  findSharedPassages,
} from './lib/kohopOriginality';
import { runExternalCheck } from './lib/kohopOriginalityProvider';

// KOHOP — ORIGINALITY (K-17, D-16/D-17). Two reports per version of a text:
//  - `platform`: the text against what the platform already holds (other KOHOP
//    contributions, published library documents), by shared runs of words;
//  - `external`: an anti-plagiarism provider, behind an isolated adapter.
// The reports inform the review chief; nothing here accepts or refuses. They
// are never published and never shown to the author. Accepting needs a
// finished platform report AND a finished external report — or the chief's
// explicit, audited acknowledgement that the external check was not run.

const CORPUS_STAGES = [
  'submitted',
  'in_review',
  'revision',
  'decision',
  'production',
  'proof',
  'ready',
  'scheduled',
  'published',
] as const;
const CORPUS_PER_STAGE = 15;
const PUBLICATIONS_MAX = 100;
const SOURCE_CHARS_MAX = 20_000;
const MATCHES_MAX = 30;

function refuse(code: string): never {
  throw new ConvexError(code);
}

// --- Reading the reports --------------------------------------------------------

/** Latest report of a scope for a version. */
export async function latestReport(
  ctx: QueryCtx | MutationCtx,
  contributionId: Id<'kohopContributions'>,
  version: number,
  scope: 'platform' | 'external',
): Promise<Doc<'originalityReports'> | null> {
  const rows = await ctx.db
    .query('originalityReports')
    .withIndex('by_contribution_and_version', (q) =>
      q.eq('contributionId', contributionId).eq('version', version),
    )
    .order('desc')
    .take(20);
  return rows.find((r) => r.scope === scope) ?? null;
}

/** The version a decision would accept. */
export function decidedVersion(file: Doc<'kohopContributions'>): number {
  return Math.max(file.reviewedVersion ?? 0, file.submittedVersion ?? 0);
}

/**
 * May this contribution be accepted, as far as originality goes? Platform
 * report done, external report done or acknowledged.
 */
export async function originalityGate(
  ctx: QueryCtx | MutationCtx,
  file: Doc<'kohopContributions'>,
): Promise<{ ok: boolean; withoutExternalCheck: boolean }> {
  const version = decidedVersion(file);
  const platform = await latestReport(ctx, file._id, version, 'platform');
  const external = await latestReport(ctx, file._id, version, 'external');
  const externalOk =
    external?.status === 'done' || external?.acknowledgedAt !== undefined;
  return {
    ok: platform?.status === 'done' && externalOk,
    withoutExternalCheck: external?.status !== 'done',
  };
}

/** The reports of the version being decided — review chief only. */
export const reports = query({
  args: { contributionId: v.id('kohopContributions') },
  handler: async (ctx, { contributionId }) => {
    await requireReviewChief(ctx);
    const file = await ctx.db.get(contributionId);
    if (!file) return null;
    const version = decidedVersion(file);
    const out = [];
    for (const scope of ['platform', 'external'] as const) {
      const r = await latestReport(ctx, file._id, version, scope);
      out.push({
        scope,
        report: r
          ? {
              status: r.status,
              summary: r.summary ?? null,
              provider: r.provider ?? null,
              error: r.error ?? null,
              checkedAt: r.checkedAt,
              acknowledged: r.acknowledgedAt !== undefined,
              matches: r.matches.map((m) => ({
                sourceType: m.sourceType,
                sourceTitle: m.sourceTitle,
                sourceUrl: m.sourceUrl ?? null,
                passage: m.passage,
                sourcePassage: m.sourcePassage ?? null,
                similarity: m.similarity ?? null,
                classification: m.classification ?? null,
              })),
            }
          : null,
      });
    }
    const gate = await originalityGate(ctx, file);
    return { version, gateOk: gate.ok, reports: out };
  },
});

// --- The platform check ---------------------------------------------------------

export const platformText = internalQuery({
  args: { contributionId: v.id('kohopContributions'), version: v.number() },
  returns: v.union(v.null(), v.string()),
  handler: async (ctx, { contributionId, version }) => {
    const row = await versionOf(ctx, contributionId, version);
    return row ? row.body : null;
  },
});

export const runPlatformCheck = internalMutation({
  args: { contributionId: v.id('kohopContributions'), version: v.number() },
  returns: v.null(),
  handler: async (ctx, { contributionId, version }) => {
    const file = await ctx.db.get(contributionId);
    const row = await versionOf(ctx, contributionId, version);
    if (!file || !row) return null;

    const sources: {
      type: 'kohop' | 'publication';
      id: string;
      title: string;
      body: string;
      sameAuthor: boolean;
      cited: boolean;
    }[] = [];
    for (const stage of CORPUS_STAGES) {
      const others = await ctx.db
        .query('kohopContributions')
        .withIndex('by_stage', (q) => q.eq('stage', stage))
        .order('desc')
        .take(CORPUS_PER_STAGE);
      for (const other of others) {
        if (other._id === contributionId) continue;
        const latest = await versionOf(
          ctx,
          other._id,
          other.submittedVersion ?? other.currentVersion,
        );
        if (!latest) continue;
        sources.push({
          type: 'kohop',
          id: other._id,
          title: latest.title,
          body: latest.body.slice(0, SOURCE_CHARS_MAX),
          sameAuthor: other.authorUserId === file.authorUserId,
          cited: false,
        });
      }
    }
    const cited = new Set(
      row.links.flatMap((l) => (l.publicationId ? [l.publicationId] : [])),
    );
    const publications = await ctx.db
      .query('publications')
      .withIndex('by_status', (q) => q.eq('status', 'published'))
      .take(PUBLICATIONS_MAX);
    for (const pub of publications) {
      sources.push({
        type: 'publication',
        id: pub._id,
        title: pub.title,
        body: [pub.abstract, ...pub.keypoints, ...pub.body]
          .join('\n\n')
          .slice(0, SOURCE_CHARS_MAX),
        sameAuthor: pub.authorUserId === file.authorUserId,
        cited: cited.has(pub._id),
      });
    }

    const matches: Doc<'originalityReports'>['matches'] = [];
    const found: { words: number }[] = [];
    for (const source of sources) {
      for (const passage of findSharedPassages(row.body, source.body)) {
        found.push(passage);
        if (matches.length >= MATCHES_MAX) continue;
        matches.push({
          sourceType: source.type,
          sourceId: source.id,
          sourceTitle: source.title,
          passage: passage.passage,
          sourcePassage: passage.sourcePassage,
          lang: file.lang,
          classification: classifyPassage({
            passage,
            sourceCited: source.cited,
            sameAuthor: source.sameAuthor,
            selfReuseDeclared: file.priorWorks.length > 0,
          }),
        });
      }
    }
    const share = coverage(countWords(row.body), found);
    const borrowings = matches.filter((m) => m.classification === 'borrowing');
    await ctx.db.insert('originalityReports', {
      contributionId,
      version,
      scope: 'platform',
      status: 'done',
      matches,
      summary: `${matches.length} passages, ${Math.round(share * 100)}%`,
      provider: 'platform',
      checkedAt: Date.now(),
    });
    await recordKohopEvent(ctx, {
      contributionId,
      kind: 'originality_checked',
      metadata: { scope: 'platform', version, matches: matches.length },
    });
    await recordAudit(ctx, {
      action: AUDIT.KOHOP_ORIGINALITY_CHECKED,
      targetId: contributionId,
      metadata: { scope: 'platform', version, matches: matches.length },
    });
    if (borrowings.length > 0) {
      for (const chief of await reviewChiefRecipients(ctx)) {
        await notify(ctx, {
          userId: chief._id,
          type: 'kohop_originality_ready',
          titleKey: 'kohopOriginalityReady',
          params: { title: file.title },
          link: `/admin/kohop/${contributionId}`,
        });
      }
    }
    return null;
  },
});

// --- The external check ---------------------------------------------------------

export const recordExternal = internalMutation({
  args: {
    contributionId: v.id('kohopContributions'),
    version: v.number(),
    status: v.union(
      v.literal('done'),
      v.literal('failed'),
      v.literal('unavailable'),
    ),
    provider: v.string(),
    summary: v.optional(v.string()),
    error: v.optional(v.string()),
    matches: v.array(
      v.object({
        sourceType: v.string(),
        sourceTitle: v.string(),
        sourceUrl: v.optional(v.string()),
        passage: v.string(),
        sourcePassage: v.optional(v.string()),
        similarity: v.optional(v.number()),
        classification: v.optional(
          v.union(...KOHOP_MATCH_CLASSES.map((c) => v.literal(c))),
        ),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.contributionId);
    if (!file) return null;
    await ctx.db.insert('originalityReports', {
      contributionId: args.contributionId,
      version: args.version,
      scope: 'external',
      status: args.status,
      matches: args.matches,
      summary: args.summary,
      provider: args.provider,
      error: args.error,
      checkedAt: Date.now(),
    });
    await recordKohopEvent(ctx, {
      contributionId: args.contributionId,
      kind: 'originality_checked',
      metadata: {
        scope: 'external',
        version: args.version,
        status: args.status,
      },
    });
    await recordAudit(ctx, {
      action: AUDIT.KOHOP_ORIGINALITY_CHECKED,
      targetId: args.contributionId,
      metadata: {
        scope: 'external',
        status: args.status,
        provider: args.provider,
      },
    });
    if (args.status === 'failed') {
      for (const chief of await reviewChiefRecipients(ctx)) {
        await notify(ctx, {
          userId: chief._id,
          type: 'kohop_originality_failed',
          titleKey: 'kohopOriginalityFailed',
          params: { title: file.title },
          link: `/admin/kohop/${args.contributionId}`,
        });
      }
    } else if (args.status === 'done' && args.matches.length > 0) {
      for (const chief of await reviewChiefRecipients(ctx)) {
        await notify(ctx, {
          userId: chief._id,
          type: 'kohop_originality_ready',
          titleKey: 'kohopOriginalityReady',
          params: { title: file.title },
          link: `/admin/kohop/${args.contributionId}`,
        });
      }
    }
    return null;
  },
});

/** Both checks, for one version: scheduled at submission and at each revision. */
export const runAll = internalAction({
  args: { contributionId: v.id('kohopContributions'), version: v.number() },
  returns: v.null(),
  handler: async (ctx, { contributionId, version }) => {
    await ctx.runMutation(internal.kohopOriginality.runPlatformCheck, {
      contributionId,
      version,
    });
    const body = await ctx.runQuery(internal.kohopOriginality.platformText, {
      contributionId,
      version,
    });
    if (body === null) return null;
    let result;
    try {
      result = await runExternalCheck(toPlainText(body));
    } catch (err) {
      result = {
        status: 'failed' as const,
        provider: 'unknown',
        error: err instanceof Error ? err.message : 'ERROR',
      };
    }
    await ctx.runMutation(internal.kohopOriginality.recordExternal, {
      contributionId,
      version,
      status: result.status,
      provider: result.provider,
      summary: result.status === 'done' ? result.summary : undefined,
      error: result.status === 'done' ? undefined : result.error,
      matches: result.status === 'done' ? result.matches : [],
    });
    return null;
  },
});

// --- The review chief ------------------------------------------------------------

/** Runs both checks again (a failure, a doubt, a late revision). */
export const requestChecks = mutation({
  args: { contributionId: v.id('kohopContributions') },
  returns: v.null(),
  handler: async (ctx, { contributionId }) => {
    const chief = await requireReviewChief(ctx);
    const file = await ctx.db.get(contributionId);
    if (!file) refuse('NOT_FOUND');
    const version = decidedVersion(file);
    if (version === 0) refuse('INVALID_TRANSITION');
    await ctx.scheduler.runAfter(0, internal.kohopOriginality.runAll, {
      contributionId,
      version,
    });
    await recordAudit(ctx, {
      actorId: chief._id,
      action: AUDIT.KOHOP_ORIGINALITY_CHECKED,
      targetId: contributionId,
      metadata: { requested: true, version },
    });
    return null;
  },
});

/**
 * "I accept without an external check": explicit and audited. Allowed only
 * while the external check is unavailable or failed — never over a finished
 * report, and never without a platform report.
 */
export const acknowledgeWithoutExternal = mutation({
  args: { contributionId: v.id('kohopContributions') },
  returns: v.null(),
  handler: async (ctx, { contributionId }) => {
    const chief = await requireReviewChief(ctx);
    const file = await ctx.db.get(contributionId);
    if (!file) refuse('NOT_FOUND');
    if (file.stage !== 'decision') refuse('INVALID_TRANSITION');
    const version = decidedVersion(file);
    const external = await latestReport(
      ctx,
      contributionId,
      version,
      'external',
    );
    if (!external || external.status === 'done')
      refuse('NOTHING_TO_ACKNOWLEDGE');
    await ctx.db.patch(external._id, {
      acknowledgedBy: chief._id,
      acknowledgedAt: Date.now(),
    });
    await recordAudit(ctx, {
      actorId: chief._id,
      action: AUDIT.KOHOP_ORIGINALITY_CHECKED,
      targetId: contributionId,
      metadata: { acknowledgedWithoutExternal: true, version },
    });
    return null;
  },
});
