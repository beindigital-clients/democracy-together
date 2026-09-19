# Tests

Trois niveaux, **obligatoires pour chaque feature**.

| Niveau | Outil | Emplacement | Lancer |
|---|---|---|---|
| Unitaire (logique, Convex/RBAC) | Vitest + convex-test | `convex/**/*.test.ts` · `tests/unit/**` · `src/**/*.test.ts` | `pnpm test` |
| E2E (parcours navigateur) | Playwright | `tests/e2e/**` | `pnpm test:e2e` |
| Dev-browser (rendu réel) | Playwright (`page.screenshot`) | `screenshots/` | cf. ci-dessous |

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

## E2E — `pnpm test:e2e`
- Démarre le serveur automatiquement (webServer Playwright : `pnpm build && pnpm start`).
- Le flux d'auth crée un **vrai compte** sur le déploiement Convex (e-mail horodaté unique par run).
- Détection de langue déterministe : `test.use({ locale: 'fr-FR' })` quand on teste la redirection `/`.

### Deux projets Playwright
| Projet | Fichiers | Émulation |
|---|---|---|
| `chromium` | `tests/e2e/*.spec.ts` | Desktop Chrome |
| `mobile-chromium` | `tests/e2e/mobile/*.spec.ts` | Pixel 7 (viewport 412×839, `hasTouch`, `isMobile`) |

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

## Dev-browser
Capture du rendu réel via Playwright (`page.screenshot`) pour inspecter clair/sombre, mobile et les états (vide, erreur, connecté). À refaire à chaque feature UI.

## Convention
Aucune feature n'est « terminée » sans : **test(s) unitaire(s) + E2E + vérif dev-browser**. Les bugs rattrapés par les tests jusqu'ici : panic Tailwind sur `.codegraph/*.sock`, clés JWT Convex Auth manquantes, route `/api/auth` exclue du middleware.
