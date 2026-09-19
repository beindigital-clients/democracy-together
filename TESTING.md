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

### Sessions partagées : le « fichier de login »
Un projet Playwright `setup` (`tests/e2e/auth.setup.ts`) ouvre **une session par
rôle** — membre, modérateur, éditeur, admin — et l'enregistre dans
`tests/e2e/.auth/<rôle>.json` (dossier ignoré par git). Les projets de test en
dépendent : Playwright le joue d'abord, et s'arrête là s'il échoue.

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
Relancer une spec ne repaie donc plus les quatre connexions.

| Commande | Effet |
|---|---|
| `pnpm test:e2e` | reprend les sessions valides, en rouvre une si besoin |
| `pnpm test:e2e:login` | efface `tests/e2e/.auth/` et rouvre les quatre sessions |
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
checkout neuf : les quatre connexions s'exécutent pour de vrai.

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
