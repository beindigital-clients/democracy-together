# Democracy Together — plateforme

Réseau international de think tanks pour la démocratie (Afrique–Europe).
Plateforme numérique : portail éditorial public + espace membres + back-office.

## Stack

| Couche | Techno |
|---|---|
| Frontend | Next.js 16 (App Router) · React 19 · Tailwind v4 |
| i18n | next-intl (FR/EN par URL, extensible pt/ar) |
| Application / données / temps réel | Convex (+ Convex Auth) |
| CMS éditorial | Sanity (Studio monté sur `/studio`) |
| Tests | Vitest (+ convex-test) · Playwright |

Décision de stack et périmètre : voir `Democracy-Together-fonctionnalites.md`
(backlog canonique : 67 fonctionnalités, 22 « Must » pour le MVP du sommet 2026).
État d'avancement réel : `docs/audit-plateforme-2026-09.md` et
`docs/roadmap-post-mvp.md`.

## Démarrer

```bash
pnpm install
pnpm dev            # http://localhost:3000 -> /fr
```

### Convex (à activer une fois)

```bash
npx convex dev      # provisionne le backend, génère convex/_generated, remplit .env.local
```

`convex/` contient le **code applicatif du backend**, écrit à la main (schéma,
auth, fonctions métier, crons, helpers de `convex/lib/`). Seul le
sous-dossier `convex/_generated/` est produit par `convex dev` / `convex codegen`
— il est **versionné à dessein**, pour que la CI puisse typer, tester et builder
sans déploiement Convex.

Les formulaires publics (contact, adhésion, newsletter, événements, rappels,
jeunes, mentorat) sont derrière une porte reCAPTCHA **fail-closed** : sans clé,
ils sont rejetés. Pour développer sans compte Google, posez le contournement
explicite sur votre déploiement de développement — jamais en production :

```bash
npx convex env set RECAPTCHA_DISABLED true
```

### Sanity

Créer un projet sur sanity.io/manage (dataset en région EU), puis renseigner
`NEXT_PUBLIC_SANITY_PROJECT_ID` dans `.env.local` (voir `.env.example`).
Le Studio est servi par l'application elle-même sur `/studio` : il couvre
l'accueil, la page à-propos et les actualités. Les autres contenus (événements,
partenaires, presse, thématiques, rapports, jeunes, adhésion, baromètre) vivent
encore en TypeScript dans `src/lib/*-content.ts`.

### Déploiement

Procédure complète (Convex, Sanity, Vercel, variables de production, amorçage de
l'administrateur initial) : **`docs/deploiement.md`**.

## Tests

Trois commandes, détaillées dans **`TESTING.md`** :

```bash
pnpm test           # unitaires — Vitest + convex-test
pnpm test:e2e       # bout en bout — Playwright (build de prod + pnpm start)
pnpm typecheck && pnpm typecheck:convex && pnpm typecheck:tests
```

Qualité : `pnpm lint`, `pnpm format:check` (crochet de pré-commit husky +
lint-staged). La CI (`.github/workflows/ci.yml`) rejoue typage, tests, build,
lint et `pnpm audit` ; les E2E tournent sur une préversion Convex dédiée par
pull request (`.github/workflows/e2e.yml`).

## i18n

- Langue **dans l'URL** (`/fr`, `/en`) : chaque langue est une URL distincte,
  indexable (hreflang) et cacheable CDN.
- Préférence mémorisée dans le cookie `NEXT_LOCALE` (next-intl), lisible côté
  serveur dès le 1er rendu. **Pas de localStorage** pour la langue.
- Le thème clair/sombre, lui, est en localStorage (préférence purement visuelle).

## Sécurité

- **Gating serveur** des zones privées dans `src/proxy.ts` (le middleware Next :
  il tranche « connecté ou non » avant tout rendu). Le contrôle de **rôle** reste
  côté Convex (`requireNetworkRole`), seule barrière qui protège les données.
- **CSP** et en-têtes de sécurité posés dans `next.config.ts` (HSTS, nosniff,
  `Referrer-Policy`, `Permissions-Policy`…). La CSP est relâchée en développement
  seulement ; `/studio` en est exclu. `DEMO_NOINDEX` ajoute `X-Robots-Tag` sur les
  déploiements de démonstration.
- **reCAPTCHA v3** sur les sept formulaires publics (contact, adhésion,
  newsletter, événements, rappels, jeunes, mentorat), en **fail-closed** : sans
  `RECAPTCHA_SECRET_KEY`, la soumission est **rejetée**. Le contournement doit
  être demandé explicitement (`RECAPTCHA_DISABLED=true`) — jamais en production.
- Plafonds **non forgeables** sur ces mêmes formulaires : compteurs par IP et
  globaux par formulaire (`enforcePublicFormLimit`), qui ne dépendent d'aucune
  donnée fournie par l'appelant.
- Rate-limit applicatif et journal d'audit (`convex/lib/rateLimit.ts`,
  `convex/lib/audit.ts`, écran `/admin/journal`).
- `AUTH_DEV_OTP` ouvre toute la surface de développement (codes OTP en clair,
  seeds, oracles de lecture) : **jamais en production** — voir `docs/deploiement.md`.

## Design system

Tokens portés à l'identique depuis les maquettes (`design/rmdl-style-guide.html`)
vers `src/app/globals.css` (`@theme`) :
- Papier chaud + encre profonde, **un accent par univers** (indigo institutionnel,
  safran jeunes via `data-universe="jeunes"`).
- Typo : Newsreader (éditorial) · IBM Plex Sans (interface) · IBM Plex Mono (donnée).
- Échelle Baromètre divergente, lisible au daltonisme.
- Thème via `data-theme="dark"`. Accessibilité : contraste AA, focus visible,
  `prefers-reduced-motion` respecté.

## Structure

```
src/
  app/[locale]/      pages localisées (layout rend <html>, header, footer)
  app/(studio)/      Studio Sanity monté sur /studio
  components/        header, footer, sections, ui, admin, tribune, map…
  i18n/              routing · request · navigation
  lib/               contenus TypeScript, helpers, routes protégées
  messages/          fr.json · en.json
  proxy.ts           middleware Next : auth Convex + routage de langue
convex/              backend ÉCRIT À LA MAIN : schema, auth, fonctions, crons
  lib/               rbac, audit, rate-limit, reCAPTCHA, validation, slug
  _generated/        seul dossier produit par `convex dev` (versionné, cf. supra)
sanity/              schémas, client (CMS éditorial)
tests/
  unit/              tests hors Convex (Vitest)
  e2e/               parcours Playwright (+ e2e/mobile/ pour le projet mobile)
scripts/             seeds Sanity · capture d'écran (shot.mjs)
public/              images servies telles quelles (brand/, library/)
docs/                audit, pentest, roadmap, déploiement
design/              maquettes HTML de référence (11 écrans) — voir note ci-dessous
.claude/skills/      skills Convex (copie unique ; .agents/skills y pointe)
```

> `design/` pèse 38 Mo et concentre l'essentiel du poids du dépôt (33 Mo pour le
> seul `design/presentation/`). Son sort est ouvert : voir issue #19.
