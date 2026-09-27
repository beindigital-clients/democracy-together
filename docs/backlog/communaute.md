# Chantier « communauté » — espaces collaboratifs, modération a priori, approfondissement

Fiches couvertes : **F-24** (espaces collaboratifs), **F-45** (modération a
priori), **F-48** (approfondissement), **F-49** (file de modération avec
historique). Hors périmètre : profils de personnes, suivi, messagerie (autre
chantier).

---

## 1. Ce qui est livré

### F-24 — Espaces collaboratifs : fichiers, invitations, rôles

| Élément | Où |
|---|---|
| Rôles dans un espace : **animateur / contributeur / lecteur** (les valeurs héritées `owner` / `member` valent animateur / contributeur, sans migration) | `convex/lib/communaute.ts` (`effectiveWorkspaceRole`) |
| Espaces **ouverts** (défaut, comportement antérieur) ou **privés sur invitation** — un espace privé n’apparaît pas dans la liste et rend « introuvable » à un non-membre non invité | `convex/workspaces.ts` (`createWorkspace`, `setVisibility`, `listWorkspaces`, `getWorkspace`) |
| **Invitations** : par adresse e-mail ou depuis la liste des personnes avec qui l’animateur partage déjà un espace ; acceptation / refus ; **expiration à 14 jours** ; révocation ; renouvellement en réinvitant ; **pas d’oracle d’existence** (réponse identique qu’un compte existe ou non) | `inviteMember`, `inviteCandidates`, `myInvitations`, `respondInvitation`, `revokeInvitation` |
| Changement de rôle, **retrait d’un membre** (journalisé), **quitter** (le dernier animateur ne peut ni partir ni être rétrogradé) | `setMemberRole`, `removeMember`, `leaveWorkspace` |
| **Fichiers partagés** : stockage Convex, **types autorisés** (pdf, png, jpg, webp, docx, xlsx, pptx, odt, ods, txt, md, csv), **20 Mo** par fichier, **contenu vérifié** (signature des octets contre l’extension — un exécutable renommé en `.pdf` est refusé), **quota de 200 Mo par espace** (toutes versions), 200 fichiers, 30 versions par fichier | `convex/workspaceFiles.ts`, `convex/lib/fileCheck.ts` |
| **Versions successives** d’un même fichier, chacune avec son auteur et sa date | `attachFile` (`fileId` = nouvelle version), `listFiles` |
| Suppression par **l’auteur ou un animateur** (celle d’un animateur sur le fichier d’autrui est journalisée) | `deleteFile` |
| **Accès vérifié côté Convex** : aucune requête ne renvoie de `storageId` ; l’URL d’une version ne sort que par `fileVersionUrl`, qui exige d’être membre de l’espace au moment du clic ; un non-membre n’obtient ni liste, ni URL, ni notes | `requireWorkspaceRole` |
| Notifications : invitation reçue, acceptée / refusée, rôle changé, retrait, nouveau fichier / nouvelle version | `notifications.*` |
| Interface : invitations reçues sur `/espaces`, choix ouvert/privé à la création ; sur `/espaces/<id>` : fichiers (dépôt avec progression, versions, téléchargement, suppression), panneau d’animation (inviter, invitations en cours, rôles, retrait, visibilité) | `src/components/workspaces/*` |

### F-45 — Modération a priori de la Tribune

- Un billet soumis est **`pending`**, invisible du public (fil, fiche,
  traduction, compteur), **visible de son auteur** (« Mes billets » sur
  `/tribune`, `/espace-membre/contributions`, aperçu intégral et correction
  sur `/espace-membre/contributions/<id>`).
- **Seul un modérateur (ou plus) décide** : valider, rejeter (motif
  obligatoire, montré à l’auteur), retirer un contenu en ligne (motif),
  rétablir un contenu rejeté ou retiré. Machine à états :
  `convex/lib/communaute.ts#nextStatus`.
- L’auteur est notifié de chaque décision ; un billet rejeté se corrige et
  **repart en file** (événement « modifié » dans l’historique).
- **Mode réglable par l’administrateur** (`/admin/file-moderation`, encart
  « Mode de modération ») : billets et commentaires séparément, **a priori /
  a posteriori**. Défaut : **billets a priori** (F-45), **commentaires a
  posteriori** (F-45 vise la *publication* ; retenir chaque réponse en file
  briserait le débat de F-47 — l’administrateur peut basculer). Le changement
  est journalisé (`tribune.moderation_configured`).
- **Pré-tri par l’IA** : intégré au dispositif existant (`convex/aiModeration.ts`)
  — mêmes réglages, même barème et socle, même plafond quotidien, même
  passerelle. L’IA **propose** (avis joint à l’élément de la file) ; la
  décision reste humaine, **sauf** si l’administrateur coche « Tribune »
  dans le périmètre d’auto-acceptation du mode `auto` de
  `/admin/moderation-ia` (réglage explicite du dispositif existant). Le mode
  `shadow` reste invisible des modérateurs (l’administrateur le lit dans
  l’historique). Un humain qui a tranché pendant l’analyse l’emporte. Un
  signal bloquant prévient le staff, y compris sur un contenu déjà en ligne
  en mode a posteriori.

### F-49 — File de modération unifiée avec historique

- Écran **`/admin/file-moderation`** (rang modérateur, entrée « File de
  modération » du groupe Modération) : onglets **en attente / validés /
  rejetés / retirés / signalés**, filtres type de contenu / axe / format,
  compteurs.
- Pour chaque contenu, l’**historique complet et chronologique** : soumission,
  modifications, avis de l’IA (verdict, confiance, motif, résumé, signaux,
  modèle), mises en ligne par l’IA, décisions, signalements, classements —
  avec **l’auteur de chaque action** et **l’horodatage**
  (table `moderationEvents`, une ligne par fait, jamais réécrite).
- Chaque décision est **aussi** au journal d’audit (`convex/journal.ts`) :
  `tribune.approved`, `tribune.rejected`, `tribune.removed`,
  `tribune.reports_dismissed`, `tribune.ai_reviewed`, `tribune.ai_published`.
- L’ancien écran `/admin/signalements` reste en service et écrit désormais
  lui aussi dans l’historique.

### F-48 — Approfondissement

- Depuis un **billet court publié**, son auteur — ou un membre qu’il invite
  par adresse (sans oracle d’existence) — ouvre une **contribution de fond**
  liée (format « Analyse », bornes F-46 : 200 à 20 000 caractères, axe
  hérité du billet). Elle passe par la **modération** comme tout billet.
- Publiquement, les deux se renvoient l’un à l’autre : la contribution nomme
  le billet qu’elle prolonge, le billet liste ses contributions de fond
  publiées ; le fil marque « Approfondissement ». L’auteur du billet est
  notifié à la parution.
- L’auteur d’une contribution de fond publiée peut la **proposer à la
  bibliothèque** : un dépôt `pending` naît dans `/admin/publications` (type
  `note`, région `mondial`, accès libre — valeurs neutres que le modérateur
  ajuste), soumis au pré-tri IA de la bibliothèque. Rien n’est publié par ce
  geste.

### Données d’un compte

`convex/communaute.ts` exporte deux fonctions **simples** (pas des fonctions
Convex, sans `ctx.auth`) à brancher par la suppression de compte et l’export :

- `deleteUserDataCommunaute(ctx, userId)` — appartenances (l’espace passe au
  plus ancien animateur, ou au plus ancien membre promu ; un espace sans
  autre membre est supprimé avec ses notes, fichiers et invitations), notes,
  versions de fichiers (blobs compris), invitations émises et reçues, billets
  (avec commentaires, réactions, signalements, historique ; les contributions
  d’autrui qui les prolongeaient perdent seulement le lien), commentaires,
  réactions, signalements. Les actes de modération posés par le compte
  restent dans l’historique, **anonymisés**. Rend un rapport ; `complete:
  false` si un plafond de lecture (500 par table) a été atteint — rejouer.
- `exportUserDataCommunaute(ctx, userId)` — ce que le chantier conserve du
  compte, sans `storageId` ni URL.

## 2. Tables

Nouvelles (`convex/lib/tables/communaute.ts`) : `workspaceFiles`,
`workspaceFileVersions`, `workspaceInvitations`, `communityModerationConfig`,
`moderationEvents`, `tribuneDeepeningInvites`.

Modifiées en place (`convex/schema.ts`, champs optionnels, aucune migration
requise) : `workspaces` (+`visibility`, `storageBytes`, `fileCount`),
`workspaceMembers.role` (+`animateur`, `contributeur`, `lecteur`),
`workspaceNotes` (+index `by_author`), `tribunePosts` (statut +`pending`,
`rejected` ; +`moderatedBy/At`, `rejectionReason`, `autoPublished`,
`aiReview`, `parentPostId`, `libraryPublicationId`, `updatedAt` ; +index
`by_parent_and_status`), `tribuneComments` (mêmes statuts et champs de
modération ; +index `by_status`, `by_author`), `tribuneReactions` (+index
`by_user`), `tribuneReports` (+index `by_target`, `by_reporter`).

## 3. Variables d’environnement et activation

Aucune nouvelle variable. Le pré-tri IA utilise `AI_GATEWAY_API_KEY` et les
réglages de `/admin/moderation-ia` (docs/moderation-ia.md) ; éteint (`off`,
défaut), la modération est purement humaine.

**Au déploiement**, la Tribune passe en **a priori** pour les billets : les
nouveaux billets attendent une validation. Prévenir les modérateurs, et
vérifier que quelqu’un surveille `/admin/file-moderation`. Pour revenir au
comportement antérieur : « Mode de modération » → billets « A posteriori ».

Aide E2E : `communityModeration:devApprovePendingByTitle` (internalMutation,
garde `AUTH_DEV_OTP`, invocable par la CLI seulement) valide les billets de
test ; `tests/e2e/_helpers.ts#approveTribunePosts` l’appelle.

## 4. Tests

- `convex/communaute-espaces.test.ts` (17) : rôles, lecteur sans écriture ni
  téléversement, animateur seul à inviter / changer un rôle / retirer,
  dernier animateur, espace privé invisible et non joignable, invitation
  acceptée / **expirée refusée** / d’autrui refusée, pas d’oracle, fichiers
  (versions, auteurs, **non-membre refusé sur liste / URL / envoi**, contenu
  vérifié, quota, blob déjà rattaché, suppression, notification).
- `convex/communaute-moderation.test.ts` (24) : **billet en attente invisible
  du public et visible de l’auteur**, **seul un modérateur décide**, rejet
  avec motif et correction, transitions, retrait et signalements, réglage
  du mode (admin seul, journalisé), commentaires a priori, file et filtres,
  pré-tri IA (assist, auto hors périmètre, auto avec « tribune », signal
  bloquant, observation, décision humaine prioritaire), **historique complet
  et ordonné avec auteurs**, **approfondissement lié**, invitation à
  approfondir, proposition à la bibliothèque, suppression / export des
  données, garde de l’aide E2E.
- `tests/unit/communaute-rules.test.ts` (11) : vérification des octets,
  nettoyage des noms, rôles, expiration, machine à états.
- E2E (non jouées ici) : `tests/e2e/communaute-espaces.spec.ts`,
  `tests/e2e/communaute-tribune.spec.ts`. Les specs existantes qui publient
  sur la tribune (`admin-confirmations`, `admin-moderation`, `seo`) passent
  désormais par la validation.
- Tests existants adaptés : les tests du fil publié règlent explicitement le
  mode a posteriori (`aPosteriori`), le composer annonce la soumission.

## 5. Limites connues

- **Invitations sans e-mail** : l’invité est prévenu dans l’application
  (notification) s’il a déjà un compte membre ; aucun e-mail n’est envoyé.
  Une invitation à une adresse sans compte attend (14 jours) que ce compte
  existe.
- **« Inviter depuis une liste »** ne propose que les personnes avec qui
  l’animateur partage déjà un espace : un annuaire des personnes relève du
  chantier « profils ».
- **URL de fichier** : l’URL rendue par Convex est une URL de stockage non
  liée à la session ; elle n’est remise qu’à un membre, au clic, mais qui la
  possède peut la transmettre. Pas d’antivirus : la vérification porte sur
  le format (signature), pas sur le contenu malveillant d’un PDF valide.
- Un blob refusé par la vérification est effacé ; un envoi abandonné avant
  `attachFile` laisse un blob orphelin (même cas que la bibliothèque).
- Les avis IA de la Tribune vivent dans l’historique (`moderationEvents`),
  pas dans le journal `/admin/moderation-ia` (réservé aux publications) ; ils
  consomment le même plafond d’appels.
- La file lit au plus 100 éléments par onglet et par type ; au-delà,
  traiter la file la fait avancer.
