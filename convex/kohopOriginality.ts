import { v, ConvexError } from 'convex/values';
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import type { ActionCtx, MutationCtx, QueryCtx } from './_generated/server';
import type { Doc, Id } from './_generated/dataModel';
import { internal } from './_generated/api';
import { requireReviewChief } from './lib/rbac';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { notify } from './lib/notify';
import { reviewChiefRecipients } from './lib/reviewChiefs';
import { type KohopIndexKind, type KohopStageStatus } from './lib/kohop';
import { kohopMatch, kohopStageReport } from './lib/tables/kohop';
import {
  GATEWAY_ERRORS,
  isGatewayConfigured,
  runEmbeddings,
  runStructured,
} from './lib/aiGateway';
import { chunkText } from './lib/kohopChunks';
import {
  distinctHashes,
  fingerprintsOf,
  rankSources,
} from './lib/kohopWinnowing';
import {
  kohopGroup,
  loadSource,
  publicationGroup,
} from './lib/kohopIndexSources';
import {
  KOHOP_CONFIRMATION_BATCH,
  KOHOP_CONFIRMATION_MAX,
  KOHOP_CONFIRMATION_MODEL,
  KOHOP_EMBEDDING_BATCH,
  KOHOP_EMBEDDING_DIMENSIONS,
  KOHOP_EMBEDDING_MODEL,
  KOHOP_SEMANTIC_NEIGHBOURS,
  semanticCandidates,
  type SemanticHit,
} from './lib/kohopSemantic';
import {
  CONFIRMATION_INSTRUCTIONS,
  CONFIRMATION_SCHEMA,
  confirmationInput,
  readConfirmation,
  type ConfirmationItem,
} from './lib/kohopOriginalityAi';
import { catchUpIndex, embedPendingBatches } from './kohopIndex';
import { countWords, toPlainText } from './lib/kohopText';
import { recordKohopEvent, versionOf } from './lib/kohopAccess';
import {
  classifyPassage,
  coverage,
  findSharedPassages,
} from './lib/kohopOriginality';
import { runExternalCheck } from './lib/plagiarism';

// KOHOP — ORIGINALITY (K-17, D-16/D-17). Two reports per version of a text:
//  - `platform`: the text against what the platform already holds (other KOHOP
//    contributions, published library documents), by shared runs of words;
//  - `external`: an anti-plagiarism provider, behind an isolated adapter.
// The reports inform the review chief; nothing here accepts or refuses. They
// are never published and never shown to the author. Accepting needs a
// finished platform report AND a finished external report — or the chief's
// explicit, audited acknowledgement that the external check was not run.

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
              model: r.model ?? null,
              stages: (r.stages ?? []).map((st) => ({
                stage: st.stage,
                status: st.status,
                error: st.error ?? null,
              })),
              matches: r.matches.map((m) => ({
                sourceType: m.sourceType,
                sourceTitle: m.sourceTitle,
                sourceUrl: m.sourceUrl ?? null,
                passage: m.passage,
                sourcePassage: m.sourcePassage ?? null,
                lang: m.lang ?? null,
                sourceLang: m.sourceLang ?? null,
                similarity: m.similarity ?? null,
                classification: m.classification ?? null,
                method: m.method ?? null,
                crossLanguage: m.crossLanguage === true,
                aiVerdict: m.aiVerdict ?? null,
                aiClassification: m.aiClassification ?? null,
                aiRationale: m.aiRationale ?? null,
              })),
            }
          : null,
      });
    }
    const gate = await originalityGate(ctx, file);
    // Starting the review only needs the platform report of the submission.
    const platform = await latestReport(
      ctx,
      file._id,
      file.submittedVersion ?? file.currentVersion,
      'platform',
    );
    return {
      version,
      gateOk: gate.ok,
      platformDone: platform?.status === 'done',
      reports: out,
    };
  },
});

// --- The platform check ---------------------------------------------------------
//
// Three stages, each reported on its own (a stage that could not run says so —
// it never reads as "nothing to report"):
//  1. `words`: shared runs of words, found through the fingerprint index and read
//     back from the sources;
//  2. `semantic`: paragraphs close in meaning, in any language, through the
//     embeddings of the paragraph index;
//  3. `ai`: the AI reads each candidate side by side with its source and says
//     what it is. It advises; the rule-based class stays beside its answer.
// The versions of the same contribution are never compared with one another.

const HASHES_MAX = 600;
const HASH_FANOUT = 15;
const CANDIDATE_SOURCES = 25;

export const platformText = internalQuery({
  args: { contributionId: v.id('kohopContributions'), version: v.number() },
  returns: v.union(v.null(), v.object({ body: v.string(), lang: v.string() })),
  handler: async (ctx, { contributionId, version }) => {
    const file = await ctx.db.get(contributionId);
    const row = await versionOf(ctx, contributionId, version);
    return file && row ? { body: row.body, lang: file.lang } : null;
  },
});

const matchFacts = v.object({
  quoted: v.boolean(),
  sourceCited: v.boolean(),
  sameAuthor: v.boolean(),
});

/** Stage 1, read-only: the shared runs of words, classified by the rules. */
export const wordsStage = internalQuery({
  args: { contributionId: v.id('kohopContributions'), version: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      lang: v.string(),
      groupId: v.string(),
      authorUserId: v.id('users'),
      selfReuseDeclared: v.boolean(),
      citedGroups: v.array(v.string()),
      matches: v.array(kohopMatch),
      facts: v.array(matchFacts),
      wordPassages: v.array(v.string()),
      chunks: v.array(v.string()),
      share: v.number(),
    }),
  ),
  handler: async (ctx, { contributionId, version }) => {
    const file = await ctx.db.get(contributionId);
    const row = await versionOf(ctx, contributionId, version);
    if (!file || !row) return null;
    const groupId = kohopGroup(contributionId);
    const citedGroups = row.links.flatMap((l) =>
      l.publicationId ? [publicationGroup(l.publicationId)] : [],
    );
    const selfReuseDeclared = file.priorWorks.length > 0;

    // The distinct fingerprints of the text, spread evenly if there are many.
    const all = distinctHashes(fingerprintsOf(row.body));
    const stride = Math.max(1, Math.ceil(all.length / HASHES_MAX));
    const hits = new Map<number, string[]>();
    for (let i = 0; i < all.length; i += stride) {
      const rows = await ctx.db
        .query('textFingerprints')
        .withIndex('by_hash', (q) => q.eq('hash', all[i]))
        .take(HASH_FANOUT);
      if (rows.length > 0) {
        hits.set(
          all[i],
          rows.map((r) => `${r.sourceKind}:${r.sourceId}`),
        );
      }
    }

    const matches: Doc<'originalityReports'>['matches'] = [];
    const facts: {
      quoted: boolean;
      sourceCited: boolean;
      sameAuthor: boolean;
    }[] = [];
    const found: { words: number }[] = [];
    const wordPassages: string[] = [];
    for (const { sourceKey } of rankSources(hits, {
      min: 1,
      limit: CANDIDATE_SOURCES,
    })) {
      const at = sourceKey.indexOf(':');
      const kind = sourceKey.slice(0, at) as KohopIndexKind;
      const sourceId = sourceKey.slice(at + 1);
      const source = await ctx.db
        .query('textSources')
        .withIndex('by_source', (q) =>
          q.eq('sourceKind', kind).eq('sourceId', sourceId),
        )
        .unique();
      if (!source || source.groupId === groupId) continue;
      const loaded = await loadSource(ctx, kind, sourceId);
      if (!loaded) continue;
      const cited = citedGroups.includes(source.groupId);
      const sameAuthor = source.authorUserId === file.authorUserId;
      for (const passage of findSharedPassages(row.body, loaded.text)) {
        found.push(passage);
        wordPassages.push(passage.passage);
        if (matches.length >= MATCHES_MAX) continue;
        matches.push({
          sourceType: kind,
          sourceId,
          sourceTitle: source.title,
          passage: passage.passage,
          sourcePassage: passage.sourcePassage,
          lang: file.lang,
          sourceLang: source.lang,
          method: 'words',
          classification: classifyPassage({
            passage,
            sourceCited: cited,
            sameAuthor,
            selfReuseDeclared,
          }),
        });
        facts.push({ quoted: passage.quoted, sourceCited: cited, sameAuthor });
      }
    }
    return {
      lang: file.lang,
      groupId,
      authorUserId: file.authorUserId,
      selfReuseDeclared,
      citedGroups,
      matches,
      facts,
      wordPassages,
      chunks: chunkText(row.body),
      share: coverage(countWords(row.body), found),
    };
  },
});

/** What the vector index returned, read back with the title of each source. */
export const passagesByIds = internalQuery({
  args: { ids: v.array(v.id('textPassages')) },
  returns: v.array(
    v.object({
      id: v.id('textPassages'),
      sourceKind: v.string(),
      sourceId: v.string(),
      groupId: v.string(),
      title: v.string(),
      text: v.string(),
      lang: v.optional(v.string()),
      authorUserId: v.optional(v.id('users')),
    }),
  ),
  handler: async (ctx, { ids }) => {
    const out = [];
    for (const id of ids) {
      const p = await ctx.db.get(id);
      if (!p) continue;
      const source = await ctx.db
        .query('textSources')
        .withIndex('by_source', (q) =>
          q.eq('sourceKind', p.sourceKind).eq('sourceId', p.sourceId),
        )
        .unique();
      if (!source) continue;
      out.push({
        id: p._id,
        sourceKind: p.sourceKind,
        sourceId: p.sourceId,
        groupId: p.groupId,
        title: source.title,
        text: p.text,
        lang: p.lang,
        authorUserId: source.authorUserId,
      });
    }
    return out;
  },
});

type StageResult = {
  status: KohopStageStatus;
  error?: string;
  model?: string;
};

const failureStatus = (code: string): KohopStageStatus =>
  code === GATEWAY_ERRORS.NOT_CONFIGURED ? 'unavailable' : 'failed';

/** Stage 2: paragraphs close in meaning, through the vector index. */
async function semanticStage(
  ctx: ActionCtx,
  input: {
    chunks: string[];
    groupId: string;
    lang: string;
    wordPassages: string[];
    authorUserId: Id<'users'>;
    citedGroups: string[];
  },
): Promise<{
  result: StageResult;
  matches: Doc<'originalityReports'>['matches'];
  facts: { quoted: boolean; sourceCited: boolean; sameAuthor: boolean }[];
}> {
  const none = { matches: [], facts: [] };
  if (input.chunks.length === 0) return { result: { status: 'done' }, ...none };

  // The corpus must be embedded for the comparison to mean anything.
  const embedding = await embedPendingBatches(ctx, 10);
  if (
    await ctx.runQuery(internal.kohopIndex.hasPendingEmbeddings, {
      exceptGroupId: input.groupId,
    })
  ) {
    const configured = isGatewayConfigured();
    return {
      result: {
        status: configured ? 'failed' : 'unavailable',
        error: !configured
          ? GATEWAY_ERRORS.NOT_CONFIGURED
          : embedding === 'cap'
            ? 'DAILY_CAP'
            : 'EMBEDDING_BACKLOG',
      },
      ...none,
    };
  }

  const batches = Math.ceil(input.chunks.length / KOHOP_EMBEDDING_BATCH);
  if (
    !(await ctx.runMutation(internal.kohopAi.reserveCalls, { calls: batches }))
  ) {
    return { result: { status: 'failed', error: 'DAILY_CAP' }, ...none };
  }
  const vectors: number[][] = [];
  for (let i = 0; i < input.chunks.length; i += KOHOP_EMBEDDING_BATCH) {
    const embedded = await runEmbeddings({
      model: KOHOP_EMBEDDING_MODEL,
      inputs: input.chunks.slice(i, i + KOHOP_EMBEDDING_BATCH),
      dimensions: KOHOP_EMBEDDING_DIMENSIONS,
    });
    if (!embedded.ok) {
      return {
        result: { status: failureStatus(embedded.code), error: embedded.code },
        ...none,
      };
    }
    vectors.push(...embedded.vectors);
  }

  const raw: SemanticHit[] = [];
  const info = new Map<
    string,
    {
      sourceKind: string;
      sourceId: string;
      title: string;
      lang?: string;
      authorUserId?: Id<'users'>;
    }
  >();
  for (let at = 0; at < vectors.length; at++) {
    const near = await ctx.vectorSearch('textPassages', 'by_embedding', {
      vector: vectors[at],
      limit: KOHOP_SEMANTIC_NEIGHBOURS + 2,
    });
    const rows = await ctx.runQuery(internal.kohopOriginality.passagesByIds, {
      ids: near.map((n) => n._id),
    });
    for (const row of rows) {
      const score = near.find((n) => n._id === row.id)?._score ?? 0;
      const key = `${row.sourceKind}:${row.sourceId}`;
      info.set(key, {
        sourceKind: row.sourceKind,
        sourceId: row.sourceId,
        title: row.title,
        lang: row.lang,
        authorUserId: row.authorUserId,
      });
      raw.push({
        chunk: input.chunks[at],
        sourceKey: key,
        groupId: row.groupId,
        sourcePassage: row.text,
        similarity: score,
      });
    }
  }

  const candidates = semanticCandidates(raw, {
    ownGroupId: input.groupId,
    wordPassages: input.wordPassages,
  });
  const matches: Doc<'originalityReports'>['matches'] = [];
  const facts: {
    quoted: boolean;
    sourceCited: boolean;
    sameAuthor: boolean;
  }[] = [];
  for (const c of candidates) {
    const source = info.get(c.sourceKey);
    if (!source) continue;
    matches.push({
      sourceType: source.sourceKind,
      sourceId: source.sourceId,
      sourceTitle: source.title,
      passage: c.chunk,
      sourcePassage: c.sourcePassage,
      lang: input.lang,
      sourceLang: source.lang,
      similarity: Math.round(c.similarity * 1000) / 1000,
      method: 'semantic',
      crossLanguage:
        source.lang !== undefined && source.lang !== input.lang ? true : false,
    });
    facts.push({
      quoted: false,
      sourceCited: input.citedGroups.some((g) =>
        g.endsWith(`:${source.sourceId}`),
      ),
      sameAuthor: source.authorUserId === input.authorUserId,
    });
  }
  return {
    result: { status: 'done', model: KOHOP_EMBEDDING_MODEL },
    matches,
    facts,
  };
}

/** Stage 3: the AI reads each candidate beside its source and gives its advice. */
async function confirmationStage(
  ctx: ActionCtx,
  input: {
    matches: Doc<'originalityReports'>['matches'];
    facts: { quoted: boolean; sourceCited: boolean; sameAuthor: boolean }[];
    lang: string;
    selfReuseDeclared: boolean;
  },
): Promise<StageResult> {
  // What is worth reading: every semantic candidate and every rule-based borrowing.
  const picked = input.matches
    .map((m, i) => ({ m, i }))
    .filter(
      ({ m }) => m.method === 'semantic' || m.classification === 'borrowing',
    )
    .slice(0, KOHOP_CONFIRMATION_MAX);
  if (picked.length === 0) return { status: 'done' };

  for (let i = 0; i < picked.length; i += KOHOP_CONFIRMATION_BATCH) {
    const batch = picked.slice(i, i + KOHOP_CONFIRMATION_BATCH);
    if (!(await ctx.runMutation(internal.kohopAi.reserveCalls, { calls: 1 }))) {
      return {
        status: 'failed',
        error: 'DAILY_CAP',
        model: KOHOP_CONFIRMATION_MODEL,
      };
    }
    const items: ConfirmationItem[] = batch.map(({ m, i: at }) => ({
      id: at,
      passage: m.passage,
      sourcePassage: m.sourcePassage ?? '',
      passageLang: m.lang,
      quoted: input.facts[at]?.quoted ?? false,
      sourceCited: input.facts[at]?.sourceCited ?? false,
      sameAuthor: input.facts[at]?.sameAuthor ?? false,
      selfReuseDeclared: input.selfReuseDeclared,
    }));
    const answer = await runStructured({
      model: KOHOP_CONFIRMATION_MODEL,
      instructions: CONFIRMATION_INSTRUCTIONS,
      userText: confirmationInput(items),
      schemaName: 'kohop_originality_confirmation',
      schema: CONFIRMATION_SCHEMA,
      maxOutputTokens: 2000,
    });
    if (!answer.ok) {
      return {
        status: failureStatus(answer.code),
        error: answer.code,
        model: KOHOP_CONFIRMATION_MODEL,
      };
    }
    const read = readConfirmation(
      answer.data,
      items.map((x) => x.id),
    );
    if (!read) {
      return {
        status: 'failed',
        error: GATEWAY_ERRORS.BAD_RESPONSE,
        model: KOHOP_CONFIRMATION_MODEL,
      };
    }
    for (const [at, c] of read) {
      const m = input.matches[at];
      m.aiVerdict = c.verdict;
      m.aiClassification = c.classification;
      m.aiRationale = c.rationale;
    }
  }
  return { status: 'done', model: KOHOP_CONFIRMATION_MODEL };
}

export const recordPlatform = internalMutation({
  args: {
    contributionId: v.id('kohopContributions'),
    version: v.number(),
    status: v.union(v.literal('done'), v.literal('failed')),
    matches: v.array(kohopMatch),
    stages: v.array(kohopStageReport),
    share: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const file = await ctx.db.get(args.contributionId);
    if (!file) return null;
    const incomplete = args.stages.filter((s) => s.status !== 'done');
    const summary =
      `${args.matches.length} passages, ${Math.round(args.share * 100)}%` +
      incomplete.map((s) => ` · ${s.stage}: ${s.status}`).join('');
    await ctx.db.insert('originalityReports', {
      contributionId: args.contributionId,
      version: args.version,
      scope: 'platform',
      status: args.status,
      matches: args.matches,
      stages: args.stages,
      summary,
      provider: 'platform',
      model: args.stages.find((s) => s.stage === 'ai' && s.model)?.model,
      error: incomplete[0]?.error,
      checkedAt: Date.now(),
    });
    await recordKohopEvent(ctx, {
      contributionId: args.contributionId,
      kind: 'originality_checked',
      metadata: {
        scope: 'platform',
        version: args.version,
        matches: args.matches.length,
      },
    });
    await recordAudit(ctx, {
      action: AUDIT.KOHOP_ORIGINALITY_CHECKED,
      targetId: args.contributionId,
      metadata: {
        scope: 'platform',
        version: args.version,
        matches: args.matches.length,
        incompleteStages: incomplete.map((s) => s.stage),
      },
    });
    const noteworthy = args.matches.some(
      (m) =>
        m.classification === 'borrowing' ||
        (m.method === 'semantic' && m.aiVerdict !== 'topic_only'),
    );
    // Two separate things to tell the chiefs: something to read, and a stage
    // that could not run (their report is then incomplete, and says so).
    const keys = [
      ...(noteworthy
        ? [
            {
              type: 'kohop_originality_ready',
              titleKey: 'kohopOriginalityReady',
            },
          ]
        : []),
      ...(incomplete.length > 0
        ? [
            {
              type: 'kohop_originality_failed',
              titleKey: 'kohopOriginalityFailed',
            },
          ]
        : []),
    ];
    for (const key of keys) {
      for (const chief of await reviewChiefRecipients(ctx)) {
        await notify(ctx, {
          userId: chief._id,
          type: key.type,
          titleKey: key.titleKey,
          params: { title: file.title },
          link: `/admin/kohop/${args.contributionId}`,
        });
      }
    }
    return null;
  },
});

/** The three stages, in order, for one version of a text. */
async function runPlatformCheck(
  ctx: ActionCtx,
  contributionId: Id<'kohopContributions'>,
  version: number,
): Promise<void> {
  // The text itself joins the index, so later checks compare with it.
  await ctx.runMutation(internal.kohopIndex.indexSource, {
    kind: 'kohop',
    sourceId: contributionId,
  });
  const indexReady = await catchUpIndex(ctx);
  const words = indexReady
    ? await ctx.runQuery(internal.kohopOriginality.wordsStage, {
        contributionId,
        version,
      })
    : null;
  if (!indexReady || !words) {
    // Without a complete index, "no shared passage" would mean nothing.
    await ctx.runMutation(internal.kohopOriginality.recordPlatform, {
      contributionId,
      version,
      status: 'failed',
      matches: [],
      stages: [
        {
          stage: 'words',
          status: 'failed',
          error: indexReady ? 'NOT_FOUND' : 'INDEX_INCOMPLETE',
        },
      ],
      share: 0,
    });
    return;
  }

  const semantic = await semanticStage(ctx, {
    chunks: words.chunks,
    groupId: words.groupId,
    lang: words.lang,
    wordPassages: words.wordPassages,
    authorUserId: words.authorUserId,
    citedGroups: words.citedGroups,
  });
  const matches = [...words.matches, ...semantic.matches];
  const facts = [...words.facts, ...semantic.facts];
  const ai = await confirmationStage(ctx, {
    matches,
    facts,
    lang: words.lang,
    selfReuseDeclared: words.selfReuseDeclared,
  });
  await ctx.runMutation(internal.kohopOriginality.recordPlatform, {
    contributionId,
    version,
    status: 'done',
    matches,
    stages: [
      { stage: 'words', status: 'done' },
      { stage: 'semantic', ...semantic.result },
      { stage: 'ai', ...ai },
    ],
    share: words.share,
  });
}

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
    matches: v.array(kohopMatch),
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
    await runPlatformCheck(ctx, contributionId, version);
    const text = await ctx.runQuery(internal.kohopOriginality.platformText, {
      contributionId,
      version,
    });
    if (text === null) return null;
    let result;
    try {
      result = await runExternalCheck(toPlainText(text.body), text.lang);
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
      // A finished check can still carry named gaps (a source that failed): the
      // review chief reads them next to the matches.
      error:
        result.status === 'done'
          ? result.warnings?.length
            ? result.warnings.join(',')
            : undefined
          : result.error,
      matches:
        result.status === 'done'
          ? result.matches.map((m) => ({ ...m, method: 'external' as const }))
          : [],
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
