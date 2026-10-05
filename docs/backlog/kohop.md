# Chantier KOHOP — suivi des lots

KOHOP publie des contributions courtes, relues par des pairs que l'auteur
choisit et validées par un chef de revue. Le plan de référence est
`docs/plan-kohop-2026-10-02.md` ; ce document dit, lot par lot, **ce qui est
livré**, comment l'activer, les variables nécessaires et les limites connues.

| Lot | Contenu | État |
|---|---|---|
| 0 | Mises en conformité et chef de revue | **livré** (ci-dessous) |
| 1 | Fondations KOHOP | **livré** |
| 2 | Dépôt, choix des relecteurs, recevabilité | **livré** |
| 3 | Relecture par les membres | **livré** |
| 4 | Révision et décision | **livré** |
| 5 | Contrôles par l'IA | **livré** |
| 6 | Préparation, parution, pages publiques | **livré** |
| 7 | Relecteurs extérieurs | **livré** |
| 8 | Pilote, durcissement, lancement | à faire |

---

## Lot 7 — Relecteurs extérieurs (second recours)

- **Proposition** (`convex/kohopExternal.ts`) : nom, e-mail, affiliation, **lien public https qui atteste l'identité**, raison du choix. Mêmes règles de liens que pour un membre (l'auteur, un coauteur par adresse, un lien déclaré refusent la désignation, message générique) ; le détail et l'adresse ne sont vus que du chef de revue, qui valide avant tout envoi.
- **Invitation par e-mail avec jeton** : 256 bits, **seule l'empreinte SHA-256 est stockée**, le jeton est tiré dans l'action d'envoi (jamais dans les arguments d'une fonction planifiée), il expire à l'échéance de réponse (5 jours), ne sert qu'**une fois** et **seulement avec l'adresse invitée**. Une relance émet un nouveau lien qui remplace l'ancien. Modèle : confirmation de la newsletter.
- **Réponse sans compte** (`/kohop/invitation/[token]`, `noindex`, `no-referrer`) : même page pour tout lien invalide (inconnu, expiré, utilisé, mauvaise adresse) ; réponse identique que le compte existe ou non ; une tentative ratée **compte dans les limites de débit** (`ok: false` validé, pas de rollback) + limites IP / globale / par jeton.
- **Compte** : l'inscription libre est fermée ; l'**acceptation** ouvre un compte **sans rang** (`visiteur`), audité `USER_INVITED` avec `via: 'kohop'`. Un compte existant est lié, jamais modifié. La personne se connecte avec un code envoyé à l'adresse invitée et suit le parcours du lot 3 (les fonctions relecteur acceptent un `visiteur` pour sa propre invitation).
- **Après la parution** : l'e-mail « publiée » invite le relecteur sans rang à rejoindre le réseau.
- **Purge** : tâche quotidienne (`kohop-external-purge`), suppression à six mois des invitations extérieures déclinées, expirées ou récusées (avec leurs vérifications de liens).
- Mention RGPD dans l'invitation et sur la page de réponse ; sources professionnelles publiques seulement.
- Tests : `convex/kohopExternal.test.ts` (13) et un parcours Playwright complet (proposition, validation, lien, mauvaise adresse refusée, acceptation, connexion par code, analyse, axe).

## Lot 6 — Préparation, parution, pages publiques

- **Préparation de copie** (`convex/kohopProduction.ts`) : une version `copyedit` (la version acceptée est conservée), différences visibles pour le chef et pour l'auteur.
- **Épreuve et bon à tirer** : 5 jours ; **obligatoire si le texte a changé depuis l'acceptation** (`markReady` refuse avec `PROOF_REQUIRED`, testé). L'auteur approuve ou demande des corrections (motif). Épreuve sans réponse : relance, puis les chefs sont prévenus — **le silence n'est pas un accord** (`KOHOP_PROOF_TACIT_APPROVAL = false`, décision produit à confirmer).
- **Parution** : immédiate ou programmée (`ctx.scheduler.runAt`, annulable). À l'heure dite l'événement système est re-vérifié (étape `scheduled`, date, verrou d'originalité) : sinon retour à `ready` et alerte aux chefs. Tout reste derrière `requireReviewChief` et la machine ; la publication exige le rapport d'originalité de la version publiée.
- **Retrait** : notice publique + motif interne ; la page reste en ligne avec la notice, hors liste et hors recherche.
- **Pages publiques** : `/kohop` (filtres champ et langue), `/kohop/[slug]` (texte, « Pour aller plus loin », évaluation par les pairs : parcours daté, une carte par relecteur ayant consenti, réponse de l'auteur, version soumise, licence, citation APA/BibTeX/RIS, lien permanent). Métadonnées `ScholarlyArticle`, `citation_*`, `canonical`, `hreflang`. **`noindex` tant que l'accès est `pilot`** ; le plan du site ne liste KOHOP qu'avec l'accès ouvert.
- **Projection publique figée** (`convex/kohopPublic.ts`, validateurs `returns`) et **test de sérialisation** (`kohopPublic.test.ts`) : aucun e-mail, aucune note confidentielle, aucun relecteur récusé, aucune version de travail, aucun rapport d'originalité, aucune vérification de liens.
- Recherche globale (nouvelle source `kohop`, contributions publiées seulement), fiches d'organisation, entrée « KOHOP » dans l'en-tête, e-mails « publiée » à l'auteur et aux relecteurs (5 langues).
- **Choix à confirmer** : le motif d'un retrait reste interne (seule la notice est publique).

## Lot 5 — Contrôles automatiques (liens, suggestions, originalité)

L'IA ne publie, n'accepte ni ne refuse jamais : elle informe.

- **Liens hors plateforme** (`convex/kohopLinkExternal.ts`, `lib/kohopExternalLinks.ts`) : à chaque désignation, une action planifiée interroge **OpenAlex** avec les ORCID des deux profils (cosignature des 5 dernières années). Résultat **signalé au plus** (`external_cosign`), jamais bloquant, visible du chef de revue seul. Sans ORCID d'un côté, ou base injoignable : la vérification est enregistrée comme **non aboutie** (jamais comme « rien à signaler »).
- **Suggestions de relecteurs** (`convex/kohopSuggest.ts`, `lib/kohopSuggest.ts`) : cinq membres de l'annuaire dont thèmes / mots-clés recoupent le texte, classés de façon déterministe, avec la raison. Les liens bloquants sont écartés en silence, les liens signalés restent dans l'historique du chef. L'auteur désigne ensuite par la porte habituelle (mêmes règles serveur).
- **Originalité** (`convex/kohopOriginality.ts`, `lib/kohopOriginality.ts`) : deux rapports par version, planifiés au dépôt et à chaque révision. *Plateforme* : passages communs (suites de ≥ 9 mots) avec les autres contributions KOHOP et les publications de la bibliothèque, classés (citation référencée / expression courante / réutilisation déclarée / emprunt à examiner). *Externe* : adaptateur isolé `lib/kohopOriginalityProvider.ts`, fournisseurs `none` (défaut) et `fake` (essais).
- **Verrou d'acceptation** : `accept` exige un rapport plateforme terminé ET un rapport externe terminé ou **reconnu** par le chef de revue (« je poursuis sans contrôle externe », journalisé, `kohop.accepted_without_external_check`). Le chef lit les passages et décide ; rien n'est automatique.
- Les rapports et les contrôles de liens n'apparaissent ni dans la vue de l'auteur, ni dans son historique.
- **Choix à confirmer (D-17)** : le fournisseur anti-plagiat. En attendant, `PLAGIARISM_PROVIDER=none` : acceptation possible avec reconnaissance explicite. Variables documentées dans `docs/deploiement.md`.
- Tests : `kohopOriginality.test.ts` (lib), `kohopExternalLinks.test.ts`, `kohopSuggest.test.ts`, `convex/kohopLinkExternal.test.ts`, `convex/kohopSuggest.test.ts`, `convex/kohopDecision.test.ts` (verrou), parcours Playwright (suggestions, verrou, axe).

## Lot 4 — Révision et décision

- **Auteur** (`convex/kohopRevision.ts`) : lit les analyses publiques (jamais la note confidentielle), révise le texte (la première modification crée la version suivante, la version relue est conservée), **répond aux relecteurs** (1–800 mots, publiée avec les analyses, D-9), demande **une** prolongation de 7 jours. Rendre la révision passe le dossier en `decision` et prévient les chefs de revue.
- **Échéance de révision** : le cron `kohop-deadlines` rappelle (J-3), puis fait passer le dossier en `decision` à l'échéance ; le chef décide alors sur la version relue.
- **Chef de revue** (`convex/kohopDecision.ts`) : voit les analyses **avec la note confidentielle**, la présomption d'acceptation (≥ 2 avis, tous positifs), la réponse de l'auteur et les changements (diff par blocs puis par mots). `accept` → `production` (version retenue, slug, **rien n'est publié**) ; `refuseContribution` : motif obligatoire, et avec la présomption seuls `outrance`, `charte`, `plagiat` sont ouverts (journal `kohop.refused_against_presumption`).
- E-mails à l'auteur (5 langues, actions planifiées) : analyses arrivées, rappel, délai écoulé, acceptation, refus.
- À venir (lot 5) : l'acceptation sera conditionnée au contrôle d'originalité.
- Tests : `convex/kohopDecision.test.ts` (13), parcours Playwright complet jusqu'à l'acceptation (axe sur la révision et la décision).

## Lot 3 — Relecture par les membres

- **Invitations** : `startReview` invite les deux titulaires validés (5 jours pour répondre) ; le suppléant validé reste en réserve. Notification + e-mail (action planifiée, 5 langues). Un titulaire validé pendant la relecture est invité aussitôt.
- **Espace relecteur** (`/espace-membre/relectures`) : liste, réponse (acceptation = déclaration d'absence de conflit + consentement à la publication signée ; refus = motif, conflit, suggestion facultative), texte lisible **seulement après acceptation**, analyse 150–1 500 mots + recommandation + note confidentielle (jamais transmise à l'auteur), modifiable tant que la relecture est ouverte.
- **Garde serveur** : `requireOwnAssignment` — l'invitation d'un autre, ou une désignation non encore invitée, n'existe pas (`NOT_FOUND`).
- **Remplacement** : refus, expiration ou récusation d'un titulaire → le suppléant devient titulaire et est invité ; sans suppléant, chefs de revue et auteur sont prévenus.
- **Deux analyses rendues** → passage automatique en `revision` (14 jours), auteur prévenu.
- **Cron `kohop-deadlines`** (horaire) : rappels (J-3, puis tous les 3 jours, 3 au plus), expiration, remplacement. Logique pure testée dans `convex/lib/kohopDeadlines.ts`.
- Tests : `convex/kohopReviews.test.ts` (16), `convex/lib/kohopDeadlines.test.ts`, parcours Playwright auteur → chef → deux relecteurs → révision (axe).

## Lot 2 — Dépôt, choix des relecteurs, recevabilité

**Côté auteur** (`/espace-membre/kohop`, `/espace-membre/kohop/[id]`, rang `membre`,
entrée « KOHOP » de l'espace membre) — `convex/kohop.ts` :

- brouillon enregistré automatiquement (`saveDraft`) ; un texte déjà déposé n'est
  jamais réécrit : corriger un dossier renvoyé crée la version suivante ;
- éditeur Markdown contraint : barre d'outils, aperçu, compteur de 500 à 1 000
  mots calculé par **la même fonction que le serveur** (`kohopText`), erreurs de
  mise en forme listées avec leur ligne ;
- informations : titre, chapô, champs thématiques (`KOHOP_FIELDS`, 1 ou 2),
  mots-clés, langue (fr ou en), coauteurs, liens « Pour aller plus loin » (https
  ou document publié de la bibliothèque) ;
- engagements : charte, accord de publication CC BY 4.0, déclaration
  d'originalité et liste des travaux antérieurs ; liste de contrôle « Avant de
  déposer » qui reprend exactement les contrôles du serveur ;
- choix des relecteurs **dans l'annuaire** : deux titulaires et un suppléant, avec
  un lien déclaré (aucun / familial / personnel / hiérarchique). Option
  « Ne pas me proposer comme relecteur » dans l'éditeur de profil
  (`memberProfiles.notReviewer`) ;
- suivi : étape, échéances, message du chef de revue, historique ; retrait.

**Vérification des liens par règles** (`convex/lib/kohopLinks.ts`, pur ;
`kohopLinkFacts.ts` collecte les faits) :

- *bloquants, refusés par le serveur* (`REVIEWER_NOT_ELIGIBLE`) : l'auteur lui-même,
  coauteur (compte ou e-mail), même organisation, binôme de mentorat, relecture
  croisée de moins de 12 mois, cosignature KOHOP de moins de 3 ans, lien déclaré ;
- *signalés* : même espace de travail, abonnement mutuel, adresse sur le domaine
  du site de l'organisation, désignation récurrente (2 en 12 mois), nom commun
  parmi les auteurs d'un document de la bibliothèque (texte libre : un signal) ;
- l'auteur ne lit qu'un message générique ; le détail est dans `kohopLinkChecks`,
  visible du seul chef de revue. Un test sérialise la réponse à l'auteur et vérifie
  qu'elle ne contient ni e-mail, ni drapeau, ni constat, ni lien déclaré.

**Côté chef de revue** (`/admin/kohop`, `/admin/kohop/[id]`, `convex/kohopChief.ts`,
`requireReviewChief`) : file par étape avec compteurs, dossier (texte, versions,
auteur et organisation, engagements, relecteurs avec liens trouvés et sources,
historique, décisions), validation ou récusation motivée d'un relecteur, renvoi à
l'auteur (14 jours), déclaration d'irrecevabilité (code + texte, définitive),
lancement de la relecture (**deux titulaires validés exigés**). L'entrée est dans
le groupe « Édition », visible des seuls chefs de revue et administrateurs, même au
rang modérateur (`minRole` propre à l'entrée).

**Accès pilote** (`kohopSettings`, administrateur seul, panneau en bas de
`/admin/kohop`) : `pilot` (défaut : dépôt réservé aux organisations cochées) ou
`open`. Le serveur le vérifie à la création du brouillon et au dépôt
(`PILOT_ONLY`). Tant qu'il est `pilot`, les pages publiques seront en `noindex`
(lot 6).

**E-mail** : à chaque dépôt, alerte aux chefs de revue et administrateurs
(`convex/kohopEmail.ts`, gabarit `convex/lib/kohopEmails.ts`, cinq langues), en plus
de la notification.

**Interface** : catalogue `kohop` en cinq langues, transmis au navigateur par les
seuls layouts KOHOP (`KOHOP_NAMESPACES`) pour ne pas alourdir les pages publiques.
Composants dans `src/components/kohop/`.

**Outils de développement** : `kohopDev:seedPilot` (garde `AUTH_DEV_OTP`) monte un
pilote complet (organisations, profils d'annuaire, accès) ; sessions E2E
`kohopAuteur` / `kohopChef`.

**Tests** : `convex/kohop.test.ts` (26 : accès pilote, isolation du dossier, liens
bloquants/signalés avec mentorat et espaces de travail, dépôt, actions du chef de
revue, aucune écriture sur refus), `convex/lib/kohopLinks.test.ts`, spec Playwright
`tests/e2e/kohop-parcours.spec.ts` (auteur → chef de revue, axe sans violation
grave, modérateur sans la fonction refusé).

**Limites connues** : pas d'invitation au lancement de la relecture (lot 3) ; la
désignation d'un remplaçant après un désistement passe par l'auteur, le suppléant
n'est pas encore promu automatiquement (lot 3) ; le contrôle d'originalité et les
suggestions de l'IA arrivent au lot 5.

---

## Lot 1 — Fondations KOHOP

- **`convex/lib/kohop.ts`** (module pur, partagé avec l'interface) : les 14
  étapes, `KOHOP_MACHINE`, `nextStage`, `canTransition`, `eventsFor`, et pour
  chaque événement l'acteur qui peut le déclencher (`KOHOP_EVENT_ACTOR` :
  auteur, chef de revue ou système). Les bornes (500–1 000 mots, titre,
  chapô, analyses 150–1 500 mots, réponse 800 mots…), les délais D-10 en
  constantes (`KOHOP_DELAYS_DAYS`), l'échelle d'avis, `isPositive`,
  `presumptionOfAcceptance`, `assertRefusal` (seuls `outrance`, `charte` et
  `plagiat` permettent de refuser malgré la présomption), les niveaux et types
  de lien (l'IA ne produit jamais de lien bloquant) et `KOHOP_FIELDS`
  (D-6, défaut : les dix champs de la plaquette, avec `KOHOP_FIELD_THEME` vers
  les cinq axes quand la correspondance existe).
- **`convex/lib/kohopText.ts`** (module pur) : Markdown contraint (paragraphes,
  `##`/`###`, gras, italique, listes, citations, liens `https`), tout le reste
  refusé avec un code et le numéro de ligne ; comptage de mots hors balisage et
  hors URL (apostrophes et traits d'union dans le mot, ponctuation isolée
  ignorée, arabe pris en charge) ; texte brut ; différences par blocs puis par
  mots. Le rendu côté interface produira des éléments React, jamais du HTML.
- **`convex/lib/tables/kohop.ts`**, branché dans `convex/schema.ts` :
  `kohopContributions`, `kohopVersions`, `kohopReviewers`, `kohopReviews`,
  `kohopDecisions`, `kohopEvents`, `kohopLinkChecks`, `kohopSuggestions`,
  `originalityReports`, `kohopSettings`. Les index d'originalité
  (`textFingerprints`, `textPassages`) arrivent au lot 5.
- Constantes d'audit `AUDIT.KOHOP_*`, clés de notification `kohop*` dans les
  cinq langues (espace `notifications`), icône « revue » pour le préfixe
  `kohop` dans la liste des notifications.
- Tests : `convex/lib/kohop.test.ts` (toutes les paires étape × événement, la
  table elle-même, les invariants de publication) et
  `convex/lib/kohopText.test.ts`.

**Invariants testés.** Seul l'événement `accept` (chef de revue) mène à la
production depuis la décision ; seuls des événements du chef de revue mènent à
`scheduled` ; `published` n'est atteint que par `ready + publish` (chef) ou
`scheduled + publishScheduled` (système) ; `publishScheduled` n'est accepté que
depuis `scheduled`.

**Choix à valider.** La présomption d'acceptation exige au moins deux avis, tous
positifs. `returned` a un délai de 14 jours (constante `returned`) mais aucune
issue automatique n'est prévue à l'échéance : le plan ne la décrit pas. Les
versions de la charte et du consentement sont des marqueurs provisoires
(`2026-10-draft`) tant que le client n'a pas validé les textes (D-11).

---

## Lot 0 — Mises en conformité et chef de revue

### 1. La fonction « chef de revue »

- **Donnée.** `users.reviewChief` (booléen facultatif) et l'index
  `by_reviewChief`, qui sert à notifier les chefs de revue par une lecture
  indexée.
- **Règle.** `canValidatePublications({ role, reviewChief })`, dans
  `convex/lib/roles.ts` (module pur, partagé avec l'interface) : vrai pour
  `admin`, ou si `reviewChief === true` **et** que le rang vaut au moins
  `moderateur`. Un drapeau resté sur un compte descendu sous `moderateur` ne
  donne rien.
- **Garde serveur.** `requireReviewChief(ctx)` (`convex/lib/rbac.ts`), construite
  sur `requireUser` : un compte suspendu ou une session sans second facteur est
  refusé avant tout.
- **Attribution.** `users.setReviewChief({ userId, value })` : réservée à
  l'administrateur, refusée sous `moderateur` (`REVIEW_CHIEF_ROLE_TOO_LOW`),
  sans écriture quand la valeur ne change pas. Audit
  `user.review_chief_granted` / `user.review_chief_revoked`. Quand
  `users.setRole` fait descendre un compte sous `moderateur`, la fonction est
  retirée dans la même mutation (audit `user.review_chief_revoked`, motif
  `role_lowered`).
- **Interface.**
  - `isReviewChief` dans `src/lib/roles.ts` ;
  - dans `/admin/utilisateurs` (administrateur seulement) : un interrupteur
    « Chef de revue » par compte, désactivé sous le rang modérateur avec la
    raison en texte visible, et un badge ;
  - navigation d'administration : une entrée peut porter
    `requiresReviewChief: true`, en plus du rang minimal de son groupe
    (`filterAdminNavGroups`, `adminPathRequiresReviewChief`). Le shell refuse le
    chemin à qui n'a pas la fonction. **Aucune entrée livrée ne l'exige encore** :
    la file KOHOP arrive au lot 2.
- **Notifications de la rédaction.** `reviewChiefRecipients`
  (`convex/lib/reviewChiefs.ts`) : chefs de revue et administrateurs, comptes
  suspendus exclus. Utilisée pour l'alerte de l'IA sur un dépôt
  (`publication_ai_flagged`) et pour les alertes de manuscrits F-43
  (`manuscriptSubmitted`, `manuscriptResubmitted`, …). Les alertes de la Tribune
  et des candidatures, elles, ne changent pas.

### 2. La bibliothèque (D-7)

- `publications.reviewPublication` et `publications.reopenPublicationReview`
  passent à `requireReviewChief`. `revertAutoPublication` reste au rang
  `moderateur`.
- `/admin/publications` : seuls un chef de revue et un administrateur voient les
  boutons de décision (et « Rouvrir »). Le reste de l'équipe garde la lecture et
  voit une phrase qui l'explique ; « Analyser (IA) » reste proposé.
- **L'IA ne publie plus aucun dépôt.** `decideApplication` refuse tout type de la
  bibliothèque (`type_out_of_scope`), même listé dans un ancien réglage
  (`AI_AUTO_ACCEPT_SCOPES = ['tribune']`) ; `applyVerdict` double la règle et ne
  contient plus de chemin vers `published`. L'avis reste consultatif.
- `/admin/moderation-ia` : le périmètre d'auto-acceptation ne propose plus que la
  Tribune ; `updateSettings` écarte tout autre type. `docs/moderation-ia.md` est
  à jour.
- F-43 : `peerReview.decideManuscript`, qui publie le manuscrit accepté, passe à
  `requireReviewChief`. Dans `/admin/revue`, le formulaire de décision n'est
  proposé qu'à un chef de revue ou un administrateur.

### 3. A-1 — le contournement de F-43

- `reviewPublication` et `aiModeration.requestReview` refusent une publication
  dont la revue est ouverte (`reviewStage` défini, ni `accepted` ni `rejected` :
  `isInOpenPeerReview`, `convex/lib/manuscripts.ts`) avec `IN_PEER_REVIEW`, avant
  toute écriture.
- Dans `/admin/publications`, ces lignes affichent une phrase et un lien vers
  `/admin/revue` (pour les éditeurs) au lieu des boutons.

### 4. A-2 — les DOI non enregistrés (D-12)

- `isRegisteredDoi` (`src/lib/publications.ts`) est **l'unique porte** de
  l'affichage d'un DOI. Sa liste de préfixes enregistrés
  (`REGISTERED_DOI_PREFIXES`) est **vide** : pour réactiver l'affichage, y
  ajouter le préfixe réellement obtenu auprès d'une agence DOI.
- Page d'une publication : plus de « DOI … » dans la ligne de métadonnées, plus
  de lien `doi.org`, plus de bouton de repli « Consulter (DOI) ». Le bloc de
  copie montre le **lien permanent** de la page. Sans fichier joint, une simple
  note le dit.
- Citations (`buildCitations`) : APA, BibTeX (`url`) et RIS (`UR`) pointent vers
  le lien permanent tant qu'aucun DOI n'est enregistré.
- Carte de publication : le DOI n'apparaît que s'il est enregistré. Baromètre :
  la colonne DOI n'apparaît que si un jeu a un DOI enregistré, et le texte
  d'introduction ne promet plus « un identifiant DOI citable » (cinq langues).
- **Aucune migration de données.** L'attribution de l'identifiant interne
  `10.59000/dt.<slug>` à la publication est inchangée ; il n'est simplement plus
  présenté comme un DOI.

### 5. A-5 — les libellés

- Espace membre : l'entrée « Tribune » devient « Mes billets » (« My posts »,
  « Mis entradas », « Os meus artigos », « مقالاتي »).
- Le message de succès du dépôt renvoie à « Mes publications ».
- Le champ fichier du formulaire de dépôt ne promet plus « vous pourrez l'ajouter
  plus tard » : il dit « Optionnel. ».

### Comment l'activer

Rien à déployer en dehors de la mise en production du code. **Aucune variable
d'environnement nouvelle.** Après le déploiement :

1. un administrateur ouvre `/admin/utilisateurs` ;
2. il active « Chef de revue » sur les comptes de rang modérateur ou supérieur
   concernés ;
3. tant que la fonction n'est attribuée à personne, **seuls les administrateurs
   décident** un dépôt ou un manuscrit.

### Tests

- `convex/reviewChief.test.ts` : attribution (administrateur seul, rang minimal,
  idempotence, retrait à la rétrogradation, audit), décisions de la
  bibliothèque (modérateur et éditeur sans la fonction refusés **sans rien
  écrire**, chef de revue et administrateur acceptés, drapeau périmé, compte
  suspendu), A-1 (toutes les étapes ouvertes, refus sans écriture), destinataires
  des alertes.
- `convex/peerReview.test.ts` : un éditeur sans la fonction ne décide pas un
  manuscrit ; un administrateur le peut ; les alertes vont aux chefs de revue et
  aux administrateurs.
- `convex/aiModeration*.test.ts`, `tests/unit/ai-moderation.test.ts` : l'IA ne
  publie aucun dépôt, quels que soient le mode, l'avis et le réglage enregistré.
- `tests/unit/roles.test.ts`, `tests/unit/admin-nav.test.tsx`,
  `src/lib/publications.test.ts`, `tests/unit/doi-display.test.ts`.
- E2E : `devAdmin:setReviewChiefByEmail` et le champ `reviewChief` des sessions
  (`tests/e2e/_sessions.ts`) ; la session « éditeur » de la revue F-43 porte la
  fonction.

### Limites connues et points à valider

- Un chef de revue de rang **modérateur** peut décider un manuscrit F-43
  (`decideManuscript`), alors que la file `/admin/revue` reste au rang
  **éditeur** : il n'y accède qu'avec le rang éditeur. Sans conséquence tant que
  les chefs de revue sont éditeurs ou administrateurs ; à réexaminer au retrait
  de F-43 (lot 8).
- L'index `by_reviewChief` est posé sur la table `users`, de petite taille, sans
  être « staged » : il ne bloque pas le déploiement de façon sensible.
- Les dépôts publiés par l'IA **avant** ce lot restent publiés ; la sortie
  `revertAutoPublication` (rang modérateur) les concerne toujours. L'action
  d'audit `publication.ai_published` n'est plus émise pour la bibliothèque.
- L'identifiant `10.59000/dt.<slug>` reste stocké en base (aucune migration) ; le
  préfixe 10.59000 est un vrai préfixe Crossref qui n'est pas rattaché à
  l'association.
- Les parcours Playwright n'ont pas été rejoués dans cette session (pas de
  déploiement Convex) : les specs touchées ont été mises à jour à la lecture
  (`barometre`, `espace-membre`, session éditeur de la revue F-43).
