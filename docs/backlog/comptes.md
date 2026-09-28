# Chantier « comptes » — cycle de vie, organisations, double authentification

Fiches couvertes : **F-63** (gestion des utilisateurs et des rôles), **F-21**
(fiche membre), exigence **sécurité** du cadrage (2FA TOTP pour les rôles
sensibles). Constat de départ (rapport de campagne du 27/09, § 10.2) :
l'administrateur ne pouvait qu'inviter ; ni création directe, ni suspension, ni
suppression ; une organisation ne pouvait pas éditer sa fiche ; aucun lien
organisation ↔ comptes ↔ publications ; pas de 2FA.

## Ce qui est livré

### Cycle de vie des comptes (`/admin/utilisateurs`, rang administrateur)

| Geste | Fonction | Règles |
| --- | --- | --- |
| Créer un compte | `accounts.createAccount` | e-mail, rôle, langue de l'e-mail, organisation facultative (+ rôle dans l'organisation). Adresse existante : rien n'est modifié, l'accueil est renvoyé et le rattachement ajouté. E-mail d'accueil par `convex/email.ts` ; l'écran dit quand aucun fournisseur n'est configuré. |
| Suspendre | `accounts.suspendAccount` | **motif obligatoire** (3–500 car., journalisé) ; jamais soi-même ; jamais le dernier administrateur actif. Les lignes `authSessions` et `authRefreshTokens` du compte sont supprimées. |
| Réactiver | `accounts.reactivateAccount` | impossible pendant une suppression. |
| Supprimer | `accounts.deleteAccount` | **deux temps** : confirmation, puis l'adresse du compte à retaper — exigée par le serveur (`confirmEmail`). Jamais soi-même (libre-service pour cela), jamais le dernier administrateur actif. |
| Réinitialiser la 2FA | `twoFactor.resetForUser` | motif obligatoire, journalisé (`twoFactor.reset`). |

**Un compte suspendu ne peut plus rien faire.** Toutes les gardes de
`convex/lib/rbac.ts` passent par `evaluateAccess` (`convex/lib/accountAccess.ts`) :
`getCurrentUser` le traite en anonyme, `requireUser` / `requireNetworkRole`
lèvent `ACCOUNT_SUSPENDED`. Les lectures qui appelaient `getAuthUserId`
directement (notifications, « mes billets », « mes contributions », liaison
d'une candidature, documents et traductions réservés aux membres) passent
désormais par la même garde. Une **nouvelle** session est refusée par le
callback `beforeSessionCreation` de Convex Auth (`convex/lib/signIn.ts →
assertMaySignIn`), APRÈS vérification du mot de passe ou du code : le refus
n'apprend rien à qui ne les possède pas, et les écrans de connexion affichent
« Ce compte est suspendu… ». Une session déjà ouverte est déconnectée par la
garde de l'interface (`AuthGate`) et renvoyée vers `/connexion?motif=suspendu`.

### Libre-service (`/espace-membre/donnees`)

- **Export** (RGPD art. 15 et 20) : `accounts.exportMyData`, fichier JSON
  téléchargé. Il ne contient que les données rattachées au compte appelant
  (lecture par l'identifiant du compte ou son adresse, jamais par un argument),
  ni secret 2FA ni empreinte de mot de passe.
- **Suppression** (art. 17) : un code à 6 chiffres est envoyé à l'adresse du
  compte (`accounts.requestAccountDeletion`, 15 min, 5 essais, empreinte
  SHA-256 seulement en base), puis `accounts.confirmAccountDeletion`. Une
  session restée ouverte ne suffit donc pas à effacer un compte.

### Organisations (F-21)

- Table de rattachement : `organizationMemberships` (existante, jusqu'ici
  inutilisée). `owner` = **responsable**, `member` = **membre** (l'ancien
  `editor`, jamais attribué, vaut membre).
- `/espace-membre/organisation` : le responsable invite un collègue
  (`orgAdmin.inviteColleague` — compte créé au rang « membre » s'il n'existe
  pas, jamais de rétrogradation, e-mail d'accueil, 20 invitations/24 h, 50
  membres au plus), retire un membre, nomme un autre responsable ; un membre
  peut quitter. Jamais le **dernier responsable**.
- **Édition de la fiche** par le responsable : nom, présentation, site,
  pays, région, thématiques, langues, logo, et le choix d'afficher les noms
  des membres sur la page publique.
- **Validation par un modérateur — tranché OUI.** La fiche publique parle au
  nom du réseau et c'est la validation d'un modérateur qui a fait entrer
  l'organisation dans l'annuaire (F-22). Laisser son responsable changer
  librement le nom, le site ou le logo rouvrirait ce que cette validation
  ferme : usurpation du nom d'un autre institut, site remplacé par une page
  d'hameçonnage, logo trompeur. La révision (`organizationRevisions`) est
  relue dans `/admin/organisations` (rang modérateur, vue champ par champ
  « en ligne / proposé ») ; la fiche en ligne reste servie entre-temps. Une
  fiche « à compléter » (créée sans champs d'annuaire) est publiée à
  l'approbation de sa première révision.
- **Logo** : stockage Convex, **contenu vérifié** par l'action
  `orgAdmin.attachLogo` — relecture du fichier, 1 Mo au plus, signature PNG /
  JPEG / WebP (SVG refusé : du XML qui peut porter du script). Un fichier
  refusé est supprimé ; seul un téléversement vérifié peut être joint à une
  révision.
- **Organisation ↔ publications** : `publications.organizationId`, posé au
  dépôt quand l'auteur est rattaché (l'organisation dont il est responsable
  d'abord). La fiche `/le-reseau/<slug>` liste ses publications parues et, si
  l'organisation l'a choisi, les **noms** de ses membres (jamais d'adresse,
  jamais un compte suspendu). Reprise des dépôts antérieurs : voir plus bas.

### Double authentification (TOTP, RFC 6238)

- `convex/lib/totp.ts` : HOTP/TOTP en Web Crypto (HMAC-SHA1, 6 chiffres,
  30 s, fenêtre ±1 pas), Base32, URI `otpauth://`, codes de secours. **Aucune
  dépendance.** Vecteurs de l'annexe B de la RFC 6238 rejoués par
  `convex/totp.test.ts`.
- Inscription (`/espace-membre/securite`) : QR code généré **dans le
  navigateur** (`uqr`, sans dépendance) + clé à saisir à la main ; activée
  seulement après un premier code juste ; **10 codes de secours** à usage
  unique, montrés une fois, stockés en empreintes SHA-256.
- **Secret chiffré au repos** en AES-256-GCM avec `TWO_FACTOR_ENCRYPTION_KEY`
  (`convex/lib/secretBox.ts`), l'identifiant du compte en donnée associée (un
  secret recopié sur un autre compte ne se déchiffre pas).
- **Preuve liée à la SESSION** (`getAuthSessionId`,
  table `twoFactorSessionProofs`) : chaque nouvelle connexion doit présenter
  un code (`/connexion/deux-facteurs`) avant tout accès réservé. **Anti-rejeu**
  : un code n'est accepté que pour un pas de temps strictement postérieur au
  dernier accepté. 6 essais par quart d'heure.
- **Obligation pour modérateur, éditeur, administrateur** : réglage en base
  (`securitySettings`), modifiable par un administrateur depuis
  `/admin/utilisateurs`. **DÉSACTIVÉ PAR DÉFAUT** (voir ci-dessous).

## Règle RGPD de suppression

Un point d'entrée unique : `convex/lib/accountDeletion.ts`, registre ordonné
`USER_DATA_MODULES`, parcouru par lots (`accounts.runAccountDeletion`, repris
par le planificateur). Le même registre sert l'export.

1. **Supprimé** — ce qui n'existe que pour le compte : sessions, moyens de
   connexion, 2FA, notifications, rattachements, révisions de fiche en
   attente, candidatures d'adhésion, dépôts **non publiés** (fichier, avis IA,
   extractions et traductions compris), inscriptions par adresse (newsletter,
   rappels, candidatures jeunes, mentorat), propositions de projet, notes
   d'espace de travail. Base : art. 17(1)(a)(b), la finalité disparaît avec
   le compte.
2. **Supprimé aussi — l'expression personnelle publiée** : billets et
   commentaires de la Tribune, réactions, signalements. Une opinion politique
   signée est une donnée sensible (art. 9) dans un réseau qui travaille sur
   des régimes autoritaires (cadrage § sécurité, risque de « doxing ») ; aucune
   exception de l'art. 17(3) ne justifie de la garder contre la volonté de son
   auteur. Les commentaires d'autres membres sous un billet supprimé partent
   avec lui (une réponse sans son texte serait mal lue).
3. **Conservé mais désattribué** — publications **parues** de la bibliothèque
   et avis de relecture rendus : documents de recherche citables (DOI,
   citations entrantes). Art. 17(3)(d) (recherche scientifique, archivage) : le
   lien au compte est coupé (`authorUserId` retiré, nom du relecteur effacé),
   la ligne d'auteurs imprimée — mention bibliographique, comme dans un PDF
   diffusé — reste. Les espaces de travail dont il était propriétaire sont
   transmis au plus ancien des autres membres (supprimés s'il était seul).
4. **Conservé** — journal d'audit (intérêt légitime : sécurité, preuve des
   décisions de modération). Il ne garde que l'identifiant d'un compte qui
   n'existe plus.

Pendant le traitement, le compte est suspendu (motif interne `deletion`) : plus
aucun accès, plus de connexion. La ligne `accountDeletions` ne garde que
l'identifiant et les dates ; l'adresse, nécessaire aux tables rattachées par
e-mail, est effacée à la dernière étape.

**Pour les nouveaux chantiers** : ajouter une ligne au tableau
`CHANTIER_USER_DATA_MODULES` de `convex/lib/accountDeletion.ts`, par exemple
`{ key: 'profil', delete: deleteUserDataProfil, export: exportUserDataProfil }`.
Une fonction de suppression rend `false` s'il reste des données (elle sera
rappelée dans une nouvelle transaction), `true` ou rien sinon.

## Variables d'environnement (déploiement Convex)

| Variable | Rôle | Sans elle |
| --- | --- | --- |
| `TWO_FACTOR_ENCRYPTION_KEY` | clé AES-256 des secrets TOTP : **32 octets en base64**, `openssl rand -base64 32` | inscription 2FA refusée (`TWO_FACTOR_KEY_NOT_CONFIGURED`), annoncé à l'écran ; l'obligation ne peut pas être activée. Sur un déploiement de dev (`AUTH_DEV_OTP=true`) seulement, une clé de test publique est employée (secrets marqués `dev`, refusés dès qu'une vraie clé est posée). |
| `AUTH_RESEND_KEY` / `AUTH_EMAIL_PROVIDER` | e-mails d'accueil et code de suppression (existant) | création possible, l'écran prévient que l'e-mail ne part pas ; suppression en libre-service refusée (le code ne partirait pas). |
| `SITE_URL` | lien de l'e-mail d'accueil (existant) | repli `http://localhost:3000`. |

⚠️ **Rotation de la clé** : il n'y a pas de rechiffrement automatique. Changer
`TWO_FACTOR_ENCRYPTION_KEY` rend illisibles les secrets existants
(`TWO_FACTOR_SECRET_UNREADABLE`) : réinitialiser alors la 2FA des comptes
concernés, qui la réinscrivent.

## Procédure : rendre la 2FA obligatoire à la mise en service

Le réglage est **désactivé par défaut** parce que le déploiement E2E partagé
crée des comptes administrateur sans appareil. **Il DOIT être activé en
production** ; tant qu'il ne l'est pas, le tableau de bord `/admin` l'affiche
à chaque administrateur.

1. Poser la clé : `npx convex env set TWO_FACTOR_ENCRYPTION_KEY "$(openssl rand -base64 32)" --prod`
   (la conserver dans le coffre de l'association : la perdre oblige à
   réinscrire tout le monde).
2. Chaque administrateur active SA 2FA : Espace membre › Sécurité et double
   authentification (le serveur refuse d'activer l'obligation à un
   administrateur qui ne l'a pas — `ENROLL_FIRST`).
3. `/admin/utilisateurs` › « Double authentification obligatoire » › Rendre
   obligatoire. Journalisé (`security.policy_changed`).
4. Les modérateurs et éditeurs sans appareil sont conduits vers l'écran
   d'inscription à leur prochaine visite ; rien de réservé ne leur répond
   avant (`TWO_FACTOR_ENROLLMENT_REQUIRED`).

## Procédure : un administrateur a perdu son appareil

1. **Il lui reste un code de secours** : il se connecte, choisit « Utiliser un
   code de secours » sur l'écran de vérification, puis, depuis Sécurité,
   génère de nouveaux codes ou désactive et réinscrit un appareil.
2. **Plus de code de secours, un autre administrateur existe** : après
   vérification d'identité par un autre canal (appel, bureau), l'autre
   administrateur utilise « Réinitialiser la 2FA » sur sa ligne dans
   `/admin/utilisateurs` (motif obligatoire, journalisé). Le compte se
   reconnecte sans second facteur et doit en réinscrire un (obligatoire si le
   réglage est actif).
3. **C'était le seul administrateur** : dernier recours d'exploitation, par
   la CLI (clé de déploiement, comme l'amorçage `bootstrap:bootstrapAdmin`) :
   `npx convex run --prod twoFactor:resetByOperator '{"email":"admin@exemple.org","reason":"Appareil et codes perdus, identité vérifiée par le bureau"}'`
   — journalisé sans acteur, `via: "cli"`. Désigner ensuite un second
   administrateur pour ne plus dépendre de cette voie.

## Reprise des données existantes

- Organisation des publications déjà déposées :
  `npx convex run orgAdmin:backfillPublicationOrganizations '{}'` (par lots,
  se replanifie seul).
- Les comptes et organisations existants n'ont rien à migrer : les nouveaux
  champs sont facultatifs (`users.suspendedAt`, `organizations.logoFileId`,
  `organizations.showMembers`, `publications.organizationId`).

## Tables et index ajoutés

- `convex/lib/tables/comptes.ts` : `twoFactorCredentials`,
  `twoFactorSessionProofs`, `securitySettings`, `accountConfirmationCodes`,
  `accountDeletions`, `organizationRevisions`, `organizationLogoUploads`.
- En place dans `convex/schema.ts` : `users.{suspendedAt, suspensionReason,
  suspendedBy}`, `organizations.{logoFileId, showMembers, updatedAt}`,
  `publications.organizationId` + index `by_organization_and_status` ; index
  de suppression `tribuneComments.by_author`, `tribuneReactions.by_user`,
  `tribuneReports.by_reporter`, `workspaceNotes.by_author`.

## Tests

- `convex/totp.test.ts` — vecteurs RFC 6238/4226, fenêtre, rejeu, Base32, URI,
  codes de secours, chiffrement (AAD, clé absente, clé de dev refusée).
- `convex/accounts.test.ts` — suspension (toutes les gardes, sessions et
  jetons supprimés, connexion refusée), dernier administrateur, suppression
  par l'admin (règles 1 à 3, journal), export limité à ses données,
  suppression en libre-service par code, création directe.
- `convex/twoFactor.test.ts` — inscription, secret chiffré, session sans
  preuve refusée, rejeu refusé, code de secours à usage unique, plafond
  d'essais, obligation (défaut désactivé, `ENROLL_FIRST`, blocage d'un
  modérateur), réinitialisations admin et CLI, désactivation.
- `convex/orgAdmin.test.ts` — seul le responsable édite, validation par un
  modérateur, logo vérifié, rattachements, organisation ↔ publications ↔
  fiche publique.
- `tests/unit/comptes-ui.test.tsx` — QR code, lecture des codes de refus,
  parité des cinq catalogues.
- E2E : `tests/e2e/comptes-suspension.spec.ts` (création, connexion,
  suspension, refus de connexion, suppression en deux temps, avertissement du
  tableau de bord ; session dédiée `comptes`), `tests/e2e/comptes-2fa.spec.ts`
  (inscription, reconnexion, code exigé, calculé avec `convex/lib/totp.ts`).

## Limites connues

- Tables sans index sur l'adresse : **messages de contact** et **inscriptions
  à un événement** ne sont ni exportés ni supprimés avec le compte (ils sont
  rattachés à une adresse saisie librement, pas au compte). À traiter par une
  durée de conservation propre à ces modules.
- Le journal d'audit conserve des métadonnées historiques (ex. l'adresse
  d'une invitation `user.invited`) : durée de conservation à fixer par le
  référent RGPD.
- Une personne rattachée à plusieurs organisations dépose au nom de la
  première (celle dont elle est responsable d'abord) ; pas de choix à l'écran.
- L'e-mail d'accueil d'un collègue invité part dans la langue de l'écran du
  responsable (celle du collègue n'est pas connue avant sa connexion).
