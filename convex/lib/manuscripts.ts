import { v } from 'convex/values';

// PEER REVIEW (F-43) — the manuscript's STATE MACHINE, its
// bounds and the computation of the metadata diff between two versions.
//
// PURE module (it only pulls in `convex/values`): the transition table is
// written ONCE, here, and every mutation that changes a manuscript's stage
// goes through `nextStage`. `convex/lib/manuscripts.test.ts` walks ALL
// (stage, event) pairs and checks that only those in the table pass.
//
// The stage lives in `publications.reviewStage` — the indexed field the
// editor's queue already read. Absent = the publication never entered review.
//
//   (none) ─submit─► submitted ─startReview─► in_review
//   submitted ─reject─► rejected                       (refusal without review)
//   in_review ─requestRevision─► revision ─resubmit─► resubmitted
//   in_review ─accept─► accepted      in_review ─reject─► rejected
//   resubmitted ─startReview─► in_review   (new round, new version)
//   resubmitted ─accept─► accepted         (minor revision, no new round)
//   resubmitted ─reject─► rejected
//   accepted, rejected: FINAL decisions — nothing leaves them.
//
// `reviewed` is the LEGACY stage from the module's first version ("review
// submitted", without an acceptance decision): reviews already closed that way
// can be decided (accept / reject) or go back to review, nothing
// else.
//
// Adding a reviewer to a review ALREADY under way is not a
// transition: the stage does not change (`canAddReviewer`).

export const MANUSCRIPT_STAGES = [
  'submitted',
  'in_review',
  'revision',
  'resubmitted',
  'accepted',
  'rejected',
  'reviewed',
] as const;
export type ManuscriptStage = (typeof MANUSCRIPT_STAGES)[number];
export type StageOrNone = ManuscriptStage | 'none';

export const manuscriptStage = v.union(
  v.literal('submitted'),
  v.literal('in_review'),
  v.literal('revision'),
  v.literal('resubmitted'),
  v.literal('accepted'),
  v.literal('rejected'),
  v.literal('reviewed'),
);

export const MANUSCRIPT_EVENTS = [
  'submit',
  'startReview',
  'requestRevision',
  'resubmit',
  'accept',
  'reject',
] as const;
export type ManuscriptEvent = (typeof MANUSCRIPT_EVENTS)[number];

export const MANUSCRIPT_MACHINE: Readonly<
  Record<
    StageOrNone,
    Readonly<Partial<Record<ManuscriptEvent, ManuscriptStage>>>
  >
> = {
  none: { submit: 'submitted' },
  submitted: { startReview: 'in_review', reject: 'rejected' },
  in_review: {
    requestRevision: 'revision',
    accept: 'accepted',
    reject: 'rejected',
  },
  revision: { resubmit: 'resubmitted' },
  resubmitted: {
    startReview: 'in_review',
    accept: 'accepted',
    reject: 'rejected',
  },
  reviewed: {
    startReview: 'in_review',
    accept: 'accepted',
    reject: 'rejected',
  },
  accepted: {},
  rejected: {},
};

/** Decided stages: leaving them would replay or reverse a decision. */
export const DECIDED_STAGES: readonly StageOrNone[] = ['accepted', 'rejected'];

/**
 * The target stage, or a NAMED error:
 *  - ALREADY_REVIEWED   : the manuscript is already accepted or rejected;
 *  - INVALID_TRANSITION : the source stage does not accept this event.
 * The `throw` rolls back the transaction: a refused transition writes nothing,
 * neither the document, nor the audit, nor the notification.
 */
export function nextStage(
  from: StageOrNone,
  event: ManuscriptEvent,
): ManuscriptStage {
  const to = MANUSCRIPT_MACHINE[from][event];
  if (to) return to;
  throw new Error(
    DECIDED_STAGES.includes(from) ? 'ALREADY_REVIEWED' : 'INVALID_TRANSITION',
  );
}

export function canTransition(
  from: StageOrNone,
  event: ManuscriptEvent,
): boolean {
  return MANUSCRIPT_MACHINE[from][event] !== undefined;
}

/**
 * Assigning a reviewer: on a review under way, it is an addition (no
 * transition); on a review that is AWAITING a review round, it is
 * `startReview`; on a publication that never entered review, `submit` then
 * `startReview` (the historical door: opening a review from the moderation
 * queue). Elsewhere, refused.
 */
export function stageAfterAssignment(from: StageOrNone): ManuscriptStage {
  if (from === 'in_review') return 'in_review';
  if (from === 'none')
    return nextStage(nextStage('none', 'submit'), 'startReview');
  return nextStage(from, 'startReview');
}

// Editorial decisions (with reasons) and their event.
export const manuscriptDecision = v.union(
  v.literal('revision'),
  v.literal('accepted'),
  v.literal('rejected'),
);
export type ManuscriptDecision = 'revision' | 'accepted' | 'rejected';
export const DECISION_EVENT: Record<ManuscriptDecision, ManuscriptEvent> = {
  revision: 'requestRevision',
  accepted: 'accept',
  rejected: 'reject',
};

// Anonymized copy of a version's file:
//  - pending    : anonymization is scheduled;
//  - clean      : the file carried no author metadata;
//  - stripped   : metadata was removed (cf. `strippedFields`);
//  - unreadable : the PDF could not be re-read (encrypted, corrupted) — NO
//                 file is passed to reviewers until the editor has
//                 checked and released it;
//  - released   : the editor has checked the original file and releases it;
//  - none       : the version has no file.
export const blindStatus = v.union(
  v.literal('pending'),
  v.literal('clean'),
  v.literal('stripped'),
  v.literal('unreadable'),
  v.literal('released'),
  v.literal('none'),
);
export type BlindStatus =
  'pending' | 'clean' | 'stripped' | 'unreadable' | 'released' | 'none';

export const MANUSCRIPT_BOUNDS = {
  title: { min: 4, max: 200 },
  abstract: { min: 20, max: 4000 },
  keywords: { max: 8, each: 60 },
  responseLetter: { min: 20, max: 8000 },
  reason: { min: 20, max: 4000 },
  comment: { min: 10, max: 8000 },
  commentToEditor: { max: 4000 },
  conflictDetails: { max: 1000 },
  // Review deadline: three weeks by default, between one day and
  // four months when the editor sets it.
  dueDefaultDays: 21,
  dueMinDays: 1,
  dueMaxDays: 120,
} as const;

const DAY = 24 * 60 * 60 * 1000;

/** Bounded deadline: default if absent, refused if out of bounds. */
export function resolveDueAt(now: number, dueAt: number | undefined): number {
  const B = MANUSCRIPT_BOUNDS;
  if (dueAt === undefined) return now + B.dueDefaultDays * DAY;
  if (
    !Number.isFinite(dueAt) ||
    dueAt < now + B.dueMinDays * DAY - DAY / 2 ||
    dueAt > now + B.dueMaxDays * DAY
  ) {
    throw new Error('INVALID_DUE_DATE');
  }
  return dueAt;
}

// Reminders: at the deadline, then every three days, three times at most;
// then the editor who assigned the reviewer is notified (once).
export const REMINDER = {
  intervalMs: 3 * DAY,
  max: 3,
  batch: 100,
} as const;

export type ManuscriptMeta = {
  title: string;
  abstract: string;
  keywords: string[];
  fileName?: string | null;
  hasFile: boolean;
};

export type MetadataDiff = {
  title: { from: string; to: string } | null;
  abstract: { from: string; to: string } | null;
  keywordsAdded: string[];
  keywordsRemoved: string[];
  fileReplaced: boolean;
};

/** What changed between two versions — what the reviewer sees first. */
export function metadataDiff(
  prev: ManuscriptMeta,
  next: ManuscriptMeta,
): MetadataDiff {
  const norm = (k: string) => k.trim().toLowerCase();
  const before = new Set(prev.keywords.map(norm));
  const after = new Set(next.keywords.map(norm));
  return {
    title:
      prev.title === next.title ? null : { from: prev.title, to: next.title },
    abstract:
      prev.abstract === next.abstract
        ? null
        : { from: prev.abstract, to: next.abstract },
    keywordsAdded: next.keywords.filter((k) => !before.has(norm(k))),
    keywordsRemoved: prev.keywords.filter((k) => !after.has(norm(k))),
    fileReplaced: next.hasFile,
  };
}

/** Cleaned-up keywords: no duplicates, bounded in number and length. */
export function normalizeKeywords(keywords: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of keywords) {
    const k = raw.trim().slice(0, MANUSCRIPT_BOUNDS.keywords.each);
    if (!k || seen.has(k.toLowerCase())) continue;
    seen.add(k.toLowerCase());
    out.push(k);
    if (out.length >= MANUSCRIPT_BOUNDS.keywords.max) break;
  }
  return out;
}

export function assertLength(
  text: string,
  bounds: { min?: number; max: number },
  code: string,
): string {
  const t = text.trim();
  if (t.length < (bounds.min ?? 0) || t.length > bounds.max) {
    throw new Error(code);
  }
  return t;
}

/**
 * Is the publication under an OPEN peer review — a stage is set and it is
 * neither `accepted` nor `rejected`?
 *
 * Such a publication is decided in the review (`peerReview.decideManuscript`),
 * never from the moderation queue: approving it there would publish a text the
 * reviewers are still reading (audit A-1, bypass of F-43).
 */
export function isInOpenPeerReview(
  stage: ManuscriptStage | null | undefined,
): boolean {
  return stage != null && stage !== 'accepted' && stage !== 'rejected';
}
