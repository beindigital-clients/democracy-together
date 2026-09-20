# Tests

Trois niveaux. Les deux premiers sont des **portes** — la CI les tient, une PR
qui les casse est rouge. Le troisième est un **outil d'inspection** : il produit
le rendu réel à regarder, et aucune machine ne prononce à votre place que
l'écran a l'air juste. Voir § Convention pour ce que chacun engage.

| Niveau | Outil | Emplacement | Lancer |
|---|---|---|---|
| Unitaire (logique, Convex/RBAC) | Vitest + convex-test | `convex/**/*.test.ts` · `tests/unit/**` · `src/**/*.test.ts` | `pnpm test` |
| E2E (parcours navigateur) | Playwright | `tests/e2e/**` | `pnpm test:e2e` |
| Dev-browser (rendu réel) | Playwright (`page.screenshot`) | `tests/e2e/dev-browser.spec.ts` → `screenshots/` | `pnpm test:dev-browser` |

## Typage et qualité — les portes que la CI tient

Le tsconfig racine **exclut** `convex/`, `tests/` et les `*.test.*` : `pnpm
typecheck` seul ne regarde donc ni le backend ni les tests. Trois commandes
distinctes couvrent l'ensemble, et les trois tournent dans **`ci.yml`**, job
« Typecheck · tests · build » — pas dans `e2e.yml`, qui peut être ignoré faute
de secret Convex :

| Commande | Ce qu'elle type | Pourquoi elle existe |
|---|---|---|
| `pnpm typecheck` | l'application (`src/`) | — |
| `pnpm typecheck:convex` | le backend Convex (`convex/`) | `next build` le compile, mais trop tard pour un retour rapide |
| `pnpm typecheck:tests` | `tests/` (`tsconfig.tests.json`) | sans elle, une option de test inexistante est acceptée sans bruit et le test s'exécute dans des conditions qu'il n'a pas |

S'y ajoutent `pnpm lint` (ESLint en tout-erreur, aucune règle en `warn`) et
`pnpm format:check` (Prettier en lecture seule). Le crochet de pré-commit husky
+ lint-staged les joue en local ; le job `lint` de `ci.yml` est le filet, car le
crochet se contourne (`--no-verify`).

## Unitaire — `pnpm test`
- Watch : `pnpm test:watch`.
- Backend Convex : `convex-test` en environnement **edge-runtime** (annotation `// @vitest-environment edge-runtime` en tête de fichier).
- Identité simulée : `t.withIdentity({ subject: \`${userId}|s\` })` (Convex Auth lit `subject.split('|')[0]`).
- Le glob `import.meta.glob` doit **inclure `_generated`** et exclure le câblage auth (`auth.ts`, `auth.config.ts`, `http.ts`) qui touche `process.env`.
- Exception assumée : `password-policy.test.ts` **charge `auth.ts`**, parce que
  ce qu'il vérifie est le câblage lui-même — une politique de mot de passe
  écrite mais jamais passée au provider ne protège rien. Le prix à payer est
  `vi.stubEnv('SITE_URL', …)` : sans cette variable, la pose d'un mot de passe
  crée bien le compte mais l'action lève sur l'envoi du code de vérification.
  `auth.config.ts` et `http.ts`, eux, restent dehors.
- L'exclusion d'`auth.ts` ne masque plus sa DÉCISION : le corps du callback
  `createOrUpdateUser` vit dans `convex/lib/signIn.ts`, testable tel quel
  (`convex/auth-callback.test.ts`, refus `NO_SELF_SIGNUP` compris). C'est le
  motif à suivre quand un module exclu porte une règle : sortir la règle, pas
  lever l'exclusion.

### Composants (`happy-dom`)
Annotation `// @vitest-environment happy-dom`, rendu par
`@testing-library/react` enveloppé dans `NextIntlClientProvider` (les messages
réels, `src/messages/fr.json` — un libellé traduit à moitié doit faire échouer
le test, pas passer). Pas de `setupFiles` global : chaque fichier pose son
`afterEach(cleanup)`, sans quoi les rendus s'accumulent et les libellés
deviennent ambigus.

`next-intl` est **inliné** par `vitest.config.ts` (`server.deps.inline`) : sa
navigation localisée importe `next/navigation` sans extension, que Vite ne sait
pas résoudre depuis les node_modules imbriqués de pnpm. Sans cela, tout
composant portant un `<Link>` du dépôt échoue à l'import — avant la moindre
assertion.

Le dépôt n'utilise **pas** `vi.mock`. Ce qui doit être testé sans navigateur
est extrait en module ou en composant PUR, auquel les valeurs qui viennent
d'un hook (chemin courant, rôle) sont passées en props : c'est le motif de
`components/admin/admin-nav.tsx`, dont la coquille lit `usePathname()` et
`api.users.current`, et qui ne reçoit, lui, que deux valeurs.

## E2E — `pnpm test:e2e`

### Sessions partagées : le « fichier de login »
Un projet Playwright `setup` (`tests/e2e/auth.setup.ts`) ouvre **une session par
entrée de `SESSIONS`** (`tests/e2e/_sessions.ts`) et l'enregistre dans
`tests/e2e/.auth/<clé>.json` (dossier ignoré par git). Les projets de test en
dépendent : Playwright le joue d'abord, et s'arrête là s'il échoue.

La clé n'est plus un rôle mais un **usage** : aux quatre sessions de rang
(membre, modérateur, éditeur, admin) s'ajoutent les sessions dédiées à un
fichier qui tient une connexion de bout en bout — `confirmations` (issue #38),
`devBrowser` (issue #50). Deux fichiers qui se partagent un compte le font
tourner en parallèle, et Convex Auth invalide le jeton : la liste fait donc foi,
et on ne compte pas les sessions ici pour ne pas mentir au prochain ajout.

Une spec qui a seulement besoin d'être connectée déclare l'état et commence à
son vrai sujet :

```ts
test.describe('…', () => {
  test.use({ storageState: SESSIONS.admin.state });
  test('…', async ({ page }) => { await page.goto('/fr/admin'); /* … */ });
});
```

Auparavant chaque spec de back-office rejouait un parcours de connexion complet
— provisionnement, mot de passe, code, écran de connexion — avant de commencer.
Quinze fois, donc quinze occasions d'échouer pour une raison étrangère au sujet
du test (issue #66). Les parcours d'AUTHENTIFICATION, eux, continuent de se
connecter pour de vrai : `auth*.spec.ts` et `en-journey.spec.ts` ne doivent pas
court-circuiter ce qu'ils vérifient.

Les comptes partagés portent des adresses **stables** (`e2e_session_<rôle>@…`).
Une préversion CI naît vide, mais un déploiement de dev vit longtemps : les
helpers sont donc idempotents — `provisionUser` fait un upsert, et
`provisionPassword` relie le même mot de passe à un compte qui l'a déjà.

### Itérer en local
Les fichiers de session sont **réutilisés d'une exécution à l'autre**. Au
démarrage, `auth.setup.ts` ouvre chaque état déjà présent et demande une page
réservée aux connectés : si l'application répond, la session est reprise telle
quelle ; si elle redirige vers la connexion, le parcours complet est rejoué.
Relancer une spec ne repaie donc plus toutes les connexions.

| Commande | Effet |
|---|---|
| `pnpm test:e2e` | reprend les sessions valides, en rouvre une si besoin |
| `pnpm test:e2e:login` | efface `tests/e2e/.auth/` et rouvre toutes les sessions |
| `pnpm test:e2e:ui` | mode interactif, mêmes sessions |
| `E2E_FRESH_LOGIN=1 pnpm test:e2e` | ignore les fichiers pour cette exécution |

Prérequis : un `.env.local` dont `NEXT_PUBLIC_CONVEX_URL` pointe sur un
déploiement où `AUTH_DEV_OTP=true` — les helpers de provisionnement sont des
`internalMutation` gardées par cette variable. Le serveur web est lancé par
Playwright, et `reuseExistingServer` est actif hors CI : un `pnpm dev` déjà
ouvert est repris tel quel.

Rouvrir les sessions quand le déploiement Convex a changé, qu'une préversion a
été purgée, ou que la page de connexion a été retouchée. Dans le doute,
`pnpm test:e2e:login` : c'est sans effet de bord, les comptes sont
provisionnés en upsert.

En CI rien ne change — `tests/e2e/.auth/` est ignoré par git, donc absent d'un
checkout neuf : les connexions s'exécutent toutes pour de vrai.

### Mot de passe des comptes de test
`provisionPassword` passe par `flow: 'signUp'` puis la vérification par code.
C'est le SEUL chemin ouvert : `flow: 'reset'` exige un compte mot de passe
existant et lève `InvalidAccountId` sinon — c'est ce qui tenait quinze specs en
échec. À noter, côté produit : aucun écran ne permet aujourd'hui de définir un
mot de passe (l'e-mail d'invitation le promet pourtant), donc ce helper passe
par l'API faute d'interface à exercer.

### Sources externes — le CMS n'est pas toujours là
Sanity n'est pas configuré en CI : `sanity/env.ts` retombe sur l'identifiant
`placeholder`, la requête revient en 404, et la page affiche sa liste vide.
`news.spec.ts` teste donc **les deux chemins**, et c'est la configuration
réelle qui décide lequel s'exécute — contenu réel si un projet est renseigné,
dégradation propre sinon. Dans les deux cas la spec vérifie que la page répond
**200** : une source indisponible ne doit pas emporter la page.

La règle (`projectId !== 'placeholder'`) est **importée** du module de
l'application, jamais recopiée : une divergence ferait silencieusement prendre
la mauvaise branche. Le chemin retenu est annoté dans le rapport.

C'est le motif à suivre pour toute dépendance externe : un test qui dépend d'un
service tiers vérifie aussi ce que voit l'utilisateur quand ce service répond
mal. Neutraliser la spec ferait perdre les deux.

### Lire un échec
`pnpm test:e2e` en local ouvre le rapport HTML. En CI, le job publie
`playwright-report/` en artefact (traces comprises) **et** imprime dans le log
l'instantané de page de chaque échec — utile quand l'artefact n'est pas
téléchargeable.
- Démarre le serveur automatiquement (webServer Playwright : `pnpm build && pnpm start`).
- Le flux d'auth crée un **vrai compte** sur le déploiement Convex (e-mail horodaté unique par run).
- Détection de langue déterministe : `test.use({ locale: 'fr-FR' })` quand on teste la redirection `/`.

### Deux projets Playwright
| Projet | Fichiers | Émulation |
|---|---|---|
| `chromium` | `tests/e2e/*.spec.ts`, sauf `dev-browser.spec.ts` | Desktop Chrome |
| `mobile-chromium` | `tests/e2e/mobile/*.spec.ts` | Pixel 7 (viewport 412×839, `hasTouch`, `isMobile`) |

Ce sont les deux que `pnpm test:e2e` nomme, avec le projet `setup` dont ils
dépendent. La configuration en déclare un troisième, `dev-browser`, qui pose sa
propre émulation et ne participe pas à ce chemin (§ Dev-browser).

Un parcours mobile vit dans `tests/e2e/mobile/` : le viewport et le tactile
viennent du **projet**, pas du fichier. Les gestes y passent par `tap()` (et non
`click()`) — c'est la seule façon d'exercer les chemins `pointerType: 'touch'`,
ceux qui régressent.

`reducedMotion` n'est **pas** une option de `test.use` dans la version épinglée
de Playwright : passer par `contextOptions: { reducedMotion: 'reduce' }` (posé
dès la création du contexte, donc avant que le composant ne lise `matchMedia`).

### Parcours en anglais
`en-journey.spec.ts` couvre accueil → bibliothèque → adhésion → connexion en
anglais. Règle du fichier : cibler les éléments par leur **nom accessible
anglais**. Un libellé resté en français n'ajoute pas un texte en trop, il fait
échouer le locator — c'est ce qui attrape les chaînes codées en dur.

### `AUTH_DEV_OTP` : JAMAIS en production
**`AUTH_DEV_OTP` ne doit JAMAIS être défini sur le déploiement de production.**
Ce n'est pas un drapeau isolé mais l'interrupteur de toute la surface de test :
il fait écrire **chaque code de connexion OTP en clair** dans `devOtpCodes`
(`convex/otp.ts`), rouvre l'oracle qui les relit, les 7 oracles de lecture
(énumération d'adresses, corps des messages de contact), les seeds de
démonstration, et fait journaliser `sendEmail` au lieu d'échouer. Le poser
quelques minutes en production, c'est rendre lisible en base tout code de
connexion émis pendant la fenêtre — admin compris.

Ce que ce drapeau ouvre est désormais tenu par des tests, et pas seulement par
des commentaires : `convex/otp.test.ts` vérifie que sans lui **aucun** code
n'est écrit en base — sur les trois flux, et pour une valeur posée de travers
(`1`, `TRUE`, `yes`…), la garde comparant à la chaîne `true` exactement ; et
`convex/devAdmin.test.ts` vérifie que les cinq mutations de développement le
réclament et restent hors API publique.

Ses deux seuls lieux légitimes : le déploiement de **dev local** et les
**préversions Convex de la CI** (ci-dessous). Avant une mise en service :
`npx convex env list --names-only --prod` ne doit mentionner ni `AUTH_DEV_OTP`
ni `RECAPTCHA_DISABLED` (`docs/deploiement.md` § 1.1).

Corollaire : `devAdmin:setRoleByEmail` (gardé par ce drapeau) **n'est pas** la
procédure d'amorçage de l'administrateur initial en production. Celle-ci passe
par `bootstrap:bootstrapAdmin` et sa variable dédiée `BOOTSTRAP_ADMIN_EMAIL` —
`docs/deploiement.md` § 5. Ses tests : `convex/bootstrap.test.ts`, qui vérifient
au passage que l'amorçage n'écrit rien dans `devOtpCodes` et ne dépend pas
d'`AUTH_DEV_OTP`.

### Déploiement Convex pour la CI
`.github/workflows/e2e.yml` crée une **préversion Convex dédiée par pull
request** (`convex deploy --preview-create`), y pose `AUTH_DEV_OTP=true` (jamais
ailleurs : la clé employée est une clé de préversion, qui ne peut pas écrire en
production), la peuple (`seed:seedDirectory`, `seedPublications:seedPublications`)
puis lance la suite. Une préversion naît vide : tout test qui suppose des données
doit passer par ces seeds.

Prérequis côté projet Convex, à provisionner une fois — voir l'en-tête du
workflow : le secret de dépôt `CONVEX_DEPLOY_KEY` (type « Preview ») et, en
valeurs par défaut des préversions, `JWT_PRIVATE_KEY` et `JWKS`. Sans le secret,
le job E2E est **ignoré**, pas rouge.

## Dev-browser — `pnpm test:dev-browser`

Capture du rendu réel, **à regarder**. Le script vide `screenshots/`, parcourt la
matrice ci-dessous et écrit une planche-contact `screenshots/index.html` qui
pose les deux thèmes d'une même page côte à côte. Le dossier est ignoré par git.

### Pourquoi ce niveau existe
Deux régressions rédhibitoires de la PR #4 n'ont été vues que par une inspection
navigateur — ni les tests unitaires ni les E2E ne les voyaient :

1. contenu animé bloqué à `opacity: 0` sans JavaScript (mentions légales
   entièrement blanches, accueil réduit à son en-tête), corrigé en `aea9b24` ;
2. un `loading.tsx` de segment bloquant **toutes** les pages sur
   « Chargement… », retiré en `18051c9`.

Dans les deux cas la page répond 200 avec le bon HTML. C'est l'œil, sur un rendu
réel, qui voit qu'elle est vide.

### La matrice
40 captures : **2 thèmes × 2 tailles × 10 pages**. Elle est déclarée en clair en
tête de `tests/e2e/dev-browser.spec.ts` (`PUBLIQUES`, `CONNECTEES`) — s'y référer
pour ajouter une page, et non à cette table, qui la résume.

| Axe | Valeurs |
|---|---|
| Thème | `clair`, `sombre` (posés par `localStorage['dt-theme']`, comme la bascule de l'interface) |
| Taille | `desktop` (Desktop Chrome), `mobile` (Pixel 7) — mêmes émulations que les projets E2E |

| État | Pages | Ce qu'on y regarde |
|---|---|---|
| `nominal` | `/fr`, `/fr/bibliotheque`, `/fr/mentions-legales`, `/fr/adhesion`, `/fr/barometre`, `/fr/jeunes` | une famille de mise en page par route : hero animé, grille de cartes, texte long, formulaire, data-viz, univers safran |
| `vide` | `/fr/recherche?q=zzzxqkw` | « Aucun résultat » — terme qui ne rencontre rien, quel que soit le jeu de données |
| `erreur` | `/fr/thematiques/inexistant` | la 404 **localisée**. Une adresse sans route du tout (`/fr/nimporte-quoi`) sert la 404 par défaut de Next, en anglais : ce n'est pas celle-ci |
| `connecte` | `/fr/espace-membre`, `/fr/admin` | session dédiée `devBrowser`, rang administrateur (les gardes du back-office sont hiérarchiques, un compte couvre les deux écrans) |

### Ce que la machine tient, et ce qui reste à l'œil
Trois assertions par capture — aucune ne compare un pixel. Elles refusent de
photographier une page vide, c'est-à-dire exactement les deux défauts ci-dessus :

1. le rideau « Chargement… » est levé ;
2. aucun élément `[data-reveal]` qui occupe de la place n'est resté transparent ;
3. la zone de contenu dit quelque chose (plus de 40 caractères).

Tout le reste — mise en page, contrastes, débordements, hiérarchie — se regarde.
Le contraste automatisable est déjà tenu par `a11y.spec.ts` (axe) et le rendu
sans JavaScript par `tests/unit/reveal-nojs.test.ts` : ce niveau ne les rejoue
pas.

### Prérequis et place dans la suite
Mêmes prérequis que les E2E (`.env.local` sur un déploiement `AUTH_DEV_OTP=true`),
car l'état connecté passe par le projet `setup`. Le projet Playwright s'appelle
`dev-browser` et **n'est pas joué par `pnpm test:e2e`**, qui nomme ses projets :
40 captures pleine page n'ont rien à faire dans le chemin de vérification d'une
PR.

### Deux arbitrages, et pourquoi (issue #50)

**Pas de comparaison à des références, pas de captures commitées.** Trois
raisons, dans cet ordre :

- *le poids*. Mesuré sur ce dépôt : ≈ 650 Ko par capture pleine page, soit
  **≈ 26 Mo par exécution**. Des références commitées sont réécrites à chaque
  retouche d'interface, et git garde chaque version pour toujours. L'issue #19 a
  établi que `design/` (38 Mo) pesait à lui seul ~95 % du `.git` : on ne
  recommence pas, en pire, un problème qu'on vient de documenter ;
- *l'instabilité*. Polices, rendu sous-pixel, animations. `framer-motion` anime
  à l'entrée dans le viewport : deux exécutions ne s'arrêtent pas au même
  millième d'opacité. Un seuil de tolérance assez large pour ne pas rougir à
  tort ne verrait plus grand-chose ;
- *l'usage*. Une référence dit « ce n'est plus pareil », jamais « c'est moins
  bien ». À chaque changement d'interface voulu, quelqu'un doit re-valider
  40 images. Le geste dégénère en « mettre à jour les références » sans regarder.

**Pas de job CI.** Ce niveau produit un objet à regarder ; automatiser sa
production sans automatiser son verdict, c'est payer des minutes de CI et un
déploiement Convex de préversion pour un artefact que rien n'oblige à ouvrir. Et
le verdict automatique, c'est précisément la comparaison écartée ci-dessus.
`e2e.yml` est déjà ignoré faute de secret Convex sur la plupart des dépôts
clonés : un second workflow dans le même cas n'ajouterait que du bruit.

*À rouvrir si* : une charte graphique figée et un budget de dépôt clair
rendraient la comparaison tenable — alors références en LFS (pas en blobs git),
tolérance explicite, animations coupées, et job en déclenchement manuel sur le
modèle d'`e2e.yml`.

## Convention

Aucune feature n'est « terminée » sans **test(s) unitaire(s) + E2E**. Ces deux
niveaux sont des portes : `ci.yml` et `e2e.yml` les tiennent.

S'y ajoute, **pour toute feature qui touche à l'interface**, la vérif
dev-browser : lancer `pnpm test:dev-browser`, puis ouvrir la planche et la
parcourir. Ce niveau n'est pas une porte et ne peut pas l'être — on ne fait pas
tenir à une machine « est-ce que ça a l'air juste ». Ce qu'il engage est
néanmoins vérifiable : la matrice est passée, les trois assertions sont vertes,
et quelqu'un a regardé.

Le formuler ainsi n'affaiblit pas la règle, cela la rend applicable. Jusqu'à
l'issue #50, ce troisième niveau était annoncé **obligatoire** sans qu'aucun
script, aucune spec, aucune liste de combinaisons ni aucun dossier de captures
n'existe pour s'y conformer : une exigence que personne ne pouvait satisfaire, et
dont l'audit relevait déjà qu'elle n'avait pas été tenue.

Les bugs rattrapés par les tests jusqu'ici : panic Tailwind sur
`.codegraph/*.sock`, clés JWT Convex Auth manquantes, route `/api/auth` exclue du
middleware.
