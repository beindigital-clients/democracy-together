import { defineTable } from 'convex/server';
import { v } from 'convex/values';
import {
  aiModerationApplied,
  aiModerationSeverity,
  aiModerationVerdict,
} from '../aiModeration';
import {
  contentStatusValidator,
  invitationStatusValidator,
  moderationEventKindValidator,
  moderationModeValidator,
  moderationTargetValidator,
  workspaceRoleValidator,
} from '../communaute';

// Tables du chantier « communauté » : espaces collaboratifs (fichiers,
// invitations), modération a priori de la Tribune et son historique,
// approfondissement. Les tables EXISTANTES qu'il touche (workspaces,
// workspaceMembers, tribunePosts, tribuneComments…) sont modifiées en place
// dans convex/schema.ts.

export const communauteTables = {
  // FICHIER LOGIQUE d'un espace (F-24) : un nom, et une suite de versions. La
  // ligne porte un résumé de la version courante pour que la liste des
  // fichiers ne relise pas chaque version.
  workspaceFiles: defineTable({
    workspaceId: v.id('workspaces'),
    name: v.string(),
    createdBy: v.id('users'),
    createdByName: v.string(),
    currentVersion: v.number(),
    versionCount: v.number(),
    // Somme des tailles de TOUTES les versions conservées : c'est ce qui est
    // décompté du quota de l'espace à la suppression.
    totalBytes: v.number(),
    latestSize: v.number(),
    latestContentType: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_workspace', ['workspaceId'])
    .index('by_creator', ['createdBy']),

  // VERSIONS successives d'un fichier, avec leur auteur et leur date. Le blob
  // (`storageId`) ne sort JAMAIS de Convex tel quel : seule une URL signée,
  // produite pour un membre de l'espace, en donne l'accès.
  workspaceFileVersions: defineTable({
    fileId: v.id('workspaceFiles'),
    workspaceId: v.id('workspaces'),
    version: v.number(),
    storageId: v.id('_storage'),
    size: v.number(),
    // Type du FORMAT RECONNU par la vérification des octets
    // (convex/lib/fileCheck.ts), pas celui annoncé par le navigateur.
    contentType: v.string(),
    sha256: v.string(),
    authorUserId: v.id('users'),
    authorName: v.string(),
    createdAt: v.number(),
  })
    .index('by_file_and_version', ['fileId', 'version'])
    .index('by_workspace', ['workspaceId'])
    .index('by_author', ['authorUserId'])
    // Un même blob ne sert qu'une version : sans cette garde, l'identifiant
    // d'un fichier d'un autre espace (lu dans une URL) pourrait être
    // « rattaché » à un espace où l'on est animateur, et servi à ses membres.
    .index('by_storage', ['storageId']),

  // INVITATIONS dans un espace. L'invité est désigné par son ADRESSE : le
  // compte correspondant, s'il existe, est rattaché à la création
  // (`invitedUserId`), mais la réponse à l'animateur est la même dans les deux
  // cas — inviter n'est pas un moyen de savoir qui est inscrit.
  workspaceInvitations: defineTable({
    workspaceId: v.id('workspaces'),
    email: v.string(),
    invitedUserId: v.optional(v.id('users')),
    role: workspaceRoleValidator,
    invitedBy: v.id('users'),
    invitedByName: v.string(),
    status: invitationStatusValidator,
    expiresAt: v.number(),
    createdAt: v.number(),
    respondedAt: v.optional(v.number()),
  })
    .index('by_workspace_and_status', ['workspaceId', 'status'])
    .index('by_email_and_status', ['email', 'status'])
    .index('by_user_and_status', ['invitedUserId', 'status'])
    .index('by_inviter', ['invitedBy']),

  // RÉGLAGES de modération de la Tribune — SINGLETON (`key` = 'default').
  // Absent : billets a priori, commentaires a posteriori (cf.
  // DEFAULT_COMMUNITY_MODERATION).
  communityModerationConfig: defineTable({
    key: v.literal('default'),
    postMode: moderationModeValidator,
    commentMode: moderationModeValidator,
    updatedBy: v.id('users'),
    updatedAt: v.number(),
  }).index('by_key', ['key']),

  // HISTORIQUE DE MODÉRATION (F-49) — une ligne par fait, jamais réécrite :
  // soumission, modification, avis IA, décision, signalement. `targetId` est
  // une chaîne (billet OU commentaire, `targetType` dit lequel) ; `postId`
  // rattache un commentaire à son billet.
  moderationEvents: defineTable({
    targetType: moderationTargetValidator,
    targetId: v.string(),
    postId: v.optional(v.id('tribunePosts')),
    kind: moderationEventKindValidator,
    // Absent pour un fait sans auteur humain (avis de l'IA, compte supprimé).
    actorId: v.optional(v.id('users')),
    statusFrom: v.optional(contentStatusValidator),
    statusTo: v.optional(contentStatusValidator),
    reason: v.optional(v.string()),
    // Avis de l'IA, recopié en entier : l'historique doit se lire sans aller
    // chercher ailleurs ce que le modèle a dit.
    ai: v.optional(
      v.object({
        verdict: aiModerationVerdict,
        applied: aiModerationApplied,
        reason: v.string(),
        confidence: v.number(),
        summary: v.string(),
        findings: v.array(
          v.object({
            ruleKey: v.string(),
            ruleLabel: v.string(),
            severity: aiModerationSeverity,
            outcome: v.union(
              v.literal('pass'),
              v.literal('fail'),
              v.literal('unsure'),
            ),
            explanation: v.string(),
            quote: v.optional(v.string()),
          }),
        ),
        model: v.string(),
        configVersion: v.number(),
        error: v.optional(v.string()),
      }),
    ),
    createdAt: v.number(),
  })
    .index('by_target', ['targetType', 'targetId'])
    .index('by_actor', ['actorId']),

  // APPROFONDISSEMENT (F-48) : l'auteur d'un billet court invite un membre à
  // le prolonger en contribution de fond. Même principe que les invitations
  // d'espace : désigné par son adresse, sans oracle d'existence.
  tribuneDeepeningInvites: defineTable({
    postId: v.id('tribunePosts'),
    email: v.string(),
    invitedUserId: v.optional(v.id('users')),
    invitedBy: v.id('users'),
    status: v.union(v.literal('pending'), v.literal('revoked')),
    createdAt: v.number(),
  })
    .index('by_post', ['postId'])
    .index('by_email', ['email'])
    .index('by_user', ['invitedUserId'])
    .index('by_inviter', ['invitedBy']),
};
