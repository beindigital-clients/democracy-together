# Democracy Together — Backlog fonctionnel de la plateforme

> **Source de vérité du périmètre produit.** Établi à partir de la note de concept *Democracy Together* et de la relecture de périmètre. Remplace, côté marque, le PDF « RMDL Fonctionnalités » qui portait encore l'ancienne identité (RMDL / « démocratie libérale », terme banni par les fondateurs).

**Chiffres clés :** 67 fonctionnalités · 11 modules · 2 phases · **22 « Must »** pour le lancement (sommet 2026).

---

## Stack cible — décision du 25/06/2026

> Remplace la recommandation §1 du `RMDL-cadrage-technique.md` (qui visait PostgreSQL + Strapi/Directus).

| Couche | Choix |
|---|---|
| **Frontend** | Next.js (App Router, SSR/SSG/ISR) + Tailwind + next-intl (FR/EN) |
| **Application, données & temps réel** | **Convex** — base réactive, fonctions serveur TypeScript, temps réel natif, stockage fichiers, recherche full-text intégrée, cron/jobs |
| **CMS éditorial** | **Sanity** — contenu structuré, Sanity Studio pour les non-développeurs, localisation par champ, GROQ, next-sanity (preview/visual editing) |
| **Paiement** | Stripe (+ PSP compatible **XOF/Sénégal** à choisir — Stripe ne couvre pas XOF nativement) |
| **Emailing** | Transactionnel + newsletters via fournisseur UE (Brevo / Scaleway / Postmark UE) |

### Frontière Convex / Sanity (décision d'architecture centrale)
- **Sanity** = contenu *éditorial* géré par des rédacteurs : pages institutionnelles (mission, vision, gouvernance, fondateurs), blog/actualités, pages événement, pages thématiques, et **fiches publication** (métadonnées + workflow éditorial).
- **Convex** = données *applicatives & temps réel* : comptes/rôles (RBAC), adhésions/cotisations/paiements, annuaire des membres, candidatures & validation, collaboration, notifications, tableau de bord membre, back-office, journaux d'activité.
- **Point ouvert** : le centre de connaissances (F-32/33/34) est à cheval. Reco de départ : la **fiche publication vit dans Sanity** (objet éditorial citable, DOI, multilingue), Convex gère les **compteurs/usages** (vues, téléchargements) et la **recherche transverse** membres+contenus.

### Ce que ce stack simplifie (vs le cadrage)
- **Temps réel natif (Convex)** → F-24 (collaboration), F-25/F-51 (notifications), F-47 (forums) deviennent quasi gratuits alors qu'ils étaient classés « complexes ».
- **Recherche intégrée** (index full-text Convex + GROQ Sanity) → on peut **différer ou supprimer Meilisearch** que prévoyait le cadrage.
- **CMS clé en main (Sanity Studio)** → **F-62 « gestion autonome des contenus » couvert nativement**, sans Strapi à héberger/maintenir.
- **TypeScript de bout en bout (Next + Convex)** → typage partagé, vélocité pour une petite équipe.

### ⚠ Point souveraineté / RGPD à acter
Convex et Sanity sont des **SaaS US par défaut**, ce qui frotte avec le positionnement souveraineté/RGPD de la mission (et l'argument du cadrage : hébergement UE).
- **Convex** : backend **open source, auto-hébergeable en UE** → mitigation possible.
- **Sanity** : **région EU** disponible (résidence des données) → à activer.
- **Décision à prendre** : niveau d'exigence souveraineté retenu (cloud US assumé vs self-host UE / région EU). Impacte la crédibilité côté fondateurs et bailleurs.

---

## Légende
- **Phase** : `P1` lancement · `P2` évolutions
- **Priorité** : `Must` indispensable · `Should` important · `Could` souhaitable
- ⚠ = correction/arbitrage proposé à la relecture (voir [Décisions à trancher](#décisions-à-trancher))

---

## 01 — Fondations & expérience (9)

| ID | Fonctionnalité | Phase | Prio |
|---|---|---|---|
| F-01 | Authentification (inscription, connexion, mot de passe oublié, sessions) | P1 | Must |
| F-02 | Rôles & permissions (visiteur, membre, modérateur, éditeur, administrateur) | P1 | Must |
| F-03 | Multilingue FR / EN, architecture prête pour d'autres langues | P1 | Must |
| F-04 | Design system & composants (thème, en-tête / pied de page responsive) | P1 | Must |
| F-05 | Optimisé mobile & connexions à faible débit (accès facilité en Afrique) | P1 | Must |
| F-06 | Recherche globale | P1 | Should |
| F-07 | Référencement (SEO, métadonnées, plan de site) & performance | P1 | Must |
| F-08 | Accessibilité (WCAG / RGAA) | P1 | Should ⚠ → **Must proposé** |
| F-09 | Conformité RGPD (consentement, mentions légales, confidentialité) | P1 | Must |
| — | ⚠ **Sécurité** (MFA rôles sensibles, WAF/anti-DDoS, rate-limiting) | P1 | **Must proposé (manquant)** |

## 02 — Site institutionnel (vitrine) (9)

| ID | Fonctionnalité | Phase | Prio |
|---|---|---|---|
| F-10 | Page d'accueil (mission, actualités, ressources, événements) | P1 | Must |
| F-11 | Vision / Mission | P1 | Must |
| F-12 | Fondateurs & gouvernance | P1 | Must |
| F-13 | Hubs régionaux (Paris, Dakar, Bruxelles) | P1 | Should |
| F-14 | Partenaires & soutiens (décideurs, ONG, institutions académiques, UE) | P1 | Should |
| F-15 | Actualités / blog (liste, filtres, article, partage) | P1 | Must |
| F-16 | Espace presse / médias (communiqués, kit média) | P2 | Could |
| F-17 | Formulaire de contact | P1 | Must |
| F-18 | Inscription à la newsletter | P1 | Should |

## 03 — Réseau des membres & collaboration (8)

| ID | Fonctionnalité | Phase | Prio |
|---|---|---|---|
| F-19 | Annuaire des think tanks (filtres : pays, thématique, langue, région) | P1 | Must |
| F-20 | Carte interactive du réseau | P1 | Should |
| F-21 | Fiche membre (description, thématiques, publications, contact) | P1 | Must |
| F-22 | Candidature d'adhésion (think tank) & validation | P1 | Must |
| F-23 | Annuaire d'experts / chercheurs | P2 | Could |
| F-24 | Espaces de travail collaboratifs (partage entre membres) | P2 | Should |
| F-25 | Notifications temps réel & fil d'activité | P2 | Could ⚠ (= F-51) |
| F-26 | Back-office : gestion & modération des membres | P1 | Must |

## 04 — Adhésions, cotisations & dons (5)

| ID | Fonctionnalité | Phase | Prio |
|---|---|---|---|
| F-27 | Formules d'adhésion & cotisations en ligne (paiement) | P1 | Should |
| F-28 | Dons ponctuels & récurrents (paiement en ligne) | P1 | Should |
| F-29 | Reçus & justificatifs | P2 | Could |
| F-30 | Espace membre / donateur (suivi cotisation, historique) | P2 | Should |
| F-31 | Suivi financier (back-office) | P2 | Could |

## 05 — Centre de connaissances (6)

| ID | Fonctionnalité | Phase | Prio |
|---|---|---|---|
| F-32 | Dépôt documentaire & stockage (recherches, rapports, policy briefs, données) | P1 | Must |
| F-33 | Métadonnées & catégorisation (thème, type, langue, région, auteur, date) | P1 | Must |
| F-34 | Recherche plein texte & filtres avancés | P1 | Must |
| F-35 | Page ressource (résumé, téléchargement, citation, documents liés) | P1 | Should |
| F-36 | Synthèses thématiques (agrégation des analyses des membres) | P1 | Should |
| F-37 | Compteurs de consultation / téléchargement | P2 | Could |

## 06 — Observatoire & données / outils analytiques (3)

| ID | Fonctionnalité | Phase | Prio |
|---|---|---|---|
| F-38 | Tableau de bord d'indicateurs sur l'état de la démocratie | P2 | Should |
| F-39 | Visualisations interactives (cartes, graphiques) | P2 | Should |
| F-40 | Jeux de données téléchargeables (open data) | P2 | Could |

## 07 — Publications (3)

| ID | Fonctionnalité | Phase | Prio |
|---|---|---|---|
| F-41 | Rapports annuels sur l'état de la démocratie (web + PDF) | P1 | Should |
| F-42 | Policy briefs conjoints | P1 | Should |
| F-43 | Revue académique à comité de lecture (soumission, relecture, décisions, versions) | P2 | Could |

## 08 — Tribune démocratique : espace d'expression modéré (8)

| ID | Fonctionnalité | Phase | Prio |
|---|---|---|---|
| F-44 | Publication ouverte : prise de parole sur un sujet de démocratie | P2 | Should |
| F-45 | Modération a priori : validation par un groupe de modérateurs avant publication | P2 | Should |
| F-46 | Format calibré : contribution courte à moyenne (~1 page / ~10 000 caractères) | P2 | Could |
| F-47 | Fils par thématique & réactions / commentaires | P2 | Should |
| F-48 | Approfondissement : prolonger une prise de parole en contribution de fond | P2 | Could |
| F-49 | File de modération (validation, rejet, signalement, historique) | P2 | Should |
| F-50 | Code de conduite & signalement communautaire | P2 | Could |
| F-51 | Notifications temps réel & fil d'activité | P2 | Could ⚠ (doublon de F-25) |

## 09 — Événements (4)

| ID | Fonctionnalité | Phase | Prio |
|---|---|---|---|
| F-52 | Agenda / calendrier (sommet mondial, webinaires, ateliers régionaux) | P2 | Should |
| F-53 | Pages événement & inscription en ligne | P2 | Should |
| F-54 | Webinaires (lien visio) & replays | P2 | Could |
| F-55 | Filtres (type, région, date) & rappels | P2 | Could |

## 10 — Renforcement des capacités & financements (5)

| ID | Fonctionnalité | Phase | Prio |
|---|---|---|---|
| F-56 | Boîte à outils & ressources de formation | P2 | Should |
| F-57 | Replays & parcours d'apprentissage | P2 | Could |
| F-58 | Programme Jeunes : profils & candidatures | P2 | Should |
| F-59 | Mentorat : mise en relation (matching) & suivi des binômes | P2 | Could |
| F-60 | Appels à projets collaboratifs (fonds dédié) : publication, candidature, sélection | P2 | Could |

## 11 — Administration, pilotage & impact (7)

| ID | Fonctionnalité | Phase | Prio |
|---|---|---|---|
| F-61 | Tableau de bord d'administration | P1 | Must |
| F-62 | Gestion autonome des contenus (pages, actus, ressources, membres) | P1 | Must |
| F-63 | Gestion des utilisateurs & rôles | P1 | Must |
| F-64 | Bibliothèque de médias | P1 | Should |
| F-65 | Gestion des campagnes newsletter | P2 | Should |
| F-66 | Mesure d'impact & statistiques (consultations, citations, diversité des membres) | P2 | Should |
| F-67 | Journal d'activité & exports | P2 | Could |

---

## Le MVP — les 22 « Must » (cible sommet 2026)

Premier lot d'implémentation. Le mapping indique la brique principale.

| ID | Fonctionnalité | Brique principale |
|---|---|---|
| F-01 | Authentification | Convex (Convex Auth ou Clerk) |
| F-02 | Rôles & permissions (RBAC) | Convex |
| F-03 | Multilingue FR / EN | Next.js (next-intl) + Sanity (i18n contenu) |
| F-04 | Design system & composants | Next.js + Tailwind (maquettes HTML déjà faites) |
| F-05 | Mobile & faible débit | Next.js (budget perf, ISR, CDN) |
| F-07 | SEO & performance | Next.js |
| F-09 | Conformité RGPD | Next.js + Sanity (pages légales) + Convex (consentement) |
| F-10 | Page d'accueil | Sanity (contenu) → Next.js |
| F-11 | Vision / Mission | Sanity |
| F-12 | Fondateurs & gouvernance | Sanity |
| F-15 | Actualités / blog | Sanity |
| F-17 | Formulaire de contact | Next.js + Convex (stockage soumissions) |
| F-19 | Annuaire des think tanks | Convex |
| F-21 | Fiche membre | Convex |
| F-22 | Candidature d'adhésion & validation | Convex |
| F-26 | Back-office membres & modération | Convex + Next.js (admin) |
| F-32 | Dépôt documentaire & stockage | Sanity (fiche) + stockage fichiers |
| F-33 | Métadonnées & catégorisation | Sanity |
| F-34 | Recherche plein texte & filtres | Convex (index) / GROQ (Sanity) |
| F-61 | Tableau de bord d'administration | Next.js + Convex |
| F-62 | Gestion autonome des contenus | **Sanity Studio** (natif) |
| F-63 | Gestion des utilisateurs & rôles | Convex |

> Note : le MVP (22 « Must ») est volontairement plus resserré que le périmètre P1 (35 fonctionnalités). Les 13 « Should » de P1 sont souhaitables au lancement mais peuvent glisser sans bloquer l'ouverture.

---

## Décisions à trancher

### A. Questions de la note de périmètre (page 4 du PDF)
1. **Adhésion & dons en ligne dès le lancement ?** (F-27/F-28 sont en `Should`, hors des 22 Must.)
2. **Observatoire de données dans le périmètre, et avec quelles sources ?** (Module 06 ; rappel cadrage : risque de licences V-Dem / Freedom House / BTI, le « Baromètre » est un quasi-projet à part.)
3. **Langues au-delà de FR/EN** (portugais, arabe) ? (Impacte i18n + RTL **dès le design**.)

### B. Issues de la relecture du backlog
4. **F-08 Accessibilité → `Must` ?** Le RGAA est quasi une obligation pour une institution publique ; la relecture du cadrage classait accessibilité **et** sécurité en contraintes MVP.
5. **Ligne « Sécurité » explicite en `Must`** (MFA rôles sensibles, WAF/anti-DDoS, rate-limiting) : absente du PDF, justifiée par le profil de menace (DDoS pendant le sommet, contributeurs en zones sensibles).
6. **Doublon F-25 / F-51** : un seul système de notifications temps réel (Convex le rend quasi gratuit).
7. **Back-office sans maquette** : F-61/62/63 sont `Must` mais aucun écran admin n'est conçu (les 11 maquettes couvrent public + espace membre).
8. **Référentiel canonique** : ce backlog (67) pilote l'implémentation ; le `RMDL-cadrage-technique.md` (142) reste le détail technique sous-jacent. (Non repris ici : le *policy/advocacy tracker* du cadrage, qui était en V2.)

### C. Liées au stack Convex + Sanity
9. **Frontière Convex / Sanity** pour le centre de connaissances (F-32/33/34) : fiche publication éditoriale (Sanity) vs usages/recherche (Convex).
10. **Souveraineté / RGPD** : cloud US assumé, ou Convex self-host UE + Sanity région EU ?
11. **Auth** : Convex Auth vs Clerk (le cadrage prévoyait Auth.js → Keycloak).
12. **Paiement XOF** : Stripe ne gère pas le XOF nativement → choisir un PSP local (Sénégal) pour les cotisations Afrique.

---

*Maquettes existantes (11 écrans HTML, déjà rebrandés Democracy Together) dans `design/`. Cadrage technique complet dans `RMDL-cadrage-technique.md`.*
