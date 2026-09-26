# Déploiement — Democracy Together

> Runbook de mise en ligne. Objectif : **qu'une autre personne que l'auteur
> initial puisse déployer**, ce qui n'était possible pour personne jusqu'ici
> (audit § 3.4).
>
> Trois services, déployés séparément : **Convex** (backend, données, auth),
> **Sanity** (CMS éditorial) et **Vercel** (application Next.js). Ils ne
> partagent aucun fichier de configuration : chacun porte ses propres variables,
> et c'est la principale source d'erreur.

## Déploiement en cours

La plateforme tourne aujourd'hui sur le déploiement Convex de
**développement**, et non sur un déploiement de production — décision assumée
et temporaire, le temps de la validation de l'application.

| | |
|---|---|
| Déploiement | `dev/mamadou-seck` (`rare-alpaca-677`) |
| Cloud URL | `https://rare-alpaca-677.convex.cloud` → `NEXT_PUBLIC_CONVEX_URL` |
| HTTP Actions URL | `https://rare-alpaca-677.convex.site` → `CONVEX_SITE_URL`, consommée par `convex/auth.config.ts` |

Ce document devient donc une **liste à dérouler le jour de la bascule** : les
deux URL changent, et aucune des variables du § 1 ne suit le code — un
déploiement de production naît vide, sans compte ni donnée. D'ici là, les
avertissements « jamais en production » du § 1.1 valent déjà : ce déploiement de
développement sert l'application réelle.

---

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
| `RECAPTCHA_SECRET_KEY` | vérification serveur du jeton reCAPTCHA v3 | **oui** (voir § 1.4) |
| `AI_GATEWAY_API_KEY` | passerelle Vercel AI Gateway, pour la modération assistée par IA | non — sans elle, la modération reste entièrement humaine (voir § 1.5) |
| `BOOTSTRAP_ADMIN_EMAIL` | adresse autorisée à devenir le **premier** administrateur | le temps de l'amorçage seulement (§ 5) |
| `AUTH_DEV_OTP` | ⛔ **NE JAMAIS DÉFINIR EN PRODUCTION** | — |
| `RECAPTCHA_DISABLED` | ⛔ **NE JAMAIS DÉFINIR EN PRODUCTION** (contournement de dev) | — |

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
npx convex env list            # contrôle : ni AUTH_DEV_OTP ni RECAPTCHA_DISABLED
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

### 1.4 reCAPTCHA : fail-closed lui aussi

Depuis #24, `convex/lib/recaptcha.ts` **rejette** la soumission quand
`RECAPTCHA_SECRET_KEY` est absente, au lieu de laisser passer. Les **sept**
formulaires publics sont concernés : contact, adhésion, newsletter, inscriptions
aux événements, rappels, jeunes, mentorat. Sans la clé en production, ils sont
tous en panne — visiblement, ce qui est le but : une clé oubliée doit se voir,
pas ouvrir la porte en silence.

Le contournement existe mais se demande **explicitement**, par une variable
distincte de l'absence de clé :

```bash
npx convex env set RECAPTCHA_DISABLED true   # dev / préversion UNIQUEMENT
```

S'y ajoutent des plafonds **non forgeables** (`enforcePublicFormLimit`) : par IP
et globaux par formulaire, indépendants de toute donnée fournie par l'appelant.
Rien à configurer, mais c'est ce qui rend le quota réel.

### 1.5 Modération assistée par IA : facultative, et éteinte par défaut

`AI_GATEWAY_API_KEY` alimente la modération éditoriale assistée
(`convex/aiModeration.ts`, cadrage complet dans `docs/moderation-ia.md`). Elle
se pose comme les autres, sur le **déploiement Convex** — la clé ne transite
jamais par le navigateur :

```bash
npx convex env set AI_GATEWAY_API_KEY vck_xxxxxxxx
```

Trois points qui distinguent cette variable des précédentes :

1. **elle n'est pas obligatoire.** Sans elle, aucun dépôt n'est analysé et la
   file de modération fonctionne comme avant — c'est-à-dire entièrement à la
   main. Un déploiement qui ne veut pas de ce dispositif n'a rien à faire ;
2. **son absence ne publie jamais rien.** Contrairement à reCAPTCHA, où
   « fail-closed » veut dire *rejeter*, ici il veut dire *laisser à un
   humain* : clé absente, passerelle injoignable ou réponse illisible
   renvoient le dépôt dans la file. Le pire cas du dispositif est son
   inexistence ;
3. **la clé ne suffit pas à l'armer.** Le mode est réglé dans
   `/admin/moderation-ia`, et vaut `off` tant qu'un administrateur ne l'a pas
   changé. Poser la clé ouvre la possibilité, pas la fonction.

Le plafond de dépense vit dans le même écran (« plafond d'appels par
24 heures ») et non dans une variable : il se change sans redéploiement, et
son dépassement renvoie les dépôts en file au lieu de les publier en aveugle.

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

### 2.1 Amorcer les compteurs du back-office — **une fois, après le déploiement**

Les tableaux de bord (`/admin`, `/admin/impact`) et le nombre d'abonnés de la
newsletter lisent des **compteurs dénormalisés**, tenus à l'écriture dans la
table `counters` (issue #8). Ils ne chargent donc plus les tables pour en lire
la longueur — le coût de ces écrans ne dépend plus de la taille du réseau.

Conséquence à la mise en ligne : sur un déploiement qui portait **déjà** des
données, aucune ligne `counters` n'existe, et ces écrans afficheraient des zéros
jusqu'à la prochaine écriture. Une commande les recalcule depuis les tables :

```bash
npx convex run counters:recompute '{}' --prod
```

Elle rend la liste des compteurs posés, par exemple :

```json
{ "counters": [{ "key": "users", "value": 12 }, { "key": "organizations.active", "value": 7 }, ...] }
```

À rejouer **uniquement** si des lignes ont été écrites hors mutation (console
Convex, script de reprise) : c'est l'outil de réconciliation, pas une tâche
périodique. Sur une base volumineuse, recomptez clé par clé
(`'{"key":"users"}'`) : la commande refuse d'écrire un compte tronqué plutôt que
de servir un chiffre faux.

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

Sur un déploiement neuf, la table `users` est vide et **aucun chemin applicatif**
ne peut créer le premier administrateur — chacun suppose un compte privilégié
déjà en place :

| Chemin | Garde | Amorçage possible ? |
|---|---|---|
| `users.setRole` | `requireNetworkRole(ctx, 'admin')` | non — exige un admin existant |
| `users.inviteUser` | `requireNetworkRole(ctx, 'admin')` | non — idem |
| `organizations.reviewApplication` | approbation d'une candidature | non — n'accorde que `membre` |
| `devAdmin.setRoleByEmail` | `internalMutation` + `AUTH_DEV_OTP === 'true'` | **jamais en production** : le § 1.1 l'interdit |

`convex/bootstrap.ts` (issue #47) ferme ce cercle sans toucher à la surface de
développement : c'est le chemin d'amorçage **de production**.

### 5.1 La procédure

Prérequis : le § 2 est fait (`npx convex deploy`), donc la fonction
`bootstrap:bootstrapAdmin` existe sur le déploiement visé.

```bash
# 1. Désigner l'adresse que le déploiement autorise à devenir administrateur.
npx convex env set BOOTSTRAP_ADMIN_EMAIL 'admin@democracytogether.org' --prod

# 2. Amorcer. L'adresse passée ici doit correspondre à la variable : la
#    variable dit qui le déploiement autorise, l'argument dit qui vous visiez.
#    Une faute de frappe est rejetée, elle ne promeut personne.
npx convex run bootstrap:bootstrapAdmin \
  '{"email":"admin@democracytogether.org"}' --prod

# 3. Retirer la variable : elle n'a plus d'utilité.
npx convex env remove BOOTSTRAP_ADMIN_EMAIL --prod
```

Retour attendu à l'étape 2 :

```json
{ "ok": true, "created": true, "email": "admin@democracytogether.org", "userId": "..." }
```

**Se connecter ensuite** : aucun mot de passe n'est créé — il n'en existe pas à
ce stade. Le compte est connectable dès que sa ligne `users` existe : aller sur
`/fr/connexion-otp`, demander un code à usage unique, le saisir. (Si aucun code
n'arrive : § 1.3, la clé e-mail n'est pas posée.)

L'étape 3 est une mesure d'hygiène, **pas** ce qui referme la porte : c'est la
garde « zéro admin » qui le fait. Une variable oubliée sur le déploiement ne
rouvre donc rien.

### 5.2 Pourquoi ce n'est pas une porte dérobée permanente

| Protection | Effet |
|---|---|
| `internalMutation` | hors API publique : invocable depuis le serveur ou la CLI, **jamais** par un client |
| Garde `BOOTSTRAP_ADMIN_EMAIL` | variable **dédiée**, indépendante d'`AUTH_DEV_OTP` : l'amorçage n'ouvre aucune des surfaces listées au § 1.1 |
| Correspondance de l'adresse | la variable et l'argument doivent concorder — pas de promotion d'une adresse arbitraire |
| Garde « zéro admin » | dès qu'un administrateur existe, la mutation est **inopérante** : elle ne sert qu'une fois, sur un déploiement neuf |
| Audit (`admin.bootstrapped`) | trace dans `auditLog`, sans acteur — l'opération vient de la CLI, pas d'un compte de la plateforme |
| Rôle non paramétrable | la fonction ne sait accorder que `admin` ; tout le reste passe par `users.setRole`, audité et réservé aux administrateurs |

Tests de ces gardes : `convex/bootstrap.test.ts`.

### 5.3 Diagnostic

| Message | Cause | Correctif |
|---|---|---|
| `BOOTSTRAP_ADMIN_NOT_CONFIGURED` | `BOOTSTRAP_ADMIN_EMAIL` absente du déploiement visé | étape 1 — contrôler avec `npx convex env list --prod` |
| `BOOTSTRAP_EMAIL_MISMATCH` | l'adresse passée en argument diffère de la variable | comparer les deux (casse et espaces sont normalisés, le reste non) |
| `BOOTSTRAP_ALREADY_DONE` | un administrateur existe déjà | normal : l'amorçage ne sert qu'une fois. Passer par le back-office (§ 5.4 si l'accès est perdu) |
| `INVALID_EMAIL` | adresse mal formée | corriger la variable **et** l'argument |
| `Could not find function` | le code n'est pas déployé sur la cible | `npx convex deploy` d'abord (§ 2) |

### 5.4 Reprise d'un déploiement dont l'accès admin est perdu

L'amorçage ne rejoue pas, et `users.setRole` refuse par construction de
rétrograder le dernier administrateur : un déploiement en service a donc toujours
au moins un compte admin. Si son **accès** est perdu (adresse hors service), la
voie normale reste le back-office depuis un autre compte administrateur.

Si aucun administrateur n'est joignable, la seule sortie est le tableau de bord
Convex (onglet *Data*, table `users`) : soit corriger le champ `email` du compte
admin, soit retirer son `role` — l'amorçage du § 5.1 redevient alors possible,
puisqu'il ne reste aucun admin. À réserver au dernier recours : cette
intervention n'est pas auditée par la plateforme, la tracer ailleurs.

Une fois le premier administrateur en place, la suite est déjà opérationnelle :
il invite les comptes suivants depuis le back-office (`users.inviteUser`,
formulaire `src/components/admin/invite-user-form.tsx`), et l'approbation d'une
candidature crée l'organisation et invite son contact
(`organizations.reviewApplication`).

---

## 6. Reprise de données et import initial

> ### 🚧 TODO — bloqué par l'issue #48 (dont le prérequis #47 est levé : § 5)
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
| `npx convex env list` | conforme au § 1.1, **sans `AUTH_DEV_OTP` ni `RECAPTCHA_DISABLED`** |
| En-têtes HTTP | CSP présente hors `/studio` ; HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` |
| `X-Robots-Tag` | présent tant que `DEMO_NOINDEX` est posée, **absent** au lancement réel |
| `/studio` | le Studio charge et liste accueil / à-propos / actualités |
| Connexion par code | un e-mail arrive réellement (sinon : § 1.3) |
| Zone privée (`/admin`) | redirige vers la connexion **avant tout rendu** (gating serveur, `src/proxy.ts`) |
| Formulaire de contact | soumission acceptée (donc `RECAPTCHA_SECRET_KEY` bien posée, § 1.4), message visible dans le back-office |
| Tableau de bord Convex | cron `event-reminders` enregistré |
| `/admin` et `/admin/impact` | compteurs cohérents avec les données (sinon : § 2.1 non joué) |

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
- [ ] **Import / reprise de données** — § 6, bloqué par #48.
- [ ] **ADR et CHANGELOG** : aucune décision d'architecture n'est tracée.
- [ ] **Arbitrage RGPD de l'hébergement** : le dataset Sanity est en région EU,
      mais l'hébergement Convex et Vercel n'est pas arbitré (audit F-09).
