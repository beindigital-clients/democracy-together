# Chantier « programmes » — F-56 à F-60

Livré le 27/09/2026 (branche du chantier, à fusionner par l'orchestrateur).
Boîte à outils et parcours (F-56, F-57), programme Jeunes (F-58), mentorat
(F-59), appels à projets datés (F-60).

## Ce qui est livré

### F-58 — Programme Jeunes : profils et candidatures

- **Profil persistant** (`youthProfiles`, un par compte) : nom affiché,
  parcours, pays, langues, centres d'intérêt, disponibilité, consentements
  horodatés (traitement **obligatoire**, contact par les partenaires
  facultatif). Éditable à tout moment depuis `/espace-membre/jeunes`.
- **Candidature rattachée au profil** (`youthProgramApplications`) : le jeune
  ne donne que le programme (`hub`, `bourses`, `tribunes`, `campagnes`) et sa
  motivation. **Doublon** : une candidature en attente ou acceptée par
  programme (refus `ALREADY_APPLIED`) ; après un refus ou un retrait, on peut
  recandidater. Statut visible, retrait possible tant qu'elle est en attente.
- **Back-office** `/admin/jeunes/profils` (modérateur) : file des candidatures
  avec le profil joint, liste des profils ; acceptation / refus / réouverture
  (même machine à états que les autres files), notification du jeune, journal
  d'audit `youth.program_reviewed`.
- Le formulaire **anonyme** de `/jeunes` est conservé (l'auto-inscription
  n'existe pas : c'est la porte d'entrée de qui n'a pas de compte). Un compte
  connecté y voit un renvoi vers son espace.

### F-59 — Mentorat : appariement et suivi des binômes

- **Profils** mentor / mentoré (`mentorProfiles`, un par rôle et par compte) :
  thèmes, langues, région, fuseau (décalage UTC), disponibilité, objectifs,
  capacité (mentor). Être mentor est réservé aux membres validés.
- **Suggestions d'appariement** calculées (`convex/lib/programmes.ts`,
  `scoreMatch`) et **expliquées** au coordinateur, sur 100 : thèmes communs
  (15 par thème, plafond 45), langue commune (25), même région (15) ou fuseau
  proche (10 à ≤ 3 h, 5 à ≤ 6 h), charge du mentor (15 × place restante /
  capacité). Un mentor plein n'est pas proposé. Déterministe (égalité
  départagée par identifiant).
- **Appariement** : le coordinateur (modérateur+) confirme depuis
  `/admin/mentorat/coordination` ; le score est recalculé côté serveur et figé
  sur le binôme. Le binôme n'est **actif qu'une fois accepté par les deux
  parties** (sinon `declined`, le coordinateur est notifié).
- **Suivi du binôme** (`/espace-membre/mentorat/<id>`) : objectifs partagés,
  journal des séances (date, durée, **notes privées au binôme** — le
  coordinateur voit date et durée, jamais les notes), jalons, statut
  (actif / en pause / terminé, définitif), bilan de fin de chaque membre.
  Lisible par ses deux membres et le coordinateur **seulement** ; l'adresse de
  l'autre membre n'est donnée qu'après acceptation.
- **Alerte d'inactivité** : cron quotidien `mentoring-inactivity` (06:30 UTC,
  `convex/crons.ts`) ; un binôme actif sans séance depuis **4 semaines**
  (`INACTIVITY_WEEKS`) déclenche une notification au coordinateur qui l'a
  confirmé (à défaut, aux administrateurs), une fois par période
  d'inactivité. L'écran de coordination signale aussi les binômes inactifs.
- Les demandes anonymes (`mentorshipRequests`, `/admin/mentorat`) restent en
  place ; l'écran renvoie vers la coordination.

### F-60 — Appels à projets

- **Appels datés** (`projectCalls`) : ouverture et clôture stockées en UTC,
  **saisies et affichées dans le fuseau de l'appel** (IANA, conversion sans
  dépendance, heure d'été comprise), fonds (montant + devise ISO), axes,
  langues acceptées, critères pondérés (1 à 10 critères, poids 1–10), pièces
  demandées (obligatoires ou facultatives). Brouillon → publié ; un appel qui a
  reçu des dossiers ne se dépublie plus, et sa grille ne change plus une fois
  une évaluation rendue.
- **Candidature** (`projectCallApplications`, une par appel et par compte,
  rang membre) : brouillon, pièces, dépôt, retrait. **Refusée hors fenêtre** à
  chaque geste (création, pièce, dépôt : `CALL_NOT_OPEN` / `CALL_CLOSED`).
  Ouverture incluse, clôture exclue.
- **Pièces jointes** (stockage Convex) : une action lit les premiers octets du
  fichier — PDF, PNG, JPEG, conteneur ZIP (DOCX, XLSX, PPTX, ODT…) — et
  **refuse** tout autre contenu (supprimé du stockage aussitôt), 10 Mo max.
  Une pièce par document demandé ; les obligatoires sont exigées au dépôt.
- **Évaluation** : évaluateurs désignés par adresse (membres du réseau,
  notifiés) ; grille par critère (0–5), commentaire. **Conflit d'intérêts
  déclaré → exclusion** définitive : l'évaluateur ne lit plus le dossier ni
  ses pièces, sa note ne compte pas ; un évaluateur porteur du dossier est
  exclu d'office. Écran `/espace-membre/evaluations`.
- **Classement** (moyenne des notes pondérées recevables, sur 100) et
  **décision** (sélectionné / liste d'attente / refusé) depuis
  `/admin/projets/appels` ; la liste d'attente peut encore basculer, une
  sélection ou un refus est définitif. Le porteur est **notifié**, la décision
  et sa note s'affichent dans `/espace-membre/projets`. Audit
  `projectCall.saved`, `projectCall.evaluators`, `projectCall.decided`.
- **Page publique** `/appels-a-projets` : appels ouverts, à venir, archivés ;
  fiche `/appels-a-projets/<slug>` (fonds, fenêtre dans son fuseau, grille,
  pièces, langues).
- **Décision sur le dépôt libre existant** (`projects.submitProject`) :
  **conservé comme « proposition hors appel »**. Le rattacher aurait exigé un
  appel fictif sans fenêtre, sans fonds ni grille — les trois choses qui
  définissent un appel — et une exception à « refusé hors fenêtre ». La
  proposition libre sert la mise en relation à tout moment ; l'appel
  sélectionne à date pour un fonds. Données et files séparées
  (`/admin/projets` et `/admin/projets/appels`), la page publique le dit.

### F-56 / F-57 — Boîte à outils et parcours

- **Ressources** (`toolboxResources`) : guide, fiche, modèle, vidéo, lien ;
  thèmes, langue, niveau ; fichier (stockage, type relu sur les métadonnées
  réelles, 20 Mo) **ou** adresse (http(s) ou chemin interne `/…`).
- **Parcours** (`learningPaths`, `learningPathSteps`) ordonnés ; une étape
  pointe une ressource OU une adresse — les **replays** (chantier
  « contenus ») sont référencés par leur adresse, jamais recopiés.
- **Inscription, progression par étape, attestation** : un compte connecté
  s'inscrit, coche ses étapes ; toutes cochées → attestation datée avec un
  code (`DT-XXXX-XXXX`). Décocher une étape retire l'attestation. La
  progression n'est lisible **que par son titulaire** (aucune query ne prend
  l'identifiant d'une autre personne ; l'attestation d'un autre répond
  `NOT_FOUND`).
- **Attestation** : page imprimable (`/espace-membre/parcours/attestation/<id>`,
  bouton « Imprimer ou enregistrer en PDF »). **Pas de dépendance PDF** : aucune
  n'est présente dans le dépôt, et l'impression du navigateur compose l'arabe
  correctement.
- Pages publiques `/boite-a-outils` (catalogue filtrable : format, thème,
  langue, niveau), `/parcours` et `/parcours/<slug>` ; progression dans
  `/espace-membre/parcours` ; gestion `/admin/boite-a-outils` (**éditeur**).

### Transverse

- Espace membre : bloc « Programmes » (Jeunes, mentorat, parcours ; appels et
  évaluations pour les membres validés).
- Notifications (espace `notifications`) : décisions Jeunes, binôme proposé /
  actif / décliné / inactif, désignation d'évaluateur, décision d'appel.
- Refus serveur traduits : `errors.programme_<CODE>` (repli générique).
- Sitemap : `/boite-a-outils`, `/parcours`, appels publiés, parcours publiés.

## Tables ajoutées (`convex/lib/tables/programmes.ts`)

`youthProfiles`, `youthProgramApplications`, `mentorProfiles`, `mentorPairs`,
`mentorSessions`, `mentorMilestones`, `projectCalls`, `projectCallEvaluators`,
`projectCallApplications`, `projectCallAttachments`, `projectEvaluations`,
`toolboxResources`, `learningPaths`, `learningPathSteps`,
`learningEnrollments`, `learningProgress`. Aucune table existante modifiée.

## Suppression et export de compte

`convex/programmes.ts` exporte `deleteUserDataProgrammes(ctx, userId)` et
`exportUserDataProgrammes(ctx, userId)` (fonctions internes, sans `ctx.auth`),
**à brancher** par l'orchestrateur dans la suppression / l'export de compte.
Choix : un binôme est supprimé avec ses séances et jalons (les notes parlent
des deux personnes) ; le profil de l'autre membre reste. Les candidatures sont
supprimées avec leurs pièces (stockage compris) et leurs évaluations ; les
évaluations rendues par le compte aussi (le classement se recalcule). L'auteur
d'un contenu éditorial et le coordinateur d'un binôme sont effacés, le contenu
reste.

## Variables d'environnement

Aucune nouvelle. `AUTH_DEV_OTP=true` (déjà requis par les E2E) garde
`programmes:devResetProgrammes`, qui remet à zéro les comptes
`@democracytogether.test` et les contenus de test marqués.

## Activation

1. Déployer le schéma et les fonctions (`npx convex deploy` par
   l'orchestrateur) : le cron `mentoring-inactivity` s'enregistre seul.
2. Un éditeur alimente `/admin/boite-a-outils` ; un modérateur publie les
   appels dans `/admin/projets/appels`.
3. Rouvrir les sessions E2E (`pnpm test:e2e:login`) : huit sessions dédiées
   `prog*` ont été ajoutées à `tests/e2e/_sessions.ts`.

## Tests

- `convex/programmes.test.ts` (19) : profil et doublon Jeunes, revue
  réservée ; score déterministe et expliqué, appariement réservé au
  coordinateur, double acceptation, **binôme lisible par ses seuls membres et
  le coordinateur (sans les notes)**, capacité, suivi et bilan, **alerte
  d'inactivité** (une fois par période) ; appels : gestion réservée,
  **candidature hors fenêtre refusée**, pièces vérifiées au contenu,
  **évaluateur en conflit exclu** (classement, dossier, pièce), décision
  notifiée, auto-évaluation refusée ; parcours : édition réservée, **progression
  d'un autre membre invisible**, attestation ; suppression / export.
- `tests/unit/programmes-rules.test.ts` (11) : règles pures (score, fenêtre,
  octets de tête, classement, inactivité, fuseaux, adresses d'étape).
- `tests/unit/programmes-ui.test.tsx` (4) : score expliqué (fr, ar), groupe
  de cases, codes de refus.
- E2E (à jouer après fusion) : `tests/e2e/programmes-appels.spec.ts`,
  `programmes-mentorat.spec.ts`, `programmes-parcours.spec.ts`.

## Limites connues

- Le contenu des pièces jointes des **ressources** de la boîte à outils est
  contrôlé sur les métadonnées du stockage (type, taille), pas sur les octets :
  seuls les éditeurs en déposent. Les pièces des **candidatures** (déposées par
  des membres) sont, elles, lues à l'octet.
- Pas d'e-mail : décisions et alertes passent par les notifications du site.
- Les listes du back-office sont bornées (200 profils, 200 binômes, 100 appels,
  500 dossiers par appel) : suffisant pour le réseau actuel, à paginer au-delà.
- Le rattachement des demandes anonymes de mentorat / candidatures Jeunes à un
  compte créé ensuite n'est pas automatique (adresses non vérifiées).
