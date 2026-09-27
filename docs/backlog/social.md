# Chantier « social » — profils de personnes, suivi, messagerie privée

Ce document décrit ce qui est livré pour la part « réseau social entre personnes »
(rapport de campagne du 27/09, § 10 — lignes « Comptes et organisations : pas de
profil membre » et « Réseau social : pas de profils publics de personnes, ni de
suivi, ni de messagerie privée » ; fiches F-21, F-23, F-25/F-51).

Hors périmètre, et laissé intact : cycle de vie des comptes, 2FA, rattachement aux
organisations (autre chantier — la table `users` n'est pas modifiée), espaces
collaboratifs et Tribune.

## 1. Ce qui est livré

| Brique | Écran | Backend |
|---|---|---|
| Profil membre (nom, photo, biographie, fonction, organisation lue du rattachement, pays, thématiques et langues de l'annuaire, liens https) | `/[locale]/espace-membre/profil` | `convex/social/profiles.ts` |
| Préférences : langue (réutilise `users.preferredLocale`), notifications par type, alerte courriel « nouveau message », visibilité, « qui peut m'écrire », membres bloqués, export de ses données | même écran | `profiles.saveProfile`, `lib/notify.ts`, `messages.block/unblock`, `profiles.exportMine` |
| Profil public d'une personne | `/[locale]/membres/<handle>` | `profiles.getByHandle`, `profiles.relationship` |
| Annuaire des personnes (membres), recherche + filtres thème / langue / pays | `/[locale]/membres` | `profiles.search` |
| Suivi de personnes et d'organisations, compteurs, abonnés / abonnements, fil d'activité | `/[locale]/espace-membre/reseau`, bouton sur `/le-reseau/<slug>` | `convex/social/follows.ts` |
| Messagerie privée 1:1 temps réel (non-lus, lecture, blocage, signalement, suppression de sa copie) | `/[locale]/espace-membre/messages` + pastille d'en-tête (bureau et mobile) | `convex/social/messages.ts` |
| File des messages signalés | `/[locale]/admin/messages-signales` (modérateur) | `messages.listReports`, `messages.resolveReport` |
| Suppression de compte / export RGPD | — (appelées par le chantier « comptes ») | `convex/social/account.ts` |

### Règles tenues côté Convex (l'interface ne protège rien)

- **Visibilité** : `private` (soi seul), `members` (membres VALIDÉS du réseau,
  rôle ≥ membre), `public` (tout le monde, page indexable). Un profil que le
  lecteur ne peut pas voir est **indiscernable** d'un handle inexistant : même
  `null`, même 404, même refus `NOT_FOUND` pour `follow` et `startConversation`.
  Un profil de visiteur ou de compte rétrogradé n'est visible que de lui-même.
  Décision pure : `canViewProfile` (`convex/lib/social.ts`).
- **Énumération** : l'annuaire lit l'index de recherche filtré sur `listed`
  (visibilité ≠ privé) — un profil privé n'est même pas lu —, puis relit la
  visibilité réelle de chaque ligne ; page bornée (48). La biographie n'est pas
  indexée. Les listes d'abonnés ne montrent que les personnes visibles ; les
  autres sont COMPTÉES, jamais nommées.
- **« Qui peut m'écrire »** : `nobody` / `followed` (les personnes que JE suis) /
  `members`. Vérifié à chaque envoi. Exception voulue : celui qui a écrit dans
  une conversation ne peut pas se voir refuser la réponse de son interlocuteur.
  Décision pure : `messageRefusal`.
- **Blocage** : dans les deux sens (ni message, ni suivi ; les suivis existants
  tombent) ; le profil du bloqueur devient invisible au bloqué.
- **Un tiers ne lit jamais une conversation** — administrateur compris.
  Le modérateur ne lit que le message SIGNALÉ, transmis par son destinataire
  (`bodySnapshot`), effacé à la résolution.
- **Aucun contenu de message** dans le journal d'audit (seule la décision
  `message.report_resolved`), dans les notifications (« Nouveau message de X »),
  ni dans le courriel.
- **Photo** : action `setPhoto` — taille réelle ≤ 2 Mo, type déclaré parmi
  PNG / JPEG / WebP, et **signature des premiers octets** conforme au type
  déclaré (un SVG ou un HTML renommé est refusé et effacé du stockage). Une
  photo n'appartient qu'à un profil. Recadrage carré 512 px facultatif côté
  navigateur (`src/lib/image-crop.ts`).
- **Préférences de notification** : branchées dans `notify()`
  (`convex/lib/notify.ts`), seul point d'émission — un type coupé n'est ni créé
  ni affiché, y compris pour les types existants (publication, Tribune, revue…).
- **Limitation de débit** (`SOCIAL_RATE_LIMITS`, clés `social:*`) : 30 messages /
  10 min, 20 nouvelles conversations / jour, 60 suivis / h, 30 blocages / h,
  20 signalements / h, 30 enregistrements de profil / h, 20 photos / h, un
  courriel « nouveau message » par conversation et par demi-heure.

## 2. Tables ajoutées (`convex/lib/tables/social.ts`)

`memberProfiles`, `follows`, `orgFollows`, `blocks`, `conversations`,
`conversationMembers`, `directMessages`, `messageReports`. Aucune table existante
n'est modifiée ; `convex/lib/notify.ts` lit `memberProfiles` pour les préférences.
Constante d'audit ajoutée : `AUDIT.MESSAGE_REPORT_RESOLVED`.

## 3. Suppression de compte et export

- `deleteUserDataSocial(ctx, userId)` — fonction interne, sans `ctx.auth`, **par
  lots** (rend `{ done }`) ; `internal.social.account.deleteUserDataSocialStep`
  la relance jusqu'au bout.
  **Décision : suppression, pas anonymisation.** Profil, photo (stockage), suivis
  (compteurs d'autrui tenus), blocages, organisations suivies, signalements, et
  **les conversations entières, dans les deux sens**. Un message privé est un
  texte libre : remplacer le nom par « compte supprimé » ne l'anonymise pas ;
  une conversation 1:1 n'a pas de valeur collective à préserver (contrairement à
  la Tribune) ; et la moitié restante serait inintelligible tout en restant liée
  à la personne partie. Conséquence assumée : l'interlocuteur perd la
  conversation (il peut l'exporter avant).
- `exportUserDataSocial(ctx, userId)` (+ `internal.social.account.exportUserDataSocialQuery`) :
  profil et préférences, abonnements, abonnés visibles (les autres comptés),
  organisations suivies, blocages, SA copie des conversations (envoyés et reçus),
  signalements faits. Également téléchargeable par la personne depuis son profil.

Le chantier « comptes » doit brancher les deux (non fait ici, par consigne).

## 4. Variables d'environnement

Aucune nouvelle. Le courriel « nouveau message » réutilise l'adaptateur
`sendEmail` (`AUTH_RESEND_KEY` / `AUTH_EMAIL_PROVIDER`, `AUTH_EMAIL_FROM`,
`SITE_URL` pour le lien). **Sans fournisseur, l'alerte n'est pas proposée** :
l'écran la grise et l'annonce, et le serveur ne planifie aucun envoi
(`emailProviderStatus().mode === 'none'`). En dev (`AUTH_DEV_OTP=true`), l'envoi
est journalisé, sans le contenu du message (il n'est jamais dans le courriel).

## 5. Activation

1. Déployer le schéma (nouvelles tables, aucun index sur table existante).
2. Rien à amorcer : un profil naît quand la personne l'enregistre (visibilité par
   défaut « membres du réseau », jamais « public » sans choix explicite).
3. Vérifier que le rôle modérateur voit `/admin/messages-signales`.
4. Brancher `deleteUserDataSocial` / `exportUserDataSocial` dans la suppression et
   l'export de compte.

## 6. Tests

- `convex/social-profiles.test.ts` (22) : visibilité privé / membres / public,
  rétrogradation, blocage, énumération de l'annuaire, sitemap, validation (handle,
  liens, bornes), photo (vrai PNG accepté ; SVG déguisé, HTML déclaré, trop lourd,
  photo d'autrui refusés), préférences qui coupent une notification (suivi ET
  commentaire de Tribune existant).
- `convex/social-messages.test.ts` (22) : envoi, non-lus, marquer lu, notification
  sans contenu, préférence coupée, bornes, débit, « qui peut m'écrire » (personne,
  personnes suivies, réponse toujours permise), visiteur, profil privé, blocage
  dans les deux sens, tiers (membre, admin, anonyme), suppression de sa copie,
  signalement et modération (journal sans contenu), suivi et compteurs, fil
  d'activité (publié seulement), organisations, suppression de compte, export.
- `tests/unit/social-rules.test.ts` (14) : tables de vérité des règles pures.
- `tests/unit/social-ui.test.tsx` (8) : avatar, carte (fr + pluriel arabe),
  recadrage, fiche `Person`.
- E2E `tests/e2e/social-profil-messages.spec.ts` (2 parcours, deux membres neufs) :
  A remplit un profil public (page servie à un anonyme, canonical + hreflang), B
  le trouve, le suit, lui écrit ; A voit la pastille non lue, répond ; B reçoit
  la réponse en temps réel ; profil privé -> 404.

## 7. Limites connues

- **Annuaire** : les filtres thème et langue portent sur des tableaux, qu'un index
  Convex ne filtre pas ; la recherche lit au plus 400 profils candidats puis
  filtre (page de 48). Au-delà de quelques milliers de profils listés, prévoir
  des tables de jointure (profil × thème) ou le composant d'agrégat.
- **Langues parlées** : vocabulaire des langues servies (fr, en, es, pt, ar),
  repris de la bibliothèque et de l'annuaire. Wolof, swahili, haoussa… n'y sont
  pas ; les ajouter demande d'élargir `PUB_LANGS` ou une liste propre.
- **Fil** : les 30 derniers éléments, à partir de 100 personnes suivies au plus ;
  un fil ne montre que 200 messages (les plus anciens sont signalés comme non
  affichés).
- **Photo** : l'URL de stockage est signée mais non expirante ; une photo d'un
  profil « membres » reste lisible par qui détient l'URL.
- **Handle** : modifiable par la personne ; l'ancien lien cesse alors de
  fonctionner (pas de redirection).
- **Notifications de suivi** déjà émises portant le nom d'une personne qui
  supprime son compte : elles vivent dans `notifications` (autre chantier) et ne
  sont pas purgées ici.
- Modération : pas de suspension de messagerie d'un membre (retrait de message
  seulement) ; la sanction de compte relève du chantier « comptes ».
