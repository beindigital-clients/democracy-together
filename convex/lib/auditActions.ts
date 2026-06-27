// Actions d'audit comme constantes (jamais de chaîne inline côté appel).
export const AUDIT = {
  USER_ROLE_CHANGED: 'user.role_changed',
  MEMBERSHIP_REVIEWED: 'membership.reviewed',
  PUBLICATION_SUBMITTED: 'publication.submitted',
  PUBLICATION_REVIEWED: 'publication.reviewed',
  TRIBUNE_MODERATED: 'tribune.moderated',
  YOUTH_REVIEWED: 'youth.reviewed',
  MENTORSHIP_REVIEWED: 'mentorship.reviewed',
  PROJECT_REVIEWED: 'project.reviewed',
} as const;

export type AuditAction = (typeof AUDIT)[keyof typeof AUDIT];
