import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { locale } from '../locales';
import {
  availabilityValidator,
  callApplicationStatusValidator,
  callDecisionValidator,
  levelValidator,
  mentorRoleValidator,
  pairStatusValidator,
  resourceKindValidator,
  youthApplicationStatusValidator,
  youthProgrammeValidator,
} from '../programmes';

// Tables of the "programmes" workstream (F-56 to F-60). All lists carried by
// a document are BOUNDED on write (themes, languages, criteria, requested
// attachments: a handful); whatever grows without limit — sessions,
// milestones, applications, evaluations, steps — has its own table.
export const programmesTables = {
  // --- F-58 Youth Programme -------------------------------------------------
  // PERSISTENT profile of a young person, linked to their account: entered
  // once, reused by every application (no more re-entering name, country,
  // themes).
  youthProfiles: defineTable({
    userId: v.id('users'),
    displayName: v.string(),
    // Background: studies, involvement, experience — bounded free text.
    background: v.string(),
    country: v.string(),
    languages: v.array(locale),
    interests: v.array(v.string()),
    availability: availabilityValidator,
    // Explicit, timestamped consents. Processing is mandatory (without it, no
    // profile); contact by partners is a choice.
    consentProcessing: v.boolean(),
    consentPartnerContact: v.boolean(),
    consentedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_user', ['userId']),

  youthProgramApplications: defineTable({
    userId: v.id('users'),
    profileId: v.id('youthProfiles'),
    programme: youthProgrammeValidator,
    motivation: v.string(),
    status: youthApplicationStatusValidator,
    createdAt: v.number(),
    reviewedBy: v.optional(v.id('users')),
    reviewedAt: v.optional(v.number()),
    reviewNotes: v.optional(v.string()),
  })
    .index('by_user_and_programme', ['userId', 'programme'])
    .index('by_status', ['status']),

  // --- F-59 Mentoring -------------------------------------------------------
  // An account can hold TWO profiles (mentor and mentee), one per role.
  mentorProfiles: defineTable({
    userId: v.id('users'),
    role: mentorRoleValidator,
    displayName: v.string(),
    themes: v.array(v.string()),
    languages: v.array(locale),
    region: v.string(),
    // Time offset in hours (−12 to +14): breaks ties between two regions that are
    // different but close in time.
    utcOffset: v.optional(v.number()),
    availability: availabilityValidator,
    goals: v.string(),
    // Mentor: number of simultaneous pairs they accept.
    capacity: v.number(),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_user', ['userId'])
    .index('by_role_and_active', ['role', 'active']),

  mentorPairs: defineTable({
    mentorProfileId: v.id('mentorProfiles'),
    menteeProfileId: v.id('mentorProfiles'),
    mentorUserId: v.id('users'),
    menteeUserId: v.id('users'),
    status: pairStatusValidator,
    mentorAccepted: v.boolean(),
    menteeAccepted: v.boolean(),
    // Score and reasons FROZEN at proposal time: what the coordinator saw when
    // deciding, even if the profiles change afterwards.
    score: v.number(),
    scoreReasons: v.any(),
    // Coordinator who confirmed the match (optional: cleared if their account is
    // deleted, the pair outlives it).
    proposedBy: v.optional(v.id('users')),
    proposedAt: v.number(),
    startedAt: v.optional(v.number()),
    endedAt: v.optional(v.number()),
    goals: v.optional(v.string()),
    lastSessionAt: v.optional(v.number()),
    inactivityAlertAt: v.optional(v.number()),
    mentorReview: v.optional(v.string()),
    menteeReview: v.optional(v.string()),
  })
    .index('by_mentor_user', ['mentorUserId'])
    .index('by_mentee_user', ['menteeUserId'])
    .index('by_mentor_profile', ['mentorProfileId'])
    .index('by_mentee_profile', ['menteeProfileId'])
    .index('by_status', ['status']),

  // Session log: notes PRIVATE to the pair (the coordinator sees the date and
  // duration, never the notes).
  mentorSessions: defineTable({
    pairId: v.id('mentorPairs'),
    date: v.number(),
    durationMinutes: v.number(),
    notes: v.optional(v.string()),
    loggedBy: v.id('users'),
    createdAt: v.number(),
  }).index('by_pair_and_date', ['pairId', 'date']),

  mentorMilestones: defineTable({
    pairId: v.id('mentorPairs'),
    title: v.string(),
    dueDate: v.optional(v.number()),
    doneAt: v.optional(v.number()),
    createdBy: v.id('users'),
    createdAt: v.number(),
  }).index('by_pair', ['pairId']),

  // --- F-60 Calls for projects -----------------------------------------------
  projectCalls: defineTable({
    slug: v.string(),
    title: v.string(),
    summary: v.string(),
    // UTC instants; `timeZone` (IANA) is used to display them as the call
    // announces them ("closes on 30 November at 6 pm, Dakar time").
    opensAt: v.number(),
    closesAt: v.number(),
    timeZone: v.string(),
    fundAmount: v.number(),
    fundCurrency: v.string(),
    themes: v.array(v.string()),
    languages: v.array(locale),
    criteria: v.array(
      v.object({
        key: v.string(),
        label: v.string(),
        weight: v.number(),
      }),
    ),
    requiredDocuments: v.array(
      v.object({
        key: v.string(),
        label: v.string(),
        required: v.boolean(),
      }),
    ),
    status: v.union(v.literal('draft'), v.literal('published')),
    // The decisions have been notified: the call is archived as "closed".
    decisionsPublishedAt: v.optional(v.number()),
    createdBy: v.optional(v.id('users')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_slug', ['slug'])
    .index('by_status_and_closes', ['status', 'closesAt']),

  projectCallEvaluators: defineTable({
    callId: v.id('projectCalls'),
    userId: v.id('users'),
    assignedBy: v.optional(v.id('users')),
    createdAt: v.number(),
  })
    .index('by_call', ['callId'])
    .index('by_user', ['userId']),

  projectCallApplications: defineTable({
    callId: v.id('projectCalls'),
    userId: v.id('users'),
    applicantName: v.string(),
    title: v.string(),
    summary: v.string(),
    language: locale,
    status: callApplicationStatusValidator,
    createdAt: v.number(),
    submittedAt: v.optional(v.number()),
    decidedAt: v.optional(v.number()),
    decidedBy: v.optional(v.id('users')),
    decisionNote: v.optional(v.string()),
    // The last time a decision was put back under review
    // (`projectCalls.reopenCallApplication`), and which one: the ranking shows
    // it next to the application awaiting its new decision.
    reopenedAt: v.optional(v.number()),
    reopenedFrom: v.optional(callDecisionValidator),
  })
    .index('by_call_and_user', ['callId', 'userId'])
    .index('by_call_and_status', ['callId', 'status'])
    .index('by_user', ['userId']),

  projectCallAttachments: defineTable({
    applicationId: v.id('projectCallApplications'),
    docKey: v.string(),
    storageId: v.id('_storage'),
    fileName: v.string(),
    // Type RECOGNISED from the content (leading bytes), not the announced one.
    contentType: v.string(),
    size: v.number(),
    uploadedAt: v.number(),
  }).index('by_application', ['applicationId']),

  projectEvaluations: defineTable({
    applicationId: v.id('projectCallApplications'),
    callId: v.id('projectCalls'),
    evaluatorId: v.id('users'),
    // DECLARED conflict of interest: the grid is empty and the evaluator is
    // excluded from this application's ranking.
    conflict: v.boolean(),
    scores: v.array(v.object({ criterionKey: v.string(), score: v.number() })),
    comment: v.optional(v.string()),
    submittedAt: v.number(),
  })
    .index('by_application', ['applicationId'])
    .index('by_call', ['callId'])
    .index('by_evaluator', ['evaluatorId']),

  // --- F-56 / F-57 Toolbox and learning paths ------------------------------
  toolboxResources: defineTable({
    slug: v.string(),
    title: v.string(),
    summary: v.string(),
    kind: resourceKindValidator,
    themes: v.array(v.string()),
    language: locale,
    level: levelValidator,
    fileId: v.optional(v.id('_storage')),
    fileName: v.optional(v.string()),
    url: v.optional(v.string()),
    status: v.union(v.literal('draft'), v.literal('published')),
    createdBy: v.optional(v.id('users')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_slug', ['slug'])
    .index('by_status', ['status']),

  learningPaths: defineTable({
    slug: v.string(),
    title: v.string(),
    summary: v.string(),
    language: locale,
    level: levelValidator,
    themes: v.array(v.string()),
    status: v.union(v.literal('draft'), v.literal('published')),
    createdBy: v.optional(v.id('users')),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_slug', ['slug'])
    .index('by_status', ['status']),

  // Step of a learning path: a toolbox resource, OR an address (a replay
  // managed by the "contenus" workstream, an external page). The path does not
  // duplicate what it references.
  learningPathSteps: defineTable({
    pathId: v.id('learningPaths'),
    order: v.number(),
    title: v.string(),
    note: v.optional(v.string()),
    resourceId: v.optional(v.id('toolboxResources')),
    url: v.optional(v.string()),
  }).index('by_path_and_order', ['pathId', 'order']),

  learningEnrollments: defineTable({
    pathId: v.id('learningPaths'),
    userId: v.id('users'),
    enrolledAt: v.number(),
    completedAt: v.optional(v.number()),
    certificateCode: v.optional(v.string()),
  })
    .index('by_user', ['userId'])
    .index('by_path_and_user', ['pathId', 'userId']),

  learningProgress: defineTable({
    enrollmentId: v.id('learningEnrollments'),
    userId: v.id('users'),
    stepId: v.id('learningPathSteps'),
    completedAt: v.number(),
  })
    .index('by_enrollment', ['enrollmentId'])
    .index('by_user', ['userId']),
};
