# Campagne de tests globale — 27 septembre 2026

Campagne exhaustive sur l'application Democracy Together : portes statiques,
suite E2E Playwright (desktop + mobile), matrice dev-browser, puis exploration
« comme un être humain » de chaque module par six agents, avec captures d'écran
et vidéos à chaque étape, scénarios inattendus compris. Les défauts
reproductibles et circonscrits ont été corrigés dans la foulée, avec test à
l'appui ; les autres sont consignés ici avec leur preuve et leur cause probable.

Branche : `claude/gallant-heisenberg-201zcq` — PR #117.
Rapports détaillés par module : `modules/{vitrine,auth,membre,admin,communaute,transversal}.md`.

## 1. Environnement de la campagne

| Élément | Valeur |
|---|---|
| Application | build de production (`next build` + `next start`), Next 16.3.5, port 3000 |
| Backend | **Convex local** (binaire `convex-local-backend` précompilé du 26/09, mode auto-hébergé, `http://127.0.0.1:3210`) — le cloud Convex n'est pas joignable depuis cet environnement |
| Variables de déploiement | `AUTH_DEV_OTP=true`, `RECAPTCHA_DISABLED=true`, `SITE_URL`, `JWT_PRIVATE_KEY` / `JWKS` générés pour la campagne |
| Données | seeds du dépôt : `seed:seedDirectory` (10 organisations), `seedPublications:seedPublications` (14 publications) |
| Sanity | **non configuré** (projet `placeholder`, hôte bloqué) : les actualités et contenus éditoriaux sont observés sur leur chemin DÉGRADÉ, ce qui est le cas de la CI aussi |
| Passerelle IA | absente : traduction et modération IA observées sur leur message d'indisponibilité |
| Navigateur | Chromium préinstallé (`/opt/pw-browsers/chromium`) via `PLAYWRIGHT_CHROMIUM_PATH`, Playwright 1.61.1 ; Desktop Chrome 1280×720 et Pixel 7 412×839 tactile |
| Preuves | `scratchpad/explore-out/<module>--<scénario>/` : captures numérotées, vidéo `.webm`, `journal.md` / `journal.json` (vérifications, erreurs console, erreurs de page, requêtes ≥ 400) ; `screenshots/index.html` pour la matrice dev-browser |

Le premier obstacle de la campagne a été un défaut du dépôt lui-même : la CSP
n'ouvrait que `*.convex.cloud`, si bien qu'un backend local ou auto-hébergé
coupait le websocket de synchronisation sans un mot, et que toute la suite E2E
tombait à l'ouverture des sessions (§ 4, C-01).

## 2. Résultats des portes automatiques

| Niveau | Commande | Résultat |
|---|---|---|
| Unitaire (Vitest + convex-test) | `pnpm test` | **112 fichiers, 1 095 tests verts** (1 084 au départ ; 11 tests ajoutés par les correctifs) |
| Typage | `pnpm typecheck`, `typecheck:convex`, `typecheck:tests` | verts |
| Qualité | `pnpm lint`, `pnpm format:check` | verts (aucune règle en `warn`) |
| E2E desktop + mobile | `pnpm test:e2e` (projets `setup`, `chromium`, `mobile-chromium`) | **239 parcours verts** sur 59 fichiers de spec, avant correctifs ; rejoués sur le build final (§ 6) |
| Dev-browser | `pnpm test:dev-browser` | 48 captures (2 thèmes × 2 tailles × 10 pages, avec reprises) ; **4 échecs** sur `/bibliotheque` (deux landmarks `main`, § 4 C-02), corrigés puis rejoués (§ 6) |
| CI GitHub (PR #117) | `ci.yml` + `e2e.yml` (préversion Convex) + CodeQL | vertes sur chaque commit poussé |

## 3. Exploration humaine par module

Six agents, 138 scénarios joués par l'interface, ≈ 3 100 vérifications
automatiques doublées d'un examen visuel des captures. Les ❌ « script »
sont des attentes trop strictes des scénarios eux-mêmes, relus à l'œil et
écartés par chaque agent (détail dans les rapports de module).

| Module | Scénarios | Vérifications | Anomalies réelles | Rapport |
|---|---|---|---|---|
| Vitrine publique (accueil, éditorial, baromètre, annuaire, formulaires publics, cookies, 404, sitemap) | 20 (dont 4 mobile, 4 sombre) | 384 ✅ / 11 ❌ (5 script) | 0 bloquant, 0 majeur, 5 mineurs | `modules/vitrine.md` |
| Authentification, sessions, rôles, accès | 15 scripts / 26 dossiers | 291 ✅ / 11 ❌ (5 script) | 0 bloquant, 3 majeurs, 6 mineurs, 3 cosmétiques | `modules/auth.md` |
| Espace membre, bibliothèque, dépôt, espaces, notifications | 9 | 194 ✅ / 8 ❌ | 1 majeur, 8 mineurs, 3 cosmétiques | `modules/membre.md` |
| Back-office (15 écrans, 4 rôles, mobile, sombre) | 17 | 233 ✅ / 16 ❌ (9 script) | 3 majeurs, 7 mineurs, 5 cosmétiques | `modules/admin.md` |
| Tribune, événements, jeunes, mentorat, projets, revue | 21 | 301 ✅ / 27 ❌ (6 script) | 1 bloquant, 2 majeurs, 7 mineurs, 4 cosmétiques | `modules/communaute.md` |
| Transversal (5 langues + RTL, thème, mobile, a11y/axe, 3G, sécurité, SEO) | 42 (dont 6 diagnostics) | 1 474 ✅ / 126 ❌ (≈ 75 = une cause, 12 script) | 6 majeurs, 7 mineurs, 5 cosmétiques | `modules/transversal.md` |

Ce qui tient bien, et qu'aucun agent n'a pris en défaut : XSS neutralisé
partout (formulaires publics, tribune, admin, URL), aucune erreur 500 sur les
URL farfelues, gating serveur des zones privées (307) et RBAC par rôle,
cookies de session `HttpOnly` / `Lax`, plafonds d'envoi et d'échec d'OTP,
politique de mot de passe, réutilisation de code refusée, en-têtes de sécurité
et CSP sans `unsafe-eval`, 0 violation axe sérieuse ou critique hors contraste
sur 64 analyses (5 langues, 2 thèmes), menu mobile (focus piégé, Échap, ARIA),
cibles tactiles, zoom 200 %, rendu sans JavaScript, 3G lente sous 2 Mo,
sitemap de 350 URL cohérent, RTL arabe en miroir sur desktop, dégradation
propre de Sanity et de la passerelle IA, chaîne dépôt → modération →
notification → bibliothèque → PDF réel, ICS valides, oracles Convex des
formulaires publics.

## 4. Correctifs livrés dans cette PR

Chaque correctif est circonscrit à l'anomalie, vérifié par les portes
statiques, et couvert par un test quand la logique s'y prête. Numérotation :
C-xx (correctif) ; les références A-x / M-x renvoient aux rapports de module.

| # | Gravité | Anomalie mesurée | Correctif | Fichiers |
|---|---|---|---|---|
| C-01 | Bloquant (hors cloud) | CSP limitée à `*.convex.cloud` : backend local ou auto-hébergé (option souveraineté UE du backlog) coupé du websocket, bouton « Se connecter » en attente muette, suite E2E entièrement rouge | origine dérivée de `NEXT_PUBLIC_CONVEX_URL` (connect-src http+ws, img-src) ; rien n'est ajouté pour un `*.convex.cloud` : la CSP de production est inchangée. 5 tests | `next.config.ts`, `src/lib/convex-origins.ts` |
| C-02 | Majeur (a11y) | deux landmarks `<main>` imbriqués sur bibliothèque, fiche, événements, calendrier, fiche d'événement, fiche d'annuaire (HTML invalide, repère dupliqué pour les lecteurs d'écran ; bloquait la matrice dev-browser) | `<div>` dans les six pages | `src/app/[locale]/{bibliotheque,evenements,le-reseau}/**` |
| C-03 | Majeur | `/espaces` et `/espaces/<id>` : page « Une erreur est survenue » pour un visiteur, pour `/espaces/zzz`, pour un identifiant étranger | requêtes posées seulement une fois le rôle connu et suffisant (`'skip'`) ; `getWorkspace` normalise l'identifiant et rend « introuvable ». 2 tests | `src/components/workspaces/*`, `convex/workspaces.ts` |
| C-04 | Majeur (sécurité) | énumération des comptes : adresse inconnue → « une erreur est survenue » sur la connexion par code et « mot de passe oublié », adresse connue → étape du code | les deux écrans passent à l'étape suivante dans tous les cas ; sous-titres « si un compte existe » (5 langues), renvoi du membre invité vers la connexion par code | `connexion-otp/page.tsx`, `mot-de-passe-oublie/page.tsx`, messages |
| C-05 | Majeur | verrou anti-force-brute silencieux : après 5 échecs, le BON mot de passe ou code est refusé avec « incorrect » | `src/lib/auth-errors.ts` lit le message relayé par `/api/auth` ; messages dédiés au verrou et au plafond d'envoi (5 langues) | `connexion/page.tsx`, `connexion-otp`, `mot-de-passe-oublie` |
| C-06 | Majeur | modérateur sur `/admin/revue` ou `/admin/newsletter` en URL directe → page d'erreur (requête « éditeur » sans garde d'écran) | la coquille du back-office lit le rang minimal de l'écran dans la table de navigation (`adminMinRoleForPath`) et refuse en 403 avant de monter la page. 3 tests ; spec E2E des rôles étendue | `admin-shell.tsx`, `admin-nav.tsx`, `tests/e2e/admin-ecrans.spec.ts` |
| C-07 | Majeur | chaînes longues sans espace faisant défiler tout le back-office en largeur (jusqu'à 28 415 px : candidatures, contact, jeunes) ; idem `/recherche` (24 744 px) et l'adresse e-mail de l'espace membre en mobile | `break-words` sur les blocs, `min-w-0` + `wrap-anywhere` dans les conteneurs flex (un titre en `flex-wrap` ne se coupe pas avec `break-words`) | pages admin, `recherche/page.tsx`, `espace-membre/page.tsx` |
| C-08 | Majeur | inscription acceptée et stockée sur un événement PASSÉ (formulaire rendu sans test `upcoming`) | formulaire monté seulement pour un événement à venir ; mention « Passés » sinon | `evenements/[slug]/page.tsx` |
| C-09 | Majeur (SEO) | hreflang limité à `fr`, `en`, `x-default` sur 26 pages, alors que le site est servi en 5 langues et que le sitemap en déclare 6 | `hreflangFor` lit le catalogue du routage ; 26 pages migrées | `src/lib/seo.ts`, 26 `page.tsx` |
| C-10 | Majeur (RTL) | arabe en mobile : champ de recherche de la bibliothèque et des événements débordant de 34 px, bouton « بحث » tronqué | `min-w-0` sur les `input` en `flex-1` | `bibliotheque/page.tsx`, `evenements/page.tsx` |
| C-11 | Majeur (mobile) | `/barometre` en mobile : toute la page défilait en largeur (585 px pour 412) — un `sr-only` du tableau « Télécharger et citer » échappait à la région défilante non positionnée | `ScrollableRegion` est `relative` | `src/components/ui/scrollable-region.tsx` |
| C-12 | Mineur | contact : message > 4 000 caractères refusé (`INVALID_BODY`) avec « réessayez », limite jamais annoncée | `maxLength` et règle de validation sur la borne du serveur, message (5 langues) | `contact/page.tsx`, messages |
| C-13 | Mineur | note d'espace > 4 000 caractères perdue en silence ; corps de tribune sans borne (21 000 caractères → « a échoué ») | `maxLength` alignés sur le serveur, message d'erreur affiché sur la note | `workspace-detail.tsx`, `tribune-composer.tsx` |
| C-14 | Mineur | dépôt : `.txt` renommé `.pdf` et PDF de 0 octet acceptés ; PNG refusé avec message générique | le client lit les cinq premiers octets (`%PDF-`), le serveur refuse le fichier vide (test), `INVALID_FILE` a son message (5 langues) | `publication-submit-form.tsx`, `convex/publications.ts` |
| C-15 | Mineur (a11y) | erreurs de formulaire en thème sombre à 2,68:1 ; bleu des badges et de la catégorie « libre » à 2,66:1 | variantes sombres `--bar-5` (4,9:1 min.) et `--bar-1` (5,4:1) | `src/app/globals.css` |
| C-16 | Mineur | `/en/presse` (et es/pt/ar) : liens CSV / codebook du Baromètre vers la route française | contenu sans préfixe, la page pose celui de sa langue | `src/lib/press-content.ts`, `presse/page.tsx` |
| C-17 | Mineur | `prefers-color-scheme: dark` ignoré sans préférence enregistrée | `themeInit` consulte `matchMedia` | `layout.tsx` |
| C-18 | Mineur (a11y) | pas de lien d'évitement : 12 tabulations avant le contenu | « Aller au contenu » (5 langues), `id="contenu"` sur `<main>` | `layout.tsx`, messages |
| C-19 | Mineur | `X-Powered-By: Next.js` exposé | `poweredByHeader: false` | `next.config.ts` |
| C-20 | Dette | `convex/_generated/api.d.ts` en retard sur les modules (`lib/emailContent` absent) | régénéré par la CLI | `convex/_generated/api.d.ts` |
| C-21 | Majeur (F-05) | accueil vide en 3G lente jusqu'à l'hydratation (≈ 11–13 s) : sept éléments du hero rendus `opacity:0` en style inline par framer-motion | entrée du hero en keyframes CSS (`dt-hero-*`), qui jouent dès la feuille de style, script ou pas ; noscript et reduced-motion les neutralisent ; seul le parallaxe reste à framer-motion | `home-hero.tsx`, `globals.css` |
| C-22 | Majeur | backend Convex injoignable côté navigateur : « Chargement… » sans fin sur les pages privées, bouton de connexion grisé sans message | la garde des pages privées annonce après 8 s que le service tarde et quoi faire (5 langues) ; la redirection après connexion n'attend plus indéfiniment la confirmation du client | `auth-gate.tsx`, `redirect-after-auth.ts`, messages |
| C-23 | Mineur | re-signalement d'un billet à chaque rechargement → doublons dans la file des modérateurs | un signalement ouvert par personne et par cible, second appel idempotent. Test | `convex/tribune.ts` |
| C-24 | Mineur | recherche de la bibliothèque sensible aux accents (« democratie » → 0) | recherche sans diacritiques ni casse. Test | `convex/lib/publications.ts` |
| C-25 | Mineur | création d'espace : bulle native anglaise « Please fill out this field » | `noValidate` (les règles traduites existaient) | `workspaces-board.tsx` |
| C-26 | Mineur (a11y) | bascule de thème sans état annoncé ; badge verrouillé de l'univers jeunes à 2,9:1 en sombre | `aria-pressed` ; `text-ink-soft` | `theme-toggle.tsx`, `jeunes/page.tsx` |
| C-27 | Mineur | modérateur refusé sur un écran éditeur lisant « réservé à l'équipe de modération » | texte du 403 selon la cause (rang), 5 langues | `admin-shell.tsx`, messages |
| — | Outillage | skill `find-skills` (vercel-labs/skills) demandé | installé via le CLI `skills`, verrouillé dans `skills-lock.json` | `.claude/skills/find-skills/` |

## 5. Anomalies restantes, à arbitrer

Classées par gravité ; chacune a sa preuve (dossier de captures) et sa cause
probable dans le rapport de module cité. Elles touchent à un choix produit, à
une fonctionnalité absente, ou à un chantier plus large qu'un correctif
ponctuel.

### Bloquant

- **R-01 — Revue à comité de lecture sans porte d'entrée** (`communaute`
  A-01, `admin` M-3). Aucune interface ne permet d'OUVRIR une revue :
  `/admin/revue` ne liste que ce qui est déjà en revue et `assignReviewer`
  n'est proposé que sur ces lignes. Le reste du parcours (avis, décision,
  notifications) fonctionne une fois la revue ouverte par l'API. Fonction
  F-43, phase 2 « Could » : à trancher entre livrer l'écran d'ouverture ou
  retirer l'entrée de menu tant qu'il n'existe pas.

### Majeur

- **R-02 — Backend Convex injoignable côté navigateur** : corrigé en second
  lot (C-22) pour la garde des pages privées et la connexion ; reste la
  palette de recherche (« Recherche… » sans fin, `search-dialog.tsx`).
- **R-03 — Accueil vide en faible débit** : corrigé en second lot (C-21).
- **R-04 — 404 hors charte pour tout segment inconnu de premier niveau**
  (`/ar/xyz`, `/xx`, `/de` ; `transversal` A-2, `admin` m-1). La 404 racine
  est bilingue fr/en, `lang="fr"`, sans en-tête. Le dépôt documente dans
  `src/app/not-found.tsx` pourquoi un `notFound()` depuis une route
  existante rend un corps vide sans JavaScript sur Next 16.3.5 : une route
  attrape-tout n'est donc pas un correctif gratuit. À reprendre avec une
  mise à jour de Next ou une 404 racine qui lit le préfixe de langue de l'URL.
- **R-05 — Membre invité sans mot de passe** (`auth` A-3). L'e-mail
  d'invitation promet un mot de passe « depuis votre espace membre » ; aucun
  écran ne le permet, et « mot de passe oublié » ne peut rien pour un compte
  sans mot de passe. Déjà noté dans `TESTING.md` ; C-04 renvoie désormais vers
  la connexion par code, mais l'écran de définition manque toujours.
- **R-06 — Annuaire : ni filtre pays ni filtre langue, et la recherche texte
  ignore le pays** (« Kenya » → 0 ; `vitrine` A4). F-19 demande les quatre
  filtres (pays, thématique, langue, région) ; l'interface n'en expose que
  deux plus le texte. Cause : `convex/lib/directory.ts#matchesFilters`
  (meule = nom + description).

### Mineur

- **R-07** — Newsletter : brouillon trop court sans message, envoi sans
  retour, marqué « Envoyée » sans fournisseur d'e-mail configuré, pas
  d'aperçu (`admin` m-4). Gestion des événements en lecture seule dans le
  back-office (`admin`, non testable).
- **R-08** — Refus serveur silencieux ou générique sur plusieurs écrans :
  « déjà traité ailleurs », second avis, assignation (jeunes, mentorat,
  projets, revue, newsletter, contact — `admin` m-2), commentaire de tribune
  trop court ou trop long, second avis de relecture (`communaute` A-06),
  site web `javascript:` refusé avec « vérifiez vos droits » (`admin` m-3),
  refus de longueur jeunes / projets sans la limite (`communaute` A-04).
- **R-09** — Candidatures d'adhésion non dédoublonnées (`vitrine` O3) ;
  jeton de désinscription faux qui confirme quand même (`vitrine` O2). Le
  re-signalement d'un billet est corrigé (C-23).
- **R-10** — Recherche de la bibliothèque limitée au titre + auteurs,
  guillemets littéraux (`membre` A-4). La sensibilité aux accents est
  corrigée (C-24).
- **R-11** — Tout membre réseau lit un espace collaboratif dont il n'est pas
  membre, notes comprises (`membre` A-6) — conforme au code, à confirmer
  produit.
- **R-12** — Dialogue `beforeunload` anglais en quittant `/recherche`
  (`membre` A-12, librairie `@convex-dev/auth`). La validation native sur la
  création d'espace est corrigée (C-25).
- **R-13** — Fiche d'événement passé sans lien replay / visio ; replays sans
  filtre ; mentorat sans parcours membre (formulaire public + admin
  seulement) ; « Annuler » du composer de tribune qui ré-affiche le brouillon
  précédent (`communaute` A-09, A-10, A-12, A-13).
- **R-14** — Bascule de thème introuvable sur desktop hors pied de page
  (y ≈ 5 900 px ; `transversal` A-8 — l'état est désormais annoncé, C-26) ;
  cloche de notifications absente de la barre mobile (`auth` A-9) ; rôle brut
  non traduit dans l'espace membre (« Role membre » en EN, `auth` A-7).
- **R-15** — Contrastes en sombre restant sous 4,5:1 hors correctifs C-15 et
  C-26 : `text-muted` sur `bg-accent-tint` (3,93) et la palette safran
  connue en clair (1,8–2,2, règle `color-contrast` différée par le dépôt)
  (`transversal` A-11).
- **R-16** — `/studio` : page blanche et spinner infini quand Sanity est
  injoignable (`transversal` A-13) ; liste d'actualités en panne affichant le
  même message qu'une liste vide (`vitrine` O1).
- **R-17** — Journal de la modération IA affichant un identifiant brut pour
  un dépôt supprimé (`admin` m-7) ; compteur de téléchargements jamais
  incrémenté sur les seeds sans fichier (`membre` A-8).

### Cosmétique

Bouton « Envoyer » du contact mobile à 40 px (conforme 2.5.8, < 44 px
recommandé) ; textes de 10–10,5 px sur mobile (badges, DOI, `dt`) ; cibles
tactiles 18–30 px dans quelques tableaux admin ; colonne e-mail hors écran
une fois le tableau mobile défilé ; `?_rsc=` visible dans l'URL après
déconnexion + Précédent ; disque gris du globe sans JavaScript ; `/icon.png`
(95 Ko) chargé sur des pages de contenu ; contenu de démo en français sur les
pages étrangères ; un seul toast à la fois ; verrou de l'auto-rétrogradation
expliqué seulement en `title`.

## 6. Contre-vérification sur le build final

Après les correctifs, l'application a été reconstruite et rejouée
intégralement : suite E2E, matrice dev-browser, et un script dédié
(`explore/verif/verif-correctifs.mjs`) qui reproduit chaque anomalie corrigée
telle que l'agent l'avait décrite.

| Vérification | Résultat |
|---|---|
| Portes statiques | `pnpm test` 112 fichiers / **1 095 tests verts** ; typage, lint, format verts |
| `pnpm test:e2e` (build final) | **239 / 239 verts** : 236 au premier passage, plus 3 rejoués — `en-journey` et `membership` avaient buté sur le plafond de **20 candidatures par heure et par IP** épuisé par les agents (« Too many attempts » dans l'instantané, pas une régression), verts une fois la fenêtre écoulée ; `tribune` trouvait deux liens « Transitions démocratiques » dès qu'un billet publié porte cette thématique — la spec est désormais `exact`, et passe |
| `pnpm test:dev-browser` | **52 / 52** (les 4 échecs de `/bibliotheque` sont levés par C-02) ; en mobile, plus aucune capture plus large que le viewport |
| Script de contre-vérification (`verif--*`, 7 scénarios, captures et vidéos) | **24 / 24** : espaces (visiteur, `zzz`, identifiant étranger), 403 du modérateur sur revue / newsletter / utilisateurs, file des candidatures sans débordement, OTP et « mot de passe oublié » sur adresse inconnue, message du verrou, recherche longue, liens presse EN, `<main>` unique, événement passé (ni formulaire ni bouton), couleur des erreurs en sombre, espace membre mobile |
| CI GitHub (PR #117) | verte sur chaque commit, dont le job E2E sur préversion Convex |

Deux enseignements du passage lui-même, consignés pour la prochaine campagne :
le premier tour de contre-vérification avait laissé le backend local sur les
fonctions d'AVANT les correctifs (les fonctions Convex se poussent séparément
du build Next : `npx convex dev --once`), et `break-words` ne suffit pas dans
un conteneur `flex-wrap` — d'où C-07 repris avec `wrap-anywhere`.

## 7. Ce que la campagne n'a pas pu couvrir

- **Cloud Convex et Sanity réels** : backend local et CMS dégradé seulement.
  Le contenu éditorial (actualités, pages Sanity) n'est observé que sur son
  chemin de repli.
- **E-mails réels, reCAPTCHA, passerelle IA** : aucune clé ; les flux sont
  observés jusqu'au message d'indisponibilité ou au journal de dev.
- **Panne Convex côté serveur** (rendu SSR, `/api/auth`) : le backend n'a
  jamais été arrêté pendant les explorations, seul le blocage côté navigateur
  a été simulé.
- **Page 500 localisée** : aucune URL n'a produit d'erreur serveur.
- **Lecteur d'écran réel, appareil physique, mesure du flash de thème image
  par image** : hors de portée de l'environnement.
- **Mode auto-publication de la modération IA** : volontairement jamais
  armé sur un déploiement partagé (les tests unitaires le couvrent).
- **Quotas par IP** (20/h) : non épuisés pour ne pas bloquer les autres
  agents ; les quotas par adresse l'ont été (8 envois / 5 échecs).

## 8. Reproduire la campagne

```bash
# backend local (voir § 1) puis :
pnpm test && pnpm typecheck && pnpm typecheck:convex && pnpm typecheck:tests && pnpm lint && pnpm format:check
PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm test:e2e
PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm test:dev-browser   # puis ouvrir screenshots/index.html
```

Les scripts d'exploration des agents (harnais `harness.mjs`, un dossier par
module) vivent dans le scratchpad de la session ; ils ne sont pas versionnés,
comme les captures (≈ 650 Ko l'une) et les vidéos — c'est la règle du dépôt
(`TESTING.md`, § Dev-browser).
