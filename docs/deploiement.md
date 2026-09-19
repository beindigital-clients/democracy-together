# Déploiement — Democracy Together

> Runbook de mise en ligne. Objectif : **qu'une autre personne que l'auteur
> initial puisse déployer**, ce qui n'était possible pour personne jusqu'ici
> (audit § 3.4).
>
> Trois services, déployés séparément : **Convex** (backend, données, auth),
> **Sanity** (CMS éditorial) et **Vercel** (application Next.js). Ils ne
> partagent aucun fichier de configuration : chacun porte ses propres variables,
> et c'est la principale source d'erreur.

## 0. Avant de commencer

| Prérequis | Détail |
|---|---|
| Node 22 · pnpm 10.33.2 | version épinglée par `packageManager` dans `package.json` |
| Accès Convex | droits de déploiement sur le projet de production |
| Accès Sanity | rôle administrateur sur le projet (sanity.io/manage) |
| Accès Vercel | droits de déploiement sur le projet |
| Fournisseur e-mail | compte Resend (ou équivalent) + domaine d'envoi vérifié |
| reCAPTCHA v3 | paire de clés sur google.com/recaptcha/admin |

```bash
pnpm install --frozen-lockfile
pnpm typecheck && pnpm typecheck:convex && pnpm test && pnpm build
```

Ne déployez pas sur un arbre qui ne passe pas ces quatre commandes : la CI
(`.github/workflows/ci.yml`) joue exactement les mêmes.

---

## 1. Où va chaque variable

C'est le point qui fait perdre le plus de temps. **Deux environnements
distincts**, qui ne communiquent pas :

### 1.1 Environnement du **déploiement Convex** (`npx convex env set`)

Ces variables ne sont **jamais** dans `.env.local`, jamais sur Vercel, jamais
côté client. Elles sont lues par les fonctions Convex.

| Variable | Rôle | Obligatoire en prod |
|---|---|---|
| `JWT_PRIVATE_KEY` | clé RS256 de signature des jetons Convex Auth | **oui** |
| `JWKS` | jeu de clés publiques correspondant | **oui** |
| `SITE_URL` | base des liens dans les e-mails sortants (invitations, désinscription newsletter, rappels d'événements) | **oui** |
| `AUTH_RESEND_KEY` | clé API Resend | **oui** (voir § 1.3) |
| `AUTH_EMAIL_FROM` | expéditeur, ex. `Democracy Together <no-reply@…>` | recommandé |
| `AUTH_EMAIL_PROVIDER` | `resend` (défaut déduit de la clé) | non |
| `RECAPTCHA_SECRET_KEY` | vérification serveur du jeton reCAPTCHA v3 | **oui** |
| `AUTH_DEV_OTP` | ⛔ **NE JAMAIS DÉFINIR EN PRODUCTION** | — |

`CONVEX_SITE_URL` est posée automatiquement par Convex et consommée par
`convex/auth.config.ts` : rien à faire.

La paire `JWT_PRIVATE_KEY` / `JWKS` se génère une fois :

```bash
npx @convex-dev/auth          # génère la paire et propose de la poser
# ou, manuellement :
npx convex env set JWT_PRIVATE_KEY -- "$(cat private.pem)"
npx convex env set JWKS '<jwks json>'
npx convex env set SITE_URL https://<domaine-de-production>
npx convex env set AUTH_RESEND_KEY re_xxxxxxxx
npx convex env set RECAPTCHA_SECRET_KEY 6Lxxxxxxxx
npx convex env list            # contrôle : AUTH_DEV_OTP ne doit PAS apparaître
```

> ⛔ **`AUTH_DEV_OTP` en production est une faille, pas une commodité.** Ce seul
> drapeau ouvre simultanément : l'écriture **en clair** de chaque code de
> connexion OTP dans `devOtpCodes` et son oracle de relecture
> (`convex/otp.ts`), l'injection des seeds de démonstration (`convex/seed.ts`,
> `convex/seedPublications.ts`), sept oracles de lecture qui cessent de renvoyer
> `null`, et les mutations `convex/devAdmin.ts` (dont la purge d'utilisateur).
> Il ne doit exister que sur les préversions et en développement. Détail
> complet dans l'issue #47.

### 1.2 Environnement **Vercel** (projet → Settings → Environment Variables)

| Variable | Rôle |
|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | URL du déploiement Convex de production |
| `NEXT_PUBLIC_SITE_URL` | URL canonique du site (metadata, sitemap, hreflang) |
| `NEXT_PUBLIC_SANITY_PROJECT_ID` | identifiant du projet Sanity |
| `NEXT_PUBLIC_SANITY_DATASET` | `production` |
| `NEXT_PUBLIC_SANITY_API_VERSION` | ex. `2025-01-01` |
| `SANITY_API_READ_TOKEN` | jeton de lecture (contenus en brouillon / dataset privé) |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | clé **de site** reCAPTCHA (publique, lue par le navigateur) |
| `DEMO_NOINDEX` | à **définir** tant que ce n'est pas le site final — ajoute `X-Robots-Tag: noindex, nofollow` ; **à retirer au lancement réel** |

Tout ce qui est préfixé `NEXT_PUBLIC_` est **inscrit dans le bundle client** :
n'y mettez jamais un secret. La clé **secrète** reCAPTCHA va sur Convex (§ 1.1),
jamais ici.

### 1.3 Le cas de l'e-mail : échec assumé plutôt que silence

`convex/email.ts` est **fail-closed** : sans fournisseur configuré et hors
`AUTH_DEV_OTP`, l'envoi lève `EMAIL_PROVIDER_NOT_CONFIGURED` au lieu de
simuler un succès. Conséquence concrète en production sans `AUTH_RESEND_KEY` :
**la connexion par code est impossible** (aucun code n'est envoyé), les
invitations échouent et les campagnes newsletter comptent leurs échecs.
Posez la clé avant d'ouvrir le site.

---

## 2. Déployer Convex

```bash
npx convex deploy            # pousse schéma + fonctions sur la production
```

Le déploiement applique le schéma (`convex/schema.ts`) et enregistre les crons
de `convex/crons.ts` — aujourd'hui un seul : `event-reminders`, tous les jours à
**07:00 UTC** (rappels F-55). Vérifiez ensuite dans le tableau de bord Convex
que le cron apparaît et que `npx convex env list` est conforme au § 1.1.

**Sur Vercel**, le build doit déployer Convex *puis* builder Next, pour que
`NEXT_PUBLIC_CONVEX_URL` pointe sur le déploiement fraîchement poussé. Build
command du projet :

```
npx convex deploy --cmd 'pnpm build'
```

avec `CONVEX_DEPLOY_KEY` (clé de **production**) en variable d'environnement
Vercel. Sans cela, gérez les deux étapes à la main et tenez
`NEXT_PUBLIC_CONVEX_URL` à jour vous-même.

> ⚠️ La clé de déploiement **Preview** utilisée par `.github/workflows/e2e.yml`
> est distincte et ne peut pas écrire en production. Ne les confondez pas.

---

## 3. Déployer Sanity

Le Studio est **servi par l'application elle-même** sur `/studio`
(`src/app/(studio)/`, `basePath: '/studio'` dans `sanity.config.ts`) : le
déployer avec Vercel suffit, il n'y a rien de plus à faire pour y accéder.

À faire **une fois**, dans sanity.io/manage :

1. Dataset en **région EU** (contrainte RGPD du cadrage).
2. **CORS origins** : ajouter le domaine de production (et celui de préproduction)
   avec les identifiants autorisés — sans quoi le Studio et les lectures
   échouent depuis le site déployé.
3. Jeton de lecture → `SANITY_API_READ_TOKEN` côté Vercel (§ 1.2).

`npx sanity deploy` n'est **pas** nécessaire : il publierait une copie séparée
du Studio sur `*.sanity.studio`. Ne l'utilisez que si vous voulez explicitement
ce second point d'entrée ; `sanity.cli.ts` est déjà configuré pour les commandes
CLI (`npx sanity …`).

Périmètre réel du CMS : **accueil, à-propos, actualités**. Les autres contenus
(événements, partenaires, presse, thématiques, rapports, jeunes, adhésion,
baromètre) sont en TypeScript dans `src/lib/*-content.ts` et exigent un
développeur pour être modifiés.

---

## 4. Déployer l'application (Vercel)

1. Connecter le dépôt, brancher la branche de production.
2. Poser les variables du § 1.2.
3. Build command : voir § 2. Package manager : pnpm (verrou `pnpm-lock.yaml`).
4. Déployer, puis brancher le domaine définitif et **retirer `DEMO_NOINDEX`**
   au lancement réel.

`.vercelignore` exclut déjà `tests`, `.claude`, `.agents`, `.codegraph`,
`.gstack`, `playwright-report` et `test-results` du paquet déployé.

---

## 5. Amorçage de l'administrateur initial

> ### 🚧 TODO — bloqué par l'issue #47
>
> **Cette section ne peut pas encore décrire une procédure de production sûre.**
> Elle sera complétée dès que #47 aura livré la mutation d'amorçage dédiée.

**État actuel.** Les quatre chemins qui écrivent un rôle réseau sont tous
inaccessibles sur un déploiement neuf :

| Chemin | Garde | Amorçage possible ? |
|---|---|---|
| `users.setRole` | `requireNetworkRole(ctx, 'admin')` | non — exige un admin existant |
| `users.inviteUser` | `requireNetworkRole(ctx, 'admin')` | non — idem |
| `organizations.reviewApplication` | approbation d'une candidature | non — n'accorde que `membre` |
| `devAdmin.setRoleByEmail` | `internalMutation` + `AUTH_DEV_OTP === 'true'` | **seul chemin**, mais dev uniquement |

L'œuf et la poule est entier : créer le premier administrateur exige
aujourd'hui de poser `AUTH_DEV_OTP=true` sur la production, ce que le § 1.1
interdit — pendant toute la fenêtre d'activation, **chaque code de connexion
émis est lisible en clair en base**.

La PR #4 a rendu `devAdmin.setRoleByEmail` capable de **créer** le compte s'il
n'existe pas (sans quoi la procédure échouait sur « Utilisateur introuvable »
depuis la suppression de l'auto-inscription). Nécessaire, mais **pas
suffisant** : la garde `AUTH_DEV_OTP` reste en place.

**Ce qu'attend #47** : une `internalMutation` d'amorçage gardée par sa propre
variable (`BOOTSTRAP_ADMIN_EMAIL`), **refusant de s'exécuter si un
administrateur existe déjà** — donc non rejouable et inoffensive si la variable
traîne — et journalisée dans `auditLog`. Une fois livrée, la procédure tiendra
en quatre lignes, à écrire ici :

```bash
# TODO (#47) — forme attendue, NON DISPONIBLE à ce jour :
# npx convex env set BOOTSTRAP_ADMIN_EMAIL admin@exemple.org
# npx convex run <module>:bootstrapAdmin
# npx convex env remove BOOTSTRAP_ADMIN_EMAIL
# puis : connexion par code, et invitation des autres comptes via /admin
```

Une fois le premier administrateur en place, la suite est déjà opérationnelle :
il invite les comptes suivants depuis le back-office (`users.inviteUser`,
formulaire `src/components/admin/invite-user-form.tsx`), et l'approbation d'une
candidature crée l'organisation et invite son contact
(`organizations.reviewApplication`).

---

## 6. Reprise de données et import initial

> ### 🚧 TODO — bloqué par l'issue #48 (elle-même dépendante de #47)
>
> **Aucun mécanisme d'import n'existe à ce jour.** Cette section sera complétée
> quand #48 aura livré l'import en lot.

**État actuel.** Le dépôt ne contient que deux modules de peuplement, tous deux
explicitement **illustratifs** et gardés par `AUTH_DEV_OTP` — donc inutilisables
en production :

| Module | Contenu |
|---|---|
| `convex/seed.ts` | think tanks de démonstration pour l'annuaire (noms fictifs) |
| `convex/seedPublications.ts` | publications de démonstration pour la bibliothèque |

Il n'existe ni module d'import, ni script dédié, ni format d'échange documenté.
Pour ouvrir la plateforme à N think tanks fondateurs, il faut aujourd'hui saisir
N fois le formulaire d'invitation à la main, puis attendre que chaque
organisation remplisse sa fiche.

**Ce qu'attend #48** : un import d'invitations en lot et un import
d'organisations, **authentifiés** (`requireNetworkRole(ctx, 'admin')`) et non
gardés par une variable d'environnement, idempotents, avec un rapport ligne à
ligne (créée / déjà présente / invalide) et un CSV d'exemple aux colonnes
documentées. À décrire ici une fois livré : format attendu, commande, lecture du
rapport.

> ⚠️ N'improvisez pas un import de masse derrière `AUTH_DEV_OTP` en attendant :
> ce serait exactement la régression de sécurité décrite au § 1.1.

---

## 7. Contrôles après mise en ligne

| Contrôle | Attendu |
|---|---|
| `https://<domaine>/` | redirige vers `/fr` (ou `/en` selon la langue du navigateur) |
| `npx convex env list` | conforme au § 1.1, **sans `AUTH_DEV_OTP`** |
| En-têtes HTTP | CSP présente hors `/studio` ; HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` |
| `X-Robots-Tag` | présent tant que `DEMO_NOINDEX` est posée, **absent** au lancement réel |
| `/studio` | le Studio charge et liste accueil / à-propos / actualités |
| Connexion par code | un e-mail arrive réellement (sinon : § 1.3) |
| Zone privée (`/admin`) | redirige vers la connexion **avant tout rendu** (gating serveur, `src/proxy.ts`) |
| Formulaire de contact | soumission acceptée, message visible dans le back-office |
| Tableau de bord Convex | cron `event-reminders` enregistré |

---

## 8. Revenir en arrière

- **Application** : Vercel → *Deployments* → promouvoir le déploiement
  précédent. Immédiat, sans effet sur les données.
- **Backend Convex** : un `convex deploy` **n'est pas réversible d'un clic**.
  Redéployez le commit précédent (`git checkout <sha> && npx convex deploy`).
  ⚠️ Une migration de schéma qui a supprimé ou rétréci un champ ne se défait pas
  en redéployant : les données sont déjà parties. Traitez tout changement de
  schéma destructeur comme une opération à sens unique et sauvegardez avant.

---

## 9. Ce que ce document ne couvre pas encore

À écrire, dans l'ordre de risque décroissant — l'audit les relève comme absents :

- [ ] **Plan de sauvegarde et de restauration** des données Convex (fréquence,
      support, test de restauration). Aujourd'hui : rien d'écrit, rien de testé.
- [ ] **Procédure de rotation des secrets** (`JWT_PRIVATE_KEY`/`JWKS`,
      `AUTH_RESEND_KEY`, `RECAPTCHA_SECRET_KEY`, jetons Sanity), et conduite à
      tenir en cas de fuite.
- [ ] **Amorçage de l'administrateur** — § 5, bloqué par #47.
- [ ] **Import / reprise de données** — § 6, bloqué par #48.
- [ ] **ADR et CHANGELOG** : aucune décision d'architecture n'est tracée.
- [ ] **Arbitrage RGPD de l'hébergement** : le dataset Sanity est en région EU,
      mais l'hébergement Convex et Vercel n'est pas arbitré (audit F-09).
