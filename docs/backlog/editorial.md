# Chantier « editorial » — F-41 (rapports annuels) et F-43 (revue à comité de lecture)

Livré le 27/09/2026. Ce document dit ce qui est livré, comment l'activer, comment
régénérer les PDF, et ce qui reste hors périmètre.

## 1. F-41 — Rapports annuels

### Ce qui est livré

- **Modèle de données Convex** (`convex/lib/tables/editorial.ts`) :
  - `annualReports` — une édition par année : statut (`draft` / `published`),
    « édition inaugurale », origine (`coded` = migrée du contenu codé, `admin`) ;
  - `annualReportContents` — le texte d'une édition dans UNE langue : titre,
    introduction, chapitres (titre + paragraphes), chiffres clés (valeur +
    libellé), et l'empreinte du texte (`contentHash`) ;
  - `annualReportPdfs` — le PDF composé pour une langue (stockage Convex,
    taille, pages, empreinte du texte dont il est issu).
- **Administration** `/admin/rapports` (rang **éditeur**, garde Convex
  `requireNetworkRole(ctx, 'editeur')`, entrée « Rapports annuels » du groupe
  Édition) : migration des éditions codées, création, rédaction par langue,
  publication/dépublication, drapeau « édition inaugurale », recomposition des
  PDF, suppression (confirmée). Toutes les écritures sont auditées
  (`report.*`).
- **Repli sur le contenu codé, URL inchangées.** Le contenu historique a quitté
  `src/lib/reports-content.ts` pour `convex/lib/annualReportsCoded.ts` (une
  seule copie, lue par le site via l'alias `@convex`). `/rapports` et
  `/rapports/<année>` servent l'édition de la base si elle la connaît, sinon le
  contenu codé à l'identique. Une année connue de la base mais dépubliée est
  introuvable : dépublier ne ressuscite pas l'ancienne version.
- **Migration fidèle** : `annualReports.importCodedReport` recopie les cinq
  langues champ pour champ, publie l'édition et planifie ses cinq PDF. Testé
  champ par champ (`convex/annualReports.test.ts`).
- **PDF généré pour chaque édition et chaque langue, arabe compris**, composé
  par une action Convex (runtime Node, `convex/reportPdfNode.ts`) PLANIFIÉE à
  chaque écriture du texte, stocké dans Convex, servi par le site sous
  `/<langue>/rapports/<année>/rapport.pdf` (nom de fichier
  `democracy-together-rapport-<année>-<langue>.pdf`, ETag = empreinte du
  texte). Le PDF n'est servi que si son empreinte est celle du texte courant :
  un rapport corrigé ne propose jamais un PDF qui le contredit.
- **Bouton « Télécharger le PDF »** sur la page du rapport, avec format, taille,
  nombre de pages et langue, et les autres langues disponibles. Sans PDF pour
  la langue (édition encore codée, ou composition en cours), l'impression du
  navigateur reste proposée.
- **Accessibilité du PDF** : PDF 1.7 **balisé** (arbre de structure
  Document > H1 / P / Sect > H2 / P, liste L > LI > Lbl / LBody pour les
  chiffres clés), `/MarkInfo`, **`/Lang`** du document, titre affiché à la place
  du nom de fichier (`DisplayDocTitle`), **métadonnées** Title / Author
  (« Democracy Together ») / Subject / Keywords, **signets** par chapitre,
  en-têtes et pieds de page marqués comme artefacts, et `/ActualText` (texte
  logique) sur chaque ligne arabe.

### Mesure qui fonde le choix de la technique

Mesuré le 27/09 sur le rapport 2026 (5 langues, 2 pages), avec les polices du
site. Extraction du texte par **pdf.js** (le lecteur de Firefox), rendu des
pages par pdf.js + canvas et vérification à l'œil.

| | **pdfkit + fontkit (retenu)** | Chromium `--print-to-pdf` | pdfkit + Noto Naskh Arabic |
|---|---|---|---|
| Où ça tourne | action Convex Node (JS pur) | CI / build uniquement (pas de Chromium sur Vercel ni sur Convex) | action Convex Node |
| Temps (arabe / français) | 0,13 s / 0,34–0,44 s (à chaud) | 0,38 s (lancement compris) | — |
| Taille (arabe / français) | 36,8 Ko / 28,8 Ko | 35,4 Ko | — |
| Lettres arabes liées au rendu | **oui** (vérifié sur rendu) | oui | oui |
| Lettres à plusieurs glyphes (formes initiale / médiane / finale) | **30 sur 37** | 0 sur 29 (formes de présentation, une par glyphe) | — |
| Texte extrait par pdf.js | **« تقرير النشاط 2026 », mots entiers, ordre logique** | lettres isolées en formes de présentation, une par élément, ordre inversé ; « تقرير » introuvable | mots découpés en fragments (« الن ش اطت ») |
| PDF balisé, `/Lang` | oui, oui | oui, oui | oui, oui |
| Auteur dans les métadonnées | oui | non (Title seul) | oui |
| Régénération après une correction | automatique, à l'écriture | commande CI + clé de déploiement | automatique |

Lecture :

- **Chromium** compose l'arabe parfaitement à l'écran, mais son PDF se relit
  mal (pdf.js n'en extrait que des lettres isolées) et, surtout, il ne peut
  tourner **ni sur Vercel ni dans Convex** : chaque correction d'un rapport
  aurait exigé une tâche CI munie d'une clé de déploiement pour recomposer et
  téléverser. Écarté.
- **pdfkit + fontkit** applique les tables OpenType de la police (GSUB `init`,
  `medi`, `fina`, `rlig`…) : les lettres sont liées. Trois corrections,
  mesurées, ont été nécessaires et sont testées :
  1. fontkit retourne toute une chaîne de droite à gauche, chiffres et noms
     latins compris (« 2026 » → « 6202 »), et pdfkit replace mal ses espaces :
     le **placement bidirectionnel** est fait mot par mot par
     `convex/lib/reportPdf/layout.ts` (version par mots de l'UAX #9 : courses
     de même direction, neutres résolus, parenthèses en miroir) ;
  2. **Noto Naskh Arabic** (police de titre arabe du site) lie ses lettres par
     attache cursive, avec des décalages verticaux : chaque mot est découpé en
     dizaines d'opérateurs et l'extraction devient illisible. **IBM Plex Sans
     Arabic** (police de texte arabe du site, qui couvre aussi le latin) se lie
     sur la ligne de base : c'est elle qui compose le PDF arabe ;
  3. le crénage de Plex Sans Arabic écarte la lettre qui suit « ر » d'un
     dixième d'em, que pdf.js lit comme une espace (« تقر ير ») : **crénage
     coupé dans les mots arabes**. Et les ligatures (لا, تر, ين…) sont écrites
     dans le `/ToUnicode` dans l'ordre visuel, cohérent avec le flux de
     contenu : retourné d'un bloc par l'extracteur, il redonne « الإصدار » et
     non « اإلصدار ».
- **pdf-lib** sait embarquer une police avec fontkit, mais ne produit pas de
  PDF balisé. Il sert ici à autre chose (anonymisation des manuscrits, F-43).

Tests : `convex/lib/reportPdf/render.test.ts` (le PDF s'ouvre, le nombre de
pages lu est celui annoncé, titre/auteur/langue dans les métadonnées, arbre de
structure présent, titre dans le texte extrait ; pour l'arabe : ب ت ن م ي
dessinées par au moins trois glyphes chacune, plus de 60 % des lettres à
plusieurs formes, « تقرير », « النشاط », « الإصدار », « المشتركة » extraits
entiers, « 2026 » non inversé) et `convex/lib/reportPdf/layout.test.ts`
(directions, coupure, miroir, placement). `convex/annualReports.test.ts` fait
tourner l'action réelle de bout en bout (composition, stockage, service).

### Commandes

- **Régénérer tous les PDF** (après une mise à jour des polices ou du
  gabarit) : `npx convex run reportPdfNode:generateAll` (une action planifiée
  par édition et par langue), ou le bouton « Recomposer les PDF » d'une
  édition dans `/admin/rapports`.
- **Voir les PDF en local**, sans backend :
  `REPORT_PDF_OUT=/tmp/pdf pnpm exec vitest run convex/lib/reportPdf/render.test.ts`
  écrit un PDF par langue dans le dossier donné.
- **Régénérer les polices embarquées** (source : API Google Fonts, TrueType
  statique) : `node scripts/report-pdf-fonts.mjs`. Licence : SIL OFL 1.1,
  `convex/lib/reportPdf/fonts/OFL.txt`.

### Activation

1. Déployer (le schéma ajoute trois tables ; aucune variable d'environnement).
2. Un éditeur ouvre `/admin/rapports` et clique « Importer l'édition 2026 » :
   la page publique ne change pas, et les cinq PDF sont composés en quelques
   secondes. Jusque-là, le site sert le contenu codé et propose l'impression.

## 2. F-43 — Revue à comité de lecture

### Machine à états formelle

Une seule table de transitions, `convex/lib/manuscripts.ts`
(`MANUSCRIPT_MACHINE`), lue par le serveur (`nextStage`) ET par l'écran de
l'éditeur (`canTransition`, pour ne proposer que les décisions possibles) :

```
(aucune) ─submit─► submitted ─startReview─► in_review ─requestRevision─► revision
submitted ─reject─► rejected                       revision ─resubmit─► resubmitted
in_review ─accept / reject─► accepted / rejected   resubmitted ─startReview─► in_review
resubmitted ─accept / reject─► accepted / rejected
accepted, rejected : définitifs (ALREADY_REVIEWED)
reviewed (étape héritée) ─startReview / accept / reject─►
```

Toute autre transition est refusée (`INVALID_TRANSITION`, ou
`ALREADY_REVIEWED` depuis une décision rendue) et n'écrit rien. L'étape vit
dans `publications.reviewStage` (union élargie en place, rétrocompatible).
Tests : toutes les paires (étape × événement) en test pur
(`convex/lib/manuscripts.test.ts`) ET les 48 combinaisons (8 étapes × 6
opérations réelles) en convex-test, avec vérification que le refus n'a rien
écrit (`convex/peerReview.test.ts`).

### Ce qui est livré

- **Soumission par l'auteur** depuis `/espace-membre/manuscrits` (lien depuis
  l'espace membre) : un dépôt en attente (F-32) est soumis au comité ; la
  version 1 est figée ; les éditeurs sont notifiés. L'ouverture historique
  depuis la file de modération (désigner un relecteur sur un dépôt) reste
  possible et crée la même version 1.
- **Versions** (`manuscriptVersions`) : chaque révision est une nouvelle
  version stockée (fichier, titre, résumé, mots-clés) avec sa **lettre de
  réponse aux relecteurs** (obligatoire) ; rien n'est réécrit. Le relecteur
  voit la version qu'il évalue, la lettre de réponse et le **différentiel de
  métadonnées** avec la précédente (titre, résumé, mots-clés, fichier).
- **Double aveugle**, tenu côté serveur :
  - aucune réponse destinée à un relecteur ne porte l'identité de l'auteur :
    ni noms, ni adresse, ni nom du fichier d'origine (le fichier est servi
    sous un nom neutre, `manuscrit-v2.pdf`) ; la file de modération
    (`publications.listForReview`) masque l'auteur des manuscrits en revue
    pour qui n'est pas éditeur ;
  - le fichier transmis est une **copie anonymisée** (`convex/lib/pdfAnonymize.ts`,
    pdf-lib, action `peerReviewFiles.anonymizeVersion`) : Author, Creator,
    Producer, Subject, Keywords, métadonnées XMP, `PieceInfo`, auteurs des
    annotations retirés, titre remplacé, **anciennes révisions élaguées**. Un
    PDF illisible (chiffré, corrompu) n'est PAS transmis : l'éditeur est averti
    et le libère après vérification (`releaseVersionFile`, audité) ;
  - l'auteur ne voit jamais ses relecteurs : avis numérotés (« Relecteur 1 »),
    montrés seulement une fois la version tranchée, sans le commentaire
    confidentiel à l'éditeur ;
  - l'éditeur voit tout (auteur, relecteurs, fichiers original et anonymisé).
  Test : chaque requête accessible au relecteur (7) est appelée et sa réponse
  sérialisée ne contient ni nom, ni adresse, ni identifiant, ni nom de fichier
  de l'autrice ; même chose côté auteur pour les relecteurs et l'éditeur.
- **Plusieurs relecteurs par manuscrit, avec échéance** (21 jours par défaut,
  entre 1 jour et 4 mois) et **relances** : tâche quotidienne
  `peer-review-reminders` (06:13 UTC, `convex/crons.ts`) — relance à
  l'échéance, puis tous les trois jours, trois fois au plus, puis l'éditeur
  qui a désigné le relecteur est prévenu (une fois). L'index `by_dueAt` ne
  contient que les relectures attendues.
- **Déclaration de conflit d'intérêts**, préalable à l'accès au fichier et au
  dépôt d'un avis ; une déclaration de conflit récuse le relecteur et prévient
  l'éditeur.
- **Décision éditoriale motivée** (20 caractères au moins), notifiée à l'auteur
  avec une notification propre à la décision ; accepter ou demander une
  révision exige au moins un avis sur la version évaluée (`NO_REVIEWS`).
- **Publication automatique** à l'acceptation : la publication passe
  `published` (date, DOI interne), avec le titre, le résumé, les mots-clés et
  le fichier de la version acceptée. Au rejet, le dépôt sort de la file de
  modération (brouillon refusé, motif en note).
- **Écrans** : `/admin/revue` (éditeur : file par étape, relecteurs et
  échéances, avis, décision motivée, dossier complet des versions),
  `/admin/mes-relectures` (relecteur : conflit d'intérêts, manuscrit anonymisé,
  différentiel, lettre de réponse, avis avec commentaire confidentiel),
  `/espace-membre/manuscrits` (auteur : suivi, décisions, avis numérotés,
  dépôt de la révision).

### Tables

- Ajoutées (`convex/lib/tables/editorial.ts`) : `annualReports`,
  `annualReportContents`, `annualReportPdfs`, `manuscriptVersions`,
  `manuscriptDecisions`.
- Modifiées en place (`convex/schema.ts`, champs optionnels) :
  `publications.reviewStage` (union élargie) ; `peerReviews.version`,
  `peerReviews.commentToEditor` ; `peerReviewAssignments.version`, `dueAt`,
  `remindersSent`, `lastReminderAt`, `overdueNotifiedAt`, `conflict`, index
  `by_dueAt`.

## 3. Données personnelles

`convex/editorial.ts` exporte `deleteUserDataEditorial(ctx, userId)` et
`exportUserDataEditorial(ctx, userId)` (sans `ctx.auth`), à brancher sur la
suppression / l'export de compte :

- rapports : l'attribution (`createdBy` / `updatedBy`) est retirée ;
- auteur : ses versions (et leurs fichiers de revue) sont supprimées ; pour un
  manuscrit non publié, tout le dossier de revue part avec lui ;
- relecteur : ses assignations et ses avis sont supprimés.

## 4. Dépendances, variables

- Ajoutées : `pdfkit` (composition du PDF, JS pur), `pdf-lib`
  (anonymisation des manuscrits), `@types/pdfkit`, `pdfjs-dist` (tests :
  extraction du texte et des glyphes).
- Aucune variable d'environnement.

## 5. Limites connues

- **Placement bidirectionnel au grain du mot** : suffisant pour de la prose ;
  un mot mêlant arabe et latin sans espace, ou des incrustations imbriquées,
  ne sont pas traités selon l'UAX #9 complet.
- **pdf.js ignore `/ActualText`** : le texte extrait par Firefox dépend du
  flux de glyphes (corrigé pour les ligatures, cf. § 1) ; Acrobat, Poppler et
  les lecteurs d'écran lisent le texte logique de chaque ligne arabe.
- **PDF balisé, non certifié PDF/UA** : la structure est produite, elle n'a
  pas été passée au validateur PAC.
- **Relances par notification seulement** : pas d'e-mail (le gabarit n'existe
  pas dans `convex/lib/emailContent.ts`).
- **Anonymisation des métadonnées, pas du texte** : un nom écrit dans les
  pages relève de l'auteur ; l'écran le lui demande.
- **Relecteurs = staff** (rang modérateur au moins) : un relecteur externe doit
  recevoir ce rang.
- Les polices embarquées pèsent 1,3 Mo de base64 dans le bundle de l'action
  Node ; le bundling Node de Convex n'a pas pu être vérifié par un déploiement
  (interdit dans ce chantier) — l'action a tourné de bout en bout sous
  convex-test.
- La clé `notifications.peerReviewDecided` n'est plus émise (remplacée par une
  clé par décision) ; les notifications déjà en base la gardent.
