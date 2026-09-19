# Passage en production — bascule Convex dev → prod

> **Décision (septembre 2026)** : la plateforme tourne sur le déploiement Convex
> de **développement** jusqu'à la validation de l'application. C'est un choix
> assumé et temporaire.
>
> Ce document existe parce que presque rien de ce qui suit ne vit dans le code :
> ce sont des réglages attachés à **un** déploiement. Changer de déploiement ne
> se fait donc pas en changeant une URL — il faut refaire la liste entière, et
> une seule ligne oubliée casse la connexion ou ouvre une porte.

## Déploiement en cours

| | |
|---|---|
| Nom | `rare-alpaca-677` (dev) |
| Cloud URL | `https://rare-alpaca-677.convex.cloud` → `NEXT_PUBLIC_CONVEX_URL` (hébergement) |
| HTTP Actions URL | `https://rare-alpaca-677.convex.site` → `CONVEX_SITE_URL`, lu par `convex/auth.config.ts` comme émetteur des jetons |

`CONVEX_SITE_URL` est posée **automatiquement** par Convex sur chaque
déploiement : on ne la définit jamais à la main, mais sa valeur change à la
bascule, et avec elle l'émetteur attendu des jetons d'authentification.

**Un déploiement de production naît VIDE.** Aucun compte, aucune publication,
aucun espace de travail du dev ne le suit. C'est la cause directe du point
bloquant ci-dessous.

---

## Ce qu'il faudra refaire à la bascule

### 1. Variables d'environnement du déploiement Convex

`npx convex env set --prod NOM valeur` (ou via le tableau de bord). Aucune de
ces valeurs n'est portée par le dépôt.

| Variable | Si elle manque en production |
|---|---|
| `JWT_PRIVATE_KEY` · `JWKS` | Convex Auth ne peut émettre aucune session : **personne ne se connecte**. Paire générée par `npx @convex-dev/auth`, propre à ce déploiement. |
| `SITE_URL` | Les envois liés à l'authentification échouent sur `Missing environment variable SITE_URL`. **Le domaine réel**, pas `http://localhost:3000`. |
| `AUTH_RESEND_KEY` (ou `AUTH_EMAIL_PROVIDER`) + `AUTH_EMAIL_FROM` | `convex/email.ts` lève `EMAIL_PROVIDER_NOT_CONFIGURED` — volontairement, plutôt que de simuler un succès. Donc **aucun code à usage unique ne part, et plus personne ne peut se connecter**. C'est la variable la plus facile à oublier et la plus visible. |
| `RECAPTCHA_SECRET_KEY` | La vérification serveur devient un no-op : les formulaires publics (contact, adhésion, newsletter) tournent **sans protection anti-spam**, silencieusement. |
| `AUTH_DEV_OTP` | **Doit rester ABSENTE.** Elle déverrouille toutes les portes de service : `devAdmin:setRoleByEmail`, `purgeUserByEmail`, les seeds, et surtout `otp:latestDevCode`, qui rend lisible en clair le code de connexion de **n'importe quelle adresse**. À vérifier explicitement après la bascule, pas seulement à ne pas poser. |

### 2. Variables d'environnement de l'hébergement (Vercel)

| Variable | Valeur |
|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | Cloud URL du déploiement **prod** |
| `NEXT_PUBLIC_SITE_URL` | Domaine public réel |
| `NEXT_PUBLIC_RECAPTCHA_SITE_KEY` | Clé de site reCAPTCHA v3 (publique) |
| `NEXT_PUBLIC_SANITY_PROJECT_ID` · `NEXT_PUBLIC_SANITY_DATASET` · `NEXT_PUBLIC_SANITY_API_VERSION` · `SANITY_API_READ_TOKEN` | CMS éditorial — voir `.env.example` |

`NEXT_PUBLIC_CONVEX_URL` est **figée au build** : la changer exige un
redéploiement, pas un simple redémarrage. C'est aussi pourquoi elle est publique
par construction (elle part dans le bundle navigateur) — ce n'est pas un secret.

### 3. Le premier administrateur — **point bloquant à traiter avant la bascule**

Sur un déploiement prod vierge, **il n'existe aujourd'hui aucun moyen de créer le
premier compte administrateur.** Les trois chemins sont fermés en même temps :

- l'auto-inscription est supprimée — `createOrUpdateUser` (`convex/auth.ts`) lève
  `NO_SELF_SIGNUP` pour tout e-mail inconnu ;
- `users.inviteUser` exige `requireNetworkRole(ctx, 'admin')` : il faut déjà un
  admin pour en créer un ;
- `devAdmin:setRoleByEmail` — décrit dans son propre commentaire comme « le seul
  moyen documenté d'amorcer l'administrateur initial » — refuse de s'exécuter
  sans `AUTH_DEV_OTP=true`, qui ne doit jamais être posée en production.

Ce n'est pas un défaut du dev : en dev, `AUTH_DEV_OTP=true` débloque le cas. Il
n'apparaît qu'au moment où ce garde-fou fait son travail.

Trois issues, par ordre de préférence :

1. **Insérer la ligne à la main** depuis l'éditeur de données du tableau de bord
   Convex : un document `users` avec `email` (minuscules, sans espaces — c'est la
   normalisation de `lib/onboarding.ts`) et `role: "admin"`. La personne se
   connecte ensuite par code à usage unique : `createOrUpdateUser` accepte tout
   e-mail pour lequel un compte existe déjà. Aucun code, aucune porte ouverte.
2. **Ouvrir un chemin d'amorçage propre** dans le code — une fonction interne
   gardée autrement que par `AUTH_DEV_OTP` (par exemple une variable
   `BOOTSTRAP_ADMIN_EMAIL` posée sur le déploiement, consommée une seule fois).
   C'est la solution durable ; elle demande une décision et un test.
3. Poser temporairement `AUTH_DEV_OTP=true` en production — **à écarter** :
   cela ouvre simultanément les codes en clair, les purges de comptes et les
   seeds, sur des données réelles.

### 4. Données

Les seeds (`seed:seedDirectory`, `seedPublications:seedPublications`) sont des
**données d'illustration** — noms et sites fictifs, revendiqué comme tel dans
`convex/seed.ts`. Elles sont de toute façon gardées par `AUTH_DEV_OTP`, donc
inexécutables en production : c'est voulu, pas un obstacle à contourner.

L'annuaire, les publications et les événements réels passent par le back-office
(ou un import dédié à écrire). Les valeurs du baromètre restent des données
d'illustration en attendant celles du secrétariat — voir
`docs/roadmap-post-mvp.md`, vague 2.

### 5. Tâches planifiées

`convex/crons.ts` déclare `event-reminders`, quotidien à 07:00 UTC, sur **le
déploiement où il tourne**. En production il enverra donc de **vrais** e-mails
dès le premier jour : vérifier `AUTH_EMAIL_FROM` et l'authentification du domaine
expéditeur (SPF/DKIM chez le fournisseur) avant la bascule, pas après.

### 6. CI / tests E2E — indépendant de cette bascule

Le secret de dépôt `CONVEX_DEPLOY_KEY` qui fait tourner
`.github/workflows/e2e.yml` doit être une clé de **préversion** (*Generate
preview deploy key*) : ni la clé de dev, ni celle de prod. Le workflow crée une
préversion jetable par pull request, y pose `AUTH_DEV_OTP=true` et la peuple —
toute la garantie de portée du fichier tient à ce type de clé. Tant que le
secret est absent, le job est **ignoré** (pas rouge), et les specs Playwright ne
s'exécutent nulle part.

---

## Checklist de bascule

- [ ] Déploiement prod créé, Cloud URL et HTTP Actions URL relevées
- [ ] `JWT_PRIVATE_KEY` et `JWKS` posées sur le déploiement prod (paire neuve)
- [ ] `SITE_URL` = domaine réel
- [ ] Fournisseur e-mail configuré (`AUTH_RESEND_KEY` + `AUTH_EMAIL_FROM`), domaine expéditeur authentifié
- [ ] `RECAPTCHA_SECRET_KEY` posée
- [ ] `AUTH_DEV_OTP` **vérifiée absente** (`npx convex env list --prod`)
- [ ] Variables de l'hébergement mises à jour, **puis redéploiement** (l'URL Convex est figée au build)
- [ ] Premier administrateur créé (§ 3) et connexion vérifiée de bout en bout
- [ ] Aucune donnée d'illustration en base
- [ ] Un envoi réel de code à usage unique reçu dans une vraie boîte
- [ ] Le cron de rappels vérifié sur un événement de contrôle avant qu'il ne touche de vrais inscrits
