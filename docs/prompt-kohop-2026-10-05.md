# Prompt d'implémentation — KOHOP

> **Mode d'emploi**
>
> 1. Fusionnez d'abord la PR
>    [beindigital-clients/democracy-together#149](https://github.com/beindigital-clients/democracy-together/pull/149).
>    Elle ne contient que de la documentation, et le plan comme ce prompt
>    seront alors sur `main`.
> 2. Ouvrez une nouvelle session Claude Code sur le dépôt
>    `beindigital-clients/democracy-together`.
> 3. Copiez tout ce qui suit la ligne horizontale, en mettant le bon numéro de
>    lot à la première ligne.
> 4. Une session réalise un lot, dans une PR. Lancez les lots dans l'ordre :
>    0, puis 1, puis 2…
>
> Les lots 0 et 1 ne dépendent d'aucune décision encore ouverte (D-6, D-15,
> D-17) : ils peuvent démarrer tout de suite.

---

**Lot à réaliser : 0**

## 1. Ta mission

Tu travailles sur `beindigital-clients/democracy-together` :

- Next.js 16 (App Router) ;
- next-intl en cinq langues : fr, en, es, pt, et ar en lecture droite-à-gauche ;
- un backend Convex.

Le chantier s'appelle **KOHOP**. Il s'agit de publier des contributions
courtes, relues par des pairs que l'auteur choisit et validées par un chef de
revue, sur le modèle d'une maison d'édition. Le chantier remet aussi en
conformité les circuits de publication existants.

Cette session réalise **un seul lot** : celui indiqué en tête, dans une PR
brouillon dédiée. Ne commence pas le lot suivant.

## 2. À lire avant d'écrire du code

1. **`CLAUDE.md` et `AGENTS.md`.** Les commentaires, les messages de commit, le
   titre et la description de PR sont en anglais. Avant chaque push, le hook
   lance `pnpm verify` : prévois un délai d'au moins 5 minutes. Ne le contourne
   jamais avec `--no-verify`.
2. **`convex/_generated/ai/guidelines.md`**, avant tout code Convex.
3. **`node_modules/next/dist/docs/`**, pour toute API Next.js dont tu n'es pas
   sûr : Next 16 diffère de ce que tu connais.
4. **`docs/plan-kohop-2026-10-02.md`**, le plan validé le 5 octobre. C'est la
   référence ; ce prompt en reprend l'essentiel. S'il n'est pas encore sur
   `main`, lis-le sur la branche de la PR #149 :
   `git fetch origin claude/youthful-archimedes-5dzyfq`, puis
   `git show origin/claude/youthful-archimedes-5dzyfq:docs/plan-kohop-2026-10-02.md`.
5. **Les documents existants** : `docs/backlog/editorial.md` (revue F-43),
   `docs/backlog/communaute.md` (Tribune, invitations), `docs/moderation-ia.md`
   (IA de modération) et `TESTING.md` (conventions de test).
6. **`docs/backlog/kohop.md`**, s'il existe : ce que les lots précédents ont
   livré. Vérifie dans le code que tous les lots antérieurs au tien sont bien
   là. Sinon, arrête-toi et signale-le dans ta réponse.

## 3. Ce que veut le client

- **Format** : des contributions de 500 à 1 000 mots, avec des liens « Pour
  aller plus loin » vers des textes plus nourris.
- **Relecteurs** : l'auteur les désigne. Il n'y a pas d'anonymat : leurs noms et
  leurs analyses sont publiés avec le texte.
- **Chef de revue** : il écarte les relecteurs trop proches de l'auteur, puis il
  décide. Deux avis positifs valent presque acceptation, sauf outrance
  évidente ou infraction à la charte.
- **Révision** : l'auteur révise en deux semaines. Il reste libre de tenir
  compte ou non des critiques.
- **Principes** : les textes appartiennent aux auteurs ; la lecture est libre et
  gratuite ; publier suppose d'adhérer au réseau ; le dispositif élargit le
  cercle des « familiers » du réseau.
- **Validation** : seuls le chef de revue et l'administrateur valident une
  publication, sur KOHOP comme dans la bibliothèque.
- **Contrôles par l'IA** :
  - vérifier qu'il n'y a pas de lien trop fort entre l'auteur et ses
    relecteurs ;
  - proposer des relecteurs à l'auteur qui ne sait pas qui choisir ;
  - contrôler l'originalité du texte : sur la plateforme, sur le web et dans
    d'autres langues.

## 4. Décisions, état au 5 octobre

**Validées : applique-les telles quelles.**

- **D-1** : KOHOP est une rubrique du site (`/kohop`), avec les mêmes comptes et
  la même adhésion.
- **D-2** : les relecteurs sont choisis d'abord dans l'annuaire des membres. En
  second recours, une personne extérieure peut être invitée, mais seulement
  après validation par le chef de revue (lot 7).
- **D-3** : deux relecteurs titulaires et un suppléant facultatif. Deux
  analyses suffisent.
- **D-4** : les avis possibles sont `favorable`, `reserves` (favorable avec
  réserves) et `defavorable`. Les deux premiers sont positifs.
- **D-5** : décident le chef de revue (une fonction attribuée par un
  administrateur, § 6) et l'administrateur.
- **D-7** : dans la bibliothèque, seuls le chef de revue et l'administrateur
  publient un dépôt. L'IA ne publie plus aucun dépôt.
- **D-8** : licence CC BY 4.0, pour les textes comme pour les analyses.
  L'auteur garde ses droits et accorde une licence non exclusive (diffusion,
  traduction).
- **D-9** : la réponse de l'auteur aux relecteurs est publiée.
- **D-10** : délais.
  - Réponse à l'invitation : 5 jours. Analyse : 14 jours. Révision : 14 jours.
    Bon à tirer : 5 jours.
  - Sans révision à l'échéance, la version relue passe à la décision.
  - Ces délais sont des constantes, faciles à raccourcir pour le pilote.
- **D-11** : la charte et les guides sont rédigés par le client. Tu peux en
  préparer un premier jet, clairement marqué « à valider ». La charte fait du
  plagiat une infraction.
- **D-12** : n'affiche plus aucun DOI non enregistré.
- **D-13** : F-43, la revue en double aveugle, est retirée de l'interface à
  l'ouverture de KOHOP (lot 8). Son code est conservé.
- **D-14** : quand un compte est supprimé, ses textes et analyses publiés
  restent en ligne.
- **D-16** : le texte doit être inédit sous cette forme. L'auteur peut reprendre
  ses propres travaux s'il les déclare et les cite.

**Ouvertes : applique le défaut indiqué, derrière une constante, et
signale-le dans la PR.**

- **D-6, classement thématique.** Un vocabulaire unique, `KOHOP_FIELDS`, dans
  `convex/lib/kohop.ts`.
  - Par défaut, ce sont les 10 champs de la plaquette : éducation, santé,
    environnement, normes, rôle de l'IA, gouvernance numérique, place de la
    science, participation citoyenne, lutte contre la corruption, transitions
    démocratiques.
  - Une contribution en porte 1 ou 2.
  - Prévois une correspondance vers les 5 axes du site (`NETWORK_THEMES`) quand
    elle existe.
- **D-15, cohorte pilote.** Rien à coder, sauf le réglage d'accès pilote
  (lot 2).
- **D-17, service anti-plagiat externe.** Il n'est pas encore choisi. Construis
  l'adaptateur et le fournisseur `none` (lot 5).

**Choix techniques déjà faits :**

- le texte s'écrit en Markdown contraint, avec un aperçu, sans éditeur
  WYSIWYG ;
- les contributions sont en français ou en anglais ; l'interface et les
  e-mails sont dans les cinq langues ;
- le chef de revue est une fonction, pas un rang.

## 5. Règles non négociables

1. **Rien ne passe à `published` sans l'action d'un chef de revue ou d'un
   administrateur.** L'IA ne publie rien et ne décide rien. Elle n'écarte
   jamais un relecteur à elle seule : elle signale, en citant ses sources.
2. **KOHOP vit dans ses propres tables.** Aucune mutation existante ne doit
   pouvoir modifier ou publier une contribution KOHOP, qu'elle vienne de la
   bibliothèque, de F-43, de la Tribune ou de l'IA de modération.
3. **Une seule machine à états**, dans un module pur, testée sur toutes les
   paires étape × événement. Une transition refusée n'écrit rien : ni
   document, ni audit, ni notification.
4. **Toutes les gardes sont côté serveur.** L'interface se contente de refléter
   ce que le serveur permet.
5. **La projection publique est figée** par des validateurs `returns`. Un test
   sérialise chaque réponse publique et vérifie qu'elle ne contient :
   - aucun e-mail ;
   - aucune note confidentielle ;
   - aucun relecteur récusé ;
   - aucune version de travail ;
   - aucun rapport d'originalité ;
   - aucune vérification des liens.
6. **Les erreurs métier** sont des `ConvexError` avec un code stable, traduit
   côté interface.
7. **Chaque action est tracée et communiquée :**
   - audit par `recordAudit`, avec de nouvelles constantes `AUDIT.KOHOP_*` dans
     `convex/lib/auditActions.ts` ;
   - notifications par `notify` (`convex/lib/notify.ts`) ;
   - e-mails par `convex/email.ts`, avec des gabarits `emailKit` /
     `emailDocument` (`convex/lib/emailLayout.ts`) écrits dans les cinq
     langues. Ils partent depuis une action planifiée par
     `ctx.scheduler.runAfter(0, …)`.
8. **Interface :**
   - les textes vont dans les cinq fichiers
     `src/messages/{fr,en,es,pt,ar}.json`, et les tests de parité doivent
     passer ;
   - réutilise les composants shadcn existants ;
   - accessibilité RGAA : axe ne doit relever aucune violation sur les
     nouvelles pages ;
   - pense au mobile et au faible débit.
9. **Données personnelles** : chaque nouvelle table qui touche un utilisateur
   est branchée sur la suppression et l'export de compte
   (`convex/lib/accountDeletion.ts`).
10. **Ni déploiement Convex, ni modification des variables d'un déploiement.**
    Documente les variables nécessaires dans `docs/deploiement.md`.
11. **Pas d'invention produit.** Face à un point que ce prompt ne couvre pas,
    prends l'option la plus prudente, isole-la derrière une constante et
    signale-la dans la PR.

## 6. La fonction « chef de revue »

- **Donnée.** Un champ `reviewChief: v.optional(v.boolean())` sur `users`
  (`convex/schema.ts`), avec un index `by_reviewChief` pour notifier les chefs
  de revue.
- **Règle.** La fonction pure `canValidatePublications({ role, reviewChief })`
  vit dans `convex/lib/roles.ts`, un module partagé avec l'interface. Elle
  renvoie vrai pour `admin`, ou si `reviewChief === true` et que le rang vaut
  au moins `moderateur`.
- **Garde.** `requireReviewChief(ctx)` dans `convex/lib/rbac.ts`, construite sur
  `requireUser`, qui gère déjà la suspension et la double authentification.
- **Attribution.** La mutation `users.setReviewChief({ userId, value })` :
  - est réservée à l'administrateur ;
  - est refusée si le compte visé a un rang inférieur à `moderateur`. Un chef
    de revue fait partie de l'équipe et passe donc par la double
    authentification (`TWO_FACTOR_STAFF_MIN_ROLE`) ;
  - quand `users.setRole` fait descendre un compte sous `moderateur`, la
    fonction lui est retirée dans la même mutation ;
  - audit : `USER_REVIEW_CHIEF_GRANTED`, `USER_REVIEW_CHIEF_REVOKED`.
- **Interface :**
  - un helper `isReviewChief` dans `src/lib/roles.ts` ;
  - un interrupteur « Chef de revue » et un badge dans `/admin/utilisateurs`,
    réservés à l'administrateur ;
  - dans la navigation d'administration (`src/components/admin/admin-nav.tsx`,
    `admin-shell.tsx`), une condition « chef de revue ou administrateur », en
    plus du rang minimal, pour les entrées qui la demandent.
- **Notifications.** Celles qui sont destinées à la rédaction (nouveaux dépôts,
  manuscrits, alertes) vont aux chefs de revue et aux administrateurs.

## 7. Les lots

### Lot 0 — Mises en conformité et chef de revue

1. **La fonction chef de revue** (§ 6).
2. **La bibliothèque (D-7).**
   - `publications.reviewPublication` et `publications.reopenPublicationReview`
     passent à `requireReviewChief`.
   - `revertAutoPublication`, qui remet en file un dépôt publié par l'IA, reste
     au rang `moderateur`.
   - Dans `/admin/publications`, seuls un chef de revue et un administrateur
     voient les boutons de décision. Le reste de l'équipe garde la lecture.
   - L'IA ne publie plus aucun dépôt, quel que soit le réglage enregistré :
     `applyVerdict` (`convex/aiModeration.ts`) et `decideApplication`
     (`convex/lib/aiModeration.ts`) ne font jamais passer une publication à
     `published`. L'avis de l'IA reste consultatif.
   - `/admin/moderation-ia` ne propose plus les types de la bibliothèque dans le
     périmètre d'auto-acceptation. La Tribune y reste possible. Mets
     `docs/moderation-ia.md` à jour.
   - Pour F-43, `peerReview.decideManuscript`, qui publie le manuscrit accepté,
     passe à `requireReviewChief`.
3. **A-1, le contournement de F-43.**
   - `reviewPublication` refuse une publication dont la revue est ouverte
     (`reviewStage` défini, ni `accepted` ni `rejected`), avec le code
     `IN_PEER_REVIEW`, sans rien écrire.
   - Même refus pour `aiModeration.requestReview`.
   - Dans `/admin/publications`, ces lignes renvoient vers `/admin/revue` au
     lieu d'afficher les boutons.
4. **A-2, les DOI non enregistrés.**
   - Ne présente plus `10.59000/dt.<slug>` comme un DOI et ne crée plus de lien
     vers doi.org. Fichiers concernés :
     `src/app/[locale]/bibliotheque/[slug]/page.tsx`,
     `src/components/library/publication-card.tsx`,
     `src/lib/barometer-content.ts`, `src/app/[locale]/barometre/page.tsx`, et
     les citations produites par `buildCitations` dans
     `src/lib/publications.ts`.
   - Affiche le lien permanent de la page à la place.
   - Prévois un seul helper, `isRegisteredDoi`, avec un préfixe enregistré vide
     pour l'instant, qui permettra de réactiver l'affichage.
   - Supprime le bouton de repli « Consulter (DOI) ».
   - Aucune migration de données.
5. **A-5, les libellés.**
   - Dans l'espace membre (`src/lib/member-nav.ts`), l'entrée « Tribune »
     devient « Mes billets ».
   - Le message de succès du dépôt renvoie à « Mes publications ».
   - Le formulaire de dépôt n'annonce plus « vous pourrez l'ajouter plus
     tard ».

**Critères de réception :**

- un modérateur ou un éditeur sans la fonction ne peut ni approuver, ni
  rejeter, ni rouvrir un dépôt ; un chef de revue et un administrateur le
  peuvent (convex-test) ;
- l'IA ne publie aucun dépôt, même avec un réglage `auto` qui contient des types
  de la bibliothèque (convex-test) ;
- un manuscrit en revue F-43 ne peut pas être publié depuis la file de
  modération, et le refus n'écrit rien (convex-test) ;
- aucune page n'affiche de DOI non enregistré, ni de lien doi.org vers lui ;
- `convex/rbac.test.ts` et les autres tests existants sont à jour, et
  `pnpm verify` passe.

### Lot 1 — Fondations KOHOP

- **`convex/lib/kohop.ts`**, module pur importable par l'interface (alias
  `@convex/*`) :
  - les étapes : `draft`, `submitted`, `returned`, `in_review`, `revision`,
    `decision`, `production`, `proof`, `ready`, `scheduled`, `published`,
    `refused`, `withdrawn`, `retracted` ;
  - les événements, avec `KOHOP_MACHINE`, `nextStage` et `canTransition`, sur
    le modèle de `convex/lib/manuscripts.ts`. Pour chaque événement, qui peut
    le déclencher : l'auteur, le chef de revue ou le système ;
  - les bornes (plan § 4.2) et les délais (D-10) ;
  - l'échelle d'avis, `isPositive` et `presumptionOfAcceptance(reviews)` ;
  - les codes de motif : `outrance`, `charte`, `plagiat`, `hors_champ`,
    `hors_format`, `autre`. Seuls `outrance`, `charte` et `plagiat` permettent
    de refuser malgré la présomption ;
  - les niveaux de lien (`blocking`, `flagged`) et les types de lien (voir
    lot 2) ;
  - `KOHOP_FIELDS` (D-6).
- **`convex/lib/kohopText.ts`**, module pur :
  - il analyse le Markdown contraint : paragraphes, intertitres `##` et `###`,
    gras, italique, listes, citations, liens `https`. Tout le reste est
    refusé ;
  - il compte les mots, hors balisage et hors URL ;
  - il produit le texte brut pour l'indexation, et les différences entre deux
    versions ;
  - côté interface, le rendu produit des éléments React, jamais du HTML brut.
- **`convex/lib/tables/kohop.ts`**, branché dans `convex/schema.ts` :
  `kohopContributions`, `kohopVersions`, `kohopReviewers`, `kohopReviews`,
  `kohopDecisions`, `kohopEvents`, `kohopLinkChecks`, `kohopSuggestions`,
  `originalityReports`, `kohopSettings`. Les champs et les index sont au plan,
  § 4.2. Les index d'originalité (`textFingerprints`, `textPassages`) arrivent
  au lot 5.
- **Le reste** : les constantes d'audit `AUDIT.KOHOP_*`, les clés de
  notification dans les cinq langues, et la création de
  `docs/backlog/kohop.md`.

**Critères de réception :**

- des tests purs exhaustifs, sur toutes les paires étape × événement ;
- un invariant testé :
  - seuls des événements du chef de revue ou de l'administrateur mènent à
    `production` (acceptation), `scheduled` et `published` ;
  - l'événement système de publication n'est accepté que depuis `scheduled` ;
- le comptage de mots est testé en français, en anglais et en arabe
  (ponctuation, apostrophes, liens) ;
- le typecheck passe.

### Lot 2 — Dépôt, choix des relecteurs, recevabilité

**Côté auteur** (`/espace-membre/kohop` et `/espace-membre/kohop/[id]`, rang
`membre`) :

- **Rédaction.** Brouillon sauvegardé automatiquement ; zone de texte, barre
  d'outils, aperçu ; compteur de 500 à 1 000 mots, qui utilise la même fonction
  de comptage que le serveur.
- **Informations.** Titre, chapô, champs (`KOHOP_FIELDS`), mots-clés, langue
  (fr ou en) et coauteurs (nom, affiliation, e-mail facultatif). Les liens
  « Pour aller plus loin » pointent vers une URL en `https` ou vers un document
  publié de la bibliothèque.
- **Engagements.** L'auteur accepte la charte (version et date) et l'accord de
  publication (D-8). Il signe une déclaration d'originalité et liste ses
  publications antérieures liées au texte (D-16).
- **Choix des relecteurs.** L'auteur choisit deux relecteurs et un suppléant
  **dans l'annuaire des membres** : des comptes de rang `membre` au moins, avec
  un profil listé (`memberProfiles`), qui n'ont pas refusé d'être proposés.
  Pour chacun, il déclare un éventuel lien.
- **Suivi.** Dépôt, suivi de l'étape et des échéances, retrait.

**Profil membre** : une option « Ne pas me proposer comme relecteur » dans
`memberProfiles`, réglable depuis l'éditeur de profil. Par défaut, le membre
peut être proposé.

**Vérification des liens par règles.** La logique est pure, dans
`convex/lib/kohopLinks.ts`. Une requête interne collecte les faits.

- **Liens bloquants :**
  - le relecteur est l'auteur ;
  - il est coauteur du texte (même compte ou même e-mail) ;
  - il appartient à la même organisation (`organizationMemberships`) ;
  - il forme un binôme de mentorat avec l'auteur (`mentorPairs`) ;
  - il y a une relecture croisée de moins de 12 mois : l'auteur a relu ce
    relecteur sur KOHOP ;
  - ils ont cosigné une contribution KOHOP il y a moins de 3 ans ;
  - l'auteur a déclaré un lien familial, personnel ou hiérarchique.
- **Liens signalés :**
  - même espace de travail (`workspaceMembers`) ;
  - abonnement mutuel (`follows`) ;
  - adresse sur le domaine du site de l'organisation de l'auteur ;
  - récurrence : désigné deux fois par le même auteur en 12 mois ;
  - nom en commun parmi les auteurs d'un document de la bibliothèque. Ces noms
    sont du texte libre : ce n'est qu'un signal.
- **Un lien bloquant fait refuser la désignation** (`REVIEWER_NOT_ELIGIBLE`).
  L'auteur ne voit qu'un message générique. Le détail est enregistré dans
  `kohopLinkChecks` et réservé au chef de revue.

**Côté chef de revue** (`/admin/kohop` et `/admin/kohop/[id]`, garde
`requireReviewChief`). L'entrée se trouve dans le groupe « Édition » et n'est
visible que des chefs de revue et des administrateurs.

- **File et dossier.** File par étape, avec compteurs et échéances. Le dossier
  montre le texte, les versions, l'auteur, son organisation et l'historique
  (`kohopEvents`).
- **Relecteurs.** Chacun s'affiche avec les liens trouvés et leurs sources. Le
  chef de revue le valide ou le récuse, avec un motif.
- **Actions.** Renvoyer à l'auteur (avec un motif) ; déclarer irrecevable (code
  et texte) ; lancer la relecture, à condition d'avoir au moins deux relecteurs
  validés. Une fois le lot 5 livré, le lancement attend aussi le rapport
  d'originalité.

**Réglage d'accès pilote** (`kohopSettings`, réservé à l'administrateur) :

- `pilot` : le dépôt est réservé aux comptes des organisations listées ;
- `open` : le dépôt est ouvert à tous les membres ;
- la valeur par défaut est `pilot` ;
- tant que l'accès est `pilot`, les pages publiques de KOHOP sont en `noindex`.

**E-mail** : une alerte aux chefs de revue à chaque dépôt.

**Critères de réception :**

- un lien bloquant est refusé côté serveur (testé) ;
- un auteur ne lit aucun autre dossier que le sien (testé) ;
- seul le chef de revue fait sortir un dossier de l'étape `submitted` (testé) ;
- l'accès pilote est respecté (testé) ;
- un parcours Playwright va de l'auteur au chef de revue.

### Lot 3 — Relecture par les membres

- **Invitations.** Au lancement de la relecture, les deux titulaires sont
  invités par notification et par e-mail, dans leur langue. Ils ont 5 jours
  pour répondre et 14 jours pour rendre leur analyse.
- **Espace relecteur** `/espace-membre/relectures`. Il est ouvert à tout compte
  connecté qui a une relecture KOHOP. Le droit vient de la ligne
  `kohopReviewers` (garde `requireKohopReviewer(ctx, contributionId)`), pas du
  rang.
  - Le relecteur accepte ou décline. En déclinant, il peut suggérer une autre
    personne ; la suggestion est transmise à l'auteur.
  - Avant toute lecture, il déclare l'absence de conflit d'intérêts et consent
    à la publication de son nom, de son affiliation et de son analyse (texte
    versionné).
  - Son analyse comprend :
    - un avis ;
    - une analyse publique de 150 à 1 500 mots, guidée par cinq critères :
      pertinence, originalité, rigueur, clarté, utilité ;
    - une note confidentielle facultative au chef de revue.

    Elle reste modifiable jusqu'à la décision.
- **Suppléant.** Il est invité automatiquement quand une place se libère :
  désistement, récusation ou échéance dépassée. S'il n'y en a pas, l'auteur
  propose un remplaçant, que le chef de revue valide.
- **Tâche quotidienne `kohop-deadlines`** dans `convex/crons.ts`, sur le modèle
  de `peer-review-reminders`. Son index `by_dueAt` ne contient que les réponses
  attendues.
  - Rappel à J-3, relance le jour J, puis tous les 3 jours, 3 relances au plus.
  - Ensuite, alerte au chef de revue et à l'auteur.
- **Passage en révision.** Dès que deux analyses sont reçues, un événement
  système fait passer le dossier à `revision`. L'auteur est prévenu, avec son
  échéance.

**Critères de réception :**

- un relecteur ne voit que son dossier (testé) ;
- aucune analyse n'est acceptée sans la déclaration et le consentement
  (testé) ;
- les relances et le suppléant sont testés ;
- un parcours Playwright couvre la relecture.

### Lot 4 — Révision et décision

- **Côté auteur :**
  - il lit les analyses, avec les noms des relecteurs ;
  - il dépose une nouvelle version, dont les différences sont visibles, ou
    garde son texte inchangé ;
  - il rédige une réponse aux relecteurs, de 800 mots au plus, qui sera
    publiée ;
  - il reçoit des rappels à J-3 et le jour J ;
  - il peut demander une prolongation, que le chef de revue accorde ou non ;
  - à l'échéance, le dossier passe automatiquement à `decision`, avec la
    version relue.
- **Côté chef de revue :**
  - l'écran de décision montre le texte final, les différences, les analyses,
    la réponse de l'auteur et les rapports d'originalité ;
  - quand les deux avis sont positifs, l'écran affiche la présomption
    d'acceptation ;
  - refuser malgré cette présomption exige le motif `outrance`, `charte` ou
    `plagiat`, et une justification d'au moins 20 caractères, envoyée à
    l'auteur ;
  - la décision est alors marquée `againstPresumption` dans `kohopDecisions` et
    dans l'audit.

**Critères de réception :**

- les règles de décision sont testées ;
- le passage automatique à l'échéance est testé ;
- seuls le chef de revue et l'administrateur peuvent décider (testé).

### Lot 5 — Contrôles par l'IA

**Ce qui vaut pour tous les contrôles :**

- les appels passent par `convex/lib/aiGateway.ts` (sorties structurées), sous
  un plafond quotidien d'appels ;
- en cas d'échec (passerelle absente, panne, plafond atteint), aucun résultat
  « rien à signaler » n'est produit. Le contrôle est marqué en échec et le chef
  de revue est prévenu ;
- chaque résultat garde le modèle utilisé, la date et ses sources.

**(a) Liens hors plateforme.**

- Interroger l'API ouverte OpenAlex, et l'API publique ORCID quand le profil a
  un ORCID (`memberProfiles.links`, type `orcid`).
- Chercher les publications cosignées et les affiliations communes sur cinq
  ans.
- L'IA en fait une synthèse, avec les liens vers les sources.
- Le résultat va dans `kohopLinkChecks`, au niveau « signalé » au plus : l'IA
  ne bloque jamais seule.
- Le contrôle se lance à la désignation, et le chef de revue peut le relancer.

**(b) Suggestions de relecteurs.**

- À l'étape du choix, un bouton « Je ne sais pas qui choisir » propose cinq
  membres. Ils peuvent tous être proposés et n'ont aucun lien bloquant avec
  l'auteur.
- Ils sont classés par adéquation : domaines, biographie, fonction, langues,
  travaux publiés.
- La liste équilibre l'Afrique et l'Europe, ainsi que les langues.
- Elle écarte les personnes qui ont déjà deux relectures en cours, ou qui ont
  décliné une invitation il y a moins de 30 jours.
- Chaque suggestion donne sa raison et le résultat de la vérification des
  liens.
- **C'est l'auteur qui coche ses relecteurs** : rien n'est désigné
  automatiquement.
- L'historique est conservé dans `kohopSuggestions`.

**(c) Originalité sur la plateforme.**

- **Index :**
  - `textFingerprints` : des empreintes de suites de 5 mots normalisés,
    sélectionnées par « winnowing » ;
  - `textPassages` : un vecteur par paragraphe, produit par un modèle
    d'embeddings multilingue via la passerelle, avec un `vectorIndex` Convex.
- **Corpus :**
  - les versions KOHOP ;
  - la bibliothèque : titre, résumé, points clés, corps, et le texte extrait
    des PDF quand `documentExtractions` l'a produit ;
  - la Tribune.
- **Indexation** : planifiée à chaque écriture, avec une reprise de l'existant
  par lots.
- **Contrôle**, en trois temps :
  1. les correspondances de suites de mots ;
  2. les paragraphes proches par le sens, dans toutes les langues ;
  3. la confirmation par l'IA : même texte traduit ou reformulé, ou simple
     proximité de sujet.

  Les versions de la même contribution sont exclues.

**(d) Originalité ailleurs.**

- Un adaptateur unique dans `convex/lib/plagiarism/`, qui soumet le texte,
  récupère le rapport et le normalise.
- Un fournisseur `none` (« contrôle externe non configuré ») et un fournisseur
  factice pour les tests.
- Les variables `PLAGIARISM_PROVIDER` et `PLAGIARISM_API_KEY` sont documentées
  dans `docs/deploiement.md`.
- L'option « ne pas conserver le texte » est activée chez le fournisseur.
- La détection d'une langue à l'autre est demandée quand le service la
  propose.

**(e) Rapport d'originalité** (`originalityReports`).

- Il montre chaque passage à côté de sa source, avec sa langue.
- L'IA classe chaque passage : citation référencée, formule courante, reprise
  déclarée de ses propres travaux (à croiser avec la liste déclarée au dépôt),
  ou emprunt.
- Il comprend une synthèse.
- Le chef de revue le voit dans le dossier et à l'écran de décision. Il n'est
  jamais publié.

**Quand les contrôles tournent :**

- au dépôt : le lancement de la relecture attend le rapport interne ;
- sur chaque version révisée ;
- une dernière fois, en interne, avant l'étape `ready` ;
- lance aussi le contrôle sur les contributions déjà déposées.

**Garde.** Accepter (`accept`) ou publier (`publish`) exige un rapport
d'originalité sur la version concernée. Si le contrôle externe manque
(fournisseur `none` ou échec), le chef de revue doit cocher « J'accepte sans
contrôle externe », et ce choix est audité.

**À ne pas faire** : aucun détecteur de « texte écrit par une IA ».

**RGPD** : sources professionnelles publiques uniquement ; mention dans les
conditions de dépôt et dans les invitations ; résultats supprimés avec le
dossier.

**Critères de réception :**

- les tests utilisent des réponses simulées de la passerelle et du service,
  sans aucun appel réseau ;
- la traduction d'une contribution existante est détectée (vecteurs
  simulés) ;
- l'IA ne peut ni bloquer un relecteur ni décider (testé) ;
- un échec de la passerelle ne produit pas de rapport « rien à signaler »
  (testé).

### Lot 6 — Préparation, parution, pages publiques

- **Préparation et parution :**
  - préparation de copie : une nouvelle version de type `copyedit`, avec les
    différences visibles ;
  - épreuve et bon à tirer, en 5 jours, obligatoire si le texte a changé depuis
    l'acceptation ;
  - publication immédiate, ou programmée avec `ctx.scheduler.runAt`
    (annulable) ;
  - retrait après publication, avec une notice et un motif, par un chef de
    revue ou un administrateur.
- **Pages publiques** (plan § 3.4) :
  - `/kohop` : la liste, avec des filtres par champ et par langue ;
  - `/kohop/[slug]` : en-tête, texte, « Pour aller plus loin », évaluation par
    les pairs (parcours daté, une carte par relecteur, réponse de l'auteur,
    accès à la version soumise), licence, citation APA, BibTeX et RIS (avec
    les fonctions de `src/lib/publications.ts`) et lien permanent.
- **Référencement et intégrations :**
  - métadonnées : `ScholarlyArticle`, balises `citation_*`, `canonical`,
    `hreflang` ;
  - plan du site (`src/app/sitemap.ts`) ;
  - recherche globale : une nouvelle source, limitée aux contributions
    publiées (`convex/lib/searchSources.ts`) ;
  - fiches d'organisation ;
  - une entrée « KOHOP » dans l'en-tête du site.
- **E-mails** : « publiée », à l'auteur et aux relecteurs.

**Critères de réception :**

- le test de sérialisation des requêtes publiques (§ 5, règle 5) passe ;
- axe ne relève aucune violation ;
- la publication est impossible sans bon à tirer quand le texte a changé
  (testé).

### Lot 7 — Relecteurs extérieurs (second recours)

- **Proposition.** Quand l'annuaire ne suffit pas, l'auteur propose une
  personne extérieure : nom, e-mail, affiliation, lien public qui atteste son
  identité, raison du choix. Les liens sont vérifiés (règles et IA), et le chef
  de revue doit valider avant tout envoi.
- **Invitation par e-mail, avec un jeton :**
  - le jeton fait 256 bits, et seule son empreinte SHA-256 est stockée ;
  - il a une durée limitée et ne sert qu'une fois, sur le modèle de la
    confirmation de newsletter (`convex/newsletter.ts`) ;
  - la personne peut accepter ou décliner sans compte.
- **Création du compte.** L'inscription libre est fermée (`NO_SELF_SIGNUP`,
  `convex/lib/signIn.ts`). C'est donc l'acceptation qui crée le compte, sans
  rang (`visiteur`). Elle est auditée en `USER_INVITED`, avec `via: 'kohop'`.
- **Relecture.** La personne se connecte avec un code envoyé à l'adresse
  invitée, puis suit le même parcours qu'au lot 3. Après la publication, elle
  est invitée à rejoindre le réseau.
- **Purge.** Au bout de 6 mois, une tâche planifiée supprime les invitations
  déclinées, expirées ou récusées.

**Critères de réception :**

- un jeton expiré, réutilisé ou utilisé avec une autre adresse est refusé
  (testé) ;
- la réponse est la même, qu'un compte existe ou non ;
- les limites de débit (`convex/lib/rateLimit.ts`) s'appliquent.

### Lot 8 — Pilote, durcissement, lancement

- `deleteUserDataKohop` et `exportUserDataKohop`, branchés dans
  `convex/lib/accountDeletion.ts` (D-14).
- Vérification RGAA, revue de sécurité, et un parcours Playwright complet, du
  dépôt jusqu'à la page publique.
- Les pages « Charte », « Guide de l'auteur » et « Guide du relecteur », en
  premier jet marqué « à valider par le client ».
- Le retrait de F-43 de l'interface (D-13) : les entrées « Mes manuscrits » et
  « Comité de lecture » sont masquées, et le code est conservé.
- La documentation finale : `docs/backlog/kohop.md` et `docs/deploiement.md`.

## 8. Méthode et livraison

1. Explore le code concerné avant d'écrire, et dresse une courte liste de
   tâches.
2. Fais des commits petits et cohérents, en anglais, au format du dépôt
   (`Area: description`).
3. Teste : tests purs et convex-test (`pnpm test`), Playwright pour les
   parcours (voir `TESTING.md`). `pnpm verify` doit passer avant chaque push.
4. Mets à jour `docs/backlog/kohop.md` : ce qui est livré, comment l'activer,
   les variables nécessaires, les limites connues.
5. Ouvre une PR brouillon, décrite en anglais : quoi, pourquoi, tests, suites.
   Si ton environnement t'impose une branche, utilise-la.
6. Termine par un compte rendu : ce qui est fait, ce qui ne l'est pas, les
   choix que tu as dû faire, et les questions pour le client.
