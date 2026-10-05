# Chantier KOHOP — suivi des lots

KOHOP publie des contributions courtes, relues par des pairs que l'auteur
choisit et validées par un chef de revue. Le plan de référence est
`docs/plan-kohop-2026-10-02.md` ; ce document dit, lot par lot, **ce qui est
livré**, comment l'activer, les variables nécessaires et les limites connues.

| Lot | Contenu | État |
|---|---|---|
| 0 | Mises en conformité et chef de revue | **livré** (ci-dessous) |
| 1 | Fondations KOHOP | **livré** |
| 2 | Dépôt, choix des relecteurs, recevabilité | à faire |
| 3 | Relecture par les membres | à faire |
| 4 | Révision et décision | à faire |
| 5 | Contrôles par l'IA | à faire |
| 6 | Préparation, parution, pages publiques | à faire |
| 7 | Relecteurs extérieurs | à faire |
| 8 | Pilote, durcissement, lancement | à faire |

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
