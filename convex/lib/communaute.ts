import { v } from 'convex/values';

// "COMMUNAUTÉ" WORKSTREAM — PURE rules shared by the Convex modules
// (convex/workspaces.ts, convex/workspaceFiles.ts, convex/tribune.ts,
// convex/communityModeration.ts), by the schema and by the unit tests.
// No database reads here: what is decided without `ctx` is tested without
// `convex-test`, and cannot diverge between two modules.

// --- Collaborative workspaces (F-24) ----------------------------------------

// Roles WITHIN a workspace. Three ranks, from broadest to most restricted:
//   animateur    manages the workspace (invitations, roles, removal, everyone's files);
//   contributeur writes (notes, files);
//   lecteur      reads (notes, files), writes nothing.
// `owner` and `member` are the two values from increment 1, still present
// in the database: they are equivalent to animateur and contributeur respectively.
// We don't rewrite them (no migration to run); `effectiveWorkspaceRole` reads them.
export const WORKSPACE_ROLES = [
  'animateur',
  'contributeur',
  'lecteur',
] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const workspaceRoleValidator = v.union(
  v.literal('animateur'),
  v.literal('contributeur'),
  v.literal('lecteur'),
);

// STORED values (legacy included) — what the schema accepts.
export const storedWorkspaceRoleValidator = v.union(
  v.literal('owner'),
  v.literal('member'),
  v.literal('animateur'),
  v.literal('contributeur'),
  v.literal('lecteur'),
);
export type StoredWorkspaceRole =
  'owner' | 'member' | 'animateur' | 'contributeur' | 'lecteur';

export function effectiveWorkspaceRole(
  stored: StoredWorkspaceRole,
): WorkspaceRole {
  if (stored === 'owner') return 'animateur';
  if (stored === 'member') return 'contributeur';
  return stored;
}

const WORKSPACE_RANK: Record<WorkspaceRole, number> = {
  lecteur: 0,
  contributeur: 1,
  animateur: 2,
};

export function workspaceRoleAtLeast(
  role: WorkspaceRole | null,
  min: WorkspaceRole,
): boolean {
  return role !== null && WORKSPACE_RANK[role] >= WORKSPACE_RANK[min];
}

// OPEN workspace: every network member sees it and can join it.
// PRIVATE workspace: invisible outside its members (and its invitees), it can
// only be entered by invitation. A workspace from increment 1 lacks the field: it
// was open, it stays open.
export const workspaceVisibilityValidator = v.union(
  v.literal('open'),
  v.literal('private'),
);
export type WorkspaceVisibility = 'open' | 'private';

export function effectiveVisibility(
  stored: WorkspaceVisibility | undefined,
): WorkspaceVisibility {
  return stored ?? 'open';
}

// Invitations: validity period. Two weeks — long enough for a rarely
// connected member to see it, short enough that a forgotten invitation does not
// remain an open door indefinitely.
export const INVITATION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export const invitationStatusValidator = v.union(
  v.literal('pending'),
  v.literal('accepted'),
  v.literal('declined'),
  v.literal('revoked'),
);

// A `pending` invitation whose deadline has passed is EXPIRED. The status
// is not rewritten (a query does not read the clock, a mutation that throws
// cannot write anything): expiration is computed, at the time it is used.
export function isInvitationExpired(expiresAt: number, now: number): boolean {
  return now >= expiresAt;
}

// Shared files: bounds. The quota is PER WORKSPACE and counts all the
// kept versions — a replaced version still occupies storage.
export const WORKSPACE_FILE_LIMITS = {
  maxFileBytes: 20 * 1024 * 1024,
  quotaBytes: 200 * 1024 * 1024,
  maxFiles: 200,
  maxVersionsPerFile: 30,
  nameMaxLength: 160,
} as const;

// --- Tribune: moderation (F-45, F-49) ---------------------------------------

// Moderation mode. A PRIORI: submitted content awaits a moderator's
// decision, invisible to the public. A POSTERIORI: it appears immediately, and
// moderation acts on reports (behavior prior to the workstream).
export const moderationModeValidator = v.union(
  v.literal('a_priori'),
  v.literal('a_posteriori'),
);
export type ModerationMode = 'a_priori' | 'a_posteriori';

// Default settings, when the administrator has never opened the panel.
// Posts: A PRIORI, which is what the backlog asks for (F-45: "validation par
// un groupe de modérateurs avant publication"). Comments: A POSTERIORI —
// F-45 talks about publication, F-47 about reactions and debate; holding every
// reply in a queue would kill the conversation. The administrator can switch
// either one.
export const DEFAULT_COMMUNITY_MODERATION = {
  postMode: 'a_priori' as ModerationMode,
  commentMode: 'a_posteriori' as ModerationMode,
};

export const contentStatusValidator = v.union(
  v.literal('pending'),
  v.literal('published'),
  v.literal('rejected'),
  v.literal('removed'),
);
export type ContentStatus = 'pending' | 'published' | 'rejected' | 'removed';

export type ModerationDecision = 'approve' | 'reject' | 'remove';

// State machine of a Tribune item. Every human decision goes
// through here; a refused transition is an error (`INVALID_TRANSITION`),
// never a silent no-op.
//   approve : pending -> published; or REVISION of a negative decision
//             (rejected/removed -> published) — a moderator can go back on
//             a rejection, and the history shows it.
//   reject  : pending -> rejected (with reason).
//   remove  : published -> removed (with reason) — removal after publication.
export function nextStatus(
  from: ContentStatus,
  decision: ModerationDecision,
): ContentStatus | null {
  switch (decision) {
    case 'approve':
      return from === 'published' ? null : 'published';
    case 'reject':
      return from === 'pending' ? 'rejected' : null;
    case 'remove':
      return from === 'published' ? 'removed' : null;
  }
}

// Reason for a negative decision: it is shown to the author, so it must
// exist and remain readable.
export const MODERATION_REASON = { min: 3, max: 1000 } as const;

// Scope of AI auto-acceptance. The /admin/moderation-ia panel sets
// a scope of TYPES eligible for automatic publication; the Tribune
// enters it as one more type, `tribune`, which the administrator must tick
// EXPLICITLY. Without that box, the AI only proposes: the decision
// stays human (F-45).
export const TRIBUNE_AI_SCOPE = 'tribune';

// Events in an item's history (F-49). One row per fact, never
// rewritten: that is what makes it possible to answer "who did what, when".
export const moderationEventKindValidator = v.union(
  v.literal('submitted'),
  v.literal('edited'),
  v.literal('ai_review'),
  v.literal('ai_published'),
  v.literal('approved'),
  v.literal('rejected'),
  v.literal('removed'),
  v.literal('reported'),
  v.literal('reports_dismissed'),
);
export type ModerationEventKind =
  | 'submitted'
  | 'edited'
  | 'ai_review'
  | 'ai_published'
  | 'approved'
  | 'rejected'
  | 'removed'
  | 'reported'
  | 'reports_dismissed';

export const moderationTargetValidator = v.union(
  v.literal('post'),
  v.literal('comment'),
);
export type ModerationTarget = 'post' | 'comment';

// Excerpt of a text for a list: bounded, and cut on a character boundary.
export function excerpt(text: string, max = 180): string {
  const t = text.trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}
