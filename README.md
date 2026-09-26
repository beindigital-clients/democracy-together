# Democracy Together — plateforme

Réseau international de think tanks pour la démocratie (Afrique–Europe).
Plateforme numérique : portail éditorial public + espace membres + back-office.

## Stack

| Couche | Techno |
|---|---|
| Frontend | Next.js 16 (App Router) · React 19 · Tailwind v4 |
| i18n | next-intl (FR/EN par URL ; pt s'ajoute tel quel, ar demande le RTL — #23) |
| Application / données / temps réel | Convex (+ Convex Auth) |
| CMS éditorial | Sanity (Studio monté sur `/studio`) |
| Modération assistée | Vercel AI Gateway (`/v1/responses`, sans SDK) — facultative, éteinte par défaut |
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

> **Déploiement en cours : le Convex de développement** (`rare-alpaca-677`),
> jusqu'à la validation de l'application — choix assumé et temporaire. La
> bascule vers la production suit `docs/deploiement.md`, qui vaut runbook.

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

Procédure complète (Convex, Sanity, Vercel, variables de production) :
**`docs/deploiement.md`**.

Sur un déploiement neuf, le **premier administrateur** s'amorce par une mutation
dédiée — tous les chemins d'attribution de rôle du back-office exigent un admin
déjà connecté :

```bash
npx convex env set BOOTSTRAP_ADMIN_EMAIL 'admin@exemple.org' --prod
npx convex run bootstrap:bootstrapAdmin '{"email":"admin@exemple.org"}' --prod
npx convex env remove BOOTSTRAP_ADMIN_EMAIL --prod
```

Elle est **inopérante dès qu'un administrateur existe** : elle ne sert qu'une
fois, sur un déploiement neuf, et n'a pas besoin d'`AUTH_DEV_OTP` (voir la
section Sécurité). La connexion se fait ensuite par code à usage unique
(`/fr/connexion-otp`) — aucun mot de passe n'est créé. Détail et diagnostic :
`docs/deploiement.md` § 5.

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
- **Navigation entre pages** : `Link`, `useRouter`, `redirect` et `usePathname`
  viennent de `@/i18n/navigation`. Ces versions-là portent le préfixe de langue,
  celles de `next/navigation` non : utiliser les mauvaises produit une
  redirection qui perd la langue — un bogue muet, visible seulement en anglais.
  Une règle ESLint l'impose (`notFound`, `useSearchParams` et `useParams`, qui
  ne naviguent pas, restent libres).
- **Normaliser une locale** (segment d'URL inconnu, absent, mal cassé) :
  `resolveLocale()` de `@/i18n/locale` — seul endroit du dépôt où cette règle
  s'écrit. `isSupportedLocale()` quand une locale inconnue doit être REFUSÉE
  plutôt que repliée (c'est le 404 du layout).
- **Clé de message absente** : elle ne passe plus en silence. En développement
  la page rend `⟦chemin.de.la.cle⟧` et la console porte l'erreur ; en production
  le dernier segment est rendu — une page qui casse serait pire — mais l'erreur
  est journalisée. La politique vit dans `@/i18n/message-errors` et sert les
  DEUX moitiés du site : le rendu serveur par `i18n/request.ts`, les composants
  client par `IntlClientProvider` (ces réglages sont des fonctions, elles ne
  franchissent pas la frontière RSC).
- **Clé construite à l'exécution** — un slug de thème ou de région venu de la
  base, un statut : `vocabulary(t, 'themes.', slug)` de `@/i18n/vocabulary`,
  jamais `` t(`themes.${slug}`) ``. Le vocabulaire peut diverger de la base et
  mérite un repli ; un libellé d'interface écrit en dur, non. C'est cette
  séparation qui permet au repli d'être strict partout ailleurs.
  `tests/unit/i18n-keys.test.ts` la tient, et vérifie au passage que chaque clé
  littérale du code existe dans `fr.json` ET `en.json`.

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
- **Modération éditoriale assistée par IA** (`convex/aiModeration.ts`,
  `/admin/moderation-ia`) : facultative, **éteinte par défaut**, et
  fail-closed dans le sens qui convient à une décision de publication — clé
  absente, passerelle en panne ou réponse illisible renvoient le dépôt en file
  HUMAINE, jamais en ligne. Le modèle rend un avis ; c'est le serveur qui
  décide, en relisant le mode, le périmètre et le statut dans la transaction
  qui écrit. Cadrage complet : `docs/moderation-ia.md`.
- **`AUTH_DEV_OTP` ne doit JAMAIS être défini en production.** Ce drapeau ouvre
  toute la surface de développement d'un coup : chaque code de connexion OTP est
  écrit **en clair** dans `devOtpCodes` et relisible, les sept oracles de lecture
  (énumération d'adresses, corps des messages de contact) répondent, les seeds de
  démonstration et les mutations de `convex/devAdmin.ts` deviennent invocables.
  Ses deux seuls lieux légitimes : le dev local et les préversions Convex de la
  CI. L'amorçage de l'administrateur initial a sa **propre** variable pour cette
  raison — il n'a jamais besoin de ce drapeau. Voir `docs/deploiement.md` § 1.1.

## Design system

Tokens portés à l'identique depuis les maquettes (`design/rmdl-style-guide.html`)
vers `src/app/globals.css` (`@theme`) :
- Papier chaud + encre profonde, **un accent par univers** (indigo institutionnel,
  safran jeunes via `data-universe="jeunes"`).
- Typo : Newsreader (éditorial) · IBM Plex Sans (interface) · IBM Plex Mono (donnée).
- Échelle Baromètre divergente, lisible au daltonisme.
- Thème via `data-theme="dark"`. Accessibilité : contraste AA, focus visible,
  `prefers-reduced-motion` respecté.
- **Champs de formulaire : un seul système**, `src/components/ui/field.tsx`
  (`TextField` · `TextareaField` · `SelectField`, la coquille `Field` pour les
  contrôles particuliers — mot de passe, code à usage unique, fichier — et
  `FormError` pour l'erreur du formulaire). C'est lui qui porte le libellé,
  l'aide, l'erreur et leur rattachement ARIA : ce qu'on y corrige est corrigé
  dans tous les formulaires à la fois. Une règle ESLint interdit de réassembler
  un champ à la main (`<label htmlFor>` hors de ce fichier) ; les libellés
  ENVELOPPANTS des groupes de cases et de boutons radio, eux, restent la bonne
  réponse.

## Structure

```
src/
  app/[locale]/      pages localisées (layout rend <html>, header, footer)
  app/(studio)/      Studio Sanity monté sur /studio
  components/        header, footer, sections, ui, admin, tribune, map…
  i18n/              routing · request · navigation · locale · vocabulary
  lib/               contenus TypeScript, helpers, routes protégées
  messages/          fr.json · en.json
  proxy.ts           middleware Next : auth Convex + routage de langue
convex/              backend ÉCRIT À LA MAIN : schema, auth, fonctions, crons
  lib/               rbac, audit, rate-limit, reCAPTCHA, validation, slug,
                     aiModeration (barème + décision, pur) · aiGateway (appel)
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
