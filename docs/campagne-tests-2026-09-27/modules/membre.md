# RAPPORT — module `membre` (espace membre, centre de connaissances, espaces collaboratifs, notifications)

Testeur « humain » par l'interface (Playwright + harnais), 27 sept. 2026. Application `next start` sur :3000, Convex local.
Scripts : `scratchpad/explore/membre/0*.mjs` (+ `lib.mjs` : connexion OTP par l'UI, PDF minimal généré, provisionnement via `devAdmin:setRoleByEmail`).
Comptes uniques : `membre_depot`, `membre_moderateur`, `membre_visiteur`, `membre_espaces`, `membre_espaces2`, `membre_recherche`, `membre_mobile` (@democracytogether.test). Marqueur des données de test : `QA-membre-2026` — publications nettoyées (`devAdmin:deleteTestPublications` → `deleted: 4`).

## 1. Périmètre couvert

| # | Scénario | Dossier `explore-out/` | Résultat final |
|---|---|---|---|
| 1 | Bibliothèque publique : liste, pagination, facettes (thème/type/région/langue/accès, combinaisons), réinitialisation, recherche (présent/absent/accents/casse/auteur/guillemets/XSS/3000 car.), tri, params farfelus, `/fr/analyses`, slug inexistant, `../..`, vue document d'une seed, nav « Analyses », focus clavier | `membre--biblio-publique/` | 31 ✅ / 1 ❌ |
| 2 | Fiche publication : résumé, points clés, téléchargement, citation APA/BibTeX/RIS/copie DOI, métadonnées, impact, liées, compteur de vues (recharges, 2e onglet), Précédent, publication réservée en visiteur, version EN + traduction indisponible | `membre--fiche-publication/` | 25 ✅ / 0 ❌ |
| 3 | Dépôt : visiteur non connecté, connexion OTP, notifications vides, espace membre vide, formulaire vide, titre 260 car., année 1980, aucune langue, .txt renommé .pdf, PNG, PDF 0 octet, PDF 21 Mo, PDF valide + métadonnées complètes, double clic, Précédent/Suivant, « Mes contributions », invisibilité publique (contexte anonyme : liste, URL directe, recherche) | `membre--depot/` | 32 ✅ / 3 ❌ |
| 4 | Modération (2e contexte, modérateur, `/fr/admin/publications` : rejet avec note + confirmation, approbation) → notifications côté membre (pastille, liste, clic → fiche, tout marquer comme lu, clic rejet → espace membre), fiche publiée (PDF réel téléchargé), vue document + « Préparer en English » sans clé IA, visibilité anonyme | `membre--moderation-notifications/` | 32 ✅ / 0 ❌ |
| 5 | Compte rôle « visiteur » : redirections non connecté (fr/en), espace membre (bloc adhésion), dépôt refusé, `/fr/espaces`, notifications, publication réservée, déconnexion puis Précédent | `membre--visiteur-espace-membre/` | 14 ✅ / 1 ❌ |
| 6 | Espaces collaboratifs : création (vide, 3 car., description courte, 300 car., XSS), détail, notes (vide, 1 car., XSS, 4500 car., normale), rechargement, `/fr/espaces/zzz`, id inexistant, 2e membre (lecture, rejoindre, note, temps réel, quitter), compte visiteur | `membre--espaces/` | 29 ✅ / 3 ❌ |
| 7 | Recherche transverse connecté : `/fr/recherche` (terme, membres, marqueur, 1 car., aucun, XSS, 2000 car.), palette ⌘K de l'en-tête | `membre--recherche/` | 15 ✅ / 0 ❌ |
| 8 | Mobile (Pixel 7) : bibliothèque (filtres repliés, badge), fiche, connexion OTP, dépôt complet, espace membre | `membre--mobile/` | 14 ✅ / 0 ❌ |
| 9 | Thème sombre : bibliothèque filtrée, fiche, citation | `membre--biblio-sombre/` | 2 ✅ / 0 ❌ |

Total : 194 ✅ / 8 ❌. (INDEX.md contient aussi des exécutions intermédiaires ❌ dues à mes scripts — sélecteurs, session expirée — corrigées puis rejouées ; les dossiers ne gardent que la dernière exécution.)

## 2. Tableau des vérifications

| Fonctionnalité | Résultat | Remarques |
|---|---|---|
| Bibliothèque : liste (14), 9 cartes/page, pagination Précédent/Suivant, `page=999` ramené à la dernière page | ✅ | |
| Facettes thème/type/région/langue/accès, combinaison (ET entre facettes), aria-current, Réinitialiser | ✅ | Pas de facette auteur ni date (seulement recherche auteur et tri « Plus récentes ») |
| Paramètres farfelus (`page=-3&sort=zzz&theme=zzz`) | ✅ | État vide propre ; mais la valeur inconnue « Zzz » est rendue comme option cochée (cosmétique, A-10) |
| Recherche : terme présent, casse, auteur, absent, XSS, 3000 car. | ✅ | |
| Recherche : sans accent (« democratie ») | ❌ | A-4 |
| Recherche : guillemets / terme présent seulement dans le résumé | ⚠️ | Recherche littérale titre+auteurs uniquement (A-4 bis) |
| Tri A→Z, plus citées, conservation des filtres | ✅ | |
| `/fr/analyses` → `/fr/bibliotheque`, nav « Analyses » | ✅ | |
| Slug inexistant, `..%2F..`, vue document sans fichier, vue document d'une réservée en visiteur → 404 | ✅ | |
| Fiche : résumé, points clés, citation APA/BibTeX, copie citation/RIS/DOI, métadonnées, impact, liées, Précédent | ✅ | |
| Fiche : compteur de consultations (+1 par session, pas de double comptage au rechargement) | ✅ | L'affichage n'inclut pas la visite en cours (décalage d'une vue, A-9) |
| Fiche : « Télécharger le PDF » d'une seed sans fichier | ⚠️ | Pointe vers doi.org (A-8) ; compteur « Télécharg. » jamais incrémenté (aucune mutation) |
| Fiche réservée en visiteur / compte visiteur : verrou, CTA adhésion + connexion | ✅ | |
| Fiche EN : bandeau traduction, « Translate » → « not configured on this deployment » | ✅ | |
| Dépôt : refus non connecté (redirection serveur `/fr/connexion`) | ✅ | |
| Dépôt : validations (vide, titre, année, langues, 20 Mo) avec focus et aria-invalid | ✅ | |
| Dépôt : .txt renommé .pdf accepté | ❌ | A-2 |
| Dépôt : PNG refusé mais message générique | ❌ | A-3 |
| Dépôt : PDF de 0 octet accepté | ❌ | A-2 |
| Dépôt : PDF valide, confirmation, pas de doublon au double clic, Précédent/Suivant sains | ✅ | |
| Dépôt : invisible publiquement tant que non modéré (liste, URL, recherche) | ✅ | |
| Modération UI : file, « Voir le document », rejet confirmé nommant la publication, approbation | ✅ | |
| Notifications : état vide, pastille (2 non lues), libellés, clic → lien, lu à l'ouverture, « Tout marquer comme lu » | ✅ | |
| Mes contributions : En revue → Publié + Ouvrir ; Brouillon + note du modérateur | ✅ | |
| Vue document après publication : message clair, PDF d'origine, sélecteur de langue, « n'est pas configuré » | ✅ | |
| Compte visiteur : espace membre, dépôt, notifications, redirections fr/en | ✅ | |
| Compte visiteur : `/fr/espaces` | ❌ | A-1 (page 500) |
| Espaces : création (bornes, XSS échappé), détail, notes, temps réel, rejoindre/quitter, animateur ne peut quitter | ✅ | Nom vide = validation native du navigateur (A-7) ; « Membre » comme nom (A-11) |
| Espaces : note > 4000 car. | ⚠️ | Silencieusement perdue (A-5) |
| Espaces : `/fr/espaces/zzz`, id inexistant | ❌ | A-1 (page 500) |
| Espaces : compte visiteur sur un espace | ❌ | A-1 (page 500) |
| Espaces : membre réseau non membre de l'espace | ✅ (par conception) | Peut LIRE l'espace et ses notes, ne peut pas écrire ; « refus » attendu par le scénario n'est pas le modèle du code (`getWorkspace` = membre réseau) — voir A-6 |
| Recherche transverse connecté + palette ⌘K | ✅ | `beforeunload` inattendu (A-12) |
| Mobile : bibliothèque, fiche, dépôt, espace membre — aucun débordement horizontal | ✅ | |
| Thème sombre : bibliothèque, fiche | ✅ | Contrastes corrects |
| Erreurs console/page/requêtes ≥ 400 inattendues | ✅ | Seules : 404 attendues, `INVALID_FILE`/`INVALID_NOTE`/`Accès refusé`/`ArgumentValidationError` remontées telles quelles en console (liées aux anomalies ci-dessous) |

## 3. Anomalies

### Majeur

**A-1 — Page d'erreur 500 (« Une erreur est survenue ») sur les espaces collaboratifs pour un compte « visiteur », un id malformé ou un id inexistant.**
- Repro : (a) connecté avec un compte rôle `visiteur` → `/fr/espaces` ; (b) tout membre → `/fr/espaces/zzz` ; (c) membre → `/fr/espaces/<id bien formé mais inexistant>` (dernier caractère modifié) ; (d) compte visiteur → `/fr/espaces/<id réel>`.
- Attendu : (a) bloc « Réservé aux membres » + CTA (celui prévu par `WorkspacesBoard`) ; (b)(c) « Espace introuvable » + lien « Tous les espaces » ; (d) bloc « Réservé aux membres ».
- Constaté : frontière d'erreur `src/app/[locale]/error.tsx` (500) dans les quatre cas (HTTP 200 mais page d'erreur).
- Captures : `membre--visiteur-espace-membre/04-espaces-visiteur.png`, `membre--espaces/10-espace-id-malforme.png`, `11-espace-id-inexistant.png`, `60-visiteur-refuse.png`.
- Journal : `Uncaught Error: Accès refusé : rôle « membre » requis. at requireNetworkRole (convex/lib/rbac.ts:45) … workspaces.ts:178` ; `ArgumentValidationError: Value does not match validator. Path: .workspaceId Value: "zzz" Validator: v.id("workspaces")`.
- Cause : `src/components/workspaces/workspaces-board.tsx` appelle `useQuery(api.workspaces.listWorkspaces)` sans condition (avant de savoir si `me.role` est membre) ; `src/components/workspaces/workspace-detail.tsx` appelle `useQuery(api.workspaces.getWorkspace, { workspaceId })` avec l'id brut de l'URL sans `'skip'` ni validation. Une query Convex qui lève fait lever `useQuery` → error boundary. Correctif : `isMember(me?.role) ? {} : 'skip'`, et pour le détail `'skip'` tant que `me` n'est pas membre + traiter l'erreur de validation d'id (ou vérifier l'id via `ctx.db.normalizeId` côté serveur et renvoyer `null`).

### Mineur

**A-2 — Le contenu du fichier déposé n'est pas vérifié : un `.txt` renommé `.pdf` et un PDF de 0 octet sont acceptés et partent en modération (le modérateur a un lien « Voir le document » vers un fichier illisible).**
- Repro : dépôt avec `faux.pdf` (texte brut, le navigateur annonce `application/pdf` d'après l'extension) ; dépôt avec `vide.pdf` (0 octet) → « Soumission reçue ».
- Captures : `membre--depot/10-txt-renomme-pdf-resultat.png`, `12-pdf-vide-resultat.png`, file de modération `membre--moderation-notifications/01-admin-file-moderation.png` (lignes « zero » / « txt-renomme »).
- Cause : `convex/publications.ts` (`submitPublication`) ne vérifie que `meta.size > MAX` et le content-type annoncé ; pas de taille minimale ni de signature `%PDF` (alors que `convex/lib/pdfImages.ts` expose `looksLikePdf`). Côté client `publication-submit-form.tsx` ne lit pas les premiers octets.

**A-3 — Fichier PNG refusé côté serveur mais message générique « Une erreur est survenue. Réessayez. »** (l'utilisateur ne sait pas que c'est le type de fichier ; la saisie est bien conservée).
- Capture : `membre--depot/11-png-resultat.png`. Journal : `[CONVEX M(publications:submitPublication)] Uncaught Error: INVALID_FILE`.
- Cause : `submitPublication` lève un `Error('INVALID_FILE')` nu (masqué en prod) ; le formulaire ne distingue que `RATE_LIMITED` et `UPLOAD_FAILED` (`isRateLimited` / `UPLOAD_FAILED`). Un `ConvexError('INVALID_FILE')` + message dédié suffirait. À noter : le blob uploadé reste orphelin (commentaire dans le code).

**A-4 — Recherche de la bibliothèque sensible aux accents et limitée au titre + auteurs.** « démocratie » → 2 publications, « democratie » → aucune ; « institutions » (présent dans les résumés) → aucune ; `"démocratie"` (guillemets) → aucune, alors que la recherche transverse `/fr/recherche` cherche aussi le résumé.
- Captures : `membre--biblio-publique/09-recherche-democratie.png`, `10-recherche-sans-accent.png`, `13-recherche-guillemets.png`.
- Cause : `convex/lib/publications.ts` `matchesPublication` : `haystack.includes(q.toLowerCase())` sans `normalize('NFD')` ; `convex/lib/search.ts#normalizeSearchTerm` existe mais n'est utilisé que dans `listForReview`. Même absence de normalisation dans `convex/search.ts#globalSearch`.

**A-5 — Note d'espace collaboratif trop longue (> 4000 caractères) perdue en silence.** Clic « Publier la note » : rien ne se passe, aucun message, la saisie reste dans le champ. Idem pour 1 caractère (rien, sans message).
- Capture : `membre--espaces/08-note-trop-longue.png`. Journal : `[CONVEX M(workspaces:addNote)] Uncaught Error: INVALID_NOTE (workspaces.ts:131)`.
- Cause : `workspace-detail.tsx` `NoteForm` → `catch { /* on n'insiste pas */ }` ; pas de `maxLength` sur le textarea, pas de compteur, pas de `FormError`.

**A-6 — Modèle d'accès des espaces à confirmer : tout membre du réseau lit le contenu (description, membres, toutes les notes) d'un espace dont il n'est pas membre.** Constaté avec `membre_espaces2` (capture `membre--espaces/50-autre-membre-non-membre.png`). C'est ce que fait `convex/workspaces.ts#getWorkspace` (garde `requireNetworkRole('membre')` seulement, `isMember` ne sert qu'à l'écriture). Si l'intention produit est « espace = groupe fermé », c'est une fuite ; sinon, à documenter (le texte de la page dit « invitez d'autres membres », et il n'existe aucune UI d'invitation : un espace est rejoint librement).

**A-7 — Formulaire de création d'espace : validation native du navigateur (« Please fill out this field. », en anglais dans Chromium) au lieu des messages applicatifs utilisés partout ailleurs** (le formulaire de dépôt est en `noValidate` avec messages FR par champ). Le message applicatif « au moins 4 caractères » n'apparaît que pour un titre non vide. Capture : `membre--espaces/03-creation-vide.png`. Cause : `workspaces-board.tsx` `<form>` sans `noValidate`, champs `required`, erreurs regroupées en bas via `FormError`.

**A-8 — Sur les 14 publications de démo (sans fichier), « Télécharger le PDF » et « Lire en ligne » ouvrent `https://doi.org/10.59000/dt.2026.100` (DOI fictif, hors ligne) et le compteur « Télécharg. » n'est jamais incrémenté** (aucune mutation ne le fait ; `downloads` n'est écrit que par le seed/devAdmin). Capture : `membre--fiche-publication/02-fiche-entiere.png` (href relevé dans le journal). Cause : `src/app/[locale]/bibliotheque/[slug]/page.tsx` `fileHref = pub.fileUrl ?? doiUrl`. Libellé trompeur tant que le fichier manque ; à masquer/renommer.

**A-12 — Boîte « Voulez-vous quitter la page ? » (`beforeunload`) levée en quittant `/fr/recherche?q=…` après un geste utilisateur, sans saisie non enregistrée.** Reproduit deux fois sur trois exécutions (journal `membre--recherche/journal.md` : `DIALOG type=beforeunload`, puis `net::ERR_ABORTED` sur la navigation suivante ; console : `Blocked attempt to show a 'beforeunload' confirmation panel…`). Cause probable (bundles) : `@convex-dev/auth` (`ConvexAuthProvider` pose un `beforeunload` bloquant pendant le rafraîchissement du jeton : « Are you sure you want to leave? Your changes may not be saved. ») et/ou l'option `unsavedChangesWarning` par défaut du client Convex (mutation en vol, ex. `recordPublicationView`). Un lecteur qui clique un lien pendant la rotation du jeton verra ce dialogue en anglais. Piste : `unsavedChangesWarning: false` sur le `ConvexReactClient` et vérifier la version de `@convex-dev/auth`.

### Cosmétique

**A-9 — Compteur de consultations affiché en retard d'une vue** (rendu serveur avant l'enregistrement client) : 4 220 → recharge → 4 221 → recharge → 4 222 → recharge → 4 222. Capture `membre--fiche-publication/05-compteur-vues.png`. Comportement acceptable, à connaître.

**A-10 — Valeur de facette inconnue dans l'URL (`?theme=zzz`) rendue comme option cochée « Zzz 0 »** dans la liste des thématiques. Capture `membre--biblio-publique/04-params-farfelus.png`. Cause : `computePublicationFacets` (convex/lib/publications.ts) injecte les valeurs actives absentes du corpus.

**A-11 — Espaces : le nom affiché des membres/animateurs/auteurs de notes est « Membre »** pour tout compte sans `name` (comptes OTP) : « Animé par Membre », note signée « Membre » — indiscernables entre eux. Cause : `convex/workspaces.ts#memberName` → `'Membre'`. Suggestion : repli sur la partie locale de l'e-mail ou l'organisation.

**A-13 — Capture pleine page : l'en-tête `sticky` se superpose au contenu au milieu des captures `fullPage`** (`membre--depot/11-png-resultat.png`, `membre--espaces/08-note-trop-longue.png`). Artefact de capture, pas un défaut visible à l'écran — signalé pour ne pas être compté deux fois.

Non-anomalies notées : cartes sans vignette = repli « POLICY BRIEF » propre (`membre--moderation-notifications/90-anonyme-biblio-publiee.png`) ; XSS échappé partout (titres/descriptions/notes d'espaces, `q` de recherche) ; verrou serveur des routes privées (middleware) et des publications réservées OK ; dark mode et mobile sans débordement.

## 4. Non testé / limites

- **Téléchargement réel depuis la fiche** : vérifié par requête HTTP sur le `href` (200, `%PDF`, `application/pdf`), pas par l'événement `download` du navigateur (cible `_blank`).
- **Traduction / extraction de document** : sans clé de passerelle, seul le message d'indisponibilité est vérifiable (fiche EN et vue document) — OK.
- **Modération IA** (« Analyser avec l'IA ») : hors périmètre, non cliqué.
- **Invitation de membres dans un espace** : aucune UI d'invitation n'existe (seulement Rejoindre/Quitter) ; testé par un second compte qui rejoint.
- **Facettes auteur / date** : n'existent pas dans l'interface (uniquement recherche auteur et tri).
- **Rate limits** (10 dépôts / 24 h, 10 espaces / 24 h) : non atteints volontairement.
- **Nettoyage** : publications de test supprimées (4). Les espaces collaboratifs de test (5 espaces `QA-membre-2026…`, dont 3 titres `<script>alert(1)</script>` issus de mes rejeux) et les notes **restent en base** : aucun oracle `devAdmin` ne supprime les workspaces. Les comptes `membre_*` restent provisionnés.
- **Sessions** : la session `membre_visiteur` sauvegardée a été invalidée par la déconnexion du scénario 5 (rotation du jeton) ; les scénarios 6 et 7 se reconnectent par OTP.
