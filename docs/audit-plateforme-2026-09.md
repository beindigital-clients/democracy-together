# Audit complet de la plateforme Democracy Together

**Date** : 18 septembre 2026 · **Base auditée** : branche `main` au commit `8be46bc` (« Auth : suppression de l'auto-inscription publique », 29 juin 2026) · **Référentiels** : `Democracy-Together-fonctionnalites.md` (backlog canonique, 67 fonctionnalités, 22 « Must »), `RMDL-cadrage-technique.md` (cadrage détaillé, 142 fonctionnalités), `docs/devis-democracy-together-phase1.md`, `docs/roadmap-post-mvp.md`, maquettes `design/`.

---

## 1. Synthèse exécutive

**Verdict.** La plateforme est techniquement saine (typecheck, 211 tests unitaires et build de production passent) et fonctionnellement très étendue pour douze commits : 61 routes, 30 modules Convex, 24 tables, back-office de 13 écrans, bilingue à 100 %. En revanche, elle **n'est pas prête pour une mise en ligne publique** et **ne respecte pas encore intégralement le périmètre « Must » du MVP**, pour trois raisons de fond :

1. **Le parcours d'adhésion est cassé de bout en bout** depuis le dernier commit. L'auto-inscription a été supprimée, mais aucun autre mécanisme de création de compte n'a été ajouté : l'approbation d'une candidature n'élève que les comptes *déjà existants*, la connexion par code refuse les e-mails inconnus, et l'admin ne peut ni créer ni inviter un utilisateur. **Un think tank approuvé ne peut jamais se connecter**, et sa fiche n'apparaît jamais dans l'annuaire (l'approbation ne crée pas d'organisation). Cela invalide F-01 et F-22, deux « Must ».
2. **Le site est une vitrine de démonstration** : baromètre, événements, replays, tarifs d'adhésion, hub jeunes, annuaire et bibliothèque reposent sur des données explicitement fictives (seeds, modules TypeScript « d'illustration »). Seules les données saisies par les utilisateurs sont réelles. Les mentions légales comportent 24 champs `[à compléter avant mise en ligne]`.
3. **Plusieurs exigences transverses du cadrage ne sont pas tenues** : aucune page statique ou mise en cache (les 61 routes sont rendues à chaque requête, à l'opposé du principe SSG/ISR + CDN pour l'Afrique), aucune intégration continue, aucun lint, 77 vulnérabilités dont 4 critiques (Next.js 16.2.9 à mettre à jour), publications « réservées aux membres » servies à tout visiteur, modération de la Tribune a posteriori alors que le backlog exige a priori.

**Chiffres clés**

| Indicateur | Valeur |
|---|---|
| Fonctionnalités du backlog livrées / partielles / façade / absentes / régressées | 23 / 26 / 8 / 8 / 2 (sur 67) |
| « Must » du MVP livrés / partiels / bloqués | 11 / 9 / 2 (sur 22) |
| Routes Next.js (build) | 61, toutes dynamiques, 0 statique |
| Code applicatif | 30 355 lignes TS/TSX (src 20 270 · convex 9 578 · sanity 829) |
| Tests unitaires | 44 fichiers, 211 cas, tous verts en 8,9 s |
| Tests E2E Playwright | 41 fichiers, ≈ 121 cas ; **non exécutables** sans déploiement Convex, 5 specs cassées par le dernier commit |
| Parité i18n | 801 clés FR = 801 clés EN, 0 manquante |
| Vulnérabilités `pnpm audit --prod` | 77 (4 critiques, 36 hautes) |
| CI/CD, lint, formatage | absents |

La roadmap interne (`docs/roadmap-post-mvp.md`) affirme que « les 22 Must du MVP sont livrés ». **Cet audit ne confirme pas cette affirmation** : 11 le sont pleinement, 9 partiellement, 2 sont bloqués.

---

## 2. Méthode

- Lecture intégrale des référentiels (backlog, cadrage 142 fonctionnalités, devis, roadmap, maquettes).
- Exécution réelle : `pnpm install`, `pnpm typecheck` (OK), `pnpm test` (211/211), `pnpm build` (OK, 101 pages générées, 61 routes), `pnpm audit --prod`, diff des clés i18n.
- Revue de code complète du backend Convex (`convex/`), du frontend (`src/`), du CMS (`sanity/`), des tests et de l'outillage, avec références `fichier:ligne`.
- Non réalisé (hors de portée de l'environnement) : exécution des E2E contre un vrai déploiement Convex, mesure Lighthouse / 3G réelle, test de pénétration.

Légende des statuts : ✅ livré · 🟡 partiel · 🟠 façade (écran présent, données d'illustration ou sans back-end) · ❌ absent · ⛔ régression bloquante.

---

## 3. Conformité au cahier des charges

### 3.1 Les 22 « Must » du MVP

| ID | Fonctionnalité | Statut | Constat |
|---|---|---|---|
| F-01 | Authentification | ⛔ | Mot de passe + OTP + reset OK (`convex/auth.ts`, `otp.ts`). Mais plus aucun chemin de création de compte (voir § 1). Pas de 2FA. |
| F-02 | Rôles & permissions | ✅ | 5 rôles hiérarchiques, `requireNetworkRole` côté serveur, anti-lockout admin. Rôles d'organisation définis mais jamais utilisés. |
| F-03 | Multilingue FR/EN | ✅ | Parité parfaite ; hreflang ; contenus bilingues. RTL non préparé (0 utilitaire logique, 50 physiques). |
| F-04 | Design system | ✅ | Tokens portés des maquettes, thème sombre, univers « jeunes ». |
| F-05 | Mobile & faible débit | 🟡 | Responsive OK. Mais 0 page statique, globe d3 + 108 Ko de TopoJSON dans le bundle de l'accueil, framer-motion sur ~30 pages, contenu en `opacity:0` avant hydratation. |
| F-07 | SEO & performance | 🟡 | Metadata, canonical, sitemap, robots. **0 OpenGraph, 0 JSON-LD**, aucune mise en cache. |
| F-09 | RGPD | 🟡 | Bandeau cookies, pages légales bilingues. 24 champs légaux à compléter ; pas d'export/suppression self-service ; hébergement US non arbitré. |
| F-10 | Accueil | ✅ | Sanity `homePage` avec repli local par section. Section « actualités » de la maquette absente (requête `latestPostsQuery` écrite mais inutilisée). |
| F-11 | Vision / Mission | ✅ | `/a-propos` (Sanity + repli). |
| F-12 | Fondateurs & gouvernance | ✅ | Même page ; contenus à valider par le client. |
| F-15 | Actualités | ✅ | Sanity `post`. Fetch **sans try/catch** (`actualites/page.tsx:39`) : 500 si Sanity indisponible. Pas de filtres ni partage. |
| F-17 | Contact | 🟡 | Formulaire + captcha + rate-limit + stockage. **Aucun écran admin ni e-mail au secrétariat** : les messages restent en base (`contactMessages.handled` jamais mis à jour). |
| F-19 | Annuaire think tanks | ✅ | Facettes région/thème/pays/langue, globe. Données = seed fictif (`convex/seed.ts`). |
| F-21 | Fiche membre | 🟡 | Fiche publique OK. Aucun lien organisation ↔ publications ↔ utilisateurs ; pas d'édition par l'organisation. |
| F-22 | Candidature & validation | ⛔ | File admin OK, mais l'approbation **ne crée ni compte ni organisation** (`convex/organizations.ts:136-192`). |
| F-26 | Back-office membres | 🟡 | Files candidatures / utilisateurs / publications. Pas de CRUD des organisations (créer, éditer, suspendre). |
| F-32 | Dépôt documentaire | ✅ | PDF ≤ 20 Mo, type et taille revalidés serveur, modération, stockage Convex. Choix Convex (et non Sanity) documenté. |
| F-33 | Métadonnées | ✅ | Type, thème, région, langues, auteurs, année, DOI, licence. |
| F-34 | Recherche & filtres | 🟡 | Facettes serveur OK. « Plein texte » = sous-chaîne en mémoire après `collect()` complet (`convex/search.ts`), aucun index de recherche Convex. |
| F-61 | Tableau de bord admin | ✅ | Compteurs + files. Compteurs par `collect().length` sur tables entières. |
| F-62 | Gestion autonome des contenus | 🟡 | Sanity Studio pour accueil, à-propos, actualités **seulement**. Événements, partenaires, presse, thématiques, rapports, jeunes, adhésion, baromètre = code TypeScript (un développeur est nécessaire). |
| F-63 | Utilisateurs & rôles | 🟡 | Changement de rôle audité. Ni création, ni invitation, ni suspension, ni suppression. |

### 3.2 Les 45 autres fonctionnalités du backlog

| ID | Fonctionnalité | Prio | Statut | Constat |
|---|---|---|---|---|
| F-06 | Recherche globale | Should | 🟡 | Palette + `/recherche`. Sous-chaîne en mémoire, non scalable. |
| F-08 | Accessibilité | Should→Must | 🟡 | axe sur 22 pages FR, focus visible, reduced-motion. Règle `color-contrast` désactivée ; safran/papier ≈ 2,2:1 (AA exige 4,5:1) ; pas de skip link ; 0 `aria-invalid`/`aria-describedby`. |
| — | Sécurité (Must proposé) | Must | 🟡 | CSP, en-têtes, rate-limit, reCAPTCHA v3, audit log. Pas de MFA, pas de WAF, dépendances vulnérables. |
| F-13 | Hubs régionaux | Should | 🟡 | Évoqués dans gouvernance ; pas de page par bureau. |
| F-14 | Partenaires | Should | 🟠 | Page statique, non éditable en CMS. |
| F-16 | Espace presse | Could | 🟠 | Page statique. |
| F-18 | Newsletter | Should | 🟡 | Inscription, désinscription par jeton, campagnes. **Pas de double opt-in** (exigé par le cadrage). |
| F-20 | Carte interactive | Should | ✅ | Globe d3 tactile. |
| F-23 | Annuaire d'experts | Could | 🟡 | Dérivé des noms d'auteurs (chaînes libres), pas de profils. |
| F-24 | Espaces collaboratifs | Should | 🟡 | Espaces + notes texte. Pas de fichiers, pas d'invitations. |
| F-25 / F-51 | Notifications temps réel | Could | ✅ | Table, cloche réactive, page. |
| F-27 | Cotisations en ligne | Should | ❌ | Estimateur indicatif ; aucun PSP. |
| F-28 | Dons | Should | ❌ | `/don` = « Bientôt disponible ». |
| F-29 | Reçus | Could | ❌ | — |
| F-30 | Espace membre | Should | 🟡 | E-mail, rôle brut, mes contributions. Maquette (sidebar, KPI, adhésion, événements, profil) réalisée à ≈ 25 %. |
| F-31 | Suivi financier | Could | ❌ | — |
| F-35 | Page ressource | Should | 🟡 | Résumé, téléchargement, citations APA/BibTeX/RIS, liées. **`access: 'members'` jamais appliqué** : URL du PDF servie à tout visiteur (`convex/publications.ts:68-85`). |
| F-36 | Synthèses thématiques | Should | 🟠 | Texte statique + publications liées. |
| F-37 | Compteurs | Could | ✅ | Vues (mutation publique non authentifiée, sans rate-limit). |
| F-38 / F-39 / F-40 | Baromètre, visualisations, open data | Should/Could | 🟠 | Écrans et exports CSV/JSON/codebook complets, **données fictives** (`barometer-content.ts:3`). |
| F-41 | Rapports annuels | Should | 🟡 | Web + impression navigateur, pas de PDF généré. |
| F-42 | Policy briefs | Should | ✅ | Type de publication. |
| F-43 | Revue à comité de lecture | Could | 🟡 | Assignation, avis, décision. Pas de double aveugle, pas de versions, pas de machine à états. |
| F-44 | Prise de parole | Should | ✅ | Posts membres par axe. |
| F-45 | Modération **a priori** | Should | ❌ | Posts publiés immédiatement (`tribune.ts:55`), modération a posteriori : **inverse de l'exigence**. |
| F-46 | Format calibré | Could | ✅ | court / fond. |
| F-47 | Fils & réactions | Should | ✅ | Commentaires, « soutien ». |
| F-48 | Approfondissement | Could | 🟡 | Format « fond » sans lien depuis un post court. |
| F-49 | File de modération | Should | 🟡 | Signalements (retirer/ignorer), pas d'historique ni de file de validation. |
| F-50 | Code de conduite | Could | ✅ | — |
| F-52 | Agenda / calendrier | Should | 🟠 | Vue mensuelle + iCal. **Événements codés en dur** (`events-content.ts`), dates fictives, aucune gestion admin/CMS. |
| F-53 | Pages événement & inscription | Should | 🟡 | RSVP + back-office. Pas de jauge, pas d'e-mail de confirmation, `eventSlug` jamais validé. |
| F-54 | Webinaires & replays | Could | 🟠 | Liste dérivée, aucune vidéo. |
| F-55 | Filtres & rappels | Could | ✅ | Filtres serveur + rappel e-mail par cron quotidien. |
| F-56 / F-57 | Boîte à outils, parcours | Should/Could | ❌ | — |
| F-58 | Programme Jeunes | Should | 🟡 | Candidature + revue. Pas de profils persistants. |
| F-59 | Mentorat | Could | 🟡 | Demandes + statut. Pas de matching ni suivi de binôme ; notes de revue perdues dans l'audit log. |
| F-60 | Appels à projets | Could | 🟡 | Propositions + revue. Pas d'appels datés. |
| F-64 | Bibliothèque de médias | Should | ❌ | Rien hors médias natifs Sanity. |
| F-65 | Campagnes newsletter | Should | ✅ | Composition + envoi (muet sans clé e-mail, voir § 4). |
| F-66 | Mesure d'impact | Should | 🟡 | Compteurs agrégés. Aucune mesure d'audience web. |
| F-67 | Journal d'activité | Could | ✅ | Audit log + export CSV. `limit` non borné. |

### 3.3 Écarts vis-à-vis du cadrage technique (142 fonctionnalités)

Le cadrage a été révisé le 25/06/2026 (stack Convex + Sanity), mais ses **principes d'architecture** restent la référence déclarée. Écarts constatés :

| Exigence du cadrage | Situation |
|---|---|
| Rendu SSG/ISR des pages publiques, servi par CDN (« non négociable » pour l'Afrique) | 0 page statique. Le layout `[locale]` monte `ConvexAuthNextjsServerProvider` (lecture des cookies) et rend toutes les routes dynamiques ; aucun `revalidate`, `'use cache'` ni `generateStaticParams` hors locale. `sanity/lib/live.ts` (cache par tag) existe mais n'est jamais utilisé. |
| Frontière public / membre, URLs signées pour les ressources membres | Non appliquée (F-35). |
| CMS pour tous les contenus éditoriaux (pages, événements, ressources) | Sanity couvre 3 zones ; 9 modules de contenu sont en TypeScript. |
| Newsletter avec double opt-in | Simple opt-in. |
| Modération a priori de la Tribune | A posteriori. |
| Recherche plein texte (Convex index ou Meilisearch) | Sous-chaîne en mémoire. |
| MFA pour rôles sensibles, WAF/anti-DDoS | Absents ; dépend de l'hébergeur (non documenté). |
| CI/CD, environnements, tests automatisés en pipeline | Aucun workflow ; E2E non exécutables sans déploiement. |
| Souveraineté / résidence UE | Non arbitré ; Convex hébergé aux États-Unis par défaut, région EU Sanity non documentée. |
| Analytics respectueux (Plausible/Matomo) | Aucun outil ; le consentement « tout accepter » ne gate rien. |
| Droits RGPD self-service (export, suppression) | Absents. |
| Migration / reprise de données, onboarding des premiers membres | Aucun import ; seuls des seeds fictifs. |
| Design RTL-ready | Non. |

**Ce que le cadrage exclut et qui est bien exclu** : app mobile native, streaming vidéo propre, contenu éditorial réel (à la charge du client), licences de données du baromètre.

### 3.4 Lecture par rapport au devis

Le devis (DT-2026-001) fixait la livraison de la Phase 1 au 1er juillet 2026 avec « plateforme déployée en production, back-office complet, comptes de test et compte administrateur initial, suite de tests, documentation de mise en route ». Au 18 septembre : le code de la Phase 1 est largement présent, mais aucun élément du dépôt ne documente un déploiement en production, la procédure de déploiement Convex/Sanity/Vercel, ni la création du compte administrateur initial (qui ne peut aujourd'hui se faire que par `npx convex run devAdmin:setRoleByEmail` avec `AUTH_DEV_OTP=true`).

---

## 4. Audit technique — backend Convex

### 4.1 Architecture

Schéma de 24 tables (`convex/schema.ts`), RBAC linéaire à 5 rôles (`convex/lib/rbac.ts`), Convex Auth 0.0.94 (mot de passe + OTP 6 chiffres, TTL 15 min), adaptateur e-mail unique (`convex/email.ts`, Resend), rate limiting maison à fenêtre fixe (`convex/lib/rateLimit.ts`), reCAPTCHA v3 devant les 7 formulaires publics via `action` → `internalMutation` (non contournable), journal d'audit à 9 actions, un cron (rappels d'événements, 07:00 UTC). Surface HTTP minimale (`http.ts` n'expose que l'auth). Aucun `ctx.db` dans une action, aucun `.filter()` Convex, fonctions internes correctement en `internal*`.

### 4.2 Constats de sécurité

**Haute**

- **H1 — Publications réservées aux membres servies à tous.** `publications.getBySlug` et `listPublished` renvoient le document complet et l'URL signée du PDF sans vérifier `access` ni l'identité (`convex/publications.ts:68-85`, commentaire l.77-79 « raffinement ultérieur »). Côté Next, `bibliotheque/[slug]/page.tsx:71` utilise `fileUrl` sans condition.
- **H2 — Un seul drapeau d'environnement sépare la production d'une prise de compte.** Si `AUTH_DEV_OTP=true` fuit en production : les OTP sont stockés en clair (`otp.ts:48-50`) et `otp.latestDevCode` est une **`query` publique** (l.92-105) qui rend le dernier code de n'importe quel e-mail, y compris admin. Sept autres `query` publiques d'oracle sont gardées par le même drapeau (`contact.latestForEmail` renvoie le corps des messages ; `newsletter.isSubscribed`, `events.isRegistered`, etc. permettent l'énumération d'adresses). Le test `security.test.ts` n'en couvre que 4 sur 8.
- **H3 — Adaptateur e-mail muet en production.** Sans clé, `sendEmail` journalise et « réussit » (`email.ts:43-46`). Conséquences : aucun OTP reçu (connexion par code impossible sans erreur visible), campagnes newsletter marquées `sent` avec `recipientCount = N` sans envoi (`newsletter.ts:225-247`), rappels marqués `sent: true` définitivement (`eventReminders.ts:148-162`).

**Moyenne**

- **M1 — Déni de service de la file de modération Tribune.** `tribune.reportContent` accepte un `targetId` chaîne arbitraire (`tribune.ts:157-179`) ; `listReports` fait `ctx.db.get(targetId as Id)` : un id invalide fait échouer la requête pour tous les modérateurs, et le signalement ne peut être résolu que depuis cette même page. Correctif : `ctx.db.normalizeId` + vérification d'existence.
- **M2 — reCAPTCHA fail-open.** Sans `RECAPTCHA_SECRET_KEY` ou si Google est injoignable, tout passe (`recaptcha.ts:59-66, 84-90`). Le rate-limit résiduel est indexé sur un e-mail forgeable → remplissage illimité de 6 tables.
- **M3 — Compteur de vues manipulable.** `recordPublicationView` : mutation publique non authentifiée, sans rate-limit, qui patche le document publication (contention OCC + gonflage trivial).
- **M4 — Politique de mot de passe et tentatives par défaut.** 8 caractères minimum par défaut, `maxFailedAttempsPerHour` non configuré explicitement (10/h par défaut de Convex Auth), aucun test.
- **M5 — Fichiers.** Bon : métadonnées réelles relues via `ctx.db.system`, borne 20 Mo, allow-list PDF. Limites : type non rejeté s'il est vide, aucune preuve de propriété du `fileId`, blobs orphelins jamais purgés (30 × 20 Mo/h/membre possibles), fichier accessible après rejet.
- **M6 — Absence de machine à états.** `reviewApplication`, `reviewPublication`, `peerReview.submitReview` ne vérifient pas le statut courant : une candidature approuvée peut être repassée « rejetée » sans retirer le rôle, une publication `draft` jamais soumise peut être « approuvée », un relecteur peut déposer plusieurs avis.

**Basse** : `admin.listUsers` affiche `role ?? 'membre'` alors que le RBAC traite l'absence comme `visiteur` (`admin.ts:73`) ; `journal.listAuditLog` sans borne sur `limit` ; e-mails non normalisés en casse dans `contact.store` et `storeApplication` ; `eventDate` des rappels fourni par le client sans validation ; notes de revue mentorat rangées uniquement dans l'audit log.

### 4.3 Écarts aux bonnes pratiques Convex (`convex/_generated/ai/guidelines.md`)

- **68 `.collect()` non bornés**, dont ~30 scans de table entière dans des queries (`admin.dashboardStats` charge tous les `users` ; `impact.impactStats` charge 5 tables ; `peerReview.getReviewQueue` charge toutes les publications puis filtre en mémoire). **Aucune pagination** dans le projet.
- **Comptage par `collect().length`** (interdit) : `admin.ts:27-35`, `impact.ts:50-66`, `newsletter.subscriberCount`, `notifications.unreadCount`.
- **Index existants ignorés** : `auth.ts:26` et `devAdmin.ts` scannent `users` alors que l'index `email` existe ; pas d'index `users.by_role`, `workspaceMembers.by_user`, `publications.by_reviewStage`.
- **N+1** dans `publications.listForReview`, `tribune.listReports`, `journal.listAuditLog`, `getReviewQueue`.
- **0 validateur de retour** dans tout le projet ; validateurs d'arguments laxistes (`status: v.optional(v.string())` dans youth/mentorship/projects ; liste `THEMES` dupliquée dans 3 fichiers).
- Compteurs dénormalisés à forte churn sur documents stables (`views`, `commentCount`, `memberCount`).

### 4.4 Lacunes du modèle de données

- **Événements sans table** : `eventSlug` libre, jamais validé contre `events-content.ts` → inscriptions et rappels possibles sur des slugs inexistants ; impossible de gérer un événement depuis l'admin.
- **Adhésion approuvée ≠ organisation** : `reviewApplication` élève un rôle utilisateur mais ne crée ni `organizations` ni `organizationMemberships` ; seule `seed.ts` écrit l'annuaire. La table `organizationMemberships` est morte.
- **Publication ↔ organisation** : aucun lien ; `authors` = tableau de noms libres ; l'annuaire d'experts agrège des chaînes.
- **Paiements / cotisations** : aucune table, aucun statut d'adhésion.
- **Contact** : `handled` sans mutation, aucune query de lecture.
- **Statuts** : pas de `rejected`/`archived` pour les publications ; `rateLimits` et `eventReminders` sans purge.

---

## 5. Audit frontend, UX, accessibilité, performance, SEO

### 5.1 Gating et robustesse

- **Aucune protection serveur** des zones privées : `src/proxy.ts` ne fait que déléguer à next-intl (0 usage de `isAuthenticatedNextjs`). `/admin/*`, `/espace-membre`, `/espaces`, `/notifications` renvoient un HTML 200 avec « Chargement… » pendant 1,2 s puis redirigent en JavaScript (`admin-shell.tsx:35`). Les données restent protégées côté Convex (le RBAC serveur tient), mais : pas de 401/403, page blanche sans JS, flash visible, motif `RedirectToSignIn` copié dans 6 fichiers.
- **Aucun `error.tsx`, `not-found.tsx` racine, `loading.tsx`** : un slug inconnu sur `/bibliotheque/x` ou `/tribune/x` affiche la 404 par défaut de Next, en anglais, sans header ni footer ; une panne Convex ou Sanity produit un 500 générique. `actualites/page.tsx:39` et `[slug]/page.tsx` appellent Sanity sans `try/catch`, contrairement à `home.ts` et `about.ts`.

### 5.2 Ce qui est réel et ce qui est démonstration

Données réelles : uniquement ce que saisissent les utilisateurs (candidatures, dépôts, tribune, RSVP, newsletter, espaces, notifications, jeunes, mentorat, projets). Données d'illustration explicites dans le code : baromètre (`barometer-content.ts:3` « scores et classements fictifs »), événements (`events-content.ts:3` « dates/tarifs fictifs »), replays, tarifs d'adhésion (`membership-content.ts:4`), hub jeunes (`youth-content.ts:3`), sections « analyses » et « événements » de l'accueil (cartes statiques, pas les vraies publications), annuaire et bibliothèque (seeds `seed.ts`, `seedPublications.ts`), pourcentages de la page à-propos. Les disclaimers sont affichés en interface, ce qui est honnête, mais un visiteur verra un site plein alors qu'il est vide.

### 5.3 i18n

Parité parfaite (801/801). Points faibles : `getMessageFallback` masque silencieusement les clés manquantes (`request.ts:17-24`) ; 6 ternaires `locale === 'en' ? … : …` et 2 `aria-label` en français dur (`site-header.tsx:29`, `evenements/page.tsx:233`) ; `metadata.description` racine en français quelle que soit la langue ; année du footer figée à 2026 ; le sélecteur de langue perd la query string ; hreflang absent sur `tribune/[id]` et `recherche` ; aucun utilitaire CSS logique (RTL impossible sans reprise).

### 5.4 SEO

`generateMetadata` sur les 30 pages publiques serveur (absent sur `/contact`, page client). **0 OpenGraph / twitter card, 0 JSON-LD** (ni `Organization`, ni `Article`, ni `Event`, ni `Dataset` malgré l'effort open data). Sitemap : inclut `/don` (placeholder), omet `tribune/[id]`. Robots : oublie `/notifications` et `/newsletter/desinscription`. `SITE = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'` dupliqué dans 33 fichiers : un oubli de variable en prod produit des canonicals `localhost`.

### 5.5 Accessibilité

Points forts : `:focus-visible`, `prefers-reduced-motion` (CSS + `MotionConfig` + globe), landmarks, dialogues conformes (focus trap, Échap, `aria-modal`, combobox), selects natifs, `role="alert"`/`role="status"` systématiques.
Manques : pas de skip link ; 0 `aria-invalid` / `aria-describedby` (erreurs globales, jamais rattachées au champ) ; `<nav role="dialog">` dans le menu mobile ; **contraste de l'univers jeunes** : texte papier `#f4f2ec` sur safran `#f58b1a` ≈ **2,2:1** (AA exige 4,5:1) ; la règle axe `color-contrast` est **désactivée** dans les tests (`a11y.spec.ts:57-64`) ; aucune page EN ni connectée scannée ; déclaration d'accessibilité en « niveau non déclarable ».

### 5.6 Performance et faible débit

- 61 routes dynamiques, TTFB dépendant de la latence Convex (États-Unis) à chaque requête.
- `region-globe.tsx` importe `world-atlas/countries-110m.json` (108 Ko) + d3-geo + topojson **côté client**, sans `next/dynamic`, sur `/`, `/barometre`, `/le-reseau`, alors que `region-geo.ts:7-9` promet l'inverse. `region-map.tsx` (rendu SVG serveur) n'est plus utilisé.
- framer-motion (`Reveal`) sur ~30 pages y compris légales ; contenu en `opacity:0` avant hydratation = écran vide en 3G.
- Websocket Convex et reCAPTCHA chargés sur toutes les pages, y compris purement statiques.
- Images : `next/image` partout (bien), mais logos PNG de 276 Ko et 205 Ko pour 160 px d'affichage (SVG attendu), `home-hero.jpg` dupliqué à l'octet près.
- 17 fichiers de fontes woff2, sous-ensemble `latin` uniquement.
- Aucun `loading.tsx`, donc aucun streaming.

### 5.7 UX

Formulaires homogènes (`idle | pending | success`, bouton désactivé) et états vides soignés. Manques : validation par champ, conservation des valeurs après erreur, progression d'upload, aucune confirmation avant action destructrice en admin, aucun toast. Espace membre réduit à e-mail / rôle brut / mes contributions (maquette réalisée à ≈ 25 %). Admin fonctionnel mais austère : nav horizontale, tables sans pagination ni recherche. Footer : 3 liens identiques vers `/a-propos` (ancres manquantes).

### 5.8 Fidélité aux maquettes

Accueil et bibliothèque conformes (bascule de thème déplacée vers le footer, repli mobile des facettes ajouté). Section « actualités » de l'accueil absente. Espace membre très éloigné de la maquette (sidebar, adhésion active, KPI, activité, événements, profil).

### 5.9 Qualité de code

Duplication (`SITE` ×33, `resolve(locale)` ×20, `RedirectToSignIn` ×6, deux systèmes de champs de formulaire), code mort (`sanity/lib/live.ts`, 3 requêtes GROQ, `region-map.tsx`, schémas Sanity `publication`/`page` sans consommateur, dépendance directe `styled-components`), incohérences d'import (`redirect`/`useRouter` tantôt next-intl tantôt Next). Aucun `TODO` en code, mais 24 placeholders légaux.

---

## 6. Qualité, tests, outillage, documentation

### 6.1 Tests

| Niveau | Fichiers | Cas | Remarques |
|---|---|---|---|
| Unitaires Convex (`convex-test`, edge-runtime) | 27 (dont 1 scratch) | 120 | Bonne couverture RBAC, publications (17), tribune, reCAPTCHA (11). Manques : `auth.ts` (callback `createOrUpdateUser` exclu du glob), `otp.ts`, `email.ts`, `devAdmin.ts`, 4 oracles dev, machines à états, gating `members` (inexistant), propriété des fichiers. |
| Unitaires lib + `tests/unit` | 17 | 98 | 1 seul test de composant React. `validation.ts`, `roles.ts`, `consent.ts`, `proxy.ts` non testés. |
| E2E Playwright | 41 | ≈ 121 | Chromium desktop uniquement, FR uniquement, 1 seule route admin sur 13. |

**Bloquant** : `playwright test --list` échoue avant même de lister (6 fichiers instancient `new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!)` au niveau module). **Le dernier commit `8be46bc` casse 5 specs** (`admin`, `auth`, `auth-negative`, `auth-reset`, `library-submit`) : `tests/e2e/_helpers.ts#signUpAndVerify` navigue vers `/fr/inscription`, désormais redirigée vers `/adhesion`. La convention de `TESTING.md` (« aucune feature n'est terminée sans unitaire + E2E + dev-browser ») n'a pas été respectée sur ce commit ; le niveau « dev-browser » n'a aucune trace dans le dépôt. `TESTING.md` affirme que Playwright lance `pnpm dev` ; la config lance `pnpm build && pnpm start`.

### 6.2 CI/CD, lint, dépendances

- **Aucun `.github/`** : pas de workflow, pas de Dependabot. Aucun ESLint (retiré de Next 16), Prettier, husky.
- `pnpm typecheck` exclut `convex/`, `tests/` et `*.test.*` (`tsconfig.json`) : 9 578 lignes de backend ne sont typées par aucun script (`convex/tsconfig.json` séparé, jamais invoqué). Le `next build` les compile toutefois.
- **`pnpm audit --prod` : 77 vulnérabilités** (4 critiques, 36 hautes). Critiques en runtime : `next >=16.0.0 <16.3.3` (dépendance directe), `@auth/core <0.41.3`. Hautes en runtime : `sharp`, `postcss`, `dompurify`. Le reste vient de la chaîne CLI Sanity.
- Déploiement : cible Vercel implicite (`.vercelignore`), aucune procédure `convex deploy` / `sanity deploy`, aucune liste des variables de production (`JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL`, `AUTH_RESEND_KEY`, `RECAPTCHA_SECRET_KEY`, `DEMO_NOINDEX`).

### 6.3 Configuration et secrets

Aucun secret commis. `tests/e2e/storage-state.json` est inoffensif (171 octets, consentement cookies) mais mal nommé. `sanity.cli.ts:7` code en dur un projectId Sanity de repli. Les portes dev (`devAdmin.ts`, seeds) sont correctement en `internalMutation` + garde `AUTH_DEV_OTP` ; le risque est concentré sur les 8 `query` publiques (§ 4.2 H2). `.gitignore` annonce que `convex/_generated` est exclu, alors que 7 fichiers y sont suivis.

### 6.4 Documentation

README inexact (`convex/` « généré par `convex dev` », structure incomplète, aucune mention des tests, du Studio, de reCAPTCHA, de la CSP). Roadmap non mise à jour (F-06 et F-65 marqués « restent » alors qu'ils existent) et lien mort vers `decisions-et-infos-client.md`. Absents : runbook de déploiement, ADR, CHANGELOG, plan de sauvegarde, procédure de rotation des secrets. Historique git : un commit initial de 65 457 lignes, un seul auteur, pas de branches ni de tags.

### 6.5 Hygiène du dépôt

`design/` = 38 Mo (95 % du `.git`), dont un PDF de 12,9 Mo. Fichier scratch `convex/_scratch_contact_verify.test.ts` commis. Skills Convex dupliqués dans `.claude/` et `.agents/` (60 fichiers). Document commercial (devis avec montant) dans le dépôt de code.

---

## 7. Bilan fonctionnel

**Finalisé et solide** : RBAC, i18n, design system, accueil / à-propos / actualités (Sanity avec repli), annuaire + globe, bibliothèque (dépôt, modération, facettes, citations), tribune (posts, commentaires, réactions, signalements), notifications temps réel, espaces collaboratifs (v1), revue par les pairs (v1), calendrier + iCal + RSVP + rappels, newsletter + campagnes, candidatures jeunes / mentorat / projets, tableau de bord admin, impact, journal d'audit, open data (mécanique).

**Partiel** : authentification (sans création de compte), candidature (sans effet), contact (sans lecture), recherche (non scalable), espace membre, back-office (sans CRUD organisations ni utilisateurs), gestion autonome des contenus (3 zones sur 12), SEO (sans OG/JSON-LD), RGPD (légal incomplet, pas de droits self-service), accessibilité (contraste, formulaires), performance (tout dynamique, bundle lourd).

**Façade** : baromètre et visualisations, événements et replays, partenaires, presse, synthèses thématiques.

**Absent** : paiements (cotisations, dons, reçus, suivi financier), modération a priori de la Tribune, boîte à outils / parcours de formation, bibliothèque de médias, 2FA, analytics, droits RGPD self-service, hubs régionaux dédiés.

---

## 8. Plan d'action priorisé

### P0 — Bloquant avant toute mise en ligne

1. **Rétablir un chemin de création de compte** cohérent avec le modèle « adhésion validée » : à l'approbation d'une candidature, créer le compte (invitation par e-mail avec OTP de première connexion), créer l'organisation dans l'annuaire et le rattachement `organizationMemberships` ; ajouter une invitation manuelle dans `/admin/utilisateurs`. Réparer les 5 specs E2E cassées et la fixture `signUpAndVerify`.
2. **Appliquer `access: 'members'`** dans `getBySlug` / `listPublished` (masquer `body`, `fileUrl`, tronquer `abstract` pour les non-membres) + test.
3. **Mettre à jour Next.js ≥ 16.3.3, `@auth/core`, `sanity`** ; ré-auditer.
4. **Basculer les 8 `query` d'oracle dev en `internalQuery`** (ou les supprimer), et faire échouer `sendEmail` en production sans fournisseur au lieu de simuler un succès.
5. **Compléter les 24 champs légaux** (message prêt dans `docs/infos-legales-client.md`) et arbitrer la souveraineté (région EU Sanity, Convex US ou self-host).
6. **Ajouter `not-found.tsx`, `error.tsx`, `loading.tsx`** sous `[locale]` et un `try/catch` sur les fetch Sanity des actualités.
7. **Écran admin des messages de contact** (liste + `handled`) ou notification e-mail au secrétariat.
8. **Décider du sort des contenus fictifs** avant lancement : masquer (baromètre, replays, événements) ou remplacer par les données du secrétariat ; garder `DEMO_NOINDEX` tant que ce n'est pas fait.

### P1 — Dette structurante (semaines suivantes)

9. **CI minimale** : install, `tsc --noEmit` **+ `tsc -p convex`**, `vitest run`, `next build`, `pnpm audit --audit-level=high` ; job E2E sur déploiement Convex de préversion avec `AUTH_DEV_OTP=true` ; Dependabot ; ESLint + Prettier + lint-staged.
10. **Gating serveur** via `isAuthenticatedNextjs()` dans `proxy.ts` pour `/admin`, `/espace-membre`, `/espaces`, `/notifications` ; factoriser `RedirectToSignIn`.
11. **Rendu statique / cache** : sortir `ConvexAuthNextjsServerProvider` du layout racine des pages publiques ou isoler les zones authentifiées ; `revalidate` / `sanityFetch` pour Sanity ; `next/dynamic` sur le globe avec TopoJSON pré-filtré Afrique-Europe ; retirer `Reveal` des pages textuelles ; logos en SVG.
12. **Table `events`** gérée en admin (ou en Sanity) et validation du `eventSlug` ; e-mail de confirmation RSVP ; jauge.
13. **Machines à états** sur les revues (adhésion, publication, jeunes, projets, peer review) ; `normalizeId` sur les signalements ; rate-limit sur le compteur de vues ; index `users.by_role`, `workspaceMembers.by_user`, `publications.by_reviewStage` ; pagination et compteurs dénormalisés pour le dashboard et l'impact.
14. **Modération a priori** de la Tribune (statut `pending` + file de validation) pour respecter F-45/F-49.
15. **Étendre Sanity** aux événements, partenaires, presse, thématiques, rapports, jeunes, adhésion (F-62), avec `latestPostsQuery` sur l'accueil.
16. **SEO** : OpenGraph + image par défaut, JSON-LD (`Organization`, `Article`, `Event`, `Dataset`), sitemap (`tribune/[id]`, retirer `don`), robots (`notifications`, `desinscription`), `lib/site.ts` centralisant l'URL.
17. **Accessibilité** : skip link, `aria-invalid` / `aria-describedby`, correction du contraste safran (ou texte encre sur safran), réactiver `color-contrast` en mode rapport, scanner EN + pages connectées.
18. **Espace membre** conforme à la maquette : profil éditable, organisation rattachée, statut d'adhésion, événements, activité.
19. **Newsletter double opt-in** et analytics sans cookies (Plausible/Matomo) gaté par le consentement existant.

### P2 — Périmètre restant du backlog

20. Paiements (Stripe + PSP XOF), reçus, suivi financier, espace donateur (F-27 → F-31) — prérequis : agrément PSP, rescrit fiscal (cf. cadrage § 4.3).
21. Droits RGPD self-service, 2FA pour rôles sensibles, purge des blobs orphelins et des tables techniques.
22. Boîte à outils / parcours (F-56/57), bibliothèque de médias (F-64), hubs régionaux (F-13), profils jeunes et matching mentorat, versions et double aveugle en revue.
23. Recherche indexée (index full-text Convex), RTL, langues supplémentaires.
24. Hygiène : supprimer `_scratch_contact_verify.test.ts`, le doublon `home-hero.jpg`, l'une des deux copies de skills, sortir `design/presentation/` (33 Mo) et le devis du dépôt ; corriger README, TESTING.md, roadmap ; écrire `docs/deploiement.md` et des ADR.

---

## 9. Annexe — fichiers de référence cités

`convex/auth.ts` · `convex/otp.ts` · `convex/email.ts` · `convex/organizations.ts` · `convex/publications.ts` · `convex/tribune.ts` · `convex/search.ts` · `convex/admin.ts` · `convex/lib/rbac.ts` · `convex/lib/recaptcha.ts` · `convex/schema.ts` · `src/proxy.ts` · `src/app/[locale]/layout.tsx` · `src/app/[locale]/admin/layout.tsx` · `src/components/admin/admin-shell.tsx` · `src/app/[locale]/actualites/page.tsx` · `src/components/map/region-globe.tsx` · `src/lib/legal-content.ts` · `src/lib/events-content.ts` · `src/lib/barometer-content.ts` · `src/app/globals.css` · `tests/e2e/_helpers.ts` · `tests/e2e/a11y.spec.ts` · `playwright.config.ts` · `tsconfig.json` · `package.json`.
