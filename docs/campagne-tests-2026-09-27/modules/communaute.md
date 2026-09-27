# RAPPORT — module `communaute` (Tribune, Événements, Replays, Jeunes, Mentorat, Appels à projets, Revue à comité de lecture)

Campagne « comme un humain » par l'interface (Chromium/Playwright, harnais `explore/harness.mjs`), production Next sur `localhost:3000`, Convex local. Scripts : `scratchpad/explore/communaute/*.mjs` (bibliothèque `_lib.mjs` : provisionnement CLI, connexion par code via `/fr/connexion-otp`, oracles dev). Comptes uniques `communaute_<scenario>@democracytogether.test`.

**Bilan chiffré : 21 scénarios, 328 vérifications, 301 ✅ / 27 ❌** — dont 6 ❌ imputables à mes scripts (sélecteurs, hypothèses de données ; corrigés ou re-vérifiés par requête HTTP, voir § 2) et 21 ❌ qui documentent 13 anomalies applicatives (§ 3).

---

## 1. Périmètre couvert

| # | Scénario (dossier `explore-out/`) | Compte / contexte | Contenu |
|---|---|---|---|
| 1 | `communaute--tribune-visiteur` | anonyme | liste, 5 filtres thématiques, `?theme=zzz`, invitation à adhérer, fiche (réaction/commentaire/signalement = liens connexion), traduction à la lecture sans clé, 5 identifiants inexistants/malformés, `/en/tribune` |
| 2 | `communaute--tribune-membre` | `tribune_membre` (membre) | composer : vide, titre seul, titre/corps trop courts, compteur & limite F-46 (12 000 et 21 000 car.), XSS/markdown, statut après publication, billet valide, réaction (clic / re-clic / persistance) — *arrêt sur un `ERR_ABORTED` de navigation, repris en 2b* |
| 2b | `communaute--tribune-commentaires` | idem | fiche XSS, commentaires (vide, 1 car., 4 001 car., XSS, valide), compteur, ordre, bouton Précédent, rechargement en plein composer, déconnexion puis retour |
| 3 | `communaute--tribune-fil-signalement` | `tribune_membre2` (membre) | commentaire d'un second membre, signalement du billet et d'un commentaire, rechargement → re-signalement, `/fr/admin/signalements` avec rôle membre |
| 4 | `communaute--tribune-notifs-auteur` | `tribune_membre` | cloche, notification `tribune_comment`, clic → billet, réponse de l'auteur |
| 5 | `communaute--tribune-notifs-fil` | `tribune_membre2` | notification `tribune_thread` (« Nouvelle réponse dans un fil… »), « Tout marquer comme lu » |
| 6 | `communaute--tribune-moderation` | `tribune_mod` (modérateur) | file `/fr/admin/signalements`, « Voir », « Ignorer », « Retirer » (dialogue nominatif, Annuler, confirmation), effets côté public (compteur, 404 du billet retiré) |
| 7 | `communaute--evenements` | anonyme | liste, facettes (type/région/format/langue, contextuelles), période, tri, recherche (+XSS), paramètres farfelus, fiche vedette, fiche simple, fiche passée, slug inexistant, `agenda.ics` inconnu, calendrier (nav mois, vide, `ym` invalide, an 1, aujourd'hui), replays, `/en/replays` |
| 8 | `communaute--evenement-inscription` | anonyme | inscription : vide, nom court, e-mail HTML5 invalide, `foo@bar`, succès + oracle `events:isRegistered`, réinscription (majuscules), double clic ; rappel e-mail + oracle ; export ICS (requête + téléchargement réel, EN, `/xx`) ; inscription à un événement **passé** |
| 9 | `communaute--jeunes` | anonyme | page, candidature (vide → erreurs par champ + focus, e-mail sans point, motivation 5 000 car., XSS nom, succès + oracle, doublon), mentorat (vide, mentoré, mentor même adresse, doublon) |
| 10 | `communaute--jeunes-admin` | `jeunes_mod` (modérateur) | `/fr/admin/jeunes` : note, Approuver, Toutes, Rouvrir, Rejeter, dédoublonnage, XSS |
| 11 | `communaute--mentorat-admin` | `mentorat_admin` (admin) | espace membre (parcours mentorat ?), `/fr/admin/mentorat` : Marquer apparié, Clôturer, Toutes, Rouvrir |
| 12 | `communaute--projets` | anonyme puis `projets_membre` | porte visiteur, formulaire (vide, courts, XSS, succès, résumé 4 001 car.) |
| 13 | `communaute--projets-admin` | `projets_mod` | `/fr/admin/projets` : Accepter avec note, Toutes, Rouvrir, Refuser |
| 14 | `communaute--revue-editeur` | `revue_editeur` (éditeur) | `/fr/admin/revue`, filtre, recherche d'un point d'entrée (admin/publications, espace membre, dépôt) |
| 14b | `communaute--revue-parcours` | `revue_editeur` | revue close → assignation d'un relecteur (réouverture) → avis (5 car., XSS, valide) → second avis même relecteur → décision « Renvoyer pour modifications » → filtres |
| 14c | `communaute--revue-relecteur` | `revue_mod` (modérateur) | notification « Une relecture vous est confiée » → clic → `/admin/revue` ; `/admin/evenements` |
| 15 | `communaute--revue-moderateur` | `revue_mod` | accès direct `/fr/admin/revue`, absence du lien, écrans « Programmes » |
| 16 | `communaute--tribune-mobile` | **Pixel 7**, `mobile_membre` | liste, filtre, fiche, connexion tactile, composer, publication, réaction, commentaire, débordements |
| 17 | `communaute--evenement-mobile` | **Pixel 7**, anonyme | liste, calendrier, fiche, inscription + oracle, replays |
| 18 | `communaute--tribune-sombre` | **thème sombre**, `sombre_membre` | liste, fiche, composer (mesures de luminance fond/texte) |

Chaque dossier contient captures numérotées, vidéo `.webm`, `journal.json` / `journal.md`. Le dossier `communaute--evenement-inscription` contient aussi les deux fichiers `.ics` (requête directe + téléchargement par le bouton).

---

## 2. Tableau des vérifications

| Fonctionnalité | Résultat | Détail |
|---|---|---|
| **Tribune — liste publique, filtres, fil** | ✅ | 5 filtres = oracle `tribune:listPosts`, pastille `aria-current`, état vide propre, `?theme=zzz` → liste complète (200), `/en/tribune` OK, pas de débordement |
| Tribune — visiteur ne peut pas écrire | ✅ | « La prise de parole est réservée aux membres du réseau. » + « Demander à adhérer » → `/fr/adhesion` ; Soutenir / Signaler = liens `/connexion` ; « Seuls les membres peuvent commenter. » |
| Tribune — composer : vide / titre seul | ✅ | bloqué par `required` (aucune requête) |
| Tribune — composer : titre < 4, corps < min | ✅ | messages clairs, en rouge sous le formulaire |
| Tribune — compteur / limite F-46 | ❌ | aucun compteur, aucun `maxlength` sur le corps ; 12 000 caractères acceptés sans avertissement (**A-05**) |
| Tribune — > 20 000 caractères | ❌ | refusé par le serveur (`INVALID_BODY`) mais message générique « La publication a échoué. Réessayez. » (**A-05**) |
| Tribune — XSS / markdown / HTML | ✅ | tout est rendu littéralement (liste, fiche, file de modération), aucune `<img src=x>`, aucun `dialog` |
| Tribune — « statut en attente de modération » après soumission | ❌ (hypothèse du scénario) | le billet est **publié immédiatement** (`status:'published'`) ; modération *a posteriori* par signalement — conforme à la roadmap (`docs/roadmap-post-mvp.md` F-50), pas une anomalie mais à confirmer côté produit (**A-11**) |
| Tribune — « Annuler » puis « Prendre la parole » | ❌ | le brouillon précédent (titre, corps, format « Analyse ») est ré-affiché sans le dire (**A-09**) |
| Tribune — fiche, paragraphes, auteur | ✅ | `whitespace-pre-line`, « Membre » pour un compte sans nom |
| Tribune — réaction clic / re-clic / persistance | ✅ | « Soutenu · 1 soutien » `aria-pressed=true` → re-clic « Soutenir · Aucun soutien » → persistée après rechargement |
| Tribune — commentaire vide | ✅ | `required` |
| Tribune — commentaire 1 caractère | ❌ | rien ne se passe, aucun message (**A-06**) |
| Tribune — commentaire 4 001 caractères | ❌ | `INVALID_COMMENT` serveur avalé : aucun message, texte conservé, compteur inchangé (**A-06**) |
| Tribune — commentaire XSS / valide / compteur / ordre | ✅ | « 2 commentaires », chronologique |
| Tribune — Précédent, rechargement, déconnexion | ✅ | retour au fil ; composer refermé sans erreur ; fiche redevient « visiteur » |
| Tribune — signalement (membre) | ✅ | bouton → « Signalé » (billet et commentaire) |
| Tribune — signalement après rechargement | ❌ | « Signaler » réapparaît, second signalement accepté → **2 lignes** dans la file (**A-07**) |
| Tribune — `/fr/admin/signalements` en membre | ✅ | « Accès réservé » (403 client), aucune donnée |
| Tribune — notifications `tribune_comment` / `tribune_thread` | ✅ | cloche « 1 non lue », libellés interpolés avec le titre, clic → billet, marquée lue, « Tout marquer comme lu » |
| Tribune — modération : Voir / Ignorer / Retirer | ✅ | retour d'action, dialogue « Retirer ce commentaire de la tribune ? » citant l'extrait, Annuler sans effet, « Contenu retiré » ; commentaire absent, compteur décrémenté ; billet retiré → 404 et absent du fil |
| Tribune — `/fr/tribune/<inexistant|malformé>` | ✅ | 5 variantes → 404 propre (page « introuvable » du site) |
| Tribune — traduction sans clé | ✅ | « Cet article est rédigé en Anglais. » → « Traduire en Français » → « Le service de traduction n'est pas configuré sur ce déploiement. » + Réessayer ; après rechargement « La traduction n'a pas abouti. » ; `?original=1` OK |
| **Événements — liste / facettes / période / tri / recherche** | ✅ | 10 à venir, Webinaire → 5, facettes contextuelles, Afrique → 2, Passés → 4, tri A→Z et date desc, « Dakar » → 3 (vérifié par HTTP), 0 résultat → message + « Réinitialiser les filtres » (vérifié par HTTP), XSS dans `q` inoffensif |
| Événements — paramètres farfelus | ✅ | 200, liste intacte |
| Événements — fiche vedette | ✅ | programme, intervenants, infos, billetterie 45 €, « Réserver » → `/adhesion`, JSON-LD, rappel |
| Événements — fiche simple | ✅ | formulaire `#inscription`, date, 3 « Autres rendez-vous » |
| Événements — fiche **passée** | ❌ | formulaire d'inscription proposé, inscription **acceptée et stockée** (`events:isRegistered` = true) (**A-03**) ; aucun lien replay/visio, aucune mention « passé » (**A-10**) |
| Événements — slug inexistant / ICS inconnu | ✅ | 404 / 404 |
| Événements — inscription : vide, nom court, e-mail | ✅ | `required`, « Veuillez indiquer votre nom. », HTML5 puis « Veuillez saisir une adresse e-mail valide. » pour `foo@bar` |
| Événements — inscription succès + oracle | ✅ | « Inscription confirmée. À bientôt ! », `events:isRegistered` = true, formulaire remplacé |
| Événements — même e-mail deux fois / majuscules / double clic | ✅ | succès idempotent, un seul enregistrement, bouton désactivé pendant l'envoi |
| Événements — rappel e-mail | ✅ | invalide signalé, « C'est noté… », `eventReminders:isReminderSet` = true ; absent sur un événement passé |
| Événements — `agenda.ics` | ✅ | 200 `text/calendar`, `Content-Disposition` attachment `democracy-together-<slug>.ics`, VCALENDAR valide (VERSION 2.0, PRODID, 1 VEVENT, CRLF), `DTSTART;VALUE=DATE:20261203` / `DTEND 20261204`, SUMMARY = titre, UID stable, URL, DTSTAMP UTC ; téléchargement par le bouton identique ; EN traduit ; `/xx/` → 200 (repli locale) |
| Calendrier — navigation, contenu, `ym` invalide | ✅ | Nov. 2026 : 3 pastilles au bon jour (14), Déc./Oct. via boutons `rel=next/prev`, Juillet vide → « Aucun événement ce mois-ci. », `ym=2026-13` → mois courant, `ym=0001-01` rendu, marqueur « aujourd'hui » |
| **Replays** — liste, lien, tri, durée | ✅ | 4 cartes, « Enregistrement bientôt disponible », pas de faux lecteur, « Voir l'événement » → fiche, EN OK |
| Replays — filtres | ❌ (attente du scénario) | aucun filtre (type/année) — page volontairement « lean » (**A-12**, mineur) |
| **Jeunes — page + candidature** | ✅ | erreurs par champ, focus sur le 1er champ fautif, `aria-invalid`, e-mail sans point, XSS nom en texte, succès + oracle `youth:isYouthApplicant`, doublon = succès silencieux et une seule ligne côté admin |
| Jeunes — motivation 5 000 caractères | ❌ | refus serveur `INVALID_MOTIVATION` → « L'envoi a échoué. Réessaie. » sans indiquer la limite (4 000) ; saisies conservées (**A-04**) |
| Jeunes — admin : Approuver / Toutes / Rouvrir / Rejeter | ✅ | transitions correctes, XSS en texte |
| Jeunes — admin : retour d'action, note | ❌ | la ligne disparaît sans message ; la note saisie n'est jamais affichée (**A-08**) |
| **Mentorat — demande mentoré / mentor / doublon** | ✅ | formulaire public sans compte ; une demande par (e-mail, rôle) ; oracle `mentorship:isMentorshipRequested` |
| Mentorat — côté membre | ❌ (attente du scénario) | il n'existe **aucun parcours membre** (pas de demande depuis l'espace membre, pas d'appariement visible, pas de notification/e-mail au demandeur) : le mentorat = formulaire public + file admin (**A-13**) |
| Mentorat — admin : apparié / clôturé / Toutes / Rouvrir | ✅ | deux lignes (mentoré + mentor) pour la même adresse, mailto, transitions ; note d'appariement jamais affichée (**A-08**) |
| **Appels à projets — visiteur** | ✅ | porte « Proposer un projet est réservé aux membres » + Adhérer + Se connecter ; la page décrit un dispositif, pas une liste d'appels datés |
| Projets — formulaire membre | ✅ | erreurs par champ, XSS en texte, « Proposition envoyée. Merci ! » |
| Projets — résumé 4 001 caractères | ❌ | « Envoi impossible pour le moment. Réessayez. » sans la raison (**A-04**) |
| Projets — admin : Accepter avec note / Toutes / Rouvrir / Refuser | ✅ | note affichée (« Note : … »), statuts corrects ; ancienne note conservée après réouverture + refus sans note (observation) |
| **Revue — point d'entrée pour OUVRIR une revue** | ❌ | aucun sur `/admin/revue`, `/admin/publications`, espace membre, dépôt : la file ne liste que ce qui est *déjà* en revue (**A-01**) |
| Revue — réouverture (assigner), avis, agrégat, décision, filtres | ✅ | « Revue close » → « En relecture » → avis « Modifications majeures » (XSS en texte) → agrégat = plus sévère → « Modifications demandées », boutons désactivés + message explicatif, filtres cohérents |
| Revue — retour d'action à l'assignation | ❌ | aucun message, seule l'étiquette change (**A-08**) |
| Revue — second avis du même relecteur | ❌ | refusé par le serveur (`ALREADY_REVIEWED`) mais **silencieusement** : texte conservé, aucun message (**A-06**) |
| Revue — relecteur (modérateur) notifié → `/admin/revue` | ❌ | page **500 « Une erreur est survenue »** : `getReviewQueue` exige `editeur`, le relecteur ne peut pas déposer son avis (**A-02**) |
| Revue — modérateur : lien absent de la nav | ✅ | groupe « Édition » masqué ; accès direct = 500 (cf. A-02) |
| Back-office — écrans « Programmes » en modérateur, `/admin/evenements` | ✅ | h1 présents ; inscriptions groupées par événement avec compteur, l'inscription QA figure au tableau |
| **Mobile (Pixel 7)** — tribune | ✅ | pas de débordement (liste, fiche, composer, fiche membre), filtres en flex-wrap, cible « Soutenir » 33 px, connexion/publication/réaction/commentaire par `tap` |
| Mobile — événements | ✅ | liste, calendrier, fiche, inscription + oracle, replays : aucun débordement |
| **Thème sombre** — tribune | ✅ | fond `rgb(20,23,28)` / h1 `rgb(236,234,227)`, cartes sombres, pastille active contrastée, champs du composer sombres avec texte clair |
| Journaux (console / page / ≥ 400) | ✅ | 0 erreur de page sur 21 scénarios ; erreurs console = 404 attendus + erreurs Convex des refus serveur (`INVALID_*`, `ALREADY_REVIEWED`, `Accès refusé`) qui sont exactement les cas A-02/A-04/A-05/A-06 |

❌ imputables aux scripts (pas à l'application) : `evenements` « 0 résultat », « Dakar », « Octobre : 3 » (sélecteur du compteur pris sur la vedette ; octobre n'a que 2 événements — re-vérifiés par HTTP : 0 / 3 / 2) ; `revue-moderateur` « /admin/evenements » (vérification lancée sur la mauvaise page, re-vérifiée ✅ dans `revue-relecteur`) ; `revue-parcours` « second avis refusé » (`getByText` a lu le `textarea` ; le serveur a bien refusé, cf. console) ; `tribune-moderation` « file vide après traitement » (conséquence directe de A-07).

---

## 3. Anomalies

### Bloquant

**A-01 — Revue à comité de lecture : aucune publication ne peut être mise en revue depuis l'interface (F-43).**
- Repro : éditeur → `/fr/admin/revue` (vide sur une base neuve) ; chercher sur `/fr/admin/publications`, `/fr/espace-membre`, `/fr/espace-membre/deposer` un moyen d'envoyer une publication au comité.
- Attendu : un éditeur choisit une publication et lui assigne un relecteur (ou l'auteur demande une relecture).
- Constaté : la file ne liste que les publications dont `reviewStage` est déjà posé ; le sélecteur « Assigner un relecteur » n'existe que **dans** ces cartes. `reviewStage` n'est écrit que par `convex/peerReview.ts` (`assignReviewer` / `decideReview`), et `assignReviewer` n'est appelé que par `src/app/[locale]/admin/revue/page.tsx`. Le circuit est donc fermé sur lui-même : seule une écriture hors interface (test, script) amorce une revue. La publication « Explo pub OK … » présente dans la file a été créée par une autre campagne.
- Preuves : `communaute--revue-editeur/03-revue-editeur.png`, `05-admin-publications.png`, `06-espace-membre-editeur.png`, `07-deposer.png` ; journal ❌ « un moyen d'OUVRIR une revue… ».
- Cause probable : `src/app/[locale]/admin/revue/page.tsx` (file = `getReviewQueue`, pas de recherche de publication) ; `src/app/[locale]/admin/publications/page.tsx` sans action « envoyer en revue ».

### Majeur

**A-02 — Le relecteur (modérateur) notifié atterrit sur une page 500 et ne peut pas déposer son avis.**
- Repro : éditeur assigne `communaute_revue_mod` (modérateur) → ce compte reçoit « Une relecture vous est confiée : « Explo pub OK … » » → clic → `/fr/admin/revue`.
- Attendu : le relecteur voit la publication et dépose son avis (le rôle requis par `submitReview` est bien `moderateur`).
- Constaté : page « 500 — Une erreur est survenue » (frontière d'erreur). Console : `[CONVEX Q(peerReview:getReviewQueue)] Accès refusé : rôle « editeur » requis` (`convex/lib/rbac.ts:45`). La nav masque « Comité de lecture » aux modérateurs, mais la notification (`link: '/admin/revue'`) les y envoie.
- Preuves : `communaute--revue-relecteur/03-notification-relecteur.png`, `04-revue-depuis-notification.png` ; `communaute--revue-moderateur/03-revue-moderateur.png` ; journaux (2 erreurs console).
- Cause : `convex/peerReview.ts` `getReviewQueue` → `requireNetworkRole(ctx,'editeur')` alors que `submitReview` accepte `moderateur` ; `assignReviewer` notifie avec `link:'/admin/revue'`. Contradiction de rôle entre la file et le dépôt d'avis.

**A-03 — Inscription acceptée et stockée sur un événement passé.**
- Repro : `/fr/evenements/ia-generative-integrite-information` (4 juin 2026, `upcoming:false`) → remplir « S'inscrire » → « Confirmer mon inscription ».
- Attendu : inscription fermée (formulaire masqué ou refus).
- Constaté : « Inscription confirmée. À bientôt ! », `events:isRegistered` = true. Le rappel, lui, est bien masqué (`event.upcoming`).
- Preuves : `communaute--evenement-inscription/07-inscription-evenement-passe.png`, `communaute--evenements/10-fiche-passee.png`.
- Cause : `src/app/[locale]/evenements/[slug]/page.tsx` rend `<EventRegisterForm>` pour tout événement non vedette sans tester `event.upcoming` ; `convex/events.ts` ne connaît pas les dates (limite documentée dans `eventReminders.ts`).

### Mineur

**A-04 — Refus serveur de longueur affichés comme un échec générique (jeunes, projets).**
- Repro : `/fr/jeunes` motivation de 5 000 car. → « L'envoi a échoué. Réessaie. » ; `/fr/appels-a-projets` résumé de 4 001 car. → « Envoi impossible pour le moment. Réessayez. ».
- Attendu : « 4 000 caractères maximum » (ou validation client / `maxLength`).
- Preuves : `communaute--jeunes/04-candidature-motivation-5000.png`, `communaute--projets/07-resume-4001.png` ; console `INVALID_MOTIVATION`, `INVALID_SUMMARY`.
- Cause : `src/components/youth/youth-apply-form.tsx` et `src/components/projects/project-form.tsx` ne valident pas le maximum et rabattent toute erreur non `RATE_LIMITED` sur `errGeneric` ; les bornes vivent dans `convex/youth.ts` (`<10 || >4000`) et `convex/projects.ts`.

**A-05 — Tribune : ni compteur ni limite visible sur le corps (F-46 « ~10 000 caractères »).**
- Repro : composer → 12 000 caractères en « Analyse » → publié sans avertissement ; 21 000 caractères → « La publication a échoué. Réessayez. ».
- Attendu (spécification F-46, `Democracy-Together-fonctionnalites.md` l.132) : contribution calibrée ~10 000 caractères, compteur et message explicite.
- Constaté : aucun `maxlength`/compteur ; plafond serveur 20 000 (`convex/tribune.ts` `INVALID_BODY`) ; message générique.
- Preuves : `communaute--tribune-membre/08-composer-12k.png`, `09-apres-12k.png`, `10-composer-21k-refus.png`.
- Cause : `src/components/tribune/tribune-composer.tsx` (pas de `maxLength` sur `#tr-body`, `catch → errGeneric`).

**A-06 — Refus silencieux : commentaire de tribune (1 car., > 4 000 car.) et second avis de relecture.**
- Repro : fiche de billet → « a » → Commenter : rien ; 4 001 car. → Commenter : rien, texte conservé (console `INVALID_COMMENT`). `/admin/revue` → déposer un second avis sur la même publication : rien, texte conservé (console `ALREADY_REVIEWED`).
- Attendu : message sous le champ (« 2 caractères minimum », « 4 000 maximum », « Vous avez déjà déposé un avis »).
- Preuves : `communaute--tribune-commentaires/04-commentaire-1-caractere.png`, `05-commentaire-4001.png`, `communaute--revue-parcours/06-revue-second-avis.png`.
- Cause : `src/components/tribune/comment-form.tsx` (`if (body.trim().length < 2) return;` et `catch {}` vide) ; `src/app/[locale]/admin/revue/page.tsx` `onSubmitReview` `catch {}`.

**A-07 — Un même membre peut signaler plusieurs fois le même contenu → doublons dans la file de modération.**
- Repro : signaler un billet → « Signalé » → recharger → « Signaler » réapparaît → cliquer → deuxième ligne identique dans `/fr/admin/signalements` (chacune à traiter séparément).
- Attendu : état « Signalé » persistant (query) ou dédoublonnage `(reporterUserId, targetId)` côté serveur.
- Preuves : `communaute--tribune-fil-signalement/05-apres-rechargement-signaler.png`, `communaute--tribune-moderation/03-file-signalements.png` (deux lignes « Prise de parole QA … »), `07-apres-retrait.png` (une ligne reste après traitement).
- Cause : `src/components/tribune/report-button.tsx` (`done` en `useState` local) ; `convex/tribune.ts` `reportContent` n'a pas d'index/vérification `by_reporter_and_target`.

**A-08 — Back-office « Programmes » : décisions sans retour d'action, notes saisies puis invisibles.**
- Repro : `/admin/jeunes` saisir une note, Approuver → la ligne disparaît, aucun message ; « Toutes » : note absente. Idem `/admin/mentorat` (note stockée seulement dans les métadonnées d'audit). `/admin/revue` : Assigner → aucun message.
- Attendu : le même retour d'action que `/admin/signalements` (`useActionFeedback`) et l'affichage de la note comme sur `/admin/projets` (« Note : … »).
- Preuves : `communaute--jeunes-admin/04-apres-approbation.png`, `05-toutes-approuvee.png`, `communaute--mentorat-admin/06-toutes-mentorat.png`, `communaute--revue-parcours/04-revue-assignee.png`.
- Cause : `src/app/[locale]/admin/{jeunes,mentorat,revue}/page.tsx` n'utilisent pas `useActionFeedback` ; `convex/youth.ts` `listYouthApplications` ne renvoie pas `reviewNotes` ; `convex/mentorship.ts` `reviewMentorshipRequest` ne stocke la note que dans `recordAudit`.

**A-09 — Composer de la tribune : « Annuler » puis « Prendre la parole » ré-affiche silencieusement le brouillon précédent (y compris le format).**
- Repro : ouvrir le composer, choisir « Analyse », saisir, Annuler, rouvrir → titre/corps/format conservés, message d'erreur précédent encore affiché.
- Attendu : formulaire vierge, ou mention « brouillon restauré ». Effet réel observé : un billet « Brève » saisi après un « Analyse » annulé est refusé « trop court » sans que l'utilisateur ait vu le format.
- Preuves : `communaute--tribune-membre/11-composer-xss.png` (erreur « Le texte est trop court » héritée), journal note « après Annuler puis réouverture : … format « fond » ».
- Cause : `tribune-composer.tsx` : `setOpen(false)` sans réinitialiser `title/body/format/error`.

**A-10 — Fiche d'un événement passé : aucune mention « passé/rediffusion », aucun lien vers la vidéo ou la visio ; la vedette promet des replays « en accès ouvert » sans lien.**
- Preuves : `communaute--evenements/10-fiche-passee.png` (badges/date seuls, bouton « S'inscrire » actif), `08-fiche-vedette.png` (« Replays et ressources » sans lien), `16-replays.png` (« Enregistrement bientôt disponible » ×4).
- Cause : `src/lib/events-content.ts` n'a pas de champ URL de replay/visio ; `[slug]/page.tsx` ne distingue pas `upcoming`.

### Cosmétique

**A-11 — Formulation attendue « en attente de modération » absente : un billet est publié instantanément.** C'est la conception (modération a posteriori, `convex/tribune.ts` `status:'published'`), mais rien ne le dit à l'auteur ; un mot du type « Publié. Tout contenu peut être signalé » éviterait le doute. Preuve : `communaute--tribune-membre/13-liste-apres-publication.png`.

**A-12 — `/fr/replays` sans aucun filtre (type, année) ni recherche**, alors que la liste des événements en propose. Page assumée « lean » (`src/lib/replays.ts`). Preuve : `communaute--evenements/16-replays.png`.

**A-13 — Mentorat : aucun parcours membre.** La demande se fait sans compte (`/fr/jeunes#mentorat`), l'appariement est interne (`/admin/mentorat`), le demandeur n'est ni notifié ni contacté par l'outil (aucun `sendEmail`/`notify` dans `convex/mentorship.ts`). Le scénario demandé (« deux comptes membres + un admin ») n'est donc pas réalisable tel quel : joué avec le formulaire public × 2 rôles + admin. Preuve : `communaute--mentorat-admin/03-espace-membre-admin.png`.

**A-14 — Back-office : un mot très long (motivation « LLLL… ») déborde de sa carte** (`/admin/jeunes`, ligne « Jeune Explo … » laissée par une autre campagne) : pas de `break-words` sur le paragraphe. Preuve : `communaute--jeunes-admin/03-file-jeunes.png` (texte qui dépasse le cadre à droite). Cause : `src/app/[locale]/admin/jeunes/page.tsx` `<p className="mt-2 text-[14px] …">{a.motivation}</p>`.

Design, à l'œil (captures ouvertes) : rendu propre et cohérent en clair, sombre et mobile (aucun débordement horizontal détecté sur 21 scénarios, contrastes corrects mesurés en sombre, cibles tactiles ≥ 33 px, pastilles de filtre en retour à la ligne). Le composer, la fiche et la file de modération sont lisibles ; les dialogues de confirmation nomment la cible. Le focus du champ titre au clic n'affiche pas d'anneau (`outline: none`), comportement `:focus-visible` normal à la souris — non vérifié au clavier.

---

## 4. Ce qui n'a PAS pu être testé, et pourquoi

- **Ouverture d'une revue « depuis zéro » par l'interface** : impossible (A-01). Le parcours avis/décision a été joué grâce à une publication déjà en revue (close) laissée par une autre campagne, rouverte par assignation.
- **Dépôt d'un avis par un relecteur au rôle `moderateur`** : impossible (A-02, page 500). L'avis a été déposé par le compte éditeur (≥ modérateur).
- **Mentorat côté membre** (demande depuis l'espace membre, appariement visible, notification) : la fonctionnalité n'existe pas (A-13).
- **Traduction effective d'un billet** : pas de clé de passerelle IA (attendu) ; seul le message d'indisponibilité et sa mémorisation (`failed`) sont vérifiés.
- **Rappel e-mail réellement envoyé** : `sendEmail` est un NO-OP sans clé ; seule la demande (`isReminderSet`) est vérifiée.
- **Lien visio / replay** : aucun lien dans les données (`events-content.ts`), rien à tester (A-10).
- **Doublon exact de signalement au niveau base** : compté via la file admin (2 lignes), pas par requête directe (`tribuneReports` sans oracle dev).
- **Épuisement des plafonds** (10 billets/h, 40 commentaires/h, plafonds IP des formulaires publics) : non forcé pour ne pas bloquer les autres agents sur la même IP.
- Le scénario `communaute--tribune-membre` s'est interrompu (`net::ERR_ABORTED` sur une navigation vers la fiche XSS, vraisemblablement une collision avec `router.refresh()`), sans erreur applicative ; la suite a été rejouée intégralement dans `communaute--tribune-commentaires`.
