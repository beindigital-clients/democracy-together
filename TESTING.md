# Tests

Trois niveaux, **obligatoires pour chaque feature**.

| Niveau | Outil | Emplacement | Lancer |
|---|---|---|---|
| Unitaire (logique, Convex/RBAC) | Vitest + convex-test | `convex/**/*.test.ts` · `tests/unit/**` · `src/**/*.test.ts` | `pnpm test` |
| E2E (parcours navigateur) | Playwright | `tests/e2e/**` | `pnpm test:e2e` |
| Dev-browser (rendu réel) | Playwright (`page.screenshot`) | `screenshots/` | cf. ci-dessous |

## Unitaire — `pnpm test`
- Watch : `pnpm test:watch`.
- Backend Convex : `convex-test` en environnement **edge-runtime** (annotation `// @vitest-environment edge-runtime` en tête de fichier).
- Identité simulée : `t.withIdentity({ subject: \`${userId}|s\` })` (Convex Auth lit `subject.split('|')[0]`).
- Le glob `import.meta.glob` doit **inclure `_generated`** et exclure le câblage auth (`auth.ts`, `auth.config.ts`, `http.ts`) qui touche `process.env`.

## E2E — `pnpm test:e2e`
- Démarre `pnpm dev` automatiquement (webServer Playwright).
- Le flux d'auth crée un **vrai compte** sur le déploiement Convex dev (e-mail horodaté unique par run).
- Détection de langue déterministe : `test.use({ locale: 'fr-FR' })` quand on teste la redirection `/`.

## Dev-browser
Capture du rendu réel via Playwright (`page.screenshot`) pour inspecter clair/sombre, mobile et les états (vide, erreur, connecté). À refaire à chaque feature UI.

## Convention
Aucune feature n'est « terminée » sans : **test(s) unitaire(s) + E2E + vérif dev-browser**. Les bugs rattrapés par les tests jusqu'ici : panic Tailwind sur `.codegraph/*.sock`, clés JWT Convex Auth manquantes, route `/api/auth` exclue du middleware.
