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
  // Rapports annuels (F-41, chantier editorial). La migration du contenu
  // codé a son action propre : le journal doit montrer qu'une édition est
  // passée de la source codée à la base, et par qui.
  REPORT_CREATED: 'report.created',
  REPORT_IMPORTED: 'report.imported',
  REPORT_UPDATED: 'report.updated',
  REPORT_PUBLISHED: 'report.published',
  REPORT_DELETED: 'report.deleted',
  // Revue à comité de lecture (F-43) : chaque transition de la machine à
  // états du manuscrit est une entrée — soumission, révision, décision — et
  // la libération d'un fichier non anonymisé engage l'éditeur qui la fait.
  MANUSCRIPT_SUBMITTED: 'manuscript.submitted',
  MANUSCRIPT_REVISED: 'manuscript.revised',
  MANUSCRIPT_DECIDED: 'manuscript.decided',
  MANUSCRIPT_FILE_RELEASED: 'manuscript.file_released',
  PEER_REVIEW_CONFLICT: 'publication.peer_review_conflict',
} as const;

export type AuditAction = (typeof AUDIT)[keyof typeof AUDIT];
