// Audit actions as constants (never an inline string at the call site).
export const AUDIT = {
  // Bootstrap of the initial administrator (convex/bootstrap.ts): distinct from
  // USER_ROLE_CHANGED, which assumes an acting administrator.
  ADMIN_BOOTSTRAPPED: 'admin.bootstrapped',
  USER_ROLE_CHANGED: 'user.role_changed',
  USER_INVITED: 'user.invited',
  CONTACT_HANDLED: 'contact.handled',
  ORGANIZATION_CREATED: 'organization.created',
  MEMBERSHIP_REVIEWED: 'membership.reviewed',
  // A moderator sending an approved member's sign-in invitation again.
  MEMBERSHIP_INVITATION_RESENT: 'membership.invitation_resent',
  PUBLICATION_SUBMITTED: 'publication.submitted',
  PUBLICATION_REVIEWED: 'publication.reviewed',
  TRIBUNE_MODERATED: 'tribune.moderated',
  YOUTH_REVIEWED: 'youth.reviewed',
  MENTORSHIP_REVIEWED: 'mentorship.reviewed',
  PROJECT_REVIEWED: 'project.reviewed',
  PEER_REVIEW: 'publication.peer_review',
  // Reopenings (issue #9): going back on a review is a
  // NAMED transition, hence a distinct audit action. Without it, the
  // log would show "… .reviewed" twice in a row and we would not know
  // which of the two passes reopened the file.
  PUBLICATION_REOPENED: 'publication.reopened',
  // A membership decision put back under review. From an approval, it also
  // takes back what the approval granted: its metadata says what.
  MEMBERSHIP_REOPENED: 'membership.reopened',
  YOUTH_REOPENED: 'youth.reopened',
  MENTORSHIP_REOPENED: 'mentorship.reopened',
  PROJECT_REOPENED: 'project.reopened',
  // AI-assisted moderation (convex/aiModeration.ts). Three DISTINCT
  // actions, and the distinction is not decorative: "analyzed" happens
  // on every submission, "published by the AI" is the only moment a
  // text goes live without a human having read it, and "sent back to the queue"
  // is the way back out of that moment. Merging them into one action
  // would make invisible, in the log, the only one that commits the association.
  PUBLICATION_AI_REVIEWED: 'publication.ai_reviewed',
  PUBLICATION_AI_PUBLISHED: 'publication.ai_published',
  PUBLICATION_AI_REVERTED: 'publication.ai_reverted',
  // System settings: who opened up auto-publication, and when.
  AI_MODERATION_CONFIGURED: 'aiModeration.configured',
  AI_MODERATION_RULE_CHANGED: 'aiModeration.rule_changed',
  // Private messaging ("social" workstream): decision on a reported message.
  // The metadata only carries the decision, never the message content.
  MESSAGE_REPORT_RESOLVED: 'message.report_resolved',
  // Payments (F-27 to F-31). Common `payment.` prefix: the Finances screen
  // filters the log on this word through the full-text index.
  PAYMENT_PLAN_CHANGED: 'payment.plan_changed',
  PAYMENT_PLANS_SEEDED: 'payment.plans_seeded',
  PAYMENT_REFUNDED: 'payment.refunded',
  PAYMENT_SUBSCRIPTION_CANCELLED: 'payment.subscription_cancelled',
  PAYMENT_EXPORTED: 'payment.exported',
  // Newsletter (diffusion workstream): sending a campaign commits
  // the association towards all its subscribers; so do retrying failures and
  // migrating legacy subscribers.
  NEWSLETTER_CAMPAIGN_SENT: 'newsletter.campaign_sent',
  NEWSLETTER_CAMPAIGN_RETRIED: 'newsletter.campaign_retried',
  NEWSLETTER_TEST_SENT: 'newsletter.test_sent',
  NEWSLETTER_LEGACY_MIGRATED: 'newsletter.legacy_migrated',
  // A priori moderation of the Tribune (community workstream, F-45/F-49). One
  // action per DECISION: "approved", "rejected", "removed" do not say the
  // same thing about the platform, and the log must be able to count them separately.
  TRIBUNE_APPROVED: 'tribune.approved',
  TRIBUNE_REJECTED: 'tribune.rejected',
  TRIBUNE_REMOVED: 'tribune.removed',
  TRIBUNE_REPORTS_DISMISSED: 'tribune.reports_dismissed',
  // Same reasons as for the library: the analysis is routine,
  // going live without human review is not.
  TRIBUNE_AI_REVIEWED: 'tribune.ai_reviewed',
  TRIBUNE_AI_PUBLISHED: 'tribune.ai_published',
  COMMUNITY_MODERATION_CONFIGURED: 'tribune.moderation_configured',
  // Collaborative workspaces: an animateur's actions ON OTHERS (removing
  // a member, deleting someone else's file). What a member does with
  // their own content is not a moderation action.
  WORKSPACE_MEMBER_REMOVED: 'workspace.member_removed',
  WORKSPACE_FILE_DELETED: 'workspace.file_deleted',
  // Editorial content ("contenus" workstream, F-62/F-64). One action per
  // GESTURE, and not a single "modified" action: publishing and unpublishing are
  // the only two moments when the public sees something change, the log
  // must show them as such. `targetId` carries the document identifier,
  // `metadata.kind` the content type (event, replay, partner, press, theme).
  CONTENT_CREATED: 'content.created',
  CONTENT_UPDATED: 'content.updated',
  CONTENT_PUBLISHED: 'content.published',
  CONTENT_UNPUBLISHED: 'content.unpublished',
  CONTENT_CANCELLED: 'content.cancelled',
  CONTENT_DELETED: 'content.deleted',
  CONTENT_REORDERED: 'content.reordered',
  // Import of the coded content (one-off migration, internal command).
  CONTENT_IMPORTED: 'content.imported',
  MEDIA_UPLOADED: 'media.uploaded',
  MEDIA_UPDATED: 'media.updated',
  MEDIA_DELETED: 'media.deleted',
  // CSV export of registrants: personal data leaves the system.
  EVENT_REGISTRATIONS_EXPORTED: 'event.registrations_exported',
  // Account lifecycle (accounts workstream, F-63). Suspension and
  // reactivation are two actions: the log must say which one happened,
  // and the REASON for the suspension is kept there.
  USER_CREATED: 'user.created',
  USER_SUSPENDED: 'user.suspended',
  USER_REACTIVATED: 'user.reactivated',
  USER_DELETION_STARTED: 'user.deletion_started',
  USER_DELETED: 'user.deleted',
  // Two-factor authentication. RESET by an administrator is
  // distinct from deactivation by the holder: it is the action that
  // allows taking over an account, it must read as such.
  TWO_FACTOR_ENABLED: 'twoFactor.enabled',
  TWO_FACTOR_DISABLED: 'twoFactor.disabled',
  TWO_FACTOR_RESET: 'twoFactor.reset',
  SECURITY_POLICY_CHANGED: 'security.policy_changed',
  // Organizations (F-21): affiliations and profile.
  ORG_MEMBER_ADDED: 'organization.member_added',
  ORG_MEMBER_REMOVED: 'organization.member_removed',
  ORG_MEMBER_ROLE_CHANGED: 'organization.member_role_changed',
  ORG_REVISION_SUBMITTED: 'organization.revision_submitted',
  ORG_REVISION_REVIEWED: 'organization.revision_reviewed',
  // "programmes" workstream (F-56 to F-60): every coordination, selection
  // or editing decision leaves its row, under an action that names it.
  YOUTH_PROGRAM_REVIEWED: 'youth.program_reviewed',
  MENTORING_PAIR_PROPOSED: 'mentoring.pair_proposed',
  MENTORING_PAIR_STATUS: 'mentoring.pair_status',
  PROJECT_CALL_SAVED: 'projectCall.saved',
  PROJECT_CALL_EVALUATORS: 'projectCall.evaluators',
  PROJECT_CALL_DECIDED: 'projectCall.decided',
  TOOLBOX_RESOURCE_SAVED: 'toolbox.resource_saved',
  TOOLBOX_PATH_SAVED: 'toolbox.path_saved',
  // Annual reports (F-41, editorial workstream). The migration of the coded
  // content has its own action: the log must show that an edition
  // moved from the coded source to the database, and by whom.
  REPORT_CREATED: 'report.created',
  REPORT_IMPORTED: 'report.imported',
  REPORT_UPDATED: 'report.updated',
  REPORT_PUBLISHED: 'report.published',
  REPORT_DELETED: 'report.deleted',
  // Peer-reviewed journal (F-43): each transition of the manuscript's
  // state machine is an entry — submission, revision, decision — and
  // releasing a non-anonymized file commits the editor who does it.
  MANUSCRIPT_SUBMITTED: 'manuscript.submitted',
  MANUSCRIPT_REVISED: 'manuscript.revised',
  MANUSCRIPT_DECIDED: 'manuscript.decided',
  MANUSCRIPT_FILE_RELEASED: 'manuscript.file_released',
  PEER_REVIEW_CONFLICT: 'publication.peer_review_conflict',
} as const;

export type AuditAction = (typeof AUDIT)[keyof typeof AUDIT];
