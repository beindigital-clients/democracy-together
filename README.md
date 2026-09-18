# Democracy Together — plateforme

Réseau international de think tanks pour la démocratie (Afrique–Europe).
Plateforme numérique : portail éditorial public + espace membres + back-office.

## Stack

| Couche | Techno |
|---|---|
| Frontend | Next.js 16 (App Router) · React 19 · Tailwind v4 |
| i18n | next-intl (FR/EN par URL, extensible pt/ar) |
| Application / données / temps réel | Convex (+ Convex Auth) |
| CMS éditorial | Sanity |

Décision de stack et périmètre : voir `Democracy-Together-fonctionnalites.md`
(backlog canonique : 67 fonctionnalités, 22 « Must » pour le MVP du sommet 2026).

## Démarrer

```bash
pnpm install
pnpm dev            # http://localhost:3000 -> /fr
```

### Convex (à activer une fois)

```bash
npx convex dev      # provisionne le backend, génère convex/_generated, remplit .env.local
```

### Sanity

Créer un projet sur sanity.io/manage (dataset en région EU), puis renseigner
`NEXT_PUBLIC_SANITY_PROJECT_ID` dans `.env.local` (voir `.env.example`).

## Secrets (Infisical)

Les variables d'environnement sont centralisées dans Infisical, et Claude Code
peut lire et écrire les secrets du projet via MCP.

Deux serveurs MCP sont déclarés dans `.mcp.json` :

- `infisical` (`npx -y @infisical/mcp`) : accès à l'API (projets, secrets).
- `infisical-docs` (`https://infisical.com/docs/mcp`) : documentation Infisical,
  sans authentification.

Les skills `infisical-*` (installés via `npx skills add Infisical/ai-skills`,
verrouillés dans `skills-lock.json`) guident l'intégration CLI, SDK, Vercel et
le contrôle d'accès.

Le serveur `infisical` attend trois variables dans l'environnement qui lance
Claude Code (jamais dans le dépôt) :

```bash
INFISICAL_HOST_URL=https://app.infisical.com        # ou eu.infisical.com / instance auto-hébergée
INFISICAL_UNIVERSAL_AUTH_CLIENT_ID=...              # Machine Identity (Universal Auth)
INFISICAL_UNIVERSAL_AUTH_CLIENT_SECRET=...
```

Créer la Machine Identity dans Infisical (Organization > Access Control >
Identities), lui donner le rôle nécessaire sur le projet, puis renseigner ces
variables : en local dans votre shell, sur claude.ai/code dans les variables
d'environnement de l'environnement (et autoriser l'hôte Infisical dans sa
politique réseau).

## i18n

- Langue **dans l'URL** (`/fr`, `/en`) : chaque langue est une URL distincte,
  indexable (hreflang) et cacheable CDN.
- Préférence mémorisée dans le cookie `NEXT_LOCALE` (next-intl), lisible côté
  serveur dès le 1er rendu. **Pas de localStorage** pour la langue.
- Le thème clair/sombre, lui, est en localStorage (préférence purement visuelle).

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
  components/        header, footer, sections, ui (button, tag), seal
  i18n/              routing · request · navigation
  messages/          fr.json · en.json
  lib/fonts.ts       next/font (auto-hébergé)
convex/              schema, auth, fonctions (généré par `convex dev`)
sanity/              schémas, client (CMS éditorial)
design/              maquettes HTML de référence (11 écrans)
```
