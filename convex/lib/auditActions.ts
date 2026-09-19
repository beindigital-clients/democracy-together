// Actions d'audit comme constantes (jamais de chaîne inline côté appel).
export const AUDIT = {
  // Amorçage de l'administrateur initial (convex/bootstrap.ts) : distinct de
  // USER_ROLE_CHANGED, qui suppose un administrateur acteur.
  ADMIN_BOOTSTRAPPED: 'admin.bootstrapped',
  USER_ROLE_CHANGED: 'user.role_changed',
  USER_INVITED: 'user.invited',
  CONTACT_HANDLED: 'contact.handled',
  ORGANIZATION_CREATED: 'organization.created',
  MEMBERSHIP_REVIEWED: 'membership.reviewed',
  PUBLICATION_SUBMITTED: 'publication.submitted',
  PUBLICATION_REVIEWED: 'publication.reviewed',
  TRIBUNE_MODERATED: 'tribune.moderated',
  YOUTH_REVIEWED: 'youth.reviewed',
  MENTORSHIP_REVIEWED: 'mentorship.reviewed',
  PROJECT_REVIEWED: 'project.reviewed',
  PEER_REVIEW: 'publication.peer_review',
} as const;

export type AuditAction = (typeof AUDIT)[keyof typeof AUDIT];
