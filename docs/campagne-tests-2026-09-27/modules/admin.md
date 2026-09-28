# RAPPORT — module `admin` (back-office `/fr/admin/**`)

Campagne « comme un humain », Chromium (Desktop Chrome, Pixel 7), Next en production sur http://localhost:3000, Convex local. Scripts : `explore/admin/*.mjs` (aide partagée `explore/admin/lib.mjs`). Un compte **par scénario** (`admin_<scenario>@democracytogether.test`), connexion par code OTP via l'écran réel `/fr/connexion-otp`. Les données de test sont créées par les écrans publics (`/fr/adhesion`, `/fr/contact`, `/fr/espace-membre/deposer`, `/fr/appels-a-projets`, `/fr/tribune`) ou, à défaut d'écran, par les actions publiques (`youth:applyYouth`, `mentorship:requestMentorship`, `organizations:submitApplication`).

Bilan : **17 scénarios**, **233 vérifications ✅ / 16 ❌** — dont **7 ❌ = anomalies réelles** (détaillées § 3) et 9 ❌ dus à des sélecteurs de script trop stricts (texte en capitales CSS, lecture d'un toast précédent, tri par octets vs `localeCompare`…) : listés § 2 comme « artefact » et vérifiés à l'œil sur les captures. Note : les fichiers `99-FAILURE.png` dans `admin--02`, `admin--03`, `admin--14` datent d'une première tentative avortée par une erreur de script (relance réussie ensuite) ; `INDEX.md` porte donc des lignes en double pour ces trois dossiers.

## 1. Périmètre couvert

| # | Scénario | Dossier `explore-out/` | Compte / rôle | Contenu |
|---|---|---|---|---|
| 01 | Tableau de bord, Impact, Événements, URL farfelues | `admin--01-tableau-de-bord` | admin | anonyme → redirection, lien depuis l'espace membre, 5 compteurs, 6 groupes / 15 entrées de nav, liens rapides + Précédent, `/fr/admin/zzz`, `/fr/admin/candidatures/abc123`, `?foo=<script>`, focus clavier |
| 02 | Candidatures | `admin--02-candidatures` | admin | dépôt via `/fr/adhesion` (XSS dans la présentation) + 3 via API (nom `<script>`, nom 120 car. + message 4000 car., 121 car. refusé), recherche, fiche annuaire (incomplète, site `javascript:`, XSS), approbation → `/fr/le-reseau` + fiche publique, rejet (Échap, Annuler, rechargement pendant la confirmation, double clic), candidature déjà traitée ailleurs (hors ligne), Précédent |
| 03 | Utilisateurs | `admin--03-utilisateurs` | admin | pagination 50 + « Charger la suite » (67), recherche, filtre rôle, rôle en deux temps (choisir ≠ appliquer, Annuler, rechargement pendant la boîte, confirmer, double clic), auto-rétrogradation, compte hérité « Visiteur », rétrograder un autre admin, invitation (vide, invalide) |
| 03b | Invitation | `admin--03b-invitation` | admin | adresse valide, réinvitation avec autre rôle (rôle inchangé), 273 car., double clic |
| 04a | Dépôt membre | `admin--04a-depot-membre` | membre (contexte séparé) | 3 dépôts par `/fr/espace-membre/deposer` (avec PDF, sans PDF, XSS titre/auteur/résumé) |
| 04b | File de publications | `admin--04b-publications` | admin | « Analyser avec l'IA » sans clé, recherche, approbation avec note, rejet (Annuler/confirmer), « Toutes », Rouvrir, `/fr/recherche` + `/fr/bibliotheque` + fiche, publication en attente invisible du public, déjà traitée ailleurs, Précédent |
| 05 | Messages de contact | `admin--05-contact` | admin | message via `/fr/contact` (XSS + 300 car. collés), mailto pré-rempli, traité (double clic) → oracle `contact:latestForEmail`, « Toutes », Rouvrir, Précédent |
| 06 | Newsletter | `admin--06-newsletter` | **éditeur** | abonnés, vide, trop court, XSS + long, envoi sans fournisseur e-mail (double clic), Précédent |
| 07 | Jeunes / Mentorat / Projets / Signalements | `admin--07-programmes` | admin | projet via `/fr/appels-a-projets`, billet + signalement via `/fr/tribune`, approuver/rouvrir, déjà traité ailleurs, apparier/rouvrir/clôturer, refuser/rouvrir/accepter, retirer (Échap, confirmer) → tribune publique |
| 08 | Comité de lecture | `admin--08-revue` | admin | file vide, ouverture par API (seule voie), avis (<10 car., XSS, doublon), assignation, décisions, filtre par étape, réouverture, clôture |
| 09 | Journal d'activité | `admin--09-journal` | admin | 50/page, mes actions en tête, recherche par famille (membership/publication/contact/tribune/user), sans résultat, filtre acteur, « Charger la suite », export CSV (nom, BOM, en-tête, lignes) |
| 10 | Modération IA | `admin--10-moderation-ia` | admin | état sans clé, compteurs, socle, avertissement « auto » (NON enregistré), valeurs hors bornes, enregistrement + rechargement, critère créer/modifier/supprimer (Annuler/confirmer), banc d'essai sans clé, remise à « Désactivé » |
| 11 | Rôle modérateur | `admin--11-role-moderateur` | moderateur | nav (3 groupes), les 15 URL en direct |
| 12 | Rôle éditeur | `admin--12-role-editeur` | editeur | nav (4 groupes), les 15 URL en direct |
| 13 | Rôle membre | `admin--13-role-membre` | membre | 5 URL admin, déconnexion puis Précédent |
| 14 | Mobile (Pixel 7, `tap()`) | `admin--14-mobile` | admin | tableau de bord, utilisateurs (rôle + boîte), publications (rejet + boîte), nav, cibles tactiles |
| 15 | Thème sombre | `admin--15-theme-sombre` | admin | tableau de bord, utilisateurs + boîte + toast, publications, fiche annuaire, modération IA |

## 2. Tableau des vérifications

| Fonctionnalité | Résultat | Preuve |
|---|---|---|
| Anonyme sur `/fr/admin` → redirigé vers `/fr/connexion` (middleware) | ✅ | `admin--01/01` |
| Lien « Espace d'administration » (admin) / absent pour un membre | ✅ | `admin--01/03`, `admin--13` |
| Tableau de bord : 5 compteurs numériques, liens rapides, Précédent | ✅ | `admin--01/04` |
| Navigation : 6 groupes / 15 entrées (admin), 4/12 (éditeur), 3/10 (modérateur), entrée courante unique, pas de défilement horizontal (desktop et 412 px) | ✅ | `admin--01/04`, `admin--11/01`, `admin--12/01`, `admin--14/02` |
| Impact : 10 indicateurs numériques | ✅ | `admin--01/05` |
| Événements : liste des inscriptions par événement, lecture seule | ✅ (❌ script = capitales CSS) | `admin--01/06` |
| Événements : créer / éditer / publier un événement, dates, slug | ⛔ **inexistant** (cf. § 4) | — |
| `/fr/admin/zzz`, `/fr/admin/candidatures/abc123` → 404 | ✅ (rendu hors charte, cf. C-1) | `admin--01/07`, `/08` |
| `/fr/admin?foo=<script>&page=-1` → tableau de bord, pas d'alert | ✅ | `admin--01/09` |
| Candidature par `/fr/adhesion` → dans la file « En attente » | ✅ | `admin--02/02`, `/03` |
| Nom de 121 car. refusé côté serveur (`INVALID_NAME`) | ✅ | journal 02 |
| XSS (nom, pays, présentation) affichés en texte, aucun `alert()` | ✅ | `admin--02/03`, `/12` |
| Nom de 100 car. collés / message de 4000 car. collés : mise en page | ❌ **M-1** | `admin--02/03` (28 415 px de large), `/15` |
| Recherche candidatures : préfixes tokenisés, message « Aucun résultat » | ✅ vu à l'écran (2 ❌ script : le terme correspondait aussi à une candidature d'une tentative précédente ; le message sans résultat est vérifié ✅ sur publications, utilisateurs, journal) | `admin--02/04` |
| Fiche annuaire : incomplète → message, site `javascript:` refusé | ✅ / message générique ❌ **m-3** | `admin--02/06`, `/07` |
| Approbation → toast nommé, ligne quitte la file, statut « Approuvée » sans bouton | ✅ | `admin--02/08`, `/11` |
| Organisation approuvée visible dans `/fr/le-reseau` + fiche publique (description `<script>` en texte) | ✅ | `admin--02/09`, `/10` |
| Rejet : boîte nommée, focus sur Annuler, Échap, Annuler, rechargement pendant la boîte, double clic, toast | ✅ | `admin--02/12`, `/13` |
| Candidature déjà traitée ailleurs (approuver une approuvée) → « Action non effectuée… », ligne disparue | ✅ | `admin--02/14`, `/15` |
| Précédent après une action : aucune action rejouée | ✅ | `admin--02/16`, `admin--03/08` |
| Utilisateurs : 50 lignes, « Charger la suite », tri par index e-mail | ✅ (❌ script : tri octets vs `localeCompare` sur `_`) | `admin--03/01`, `/02` |
| Recherche + filtre rôle combinés, « Aucun résultat » | ✅ | `admin--03/03`, `/04` |
| Rôle : choisir n'applique pas ; Appliquer → boîte nommée (« Membre » → « Modérateur ») ; Annuler ; rechargement pendant la boîte ; confirmer → toast ; double clic neutralisé | ✅ | `admin--03/05`–`/07` |
| Se rétrograder soi-même : sélecteur désactivé + `title` explicatif | ✅ | `admin--03/09` |
| Compte hérité sans rôle → « Visiteur » | ✅ | `admin--03/10` |
| Rétrograder un autre administrateur (pas le dernier) | ✅ | journal 03 |
| Invitation : vide/invalide bloqués (HTML5), adresse valide créée, réinvitation ne change pas le rôle, 273 car. refusé avec message, double clic → 1 compte | ✅ | `admin--03/11`, `admin--03b/*` |
| Dépôt membre (3 publications, PDF factice) → « Soumission reçue », « EN REVUE » | ✅ (❌ script = capitales) | `admin--04a/*` |
| File publications : e-mail auteur, « Voir le document », « Aucun document joint », XSS en texte | ✅ | `admin--04b/01` |
| « Analyser avec l'IA » sans dispositif → « Le dispositif est désactivé. » | ✅ | `admin--04b/02` |
| Approbation avec note → toast ; rejet (Annuler/confirmer) → toast ; note affichée ; Rouvrir → En attente | ✅ (Rouvrir sans retour : m-5) | `admin--04b/04`–`/07` |
| Publication approuvée dans `/fr/recherche`, `/fr/bibliotheque`, fiche ; publication en attente invisible | ✅ | `admin--04b/08`–`/10` |
| Publication déjà rejetée ailleurs → refus visible | ✅ | `admin--04b/11` |
| Contact : message public dans la file, mailto « Re: », date, retours à la ligne | ✅ | `admin--05/02` |
| Contact : corps de 300 car. collés | ❌ **M-1** | `admin--05/02` (2 464 px) |
| Contact : traité → quitte la file (oracle `handled=true`), « Toutes », Rouvrir (`handled=false`) | ✅ | `admin--05/03`, `/04` |
| Newsletter (éditeur) : abonnés, brouillon créé, XSS en texte, formulaire vidé | ✅ | `admin--06/03` |
| Newsletter : objet 2 car. / message 5 car. → rien ne se passe, aucun message | ❌ **m-4** | `admin--06/02` |
| Newsletter : « aperçu » d'une campagne | ⛔ inexistant | — |
| Newsletter : envoi sans clé e-mail → « Envoyée · 3 envoyés · 0 en échec », bouton disparu, aucun retour | ✅ comportement dev (cf. m-4) | `admin--06/04`, `/05` |
| Jeunes / Mentorat / Projets : décider, « Toutes », Rouvrir, notes, XSS en texte | ✅ | `admin--07/02`–`/07` |
| Jeunes : approuver une candidature déjà rejetée ailleurs → aucun retour | ❌ **m-2** | `admin--07/04` |
| Signalements : boîte « Retirer cette prise de parole… » avec extrait, Échap, confirmer → toast, retiré de `/fr/tribune` | ✅ | `admin--07/08`–`/10` |
| Comité de lecture : ouvrir une revue depuis l'interface | ❌ **M-3** | `admin--08/01` |
| Comité de lecture : avis (<10 car. désactivé), agrégat, assignation, décisions, filtre, réouverture, clôture | ✅ | `admin--08/02`–`/07` |
| Comité de lecture : second avis du même relecteur → refus silencieux | ❌ m-2 | `admin--08/04` |
| Journal : 50/page, ma dernière action en tête, familles d'actions, filtre acteur, « Charger la suite », sans résultat | ✅ | `admin--09/01`–`/03` |
| Journal : export CSV (`journal-2026-09-27.csv`, BOM, en-tête, 79 lignes = lignes chargées, dates ISO) | ✅ | `admin--09/04` |
| Modération IA : état « Aucune clé… », compteurs, socle non désarmable, mode `off` au départ | ✅ | `admin--10/01` |
| Modération IA : avertissement « Auto-publication » à la sélection (non enregistré) | ✅ | `admin--10/02` |
| Modération IA : confiance 150 / plafond 0 refusés (validation HTML min/max) ; enregistrement Observation/95/50 persistant après rechargement | ✅ (❌ script : le toast lu était le bandeau d'état) | `admin--10/03`, `/04` |
| Modération IA : critère créer (XSS en texte) / modifier (Inactif) / supprimer (Annuler, confirmer, persistant) | ✅ | `admin--10/05`–`/07` |
| Modération IA : banc d'essai sans clé → « Analyse indisponible » / « Analyse impossible : AI_GATEWAY_NOT_CONFIGURED » | ✅ | `admin--10/09` |
| Modérateur : utilisateurs / journal / modération IA → « Réservé aux administrateurs. » (nav conservée) | ✅ | `admin--11/13`–`/15` |
| Modérateur : `/fr/admin/revue`, `/fr/admin/newsletter` en URL directe | ❌ **M-2** (page 500) | `admin--11/11`, `/12` |
| Éditeur : revue + newsletter rendus, écrans admin réservés | ✅ | `admin--12/*` |
| Membre : tout `/fr/admin/**` → « 403 Accès réservé » + retour accueil, nav absente | ✅ | `admin--13/*` |
| Déconnexion puis Précédent → page de connexion | ✅ (URL avec `?_rsc=` : C-2) | `admin--13/06` |
| Mobile : tableau de bord, nav groupée dans 412 px, tableau utilisateurs dans une région défilable focalisable, boîtes dans l'écran, actions au doigt + toasts | ✅ (❌ script : `[role=status]` de l'en-tête lu à la place du toast — le toast est sur `admin--14/07`) | `admin--14/*` |
| Mobile : titre de la boîte (e-mail long) coupé, colonne e-mail hors écran une fois le tableau défilé, cibles < 32 px | ❌ **m-6** / **C-3** | `admin--14/06`, `/07`, journal 14 |
| Sombre : fond `rgb(20,23,28)`, cartes, nav, champs, boîte, toast, badges lisibles | ✅ | `admin--15/*` |
| Erreurs de page JS sur l'ensemble | ✅ 0 sur 17 scénarios | journaux |

## 3. Anomalies

### Majeur

**M-1 — Une chaîne longue sans espace casse la mise en page de plusieurs files (candidatures, contact, jeunes).**
Repro : `/fr/adhesion` (ou l'action publique) avec un nom d'organisation de 100 caractères collés ou une présentation de 4 000 caractères collés ; `/fr/contact` avec un message contenant 300 caractères collés ; `/fr/jeunes` avec une motivation de 120 caractères collés. Ouvrir `/fr/admin/candidatures`, `/fr/admin/contact`, `/fr/admin/jeunes`.
Attendu : le texte est coupé/replié dans la carte. Constaté : la page entière déborde horizontalement (capture pleine page de 28 415 px pour les candidatures, 2 464 px pour le contact ; sur jeunes le texte sort de la carte). Comme ces champs sont saisis par le PUBLIC, une seule soumission suffit à rendre l'écran de modération pénible (défilement horizontal sur toute la page).
Preuves : `admin--02-candidatures/03-file-en-attente.png`, `15-stale-retour.png` ; `admin--05-contact/02-file-contact.png` ; `admin--07-programmes/02-jeunes-file.png` ; journaux : `horizontalOverflow` → `h2.font-display.text-lg right=1447` (viewport 1280).
Cause probable : `src/app/[locale]/admin/candidatures/page.tsx` (`<h2>` et `<p className="mt-3 max-w-[70ch]…">`), `contact/page.tsx` (`<p className="… whitespace-pre-line …">`), `jeunes/page.tsx` (`<p className="mt-2 …">`) : aucun `break-words` / `overflow-wrap:anywhere` ; `max-w-[70ch]` ne contraint pas un mot insécable. Idem probable sur mentorat/projets/publications (résumé) — non déclenché ici.

**M-2 — Un modérateur qui ouvre `/fr/admin/revue` ou `/fr/admin/newsletter` tombe sur la page d'erreur 500 « Une erreur est survenue ».**
Repro : compte `moderateur`, saisir l'URL `/fr/admin/newsletter` (l'entrée n'est pas dans la nav, mais un lien copié par un éditeur ou l'historique du navigateur y mène).
Attendu : message propre comme sur `/fr/admin/utilisateurs` (« Réservé aux administrateurs. »). Constaté : frontière d'erreur Next (`src/app/[locale]/error.tsx`) : « 500 — Une erreur est survenue… Réessayer », le back-office disparaît. Console : `[CONVEX Q(newsletter:subscriberCount)] Accès refusé : rôle « editeur » requis.` et `peerReview:getReviewQueue`.
Preuves : `admin--11-role-moderateur/11-moderateur-revue.png`, `12-moderateur-newsletter.png`, journal 11 (4 erreurs console).
Cause : `src/app/[locale]/admin/newsletter/page.tsx` et `revue/page.tsx` appellent `useQuery`/`usePaginatedQuery` sans garde de rôle côté UI (contrairement à `utilisateurs`, `journal`, `moderation-ia` qui testent `isAdmin(me?.role)` avant de lancer la query) ; la query lève et la promesse rejetée remonte à la frontière d'erreur.

**M-3 — Le comité de lecture est inaccessible depuis l'interface : impossible d'ouvrir une revue.**
Repro : éditeur/admin sur `/fr/admin/revue` → « Aucune publication en revue pour le moment. » et aucun moyen de choisir une publication.
Constaté : la seule transition d'entrée est `peerReview.assignReviewer(publicationId, …)` (convex/peerReview.ts), mais l'écran ne propose « Assigner un relecteur » que sur des lignes déjà en revue (`getReviewQueue` ne liste que `reviewStage` défini) ; aucun autre module ne pose `reviewStage` (grep : seul `peerReview.ts`). La fonctionnalité F-43 est donc un cul-de-sac en production : j'ai dû appeler la mutation par l'API pour tester le reste de l'écran (qui fonctionne : `admin--08-revue/02`→`/07`).
Preuve : `admin--08-revue/01-revue-initiale.png`. Cause : absence d'un point d'entrée (sélecteur de publication publiée / bouton « Ouvrir une revue » dans la file de publications).

### Mineur

**m-1 — La 404 sous `/fr/admin/**` est la page racine non localisée, hors charte.** `/fr/admin/zzz` et `/fr/admin/candidatures/abc123` rendent `src/app/not-found.tsx` (police système, bilingue FR/EN, boutons « Accueil / Home », sans en-tête ni pied de page) au lieu de `src/app/[locale]/not-found.tsx`. Preuves : `admin--01-tableau-de-bord/07-admin-zzz.png`, `08-admin-candidatures-id.png`. Cause probable : segment inconnu sous `[locale]/admin` non capturé par le `not-found` du locale (pas de `[...rest]`/`notFound()` dans le layout admin).

**m-2 — Refus serveur silencieux sur Jeunes, Mentorat, Projets, Comité de lecture, Newsletter, Contact (issue #38 non généralisée).** Repro : deux onglets ; décision prise ailleurs ; cliquer « Approuver » (jeunes) sur la ligne encore affichée → la ligne change d'état sans un mot ; déposer un second avis en revue → rien, le texte reste dans le champ ; assigner → rien. Preuves : `admin--07-programmes/04-jeunes-deja-traitee.png` + console `ALREADY_REVIEWED` ; `admin--08-revue/04-second-avis.png` + console `ALREADY_REVIEWED`. Cause : `catch { /* idem */ }` dans `jeunes/page.tsx`, `mentorat/page.tsx`, `projets/page.tsx`, `revue/page.tsx`, `newsletter/page.tsx`, `contact/page.tsx` — pas d'appel à `useActionFeedback`.

**m-3 — Message d'erreur trompeur sur la fiche annuaire : site web `javascript:alert(1)` → « Action non effectuée. Vérifiez vos droits, puis réessayez. »** Le serveur refuse (`INVALID_WEBSITE`, bonne défense) mais l'écran accuse les droits ; le modérateur ne sait pas quel champ corriger. Preuve : `admin--02-candidatures/07-site-javascript-refuse.png`, console `INVALID_WEBSITE`. Cause : `candidatures/page.tsx` `decide()` → `notify(t('feedbackError'))` quel que soit le code d'erreur ; `directory-fields.tsx` ne valide pas l'URL côté client.

**m-4 — Newsletter : création de brouillon trop court sans aucun message ; envoi sans aucun retour.** Objet « ab » + message « court » → clic sans effet (le garde `subject.trim().length < 3 || body.trim().length < 10` sort en silence, aucun `minLength`/message). Après « Envoyer à 3 abonnés », rien n'est annoncé ; la campagne passe « Envoyée · 3 envoyés » alors qu'aucun fournisseur n'est configuré (no-op `AUTH_DEV_OTP` — en production ce serait « Erreur », mais l'écran ne l'expliquerait pas non plus). Aucun aperçu du rendu HTML avant envoi. Preuves : `admin--06-newsletter/02-trop-court.png`, `04-envoi-en-cours.png`, `05-apres-envoi.png`. Cause : `newsletter/page.tsx` (`onCreate` retour silencieux ; `onSend` sans `notify`).

**m-5 — « Rouvrir » (publications, jeunes, mentorat, projets, contact) n'affiche aucun retour, contrairement aux décisions.** Le toast précédent (« … rejetée. ») reste visible pendant la réouverture, ce qui peut se lire à l'envers. Preuve : `admin--04b-publications/07-rouverte.png` (note du journal : toast lu = rejet). Cause : `reopenReview()` sans `notify`.

**m-6 — Mobile : le titre de la boîte de confirmation « Changer le rôle de <e-mail long> ? » est coupé à droite.** L'e-mail (38 car. sans espace) dépasse le panneau (`text-balance` sans `break-all`). Preuve : `admin--14-mobile/06-mobile-dialogue-role.png`. Cause : `src/components/ui/confirm-dialog.tsx` `<h2 className="text-balance …">`.

**m-7 — Journal des décisions IA : un dépôt supprimé s'affiche par son identifiant brut** (`nn77brstjrrz…` à la place du titre). Preuve : `admin--10-moderation-ia/01-panneau.png` (section « Décisions récentes »). Cause : `moderation-ia/page.tsx` `review.publicationTitle ?? review.publicationId`.

### Cosmétique

**C-1 — Utilisateurs (mobile) : une fois le tableau défilé pour atteindre « Appliquer », la colonne e-mail (identité) est hors écran** ; on confirme un rôle sans voir à qui il s'applique dans la ligne (la boîte le rappelle, heureusement). Preuve : `admin--14-mobile/07-mobile-toast-role.png`. Piste : figer la première colonne ou passer en cartes sous `sm`.

**C-2 — Après déconnexion puis Précédent, l'URL affichée est `/fr/connexion?_rsc=…`** (paramètre interne RSC exposé). Preuve : journal `admin--13-role-membre` (note), `06-deconnecte-precedent.png`.

**C-3 — Cibles tactiles sous 32 px sur mobile** : liens rapides du tableau de bord (20 px), pastilles « En attente / Toutes » (30 px), lien « Voir le document » (18 px), bouton « Fermer le message » du toast (20 px, en partie coupé au bord droit sur `admin--14-mobile/07`). Journal 14 (notes `cibles tactiles`).

**C-4 — Auto-rétrogradation : le sélecteur est simplement grisé, l'explication n'existe qu'en `title` (survol)** — invisible au doigt et non annoncée. Preuve : `admin--03-utilisateurs/09-self-verrouille.png`.

**C-5 — Toasts du back-office : un seul message à la fois** ; une action rapide après une autre remplace le précédent (visible sur `admin--04b/07`). Comportement voulu par `action-feedback.tsx`, mais le message de succès de « Rouvrir » n'existant pas (m-5), l'ancien reste affiché.

### Points positifs notables
Rôles cloisonnés partout côté serveur (aucune écriture indue observée) ; XSS systématiquement neutralisés (candidatures, publications, contact, jeunes, mentorat, projets, tribune, newsletter, critères IA, fiche publique) — aucun `alert()` sur 17 scénarios ; garde-fous #38 exemplaires sur candidatures / publications / signalements / rôles / critères IA (boîte nommée, focus sur Annuler, Échap, rechargement sans effet, double clic neutralisé, retour visible) ; état stable après « Précédent » ; journal d'activité complet (toutes les actions jouées y figurent, export CSV conforme RFC 4180 + BOM) ; thème sombre cohérent sur tous les écrans visités.

## 4. Non testé et pourquoi

- **Création / édition / publication d'événements, dates incohérentes, slug** : n'existe pas. `/fr/admin/evenements` est une liste en lecture seule des inscriptions ; les événements viennent du code (`src/lib/events-content.ts`), pas d'une table Convex. Aucun bouton de création (vérifié `admin--01/06`).
- **Aperçu d'une campagne newsletter** : n'existe pas (pas de bouton, pas de rendu HTML côté écran).
- **Envoi réel d'e-mails** (invitations, campagnes) : aucun fournisseur ; les envois sont des no-op journalisés (`[DEV EMAIL]`), donc seul l'état affiché a pu être vérifié.
- **Modération IA avec passerelle** (analyse, auto-publication, avis dans la file) : pas de clé, et interdiction d'armer l'auto-publication ; seuls l'état annoncé, le mode Observation (enregistré puis remis à `off`), le barème, le banc d'essai (échec attendu) et le journal ont été joués.
- **Dernier administrateur** (refus serveur « Impossible de rétrograder le dernier administrateur ») : plusieurs admins de test existent ; non reproductible sans purger les autres comptes.
- **Ouverture d'une revue par l'interface** : impossible (M-3) ; l'écran a été testé après ouverture par l'API.
- **Notifications reçues par les candidats / auteurs** (`notify`) : hors périmètre du module.
