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
  // Réouvertures (issue #9) : le retour en arrière d'une revue est une
  // transition NOMMÉE, donc une action d'audit distincte. Sans elle, le
  // journal afficherait « … .reviewed » deux fois de suite et on ne saurait
  // pas lequel des deux passages a rouvert le dossier.
  PUBLICATION_REOPENED: 'publication.reopened',
  YOUTH_REOPENED: 'youth.reopened',
  MENTORSHIP_REOPENED: 'mentorship.reopened',
  PROJECT_REOPENED: 'project.reopened',
  // Modération assistée par IA (convex/aiModeration.ts). Trois actions
  // DISTINCTES, et la distinction n'est pas décorative : « analysé » se
  // produit à chaque dépôt, « publié par l'IA » est le seul moment où un
  // texte passe en ligne sans qu'un humain l'ait lu, et « remis en file »
  // est la sortie arrière de ce moment-là. Les fondre en une action
  // rendrait invisible, dans le journal, la seule qui engage l'association.
  PUBLICATION_AI_REVIEWED: 'publication.ai_reviewed',
  PUBLICATION_AI_PUBLISHED: 'publication.ai_published',
  PUBLICATION_AI_REVERTED: 'publication.ai_reverted',
  // Réglages du dispositif : qui a ouvert l'auto-publication, et quand.
  AI_MODERATION_CONFIGURED: 'aiModeration.configured',
  AI_MODERATION_RULE_CHANGED: 'aiModeration.rule_changed',
} as const;

export type AuditAction = (typeof AUDIT)[keyof typeof AUDIT];
