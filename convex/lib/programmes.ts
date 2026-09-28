// "Programmes" workstream (F-56 to F-60) — vocabulary and PURE RULES.
//
// Everything that is decided without a database lives here: the mentoring
// match score, a call for projects' window, recognising an attachment's
// content, ranking applications, a pair's inactivity threshold. Mutations
// call them; `tests/unit/programmes-rules.test.ts` exercises them without
// Convex. Module with no server type: the interface imports it through the
// `@convex/lib/programmes` alias to display the same bounds the server
// enforces.

import { v } from 'convex/values';
import { REGIONS } from './directory';
import { NETWORK_THEMES } from './themes';
import { SITE_LOCALES } from './locales';
import { isHttpUrl } from './validation';

// --- Closed vocabularies ----------------------------------------------------

export { REGIONS as PROGRAMME_REGIONS, NETWORK_THEMES as PROGRAMME_THEMES };
export const PROGRAMME_LANGUAGES = SITE_LOCALES;

// Youth hub programmes a profile applies to (F-58). Mentoring is not among
// them: it has its own path (mentee profile, matching).
export const YOUTH_PROGRAMMES = [
  'hub',
  'bourses',
  'tribunes',
  'campagnes',
] as const;
export type YouthProgramme = (typeof YOUTH_PROGRAMMES)[number];

export const AVAILABILITIES = [
  'ponctuelle',
  'mensuelle',
  'hebdomadaire',
] as const;
export type Availability = (typeof AVAILABILITIES)[number];

export const RESOURCE_KINDS = [
  'guide',
  'fiche',
  'modele',
  'video',
  'lien',
] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const LEVELS = ['debutant', 'intermediaire', 'avance'] as const;
export type Level = (typeof LEVELS)[number];

export const youthProgrammeValidator = v.union(
  ...YOUTH_PROGRAMMES.map((x) => v.literal(x)),
);
export const availabilityValidator = v.union(
  ...AVAILABILITIES.map((x) => v.literal(x)),
);
export const resourceKindValidator = v.union(
  ...RESOURCE_KINDS.map((x) => v.literal(x)),
);
export const levelValidator = v.union(...LEVELS.map((x) => v.literal(x)));
export const regionValidator = v.union(...REGIONS.map((x) => v.literal(x)));
export const programmeThemeValidator = v.union(
  ...NETWORK_THEMES.map((x) => v.literal(x)),
);

export const mentorRoleValidator = v.union(
  v.literal('mentor'),
  v.literal('mentore'),
);
export type MentorRole = 'mentor' | 'mentore';

export const pairStatusValidator = v.union(
  // Proposed by the coordinator, awaiting the agreement of BOTH parties.
  v.literal('proposed'),
  v.literal('active'),
  v.literal('paused'),
  v.literal('ended'),
  // One of the parties declined the proposal: the pair never existed.
  v.literal('declined'),
);
export type PairStatus =
  'proposed' | 'active' | 'paused' | 'ended' | 'declined';

export const youthApplicationStatusValidator = v.union(
  v.literal('pending'),
  v.literal('approved'),
  v.literal('rejected'),
  v.literal('withdrawn'),
);

export const callApplicationStatusValidator = v.union(
  v.literal('draft'),
  v.literal('submitted'),
  v.literal('selected'),
  v.literal('waitlisted'),
  v.literal('rejected'),
  v.literal('withdrawn'),
);
export type CallApplicationStatus =
  'draft' | 'submitted' | 'selected' | 'waitlisted' | 'rejected' | 'withdrawn';

export const callDecisionValidator = v.union(
  v.literal('selected'),
  v.literal('waitlisted'),
  v.literal('rejected'),
);
export type CallDecision = 'selected' | 'waitlisted' | 'rejected';

// --- Field bounds -------------------------------------------------------------
// Shared with the forms (same import): counter, `maxLength` and server
// rejection read the same numbers.
export const PROGRAMME_LIMITS = {
  shortText: 160,
  text: 4000,
  background: 2000,
  goals: 2000,
  sessionNotes: 4000,
  review: 4000,
  maxThemes: NETWORK_THEMES.length,
  maxCriteria: 10,
  maxDocuments: 10,
  maxSteps: 40,
  // A session longer than eight hours is a data-entry error, not a session.
  maxSessionMinutes: 480,
  maxMentorCapacity: 5,
  maxScore: 5,
  maxFileBytes: 10 * 1024 * 1024,
} as const;

// Pair inactivity (F-59): beyond this delay without a logged session, the
// coordinator is alerted. Four weeks = one missed monthly meeting, the
// minimum pace the programme promises ("real follow-up").
export const INACTIVITY_WEEKS = 4;
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// --- Matching (F-59) -----------------------------------------------------------
//
// The score is a SUM OF REASONS: each component returns the points it
// contributes and what justifies them, so the coordinator reads why a mentor
// is suggested ("2 shared themes, French in common, same region, 1 of 2
// pairs") instead of an opaque number. Scale out of 100:
//
//   shared themes       15 per theme, capped at 45
//   shared language     25 (at least one)
//   region / timezone   15 same region, else 10 at ≤ 3 h apart, 5 at ≤ 6 h
//   mentor load         15 × remaining slots / capacity
//
// A mentor at full capacity is NOT suggested: suggesting them anyway would
// amount to asking the coordinator to redo the calculation by hand.
// Deterministic: no randomness, and ties are broken by identifier.

export type MatchProfile = {
  themes: readonly string[];
  languages: readonly string[];
  region: string;
  utcOffset?: number;
};

export type MatchReason =
  | { kind: 'themes'; points: number; values: string[] }
  | { kind: 'language'; points: number; values: string[] }
  | { kind: 'region'; points: number; values: string[] }
  | { kind: 'timezone'; points: number; hours: number }
  | { kind: 'load'; points: number; active: number; capacity: number };

export type MatchScore = {
  score: number;
  reasons: MatchReason[];
  eligible: boolean;
};

const intersect = (a: readonly string[], b: readonly string[]) =>
  [...new Set(a)].filter((x) => b.includes(x)).sort();

export function scoreMatch(
  mentee: MatchProfile,
  mentor: MatchProfile & { capacity: number; activePairs: number },
): MatchScore {
  const reasons: MatchReason[] = [];

  const themes = intersect(mentee.themes, mentor.themes);
  reasons.push({
    kind: 'themes',
    points: Math.min(45, themes.length * 15),
    values: themes,
  });

  const languages = intersect(mentee.languages, mentor.languages);
  reasons.push({
    kind: 'language',
    points: languages.length > 0 ? 25 : 0,
    values: languages,
  });

  if (mentee.region === mentor.region) {
    reasons.push({ kind: 'region', points: 15, values: [mentee.region] });
  } else if (
    typeof mentee.utcOffset === 'number' &&
    typeof mentor.utcOffset === 'number'
  ) {
    const hours = Math.abs(mentee.utcOffset - mentor.utcOffset);
    reasons.push({
      kind: 'timezone',
      points: hours <= 3 ? 10 : hours <= 6 ? 5 : 0,
      hours,
    });
  } else {
    reasons.push({ kind: 'region', points: 0, values: [] });
  }

  const capacity = Math.max(1, mentor.capacity);
  const free = Math.max(0, capacity - mentor.activePairs);
  reasons.push({
    kind: 'load',
    points: Math.round((15 * free) / capacity),
    active: mentor.activePairs,
    capacity,
  });

  return {
    score: reasons.reduce((sum, r) => sum + r.points, 0),
    reasons,
    eligible: free > 0,
  };
}

// Ranks mentor candidates. Tie -> ascending identifier: two calls with the
// same data return the same order.
export function rankMatches<T extends { id: string; score: MatchScore }>(
  candidates: readonly T[],
  limit = 5,
): T[] {
  return candidates
    .filter((c) => c.score.eligible)
    .sort((a, b) =>
      b.score.score !== a.score.score
        ? b.score.score - a.score.score
        : a.id < b.id
          ? -1
          : a.id > b.id
            ? 1
            : 0,
    )
    .slice(0, limit);
}

// --- Pair inactivity -------------------------------------------------------
// Reference = last session, failing that the start of the pair. An alert
// already raised in the same window is not repeated: the coordinator is
// notified once per inactivity period, not every night.
export function isPairInactive(
  pair: {
    status: PairStatus;
    startedAt?: number;
    lastSessionAt?: number;
    inactivityAlertAt?: number;
  },
  now: number,
  weeks = INACTIVITY_WEEKS,
): boolean {
  if (pair.status !== 'active') return false;
  const reference = pair.lastSessionAt ?? pair.startedAt;
  if (reference === undefined) return false;
  const threshold = weeks * WEEK_MS;
  if (now - reference < threshold) return false;
  if (
    pair.inactivityAlertAt !== undefined &&
    pair.inactivityAlertAt > reference
  ) {
    return now - pair.inactivityAlertAt >= threshold;
  }
  return true;
}

// --- Call for projects window (F-60) --------------------------------------
// The bounds are UTC instants; the call's timezone is only used to DISPLAY
// them. Opening included, closing excluded: at 23:59:59 the submission goes
// through, at the closing instant it is refused.
export type CallWindowState = 'upcoming' | 'open' | 'closed';

export function callWindowState(
  call: { opensAt: number; closesAt: number },
  now: number,
): CallWindowState {
  if (now < call.opensAt) return 'upcoming';
  if (now >= call.closesAt) return 'closed';
  return 'open';
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// --- Attachment content -----------------------------------------------------
// We trust neither the extension nor the type announced by the browser: we
// read the first bytes. Accepted formats: PDF, PNG, JPEG, and open or Office
// documents (ZIP container). An executable renamed to `.pdf` is refused here,
// before being referenced by an application.
export type SniffedType =
  'application/pdf' | 'image/png' | 'image/jpeg' | 'application/zip';

export function sniffFileType(bytes: Uint8Array): SniffedType | null {
  const starts = (sig: number[]) =>
    bytes.length >= sig.length && sig.every((b, i) => bytes[i] === b);
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return 'image/png';
  if (starts([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (starts([0x50, 0x4b, 0x03, 0x04])) return 'application/zip';
  return null;
}

// --- Evaluation and ranking (F-60) ------------------------------------------
export type Criterion = { key: string; label: string; weight: number };

// Weighted score of ONE evaluation, out of 100. An unscored criterion
// invalidates the grid: we do not rank on a half-filled evaluation.
export function weightedScore(
  criteria: readonly Criterion[],
  scores: readonly { criterionKey: string; score: number }[],
): number | null {
  let total = 0;
  let weights = 0;
  for (const c of criteria) {
    const s = scores.find((x) => x.criterionKey === c.key);
    if (!s) return null;
    total += s.score * c.weight;
    weights += c.weight;
  }
  if (weights === 0) return null;
  return Math.round((total / weights / PROGRAMME_LIMITS.maxScore) * 1000) / 10;
}

export type RankInput = {
  id: string;
  evaluations: { conflict: boolean; score: number | null }[];
};

// Ranking: average of ADMISSIBLE evaluations — an evaluator with a declared
// conflict of interest is excluded, so is an incomplete grid. An application
// without an admissible evaluation is ranked last, without a score.
export function rankApplications(inputs: readonly RankInput[]) {
  return inputs
    .map((a) => {
      const valid = a.evaluations
        .filter((e) => !e.conflict && e.score !== null)
        .map((e) => e.score as number);
      const average =
        valid.length > 0
          ? Math.round((valid.reduce((s, x) => s + x, 0) / valid.length) * 10) /
            10
          : null;
      return {
        id: a.id,
        average,
        evaluations: valid.length,
        excluded: a.evaluations.filter((e) => e.conflict).length,
      };
    })
    .sort((a, b) => {
      if (a.average === null && b.average === null) return a.id < b.id ? -1 : 1;
      if (a.average === null) return 1;
      if (b.average === null) return -1;
      return b.average !== a.average
        ? b.average - a.average
        : a.id < b.id
          ? -1
          : 1;
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

// Certificate code (F-57): readable, copyable, derived from the enrolment.
// Not a secret — it identifies the certificate, it does not authenticate it.
export function certificateCode(enrollmentId: string, completedAt: number) {
  let h = 2166136261;
  const input = `${enrollmentId}:${completedAt}`;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hex = (h >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return `DT-${hex.slice(0, 4)}-${hex.slice(4)}`;
}

// Cleans vocabulary lists received from the client: deduplicates, keeps only
// known values. An unknown value is an input error, not data to store.
export function cleanVocabulary(
  values: readonly string[],
  allowed: readonly string[],
): string[] | null {
  const unique = [...new Set(values.map((x) => x.trim()))];
  if (unique.some((x) => !allowed.includes(x))) return null;
  return unique;
}

// Address of a path step or a resource: absolute (http/https) or an internal
// site path (`/replays/…`), with no exotic scheme or `//host`.
export function isStepUrl(value: string): boolean {
  const s = value.trim();
  if (/^\/[A-Za-z0-9\-._~/%]*$/.test(s) && !s.startsWith('//')) return true;
  return isHttpUrl(s);
}

// --- Timezone "wall clock" time <-> UTC instant -----------------------------
// The back office enters the opening and closing as the call announces them
// ("30 November, 6 pm, Dakar time"). These two functions do the conversion
// with `Intl` alone, daylight saving included, with no dependency.
function partsInZone(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(ms);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  };
}

function offsetAt(ms: number, timeZone: string): number {
  const p = partsInZone(ms, timeZone);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return asUtc - Math.floor(ms / 1000) * 1000;
}

// "2026-11-30T18:00" in `timeZone` -> UTC instant (ms). `NaN` if unreadable.
export function zonedInputToUtc(value: string, timeZone: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return NaN;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let guess = wall - offsetAt(wall, timeZone);
  // Second pass: the offset can change on either side of a daylight saving
  // transition.
  guess = wall - offsetAt(guess, timeZone);
  return guess;
}

// UTC instant -> "2026-11-30T18:00" in `timeZone` (value of a
// `datetime-local` field).
export function utcToZonedInput(ms: number, timeZone: string): string {
  const p = partsInZone(ms, timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

export const CALL_TIME_ZONES = [
  'Africa/Abidjan',
  'Africa/Dakar',
  'Africa/Lagos',
  'Africa/Casablanca',
  'Africa/Cairo',
  'Africa/Nairobi',
  'Africa/Johannesburg',
  'Europe/Brussels',
  'Europe/Paris',
  'Europe/Lisbon',
  'Europe/Madrid',
  'UTC',
] as const;
