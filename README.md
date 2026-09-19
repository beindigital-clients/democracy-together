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

## Déploiement et compte administrateur

Procédure et variables de production : `docs/deploiement.md`.

Sur un déploiement neuf, le premier administrateur s'amorce par une mutation
dédiée — les chemins d'attribution de rôle du back-office exigent tous un admin
déjà connecté :

```bash
npx convex env set BOOTSTRAP_ADMIN_EMAIL 'admin@exemple.org' --prod
npx convex run bootstrap:bootstrapAdmin '{"email":"admin@exemple.org"}' --prod
npx convex env remove BOOTSTRAP_ADMIN_EMAIL --prod
```

La mutation devient **inopérante dès qu'un administrateur existe** : elle ne sert
qu'une fois, sur un déploiement neuf. La connexion se fait ensuite par code à
usage unique (`/fr/connexion-otp`) — aucun mot de passe n'est créé.

> ⚠️ **`AUTH_DEV_OTP` ne doit JAMAIS être défini en production.** Ce drapeau
> ouvre toute la surface de développement : les codes de connexion OTP sont
> alors écrits **en clair** en base et relisibles, les oracles de lecture
> (énumération d'adresses, corps des messages de contact) répondent, et les seeds
> de démonstration deviennent invocables. Il n'a sa place qu'en dev local et sur
> les préversions Convex de la CI. C'est pourquoi l'amorçage ci-dessus a sa
> propre variable : il n'a pas besoin de ce drapeau. Détail dans
> `docs/deploiement.md`.

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
