# Déploiement

> **Périmètre de ce document.** Il couvre l'**amorçage de l'administrateur
> initial** sur un déploiement neuf (issue #47). La procédure complète —
> `convex deploy`, `sanity deploy`, Vercel, liste exhaustive des variables de
> production, plan de sauvegarde, rotation des secrets — reste à écrire
> (issue #19). Les deux sections cohabitent dans ce fichier : ajoutez la suite
> ici plutôt que dans un nouveau document.

## Amorçage de l'administrateur initial

### Le problème que cela résout

Sur un déploiement neuf, la table `users` est vide et **aucun chemin applicatif**
ne peut créer le premier administrateur — chacun suppose un compte privilégié
déjà en place :

| Chemin | Garde | Amorçage possible ? |
|---|---|---|
| `users.setRole` | `requireNetworkRole(ctx, 'admin')` | ❌ exige un admin existant |
| `users.inviteUser` | `requireNetworkRole(ctx, 'admin')` | ❌ idem |
| `organizations.reviewApplication` | modérateur, et n'accorde que `membre` | ❌ |
| `devAdmin.setRoleByEmail` | `AUTH_DEV_OTP === 'true'` | ⚠️ dev seulement — **jamais en production** (voir plus bas) |

`convex/bootstrap.ts` ferme ce cercle : c'est le chemin d'amorçage **de
production**, sans toucher à la surface de développement.

### La procédure

Prérequis : le code est déployé (`npx convex deploy`), donc la fonction
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
`/fr/connexion-otp`, demander un code à usage unique, le saisir. Le back-office
est alors accessible et les comptes suivants s'ouvrent depuis l'interface
(`users.inviteUser`, `users.setRole`) — plus jamais par la CLI.

L'étape 3 est une mesure d'hygiène, **pas** ce qui referme la porte : c'est la
garde « zéro admin » qui le fait (ci-dessous). Une variable oubliée sur le
déploiement ne rouvre donc rien.

### Pourquoi ce n'est pas une porte dérobée permanente

| Protection | Effet |
|---|---|
| `internalMutation` | hors API publique : invocable depuis le serveur ou la CLI, **jamais** par un client |
| Garde `BOOTSTRAP_ADMIN_EMAIL` | variable **dédiée**, indépendante d'`AUTH_DEV_OTP` : l'amorçage n'ouvre aucune autre surface |
| Correspondance de l'adresse | la variable et l'argument doivent concorder — pas de promotion d'une adresse arbitraire |
| Garde « zéro admin » | dès qu'un administrateur existe, la mutation est **inopérante** : elle ne sert qu'une fois, sur un déploiement neuf |
| Audit (`admin.bootstrapped`) | l'opération laisse une trace dans `auditLog`, sans acteur (elle vient de la CLI, pas d'un compte) |

Tests de ces gardes : `convex/bootstrap.test.ts`.

### Diagnostic

| Message | Cause | Correctif |
|---|---|---|
| `BOOTSTRAP_ADMIN_NOT_CONFIGURED` | `BOOTSTRAP_ADMIN_EMAIL` absente du déploiement visé | étape 1 — vérifier avec `npx convex env list --prod` |
| `BOOTSTRAP_EMAIL_MISMATCH` | l'adresse passée en argument diffère de la variable | comparer les deux (la casse et les espaces sont normalisés, le reste non) |
| `BOOTSTRAP_ALREADY_DONE` | un administrateur existe déjà | normal : l'amorçage ne sert qu'une fois. Passer par le back-office, ou si l'accès est perdu, promouvoir depuis un autre compte admin |
| `INVALID_EMAIL` | adresse mal formée | corriger la variable **et** l'argument |
| `Could not find function` | le code n'est pas déployé sur la cible | `npx convex deploy` d'abord |

### Reprise d'un déploiement dont l'accès admin est perdu

L'amorçage ne rejoue pas, et `users.setRole` refuse par construction de
rétrograder le dernier administrateur : un déploiement en service a donc
toujours au moins un compte admin. Si son **accès** est perdu (adresse e-mail
hors service), la voie normale reste le back-office depuis un autre compte
administrateur.

Si aucun administrateur n'est joignable, la seule sortie est de passer par le
tableau de bord Convex (onglet *Data*, table `users`) pour rendre la main à une
adresse contrôlée : soit corriger le champ `email` du compte admin, soit retirer
son `role` et rejouer la procédure d'amorçage ci-dessus, qui redevient possible
dès qu'il ne reste aucun admin. À réserver au dernier recours : cette
intervention n'est pas auditée par la plateforme — la tracer ailleurs.

## `AUTH_DEV_OTP` ne doit JAMAIS être défini en production

`AUTH_DEV_OTP` n'est pas un drapeau isolé : c'est l'interrupteur de **toute la
surface de développement**. Le poser en production, même quelques minutes, ouvre
simultanément :

| Effet | Fichier |
|---|---|
| **chaque code de connexion OTP écrit en clair** dans `devOtpCodes` | `convex/otp.ts` |
| un oracle relit ce code en clair (`latestDevCode`) | `convex/otp.ts` |
| injection de données de démonstration (annuaire, publications) | `convex/seed.ts`, `convex/seedPublications.ts` |
| 7 oracles de lecture cessent de renvoyer `null` (énumération d'adresses, corps des messages de contact) | `contact.ts`, `newsletter.ts`, `events.ts`, `eventReminders.ts`, `organizations.ts`, `youth.ts`, `mentorship.ts` |
| `sendEmail` journalise au lieu d'échouer quand aucun fournisseur n'est configuré | `convex/email.ts` |
| attribution de rôle par la CLI (`devAdmin.setRoleByEmail`) | `convex/devAdmin.ts` |

Le premier point est le plus grave : pendant toute la fenêtre d'activation,
**chaque code de connexion émis est lisible en base** — donc toute prise de
compte, administrateur compris.

Où le drapeau est légitime : déploiement de développement local, et préversions
Convex de la CI (`.github/workflows/e2e.yml`, qui le pose avec une clé de
préversion — incapable d'écrire en production). Nulle part ailleurs.

Vérification avant une mise en service :

```bash
npx convex env list --names-only --prod   # AUTH_DEV_OTP ne doit PAS y figurer
```

## Variables d'environnement du déploiement

Section à compléter (issue #19). Celles que la présente procédure concerne :

| Variable | Où | Rôle |
|---|---|---|
| `BOOTSTRAP_ADMIN_EMAIL` | déploiement Convex, **le temps de l'amorçage** | adresse autorisée à devenir le premier administrateur |
| `AUTH_DEV_OTP` | dev et préversions CI **uniquement** | ouvre la surface de développement — jamais en production |
