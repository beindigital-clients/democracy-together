# RAPPORT — module `auth` : authentification, sessions, rôles et accès

Testeur QA « humain » (Playwright piloté par l'interface, provisionnement par CLI Convex / ConvexHttpClient uniquement).
Scripts : `explore/auth/*.mjs` (bibliothèque `_lib.mjs`). Preuves : `explore-out/auth--<scenario>/` (captures numérotées, `journal.md`, `journal.json`, vidéo `.webm`).
Comptes : un par scénario, `auth_<scenario>@democracytogether.test`.

> Note de lecture des journaux : `INDEX.md` contient une première exécution ❌ de `auth--03` et de `auth--06` (défaut de mon harnais : le composant `input-otp` ne se remplit pas avec `fill()` répété ; attente de navigation manquante). Les dossiers ont été régénérés ; seule la dernière ligne de chaque scénario fait foi. Trois vérifications ❌ restantes dans les journaux sont des faux négatifs de mes regex, signalés ci-dessous (§2).

## 1. Périmètre couvert

| # | Scénario | Dossier | Résultat |
|---|----------|---------|----------|
| 1 | `/fr/inscription` et `/en/inscription` → adhésion ; lien « Rejoindre » de la connexion | `auth--01-inscription-redirect` | ✅ |
| 2 | Accès direct non connecté à 12 URL réservées (fr, en, sans préfixe) ; faux positifs `/fr/administration`, `/fr/espaces-verts`, `/fr/espace-membres`, `/fr/notificationss` ; langue inconnue `/xx/…` | `auth--02-acces-non-connecte` | ✅ |
| 3 | Connexion par code : code faux, code court, bon code, cookies, déconnexion, réutilisation de l'ancien code, nouveau code émis | `auth--03-otp-connexion` | ✅ |
| 4 | Connexion par code : e-mail vide, mal formé, inconnu vs connu (énumération), injections | `auth--04-otp-email-inconnu-malforme` | ⚠️ A-1 |
| 5 | Renvoi du code ×10 (`enforceSendRate`) | `auth--05-otp-renvoi-rate-limit` | ⚠️ A-4, A-5 |
| 6 | Connexion par mot de passe : champs vides, focus, Afficher/Masquer, mauvais mdp, e-mail inconnu, lien « sans mot de passe », retour, bon mdp | `auth--06-mdp-connexion` | ✅ |
| 7 | 7 mauvais mots de passe puis le bon ; connexion par code après blocage | `auth--07-mdp-essais-rapides` | ⚠️ A-2 |
| 8 | Mot de passe oublié complet : trop court, banni `motdepasse123`, répété `aaaaaaaaaaaaaa`, confirmation différente, code faux, succès, ancien refusé, nouveau accepté | `auth--08-reset-mdp` | ✅ |
| 9 | Mot de passe oublié : compte SANS mot de passe, e-mail inconnu, e-mail mal formé | `auth--09-reset-sans-mdp-et-inconnu` | ⚠️ A-3 |
| 10 | Session : reload, navigation accueil ↔ espace membre, notifications, espaces ; reprise dans un NOUVEAU navigateur via `storageState` | `auth--10-session-persistance`, `auth--10b-session-reprise` | ✅ |
| 11 | Déconnexion → cookies, en-tête, Précédent ×2, accès direct | `auth--11-deconnexion-precedent` | ⚠️ A-6 |
| 12 | Matrice rôles × 9 pages (visiteur, membre, moderateur, editeur, admin, compte hérité sans rôle) | `auth--12-roles-{visiteur,membre,moderateur,editeur,admin,herite}` | ⚠️ A-7, A-8 |
| 13 | Espace membre (membre) : contenu, cloche, dépôt, fil d'Ariane, espaces, déconnexion | `auth--13-espace-membre` | ✅ |
| 14 | Sécurité légère : code OTP d'une autre adresse, injections dans le code, cookies, `document.cookie`, localStorage, `GET /api/auth` | `auth--14-securite` | ✅ (+ A-2 bis) |
| 15 | Rejeu mobile (Pixel 7, `tap`) code + mot de passe ; rejeu anglais code + mot de passe | `auth--15-mobile-otp`, `auth--15-mobile-mdp`, `auth--15-en-otp`, `auth--15-en-mdp` | ✅ (+ A-9) |

26 dossiers de preuve (dont 2 réexécutions), 302 vérifications automatiques dans les journaux finaux : 291 ✅, 11 ❌ — dont 5 faux négatifs de regex (4 × « dépôt formulaire » des rôles membre/moderateur/editeur/admin, 1 × localStorage) et 6 qui matérialisent les anomalies A-1, A-2, A-4, A-5 ci-dessous.

## 2. Tableau des vérifications par fonctionnalité

| Fonctionnalité | Vérification | Résultat | Preuve |
|---|---|---|---|
| Inscription | `/fr/inscription` → `/fr/adhesion` (200, page rendue) ; `/en/inscription` → `/en/adhesion` | ✅ | 01/01, 01/02 |
| Gating serveur | 12 URL réservées → 307 `Location: /<locale>/connexion` avant tout rendu (`context.request`) ; langue conservée en `/en/…` ; sans préfixe → `/fr/connexion` | ✅ | 02/journal |
| Gating serveur | Faux positifs `/fr/administration`, `/fr/espaces-verts`, `/fr/espace-membres`, `/fr/notificationss` → 404, pas de redirection | ✅ | 02/03 |
| Gating serveur | `/xx/espace-membre` → 404 propre (pas de page blanche) | ✅ (cosmétique A-10) | 02/04 |
| OTP | Bon code → `/fr/espace-membre`, bouton Déconnexion, cookies `__convexAuthJWT` + `__convexAuthRefreshToken` HttpOnly, SameSite=Lax, Path=/ | ✅ | 03/06 |
| OTP | Code faux → « Code invalide ou expiré. », reste sur l'étape code, adresse conservée | ✅ | 03/03 |
| OTP | Code de 3 chiffres → validation locale « Le code comporte 6 chiffres. », pas d'appel serveur | ✅ | 03/04 |
| OTP | Ancien code réutilisé après déconnexion → refusé ; nouvelle demande émet un code différent | ✅ | 03/08 |
| OTP | Code expiré (15 min) | ⏳ non testé (§4) | — |
| OTP | E-mail vide / mal formé → « Saisissez une adresse e-mail valide. », pas d'appel serveur | ✅ | 04/01, 04/02 |
| OTP | E-mail inconnu → message compréhensible | ❌ **A-1** (« Une erreur est survenue. Réessayez. ») | 04/03 |
| OTP | Réponse identique pour e-mail connu et inconnu (anti-énumération) | ❌ **A-1** | 04/03 vs 04/04 |
| OTP | Injections dans le champ e-mail (`<script>`, `"><img…`, `' OR 1=1`, 300 caractères) → aucune erreur JS, refus propre | ✅ | 04/05 |
| OTP | Plafond d'envoi : 8 envois passent, 9e et 10e refusés (`RATE_LIMITS.otpSend`) | ✅ | 05/journal |
| OTP | Message du refus au 9e envoi | ❌ **A-4** (générique) | 05/02 |
| OTP | Bouton « Renvoyer le code » sur l'étape code | ❌ **A-5** (absent) | 05/03 |
| Mot de passe | Champs vides → deux erreurs de champ + focus sur l'e-mail | ✅ | 06/02 |
| Mot de passe | Afficher/Masquer : `type` bascule, `aria-label` bascule, `aria-pressed` | ✅ | 06/03 |
| Mot de passe | Mauvais mdp → « E-mail ou mot de passe incorrect. », e-mail conservé | ✅ | 06/04 |
| Mot de passe | E-mail inconnu + mdp → même message (pas d'énumération par ce chemin) | ✅ | 06/05 |
| Mot de passe | Lien « Se connecter sans mot de passe » → `/fr/connexion-otp` ; « Retour à la connexion » → `/fr/connexion` | ✅ | 06/06 |
| Mot de passe | Bon mdp → espace membre | ✅ | 06/07 |
| Mot de passe | 5 échecs/h : le bon mot de passe est refusé après 7 échecs (plafond actif) | ✅ | 07/04 |
| Mot de passe | L'utilisateur bloqué est informé qu'il doit patienter | ❌ **A-2** | 07/04 |
| Mot de passe | La connexion par code reste ouverte pendant le blocage mdp (compteurs séparés) | ✅ | 07/05 |
| Reset | Lien « Mot de passe oublié ? » → `/fr/mot-de-passe-oublie` ; compte avec mdp → étape « Nouveau mot de passe » | ✅ | 08/02 |
| Reset | Politique : trop court (12), `motdepasse123` (trop courant), `aaaaaaaaaaaaaa` (trop courant), confirmation différente — messages sous le bon champ | ✅ | 08/03, 08/04, 08/05 |
| Reset | Code faux → « Code invalide ou expiré. » | ✅ | 08/06 |
| Reset | Succès → connecté ; ancien mdp refusé ; nouveau accepté | ✅ | 08/07–09 |
| Reset | Compte provisionné sans mot de passe → message utile | ❌ **A-3** | 09/02 |
| Reset | E-mail inconnu → pas de plantage (400 + message générique) ; mal formé → validation locale | ✅ | 09/03, 09/04 |
| Session | Reload, navigation, cloche, `/fr/notifications`, `/fr/espaces` accessibles connecté | ✅ | 10/05–09 |
| Session | Nouveau navigateur + `storageState` → toujours connecté, e-mail affiché | ✅ | 10b/01 |
| Déconnexion | Cookies vidés, en-tête revient à « Connexion », accès direct → `/fr/connexion` | ✅ | 11/02, 11/05 |
| Déconnexion | Précédent ×2 : aucun contenu membre réaffiché | ✅ (mais **A-6** : URL incohérente) | 11/03, 11/04 |
| Rôles | visiteur / hérité : espace membre « Rôle visiteur », bloc « Devenez membre », pas de lien admin ; dépôt → « réservé aux membres validés » ; 9 pages admin → 403 « Accès réservé » | ✅ | 12-visiteur/*, 12-herite/* |
| Rôles | Compte hérité (`clearRoleByEmail`) apparaît comme visiteur | ✅ | 12-herite/01 |
| Rôles | membre : « Mes contributions », formulaire de dépôt, admin → 403 | ✅ (le ❌ « dépôt formulaire » du journal est un faux négatif de regex : capture 12-membre/02 montre le formulaire) | 12-membre/02, 12-membre/03 |
| Rôles | moderateur / editeur : tableau de bord, candidatures, publications, contact OK ; utilisateurs, journal, modération IA → « Réservé aux administrateurs. » | ✅ (**A-8** cosmétique) | 12-moderateur/04, 05, 08 |
| Rôles | admin : les 9 pages accessibles, lien « Espace d'administration » | ✅ | 12-admin/* |
| Rôles | Rôle affiché traduit dans l'espace membre | ❌ **A-7** (« membre », « admin » bruts, aussi en anglais) | 12-admin/01, 15-en-mdp/04 |
| Espace membre | Bienvenue + e-mail, e-mail/rôle, liens, « Mes contributions » vide + CTA, cloche → notifications (état vide propre), dépôt → formulaire, fil d'Ariane, espaces, déconnexion | ✅ | 13/* |
| Sécurité | Code OTP émis pour B refusé pour A | ✅ | 14/01 |
| Sécurité | Injections dans le champ code (`<script>`, chiffres arabes, chiffre pleine chasse…) → refus propre, aucune erreur de page | ✅ | 14/02 |
| Sécurité | Plafond 5 échecs/h sur la vérification du code : le bon code est refusé après 7 mauvais | ✅ (message : **A-2 bis**) | 14/03 |
| Sécurité | `document.cookie` n'expose aucun jeton ; localStorage ne contient qu'un horodatage `__convexAuthServerStateFetchTime_*` (le ❌ du journal est un faux positif de ma regex `token`) ; `GET /api/auth` → 405 | ✅ | 14/journal |
| Sécurité | Attribut `Secure` des cookies | ⚠️ `false` sur `http://localhost` — attendu (`@convex-dev/auth/dist/nextjs/server/cookies.js` force `secure: !isLocalhost`), à vérifier en HTTPS | 03/journal |
| Mobile | Connexion par code et par mdp, pas de débordement horizontal, « Déconnexion » atteignable via le menu | ✅ (**A-9**) | 15-mobile-*/ |
| Anglais | Libellés `Email`, `Password`, `Sign in`, `Get a code`, `Enter the code`, `Verification code`, `Show password`, `Sign in without a password`, `Incorrect email or password.`, `Member area`, `Sign out` ; `/en/espace-membre` | ✅ | 15-en-*/ |

## 3. Anomalies

### Bloquant
Aucune. Aucune page blanche, aucune erreur de page (`pageerror`), aucun 500 ; toutes les frontières (HTTP 307 pour les non-connectés, 403 UI pour les rôles insuffisants, RBAC serveur) tiennent.

### Majeur

**A-1 — Énumération des comptes par la connexion par code (et par « Mot de passe oublié »)**
- Repro : `/fr/connexion-otp` → e-mail `auth_inconnu_zzz@democracytogether.test` → « Recevoir un code ». Puis même chose avec un compte existant.
- Attendu : réponse identique (passage à l'étape « Saisissez le code », ou message neutre « Si un compte existe, un code a été envoyé »).
- Constaté : e-mail inconnu → `POST /api/auth` 400 et « Une erreur est survenue. Réessayez. » sans quitter l'étape e-mail ; e-mail connu → étape code. Un script distingue donc en une requête les adresses membres du réseau (des représentants d'organisations, cf. profil de menace de `convex/lib/passwordPolicy.ts`). Le même oracle existe sur `/fr/mot-de-passe-oublie` (compte avec mot de passe → étape 2 ; sinon erreur — 09/02, 09/03). Le message est de surcroît faux pour un humain qui s'est trompé d'adresse : « Réessayez » ne l'aidera pas.
- Preuves : `auth--04-otp-email-inconnu-malforme/03-email-inconnu.png` vs `04-email-connu.png` ; journal : « inconnu→étape code=false, connu→étape code=true ».
- Cause probable : `@convex-dev/auth` appelle `upsertUserAndAccount` dès `createVerificationCode` (`node_modules/@convex-dev/auth/dist/server/implementation/mutations/createVerificationCode.js` l. 26), donc le callback `createOrUpdateUser` de `convex/auth.ts` → `resolveSignInUserId` (`convex/lib/signIn.ts`) lève `NO_SELF_SIGNUP` **à l'envoi**, pas à la vérification. `src/app/[locale]/connexion-otp/page.tsx` (`onEmail`, `catch → errorGeneric`) et `mot-de-passe-oublie/page.tsx` (`onRequest`) affichent alors l'erreur. Piste : dans `onEmail`/`onRequest`, passer à l'étape code quelle que soit la réponse (le code n'existe pas, la vérification échouera de façon indistinguable) et/ou un message neutre.

**A-2 — Blocage anti-force-brute silencieux : le BON mot de passe (ou le BON code) est refusé avec un message qui dit le contraire**
- Repro : `/fr/connexion`, 5 mauvais mots de passe, puis le bon (07). Idem `/fr/connexion-otp` : 5 codes faux puis le bon (14).
- Attendu : « Trop de tentatives, réessayez dans quelques minutes » (le crédit se reconstitue en 12 min).
- Constaté : « E-mail ou mot de passe incorrect. » (07/04) et « Code invalide ou expiré. » (14/03) alors que la saisie est juste. L'utilisateur va croire son mot de passe faux, partir dans « Mot de passe oublié » (et là encore consommer des codes), ou redemander des codes jusqu'au plafond A-4.
- Preuves : `auth--07-mdp-essais-rapides/04-bon-mdp-apres-blocage.png`, journal (RES 400 au 8e essai avec le bon mdp) ; `auth--14-securite/03-a-connecte-ou-bloque.png`.
- Cause : `retrieveAccountWithCredentials.js` renvoie `TooManyFailedAttempts`, `verifyCodeAndSignIn.js` renvoie `null` ; la route `/api/auth` aplatit tout en `Response(null, {status: 400})` (constat déjà documenté dans `convex/lib/passwordPolicy.ts`), et `src/app/[locale]/connexion/page.tsx` / `connexion-otp/page.tsx` mappent tout `catch` sur `errorSignIn` / `errorCode`. Piste : lire `statusText` de la réponse (la lib y met `error.data`) ou compter côté client et adapter le message après le 5e échec.

**A-3 — Un membre invité (sans mot de passe) est dans une impasse : « Mot de passe oublié » répond « Une erreur est survenue. Réessayez. » et rien ne lui permet d'en définir un**
- Repro : compte provisionné (`setRoleByEmail`, comme une invitation) → `/fr/mot-de-passe-oublie` → son adresse → « Envoyer le code ».
- Attendu : soit un écran pour définir un premier mot de passe, soit un message « Aucun mot de passe n'est défini pour ce compte : connectez-vous par code (lien) ».
- Constaté : 400 + « Une erreur est survenue. Réessayez. » (09/02). L'espace membre ne propose aucun réglage de mot de passe (13/01 ; `src/` ne contient aucun `flow: 'signUp'`, cf. commentaire de `tests/e2e/_helpers.ts#provisionPassword` : « l'e-mail d'invitation promet "vous pourrez en définir un depuis votre espace membre" — cet écran n'existe pas »).
- Preuve : `auth--09-reset-sans-mdp-et-inconnu/02-compte-sans-mdp.png`.
- Cause : `signIn('password', {flow: 'reset'})` → `retrieveAccount` → `InvalidAccountId` (pas de ligne `authAccounts` provider `password`), `mot-de-passe-oublie/page.tsx` `catch → errorGeneric`.

### Mineur

**A-4 — Plafond de renvoi de code atteint : message contradictoire « Une erreur est survenue. Réessayez. »**
- Repro : 9 fois `/fr/connexion-otp` → même adresse → « Recevoir un code ».
- Constaté : le 9e envoi est bien refusé (plafond 8/h respecté), mais l'écran invite à réessayer, ce qui est exactement l'inverse. Preuve : `auth--05-otp-renvoi-rate-limit/02-refus-envoi-9.png`. Cause : `ConvexError('RATE_LIMITED')` de `convex/otp.ts#enforceSendRate` aplati par `/api/auth`, `connexion-otp/page.tsx` → `errorGeneric`. Un libellé `auth.rateLimited` existe déjà pour d'autres formulaires (`library.rateLimited`).

**A-5 — Pas de bouton « Renvoyer le code » sur l'étape « Saisissez le code »**
- Constaté : l'utilisateur qui n'a rien reçu doit recharger la page et retaper son adresse (05/03 ; `connexion-otp/page.tsx`, étape `code`, ne rend que le champ et « Se connecter »). Même absence sur l'étape reset.

**A-6 — Après « Déconnexion », l'URL reste `/fr/espace-membre` en affichant le formulaire de connexion ; « Précédent » atterrit sur `/fr/connexion?_rsc=…`**
- Repro : connecté sur `/fr/espace-membre` → Déconnexion → attendre 3 s → Précédent.
- Constaté : capture 11/02 = formulaire « Se connecter » avec `page.url()` = `/fr/espace-membre` ; après Précédent, URL `http://localhost:3000/fr/connexion?_rsc=8ckw6v4MOYt2Zntj` (paramètre interne de Next visible dans la barre d'adresse, capture 11/03). Rien de sensible n'est réaffiché (✅ sécurité), mais l'historique est incohérent et l'URL partagée serait fausse.
- Cause probable : `src/components/auth/auth-gate.tsx#RedirectToSignIn` (`router.replace('/connexion')` 1,2 s après `Unauthenticated`) combiné au `signOut()` de `auth-button.tsx` qui ne navigue pas lui-même ; la navigation RSC déclenchée pendant la mise à jour d'état laisse l'entrée d'historique avec l'URL de prefetch. Piste : faire naviguer explicitement `signOut` vers `/` ou `/connexion`.

**A-7 — Le rôle est affiché brut et non traduit dans l'espace membre**
- Constaté : « Rôle membre », « Rôle admin », « Rôle visiteur » (12-admin/01, 12-herite/01) et en anglais « Role membre » (15-en-mdp/04), alors que `admin.role_membre` = « Membre » / « Member » existe. Cause : `src/app/[locale]/espace-membre/page.tsx` rend `{me?.role}` tel quel.

**A-8 — Refus « Réservé aux administrateurs. » sans titre de page sur `/fr/admin/utilisateurs` et `/fr/admin/journal` (modérateur, éditeur)**
- Constaté : une ligne de texte seule, `h1` absent (12-moderateur/04, 05), alors que `/fr/admin/moderation-ia` garde son titre au-dessus du même message (12-moderateur/08) et que `/fr/admin` (visiteur) a un vrai écran 403 (12-visiteur/03). Cause : `src/app/[locale]/admin/utilisateurs/page.tsx` l. 189 et `admin/journal/page.tsx` l. 82 retournent le `<p>` seul.

**A-9 — Mobile : la cloche « Notifications » n'est ni dans la barre ni dans le menu**
- Constaté (15-mobile-otp/06 : menu ouvert, connecté) : « Espace membre · Déconnexion · FR · thème » — pas d'entrée Notifications, alors que sur bureau la cloche est dans l'en-tête (10/06). Un membre mobile n'accède aux notifications que par URL. (Concerne `src/components/layout/mobile-nav.tsx` ; frontière avec le module navigation.)

### Cosmétique

**A-10 — Les 404 des faux positifs (`/fr/administration`, `/fr/espaces-verts`) et de `/xx/…` rendent la page 404 racine** : bilingue FR+EN, police système, sans en-tête ni pied de page (02/03, 02/04), alors que des libellés `errors.notFoundTitle/Body/Home` traduits existent. Hors gating (qui est correct), mais c'est ce que voit un visiteur qui tape une URL fausse.

**A-11 — Débordement horizontal sur `/fr/admin/candidatures` à 1280 px** : `h2.font-display.text-lg right=1447` (12-moderateur/12-editeur/12-admin, journal l. 43) — un nom d'organisation long sans espace, issu des données d'un autre module, n'est pas coupé (`overflow-wrap`). À rattacher au module admin.

**A-12 — Bruit console** : chaque refus d'authentification produit « Failed to load resource: 400 » (30 occurrences sur la campagne) ; inévitable avec `/api/auth`, mais à connaître avant de lire les journaux d'autres modules.

## 4. Non testé et pourquoi
- **Code OTP expiré** (`maxAge` 15 min) : aurait immobilisé le navigateur partagé 15 min ; seule la réutilisation d'un code consommé a été vérifiée (03/08).
- **Attribut `Secure` des cookies** : la bibliothèque le désactive sur `localhost` ; à contrôler sur l'URL HTTPS de préproduction.
- **Envoi réel des e-mails** (Resend absent, adresses `.test`) : seuls les codes en base (`otp:latestDevCode`) ont été lus.
- **reCAPTCHA** (`RECAPTCHA_DISABLED=true`) : non concerné par ces écrans, non exercé.
- **Locales es/pt/ar et thème sombre** sur les écrans d'auth : hors consigne (fr + en, clair) ; ar (RTL) mériterait un passage sur le champ code à six cases.
- **Écran de définition d'un premier mot de passe** : n'existe pas (A-3) — les mots de passe ont été posés par l'API, comme `tests/e2e/_helpers.ts`.
- **Verrouillage de session par rotation du refresh token** (deux navigateurs sur le même jeton) : volontairement évité (README) ; la reprise `storageState` a été jouée après fermeture du premier contexte.
