# Roadmap post-MVP — Democracy Together

> Base : backlog canonique `Democracy-Together-fonctionnalites.md`. Ce document
> liste ce qui reste (Should / Could), priorisé en vagues. Certaines features
> « Should » sont **déjà faites** (le MVP a débordé).

> ⚠️ **Où en est le MVP, réellement.** Une version antérieure de ce document
> affirmait que « les 22 “Must” du MVP sont livrés ». L'audit du 18 septembre
> 2026 (`docs/audit-plateforme-2026-09.md`, § 3.1, base : commit `8be46bc`) ne
> confirme pas ce décompte : **11 livrés, 9 partiels, 2 bloqués** sur 22.
>
> Depuis, la PR #4 (commit `133207c`) a traité les deux bloqués : F-01 dispose à
> nouveau d'un chemin de création de compte (`users.inviteUser`) et l'approbation
> d'une candidature crée désormais l'organisation et invite son contact
> (`organizations.reviewApplication`, F-22). Les 9 partiels, eux, n'ont pas tous
> été réévalués : **le décompte à jour reste à établir par un nouvel audit**, et
> ce document ne doit pas servir d'attestation de complétude auprès du client.

## ✅ Déjà fait au-delà du MVP (bonus)
- **F-08** Accessibilité (audit axe + corrections ARIA)
- **F-20** Carte interactive du réseau (carte des membres sur l'annuaire)
- **F-35** Page ressource (fiche publication : résumé, téléchargement, citation APA/BibTeX/RIS, liées)
- **F-45** Modération a priori (workflow dépôt → en attente → publication)
- **F-49** File de modération (files candidatures + publications, validation/rejet) — *partiel : signalement/historique à compléter*
- *Partiels* : **F-13** hubs (désormais couverts par les synthèses F-36) · **F-30** espace membre (existe, sans suivi cotisation)

---

## Vague 1 — Boucle membre & monétisation *(le plus prioritaire)*
1. **Modèle d'adhésion** (décision A/B/C à arbitrer avec le client — l'arbitrage
   n'est consigné nulle part dans le dépôt : l'ancien renvoi vers
   `decisions-et-infos-client.md` pointait vers un fichier inexistant) puis implémentation : nouveaux comptes en « visiteur », dépôt gaté sur rôle « membre », approbation F-22 → attribution du rôle + ajout à l'annuaire.
2. **F-27** Cotisations en ligne (paiement) + **F-28** Dons ponctuels/récurrents — nécessite un PSP (Stripe + PSP local XOF pour le Sénégal).
3. **F-29** Reçus & justificatifs · **F-30** suivi cotisation/historique dans l'espace membre.
4. ✅ **F-18** Inscription newsletter (+ désinscription par jeton) et ✅ **F-65**
   gestion des campagnes (composition + envoi) **existent déjà**. **Reste** : le
   **double opt-in**, exigé par le cadrage et absent (audit § 3.2), et le choix du
   fournisseur d'envoi en volume (Brevo/Mailchimp) — l'envoi est muet sans clé.
5. ✅ **F-06** Recherche globale **existe déjà** (palette de commandes + `/recherche`).
   **Reste** : la rendre scalable — c'est aujourd'hui une recherche de sous-chaîne
   en mémoire après `collect()` complet, sans index de recherche Convex (audit § 3.2).

## Vague 2 — Centre de connaissances & données réelles
6. **Vraies données du baromètre** (remplacer l'illustration). ✅ **F-38** tableau de bord d'indicateurs + **F-39** visualisations interactives (carte choroplèthe, classement, fiches pays, sous-dimensions) — déjà en place via la maquette. ✅ **F-40** jeux de données open data — exports réels CSV/JSON + codebook + géométries (`/[locale]/barometre/data/*`, source unique `barometer-dataset.ts`). **Reste** : brancher les valeurs réelles (fournies par le secrétariat) à la place des données d'illustration.
7. ✅ **F-36** Synthèses thématiques — pages `/thematiques` (index 5 axes) + `/thematiques/[slug]` (position du réseau + questions + publications liées Convex + liens baromètre/bibliothèque), contenu `themes-content.ts`. ✅ **F-41** Rapports annuels — `/rapports` (index) + `/rapports/[year]` (rapport d'activité inaugural 2026, lecture web + impression « Enregistrer en PDF »), contenu `reports-content.ts`. **Reste** : **F-42** Policy briefs conjoints (≈ couvert par les types de publications) · **F-64** Bibliothèque de médias.

## Vague 3 — Tribune démocratique (module 08, gros chantier)
Espace d'expression modéré entre membres — **incrément 1 livré** :
8. ✅ **F-44** Prise de parole (posts membres par axe, `/tribune`) · ✅ **F-47** Fil par thématique + commentaires (filtre, détail `/tribune/[id]`, notif à l'auteur au commentaire) · ✅ **F-46/F-48** formats court/fond · ✅ **F-50** Code de conduite + signalement + file de modération admin (`/admin/signalements`, retirer/ignorer). Backend `convex/tribune.ts` (lecture publique, écriture membre, modération a posteriori). ✅ **Réactions** « soutien » 👍 sur les posts (`tribuneReactions`, toggle membre, compteur réactif). ✅ **Notifications de fil** (les participants d'un fil sont prévenus d'une nouvelle réponse, pas seulement l'auteur). ✅ **F-43** Revue à comité de lecture (staff) — `convex/peerReview.ts` + `/admin/revue` : un éditeur assigne un relecteur (moderateur+) → avis (accept/minor/major/reject) → décision (revision/reviewed), notifications relecteur + auteur. **Vague 3 complète.**

## Vague 4 — Événements réels & renforcement des capacités
9. ✅ **F-52** Agenda — export iCal (`/evenements/[slug]/agenda.ics`) **+ vue calendrier** mensuelle (`/evenements/calendrier`, `src/lib/calendar.ts`, navigation `?ym=`) · ✅ **F-53** Inscription en ligne — RSVP Convex sur la page détail (events non-vedettes), back-office `/admin/evenements`, `convex/events.ts`. *Conférence inaugurale = billetterie payante (→ F-27, bloqué).* · ✅ **F-54** Replays (`/replays`, dérivés des événements passés, encart honnête « bientôt disponible », pas de fausse vidéo) — *visio live = bloqué contenu* · ✅ **F-55** Rappels d'événements (opt-in e-mail + **cron Convex quotidien** via l'adaptateur no-op-sans-clé).
10. **F-56** Boîte à outils de formation · **F-57** Replays & parcours · ✅ **F-58** Jeunes : candidatures (`/jeunes#rejoindre` + `/admin/jeunes`) · ✅ **F-59** Mentorat (mise en relation, `/jeunes#mentorat` + `/admin/mentorat`, `convex/mentorship.ts`) · ✅ **F-60** Appels à projets collaboratifs (`/appels-a-projets` + proposition membre + `/admin/projets`). **Reste** : profils jeunes persistants · contenu formation (F-56/F-57).

## Vague 5 — Collaboration temps réel & impact
11. ✅ **F-24** Espaces de travail collaboratifs (**incrément 1**) — `convex/workspaces.ts` + `/espaces` (+ `/espaces/[id]`) : créer un espace par thème, rejoindre/quitter, fil de notes entre membres ; lecture membre réseau, écriture réservée aux membres de l'espace. *Reste : invitations ciblées, fichiers partagés.* · ✅ **F-25/F-51** Notifications temps réel — système par utilisateur (`convex/notifications.ts` + helper `notify`), déclenché par modération de publication (validée/rejetée) et revue de candidature (approuvée/rejetée) ; cloche d'en-tête réactive (connecté) + page `/notifications` (lire / tout marquer lu). *Étendre aux futurs déclencheurs (tribune, événements) au fil de l'eau.*
12. ✅ **F-66** Mesure d'impact (`/admin/impact`, 10 compteurs réels agrégés, modérateur+) · ✅ **F-67** Journal d'activité (`/admin/journal`, lecture `auditLog` + export CSV, **admin-only**).

## Opportuniste (Could)
✅ **F-14** Partenaires & soutiens (`/partenaires`, catégories) · ✅ **F-16** Espace presse / kit média (`/presse`) · ✅ **F-37** Compteurs de consultation (vues publications) · ✅ **F-23** Annuaire d'experts (`/experts`, **dérivé des vrais auteurs** de publications, sans fabrication). **Reste** : **F-31** Suivi financier back-office *(≈ bloqué : dépend des paiements)*.

---

## Mise en production (bascule Convex dev → prod)

La plateforme tourne sur le déploiement Convex de **développement**
(`rare-alpaca-677`) jusqu'à la validation de l'application — choix assumé et
temporaire. Le jour de la bascule, la procédure est `docs/deploiement.md`, qui
vaut runbook : presque rien de ce qu'il faut refaire ne vit dans le code, ce sont
des réglages attachés à UN déploiement, et un déploiement prod naît vide.

13. **Bascule elle-même** : dérouler `docs/deploiement.md` de bout en bout —
    variables du déploiement Convex (§ 1.1) et de Vercel (§ 1.2), amorçage de
    l'administrateur initial (§ 5, `convex/bootstrap.ts`), contrôles après mise
    en ligne (§ 7). Deux vérifications qu'aucune commande ne fait à votre place :
    `AUTH_DEV_OTP` et `RECAPTCHA_DISABLED` **absentes** du déploiement de
    production.
14. **Données réelles** à la place des jeux d'illustration (annuaire,
    publications, baromètre — cf. vague 2), les seeds étant gardés par
    `AUTH_DEV_OTP` donc inexécutables en production. C'est voulu.
15. **Clé de préversion `CONVEX_DEPLOY_KEY`** pour la CI E2E — indépendante de la
    bascule. Une clé de dev ou de prod est refusée par Convex (`Preview
    deployments can only be created with preview deploy keys`) et fait **rougir**
    le job au lieu de l'ignorer ; tant qu'une clé « Preview » n'est pas posée,
    les specs Playwright ne tournent nulle part.

---

### Dépendances clés
- **Paiements** (vague 1) bloquent : cotisations, dons, reçus, suivi donateur.
- **Décision modèle d'adhésion** bloque : gating membre, lien F-22 → rôle.
- **Données réelles baromètre** : fournies par le secrétariat (éditorial).
- La **Tribune** (vague 3) est la plus grosse brique (UGC + modération + temps réel).
