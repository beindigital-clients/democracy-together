# Roadmap post-MVP — Democracy Together

> Base : backlog canonique `Democracy-Together-fonctionnalites.md`. Les 22 « Must »
> du MVP sont livrés. Ce document liste ce qui reste (Should / Could), priorisé en
> vagues. Certaines features « Should » sont **déjà faites** (le MVP a débordé).

## ✅ Déjà fait au-delà du MVP (bonus)
- **F-08** Accessibilité (audit axe + corrections ARIA)
- **F-20** Carte interactive du réseau (carte des membres sur l'annuaire)
- **F-35** Page ressource (fiche publication : résumé, téléchargement, citation APA/BibTeX/RIS, liées)
- **F-45** Modération a priori (workflow dépôt → en attente → publication)
- **F-49** File de modération (files candidatures + publications, validation/rejet) — *partiel : signalement/historique à compléter*
- *Partiels* : **F-13** hubs (désormais couverts par les synthèses F-36) · **F-30** espace membre (existe, sans suivi cotisation)

---

## Vague 1 — Boucle membre & monétisation *(le plus prioritaire)*
1. **Modèle d'adhésion** (décision A/B/C — voir `decisions-et-infos-client.md`) puis implémentation : nouveaux comptes en « visiteur », dépôt gaté sur rôle « membre », approbation F-22 → attribution du rôle + ajout à l'annuaire.
2. **F-27** Cotisations en ligne (paiement) + **F-28** Dons ponctuels/récurrents — nécessite un PSP (Stripe + PSP local XOF pour le Sénégal).
3. **F-29** Reçus & justificatifs · **F-30** suivi cotisation/historique dans l'espace membre.
4. **F-18** Inscription newsletter + **F-65** gestion des campagnes — quel outil (Brevo/Mailchimp).
5. **F-06** Recherche globale (cross-contenu) — *quick win*.

## Vague 2 — Centre de connaissances & données réelles
6. **Vraies données du baromètre** (remplacer l'illustration). ✅ **F-38** tableau de bord d'indicateurs + **F-39** visualisations interactives (carte choroplèthe, classement, fiches pays, sous-dimensions) — déjà en place via la maquette. ✅ **F-40** jeux de données open data — exports réels CSV/JSON + codebook + géométries (`/[locale]/barometre/data/*`, source unique `barometer-dataset.ts`). **Reste** : brancher les valeurs réelles (fournies par le secrétariat) à la place des données d'illustration.
7. ✅ **F-36** Synthèses thématiques — pages `/thematiques` (index 5 axes) + `/thematiques/[slug]` (position du réseau + questions + publications liées Convex + liens baromètre/bibliothèque), contenu `themes-content.ts`. ✅ **F-41** Rapports annuels — `/rapports` (index) + `/rapports/[year]` (rapport d'activité inaugural 2026, lecture web + impression « Enregistrer en PDF »), contenu `reports-content.ts`. **Reste** : **F-42** Policy briefs conjoints (≈ couvert par les types de publications) · **F-64** Bibliothèque de médias.

## Vague 3 — Tribune démocratique (module 08, gros chantier)
Espace d'expression modéré entre membres — **incrément 1 livré** :
8. ✅ **F-44** Prise de parole (posts membres par axe, `/tribune`) · ✅ **F-47** Fil par thématique + commentaires (filtre, détail `/tribune/[id]`, notif à l'auteur au commentaire) · ✅ **F-46/F-48** formats court/fond · ✅ **F-50** Code de conduite + signalement + file de modération admin (`/admin/signalements`, retirer/ignorer). Backend `convex/tribune.ts` (lecture publique, écriture membre, modération a posteriori). ✅ **Réactions** « soutien » 👍 sur les posts (`tribuneReactions`, toggle membre, compteur réactif). ✅ **Notifications de fil** (les participants d'un fil sont prévenus d'une nouvelle réponse, pas seulement l'auteur). **Reste** : **F-43** revue académique à comité de lecture (Could).

## Vague 4 — Événements réels & renforcement des capacités
9. ✅ **F-52** Agenda — export iCal (`/evenements/[slug]/agenda.ics`, bouton « Ajouter à mon agenda » ; `src/lib/ics.ts`) *(vue calendrier complète = reste)* · ✅ **F-53** Inscription en ligne — RSVP Convex sur la page détail (events non-vedettes), back-office `/admin/evenements` (liste par event, modérateur+), `convex/events.ts`. *La conférence inaugurale garde sa billetterie payante (→ F-27, bloqué paiements).* · **F-54** Webinaires (visio) & replays · ✅ **F-55** Rappels d'événements (opt-in e-mail sur la fiche + **cron Convex quotidien** `sendDueReminders` via l'adaptateur e-mail no-op-sans-clé).
10. **F-56** Boîte à outils de formation · **F-57** Replays & parcours · ✅ **F-58** Jeunes : candidatures (`/jeunes#rejoindre` + `/admin/jeunes`) · ✅ **F-59** Mentorat (mise en relation, `/jeunes#mentorat` + `/admin/mentorat`, `convex/mentorship.ts`) · ✅ **F-60** Appels à projets collaboratifs (`/appels-a-projets` + proposition membre + `/admin/projets`). **Reste** : profils jeunes persistants · contenu formation (F-56/F-57).

## Vague 5 — Collaboration temps réel & impact
11. **F-24** Espaces de travail collaboratifs · ✅ **F-25/F-51** Notifications temps réel — système par utilisateur (`convex/notifications.ts` + helper `notify`), déclenché par modération de publication (validée/rejetée) et revue de candidature (approuvée/rejetée) ; cloche d'en-tête réactive (connecté) + page `/notifications` (lire / tout marquer lu). *Étendre aux futurs déclencheurs (tribune, événements) au fil de l'eau.*
12. ✅ **F-66** Mesure d'impact (`/admin/impact`, 10 compteurs réels agrégés, modérateur+) · ✅ **F-67** Journal d'activité (`/admin/journal`, lecture `auditLog` + export CSV, **admin-only**).

## Opportuniste (Could)
✅ **F-14** Partenaires & soutiens (`/partenaires`, catégories) · ✅ **F-16** Espace presse / kit média (`/presse`) · ✅ **F-37** Compteurs de consultation (vues publications) · ✅ **F-23** Annuaire d'experts (`/experts`, **dérivé des vrais auteurs** de publications, sans fabrication). **Reste** : **F-31** Suivi financier back-office *(≈ bloqué : dépend des paiements)*.

---

### Dépendances clés
- **Paiements** (vague 1) bloquent : cotisations, dons, reçus, suivi donateur.
- **Décision modèle d'adhésion** bloque : gating membre, lien F-22 → rôle.
- **Données réelles baromètre** : fournies par le secrétariat (éditorial).
- La **Tribune** (vague 3) est la plus grosse brique (UGC + modération + temps réel).
