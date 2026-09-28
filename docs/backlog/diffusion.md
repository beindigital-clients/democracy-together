# Chantier « diffusion » — newsletter, recherche, mesure d'audience

Fiches : **F-18** (inscription newsletter, double opt-in), **F-65** (campagnes :
envoi en volume), **F-06 / F-34** (recherche globale et plein texte),
**F-66** (mesure d'impact : audience web).

## 1. Ce qui est livré

### F-18 — Double opt-in

- L'inscription (`newsletter.subscribe`, action publique gardée par reCAPTCHA)
  crée un abonné **en attente** (`status: 'pending'`) et planifie l'envoi d'un
  courriel de confirmation (`newsletter.sendConfirmation`). La réponse publique
  est **identique** dans tous les cas (nouvelle adresse, attente, abonné
  confirmé) : pas d'oracle d'existence (`convex/existence-oracle.test.ts`).
- **Jeton** : 256 bits, tiré DANS l'action d'envoi, jamais passé en argument
  planifié ; seule son empreinte SHA-256 est stockée (`confirmTokenHash`).
  Usage unique (effacé à la confirmation), expirant (48 h), et un nouveau lien
  remplace le précédent.
- **Page de confirmation** `/<langue>/newsletter/confirmation?token=…` : le
  lien du courriel porte la langue de l'abonné. `noindex`, crawlable.
- **Renvoi borné** : se réinscrire avec une adresse en attente renvoie le lien,
  au plus 3 fois par attente et jamais deux fois en 10 minutes
  (`lib/newsletterOptIn.ts`), en plus des plafonds par IP / formulaire / adresse.
- **Purge planifiée** (cron horaire `newsletter-purge-pending`) des attentes
  expirées, et de la boîte d'envoi de développement (> 24 h).
- **Preuve du consentement** conservée sur l'abonnement (`consent`) : date,
  formulaire source (`home`, `newsletter-page`, `footer`, `legacy`, `other`),
  langue, version du texte d'information (`CONSENT_TEXT_VERSION`). Visible au
  back-office (liste paginée des abonnés, recherche d'une adresse exacte).
- **Seuls les confirmés** reçoivent les campagnes et sont comptés
  (`COUNTER.NEWSLETTER_SUBSCRIBERS`).
- Sans fournisseur d'e-mail (production sans `AUTH_RESEND_KEY`), l'inscription
  est **refusée** (`EMAIL_PROVIDER_NOT_CONFIGURED`, message « momentanément
  indisponible ») — même refus pour toute adresse.

### F-65 — Envoi en volume

- `sendCampaign` passe la campagne en `sending` puis planifie la **mise en
  file** (`_enqueue`, pages de 500 abonnés confirmés, une ligne
  `newsletterDeliveries` par destinataire, idempotente) et la **livraison par
  lots** (`_processBatch`, boucle planifiée).
- **API batch de Resend** (`POST /emails/batch`, 100 courriels au plus) avec en-tête
  `Idempotency-Key` par lot ; les autres fournisseurs et le mode simulé
  retombent sur l'envoi unitaire (`email.sendEmailBatch`).
- **Statut par destinataire** : `queued` / `sending` / `sent` / `failed` /
  `skipped` (abonné parti entre la mise en file et l'envoi).
- **Reprise sans double envoi** : un lot interrompu (action coupée) est repris
  à l'échéance de son bail (5 min) avec le **même `claimId`**, donc la même clé
  d'idempotence ; un échec transitoire (réseau, 429, 5xx) est rejoué de même
  avec recul exponentiel, puis passe en échec après 3 tentatives. « Relancer
  les échecs » (`retryFailedDeliveries`) ne remet en file que les `failed` :
  un `sent` n'est jamais renvoyé.
- **Débit configurable** : `NEWSLETTER_BATCH_SIZE` (défaut 50, ≤ 100) et
  `NEWSLETTER_RATE_PER_MINUTE` (défaut 600) ; lus à chaque lot — modifier la
  variable ralentit une campagne en cours.
- **Désinscription** : lien dans le pied de chaque envoi, et en-têtes
  `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
  pointant `https://<CONVEX_SITE_URL>/newsletter/unsubscribe` (POST = désinscription
  en un clic, RFC 8058 ; GET = redirection vers la page dans la langue de
  l'abonné — pas de désinscription sur GET, les antivirus pré-chargent les liens).
  `NEWSLETTER_UNSUBSCRIBE_MAILTO` (facultatif) ajoute une adresse `mailto:`.
- **Version par langue avec repli** : langue de référence + versions traduites
  (`upsertCampaignVariant`) ; chaque abonné reçoit la version de sa langue, à
  défaut la référence.
- **Envoi de test à soi-même** (`sendTestCampaign`) : toutes les versions vers
  l'adresse du compte éditeur, objet préfixé « [TEST] ».
- **Progression en direct** dans `/admin/newsletter` (barre, envoyés / en échec
  / ignorés, motifs d'échec), journal d'audit sur envoi, test et relance.
- Sans fournisseur : envoi, test et relance **refusés** et annoncés (inchangé).

### F-06 / F-34 — Recherche sur index

- Index plein texte Convex `search_text` sur `publications`, `organizations`,
  `tribunePosts`, sur un champ **plié** `searchText` (minuscules, sans accents,
  ponctuation retirée — `lib/searchText.ts`), tenu à l'écriture (dépôt de
  publication, seeds, approbation d'adhésion, billet de Tribune, correction
  dev). La requête est repliée par la même fonction : « democratie » trouve
  « démocratie ».
- **Filtres en `filterFields`** : type, thème, langue (`searchLang` = langue
  principale d'une publication, `lang` d'un billet), région, année (`year`,
  `searchYear`). Un filtre qu'une source ne porte pas l'exclut des résultats.
- **Visibilité** : chaque source fixe son statut public (`published`,
  `active`) DANS la lecture d'index — un brouillon, une attente, une fiche
  suspendue ou un billet retiré ne sortent jamais.
- **Pagination** : `search.searchBySource` (curseur) ; la page `/recherche`
  propose une vue d'ensemble (8 résultats par section) et une vue par section
  paginée, filtres dans l'URL (rendu serveur, sans JavaScript).
- Experts : source **dérivée** des auteurs des publications publiées (pas de
  table), via l'index des publications.

### F-66 — Mesure d'audience first-party

- Balise client `AudienceBeacon` (layout racine) → mutation publique
  `audience.hit` → tampon `audienceEvents` → agrégation par jour
  (`audience.aggregate`, cron toutes les 5 min) dans `audienceDaily` →
  **suppression des événements bruts**. Rétention des agrégats : cron quotidien
  `audience-purge`.
- Tableau de bord dans `/admin/impact` (modérateur+) : pages vues par jour,
  par langue, par classe d'écran, pages les plus vues, contenus les plus
  consultés, sites référents ; périodes 7 / 30 / 90 jours.
- Politique de confidentialité : sections « Mesure d'audience » et « Lettre
  d'information » (espace `privacy`, 5 langues) et réglage d'opposition ; le
  paragraphe « Cookies et traceurs » de `lib/legal-content.ts` renvoie vers
  elles ; le bandeau cookies est mis à jour.

## 2. Registre de la recherche — brancher une nouvelle source

Le registre est `convex/lib/searchSources.ts`. `convex/search.ts`, la palette
et la page `/recherche` n'ont AUCUNE ligne propre à une table : elles rendent
toute source du registre, dans l'ordre de `SEARCH_SOURCES`.

Pour ajouter une table de contenu (événements, replays…) :

1. **Schéma** : dans la table, `searchText: v.optional(v.string())` (+ un champ
   d'année si le filtre « date » a un sens) et
   `.searchIndex('search_text', { searchField: 'searchText', filterFields: ['status', …] })`.
   Le champ de statut public DOIT être un `filterField`.
2. **Meule** : une fonction dans `convex/lib/searchText.ts`
   (`buildSearchText([...champs])`), appelée à CHAQUE écriture du texte
   (insertion ET correction).
3. **Registre** : la clé dans `SEARCH_SOURCES`, et une entrée `SOURCES.<clé>` :
   `filters` (ceux que la source honore), `search` qui lit l'index en fixant le
   statut public (`.eq('status', 'published')`) puis projette en
   `SearchHit` (`path` = chemin public sans préfixe de langue).
4. **Migration** : ajouter la table à `convex/searchIndexing.ts` (`TABLES` et
   une branche de recalcul), puis `npx convex run searchIndexing:backfill`.
5. **Libellé** : `search.section_<clé>` dans les 5 catalogues (et, si utile, un
   cas dans `hitMeta` de `src/lib/search.ts` pour la mention à droite).
6. **Test** : un cas « brouillon jamais trouvé » dans
   `convex/diffusion-search.test.ts`.

## 3. Migrations à lancer après déploiement (contexte de confiance)

```bash
# 1. Meules de recherche des documents existants (idempotent, par pages)
npx convex run searchIndexing:backfill '{}'
# 2. Compteur d'abonnés : désormais les CONFIRMÉS seulement
npx convex run counters:recompute '{"key":"newsletterSubscriptions"}'
# 3. Abonnés hérités (après avoir posé AUTH_RESEND_KEY) — cf. § 4
npx convex run newsletter:migrateLegacySubscribers '{}'
```

## 4. Abonnés existants — décision RGPD

**Décision : ils ne sont PAS réputés confirmés ; ils reçoivent UNE demande de
confirmation, et sans réponse sous 30 jours leur adresse est supprimée.**

Justification :

- Le RGPD impose au responsable de traitement de **pouvoir démontrer** le
  consentement (art. 7.1 ; CNIL, prospection électronique). L'ancien
  formulaire enregistrait toute adresse saisie, sans vérification : c'est
  précisément ce que le cadrage (§ 2.15, « double opt-in ») corrige, et
  l'oracle d'existence refermé en F-09 montre que des tiers pouvaient y saisir
  n'importe quelle adresse. Pour les inscriptions héritées, l'association n'a
  donc ni la preuve que la personne derrière l'adresse a consenti, ni la trace
  du formulaire ou du texte d'information.
- Les considérer confirmées reviendrait à maintenir des envois dont le
  fondement ne peut pas être démontré ; une relance unique, présentée comme la
  mise à niveau de la protection des données de l'abonné (le courriel dit
  pourquoi on écrit), est le moyen proportionné de régulariser — et elle ne
  constitue pas de la prospection : elle porte sur un abonnement existant.
- Enjeu faible : la base actuelle est de taille réduite (plateforme en
  recette). Une relance aujourd'hui coûte peu ; une campagne adressée à des
  consentements non démontrables coûterait davantage.

Mise en œuvre : `status` absent = hérité. Tant que la migration n'a pas tourné,
un héritier **ne reçoit pas** les campagnes (il n'est pas `confirmed`) et n'est
pas compté. `migrateLegacySubscribers` (refusée sans fournisseur, pour ne pas
faire expirer des abonnés jamais prévenus) les passe en attente avec
`consent.source = 'legacy'` (date = inscription d'origine), un délai de 30
jours, et étale l'envoi au débit configuré. Un héritier qui se réinscrit de
lui-même exprime un consentement neuf, traité comme une inscription.

## 5. Mesure d'audience — conditions d'exemption CNIL et paramètres

Référence : lignes directrices et recommandation « cookies et autres
traceurs » (délibérations 2020-091 et 2020-092), exemption de consentement de
la mesure d'audience. Conditions tenues :

| Condition | Mise en œuvre |
|---|---|
| Finalité strictement limitée à la mesure d'audience du site, pour le compte exclusif de l'éditeur | outil first-party (Convex de l'association), aucun tiers, aucun autre usage |
| Données statistiques anonymes / agrégées | seuls les compteurs par jour sont conservés ; événements bruts supprimés à l'agrégation (≤ 5 min + reprise) |
| Pas de recoupement, pas de suivi entre sites ou d'une visite à l'autre | aucun cookie, aucun identifiant, aucune empreinte de navigateur ; le référent est réduit au domaine, l'écran à 3 classes, le chemin perd sa requête |
| Pas d'IP stockée | l'anti-abus n'utilise qu'une empreinte SHA-256 salée du bloc d'adresses, clé d'une fenêtre d'une minute purgée sous 5 min ; le sel est tiré chaque jour et l'ancien écrasé |
| Information et droit d'opposition | politique de confidentialité (5 langues) ; opposition par Do Not Track / Global Privacy Control, par « Essentiels uniquement » du bandeau, ou par le réglage de la politique — la balise n'envoie alors rien |
| Durée de conservation limitée | agrégats : `AUDIENCE_RETENTION_DAYS` (défaut 395 j ≈ 13 mois, borné entre 30 j et 25 mois) |

Paramètres (variables Convex, toutes facultatives) :

| Variable | Défaut | Rôle |
|---|---|---|
| `AUDIENCE_RETENTION_DAYS` | 395 | rétention des agrégats quotidiens |
| `AUDIENCE_MAX_HITS_PER_MINUTE` | 3000 | plafond global du point d'entrée (réparti sur 16 compteurs) |
| (fixe) 60 / min | — | plafond par bloc d'adresses |
| (fixe) 100 pages, 50 référents / jour | — | cardinalité ; le surplus va dans « (autres) » |

Espaces jamais mesurés : `/admin`, `/espace-membre`, tunnels de connexion.

## 6. Variables d'environnement (récapitulatif)

| Variable | Où | Rôle |
|---|---|---|
| `AUTH_RESEND_KEY` | Convex | fournisseur ; sans elle, inscription, envoi, test et relance sont refusés (sauf `AUTH_DEV_OTP=true`, envoi simulé) |
| `AUTH_EMAIL_FROM` | Convex | expéditeur (existant) |
| `SITE_URL` | Convex | liens des courriels (confirmation, désinscription) ; hôte propre exclu des référents |
| `CONVEX_SITE_URL` | Convex (fourni par la plateforme) | cible `List-Unsubscribe` one-click |
| `NEWSLETTER_BATCH_SIZE`, `NEWSLETTER_RATE_PER_MINUTE` | Convex | débit d'envoi |
| `NEWSLETTER_UNSUBSCRIBE_MAILTO` | Convex | adresse `mailto:` facultative de `List-Unsubscribe` |
| `AUDIENCE_RETENTION_DAYS`, `AUDIENCE_MAX_HITS_PER_MINUTE` | Convex | § 5 |

Pour l'E2E : `AUTH_DEV_OTP=true` (le lien de confirmation est lu dans la table
`devOutbox`, jamais alimentée hors de ce mode) et `RECAPTCHA_DISABLED=true`.

## 7. Limites connues

- **Bibliothèque et annuaire** (`publications.listPublished`,
  `organizations.listDirectory`) gardent leur lecture complète : leurs facettes
  contextuelles se calculent sur tout l'ensemble publié, avec ou sans terme. La
  recherche GLOBALE, elle, passe par les index. À reprendre avec des compteurs
  de facettes dénormalisés au-delà de quelques milliers de documents.
- **Sémantique de l'index Convex** : correspondance par mots (préfixe sur le
  dernier mot), classement par pertinence, un mot au moins doit correspondre —
  une sous-chaîne au milieu d'un mot (« cratie ») ne trouve plus rien, là où
  l'ancienne recherche en mémoire la trouvait.
- Filtre **région** : vocabulaire des publications (afrique / europe /
  mondial) ; l'annuaire a un vocabulaire plus fin et n'est pas filtré par ces
  valeurs. Filtre **langue** d'une publication = sa langue principale.
- Filtre **date** = année (égalité d'index), pas de plage.
- **Actualités (Sanity)** : toujours filtrées en mémoire côté page, hors
  registre, et masquées dès qu'un filtre est actif.
- Reprise d'un lot passé en échec après 3 échecs TRANSITOIRES : la relance
  manuelle utilise une nouvelle clé d'idempotence ; si l'un des appels
  ambigus avait en réalité abouti, un doublon est possible (cas rare, documenté
  dans `convex/lib/newsletterDelivery.ts`).
- Pas de suivi d'ouverture ni de clic des campagnes (volontaire : ce serait un
  traceur soumis à consentement).
- La suppression de compte devra appeler `deleteUserDataDiffusion(ctx, userId)`
  (exportée par `convex/newsletter.ts`) — à brancher par l'orchestrateur.
