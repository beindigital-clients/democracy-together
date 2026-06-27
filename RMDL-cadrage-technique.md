# Democracy Together
## Note de cadrage technique — Stack, fonctionnalités & devis de réalisation

*Document de travail établi à partir de la note de concept Democracy Together du 24/06/2026. Périmètre : la plateforme numérique (activité « en priorité » du réseau).*

> **Lecture du brief.** « Les stats à utiliser » a été interprété comme **la stack technique** ; « un débit » comme **un devis** (chiffrage temps + budget). Trois livrables : (1) la stack recommandée, (2) la liste exhaustive des fonctionnalités, (3) le devis chiffré et phasé.

---

## 1. Stack technique recommandée

> ⚠ **Mise à jour 25/06/2026 — stack révisée.** Le projet adopte **Next.js + Convex** (application, données, temps réel) **+ Sanity** (CMS éditorial) au lieu de PostgreSQL + Strapi/Directus décrits ci-dessous. Voir `Democracy-Together-fonctionnalites.md` § « Stack cible » pour la décision et ses implications (frontière Convex/Sanity, souveraineté/RGPD, recherche, temps réel). La section ci-dessous reste la référence pour le **raisonnement d'architecture** (perf Afrique, séparation public/membre, i18n RTL-ready, sécurité, anti sur-engineering).

**Principe directeur :** un **monolithe modulaire TypeScript de bout en bout** (Next.js + Node + PostgreSQL), CMS *headless* découplé, un seul langage côté équipe. C'est le meilleur compromis vélocité / maintenabilité / coût pour une association loi 1901 à petite équipe. On évite explicitement microservices et Kubernetes tant que la charge ne les impose pas (anti sur-engineering), et on privilégie des briques **open source hébergées en UE** (souveraineté, RGPD, coûts, cohérence avec la mission).

| Couche | Recommandation | Alternatives |
|---|---|---|
| **Frontend** | Next.js (React, App Router) en rendu hybride SSR/SSG/ISR, déployé en mode self-hostable. Tailwind CSS + une bibliothèque de composants accessibles (Radix UI / shadcn/ui). next-intl pour l'i18n routée par URL (/fr, /en). Cible budget de performance strict (LCP < 2.5s sur 3G). | Astro + îlots React : encore plus léger pour un site majoritairement éditorial (excellent sur bande passante faible), mais moins adapté aux espaces membres riches et collaboratifs., Nuxt (Vue) : équivalent fonctionnel si l'équipe est Vue plutôt que React., SvelteKit : bundles plus petits (bon pour l'Afrique) mais vivier de dev plus restreint, risque de maintenabilité pour une asso. |
| **Backend / API** | Backend Node.js/TypeScript intégré au monolithe Next.js (Route Handlers / Server Actions) pour la logique applicative des espaces membres et collaboratifs, complété par les API du CMS headless pour le contenu éditorial. API typée de bout en bout (tRPC en interne, ou REST/OpenAPI si des partenaires/think tanks doivent consommer l'API). | API GraphQL (si la consommation par des partenaires hétérogènes devient structurante) — mais surcoût de complexité à éviter au lancement., Backend Python/Django ou FastAPI : pertinent si une brique data/recherche (analyse de corpus, NLP sur publications) émerge ; à isoler en service dédié plutôt qu'en cœur applicatif., Strapi/Directus comme backend applicatif unique : possible mais on perd la flexibilité sur la logique métier collaborative. |
| **Base de données** | PostgreSQL (managé UE). ORM Prisma ou Drizzle pour le typage. Extensions natives : pg_trgm + tsvector pour la recherche plein-texte de premier niveau, pgvector en option pour la recherche sémantique future. | MySQL/MariaDB : viable mais Postgres est supérieur pour le full-text et le vectoriel., MongoDB : tentant pour du contenu non structuré, mais le relationnel (rôles, cotisations, adhésions) prime ici ; à éviter comme base unique., SQLite/Turso en edge : excellent pour la lecture distribuée bas coût, mais trop limitant pour les écritures collaboratives concurrentes. |
| **CMS / gestion de contenu éditorial** | CMS headless open source auto-hébergeable : Strapi (recommandé) ou Directus, avec workflow éditorial (brouillon → relecture → publication), gestion multilingue native par champ/locale et modération. | Sanity / Contentful / Storyblok : excellents en DX et i18n, mais SaaS hors-UE possible et coûts à l'usage croissants avec le volume — moins alignés souveraineté/budget asso., Payload CMS : très bon CMS TypeScript self-hosted, s'intègre au même Postgres et au monolithe Node (option élégante si on veut tout unifier en TS)., WordPress headless : familier et riche en plugins, mais charge de maintenance/sécurité plus lourde et modèle de données moins propre pour une API structurée. |
| **Recherche & indexation** | Démarrer avec la recherche plein-texte PostgreSQL (tsvector + pg_trgm) ; passer à Meilisearch (ou Typesense) auto-hébergé dès que le volume/exigence de pertinence multilingue le justifie. pgvector / recherche sémantique en phase ultérieure. | Typesense : très proche de Meilisearch, also open source et performant., Elasticsearch / OpenSearch : surpuissants mais gourmands en RAM et en exploitation — disproportionnés pour une asso au lancement., Algolia : DX excellente mais SaaS payant à l'usage et hors-UE — écarté pour souveraineté/budget. |
| **Authentification & gestion des rôles** | Auth.js (NextAuth) pour l'intégration native Next.js, ou Keycloak (auto-hébergé UE) si le besoin SSO/fédération inter-organisations devient central. RBAC applicatif (rôles : public, membre, contributeur, éditeur, modérateur, admin, bureau régional). Magic links + e-mail/mot de passe + option SSO institutionnel (OIDC/SAML) pour les think tanks partenaires. | Ory (Kratos/Keto) : très solide et open source, plus modulaire mais courbe d'apprentissage élevée pour une petite équipe., Clerk / Auth0 / WorkOS : DX et SSO entreprise excellents, mais SaaS payant à l'usage et résidence de données à vérifier (RGPD/UE) — coûts qui montent avec le nombre de membres., Supabase Auth : pertinent si on adopte l'écosystème Supabase pour la base. |
| **Internationalisation (i18n / L10n)** | Deux niveaux distincts : (1) i18n de l'interface via next-intl (chaînes UI, formats date/nombre, pluriels ICU), routage localisé /fr /en avec hreflang ; (2) localisation du contenu éditorial gérée par le CMS (champs traduisibles par locale, fallback FR/EN). Architecture content-locale extensible pour ajouter de nouvelles langues (ES, AR, PT) sans refonte. | next-i18next / i18next : très répandu, mais next-intl est mieux aligné avec l'App Router moderne., Plateforme de traduction (Crowdin, Tolgee self-hosted, Weblate) branchée au CMS si la traduction devient un flux collaboratif important — Weblate/Tolgee sont open source et hébergeables UE. |
| **Gestion de fichiers / médias (PDF, datasets)** | Stockage objet compatible S3 chez un fournisseur UE (Scaleway Object Storage, OVHcloud Object Storage, ou Cloudflare R2). Diffusion via CDN avec URLs signées pour les ressources réservées aux membres. Pipeline d'optimisation : images en AVIF/WebP responsive (next/image), génération de miniatures/aperçus PDF, et conversion des gros datasets en formats légers/paginés. | MinIO auto-hébergé : S3 open source si l'on veut tout maîtriser sur un VPS UE, au prix de l'exploitation., Supabase Storage : intégré si l'on choisit l'écosystème Supabase., AWS S3 + CloudFront : matures mais résidence/coûts d'egress moins favorables pour ce profil. |
| **Hébergement & infrastructure** | Application conteneurisée (Docker) déployée sur une plateforme PaaS UE simple — Scaleway / OVHcloud / Clever Cloud (FR) — ou une approche Coolify/Dokku sur VPS pour le contrôle des coûts. CDN devant tout le trafic public (Cloudflare ou bunny.net) avec PoP en Afrique et en Europe. Base Postgres managée UE. Pas de Kubernetes au lancement. | Vercel/Netlify : DX optimale pour Next.js mais résidence de données et coûts à l'usage à surveiller (RGPD/UE, budget) — acceptable si combiné à une base et un stockage UE, sinon écarté pour la souveraineté., Hetzner (DE) : excellent rapport coût/performance pour des VPS UE, avec Coolify par-dessus., Kubernetes managé (Scaleway Kapsule/OVH) : seulement si la charge et l'équipe le justifient plus tard. |
| **CI/CD & DevOps** | GitHub (ou GitLab) + GitHub Actions / GitLab CI : lint, typecheck, tests, build d'image Docker, déploiement automatisé sur environnements staging puis production. Migrations de base versionnées (Prisma Migrate/Drizzle). Infrastructure légère décrite en code (docker-compose / Terraform si besoin). Sauvegardes automatisées chiffrées de Postgres et du stockage objet, avec test de restauration périodique. | GitLab CI auto-hébergé : si l'on veut le dépôt et le CI en UE sous contrôle complet., Forgejo/Gitea + Woodpecker CI : 100% open source auto-hébergé, coût minimal, plus d'exploitation., Ansible pour la config serveur si l'on reste sur VPS plutôt que PaaS. |
| **Emailing / notifications** | Transactionnel via un fournisseur UE : Scaleway Transactional Email, Brevo (ex-Sendinblue, FR) ou un SMTP type Postmark/Mailgun région UE. Newsletters et campagnes (rapports, sommet de Paris, webinaires) via Brevo ou Listmonk auto-hébergé. Notifications in-app pour les espaces membres/collaboratifs (centre de notifications en base + e-mail digest). | Postmark : excellente délivrabilité transactionnelle (région UE disponible)., AWS SES (région UE) : très bon marché à grande échelle, configuration plus technique., Resend : DX moderne et intégration Next.js facile, à vérifier côté résidence/conformité UE. |
| **Analytics & mesure d'impact** | Web analytics respectueux de la vie privée et sans cookies : Plausible (FR/EU, open source, auto-hébergeable) ou Matomo (auto-hébergé UE). Pour la mesure d'impact spécifique (publications citées, influence politique, diversité des membres), tableau de bord interne alimenté par la base applicative (KPIs métier) + comptage de téléchargements/citations. | PostHog (self-hosted UE) : analytics produit avancé (funnels, rétention sur les espaces membres) si l'on veut comprendre finement l'usage de la plateforme., Umami : alternative open source ultra-légère à Plausible., Éviter Google Analytics 4 : transferts de données problématiques au regard du RGPD (jurisprudence CNIL/EDPB). |
| **Sécurité** | Défense en profondeur : HTTPS/TLS partout (HSTS), en-têtes de sécurité (CSP, X-Frame-Options, Referrer-Policy), WAF + anti-DDoS via le CDN (Cloudflare), rate limiting et protection anti-bot sur l'auth et les formulaires. Validation/sanitation systématique des entrées (Zod), chiffrement des données au repos (Postgres + stockage objet) et en transit, secrets gérés hors code (vault/variables d'environnement chiffrées). Politique RGPD opérationnelle : minimisation, consentement, droits d'accès/effacement, registre des traitements, DPA avec les sous-traitants UE. Audits de dépendances automatisés (Dependabot) et revues de sécurité périodiques. | MFA/2FA obligatoire pour les rôles éditeurs/admins et contributeurs sensibles (TOTP) — à considérer comme quasi-obligatoire vu le profil de menace., Bug bounty léger / pentest annuel via prestataire UE une fois la plateforme mature., Outils SAST/DAST open source (Semgrep, OWASP ZAP) intégrés au CI pour automatiser la détection de vulnérabilités. |

### Justifications par couche

- **Frontend.** Le rendu serveur/statique (SSG+ISR) est non négociable pour le double objectif SEO public + performance sur connexions africaines variables : les pages publiques (rapports, policy briefs, pages think tanks) sont pré-rendues et servies en HTML léger via CDN, tandis que les espaces membres restent en rendu dynamique authentifié. React garde un large vivier de développeurs (maintenabilité petite équipe / sous-traitance facile). next-intl gère le routage multilingue SEO-friendly (hreflang, URLs localisées) requis pour FR/EN extensible. Radix/shadcn donne l'accessibilité (WCAG) sans réinventer les composants, ce qui sert la contrainte d'accessibilité.
- **Backend / API.** Un monolithe modulaire TypeScript partagé front/back est le meilleur ratio vélocité/maintenabilité pour une petite équipe : un seul langage, un seul déploiement, typage partagé, pas de microservices à opérer (anti sur-engineering, contrainte budget asso explicite). Server Actions/Route Handlers couvrent largement les besoins (cotisations, soumission de publications, espaces collaboratifs). Exposer une couche REST/OpenAPI documentée prépare l'agrégation inter-think-tanks (la mission centrale de Democracy Together) et d'éventuelles intégrations futures sans imposer GraphQL dès le départ.
- **Base de données.** PostgreSQL est le choix par défaut rationnel : open source (pas de coût de licence, crucial pour une asso), extrêmement mature, relationnel pour modéliser proprement membres/think tanks/publications/rôles/cotisations, tout en gérant le JSONB pour les métadonnées éditoriales souples. Ses extensions (recherche plein-texte, vectorielle) permettent de reporter l'adoption d'un moteur de recherche dédié coûteux jusqu'à ce que le volume le justifie (anti sur-engineering). Très large offre de managé en UE (souveraineté/RGPD).
- **CMS / gestion de contenu éditorial.** Democracy Together est avant tout une plateforme de contenu intensif éditorialisé (rapports annuels, policy briefs, futures revues peer-reviewed) produit par des contributeurs non techniques (chercheurs, think tanks). Un CMS headless découple la rédaction du frontend Next.js et donne aux éditeurs une interface d'administration sans toucher au code. Strapi/Directus sont open source (coûts maîtrisés), s'auto-hébergent en UE, gèrent les rôles éditoriaux et la traduction par locale (FR/EN extensible), et exposent une API consommée par le front. La modération/gouvernance demandée est couverte par les workflows de publication et les rôles. Le futur processus de peer-review s'appuiera sur des états/transitions de contenu personnalisés.
- **Recherche & indexation.** La découvrabilité des publications/recherches/données est au cœur de la valeur (modèle International IDEA cité). Mais déployer un cluster de recherche lourd dès le lancement serait du sur-engineering coûteux. Le full-text Postgres couvre gratuitement les premiers milliers de documents. Meilisearch est open source, frugal en ressources (bon pour un hébergement asso), gère le multilingue, le typo-tolérance et les facettes (filtrer par thème/continent/think tank/année) avec une excellente latence — important pour une UX correcte sur connexions lentes. Approche progressive = coûts alignés sur l'adoption réelle.
- **Authentification & gestion des rôles.** Democracy Together fédère des organisations (think tanks, ONG, académiques) avec des niveaux d'accès distincts : il faut un RBAC clair, gouvernable, et des comptes d'organisation. Auth.js est gratuit, s'intègre au monolithe et couvre la majorité des besoins au lancement (sessions, OAuth Google/LinkedIn pour les jeunes/chercheurs, magic links adaptés aux connexions instables). Keycloak (open source, hébergeable en UE) est la voie de montée en charge dès qu'on doit fédérer l'identité de think tanks ayant leur propre IdP (SAML/OIDC) et déléguer la gestion d'utilisateurs aux bureaux régionaux (Dakar/Bruxelles). On garde le RBAC côté application pour rester maître des règles métier.
- **Internationalisation (i18n / L10n).** Le multilingue est une contrainte structurante (FR/EN minimum, extensible, public Afrique francophone/anglophone + Europe). Séparer i18n d'interface et localisation de contenu évite le piège classique de tout mettre dans des fichiers de traduction. next-intl est le standard Next.js App Router, supporte le format ICU MessageFormat (pluriels/genres importants pour une rédaction soignée et l'inclusivité revendiquée). Gérer la traduction de contenu dans le CMS confie le travail aux éditeurs, pas aux développeurs. L'URL localisée et hreflang sont indispensables au SEO multilingue. La prise en charge future de l'arabe impose de prévoir le RTL dès la conception du design system.
- **Gestion de fichiers / médias (PDF, datasets).** Les rapports PDF volumineux et datasets sont au cœur de l'offre, et la cible Afrique impose de minimiser le poids transféré. Le stockage objet S3 découple les fichiers de la base et du serveur applicatif (scalabilité, coût au Go faible). Les fournisseurs UE (Scaleway/OVH) assurent la résidence des données RGPD ; R2 ajoute un avantage coût (pas de frais d'egress) très utile pour une asso diffusant largement. Le CDN rapproche les fichiers des utilisateurs (latence Dakar/Bruxelles), les URLs signées protègent le contenu premium des membres, et l'optimisation média réduit la facture de bande passante autant que le temps de chargement.
- **Hébergement & infrastructure.** L'hébergement UE est explicitement demandé (RGPD/souveraineté) : Scaleway/OVH/Clever Cloud sont français et conformes, avec datacenters européens. Conteneuriser garantit la portabilité (pas de lock-in fort) et la reproductibilité, atout maintenabilité. Un PaaS ou Coolify/Dokku évite la charge d'exploitation d'un cluster K8s — sur-engineering injustifié pour une asso. Le point critique pour la performance Afrique est le CDN multi-PoP : il sert le HTML statique/ISR et les médias au plus près des utilisateurs de Dakar comme de Bruxelles, neutralisant la latence transcontinentale. Cloudflare apporte en bonus WAF, anti-DDoS et cache, bunny.net est très bon marché.
- **CI/CD & DevOps.** Pour une petite équipe, l'automatisation CI/CD réduit les erreurs humaines et le temps passé en ops. GitHub Actions est gratuit dans des limites larges pour une asso (et sans coût de runner au début). Le pipeline qualité (typecheck/tests) est ce qui rend un monolithe TypeScript maintenable dans la durée. Les migrations versionnées évitent la dérive de schéma. Le point souvent négligé et pourtant vital : sauvegardes chiffrées + restauration testée — un contenu de recherche accumulé sur des années est l'actif principal de Democracy Together, sa perte serait existentielle.
- **Emailing / notifications.** Democracy Together communique massivement par e-mail : confirmations d'adhésion, reçus de cotisation, alertes éditoriales, invitations événements, digests collaboratifs. Séparer transactionnel (délivrabilité critique) et marketing/newsletter (consentement, désinscription) est une bonne pratique RGPD. Brevo et Scaleway sont européens, ce qui simplifie la conformité (données de contacts en UE). Listmonk (open source) est imbattable en coût si l'asso gère de gros volumes de newsletter elle-même. Les notifications in-app évitent de tout faire reposer sur l'e-mail, utile pour la dimension collaborative.
- **Analytics & mesure d'impact.** Plausible/Matomo sont conçus pour le RGPD : pas de cookies de tracking, pas de bandeau de consentement intrusif, données hébergées en UE — parfaitement alignés avec une organisation qui défend les droits et la démocratie numérique (cohérence éthique avec la mission, partenariat CDT évoqué). Ils sont aussi très légers côté client (compatible connexions lentes). Surtout, les vrais indicateurs de Democracy Together (publications citées, impact sur les politiques, diversité géographique/de genre des membres) ne sont pas des métriques web : ils doivent être modélisés dans la base et exposés via un dashboard interne, car ce sont eux qui servent l'évaluation revendiquée dans la note de concept et le reporting aux bailleurs (UE, philanthropes).
- **Sécurité.** Une organisation pro-démocratie travaillant sur des régions à régimes autoritaires est une cible de choix (États hostiles, désinformation, doxing de contributeurs en zones fragiles). La sécurité n'est pas optionnelle : protection des comptes de chercheurs/think tanks, intégrité des publications, et confidentialité des membres vulnérables. Le WAF/anti-DDoS du CDN absorbe les attaques volumétriques. Le RGPD est à la fois une obligation légale (asso française, données UE) et un argument de confiance vis-à-vis des membres et bailleurs. Le choix systématique de briques open source/UE réduit aussi la surface de risque souverain. La sécurité doit être traitée comme un processus continu (audits dépendances, revues), pas un état figé.

### Notes d'architecture transversales

- Principe directeur : monolithe modulaire TypeScript de bout en bout (Next.js + Node + Postgres), CMS headless découplé, et un seul langage côté équipe. C'est le meilleur compromis vélocité/maintenabilité/coût pour une asso loi 1901 avec une petite équipe — on évite explicitement les microservices et Kubernetes tant que la charge ne les impose pas (anti sur-engineering, contrainte budget répétée dans le brief).
- Le CDN multi-PoP (Europe + Afrique) est la pièce maîtresse de la performance pour le public africain : il sert le HTML pré-rendu (SSG/ISR), les médias optimisés (AVIF/WebP) et les PDF via cache, neutralisant la latence transcontinentale. Conception 'lite par défaut' : budgets de performance, lazy-loading, pagination des datasets, mode dégradé sans JS pour les pages éditoriales critiques.
- Séparation nette public / membre : le contenu public est statique, cacheable et SEO-optimisé (hreflang, sitemaps localisés, schema.org Article/Dataset/Organization) ; les espaces membres et collaboratifs sont rendus dynamiquement derrière l'authentification avec contrôle RBAC. Cette frontière simplifie le cache, la sécurité et le raisonnement sur les données.
- Modèle de données central à concevoir tôt : entités Organisation (think tank) / Membre / Rôle / Publication (avec états éditoriaux et locales) / Thème / Région / Cotisation / Événement. La notion d'organisation multi-membres avec délégation aux bureaux régionaux (Dakar, Bruxelles) structure le RBAC et la future fédération d'identité.
- i18n à deux niveaux dès le départ (UI via next-intl, contenu via CMS multilingue) et design system pensé RTL-ready pour anticiper l'arabe/d'autres langues sans refonte. C'est un investissement faible au lancement qui évite une dette coûteuse plus tard.
- Souveraineté et éthique cohérentes avec la mission : préférer systématiquement des briques open source hébergées en UE (Postgres, Meilisearch, Plausible/Matomo, Strapi/Directus, Keycloak). Cela aligne conformité RGPD, maîtrise des coûts, absence de lock-in, et crédibilité d'une organisation qui défend la démocratie numérique et les droits.
- Approche progressive (crawl-walk-run) : phase 1 = portail éditorial public + adhésion/membres + recherche Postgres ; phase 2 = espaces collaboratifs, Meilisearch, fédération d'identité, newsletters ; phase 3 = recherche sémantique (pgvector), revue peer-reviewed, API partenaires. On n'achète de la complexité que quand l'usage la justifie.
- Documentation et reproductibilité : README d'architecture, environnements Dockerisés identiques, migrations versionnées et runbook d'exploitation — indispensables pour qu'une petite équipe (et d'éventuels prestataires successifs) puisse reprendre le projet sans perte de connaissance.

### Risques techniques à surveiller

- Continuité de l'équipe : une asso dépend souvent de bénévoles/prestataires intermittents. Le risque n°1 est la perte de connaissance. Mitigation : stack mainstream (React/Node/Postgres), documentation, IaC, tests, et éviter toute techno de niche.
- Sous-estimation du coût/charge d'exploitation du self-hosting : héberger soi-même CMS, recherche, e-mail et analytics réduit les coûts SaaS mais augmente la charge ops (mises à jour, sécurité, sauvegardes). Mitigation : démarrer sur PaaS managé UE, n'auto-héberger que progressivement, automatiser sauvegardes et mises à jour.
- Performance Afrique non garantie par le seul choix de stack : sans budgets de performance stricts, optimisation média et CDN bien configuré (PoP africains), l'expérience peut rester médiocre sur connexions lentes. Mitigation : tester réellement en conditions 3G/réseau dégradé, viser des pages légères et fonctionnelles sans JS.
- Profil de menace élevé (organisation pro-démocratie ciblée par acteurs étatiques/désinformation) : risque d'attaques ciblées, de compromission de comptes de contributeurs en zones fragiles, de DDoS lors d'événements médiatisés (sommet de Paris). Mitigation : MFA obligatoire pour rôles sensibles, WAF/anti-DDoS, pentest, minimisation des données personnelles exposées.
- Complexité du multilingue et de la modération sous-estimée : traduire et modérer du contenu produit par des dizaines de think tanks dans plusieurs langues est un travail humain et organisationnel autant que technique. Mitigation : workflows éditoriaux clairs dans le CMS, rôles de relecture, éventuellement plateforme de traduction collaborative (Weblate/Tolgee).
- Dépendance au financement par subventions/dons : un budget irrégulier peut interrompre l'hébergement ou la maintenance. Mitigation : coûts d'infra bas et prévisibles (open source + UE éco), pas d'engagements SaaS à l'usage qui explosent avec le succès, plan de reprise si une brique doit migrer.
- Dérive vers le sur-engineering : la tentation d'adopter microservices/K8s/recherche lourde 'pour l'avenir' est un risque budgétaire réel. Mitigation : discipline d'architecture progressive, décisions de complexité justifiées par des métriques d'usage réelles.
- Conformité RGPD au-delà de la technique : la résidence UE des données ne suffit pas ; il faut registre des traitements, DPA avec chaque sous-traitant, politique de consentement, gestion des droits (accès/effacement). Mitigation : traiter le RGPD comme un chantier organisationnel dédié, idéalement avec un référent/DPO.

---

## 2. Fonctionnalités à implémenter

**142 fonctionnalités réparties sur 22 modules.** Chaque fonctionnalité est marquée d'une **priorité** (MVP / V1 / V2) et d'une **complexité** (Faible / Moyenne / Élevée).

Répartition par priorité : **MVP : 38 · V1 : 64 · V2 : 40**.

### 2.1 Portail public & site institutionnel
*Présenter Democracy Together, sa vision, sa mission, ses fondateurs, sa gouvernance et ses activités au grand public, asseoir la crédibilité institutionnelle (décideurs et bailleurs jugent la fiabilité avant de s'engager), et convertir les visiteurs en membres, contributeurs, donateurs, abonnés ou participants aux événements.*

| Fonctionnalité | Prio | Complexité | Description |
|---|---|---|---|
| **Page d'accueil institutionnelle** | MVP | Moyenne | Proposition de valeur, mise en avant des publications phares, prochain sommet et événements, point d'entrée différencié vers le hub jeunes, appels à l'action (adhérer, contribuer, donner, s'abonner). |
| **Pages éditoriales institutionnelles (À propos, Mission, Vision, Gouvernance)** | MVP | Faible | Pages présentant l'association loi 1901, sa mission/vision, la structure de gouvernance, les fondateurs et la page de vulgarisation 'Démocratie' destinée au grand public. |
| **Annuaire public des fondateurs et de l'équipe dirigeante** | MVP | Faible | Présentation des fondateurs et membres dirigeants avec biographies, rôles et photos, au service de la confiance institutionnelle. |
| **Présentation des bureaux régionaux (Paris, Dakar, Bruxelles)** | V1 | Moyenne | Pages dédiées par bureau avec contacts régionaux, périmètre d'action et, à terme, ligne éditoriale propre et contenus localisés (modèle de bureaux semi-autonomes type Carnegie Europe). |
| **Page de transparence & financement** | V1 | Faible | Présentation publique des sources de financement (cotisations, dons, subventions UE, mécénat), de la gouvernance budgétaire et des indicateurs d'impact publics, pour rassurer décideurs et bailleurs. |
| **Page contact et formulaire de contact** | MVP | Faible | Formulaire avec routage par sujet (adhésion, presse, partenariat, don, intervention événement) et protection anti-spam. |
| **Espace presse / médias** | V1 | Moyenne | Communiqués de presse, kit média, logos, chiffres-clés prêts à citer, embeds partageables et contacts presse, soutenant la stratégie de visibilité et de plaidoyer. |
| **Pages partenaires et institutions affiliées** | V1 | Faible | Vitrine des partenaires (ONG, institutions académiques, décideurs, bailleurs UE) avec logos, descriptifs et nature de la collaboration. |
| **Bandeau cookies et pages légales** | MVP | Faible | Mentions légales, CGU, politique de confidentialité, déclaration d'accessibilité, plan du site et gestion du consentement cookies conforme CNIL. |

### 2.2 Comptes, authentification & rôles (RBAC)
*Gérer les identités, l'authentification sécurisée et un modèle de rôles/permissions granulaire adapté à un réseau international de think tanks, avec espaces publics et privés, connexion simplifiée pour les audiences mobiles, et délégation au sein des organisations.*

| Fonctionnalité | Prio | Complexité | Description |
|---|---|---|---|
| **Inscription et création de compte** | MVP | Faible | Création de compte individuel avec vérification d'email et acceptation des CGU/RGPD, avec parcours d'inscription court optimisé mobile. |
| **Connexion / déconnexion sécurisée** | MVP | Faible | Authentification par email/mot de passe avec sessions sécurisées et gestion des tentatives échouées. |
| **Connexion simplifiée mobile (OTP / lien magique)** | V1 | Moyenne | Connexion par code à usage unique ou lien magique pour faciliter l'accès depuis mobile et sur connexions instables, prioritaire pour les jeunes et l'audience africaine. |
| **Réinitialisation et politique de mot de passe** | MVP | Faible | Mot de passe oublié, exigences de robustesse et expiration optionnelle. |
| **Authentification à deux facteurs (2FA)** | V1 | Moyenne | 2FA par e-mail ou application TOTP pour les comptes sensibles (admins, représentants, modérateurs). |
| **SSO / connexion via fournisseurs académiques et sociaux** | V2 | Moyenne | Connexion via Google, LinkedIn, ORCID ou fédération académique pour faciliter l'adhésion des chercheurs et la désambiguïsation des auteurs. |
| **Modèle de rôles et permissions (RBAC)** | MVP | Élevée | Gestion des rôles (visiteur, membre individuel/contributeur, représentant de think tank, chercheur, jeune/mentoré, mentor, éditeur, modérateur éditorial, administrateur réseau, super-admin, trésorier, DPO) et permissions granulaires conditionnant l'accès public/membre. |
| **Rôles d'organisation et délégation** | V1 | Moyenne | Attribution de rôles au sein d'un think tank : un admin d'organisation gère ses chercheurs rattachés, ses publications et ses droits. |
| **Profil utilisateur et paramètres de compte** | MVP | Faible | Édition du profil, préférences de langue, de notifications et de confidentialité. |

### 2.3 Gestion des membres, adhésions & cotisations
*Gérer le cycle de vie des membres (individus et think tanks), les types d'adhésion, le paiement des cotisations et le renouvellement, avec une tarification solidaire adaptée aux pays en développement, source principale de financement de l'association.*

| Fonctionnalité | Prio | Complexité | Description |
|---|---|---|---|
| **Catalogue des types d'adhésion** | MVP | Faible | Définition des types d'adhésion (think tank membre, membre individuel, jeune/étudiant, partenaire, membre des pays en développement) avec tarifs, avantages et présentation claire des bénéfices membres. |
| **Demande d'adhésion en ligne (tunnels distincts org / individu)** | MVP | Moyenne | Formulaires de candidature distincts pour organisations et individus, avec pièces justificatives, rattachement des chercheurs à l'organisation et soumission. |
| **Workflow de validation des adhésions** | MVP | Moyenne | Circuit de revue et d'approbation/refus des candidatures par le comité d'adhésion, avec statuts, historique et vérification des organisations. |
| **Paiement des cotisations en ligne (multi-devises)** | MVP | Moyenne | Encaissement par carte/SEPA via prestataire de paiement, multi-devises (EUR/XOF a minima), avec reçus automatiques. |
| **Cotisations échelonnées et tarification solidaire** | V1 | Moyenne | Grille tarifaire ajustée par revenu/pays (tarifs réduits pour pays en développement) et paiement échelonné. |
| **Renouvellement et relances automatiques** | V1 | Moyenne | Rappels d'échéance, renouvellement en un clic et relances automatiques avant expiration. |
| **Statut d'adhésion et avantages associés** | MVP | Faible | Affichage du statut (actif, en attente, expiré, suspendu) conditionnant l'accès aux espaces et ressources réservés. |
| **Historique des paiements et facturation** | V1 | Moyenne | Suivi des paiements, factures/reçus téléchargeables et exports comptables. |
| **Tableau de bord de gestion des membres (CRM léger)** | V1 | Moyenne | Vue administrateur des membres, segmentation, recherche, export et actions en masse. |

### 2.4 Annuaire interconnecté du réseau (think tanks, chercheurs & experts)
*Offrir un espace privé aux membres et matérialiser la dimension 'réseau' de Democracy Together via un annuaire structuré et un graphe reliant organisations, experts, publications, thèmes, pays et événements, valorisant les contributeurs et la diversité géographique, culturelle et de genre, et permettant aux décideurs/médias de trouver le bon expert.*

| Fonctionnalité | Prio | Complexité | Description |
|---|---|---|---|
| **Tableau de bord membre personnalisé** | MVP | Moyenne | Espace personnalisé avec adhésion, contributions, événements, messages, appels à contributions et recommandations. |
| **Profils d'organisation (think tanks)** | MVP | Moyenne | Fiche détaillée par think tank : description, pays/région, thématiques, publications, équipe, contacts, gérée par l'organisation elle-même. |
| **Profils de chercheurs et experts (scholars directory)** | V1 | Moyenne | Profils individuels avec expertise, affiliations, langues, publications, métriques (vues, téléchargements, citations) et identifiants (ORCID), inspirés de Carnegie et ResearchGate. |
| **Annuaire interactif et recherche à facettes du réseau** | MVP | Moyenne | Annuaire filtrable des think tanks et experts par pays, continent, thématique, langue, expertise et type de membre, point d'entrée pour décideurs et journalistes. |
| **Graphe de réseau (relations membres-experts-publications-thèmes)** | V2 | Élevée | Visualisation en graphe reliant membres, experts, publications, thèmes, pays et événements, matérialisant le réseau et facilitant la découverte de connexions, inspiré de BTI et ResearchGate. |
| **Carte géographique du réseau** | V1 | Moyenne | Cartographie interactive des membres par bureau régional et pays, illustrant la couverture Afrique/Europe. |
| **Badges et niveaux de membre** | V2 | Faible | Badges signalant statut, ancienneté, contributions et programmes (fondateur, mentor, jeune talent). |
| **Indicateurs de diversité du réseau** | V2 | Moyenne | Mise en avant visualisable des données de diversité géographique, culturelle et de genre du réseau, alimentant le KPI 'diversité des membres'. |

### 2.5 Bibliothèque de connaissances & publications
*Centraliser, organiser et diffuser les recherches, rapports, policy briefs et publications produits par les think tanks membres en accès ouvert et citable, cœur de la mission d'agrégation, avec une frontière claire mais perméable entre contenu public et ressources réservées.*

| Fonctionnalité | Prio | Complexité | Description |
|---|---|---|---|
| **Dépôt et soumission de publications** | MVP | Moyenne | Téléversement de publications (rapports, policy briefs, articles) avec métadonnées riches (auteurs, organisation, thématique, région, langue, date, type) et sauvegarde de brouillon locale tolérante aux coupures réseau. |
| **Bibliothèque consultable et fiches publication** | MVP | Moyenne | Catalogue de publications avec page de détail, résumé, métadonnées, téléchargement et lecture en ligne, optimisé pour la découvrabilité et le SEO. |
| **Espace working papers / preprints à publication rapide** | V1 | Moyenne | Sas de publication léger (working papers, notes, policy briefs) en amont de la revue peer-reviewed, abaissant la barrière pour les think tanks émergents et les jeunes chercheurs, avec citabilité (DOI) dès le lancement 2026, inspiré de SSRN et des carnets Hypotheses. |
| **Workflow éditorial et validation bilingue** | V1 | Élevée | Circuit de relecture/validation avant publication (brouillon, soumis, en revue, en traduction, publié, archivé) avec coordination de la version bilingue FR/EN. |
| **Gestion documentaire et formats** | V1 | Moyenne | Support PDF, DOCX, ePub et visionneuse intégrée avec versions et pièces jointes, version PDF systématique pour lecture hors-ligne. |
| **Versioning des documents** | V2 | Moyenne | Historique des versions d'une publication et gestion des mises à jour. |
| **Citations, DOI et export bibliographique** | V1 | Moyenne | Génération de citations normées, attribution de DOI (Crossref/DataCite) et export BibTeX/RIS, avec identifiants pérennes adoptés dès le départ pour servir le KPI 'publications citées'. |
| **Métriques d'impact par publication** | V1 | Moyenne | Affichage par publication des téléchargements, vues, citations et, le cas échéant, de son influence sur des textes/politiques (lien avec le policy tracker), restitué aux auteurs/organisations, inspiré de SSRN/ResearchGate. |
| **Rapports annuels et publications phares** | MVP | Faible | Mise en avant des rapports annuels sur l'état de la démocratie et des policy briefs conjoints, avec narratif, données et cartographie (modèle Democracy Report V-Dem). |
| **Contrôle d'accès aux ressources (frontière public/membre)** | V1 | Moyenne | Distinction entre ressources publiques citables et ressources réservées aux membres selon statut, avec teasers et appel à adhérer plutôt que des murs opaques. |

### 2.6 Agrégation & synthèse des recherches
*Collecter, synthétiser et diffuser les analyses des think tanks membres sur les thèmes clés, valeur ajoutée différenciante du réseau inspirée d'International IDEA, transformant Democracy Together d'agrégateur en producteur de savoir.*

| Fonctionnalité | Prio | Complexité | Description |
|---|---|---|---|
| **Flux agrégé des dernières analyses** | V1 | Moyenne | Fil consolidé des publications et analyses récentes du réseau, filtrable par thématique et région. |
| **Notes de synthèse thématiques** | V1 | Moyenne | Production de synthèses transversales agrégeant plusieurs publications sur un thème (gouvernance numérique, anti-corruption, transitions démocratiques). |
| **Pages thématiques pivots (dossiers curatés)** | V1 | Moyenne | Page par thème (les 5 axes) agrégeant publications, experts, événements et données sous une bannière commune, modèle de centre de ressources thématique d'International IDEA et Carnegie. |
| **Synthèse et résumés assistés par IA** | V2 | Moyenne | Génération assistée de résumés et points clés de publications, avec validation humaine obligatoire. |
| **Recommandations de contenu liées** | V2 | Moyenne | Suggestion de publications, analyses, experts et événements connexes sur les pages de contenu. |

### 2.7 Recherche, taxonomie & thématiques multilingues
*Permettre de retrouver efficacement contenus, membres et données via une recherche performante et une taxonomie structurée pensée multilingue dès la conception (un même thème cherchable en FR et EN), extensible aux langues africaines.*

| Fonctionnalité | Prio | Complexité | Description |
|---|---|---|---|
| **Moteur de recherche global** | MVP | Moyenne | Recherche plein texte transversale (publications, membres, événements, données) avec pertinence, surlignage et chargement progressif des résultats. |
| **Filtres à facettes** | MVP | Moyenne | Filtrage par thématique, région/pays, type de contenu, langue, organisation et date sur l'ensemble du corpus. |
| **Taxonomie thématique structurée (5 axes)** | MVP | Moyenne | Référentiel des thématiques pivots (gouvernance numérique, participation citoyenne, anti-corruption, transitions démocratiques, crises globales) géré centralement et multilingue par conception. |
| **Mots-clés et tags** | V1 | Faible | Étiquetage libre et contrôlé des contenus, avec pages de regroupement par tag. |
| **Recherche multilingue (synonymes cross-langue)** | V1 | Élevée | Indexation et recherche tenant compte des contenus FR/EN, des métadonnées et des synonymes cross-langue, avec fallback gracieux quand une traduction manque. |
| **Recherches sauvegardées et alertes** | V2 | Moyenne | Enregistrement de requêtes et alertes email sur nouveaux contenus correspondants. |
| **Balisage SEO et données structurées** | V1 | Moyenne | Métadonnées, schema.org et balisage optimisés pour être cité par les moteurs et les IA (AI-SEO), maximisant la portée et les citations. |

### 2.8 Baromètre de la démocratie & outils analytiques
*Doter Democracy Together d'un actif différenciant : un indice composite propriétaire Afrique-Europe et un portail de données ouvertes interactif (inspiré de V-Dem, Freedom House, BTI et International IDEA), pour le positionner comme producteur de données de référence et nourrir le rapport annuel et les KPI de citations/impact.*

| Fonctionnalité | Prio | Complexité | Description |
|---|---|---|---|
| **Indice composite 'Baromètre de la démocratie'** | V1 | Élevée | Indice propriétaire calculé sur l'Afrique et l'Europe, agrégeant des sous-dimensions alignées sur les 5 axes. Démarrage par méta-agrégation d'indices tiers sous licence ouverte avant production de données primaires, avec méthodologie transparente et publiée. |
| **Carte mondiale interactive à code couleur** | V1 | Élevée | Carte à code couleur (libre/partiellement libre/non libre ou équivalent) comme porte d'entrée visuelle immédiate vers les fiches pays, inspirée de Freedom House. |
| **Fiches pays standardisées** | V1 | Moyenne | Fiche par pays combinant score, narratif explicatif rédigé par des experts régionaux locaux et évolution historique (modèle Freedom House / BTI), avec production décentralisée mobilisant les think tanks membres. |
| **Jeux de données et catalogue de données** | V1 | Moyenne | Publication de jeux de données versionnés et citables (DOI, codebook documenté) avec métadonnées, licence ouverte et téléchargement (CSV, Excel, JSON). |
| **Outil de visualisation et comparateur sans code** | V2 | Élevée | Graphiques, séries temporelles et comparateur d'indicateurs entre pays/régions et dans le temps, générables par un utilisateur non-technicien (modèle V-Dem graphing tools, My BTI), démocratisant l'accès aux données. |
| **API ouverte et exports de données** | V2 | Élevée | Exposition des données ouvertes via API documentée et endpoints d'export (CSV/Excel), avec packages R/Python à terme, pour réutilisation par chercheurs, journalistes et développeurs tiers. |
| **Licences ouvertes et conditions de réutilisation** | V2 | Faible | Gestion des licences (CC-BY) et des conditions de réutilisation des données et publications, cohérente avec les valeurs d'ouverture et le SEO. |

### 2.9 Suivi de plaidoyer & impact politique
*Relier les analyses du réseau aux processus de décision (textes UE, réformes nationales africaines/européennes) pour transformer le KPI flou 'impact sur les politiques' en données concrètes et démontrer la valeur aux financeurs, inspiré du CDT et de Carnegie.*

| Fonctionnalité | Prio | Complexité | Description |
|---|---|---|---|
| **Suivi des positions et du plaidoyer (policy tracker)** | V2 | Élevée | Page recensant les prises de position du réseau sur des textes en cours, avec statut, organisations contributrices et traçabilité de l'influence sur les politiques. |
| **Livrables orientés décideurs** | V2 | Moyenne | Formats de livrables destinés aux décideurs (auditions, contributions aux régulateurs, lettres ouvertes, Q&A) proposés aux membres, inspirés du CDT. |
| **Coalitions et lettres co-signées** | V2 | Moyenne | Formalisation des approches multi-parties prenantes (coalitions, lettres co-signées) reliant partenariats et campagnes de sensibilisation. |

### 2.10 Collaboration entre membres
*Faciliter les échanges, le travail conjoint et les partenariats entre think tanks et chercheurs du réseau, en réservant à l'espace membre la collaboration (espaces projets, messagerie) et en soutenant les projets conjoints et le fonds dédié.*

| Fonctionnalité | Prio | Complexité | Description |
|---|---|---|---|
| **Messagerie interne et discussions directes** | V1 | Moyenne | Messages privés entre membres et organisations, avec notifications. |
| **Forums et espaces de discussion thématiques** | V1 | Moyenne | Espaces de discussion par thématique ou groupe de travail, modérés selon la charte éditoriale. |
| **Groupes de travail et projets collaboratifs** | V1 | Élevée | Création de groupes/projets conjoints avec membres, ressources partagées, espace de travail et fil d'activité, supportant la co-écriture entre pairs de différents pays. |
| **Partage et co-écriture de documents de travail** | V2 | Élevée | Espace de partage de documents au sein d'un groupe ou projet, avec commentaires, versions et droits d'accès. |
| **Appels à contributions et co-publications** | V2 | Moyenne | Lancement d'appels à contributions et coordination de publications conjointes (policy briefs, rapports conjoints), avec co-signature. |
| **Fonds dédié aux projets collaboratifs** | V2 | Moyenne | Soumission, instruction et suivi de projets collaboratifs éligibles au fonds dédié de l'association (appels à projets). |

### 2.11 Événements, sommet, webinaires & ateliers
*Organiser et gérer les événements internationaux (sommet annuel de Paris incluant la conférence inaugurale 2026, webinaires, ateliers régionaux), de l'inscription à la diffusion et aux replays, avec un agenda scientifique mutualisé fédérant la vie du réseau (modèle Calenda).*

| Fonctionnalité | Prio | Complexité | Description |
|---|---|---|---|
| **Catalogue et agenda des événements** | MVP | Moyenne | Liste et calendrier des événements (sommet, webinaires, ateliers) avec filtres par type, région, thématique et langue, et gestion des fuseaux horaires. |
| **Pages détaillées d'événement** | MVP | Faible | Page par événement : programme, intervenants, lieu/visio, date/fuseau, documents associés. |
| **Inscription et billetterie** | V1 | Moyenne | Inscription en ligne (gratuite ou payante), jauge, confirmation et billets/QR codes, optimisée mobile. |
| **Gestion des intervenants et du programme** | V1 | Moyenne | Saisie des intervenants, sessions, plénières et planning multi-pistes. |
| **Webinaires et diffusion en ligne** | V1 | Moyenne | Intégration de visioconférence/streaming pour webinaires et sessions hybrides. |
| **Agenda mutualisé et appels à communications (call for papers)** | V2 | Moyenne | Agenda scientifique fédérant événements, ateliers et appels à communications/contributions/financements du réseau (modèle Calenda), avec soumission et évaluation des propositions. |
| **Replays et ressources post-événement** | V1 | Moyenne | Mise à disposition des enregistrements, transcriptions, sous-titres, présentations, podcasts et comptes rendus après l'événement. |
| **Rappels et notifications d'événement** | V1 | Faible | Confirmations, rappels automatiques et notifications de changement aux inscrits. |

### 2.12 Espace jeunes, programmes & mentorat
*Hub dédié au ton et design différenciés, mobile-first, pour soutenir l'implication des jeunes et le renforcement des capacités des think tanks émergents via un parcours d'engagement progressif (découvrir, apprendre, contribuer, mentorer), du mentorat, des formations, des bourses et une boîte à outils de capacity building.*

| Fonctionnalité | Prio | Complexité | Description |
|---|---|---|---|
| **Hub jeunes différencié et parcours d'engagement** | V1 | Moyenne | Espace au ton et design distincts de l'univers institutionnel, point d'entrée non intimidant, parcours progressif (découvrir, apprendre, contribuer, mentorer) avec gamification légère (progression, badges, reconnaissance) et points d'entrée depuis les réseaux sociaux. |
| **Présentation et candidature aux programmes** | V1 | Faible | Pages des programmes jeunes et de renforcement de capacités avec candidatures en ligne courtes et optimisées mobile. |
| **Mise en relation mentor / mentoré (matching)** | V1 | Moyenne | Appariement entre mentors expérimentés et think tanks/jeunes en régions fragiles selon profils, langues et thématiques. |
| **Suivi du parcours de mentorat** | V2 | Moyenne | Planification des sessions, objectifs, jalons et retours du binôme mentor/mentoré. |
| **Centre de ressources / boîte à outils capacity building** | V2 | Moyenne | Bibliothèque de guides méthodologiques, modèles, modules de formation courts, webinaires enregistrés et kits dédiés au renforcement des capacités des think tanks émergents, avec progression et certification, inspirée des resource centers d'International IDEA. |
| **Bourses et financements ciblés** | V2 | Moyenne | Candidature et gestion de financements ciblés (bourses) pour think tanks en pays en développement et jeunes chercheurs. |
| **Contributions jeunes au format accessible** | V2 | Moyenne | Soumission de contributions courtes (tribunes, formats accessibles) avec accompagnement éditorial et mise en avant des réussites de jeunes contributeurs. |
| **Campagnes de sensibilisation et d'engagement jeunes** | V2 | Faible | Espaces, défis et appels à mobilisation pour campagnes de sensibilisation et événements jeunes régionaux (Dakar, Bruxelles), avec partage social facile. |

### 2.13 Revue académique peer-reviewed
*Mettre en place à terme une revue académique avec évaluation par les pairs et infrastructure d'accès ouvert (modèle OpenEdition) pour renforcer la crédibilité scientifique du réseau, dans la continuité de l'espace working papers.*

| Fonctionnalité | Prio | Complexité | Description |
|---|---|---|---|
| **Soumission d'articles à la revue** | V2 | Moyenne | Portail de soumission d'articles avec métadonnées normalisées, fichiers et conformité aux consignes aux auteurs. |
| **Gestion de l'évaluation par les pairs** | V2 | Élevée | Attribution des relecteurs, évaluation en double aveugle, rapports et décisions. |
| **Workflow éditorial de la revue** | V2 | Élevée | Suivi du cycle de vie (soumis, en revue, révisions, accepté, publié) avec rôles éditoriaux et coordination de la traduction. |
| **Numéros, volumes et publication en libre accès** | V2 | Moyenne | Organisation en numéros/volumes, pagination, DOI et diffusion en libre accès avec modèle Freemium (HTML gratuit, formats enrichis financés). |
| **Indexation et archivage pérenne** | V2 | Moyenne | Métadonnées normées, moissonnage OAI-PMH et archivage pour indexation (DOAJ, OpenAIRE) et interopérabilité avec les moteurs académiques. |

### 2.14 Dons & financement
*Diversifier et sécuriser les ressources via dons philanthropiques, mécénat RSE et suivi des subventions, avec un parcours de don sans friction multi-devises, en complément des cotisations.*

| Fonctionnalité | Prio | Complexité | Description |
|---|---|---|---|
| **Page et formulaire de don en ligne (sans friction, multi-devises)** | V1 | Moyenne | Don ponctuel ou récurrent par carte/SEPA, montants suggérés, multi-devises (EUR/XOF), message du donateur et bouton 'Soutenir' persistant. |
| **Reçus fiscaux et confirmations de don** | V1 | Moyenne | Génération et envoi automatiques de reçus fiscaux conformes à l'association loi 1901. |
| **Espace donateurs et mécènes** | V2 | Moyenne | Suivi de l'historique des dons, gestion des dons récurrents et reconnaissance des mécènes. |
| **Campagnes de financement et appels à dons** | V2 | Moyenne | Création de campagnes ciblées (projet, programme) avec objectif, jauge et suivi. |
| **Partenariats RSE et mécénat d'entreprise** | V2 | Moyenne | Gestion des partenariats RSE et conventions de mécénat avec entreprises. |
| **Suivi des subventions et bailleurs** | V2 | Moyenne | Suivi des subventions (UE) et reporting financier interne aux bailleurs. |

### 2.15 Communication, newsletter & personnalisation
*Diffuser l'actualité du réseau, animer la communauté, entretenir le lien avec les audiences publiques et membres, et créer la rétention via la veille thématique et les recommandations personnalisées.*

| Fonctionnalité | Prio | Complexité | Description |
|---|---|---|---|
| **Blog / actualités** | MVP | Faible | Publication d'articles d'actualité, billets de vulgarisation et annonces avec catégories et auteurs, soignés au filtre anti-slop pour un rendu humain et crédible. |
| **Inscription à la newsletter** | MVP | Faible | Abonnement avec double opt-in et préférences thématiques/linguistiques. |
| **Gestion et envoi de newsletters segmentées** | V1 | Moyenne | Composition, segmentation (par région/sujet) et envoi de newsletters thématiques avec suivi des ouvertures/clics, canal de diffusion régulier des analyses agrégées (modèle Carnegie). |
| **Gestion des abonnements et désabonnement** | V1 | Faible | Centre de préférences, désabonnement en un clic et conformité anti-spam. |
| **Veille thématique et recommandations (suivi/alertes)** | V2 | Moyenne | Suivi d'un thème/pays/auteur, alertes sur nouvelles publications, mises à jour d'indice et événements, et recommandations personnalisées, créant rétention et engagement (modèle SSRN/ResearchGate, Democracy Tracker). |
| **Partage social et open graph** | V1 | Faible | Boutons de partage, métadonnées sociales et embeds partageables pour publications, données et événements. |
| **Flux RSS** | V2 | Faible | Flux RSS des actualités et publications pour syndication. |

### 2.16 Notifications
*Tenir les utilisateurs informés des événements pertinents (contenus, échéances, messages, modération) sur les canaux appropriés, sans saturer.*

| Fonctionnalité | Prio | Complexité | Description |
|---|---|---|---|
| **Notifications transactionnelles par email** | MVP | Faible | Emails automatiques (inscription, adhésion, paiement, événement, mot de passe). |
| **Centre de notifications in-app** | V1 | Moyenne | Flux de notifications dans l'espace membre (messages, validations, nouveautés, appels à contributions). |
| **Préférences de notification par canal** | V1 | Faible | Paramétrage fin des notifications par type, canal (email, in-app) et fréquence. |
| **Digests périodiques** | V2 | Moyenne | Résumés hebdomadaires/mensuels personnalisés des nouveautés du réseau. |

### 2.17 Back-office d'administration & gouvernance
*Donner aux administrateurs réseau les outils pour gérer contenus, utilisateurs, organisations, adhésions, financements et configuration de la plateforme, et assurer la gouvernance du réseau.*

| Fonctionnalité | Prio | Complexité | Description |
|---|---|---|---|
| **Tableau de bord d'administration** | MVP | Moyenne | Vue d'ensemble (membres, contenus, événements, paiements, alertes) pour le pilotage. |
| **Gestion des utilisateurs et organisations** | MVP | Moyenne | Création, édition, suspension, fusion de comptes/organisations, validation/onboarding des membres et attribution des rôles. |
| **CMS headless multilingue** | MVP | Moyenne | Édition des pages, blog, événements et ressources avec versions linguistiques, prévisualisation et planification, sur une stack maintenable adaptée au budget associatif. |
| **Gestion de la taxonomie et des référentiels** | V1 | Moyenne | Administration des thématiques, pays/régions, types de membres et listes de référence, gérées de façon multilingue. |
| **Journal d'audit et traçabilité** | V1 | Moyenne | Historique des actions sensibles (modifications, validations, accès) pour la gouvernance. |
| **Paramétrage global de la plateforme** | V1 | Moyenne | Configuration des langues, méthodes de paiement, devises, modèles d'email, droits d'accès Freemium et options fonctionnelles. |

### 2.18 Workflow éditorial & modération
*Outiller les modérateurs éditoriaux pour piloter la relecture, la publication bilingue, la qualité et la neutralité des contenus, et modérer les espaces collaboratifs et communautaires selon la charte éditoriale.*

| Fonctionnalité | Prio | Complexité | Description |
|---|---|---|---|
| **File de relecture et assignation** | V1 | Élevée | File d'attente de relecture avec assignation, annotation, demande de révisions et validation, et états de soumission visibles pour réduire l'incertitude des contributeurs. |
| **Gestion des traductions et cohérence bilingue FR/EN** | V1 | Moyenne | Coordination de la traduction, suivi de l'état linguistique et publication de la version bilingue cohérente. |
| **Modération communautaire et signalements** | V1 | Moyenne | Traitement des signalements, application de la charte éditoriale et sanctions sur publications, forums, profils et espaces jeunes. |
| **Charte éditoriale et outils de signalement** | V1 | Faible | Charte éditoriale publiée et outils de signalement intégrés aux espaces collaboratifs et communautaires. |
| **Curation et mise en avant des contenus** | V1 | Faible | Curation de la une et mise en avant éditoriale des contenus à fort impact. |

### 2.19 Internationalisation & multilingue
*Rendre la plateforme nativement multilingue (FR + EN dès le lancement) avec une architecture i18n prête pour l'arabe, le portugais et le wolof, traitée comme un choix d'architecture et non une surcouche, pour servir l'inclusion géographique et culturelle.*

| Fonctionnalité | Prio | Complexité | Description |
|---|---|---|---|
| **Interface multilingue (FR/EN) avec sélecteur persistant** | MVP | Moyenne | Traduction de l'interface, détection de langue et choix manuel persistant, FR et EN au minimum. |
| **Contenu éditorial multilingue** | V1 | Moyenne | Saisie et gestion de versions linguistiques des pages, publications et événements, avec fallback gracieux (langue source mentionnée plutôt que page vide). |
| **URLs localisées et hreflang** | V1 | Moyenne | Routage par langue (URLs /fr, /en, hreflang) bon pour le SEO et suggestion de langue selon profil/navigateur. |
| **Gestion des formats locaux** | V1 | Faible | Affichage localisé des dates, fuseaux horaires, devises (EUR/XOF) et nombres. |
| **Extensibilité linguistique et support RTL** | V2 | Moyenne | Architecture permettant d'ajouter d'autres langues (langues africaines, portugais) sans refonte, avec support RTL prévu pour l'arabe. |

### 2.20 Analytics, KPI & mesure d'impact
*Suivre l'usage de la plateforme et mesurer l'impact du réseau via les KPI définis (publications citées, impact politique, diversité des membres, croissance), et produire le reporting aux bailleurs (UE, RSE).*

| Fonctionnalité | Prio | Complexité | Description |
|---|---|---|---|
| **Analytics d'usage de la plateforme** | V1 | Faible | Suivi du trafic, des audiences et des parcours, avec consentement RGPD respecté. |
| **Tableau de bord des KPI d'impact** | V1 | Moyenne | Indicateurs agrégés : nombre de publications, citations, impact sur les politiques (lié au policy tracker), croissance et diversité des membres. |
| **Indicateurs de diversité** | V2 | Moyenne | Suivi de la diversité géographique, culturelle et de genre des membres et contributeurs. |
| **Statistiques de contenu restituées aux auteurs** | V2 | Moyenne | Vues, téléchargements et citations par publication, restitués aux auteurs et organisations dans leur tableau de bord. |
| **Rapports et exports de pilotage pour bailleurs** | V2 | Moyenne | Exports périodiques et rapports d'impact pour bailleurs (UE), gouvernance et reporting RSE. |

### 2.21 Performance, accès léger & inclusion technique
*Garantir une expérience rapide et accessible sur connexions Afrique/Europe variables et en priorité mobile, comme levier de différenciation et d'inclusion réelle, pensé dès l'architecture.*

| Fonctionnalité | Prio | Complexité | Description |
|---|---|---|---|
| **Budget de performance et rendu optimisé** | MVP | Moyenne | Rendu statique/côté serveur des pages publiques, LCP rapide même en 3G, lazy-loading, formats d'image modernes (AVIF/WebP) et pagination/chargement progressif des longues listes. |
| **Mode léger / économie de données et hors-ligne** | V1 | Élevée | Versions allégées des pages de données, téléchargements PDF/ePub pour lecture hors-ligne, images optimisées et approche PWA pour zones à connectivité instable (Dakar, régions fragiles). |
| **CDN avec points de présence régionaux** | V1 | Faible | Diffusion via CDN avec points de présence proches de Dakar et Bruxelles pour réduire la latence. |
| **Conception mobile-first des parcours clés** | MVP | Moyenne | Parcours d'engagement jeunes, inscription, lecture et don conçus en priorité mobile, avec formulaires courts, sauvegarde de brouillon locale et tolérance aux coupures réseau. |

### 2.22 RGPD, conformité, sécurité & accessibilité
*Garantir la conformité légale (RGPD, association loi 1901, CNIL), la protection des données, la sécurité et l'accessibilité (RGAA/WCAG 2.1 AA), conditions de crédibilité auprès des bailleurs UE et d'inclusion.*

| Fonctionnalité | Prio | Complexité | Description |
|---|---|---|---|
| **Gestion du consentement et cookies** | MVP | Faible | Bannière de consentement conforme CNIL, registre des consentements (cookies, newsletter, mentorat) et désactivation des traceurs non essentiels. |
| **Politique de confidentialité et registre des traitements** | MVP | Faible | Politique de confidentialité à jour et registre interne des traitements, avec minimisation des données. |
| **Sécurité des données et chiffrement** | MVP | Moyenne | Chiffrement en transit/au repos, contrôle d'accès, sauvegardes et bonnes pratiques de sécurité applicative. |
| **Droits des personnes (self-service export, rectification, suppression)** | V1 | Moyenne | Parcours self-service permettant aux utilisateurs d'exporter, rectifier ou supprimer leurs données (droit à l'oubli, portabilité), et outils admin de traitement des demandes. |
| **Accessibilité (RGAA / WCAG 2.1 AA)** | V1 | Moyenne | Contrastes, navigation clavier complète, structure sémantique, alternatives textuelles, sous-titres et transcriptions des webinaires, formulaires labellisés et déclaration d'accessibilité publiée. |
| **Localisation des données et sous-traitants UE** | V2 | Faible | Hébergement conforme dans l'UE et encadrement contractuel des sous-traitants (DPA), documenté pour la crédibilité auprès des bailleurs. |

---

## 3. Devis de réalisation

### 3.1 Hypothèses

- TJM agence HT (hypothèses, France/UE): Lead/Architecte 720€, Dev senior 640€, Dev mid 500€, Designer UX/UI 540€, Chef de projet 580€, QA 460€. TJM mixte de production (dev) = 556€ (40% senior / 60% mid).
- Barème de charge par fonctionnalité selon la complexité déclarée: Faible = 2,5 j-homme, Moyenne = 6 j-homme, Élevée = 12 j-homme (dev + intégration). Le référentiel contient 142 fonctionnalités sur 22 modules (38 MVP, 64 V1, 40 V2).
- Une provision d'intégration/aléas de 18% est ajoutée à la charge dev brute de chaque phase (collage des features, cas limites, allers-retours de recette) — le barème unitaire chiffre le chemin nominal.
- Les charges transverses (architecture/socle, design system bi-univers, QA, gestion de projet) sont chiffrées séparément par phase et facturées à leur TJM propre, car non incluses dans le barème par feature.
- Stack imposée: monolithe modulaire TypeScript (Next.js App Router + Node + PostgreSQL managé UE), CMS headless Strapi/Directus, Meilisearch en V1, hébergement PaaS UE (Scaleway/OVH/Clever Cloud), CDN multi-PoP (Cloudflare/bunny.net), Auth.js puis Keycloak. Pas de Kubernetes ni microservices.
- Approche crawl-walk-run: MVP = portail éditorial public + adhésions/membres + recherche Postgres; V1 = espaces collaboratifs, Meilisearch, baromètre, fédération d'identité, dons, newsletters; V2 = recherche sémantique (pgvector), revue peer-reviewed, API ouverte, plaidoyer.
- Capacité équipe: ~4 ETP utiles sur le MVP, ~4,5 sur la V1, ~4 sur la V2 (1 ETP = 5 j/sem mais ~4 j réellement productifs). 1 mois calendaire ≈ 4,33 semaines.
- Devis en EUR HT. La fourchette haute = base × 1,30 et couvre l'incertitude de spécification (specs non figées, périmètre des features 'Élevée' comme le baromètre composite, le graphe de réseau, le policy tracker et la peer-review).
- Production de contenu, traductions FR/EN, données primaires du baromètre, rédaction des fiches pays et méthodologie de l'indice sont à la charge de Democracy Together (travail éditorial/scientifique), non chiffrés ici.
- Les coûts récurrents (hébergement, services tiers, TMA) sont annuels et hors prix de réalisation ci-dessus.

### 3.2 Taux journaliers (TJM, € HT)

| Profil | TJM € HT |
|---|---|
| Lead développeur / Architecte | 720 |
| Développeur senior (full-stack TS) | 640 |
| Développeur mid (full-stack TS) | 500 |
| Designer UX/UI | 540 |
| Chef de projet | 580 |
| QA / Recette | 460 |
| TJM mixte de production (dev) | 556 |

### 3.3 Phasage (crawl–walk–run)

| Phase | Charge (j-h) | Durée | Coût € HT (basse) | Coût € HT (haute) |
|---|---|---|---|---|
| **MVP** | 315 | 20 sem. | 178 340 | 231 843 |
| **V1** | 561 | 31 sem. | 313 364 | 407 373 |
| **V2** | 400 | 25 sem. | 223 648 | 290 742 |
| **TOTAL** | **1276** | **~18 à 20 mois en continu (MVP ~4,5 mois, V1 ~7 mois, V2 ~6 mois), ou étalable selon financement et capacité d'équipe"** | **715 352** | **929 958** |

**MVP** — Mettre en ligne un portail éditorial public crédible (SEO + perf 3G), permettre l'adhésion et le paiement des cotisations multi-devises, exposer publications/événements/annuaire de base, avec RBAC, CMS multilingue FR/EN, recherche Postgres, conformité RGPD/CNIL socle et fondations de performance mobile-first. Objectif: être présentable et opérationnel pour le sommet de Paris 2026.

Modules : Portail public & site institutionnel (MVP); Comptes, auth & rôles RBAC (MVP); Membres, adhésions & cotisations (MVP); Annuaire interconnecté — dashboard membre, profils org, annuaire/facettes (MVP); Bibliothèque & publications — dépôt, catalogue, rapports phares (MVP); Recherche & taxonomie — moteur, facettes, 5 axes (MVP); Événements — catalogue, pages, agenda (MVP); Communication — blog, newsletter opt-in (MVP); Notifications email transactionnelles (MVP); Back-office — dashboard admin, gestion users/orgs, CMS headless multilingue (MVP); i18n interface FR/EN (MVP); Performance — budget perf, mobile-first (MVP); RGPD/sécurité — consentement, registre, chiffrement (MVP)

**V1** — Déployer la dimension réseau et la valeur scientifique: working papers citables (DOI), workflow éditorial bilingue, profils chercheurs, baromètre de la démocratie (indice + carte + fiches pays + datasets), espaces collaboratifs (messagerie, forums, groupes de travail), dons multi-devises, billetterie événements, espace jeunes/mentorat, Meilisearch, fédération d'identité (Keycloak), accessibilité RGAA, droits RGPD self-service, mode léger/PWA et KPI d'impact.

Modules : Portail — bureaux régionaux, transparence, presse, partenaires (V1); Auth — OTP/magic link, 2FA, délégation org (V1); Membres — solidaire, renouvellement, facturation, CRM léger (V1); Annuaire — profils chercheurs, carte géographique (V1); Bibliothèque — working papers/DOI, workflow éditorial bilingue, formats, citations, métriques, accès public/membre (V1); Agrégation & synthèse — flux, notes, pages thématiques (V1); Recherche — Meilisearch, recherche multilingue, tags, SEO structuré (V1); Baromètre — indice composite, carte mondiale, fiches pays, datasets (V1); Collaboration — messagerie, forums, groupes de travail (V1); Événements — billetterie, intervenants, webinaires, replays (V1); Espace jeunes — hub, candidatures, matching mentorat (V1); Dons — formulaire multi-devises, reçus fiscaux (V1); Communication — newsletters segmentées, partage social (V1); Notifications in-app, préférences (V1); Back-office — taxonomie, audit, paramétrage (V1); Workflow éditorial & modération (V1); i18n contenu, URLs/hreflang, formats locaux (V1); Analytics & KPI d'impact (V1); Performance — mode léger/PWA, CDN régional (V1); RGPD — droits personnes, accessibilité RGAA (V1)

**V2** — Positionner Democracy Together comme producteur de données de référence et infrastructure académique: revue peer-reviewed (double aveugle, OAI-PMH), API ouverte et exports, comparateur de données sans code, recherche sémantique (pgvector), graphe de réseau, policy tracker (impact politique), co-écriture, fonds collaboratif, SSO académique, digests, RTL/extensibilité linguistique et reporting bailleurs avancé.

Modules : Auth — SSO académique/social ORCID (V2); Annuaire — graphe de réseau, badges, indicateurs diversité (V2); Bibliothèque — versioning documents (V2); Agrégation — résumés assistés IA, recommandations (V2); Recherche — recherches sauvegardées + alertes (V2); Baromètre — visualisation/comparateur sans code, API ouverte, licences (V2); Plaidoyer & impact — policy tracker, livrables décideurs, coalitions (V2); Collaboration — co-écriture documents, appels à contributions, fonds dédié (V2); Événements — agenda mutualisé / call for papers (V2); Espace jeunes — suivi mentorat, capacity building, bourses, contributions, campagnes (V2); Revue académique peer-reviewed complète (V2); Dons — espace donateurs, campagnes, RSE, suivi subventions (V2); Communication — veille/recommandations, RSS (V2); Notifications — digests périodiques (V2); i18n — extensibilité linguistique + RTL (V2); Analytics — diversité, stats auteurs, exports bailleurs (V2); RGPD — localisation données + sous-traitants UE (V2)

### 3.4 Détail de la charge par module

| Module | Charge (j-h) | Coût € HT |
|---|---|---|
| Bibliothèque de connaissances & publications | 73.8 | 41 005 |
| Baromètre démocratie & outils analytiques | 73.8 | 41 005 |
| Annuaire interconnecté du réseau | 59.6 | 33 132 |
| Collaboration entre membres | 56.6 | 31 492 |
| Membres, adhésions & cotisations | 55.5 | 30 836 |
| Comptes, authentification & rôles (RBAC) | 54.3 | 30 180 |
| Recherche, taxonomie & multilingue | 52.5 | 29 196 |
| Revue académique peer-reviewed | 49.6 | 27 555 |
| Événements, sommet, webinaires & ateliers | 48.4 | 26 899 |
| Espace jeunes, programmes & mentorat | 48.4 | 26 899 |
| Dons & financement | 42.5 | 23 619 |
| Back-office d'administration & gouvernance | 42.5 | 23 619 |
| Portail public & site institutionnel | 38.9 | 21 651 |
| Agrégation & synthèse des recherches | 35.4 | 19 682 |
| Workflow éditorial & modération | 34.2 | 19 026 |
| Internationalisation & multilingue | 31.3 | 17 386 |
| Analytics, KPI & mesure d'impact | 31.3 | 17 386 |
| Performance, accès léger & inclusion technique | 31.3 | 17 386 |
| RGPD, conformité, sécurité & accessibilité | 30.1 | 16 730 |
| Communication, newsletter & personnalisation | 28.9 | 16 074 |
| Suivi de plaidoyer & impact politique | 28.3 | 15 746 |
| Notifications | 20.1 | 11 153 |

### 3.5 Équipe recommandée

- **Lead développeur / Architecte (full-stack TypeScript)** — 1 ETP sur tout le projet — propriétaire de l'architecture monolithe modulaire, du modèle de données central (Organisation/Membre/Rôle/Publication/Thème/Région/Cotisation/Événement), du RBAC, des choix techniques et des revues de code/sécurité.
- **Développeur senior full-stack** — 1 ETP — features à forte complexité (baromètre, recherche, workflow éditorial, collaboratif, peer-review), pair-programming avec les mid.
- **Développeur mid full-stack** — 1 à 2 ETP selon phase — intégration des features standard, CMS, formulaires, pages éditoriales, paiements.
- **Designer UX/UI** — ~0,5 ETP en continu, pic en début de MVP — design system bi-univers (institutionnel + hub jeunes), parcours mobile-first, accessibilité RGAA/WCAG, RTL-ready.
- **Chef de projet** — ~0,4 à 0,5 ETP — pilotage, backlog, coordination avec Democracy Together et les bureaux régionaux, recette fonctionnelle, comités.
- **QA / Recette** — ~0,3 à 0,5 ETP, montant en V1/V2 — tests fonctionnels, tests réels en conditions 3G/réseau dégradé, accessibilité, non-régression.
- **DPO / référent RGPD (côté Democracy Together ou prestataire ponctuel)** — Ponctuel — registre des traitements, DPA sous-traitants UE, politique de consentement (chantier organisationnel, hors forfait dev).

### 3.6 Coûts récurrents annuels (hors prix de réalisation)

| Poste | € / an |
|---|---|
| Hébergement application PaaS UE (Scaleway/OVH/Clever Cloud) — app conteneurisée + workers | 1 800 - 4 200 |
| PostgreSQL managé UE (haute dispo + sauvegardes) | 1 200 - 3 600 |
| Stockage objet S3 UE + bande passante (PDF, datasets, médias) | 600 - 2 400 |
| CDN multi-PoP Europe + Afrique (Cloudflare Pro/Business ou bunny.net) + WAF/anti-DDoS | 300 - 2 600 |
| Hébergement CMS headless (Strapi/Directus) + Meilisearch + Keycloak (instances dédiées dès V1) | 1 200 - 3 600 |
| Emailing transactionnel UE (Scaleway/Brevo/Postmark) — volumes adhésions/reçus/alertes | 300 - 1 800 |
| Newsletters & campagnes (Brevo, ou Listmonk auto-hébergé) | 0 - 1 800 |
| Frais prestataire de paiement (Stripe/Mollie/SEPA) — ~1,4 à 2,9% du volume encaissé, hors infra | variable (% des cotisations/dons) |
| Attribution DOI (Crossref/DataCite, frais d'adhésion + par DOI) — dès V1 | 300 - 1 500 |
| Analytics privacy (Plausible/Matomo cloud UE, ou auto-hébergé) | 0 - 600 |
| Noms de domaine, certificats, monitoring/uptime, error tracking (Sentry self-host ou cloud) | 200 - 1 200 |
| Maintenance / TMA (correctifs, montées de version, sécurité, sauvegardes testées) — forfait ~15-20% du coût de réalisation de la portée livrée/an | 25 000 - 55 000 |
| Audit de sécurité / pentest annuel par prestataire UE (recommandé vu le profil de menace) | 5 000 - 12 000 |

### 3.7 Exclusions / hors-périmètre

- Production de contenu éditorial, scientifique et marketing (rédaction des publications, rapports annuels, fiches pays, billets de blog, vulgarisation).
- Traductions FR/EN et autres langues: outil i18n et workflow fournis, mais le travail de traduction humaine est à la charge de Democracy Together (ou d'une plateforme type Weblate/Tolgee à intégrer en option).
- Collecte et production des données primaires du baromètre, méthodologie scientifique de l'indice composite et pondération des sous-dimensions (travail de recherche, hors développement).
- Licences de données tierces sous-jacentes au baromètre (V-Dem, Freedom House, BTI, etc.) et négociation de leurs conditions de réutilisation.
- Modération éditoriale et communautaire au quotidien (outillée par la plateforme, mais opérée par les équipes Democracy Together/modérateurs).
- Chantier RGPD organisationnel (registre des traitements, DPA, désignation DPO) au-delà des fonctionnalités techniques livrées.
- Frais de transaction des prestataires de paiement et frais bancaires (refacturés au réel).
- Migration/reprise de données existantes depuis d'éventuels systèmes antérieurs (à chiffrer si applicable).
- Application mobile native iOS/Android — l'approche retenue est web responsive + PWA, pas d'app store.
- Intégrations sur mesure avec les SI propres des think tanks membres (au-delà du SSO OIDC/SAML standard prévu en V2).
- Streaming vidéo lourd auto-hébergé pour les webinaires: intégration d'un service tiers (Zoom/Livestorm/YouTube) prévue, infrastructure de diffusion propre exclue.

### 3.8 Risques de dérive (chiffrage)

- Périmètre des features 'Élevée' sous-spécifié: baromètre composite, carte mondiale, graphe de réseau, policy tracker et peer-review peuvent doubler de charge si les specs métier se complexifient (d'où la fourchette haute +30%).
- Effet tunnel du multilingue et de la modération: traduire/modérer le contenu de dizaines de think tanks en plusieurs langues est un travail humain et organisationnel sous-estimable, pouvant retarder la mise en ligne réelle même si la plateforme est prête.
- Performance Afrique non garantie par le seul choix de stack: sans tests réels en 3G/réseau dégradé et budgets de perf tenus, risque d'expérience médiocre — prévoir des itérations d'optimisation (provision incluse mais surveiller).
- Profil de menace élevé (organisation pro-démocratie ciblée): attaques DDoS lors du sommet de Paris, compromission de comptes de contributeurs en zones fragiles — impose MFA, WAF, pentest, et peut générer du travail de durcissement non prévu.
- Dépendance au financement par subventions/dons: un budget irrégulier peut suspendre la V1/V2 ou la TMA; un découpage strict en phases livrables-indépendantes est essentiel pour sécuriser au moins le MVP.
- Continuité d'équipe côté Democracy Together et prestataires successifs: risque de perte de connaissance; documentation, IaC et stack mainstream le mitigent mais supposent une disponibilité des référents Democracy Together pour les arbitrages.
- Dérive du calendrier liée à la disponibilité des contributeurs Democracy Together pour la recette, la fourniture de contenu et les validations (comités d'adhésion, gouvernance, bureaux régionaux).
- Tentation de sur-engineering (microservices, recherche lourde, K8s 'pour l'avenir'): discipline d'architecture progressive nécessaire pour ne pas faire exploser le budget récurrent.
- Coûts d'exploitation du self-hosting (CMS, Meilisearch, Keycloak, emailing) supérieurs aux estimations si l'auto-hébergement est poussé trop tôt: démarrer managé, internaliser progressivement.
- Intégrations tierces à risque (DOI/Crossref, prestataire de paiement multi-devises EUR/XOF, fédération d'identité des think tanks): délais et conditions externes hors de notre contrôle.

---

## 4. Revue critique & recommandations (à lire avant de chiffrer pour de bon)

Une passe de relecture adverse a stress-testé le périmètre et le chiffrage. Points clés à intégrer avant tout engagement contractuel.

### 4.1 Fonctionnalités manquantes / sous-estimées

- MIGRATION/REPRISE DE DONNÉES : la conférence inaugurale 2026 implique que des fondateurs et premiers think tanks existent déjà avec des contacts, listes email, publications, sites. Le devis l'exclut explicitement ('à chiffrer si applicable') mais c'est quasi certain et non provisionné. Pour un réseau qui démarre, l'import des premiers membres/publications est un chemin critique du MVP, pas une option.
- ONBOARDING/VÉRIFICATION D'IDENTITÉ DES ORGANISATIONS : le 'workflow de validation des adhésions' existe mais rien sur la vérification anti-usurpation d'un think tank (un acteur malveillant ou un faux think tank pro-régime autoritaire peut se faire passer pour membre). Pour une organisation pro-démocratie ciblée, la due diligence d'admission (KYC organisationnel, vérification de légitimité) est une fonctionnalité de gouvernance manquante, pas un simple statut.
- GESTION DE CRISE / SÉCURITÉ DES CONTRIBUTEURS À RISQUE : aucune fonctionnalité pour protéger des chercheurs/militants opérant dans des régimes répressifs (pseudonymat contrôlé, masquage sélectif d'auteur, publication anonyme, possibilité de retrait d'urgence d'un profil/contenu). C'est un standard du secteur (Freedom House, CDT protègent leurs sources). Absent du référentiel alors que le public cible inclut des 'régions fragiles'.
- EMAILING DELIVERABILITY & RÉPUTATION : la newsletter et les emails transactionnels sont chiffrés comme 'Faible/Moyenne' mais rien sur la configuration SPF/DKIM/DMARC, le warm-up d'IP, la gestion des bounces et la réputation d'expéditeur. Pour une asso qui enverra reçus fiscaux + alertes + campagnes multi-pays, c'est un chantier réel souvent sous-estimé.
- STRATÉGIE DE SAUVEGARDE/RESTAURATION ET PRA/PCA TESTÉS : 'sauvegardes' est mentionné dans la sécurité mais aucun plan de reprise d'activité testé, RTO/RPO, ni résilience pendant le sommet de Paris (pic de charge + cible DDoS). Pour une plateforme 'archive de référence' avec DOI pérennes, l'engagement de pérennité (préservation type CLOCKSS/archive) est une promesse non outillée.
- GESTION DES DEMANDES DE RETRAIT/RECTIFICATION DE CONTENU (pas seulement données perso) : droit de réponse, rétractation d'article scientifique, signalement de contenu diffamatoire/illégal par un tiers (DSA), takedown. La modération couvre le communautaire mais pas le contentieux éditorial sur des publications (corrections, errata, rétractations) — standard d'une revue/archive scientifique.
- SYNDICATION/INTEROPÉRABILITÉ ENTRANTE : le réseau 'agrège' les analyses des think tanks membres mais aucune fonctionnalité d'ingestion automatisée (import RSS/OAI des sites membres, connecteurs). Tout repose sur un dépôt manuel, ce qui contredit la promesse d'agrégation à l'échelle et alourdit la charge éditoriale réelle.
- ENVIRONNEMENTS & QUALITÉ LOGICIELLE : aucune ligne pour CI/CD, environnements (dev/staging/prod), tests automatisés (unitaires/e2e), IaC, observabilité applicative au-delà du 'monitoring'. Le devis mentionne IaC dans les risques mais ne la chiffre pas comme livrable. Pour 1276 j-h, l'absence de ligne 'socle DevOps/qualité' est une lacune.
- RECHERCHE OPÉRATIONNELLE EN POSTGRES POUR LE MVP : le MVP promet une recherche plein-texte multilingue + facettes sur 'tout le corpus' avec Postgres uniquement (Meilisearch repoussé en V1). La recherche FR/EN avec accents/stemming et facettes performantes en pur Postgres est sous-estimée et risque d'être réécrite — soit Meilisearch remonte au MVP, soit le périmètre recherche MVP doit être réduit.
- ACCESSIBILITÉ EN V1 ALORS QU'ELLE EST UN CRITÈRE DE CRÉDIBILITÉ UE : RGAA/WCAG 2.1 AA est classé V1, mais l'accessibilité ne se 'rajoute' pas après coup sans surcoût massif. Elle doit être une contrainte du design system MVP. La traiter en V1 est une sous-estimation méthodologique qui crée de la dette.
- CONSENTEMENT/PRÉFÉRENCES POUR LE MENTORAT ET DONNÉES SENSIBLES : les indicateurs de diversité (genre, géographie, culture) impliquent la collecte de données potentiellement sensibles (origine, éventuellement opinions). Aucune fonctionnalité dédiée au traitement licite de ces catégories particulières (base légale, anonymisation/agrégation, opt-in explicite) — risque RGPD spécifique non outillé.

### 4.2 Réserves sur le chiffrage

- BARÈME PAR COMPLEXITÉ TROP LINÉAIRE ET GLOBALEMENT OPTIMISTE SUR LE HAUT : 'Élevée = 12 j-h dev+intégration' pour des features comme le baromètre composite multi-pays, le graphe de réseau, le workflow peer-review double aveugle, le policy tracker ou la recherche multilingue cross-langue est très sous-estimé. Chacune de ces 'features' est en réalité un sous-projet de 30-60 j-h une fois specs, données, edge cases et i18n inclus. La fourchette +30% ne suffit pas à couvrir un facteur 3-5x sur ces items.
- PROVISION D'INTÉGRATION DE 18% TROP FAIBLE POUR UN SYSTÈME AUSSI INTERCONNECTÉ : 142 features partageant un modèle de données central (Org/Membre/Rôle/Publication/Thème/Région/Cotisation/Événement) génèrent un coût d'intégration combinatoire. Sur ce type de plateforme, la part 'collage + cas limites + recette' dépasse couramment 30-40%, pas 18%. Le barème nominal 'chemin heureux' sous-compte le réel.
- CHARGE TRANSVERSE QA SOUS-DIMENSIONNÉE : 0,3-0,5 ETP QA pour une plateforme multilingue, multi-rôles (12+ rôles RBAC), avec paiements multi-devises, accessibilité RGAA, et tests réels en 3G/réseau dégradé est très bas. Une matrice de test rôles × langues × états d'adhésion × devises explose. Sous-estimation probable de la QA de 30-50%.
- ABSENCE DE COÛT DE RECRUTEMENT/RAMP-UP DE L'ÉQUIPE : le devis suppose ~4 ETP 'utiles' immédiatement disponibles. Constituer une équipe TS senior + designer + QA + lead disponible pour démarrer un MVP en 20 semaines a un coût de mobilisation et une perte de productivité initiale non chiffrés.
- COÛTS RÉCURRENTS PROBABLEMENT SOUS-ESTIMÉS À L'USAGE RÉEL : héberger CMS headless + Meilisearch + Keycloak + workers + Postgres HA + stockage datasets/PDF + CDN multi-PoP Afrique pour 1 200-3 600€/an de CMS/search/auth est optimiste si les volumes montent. Le CDN multi-PoP Afrique performant (couverture Dakar réelle) coûte typiquement plus que la fourchette basse annoncée. La TMA à 15-20%/an (25-55k€) est correcte mais s'ajoute vite au-delà de la capacité d'une jeune asso.
- DURÉE TOTALE '18-20 MOIS EN CONTINU' INCOMPATIBLE AVEC LE FINANCEMENT PAR TRANCHES : présenter un planning continu masque que le financement par subventions/dons est par à-coups. Chaque interruption entre phases ajoute un coût de remobilisation (perte de contexte, re-staffing) non provisionné — typiquement 5-15% par redémarrage.
- CERTAINES ESTIMATIONS MVP SONT À L'INVERSE TROP HAUTES / MAL PRIORISÉES : intégrer dès le MVP RBAC 'Élevée' à 12+ rôles granulaires (DPO, trésorier, modérateur, 11 rôles) est du sur-engineering d'amorçage. Un MVP n'a pas besoin de 12 rôles ; 3-4 suffisent. Inversement, des postes critiques (migration, sécurité, deliverability email) manquent. Le mix de priorisation gonfle des coûts non essentiels et omet des coûts essentiels.
- COÛT DES LICENCES DE DONNÉES TIERCES DU BAROMÈTRE EXCLU MAIS POTENTIELLEMENT BLOQUANT FINANCIÈREMENT : exclure les licences V-Dem/Freedom House/BTI est honnête côté périmètre dev, mais ces conditions peuvent soit interdire l'usage dérivé commercial/agrégé, soit coûter cher — ce qui peut rendre toute la feature 'baromètre V1' (41k€) inutilisable telle que conçue. Le coût caché est porté ailleurs sans alerte sur sa criticité.
- TJM ET MIX SENIORITÉ COHÉRENTS MAIS LE 'TJM MIXTE 556€' MASQUE LE RÉEL : les features 'Élevée' nécessiteront surtout du senior/lead (640-720€), pas le mix 40/60. Chiffrer le baromètre, la peer-review et le collaboratif au TJM mixte de production sous-évalue ces lots de 15-25%.

### 4.3 Risques majeurs (projet / gouvernance / juridique)

- GOUVERNANCE PRODUIT INEXISTANTE FACE À UNE GOUVERNANCE ASSOCIATIVE LOURDE : 6 fondateurs aux profils hétérogènes (diplomate, biologiste, ingénieur, RP), 3 bureaux régionaux 'semi-autonomes', comités d'adhésion. Sans un Product Owner unique mandaté côté Democracy Together et un mécanisme d'arbitrage rapide, le projet subira un effet comité destructeur. Le devis ne prévoit que 0,4-0,5 ETP chef de projet côté agence — insuffisant pour absorber cette complexité de décision côté client.
- DÉPENDANCE TOTALE AU FINANCEMENT INCERTAIN POUR UN BUDGET DE 715k-930k€ HT : c'est un budget de scale-up pour une association qui n'a pas encore de membres cotisants ni de subvention UE acquise. Le modèle économique est circulaire : la plateforme doit générer les cotisations qui la financent. Risque majeur que la V1/V2 ne soient jamais financées, voire que le MVP (178k-232k€) dépasse déjà la capacité de trésorerie de départ.
- LE PRODUIT EST CONÇU COMME UNE PLATEFORME D'AGRÉGATION ALORS QU'IL N'Y A PAS ENCORE DE CONTENU À AGRÉGER (chicken-and-egg) : la valeur (annuaire, baromètre, bibliothèque, graphe) dépend d'une masse critique de membres et de publications inexistante au lancement. Risque de livrer une coquille vide impressionnante mais inerte. Le concept sous-estime l'amorçage (cold start) du réseau.
- BAROMÈTRE DE LA DÉMOCRATIE = RISQUE SCIENTIFIQUE, RÉPUTATIONNEL ET JURIDIQUE SOUS-ESTIMÉ : produire un indice composite propriétaire qui classe des pays (notamment africains) est extrêmement sensible. Risque de contestation méthodologique, de pressions diplomatiques/étatiques, de poursuites en diffamation d'État, et de dépendance à des licences de données tierces (V-Dem, Freedom House, BTI) dont la réutilisation pour produire un indice dérivé n'est PAS garantie par CC-BY. C'est un projet à part entière, mal cantonné en 'feature Élevée'.
- CHARGE ÉDITORIALE ET DE TRADUCTION HUMAINE EXTERNALISÉE À Democracy Together = GOULOT D'ÉTRANGLEMENT FATAL : le devis exclut traduction, production de contenu, fiches pays, méthodologie. Or sans ces livrables, la plateforme reste vide. Une asso jeune n'a pas la capacité RH pour traduire/modérer/rédiger des dizaines de think tanks en FR/EN. Le vrai blocage du lancement 2026 sera éditorial, pas technique — et personne ne le porte budgétairement.
- RISQUE JURIDIQUE MULTI-JURIDICTIONS NON ADRESSÉ : reçus fiscaux 'association loi 1901' supposent l'éligibilité au régime fiscal français du mécénat (rescrit fiscal non acquis, et un réseau international à objet politique/plaidoyer peut s'en voir refuser le bénéfice). Paiements et dons en XOF impliquent la réglementation BCEAO/UEMOA et le statut au Sénégal (bureau Dakar). Dimension 'plaidoyer politique' peut requérir inscription au registre de transparence UE. Aucun de ces points n'est cadré.
- PROFIL DE MENACE ÉLEVÉ RÉELLEMENT SOUS-PROVISIONNÉ : organisation pro-démocratie = cible d'États, de désinformation, de DDoS pendant le sommet, de compromission de comptes de contributeurs en zone répressive. Le devis le liste en risque mais ne provisionne qu'un pentest annuel optionnel. Le durcissement (WAF, MFA obligatoire, détection d'intrusion, réponse à incident, protection anti-scraping du graphe de réseau qui cartographie des militants) devrait être un module MVP, pas une option.
- SUR-AMBITION DU PÉRIMÈTRE (142 features / 22 modules) POUR UN LANCEMENT EN ~5 MOIS : la pression du sommet de Paris 2026 sur un MVP de 315 j-h / 20 semaines avec une équipe à composer (recrutement non chiffré), un design system bi-univers neuf, du multilingue et de la conformité RGPD/CNIL en parallèle est optimiste. Risque élevé de glissement du MVP ou de dette technique pour 'tenir la date'.
- DÉPENDANCES TIERCES À CHEMIN CRITIQUE ET DÉLAIS EXTERNES : adhésion Crossref/DataCite (DOI), agrément prestataire de paiement multi-devises EUR/XOF (KYC du marchand, délais longs surtout pour XOF), fédération d'identité académique (ORCID, Renater) — délais d'agrément et conditions hors du contrôle de l'équipe, pouvant bloquer des features 'V1' présentées comme acquises.
- CONTINUITÉ ET PROPRIÉTÉ INTELLECTUELLE/RÉVERSIBILITÉ : aucune clause visible sur la propriété du code, la réversibilité, la documentation de passation, ni sur le sort de la plateforme si l'agence ou un financement disparaît. Pour une infrastructure censée durer (DOI pérennes, archive), l'absence de stratégie d'exit/réversibilité est un risque de gouvernance majeur.
- MODÉRATION DE CONTENU POLITIQUE = RISQUE DE NEUTRALITÉ ET DE RESPONSABILITÉ : héberger des analyses politiques de dizaines de think tanks expose à des contenus contestés, à des accusations de biais (le réseau affiche une orientation politique explicite, pro-démocratie), et à la responsabilité d'hébergeur (DSA/LCEN). La charte éditoriale est listée mais la chaîne de responsabilité éditoriale juridique (directeur de publication, procédures de notice-and-takedown) n'est pas outillée.

### 4.4 Recommandations

- RADICALEMENT RÉDUIRE LE MVP À UN 'MVP DE CONFÉRENCE' (8-12 semaines, ~120-160 j-h) : site institutionnel crédible + SEO/perf 3G + pages fondateurs/gouvernance + annonce du sommet + billetterie/inscription événement + formulaire de don simple + newsletter opt-in + 3-4 rôles seulement. Repousser adhésions payantes multi-devises, RBAC à 12 rôles, recherche à facettes et CMS multilingue complet en post-conférence. L'objectif réel du lancement 2026 est la CRÉDIBILITÉ et la CAPTATION, pas la plateforme réseau.
- TRAITER LE BAROMÈTRE COMME UN PROJET SÉPARÉ AVEC SA PROPRE GOUVERNANCE SCIENTIFIQUE ET SON BUDGET : ne pas le mettre en V1 du build plateforme. Exiger d'abord une note méthodologique validée par un comité scientifique, la confirmation écrite des droits de réutilisation des données sources, et un avis juridique sur la responsabilité de classement des pays. Démarrer par une simple méta-agrégation visuelle d'indices tiers (sous réserve de licence) avant toute donnée primaire.
- INSTAURER UNE GOUVERNANCE PRODUIT CLAIRE CÔTÉ Democracy Together : nommer UN Product Owner unique mandaté avec pouvoir d'arbitrage, un comité de pilotage restreint (3 personnes max) à cadence fixe, et un processus de décision écrit. Provisionner un vrai chef de projet/PO côté agence à 0,8-1 ETP (pas 0,4) vu la complexité multi-bureaux. Sans cela, l'effet comité fera dériver le budget.
- BUDGÉTER ET PORTER EXPLICITEMENT LE CHANTIER ÉDITORIAL ET DE TRADUCTION (le vrai chemin critique) : créer un poste/budget de coordination éditoriale + traduction côté Democracy Together, un calendrier de production de contenu d'amorçage (seed content), et une stratégie d'onboarding des 10-20 premiers think tanks AVANT d'industrialiser. Sans contenu, la plateforme est inerte. Intégrer un outil de traduction collaborative (Weblate/Tolgee) dès le MVP comme option chiffrée.
- SÉCURISER LE FINANCEMENT PAR PHASES LIVRABLES-INDÉPENDANTES ET RÉVERSIBLES : contractualiser chaque phase comme un livrable autonome qui a de la valeur même si la suite n'est jamais financée. Exiger dans le contrat : propriété du code par Democracy Together, IaC + documentation de passation à chaque jalon, clause de réversibilité, et stratégie de pérennité des DOI/archive (engagement de préservation) indépendante de l'agence.
- REMONTER LA SÉCURITÉ ET L'ACCESSIBILITÉ AU MVP COMME CONTRAINTES D'ARCHITECTURE, PAS DES FEATURES V1 : MFA obligatoire pour comptes sensibles, WAF/anti-DDoS, protection anti-scraping du graphe, plan de réponse à incident, et conformité RGAA dans le design system dès le départ. Provisionner un pentest avant la mise en ligne publique (pas seulement annuel). Ajouter des protections pour contributeurs à risque (pseudonymat, retrait d'urgence).
- CHIFFRER ET PLANIFIER LA MIGRATION/REPRISE DE DONNÉES ET LES DÉPENDANCES TIERCES À DÉLAI LONG DÈS MAINTENANT : lancer immédiatement les démarches d'agrément paiement multi-devises EUR/XOF (KYC marchand long), l'adhésion Crossref/DataCite, le rescrit fiscal mécénat, et l'inscription au registre de transparence UE si plaidoyer. Ces délais externes conditionnent des features 'V1' et doivent démarrer en parallèle du MVP.
- RÉVISER LE BARÈME D'ESTIMATION : appliquer un facteur 2,5-3x sur les 5-6 features 'Élevée' réellement structurantes (baromètre, graphe, peer-review, policy tracker, recherche cross-langue, workflow éditorial bilingue), porter la provision d'intégration à 30% et la QA à 0,6-0,8 ETP. Réallouer le budget économisé par un MVP réduit vers ces lots à risque et vers le socle DevOps/qualité (CI/CD, staging, tests, observabilité) actuellement non chiffré.
- ADOPTER UNE STRATÉGIE D'AMORÇAGE DU RÉSEAU (anti cold-start) AVANT LA TECHNIQUE : recruter manuellement et accompagner 10-20 think tanks fondateurs et leurs publications, organiser le contenu du sommet comme premier corpus, puis dérouler l'industrialisation. Mieux vaut un annuaire de 20 organisations réelles et actives qu'un graphe vide techniquement parfait.
- CLARIFIER LE CADRE JURIDIQUE MULTI-JURIDICTIONS EN AMONT : avis juridique sur (a) éligibilité au mécénat/reçus fiscaux français pour une asso à objet de plaidoyer politique international, (b) statut et paiements au Sénégal/UEMOA pour le bureau Dakar et les flux XOF, (c) responsabilité d'hébergeur/éditeur (DSA, directeur de publication, notice-and-takedown), (d) traitement des données sensibles de diversité (genre/origine). Ces points conditionnent la conformité de plusieurs modules.
- FIGER UN PÉRIMÈTRE V1 'RÉSEAU MINIMAL VIABLE' ET REPOUSSER AGRESSIVEMENT EN V2/V3 : conserver en V1 uniquement annuaire + profils org/chercheurs + bibliothèque avec DOI + working papers + dons + billetterie + recherche Meilisearch. Repousser graphe de réseau, comparateur sans code, API ouverte, policy tracker, peer-review complète, co-écriture et capacity building tant que la traction et le financement ne sont pas prouvés. Lier chaque feature V2 à un KPI d'usage déclencheur.

---

*Établi par Tuum Agency — cadrage assisté par analyse multi-agents (analyse fonctionnelle, architecture, benchmark sectoriel, UX, chiffrage, revue critique).*