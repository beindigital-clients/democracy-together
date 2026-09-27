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
| Unitaire (Vitest + convex-test) | `pnpm test` | **116 fichiers, 1 159 tests verts** (1 084 au départ ; 75 tests ajoutés par les trois lots de correctifs) |
| Typage | `pnpm typecheck`, `typecheck:convex`, `typecheck:tests` | verts |
| Qualité | `pnpm lint`, `pnpm format:check` | verts (aucune règle en `warn`) |
| E2E desktop + mobile | `pnpm test:e2e` (projets `setup`, `chromium`, `mobile-chromium`) | **239 parcours verts** sur 59 fichiers de spec, avant correctifs ; **249 / 249** sur le build final du troisième lot (§ 6 et § 9.5) |
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
| C-22 | Majeur | backend Convex injoignable côté navigateur : « Chargement… » sans fin sur les pages privées, bouton de connexion grisé sans message, puis rebond muet vers /connexion | la garde des pages privées annonce après 8 s que le service tarde et quoi faire (5 langues) ; elle ne renvoie vers la connexion que si le backend a vraiment répondu « non authentifié » ; la redirection après connexion n'attend plus indéfiniment la confirmation du client | `auth-gate.tsx`, `redirect-after-auth.ts`, messages |
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
  connue en clair (1,8–2,2 ; règle `color-contrast` différée par le dépôt
  jusqu'au lot 3, C-48 et C-58)
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

**Second lot (C-21 à C-27)** — rejoué de la même façon sur un build
reconstruit : `pnpm test` 1 097 tests verts ; `pnpm test:e2e` **239 / 239** ;
script `verif-lot2` **8 / 8** (HTML servi de l'accueil sans `opacity:0` et
hero visible sans aucun script, backend bloqué côté navigateur → arrivée sur
l'espace membre avec le message de service en difficulté, création d'espace
en français, « democratie » sans accent) ; les specs d'authentification et
de gating rejouées après le dernier ajustement de la garde : 60 / 60.

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

## 9. Troisième lot — toutes les anomalies restantes

Demande du 27/09 au soir : régler sans exception ce que la campagne avait
relevé. Quatre chantiers en parallèle, un par module, chacun avec ses tests ;
puis fusion, portes, reconstruction et rejeu complet (§ 9.5).

### 9.1 Back-office et revue à comité de lecture (P1)

| # | Anomalie | Correctif |
|---|---|---|
| C-28 | **R-01 (bloquant)** — la revue à comité de lecture n'avait aucune porte d'entrée | un éditeur ouvre une revue depuis la file des publications (`listOpenable`, choix du relecteur, `assignReviewer`), le relecteur est notifié et voit **« Mes relectures »** (`myAssignments`, rang modérateur) ; table `peerReviewAssignments` (index par relecteur et par publication) ; décision éditeur inchangée. Tests convex-test |
| C-29 | relecteur de rang modérateur → 403 sur `/admin/revue` | écran `/admin/mes-relectures` au rang modérateur, file complète et décisions réservées à l'éditeur ; table de navigation et `adminMinRoleForPath` alignés, test de cohérence |
| C-30 | **R-08** — refus serveur silencieux ou génériques (déjà traité ailleurs, second avis, assignation, « Rouvrir », site web `javascript:` → « vérifiez vos droits ») | `server-error.ts` traduit chaque code (`ALREADY_REVIEWED`, `INVALID_WEBSITE`, `EMAIL_PROVIDER_NOT_CONFIGURED`…) et chaque écran passe par le retour d'action ; les notes saisies sont affichées |
| C-31 | **R-07** — newsletter : brouillon trop court muet, envoi sans retour, « Envoyée » sans fournisseur, pas d'aperçu | validation, retour d'action, état du fournisseur d'e-mail annoncé en tête (`newsletter.emailStatus` sur `emailProviderStatus`), envoi refusé sans fournisseur, **aperçu** de la campagne (`campaign-preview.tsx`, composant pur testé) |
| C-32 | **R-17** — journal IA affichant un identifiant brut pour un dépôt supprimé | libellé « dépôt supprimé » |
| C-33 | mobile / cosmétique du back-office : colonne e-mail hors écran, e-mail long coupé dans une boîte de confirmation, cibles tactiles < 24 px, verrou de l'auto-rétrogradation expliqué seulement en `title`, un seul toast à la fois | tableaux dans `ScrollableRegion`, `break-all`, cibles ≥ 24 px, aide visible sous le sélecteur de rôle, retours d'action empilés (test) |

### 9.2 Authentification, espace membre, espaces (P2)

| # | Anomalie | Correctif |
|---|---|---|
| C-34 | **R-05** — membre invité sans écran de mot de passe | `/espace-membre/mot-de-passe` : mot de passe + confirmation (politique du serveur), `signUp` → code → `email-verification`, ou `reset` quand un mot de passe existe déjà ; lien depuis l'espace membre ; test du rattachement sans changement de rôle ; spec E2E dédiée |
| C-35 | pas de bouton « Renvoyer le code » | présent sur la connexion par code et « mot de passe oublié », message du plafond, réponse neutre (anti-énumération conservée) |
| C-36 | déconnexion laissant `/espace-membre` puis `?_rsc=` au retour | `signOut` puis navigation explicite vers l'accueil |
| C-37 | rôle brut non traduit (« Role membre ») | libellés traduits dans l'espace membre |
| C-38 | bascule de thème introuvable sur desktop, cloche absente en mobile | bascule dans l'en-tête desktop, cloche dans la barre mobile pour un compte connecté |
| C-39 | **R-11** — notes d'un espace lisibles par tout membre réseau ; participants tous nommés « Membre » ; « Annuler » qui garde le brouillon | notes réservées aux membres de l'espace (« Rejoignez l'espace pour lire les notes »), nom du compte ou partie locale de l'adresse, brouillon vidé. Tests |
| C-40 | **R-12** — dialogue `beforeunload` anglais | `unsavedChangesWarning: false` sur le client Convex (documenté) |
| C-41 | **R-09** — candidatures d'adhésion en double ; jeton de désinscription inconnu qui confirme | seconde candidature en attente refusée (`DUPLICATE_APPLICATION`, message dans le formulaire) ; `unsubscribe` rend `{ ok, found }` et la page dit « lien invalide ou expiré ». Tests, spec adaptée |
| C-57 | **R-05 (suite)** — l'écran de mot de passe DÉCONNECTAIT le membre au moment de demander son code (spec `auth-mot-de-passe` rouge) | cause : quand l'étape n'ouvre pas de session (`signUp` avec vérification, `reset`, code faux), `auth:signIn` répond `{ tokens: null }` et le client Next.js de Convex Auth efface les cookies. La demande de code et la vérification passent désormais par l'action Convex appelée directement (sans effet sur les cookies), puis l'écran se reconnecte AVEC le mot de passe posé — preuve qu'il fonctionne, et seule session survivante en mode `reset`. Spec verte |
| C-59 | harnais E2E : une session enregistrée d'un run précédent était jugée « utilisable » alors que son jeton de rafraîchissement était périmé ; la première spec à s'en servir se réveillait sur `/connexion` (admin-ecrans, session modérateur, 1 échec sur 249 au rejeu) | `auth.setup.ts` attend la réponse de l'échange de jeton (`POST /api/auth`) : nulle, l'état est mort et la connexion est refaite ; sinon l'état est réenregistré avec le jeton actif. Mécanisme consigné (Convex Auth n'accepte un jeton déjà échangé que tant qu'il est le parent du jeton actif) |

### 9.3 Vitrine, annuaire, bibliothèque, 404 (P3)

| # | Anomalie | Correctif |
|---|---|---|
| C-42 | **R-04** — 404 hors charte pour tout segment inconnu (`/ar/xyz`, `/xx`, `/de`) | réécriture au middleware vers `/<langue>/introuvable` (statut 404), rendue dans le layout de langue : en-tête, pied de page, `lang`/`dir`, lisible sans JavaScript ; catalogue des premiers segments connus (`not-found-routes.ts`) testé — la piste retenue avec le client le 24/09 |
| C-43 | **R-06** — annuaire sans filtres pays ni langue, recherche ignorant le pays | facettes **pays** et **langue** (serveur + interface, conservées dans l'URL) ; la recherche texte inclut le nom de pays localisé et le code ISO. Tests |
| C-44 | actualités : panne Sanity confondue avec une liste vide ; `/studio` blanc sans Sanity | `DataUnavailable` sur la liste ; page explicative du Studio quand le projet n'est pas configuré |
| C-45 | bibliothèque : recherche limitée au titre, guillemets littéraux, « Télécharger le PDF » sur un seed sans fichier, facette inconnue cochée, compteur de vues en retard | résumé et mots-clés dans la meule, guillemets ignorés, « Consulter (DOI) » compté au clic, facettes inconnues ignorées, vue courante comptée |
| C-46 | palette de recherche muette quand le backend ne répond pas | message « service indisponible » après 8 s |
| C-47 | replays sans filtres | filtres type / thème / langue, conservés dans l'URL |
| C-48 | **R-15** — texte clair sur safran (1,8–2,2:1, 32 nœuds sur `/`, `/jeunes`, `/a-propos`) ; `text-muted` sur teinte d'accent ; teintes 2 et 4 du baromètre en texte de 11 px | texte **encre** sur safran (`--accent-contrast: var(--ink)` dans l'univers jeunes, ajustement validé par le client le 24/09, le safran ne bouge pas) ; variantes texte `--bar-2-ink` / `--bar-4-ink` (≥ 4,7:1) ; `text-ink-soft` |
| C-49 | cosmétique : bouton du contact < 44 px en mobile, textes de 10–10,5 px, globe sans légende sans JavaScript, globe de l'accueil sans équivalent textuel, `/icon.png` de 95 Ko sur les pages de contenu, `/le-reseau/%00` en 200 | 44 px, ≥ 11 px partout, légende `<noscript>`, texte `sr-only`, icône ramenée à 6 Ko, slug vide → 404 |
| C-58 | règle `color-contrast` différée par le dépôt depuis la refonte de la palette | réintégrée au gate `a11y` (`DEFERRED_RULES` vide, motif consigné dans `tests/e2e/_a11y.ts`), et le spec balaie aussi le **thème sombre** sur sept pages (accueil, jeunes, baromètre, réseau, tribune, rapport, adhésion) : 0 violation, clair et sombre, desktop et mobile. Sous-titre de l'annuaire mis à jour (cinq langues) pour annoncer les quatre facettes |

### 9.4 Tribune, événements, jeunes, projets, mentorat (P4)

| # | Anomalie | Correctif |
|---|---|---|
| C-50 | **F-46** — tribune sans compteur ni borne par format | `court` ≤ 10 000, `fond` ≤ 20 000 (serveur + client, constantes partagées), compteur « n / max », message de limite, `noValidate`. Tests |
| C-51 | commentaires trop courts / trop longs refusés en silence | messages sous le champ, `maxLength`, compteur, plafond de débit annoncé ; code serveur explicite |
| C-52 | « Annuler » du composer qui rejoue le brouillon | remise à zéro, confirmation au-delà de 50 caractères |
| C-53 | auteur sans visibilité sur le statut de ses billets | `tribune.myPosts` et section « Mes billets » (publié / retiré), mention de la modération a posteriori |
| C-54 | **R-13** — inscription acceptée côté serveur sur un événement passé ; fiche sans replay ni visio | catalogue minimal des événements à venir côté Convex (`EVENT_CLOSED`, test de synchronisation avec le contenu) ; champs `replayUrl` / `visioUrl` et blocs « Rediffusion » / « Visioconférence » sur la fiche |
| C-55 | jeunes / projets / mentorat : refus de longueur sans la limite | `maxLength` sur `FIELD_MAX`, compteur, messages explicites ; doublon jeune annoncé |
| C-56 | mentorat sans visibilité côté membre | `myMentorshipRequest` et carte « Ta demande de mentorat » (rôle, date, statut). Le parcours complet (choix du mentor, suivi du binôme) reste une fonctionnalité à part (§ 10) |

### 9.5 Vérification du troisième lot

Après fusion des quatre chantiers, reconstruction de l'application (`.next`
vidé, fonctions Convex repoussées sur le backend local) et rejeu complet.

| Vérification | Résultat |
|---|---|
| Portes statiques | `pnpm test` **116 fichiers / 1 159 tests verts** (+62 depuis le second lot) ; typage, lint, format verts |
| `pnpm test:e2e` (build final) | **249 / 249 verts** (57 fichiers de spec, desktop et mobile, 4 min) — au premier rejeu 248 / 249, le seul échec étant C-59, corrigé puis rejoué intégralement |
| `pnpm test:dev-browser` | **52 / 52** |
| Mesure de contraste (script `contraste2`, calcul WCAG sur les nœuds rendus) | **0 nœud sous 4,5:1** sur `/fr`, `/fr/jeunes`, `/fr/a-propos`, `/fr/evenements` — le texte sur safran vaut désormais 13,8:1 (`--accent-contrast` = encre) |
| Gate axe `color-contrast` réintégré (C-58) | 0 violation grave sur les 22 pages du spec `a11y` en clair, et sur 7 pages en **thème sombre**, desktop et mobile |
| Script de contre-vérification (`verif-lot3`, 4 scénarios, captures et vidéos) | **17 / 17** : 404 dans la langue du visiteur pour `/fr/…`, `/ar/…`, `/xx`, `/de/…`, `/en/library` (en-tête et pied présents) ; « Kenya » trouve le membre de Nairobi ; facettes pays et langue rendues ; replays filtrés ; « Mes relectures » ouvert au modérateur et `/admin/revue` toujours refusé ; lien et écran de mot de passe depuis l'espace membre ; aucun débordement mobile sur réseau, tribune, admin, événements, bibliothèque en arabe |

Deux faux négatifs du premier passage, consignés : le script comparait la
langue de la 404 à `fr` alors qu'un chemin sans préfixe (`/xx`) suit la
langue déjà choisie par le visiteur (cookie posé par la visite précédente de
`/ar/xyz`) — c'est le comportement voulu (R-04, arbitrage du 23/09), le script
efface maintenant les cookies avant chaque essai ; et la présence des facettes
était cherchée en casse mixte dans un `innerText` qui rend les légendes en
capitales (CSS `uppercase`). Deux vrais défauts, eux, ont été trouvés par le rejeu et corrigés : l'écran
de mot de passe déconnectait le membre en demandant son code (C-57, spec
`auth-mot-de-passe`), et le harnais reprenait une session enregistrée dont le
jeton était périmé (C-59, un échec sur 249 au premier rejeu, la trace
Playwright montrant l'échange de jeton répondre `tokens: null`).


## 10. Ce qui manque pour un réseau social 100 % fonctionnel et déployable

Les correctifs ci-dessus ferment toutes les anomalies relevées par la
campagne. Ce qui suit n'est pas une anomalie mais une **fonctionnalité
absente** ou une **condition de mise en service**, établi à partir du backlog
canonique (`Democracy-Together-fonctionnalites.md`), de l'audit du 18/09
(`docs/audit-plateforme-2026-09.md`), de la feuille de route
(`docs/roadmap-post-mvp.md`) et de la procédure de déploiement
(`docs/deploiement.md`). Trois familles, par ordre de blocage.

### 10.1 Bloquant pour la mise en service

1. **Configuration de production, aujourd'hui inexistante** : déploiement
   Convex de production (la plateforme tourne sur le déploiement de
   développement), variables `JWT_PRIVATE_KEY` / `JWKS` / `SITE_URL`,
   **fournisseur d'e-mail** (`AUTH_RESEND_KEY` — sans lui, aucun code de
   connexion, aucune invitation, aucune newsletter ne part : l'application
   refuse volontairement d'envoyer), **clés reCAPTCHA** (sans elles, contact,
   newsletter, adhésion, jeunes, événements sont rejetés — fail-closed),
   projet **Sanity** (sans lui, accueil, à-propos et actualités sont sur leur
   repli local), amorçage de l'administrateur (`bootstrap:bootstrapAdmin`),
   clé de préversion pour la CI E2E. Le runbook `docs/deploiement.md` est
   écrit ; il n'a jamais été déroulé.
2. **Données réelles** : annuaire, publications et baromètre sont des jeux
   d'illustration (seeds gardés par `AUTH_DEV_OTP`, donc inexécutables en
   production) ; les événements sont codés dans `src/lib/events-content.ts`
   sans aucune gestion ; les replays n'ont aucune vidéo. L'import initial (§ 6
   du runbook) est bloqué par l'issue #48.
3. **Textes légaux et RGPD** : 24 champs à compléter dans les mentions
   légales et la politique de confidentialité (audit F-09), pas d'export ni de
   suppression de compte en libre-service, arbitrage de l'hébergement (Convex
   et Vercel aux États-Unis, Sanity en région EU) non rendu.
4. **Sauvegardes, rotation des secrets, supervision** : aucun plan de
   sauvegarde ni test de restauration, aucune procédure de rotation, aucune
   alerte (runbook § 9). Une plateforme sans sauvegarde testée n'est pas
   déployable.

### 10.2 Fonctionnalités du backlog encore absentes ou partielles

| Domaine | Ce qui manque | Réf. |
|---|---|---|
| Adhésions et dons | aucun prestataire de paiement : cotisations en ligne, dons ponctuels et récurrents, reçus, suivi financier — `/don` affiche « Bientôt » ; l'estimateur de cotisation est indicatif. Stripe ne couvre pas le XOF : un PSP local (Sénégal) reste à choisir | F-27, F-28, F-29, F-30, F-31 |
| Gestion des contenus | événements, partenaires, presse, thématiques, rapports, replays sont codés dans le dépôt : ni écran d'administration ni CMS pour les éditer ; bibliothèque de médias absente | F-52, F-54, F-62, F-64 |
| Comptes et organisations | pas de création, suspension ni suppression de compte par l'administrateur (invitation seulement) ; pas d'édition de sa fiche par une organisation ; pas de lien organisation ↔ publications ↔ comptes ; pas de profil membre (photo, biographie, préférences) ; pas d'authentification à deux facteurs pour les rôles sensibles | F-21, F-63, sécurité |
| Réseau social | pas de profils publics de personnes, ni de suivi, ni de messagerie privée ; espaces collaboratifs sans fichiers ni invitations ; tribune sans approfondissement (lien court → fond), sans historique de modération, modération a posteriori là où le backlog demande a priori | F-24, F-45, F-48, F-49 |
| Programmes | mentorat sans appariement ni suivi de binôme ; jeunes sans profil persistant ; appels à projets sans appels datés ; boîte à outils et parcours de formation absents | F-56, F-57, F-58, F-59, F-60 |
| Newsletter | pas de double opt-in (exigé par le cadrage) ; envoi en volume non éprouvé | F-18, F-65 |
| Recherche | sous-chaîne en mémoire après lecture complète des tables : correcte à l'échelle actuelle, à indexer (index de recherche Convex) avant croissance | F-06, F-34 |
| Rapports annuels | web et impression navigateur, pas de PDF généré | F-41 |
| Revue à comité de lecture | ouverture, assignation, avis, décision existent désormais ; pas de double aveugle, pas de versions, pas de machine à états formelle | F-43 |
| Mesure | compteurs agrégés, aucune mesure d'audience web | F-66 |
| Accessibilité | conformité mesurée par axe, mais aucune déclaration RGAA fondée sur un audit humain ni test avec lecteur d'écran | F-08 |

### 10.3 Ce que le dépôt attend encore

- Un **second audit de complétude** des 22 « Must » (le décompte 11 / 9 / 2
  du 18/09 n'a pas été réévalué depuis).
- **ADR et CHANGELOG** : aucune décision d'architecture n'est tracée.
- La **CI E2E** ne tourne qu'avec une clé de préversion Convex sur le
  dépôt ; elle est verte sur cette PR.

