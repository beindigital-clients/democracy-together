import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import { locale } from '../locales';
import {
  availabilityValidator,
  callApplicationStatusValidator,
  levelValidator,
  mentorRoleValidator,
  pairStatusValidator,
  resourceKindValidator,
  youthApplicationStatusValidator,
  youthProgrammeValidator,
} from '../programmes';

// Tables du chantier « programmes » (F-56 à F-60). Toutes les listes portées
// par un document sont BORNÉES à l'écriture (thèmes, langues, critères, pièces
// demandées : quelques unités) ; ce qui croît sans limite — séances, jalons,
// candidatures, évaluations, étapes — a sa propre table.
export const programmesTables = {
  // --- F-58 Programme Jeunes ------------------------------------------------
  // Profil PERSISTANT d'un jeune, lié à son compte : saisi une fois, réutilisé
  // par chaque candidature (plus de ressaisie du nom, du pays, des thèmes).
  youthProfiles: defineTable({
    userId: v.id('users'),
    displayName: v.string(),
    // Parcours : études, engagement, expérience — texte libre borné.
    background: v.string(),
    country: v.string(),
    languages: v.array(locale),
    interests: v.array(v.string()),
    availability: availabilityValidator,
    // Consentements explicites, horodatés. Le traitement est obligatoire
    // (sans lui, pas de profil) ; le contact par les partenaires est un choix.
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

  // --- F-59 Mentorat --------------------------------------------------------
  // Un compte peut tenir DEUX profils (mentor et mentoré), un par rôle.
  mentorProfiles: defineTable({
    userId: v.id('users'),
    role: mentorRoleValidator,
    displayName: v.string(),
    themes: v.array(v.string()),
    languages: v.array(locale),
    region: v.string(),
    // Décalage horaire en heures (−12 à +14) : départage deux régions
    // différentes mais voisines en heure.
    utcOffset: v.optional(v.number()),
    availability: availabilityValidator,
    goals: v.string(),
    // Mentor : nombre de binômes simultanés qu'il accepte.
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
    // Score et raisons FIGÉS à la proposition : ce que le coordinateur a vu
    // en décidant, même si les profils changent ensuite.
    score: v.number(),
    scoreReasons: v.any(),
    // Coordinateur qui a confirmé l'appariement (optionnel : effacé si son
    // compte est supprimé, le binôme lui survit).
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

  // Journal des séances : notes PRIVÉES au binôme (le coordinateur voit la
  // date et la durée, jamais les notes).
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

  // --- F-60 Appels à projets -------------------------------------------------
  projectCalls: defineTable({
    slug: v.string(),
    title: v.string(),
    summary: v.string(),
    // Instants UTC ; `timeZone` (IANA) sert à les afficher tels que l'appel
    // les annonce (« clôture le 30 novembre à 18 h, heure de Dakar »).
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
    // Les décisions ont été notifiées : l'appel est archivé comme « clos ».
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
  })
    .index('by_call_and_user', ['callId', 'userId'])
    .index('by_call_and_status', ['callId', 'status'])
    .index('by_user', ['userId']),

  projectCallAttachments: defineTable({
    applicationId: v.id('projectCallApplications'),
    docKey: v.string(),
    storageId: v.id('_storage'),
    fileName: v.string(),
    // Type RECONNU au contenu (octets de tête), pas celui annoncé.
    contentType: v.string(),
    size: v.number(),
    uploadedAt: v.number(),
  }).index('by_application', ['applicationId']),

  projectEvaluations: defineTable({
    applicationId: v.id('projectCallApplications'),
    callId: v.id('projectCalls'),
    evaluatorId: v.id('users'),
    // Conflit d'intérêts DÉCLARÉ : la grille est vide et l'évaluateur est
    // exclu du classement de cette candidature.
    conflict: v.boolean(),
    scores: v.array(v.object({ criterionKey: v.string(), score: v.number() })),
    comment: v.optional(v.string()),
    submittedAt: v.number(),
  })
    .index('by_application', ['applicationId'])
    .index('by_call', ['callId'])
    .index('by_evaluator', ['evaluatorId']),

  // --- F-56 / F-57 Boîte à outils et parcours ------------------------------
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

  // Étape d'un parcours : une ressource de la boîte à outils, OU une adresse
  // (un replay géré par le chantier « contenus », une page externe). Le
  // parcours ne duplique pas ce qu'il référence.
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
