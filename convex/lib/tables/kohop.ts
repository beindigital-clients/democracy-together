import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import {
  kohopAccessMode,
  kohopDecisionKind,
  kohopEventKind,
  kohopField,
  kohopLang,
  kohopLinkType,
  kohopReasonCode,
  kohopRecommendation,
  kohopStage,
  kohopVersionKind,
  KOHOP_LINK_LEVELS,
  KOHOP_MATCH_CLASSES,
  KOHOP_ORIGINALITY_SCOPES,
  KOHOP_ORIGINALITY_STATUSES,
  KOHOP_RECUSAL_REASONS,
  KOHOP_REVIEWER_SLOTS,
  KOHOP_REVIEWER_SOURCES,
  KOHOP_REVIEWER_STATUSES,
} from '../kohop';

// KOHOP — its OWN tables (plan § 4.1). No existing mutation (library, F-43,
// Tribune, AI moderation) knows them: a KOHOP contribution can only be changed
// or published by the functions of `convex/kohop*.ts`, which go through the
// state machine in `convex/lib/kohop.ts`.

const literals = <T extends string>(values: readonly T[]) =>
  v.union(...values.map((x) => v.literal(x)));

const linkLevel = literals(KOHOP_LINK_LEVELS);

export const kohopCoAuthor = v.object({
  name: v.string(),
  affiliation: v.string(),
  email: v.optional(v.string()),
});

export const kohopLink = v.object({
  label: v.string(),
  // An `https` URL, or a published library document.
  url: v.optional(v.string()),
  publicationId: v.optional(v.id('publications')),
});

export const kohopFinding = v.object({
  type: kohopLinkType,
  detail: v.string(),
  source: v.optional(v.string()),
  url: v.optional(v.string()),
});

export const kohopTables = {
  // THE FILE — one row per contribution.
  kohopContributions: defineTable({
    stage: kohopStage,
    authorUserId: v.id('users'),
    organizationId: v.optional(v.id('organizations')),
    lang: kohopLang,
    fields: v.array(kohopField),
    keywords: v.array(v.string()),
    coAuthors: v.array(kohopCoAuthor),
    // Version counters: the newest version, the one the reviewers read, the
    // one the review chief accepted.
    currentVersion: v.number(),
    // The newest version already sent to the review chief: frozen, never
    // rewritten (editing after it creates the next version).
    submittedVersion: v.optional(v.number()),
    reviewedVersion: v.optional(v.number()),
    acceptedVersion: v.optional(v.number()),
    // Copy of the latest version's title, for lists.
    title: v.string(),
    // Set when the author's ACCOUNT is deleted: the printed author line of a
    // published text stays (D-14), the link to the account does not.
    authorSnapshot: v.optional(
      v.object({
        name: v.string(),
        organizationName: v.optional(v.string()),
        organizationSlug: v.optional(v.string()),
      }),
    ),
    // Fixed at acceptance.
    slug: v.optional(v.string()),
    handlingEditorId: v.optional(v.id('users')),
    // Deadlines. Set only while something is awaited, so the by_stage_and_*
    // indexes only hold what must be watched.
    returnedDueAt: v.optional(v.number()),
    revisionDueAt: v.optional(v.number()),
    revisionExtendedAt: v.optional(v.number()),
    // Reminders sent to the author for the current revision deadline.
    revisionReminders: v.optional(v.number()),
    proofReminders: v.optional(v.number()),
    proofDueAt: v.optional(v.number()),
    scheduledFor: v.optional(v.number()),
    scheduledFunctionId: v.optional(v.id('_scheduled_functions')),
    // Dates.
    submittedAt: v.optional(v.number()),
    decidedAt: v.optional(v.number()),
    publishedAt: v.optional(v.number()),
    retractedAt: v.optional(v.number()),
    // Commitments made at submission (D-8, D-16).
    charterVersion: v.optional(v.string()),
    charterAcceptedAt: v.optional(v.number()),
    licence: v.string(),
    originalityDeclaredAt: v.optional(v.number()),
    originalityDeclaration: v.optional(v.string()),
    priorWorks: v.array(v.string()),
    // Retraction after publication: the page stays online with a notice.
    retraction: v.optional(
      v.object({ reason: v.string(), notice: v.string(), at: v.number() }),
    ),
    // Folded search text of a PUBLISHED contribution (global search).
    searchText: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_author', ['authorUserId'])
    .index('by_stage', ['stage'])
    .index('by_slug', ['slug'])
    .index('by_stage_and_publishedAt', ['stage', 'publishedAt'])
    .index('by_stage_and_revisionDueAt', ['stage', 'revisionDueAt'])
    .index('by_stage_and_proofDueAt', ['stage', 'proofDueAt'])
    .index('by_stage_and_returnedDueAt', ['stage', 'returnedDueAt'])
    .searchIndex('search_text', {
      searchField: 'searchText',
      filterFields: ['stage', 'lang'],
    }),

  // VERSIONS — never rewritten: a change creates a new one.
  kohopVersions: defineTable({
    contributionId: v.id('kohopContributions'),
    version: v.number(),
    kind: kohopVersionKind,
    title: v.string(),
    standfirst: v.string(),
    // Constrained Markdown (convex/lib/kohopText.ts).
    body: v.string(),
    links: v.array(kohopLink),
    wordCount: v.number(),
    // Published with the analyses (D-9). Only on a revision.
    responseToReviewers: v.optional(v.string()),
    createdBy: v.id('users'),
    createdAt: v.number(),
  }).index('by_contribution_and_version', ['contributionId', 'version']),

  // THE REVIEWER — from designation to analysis.
  kohopReviewers: defineTable({
    contributionId: v.id('kohopContributions'),
    slot: literals(KOHOP_REVIEWER_SLOTS),
    source: literals(KOHOP_REVIEWER_SOURCES),
    name: v.string(),
    // Normalized (lowercase, trimmed). Never shown to the public.
    email: v.optional(v.string()),
    affiliation: v.optional(v.string()),
    publicUrl: v.optional(v.string()),
    rationale: v.optional(v.string()),
    // What the author declared about their relationship (private).
    declaredRelationship: v.optional(v.string()),
    // The account, once linked (a directory member, or the account created on
    // acceptance of an external invitation).
    userId: v.optional(v.id('users')),
    status: literals(KOHOP_REVIEWER_STATUSES),
    // Link types found by the rules at designation (private).
    flags: v.array(kohopLinkType),
    recusal: v.optional(
      v.object({
        reason: literals(KOHOP_RECUSAL_REASONS),
        note: v.optional(v.string()),
        by: v.id('users'),
        at: v.number(),
      }),
    ),
    // External invitation: only the SHA-256 of a 256-bit token is stored.
    inviteTokenHash: v.optional(v.string()),
    inviteTokenExpiresAt: v.optional(v.number()),
    invitedAt: v.optional(v.number()),
    respondedAt: v.optional(v.number()),
    // Set ONLY while a reply or an analysis is awaited.
    dueAt: v.optional(v.number()),
    remindersSent: v.number(),
    // Declined: who the reviewer suggests instead.
    suggestedInstead: v.optional(
      v.object({
        name: v.string(),
        email: v.optional(v.string()),
        note: v.optional(v.string()),
      }),
    ),
    conflict: v.optional(
      v.object({
        hasConflict: v.boolean(),
        details: v.optional(v.string()),
        declaredAt: v.number(),
      }),
    ),
    publicationConsentAt: v.optional(v.number()),
    publicationConsentVersion: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_contribution', ['contributionId'])
    .index('by_email', ['email'])
    .index('by_user', ['userId'])
    .index('by_dueAt', ['dueAt'])
    .index('by_tokenHash', ['inviteTokenHash'])
    .index('by_source_and_status', ['source', 'status']),

  // THE ANALYSIS — one per reviewer, editable until the decision.
  kohopReviews: defineTable({
    contributionId: v.id('kohopContributions'),
    reviewerId: v.id('kohopReviewers'),
    // The version evaluated.
    version: v.number(),
    recommendation: kohopRecommendation,
    // Public.
    analysis: v.string(),
    // NEVER public.
    noteToEditor: v.optional(v.string()),
    // Frozen: this is what will be published.
    displayName: v.string(),
    affiliation: v.optional(v.string()),
    submittedAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_contribution', ['contributionId'])
    .index('by_reviewer', ['reviewerId']),

  // DECISIONS — one row each, never rewritten.
  kohopDecisions: defineTable({
    contributionId: v.id('kohopContributions'),
    version: v.number(),
    kind: kohopDecisionKind,
    reasonCode: v.optional(kohopReasonCode),
    reason: v.string(),
    positiveReviews: v.number(),
    againstPresumption: v.boolean(),
    // Acceptance without an external originality check (audited).
    withoutExternalCheck: v.optional(v.boolean()),
    decidedBy: v.id('users'),
    createdAt: v.number(),
  }).index('by_contribution', ['contributionId']),

  // HISTORY — one fact per line. Dates are shown publicly as the review path.
  kohopEvents: defineTable({
    contributionId: v.id('kohopContributions'),
    kind: kohopEventKind,
    actorId: v.optional(v.id('users')),
    at: v.number(),
    metadata: v.optional(v.any()),
  }).index('by_contribution', ['contributionId']),

  // LINKS between an author and a reviewer — review chief only.
  kohopLinkChecks: defineTable({
    contributionId: v.id('kohopContributions'),
    reviewerId: v.id('kohopReviewers'),
    level: linkLevel,
    findings: v.array(kohopFinding),
    origin: v.union(v.literal('rules'), v.literal('ai'), v.literal('external')),
    model: v.optional(v.string()),
    // The check failed (gateway down, cap reached): NOT "nothing to report".
    failed: v.optional(v.boolean()),
    error: v.optional(v.string()),
    checkedAt: v.number(),
  })
    .index('by_reviewer', ['reviewerId'])
    .index('by_contribution', ['contributionId']),

  // AI SUGGESTIONS of reviewers — history kept. The AI proposes, never designates.
  kohopSuggestions: defineTable({
    contributionId: v.id('kohopContributions'),
    candidates: v.array(
      v.object({
        userId: v.id('users'),
        name: v.string(),
        reasons: v.array(v.string()),
        level: linkLevel,
        findings: v.array(kohopFinding),
      }),
    ),
    model: v.optional(v.string()),
    createdAt: v.number(),
  }).index('by_contribution', ['contributionId']),

  // ORIGINALITY REPORTS — never published.
  originalityReports: defineTable({
    contributionId: v.id('kohopContributions'),
    version: v.number(),
    scope: literals(KOHOP_ORIGINALITY_SCOPES),
    status: literals(KOHOP_ORIGINALITY_STATUSES),
    matches: v.array(
      v.object({
        sourceType: v.string(),
        sourceId: v.optional(v.string()),
        sourceTitle: v.string(),
        sourceUrl: v.optional(v.string()),
        passage: v.string(),
        sourcePassage: v.optional(v.string()),
        lang: v.optional(v.string()),
        similarity: v.optional(v.number()),
        classification: v.optional(literals(KOHOP_MATCH_CLASSES)),
      }),
    ),
    summary: v.optional(v.string()),
    provider: v.optional(v.string()),
    model: v.optional(v.string()),
    error: v.optional(v.string()),
    checkedAt: v.number(),
    // "I accept without an external check" (audited).
    acknowledgedBy: v.optional(v.id('users')),
    acknowledgedAt: v.optional(v.number()),
  }).index('by_contribution_and_version', ['contributionId', 'version']),

  // SETTINGS — pilot access (D-15): submissions reserved to chosen
  // organizations, or open to every member.
  kohopSettings: defineTable({
    key: v.string(),
    access: kohopAccessMode,
    pilotOrganizations: v.array(v.id('organizations')),
    updatedBy: v.optional(v.id('users')),
    updatedAt: v.number(),
  }).index('by_key', ['key']),
};
