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
  // Messagerie privée (chantier « social ») : décision sur un message signalé.
  // Les métadonnées ne portent que la décision, jamais le contenu du message.
  MESSAGE_REPORT_RESOLVED: 'message.report_resolved',
  // Paiements (F-27 à F-31). Préfixe commun `payment.` : l'écran Finances
  // filtre le journal sur ce mot par l'index plein texte.
  PAYMENT_PLAN_CHANGED: 'payment.plan_changed',
  PAYMENT_PLANS_SEEDED: 'payment.plans_seeded',
  PAYMENT_REFUNDED: 'payment.refunded',
  PAYMENT_SUBSCRIPTION_CANCELLED: 'payment.subscription_cancelled',
  PAYMENT_EXPORTED: 'payment.exported',
  // Newsletter (chantier diffusion) : l'envoi d'une campagne engage
  // l'association auprès de tous ses abonnés ; la relance des échecs et la
  // migration des abonnés hérités aussi.
  NEWSLETTER_CAMPAIGN_SENT: 'newsletter.campaign_sent',
  NEWSLETTER_CAMPAIGN_RETRIED: 'newsletter.campaign_retried',
  NEWSLETTER_TEST_SENT: 'newsletter.test_sent',
  NEWSLETTER_LEGACY_MIGRATED: 'newsletter.legacy_migrated',
  // Modération a priori de la Tribune (chantier communauté, F-45/F-49). Une
  // action par DÉCISION : « validé », « rejeté », « retiré » ne disent pas la
  // même chose de la plateforme, et le journal doit pouvoir les compter à part.
  TRIBUNE_APPROVED: 'tribune.approved',
  TRIBUNE_REJECTED: 'tribune.rejected',
  TRIBUNE_REMOVED: 'tribune.removed',
  TRIBUNE_REPORTS_DISMISSED: 'tribune.reports_dismissed',
  // Mêmes raisons que pour la bibliothèque : l'analyse est routinière, la
  // mise en ligne sans relecture humaine ne l'est pas.
  TRIBUNE_AI_REVIEWED: 'tribune.ai_reviewed',
  TRIBUNE_AI_PUBLISHED: 'tribune.ai_published',
  COMMUNITY_MODERATION_CONFIGURED: 'tribune.moderation_configured',
  // Espaces collaboratifs : les actions d'un animateur SUR AUTRUI (retrait
  // d'un membre, suppression du fichier d'un autre). Ce qu'un membre fait de
  // ses propres contenus n'est pas une action de modération.
  WORKSPACE_MEMBER_REMOVED: 'workspace.member_removed',
  WORKSPACE_FILE_DELETED: 'workspace.file_deleted',
  // Contenus éditoriaux (chantier « contenus », F-62/F-64). Une action par
  // GESTE, et non une action « modifié » unique : publier et dépublier sont
  // les deux seuls moments où le public voit changer quelque chose, le journal
  // doit les montrer tels quels. `targetId` porte l'identifiant du document,
  // `metadata.kind` le type de contenu (event, replay, partner, press, theme).
  CONTENT_CREATED: 'content.created',
  CONTENT_UPDATED: 'content.updated',
  CONTENT_PUBLISHED: 'content.published',
  CONTENT_UNPUBLISHED: 'content.unpublished',
  CONTENT_CANCELLED: 'content.cancelled',
  CONTENT_DELETED: 'content.deleted',
  CONTENT_REORDERED: 'content.reordered',
  // Import du contenu codé (migration unique, commande interne).
  CONTENT_IMPORTED: 'content.imported',
  MEDIA_UPLOADED: 'media.uploaded',
  MEDIA_UPDATED: 'media.updated',
  MEDIA_DELETED: 'media.deleted',
  // Export CSV des inscrits : des données personnelles sortent du système.
  EVENT_REGISTRATIONS_EXPORTED: 'event.registrations_exported',
  // Cycle de vie des comptes (chantier comptes, F-63). La suspension et la
  // réactivation sont deux actions : le journal doit dire laquelle a eu lieu,
  // et le MOTIF de la suspension y est conservé.
  USER_CREATED: 'user.created',
  USER_SUSPENDED: 'user.suspended',
  USER_REACTIVATED: 'user.reactivated',
  USER_DELETION_STARTED: 'user.deletion_started',
  USER_DELETED: 'user.deleted',
  // Double authentification. La RÉINITIALISATION par un administrateur est
  // distincte de la désactivation par le titulaire : c'est le geste qui
  // permet de reprendre un compte, il doit se lire comme tel.
  TWO_FACTOR_ENABLED: 'twoFactor.enabled',
  TWO_FACTOR_DISABLED: 'twoFactor.disabled',
  TWO_FACTOR_RESET: 'twoFactor.reset',
  SECURITY_POLICY_CHANGED: 'security.policy_changed',
  // Organisations (F-21) : rattachements et fiche.
  ORG_MEMBER_ADDED: 'organization.member_added',
  ORG_MEMBER_REMOVED: 'organization.member_removed',
  ORG_MEMBER_ROLE_CHANGED: 'organization.member_role_changed',
  ORG_REVISION_SUBMITTED: 'organization.revision_submitted',
  ORG_REVISION_REVIEWED: 'organization.revision_reviewed',
  // Chantier « programmes » (F-56 à F-60) : chaque décision de coordination,
  // de sélection ou d'édition laisse sa ligne, sous une action qui la nomme.
  YOUTH_PROGRAM_REVIEWED: 'youth.program_reviewed',
  MENTORING_PAIR_PROPOSED: 'mentoring.pair_proposed',
  MENTORING_PAIR_STATUS: 'mentoring.pair_status',
  PROJECT_CALL_SAVED: 'projectCall.saved',
  PROJECT_CALL_EVALUATORS: 'projectCall.evaluators',
  PROJECT_CALL_DECIDED: 'projectCall.decided',
  TOOLBOX_RESOURCE_SAVED: 'toolbox.resource_saved',
  TOOLBOX_PATH_SAVED: 'toolbox.path_saved',
} as const;

export type AuditAction = (typeof AUDIT)[keyof typeof AUDIT];
