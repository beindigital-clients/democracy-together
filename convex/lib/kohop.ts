import { v } from 'convex/values';
import type { NetworkTheme } from './themes';

// KOHOP — vocabulary, state machine, bounds and decision rules.
//
// A PURE module (it only pulls in `convex/values` and a type): the server and
// the browser read the SAME table, like `roles.ts` and `manuscripts.ts`. Every
// mutation that changes a contribution's stage goes through `nextStage`;
// `convex/lib/kohop.test.ts` walks ALL (stage × event) pairs.
//
// Three rules the tests pin down:
//   1. nothing reaches `published` (or `scheduled`, or `production` = accepted)
//      without an event of the review chief or the administrator;
//   2. the system event `publishScheduled` is only accepted from `scheduled`;
//   3. a refused transition throws BEFORE any write: no document, no audit
//      line, no notification.
//
//   draft ─submit─► submitted ─startReview─► in_review ─reviewsComplete─► revision
//   submitted ─return─► returned ─submit─► submitted
//   submitted ─declareInadmissible─► refused
//   revision ─submitRevision | revisionExpired─► decision
//   decision ─accept─► production        decision ─refuse─► refused
//   production ─sendProof─► proof ─approveProof─► ready
//   proof ─requestCorrections─► production
//   production ─markReady─► ready                (text unchanged since acceptance)
//   ready ─publish─► published      ready ─schedule─► scheduled
//   scheduled ─unschedule─► ready   scheduled ─publishScheduled (system)─► published
//   published ─retract─► retracted
//   any stage before publication ─withdraw (author)─► withdrawn

// --- Stages ------------------------------------------------------------------

export const KOHOP_STAGES = [
  'draft',
  'submitted',
  'returned',
  'in_review',
  'revision',
  'decision',
  'production',
  'proof',
  'ready',
  'scheduled',
  'published',
  'refused',
  'withdrawn',
  'retracted',
] as const;
export type KohopStage = (typeof KOHOP_STAGES)[number];

export const kohopStage = v.union(...KOHOP_STAGES.map((s) => v.literal(s)));

/** Final stages: nothing leaves them. */
export const KOHOP_FINAL_STAGES: readonly KohopStage[] = [
  'refused',
  'withdrawn',
  'retracted',
];

/** Stages from which the author may still withdraw (before publication). */
export const KOHOP_WITHDRAWABLE_STAGES: readonly KohopStage[] = [
  'draft',
  'submitted',
  'returned',
  'in_review',
  'revision',
  'decision',
  'production',
  'proof',
  'ready',
  'scheduled',
];

/** Stages whose page is public: published, or withdrawn after publication. */
export const KOHOP_PUBLIC_STAGES: readonly KohopStage[] = [
  'published',
  'retracted',
];

// --- Events and who may trigger them ----------------------------------------

export type KohopActor = 'author' | 'chief' | 'system';

// The administrator counts as a review chief (`canValidatePublications`).
export const KOHOP_EVENT_ACTOR = {
  submit: 'author',
  return: 'chief',
  declareInadmissible: 'chief',
  startReview: 'chief',
  reviewsComplete: 'system',
  submitRevision: 'author',
  revisionExpired: 'system',
  accept: 'chief',
  refuse: 'chief',
  sendProof: 'chief',
  requestCorrections: 'author',
  approveProof: 'author',
  markReady: 'chief',
  schedule: 'chief',
  unschedule: 'chief',
  publish: 'chief',
  publishScheduled: 'system',
  retract: 'chief',
  withdraw: 'author',
} as const satisfies Record<string, KohopActor>;

export type KohopEvent = keyof typeof KOHOP_EVENT_ACTOR;
export const KOHOP_EVENTS = Object.keys(KOHOP_EVENT_ACTOR) as KohopEvent[];

type Machine = Readonly<
  Record<KohopStage, Readonly<Partial<Record<KohopEvent, KohopStage>>>>
>;

const WITHDRAW = { withdraw: 'withdrawn' } as const;

export const KOHOP_MACHINE: Machine = {
  draft: { submit: 'submitted', ...WITHDRAW },
  submitted: {
    return: 'returned',
    declareInadmissible: 'refused',
    startReview: 'in_review',
    ...WITHDRAW,
  },
  returned: { submit: 'submitted', ...WITHDRAW },
  in_review: { reviewsComplete: 'revision', ...WITHDRAW },
  revision: {
    submitRevision: 'decision',
    revisionExpired: 'decision',
    ...WITHDRAW,
  },
  decision: { accept: 'production', refuse: 'refused', ...WITHDRAW },
  production: { sendProof: 'proof', markReady: 'ready', ...WITHDRAW },
  proof: {
    approveProof: 'ready',
    requestCorrections: 'production',
    ...WITHDRAW,
  },
  ready: { publish: 'published', schedule: 'scheduled', ...WITHDRAW },
  scheduled: {
    unschedule: 'ready',
    publishScheduled: 'published',
    ...WITHDRAW,
  },
  published: { retract: 'retracted' },
  refused: {},
  withdrawn: {},
  retracted: {},
};

/**
 * The target stage, or a NAMED error:
 *  - ALREADY_FINAL      : the contribution is in a final stage;
 *  - INVALID_TRANSITION : the source stage does not accept this event.
 * The `throw` rolls the transaction back: a refused transition writes nothing.
 */
export function nextStage(from: KohopStage, event: KohopEvent): KohopStage {
  const to = KOHOP_MACHINE[from][event];
  if (to) return to;
  throw new Error(
    KOHOP_FINAL_STAGES.includes(from) ? 'ALREADY_FINAL' : 'INVALID_TRANSITION',
  );
}

export function canTransition(from: KohopStage, event: KohopEvent): boolean {
  return KOHOP_MACHINE[from][event] !== undefined;
}

/** Events available from a stage, for a given kind of actor. */
export function eventsFor(from: KohopStage, actor: KohopActor): KohopEvent[] {
  return (Object.keys(KOHOP_MACHINE[from]) as KohopEvent[]).filter(
    (event) => KOHOP_EVENT_ACTOR[event] === actor,
  );
}

/**
 * Is this actor allowed to trigger this event? A review chief (or an
 * administrator) triggers the `chief` events; the author the `author` events;
 * `system` events come from scheduled functions only.
 */
export function actorMayTrigger(actor: KohopActor, event: KohopEvent): boolean {
  return KOHOP_EVENT_ACTOR[event] === actor;
}

// --- Bounds and delays -------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;

export const KOHOP_BOUNDS = {
  words: { min: 500, max: 1000 },
  title: { min: 4, max: 160 },
  standfirst: { min: 100, max: 400 },
  keywords: { max: 8, each: 60 },
  links: { max: 10, label: 160, url: 500 },
  coAuthors: { max: 10, name: 120, affiliation: 200 },
  fields: { min: 1, max: 2 },
  reviewers: { titular: 2, substitute: 1 },
  suggestions: 5,
  analysisWords: { min: 150, max: 1500 },
  noteToEditor: { max: 2000 },
  responseWords: { max: 800 },
  reason: { min: 20, max: 4000 },
  recusalReason: { max: 1000 },
  declaredRelationship: { max: 1000 },
  originalityDeclaration: { max: 2000 },
  priorWorks: { max: 10, each: 300 },
} as const;

// Delays (D-10). Constants, easy to shorten for the pilot: a deployment can
// pass shorter values to the schedulers; nothing else reads a literal.
export const KOHOP_DELAYS_DAYS = {
  invitationReply: 5,
  analysis: 14,
  revision: 14,
  proof: 5,
  returned: 14,
  // One extension of the revision deadline, on the author's request.
  extension: 7,
} as const;

export const KOHOP_DELAYS_MS = {
  invitationReply: KOHOP_DELAYS_DAYS.invitationReply * DAY,
  analysis: KOHOP_DELAYS_DAYS.analysis * DAY,
  revision: KOHOP_DELAYS_DAYS.revision * DAY,
  proof: KOHOP_DELAYS_DAYS.proof * DAY,
  returned: KOHOP_DELAYS_DAYS.returned * DAY,
  extension: KOHOP_DELAYS_DAYS.extension * DAY,
} as const;

// A proof left unanswered after its 5 days is NOT approved by silence: the
// author may still approve, and the review chiefs are told it is overdue.
// Product decision left open — flip this constant to make silence consent.
export const KOHOP_PROOF_TACIT_APPROVAL = false;

// Scheduled publication: how far ahead a date may be set.
export const KOHOP_SCHEDULE = {
  minLeadMs: 60 * 1000,
  maxLeadMs: 365 * DAY,
} as const;

// Reminders: 3 days before the deadline, then on the day, then every 3 days,
// three reminders at most.
export const KOHOP_REMINDERS = {
  beforeDeadlineMs: 3 * DAY,
  intervalMs: 3 * DAY,
  max: 3,
  batch: 100,
} as const;

// The cohort windows used by the link checks.
export const KOHOP_LINK_WINDOWS = {
  crossReviewMonths: 12,
  coSignYears: 3,
  recurrenceMonths: 12,
  recurrenceMax: 2,
  externalYears: 5,
} as const;

// --- Opinions ---------------------------------------------------------------

export const KOHOP_RECOMMENDATIONS = [
  'favorable',
  'reserves',
  'defavorable',
] as const;
export type KohopRecommendation = (typeof KOHOP_RECOMMENDATIONS)[number];

export const kohopRecommendation = v.union(
  ...KOHOP_RECOMMENDATIONS.map((r) => v.literal(r)),
);

/** Favorable, and favorable with reservations, are positive (D-4). */
export function isPositive(recommendation: KohopRecommendation): boolean {
  return recommendation === 'favorable' || recommendation === 'reserves';
}

/**
 * Presumption of acceptance (K-07): at least two opinions, all positive. With
 * split opinions the review chief decides freely, with a reason.
 */
export function presumptionOfAcceptance(
  reviews: readonly { recommendation: KohopRecommendation }[],
): boolean {
  return (
    reviews.length >= KOHOP_BOUNDS.reviewers.titular &&
    reviews.every((r) => isPositive(r.recommendation))
  );
}

export function positiveCount(
  reviews: readonly { recommendation: KohopRecommendation }[],
): number {
  return reviews.filter((r) => isPositive(r.recommendation)).length;
}

// --- Reason codes -----------------------------------------------------------

export const KOHOP_REASON_CODES = [
  'outrance',
  'charte',
  'plagiat',
  'hors_champ',
  'hors_format',
  'autre',
] as const;
export type KohopReasonCode = (typeof KOHOP_REASON_CODES)[number];

export const kohopReasonCode = v.union(
  ...KOHOP_REASON_CODES.map((c) => v.literal(c)),
);

// Only these three allow refusing despite the presumption of acceptance:
// plagiarism is an infringement of the charter (D-16).
export const KOHOP_PRESUMPTION_BREAKING_CODES: readonly KohopReasonCode[] = [
  'outrance',
  'charte',
  'plagiat',
];

export function canRefuseAgainstPresumption(code: KohopReasonCode): boolean {
  return KOHOP_PRESUMPTION_BREAKING_CODES.includes(code);
}

/**
 * Validates a refusal. Throws a named error:
 *  - REASON_REQUIRED         : a refusal always carries a code and a reason;
 *  - PRESUMPTION_REASON      : against the presumption, only `outrance`,
 *                              `charte` or `plagiat` are accepted.
 * Returns whether the decision goes against the presumption.
 */
export function assertRefusal(input: {
  code: KohopReasonCode | undefined;
  reason: string;
  reviews: readonly { recommendation: KohopRecommendation }[];
}): { againstPresumption: boolean } {
  const reason = input.reason.trim();
  if (!input.code || reason.length < KOHOP_BOUNDS.reason.min) {
    throw new Error('REASON_REQUIRED');
  }
  const againstPresumption = presumptionOfAcceptance(input.reviews);
  if (againstPresumption && !canRefuseAgainstPresumption(input.code)) {
    throw new Error('PRESUMPTION_REASON');
  }
  return { againstPresumption };
}

// --- Reviewers ---------------------------------------------------------------

export const KOHOP_REVIEWER_SLOTS = ['titular', 'substitute'] as const;
export type KohopReviewerSlot = (typeof KOHOP_REVIEWER_SLOTS)[number];

export const KOHOP_REVIEWER_SOURCES = [
  'directory',
  'suggestion',
  'external',
] as const;
export type KohopReviewerSource = (typeof KOHOP_REVIEWER_SOURCES)[number];

export const KOHOP_REVIEWER_STATUSES = [
  'proposed',
  'approved',
  'recused',
  'invited',
  'accepted',
  'declined',
  'expired',
  'submitted',
] as const;
export type KohopReviewerStatus = (typeof KOHOP_REVIEWER_STATUSES)[number];

/** Statuses in which a reply or an analysis is still awaited (`dueAt` set). */
export const KOHOP_AWAITING_STATUSES: readonly KohopReviewerStatus[] = [
  'invited',
  'accepted',
];

/** Statuses that occupy a place (they count towards the two titulars). */
export const KOHOP_ACTIVE_REVIEWER_STATUSES: readonly KohopReviewerStatus[] = [
  'proposed',
  'approved',
  'invited',
  'accepted',
  'submitted',
];

export const KOHOP_RECUSAL_REASONS = [
  'coauthor',
  'same_institution',
  'personal_link',
  'insufficient_expertise',
  'identity_unverified',
  'other',
] as const;
export type KohopRecusalReason = (typeof KOHOP_RECUSAL_REASONS)[number];

/** The five criteria that guide a public analysis. */
export const KOHOP_CRITERIA = [
  'relevance',
  'originality',
  'rigour',
  'clarity',
  'usefulness',
] as const;

// --- Links between an author and a reviewer ----------------------------------

export const KOHOP_LINK_LEVELS = ['blocking', 'flagged', 'none'] as const;
export type KohopLinkLevel = (typeof KOHOP_LINK_LEVELS)[number];

/** The level a finding can carry ('none' is only the absence of findings). */
export type KohopFindingLevel = Exclude<KohopLinkLevel, 'none'>;

// Type of link -> level. Blocking links make the server refuse the
// designation; flagged ones are left to the review chief. The AI findings are
// FLAGGED AT MOST: the AI never blocks alone.
export const KOHOP_LINK_TYPES = {
  // Blocking — computed from the platform's data.
  self: 'blocking',
  coauthor: 'blocking',
  same_organization: 'blocking',
  mentoring: 'blocking',
  cross_review: 'blocking',
  recent_cosign: 'blocking',
  declared_relationship: 'blocking',
  // Flagged — rules.
  same_workspace: 'flagged',
  mutual_follow: 'flagged',
  organization_domain: 'flagged',
  recurrence: 'flagged',
  shared_library_author: 'flagged',
  public_mailbox: 'flagged',
  // Flagged — found outside the platform (AI, open scientific databases).
  external_cosign: 'flagged',
  external_affiliation: 'flagged',
} as const satisfies Record<string, KohopFindingLevel>;
export type KohopLinkType = keyof typeof KOHOP_LINK_TYPES;
export const KOHOP_LINK_TYPE_LIST = Object.keys(
  KOHOP_LINK_TYPES,
) as KohopLinkType[];

export const kohopLinkType = v.union(
  ...KOHOP_LINK_TYPE_LIST.map((t) => v.literal(t)),
);

/** Types an AI check may report (always flagged, never blocking). */
export const KOHOP_AI_LINK_TYPES: readonly KohopLinkType[] = [
  'external_cosign',
  'external_affiliation',
];

/** The level of a set of findings: blocking > flagged > none. */
export function levelOf(
  findings: readonly { type: KohopLinkType }[],
): KohopLinkLevel {
  let level: KohopLinkLevel = 'none';
  for (const finding of findings) {
    const l = KOHOP_LINK_TYPES[finding.type];
    if (l === 'blocking') return 'blocking';
    level = 'flagged';
  }
  return level;
}

// --- Thematic fields (D-6, open decision) ------------------------------------

// ONE vocabulary. Default: the ten fields of the brochure. A contribution
// carries one or two. `KOHOP_FIELD_THEME` maps a field to one of the five site
// axes when such a correspondence exists.
export const KOHOP_FIELDS = [
  'education',
  'health',
  'environment',
  'norms',
  'ai-role',
  'digital-governance',
  'science',
  'citizen-participation',
  'anti-corruption',
  'democratic-transitions',
] as const;
export type KohopField = (typeof KOHOP_FIELDS)[number];

export const kohopField = v.union(...KOHOP_FIELDS.map((f) => v.literal(f)));

export const KOHOP_FIELD_THEME: Readonly<
  Partial<Record<KohopField, NetworkTheme>>
> = {
  'digital-governance': 'gouvernance-numerique',
  'ai-role': 'gouvernance-numerique',
  'citizen-participation': 'participation',
  'anti-corruption': 'anti-corruption',
  'democratic-transitions': 'transitions',
};

export function isKohopField(value: string): value is KohopField {
  return (KOHOP_FIELDS as readonly string[]).includes(value);
}

/** Cleans a list of fields: known, deduplicated, one or two at most. */
export function normalizeFields(fields: readonly string[]): KohopField[] {
  const out: KohopField[] = [];
  for (const f of fields) {
    if (isKohopField(f) && !out.includes(f)) out.push(f);
  }
  return out.slice(0, KOHOP_BOUNDS.fields.max);
}

// --- Languages, licence, versions, access ------------------------------------

// Contributions are written in French or English; the interface and the
// e-mails are in the five site languages.
export const KOHOP_LANGS = ['fr', 'en'] as const;
export type KohopLang = (typeof KOHOP_LANGS)[number];
export const kohopLang = v.union(...KOHOP_LANGS.map((l) => v.literal(l)));

export const KOHOP_LICENCE = 'CC BY 4.0';

export const KOHOP_VERSION_KINDS = [
  'submission',
  'revision',
  'copyedit',
] as const;
export type KohopVersionKind = (typeof KOHOP_VERSION_KINDS)[number];
export const kohopVersionKind = v.union(
  ...KOHOP_VERSION_KINDS.map((k) => v.literal(k)),
);

export const KOHOP_DECISION_KINDS = [
  'returned',
  'inadmissible',
  'accepted',
  'refused',
  'retraction',
] as const;
export type KohopDecisionKind = (typeof KOHOP_DECISION_KINDS)[number];
export const kohopDecisionKind = v.union(
  ...KOHOP_DECISION_KINDS.map((k) => v.literal(k)),
);

export const KOHOP_ACCESS_MODES = ['pilot', 'open'] as const;
export type KohopAccessMode = (typeof KOHOP_ACCESS_MODES)[number];
export const kohopAccessMode = v.union(
  ...KOHOP_ACCESS_MODES.map((m) => v.literal(m)),
);
/** Default: submissions are reserved to the pilot organizations (D-15). */
export const KOHOP_DEFAULT_ACCESS: KohopAccessMode = 'pilot';

/** Charter and publication agreement versions: placeholders until validated. */
export const KOHOP_CHARTER_VERSION = '2026-10-draft';
export const KOHOP_REVIEWER_CONSENT_VERSION = '2026-10-draft';

// --- Originality ------------------------------------------------------------

export const KOHOP_MATCH_CLASSES = [
  'referenced_quote',
  'common_phrase',
  'declared_self_reuse',
  'borrowing',
] as const;
export type KohopMatchClass = (typeof KOHOP_MATCH_CLASSES)[number];

/** How a shared passage was found. */
export const KOHOP_MATCH_METHODS = ['words', 'semantic', 'external'] as const;
export type KohopMatchMethod = (typeof KOHOP_MATCH_METHODS)[number];

/**
 * What the AI says two passages are, once it has read them side by side. It
 * confirms or dismisses a candidate; it never decides anything.
 */
export const KOHOP_AI_VERDICTS = [
  'same_text',
  'translation',
  'paraphrase',
  'topic_only',
] as const;
export type KohopAiVerdict = (typeof KOHOP_AI_VERDICTS)[number];

/** The three stages of the platform check, each reported on its own. */
export const KOHOP_CHECK_STAGES = ['words', 'semantic', 'ai'] as const;
export type KohopCheckStage = (typeof KOHOP_CHECK_STAGES)[number];
export const KOHOP_STAGE_STATUSES = ['done', 'unavailable', 'failed'] as const;
export type KohopStageStatus = (typeof KOHOP_STAGE_STATUSES)[number];

/**
 * Stages whose contributions are part of the comparison base: what was
 * deposited and not refused or withdrawn.
 */
export const KOHOP_CORPUS_STAGES = [
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

/** Where an indexed source comes from. */
export const KOHOP_INDEX_KINDS = [
  'kohop',
  'publication',
  'document',
  'tribune',
] as const;
export type KohopIndexKind = (typeof KOHOP_INDEX_KINDS)[number];

export const KOHOP_ORIGINALITY_SCOPES = ['platform', 'external'] as const;
export const KOHOP_ORIGINALITY_STATUSES = [
  'pending',
  'done',
  'failed',
  'unavailable',
] as const;
export type KohopOriginalityStatus =
  (typeof KOHOP_ORIGINALITY_STATUSES)[number];

// --- Events (history) --------------------------------------------------------

/** Event kinds stored in `kohopEvents`, in one place so the journal stays closed. */
export const KOHOP_EVENT_KINDS = [
  ...KOHOP_EVENTS,
  'draft_created',
  'draft_saved',
  'reviewer_proposed',
  'reviewer_approved',
  'reviewer_recused',
  'reviewer_invited',
  'reviewer_accepted',
  'reviewer_declined',
  'reviewer_expired',
  'review_submitted',
  'revision_extended',
  'proof_sent',
  'copyedit_saved',
  'originality_checked',
  'link_checked',
] as const;
export type KohopEventKind = (typeof KOHOP_EVENT_KINDS)[number];
export const kohopEventKind = v.union(
  ...KOHOP_EVENT_KINDS.map((k) => v.literal(k)),
);

/** Kinds shown to the public as the dated path of the peer review. */
export const KOHOP_PUBLIC_EVENT_KINDS: readonly KohopEventKind[] = [
  'submit',
  'startReview',
  'review_submitted',
  'submitRevision',
  'revisionExpired',
  'accept',
  'publish',
  'publishScheduled',
];
