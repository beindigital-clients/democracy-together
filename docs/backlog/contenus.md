# Chantier « contenus » — F-52, F-54, F-62, F-64

Agenda, replays, partenaires, revue de presse, thématiques et médiathèque
étaient codés dans le dépôt : ajouter un webinaire demandait un développeur et
un déploiement. Ils sont désormais en base Convex, édités depuis
`/admin/contenus` au rang **éditeur**, et le contenu codé reste le **repli** des
pages publiques. Les URL publiques ne changent pas.

## Ce qui est livré

| Fiche | Livré |
|---|---|
| F-52 Agenda | Table `contentEvents` (type, région, format, thématique, langues, dates avec fuseau, lieu traduit, capacité, statut brouillon / publié / annulé, « à la une », visuel). Agenda public lu dans la table, filtres type / région / format / langue / **mois**, vue calendrier, export `.ics`. Passé / à venir décidé par la date. |
| F-53 (reprise) | Inscription validée **contre la table** (inconnu, brouillon, annulé, terminé → `EVENT_CLOSED` ; capacité atteinte → `EVENT_FULL`). Écran `/admin/evenements` (modérateur) : titres lus dans la table, **export CSV** par événement (mutation journalisée, cellules neutralisées contre l'injection de formule). |
| F-55 (reprise) | Rappels : slug validé contre la table, **date calculée côté serveur** (`startsAt`), l'argument `eventDate` est ignoré (pentest M-5 refermé). Un rappel d'un événement annulé ne part pas ; la date du courriel est formatée dans le fuseau du lieu. Les rappels en attente suivent un changement de date. |
| F-54 Webinaires | Lien de visioconférence **réservé aux inscrits** : jamais dans une requête publique ; `contenus/events:myVisioAccess` le rend au seul compte connecté dont l'adresse est inscrite (réactif, visible juste après l'inscription) ; tout inscrit le reçoit par courriel dans les 2 jours qui précèdent (cron quotidien existant, envoi unique `visioSentAt`). Table `contentReplays` : YouTube (domaine « nocookie »), Vimeo ou fichier vidéo https, lien validé contre sa plateforme, événement lié, thèmes, langues, vignette. |
| F-62 Gestion autonome | Back-office `/admin/contenus` : six écrans (événements, replays, partenaires, presse, thématiques, médiathèque) ; création, édition, publication / dépublication, annulation, suppression (brouillon), ordre (partenaires, thématiques), **langue de saisie** avec indicateur de langue manquante, **aperçu** public dans la langue choisie avec repli. Journal d'audit sur chaque geste (`content.*`, `media.*`, `event.registrations_exported`). |
| F-64 Médiathèque | Table `contentMedia` + stockage Convex. Types acceptés : PNG, JPEG, WebP, GIF (5 Mo), PDF (20 Mo) — **contenu réel relu** (octets de tête, comme la bibliothèque), SVG refusé ; dimensions lues ; tout fichier refusé est effacé. **Texte alternatif obligatoire** et traduisible, recherche (nom + textes alternatifs), sélecteur réutilisable (logo, visuel, vignette), **suppression refusée si le média est utilisé** (`MEDIA_IN_USE`). |

La **revue de presse** (`contentPress`) complète le kit média de `/presse`, qui
reste éditorial (texte codé) ; la section « Ils parlent de nous » n'apparaît
qu'à partir du premier article publié.

## Modèle de données (`convex/lib/tables/contenus.ts`)

Conventions communes : textes traduisibles `localizedText` (cinq clés
optionnelles `fr/en/es/pt/ar`, repli langue demandée → français → anglais →
première renseignée, `convex/lib/contenus/i18n.ts`) ; `status` en tête des
index publics (un brouillon ne sort jamais d'une requête publique) ;
`updatedAt` / `updatedBy` comme trace courante, l'historique étant au journal.

| Table | Champs clés | Index |
|---|---|---|
| `contentEvents` | `slug` (immuable), `type`, `region`, `format`, `theme`, `langs`, `title`/`summary`/`place` traduits, `startDate` + `startTime?` + `endDate?` + `endTime?` + `timezone` (saisie), `startsAt`/`endsAt` (UTC dérivés), `visioUrl?` (privé), `capacity?`, `status`, `featured?`, `imageMediaId?`, `durationMin?`, `cityKey?` | `by_slug`, `by_status_and_startsAt`, `by_imageMediaId` |
| `contentReplays` | `slug`, `title`/`description` traduits, `eventId?` + `eventSlug?` + `eventType?`, `videoKind?` + `videoUrl?`, `themes`, `langs`, `recordedOn`, `durationMin?`, `posterMediaId?`, `status` | `by_slug`, `by_status_and_recordedOn`, `by_eventId`, `by_posterMediaId` |
| `contentPartners` | `slug`, `name`/`kicker`/`summary`/`gives`/`gets` traduits, `logoMediaId?`, `url?`, `order`, `status` | `by_slug`, `by_status_and_order`, `by_logoMediaId` |
| `contentPress` | `title` (langue d'origine), `outlet`, `publishedOn`, `lang`, `url`, `excerpt?` traduit, `status` | `by_status_and_publishedOn` |
| `contentThemes` | `slug` (axe du réseau, immuable), `title`/`lead` traduits, `stance`/`questions` (listes traduites), `dimension?`, `order`, `status` | `by_slug`, `by_status_and_order` |
| `contentMedia` | `storageId`, `kind` (image / pdf), `contentType` (sniffé), `size`, `filename`, `alt` traduit, `width?`/`height?`, `searchText`, `uploadedBy?` | `by_kind`, `by_storageId`, recherche `search_text` (filtre `kind`) |

Table existante modifiée : `eventRegistrations.visioSentAt` (optionnel).

Fonctions : `convex/contenus/{events,replays,partners,press,themes,media,migration,devCleanup}.ts`
(API `api.contenus.<module>.*`), règles pures dans `convex/lib/contenus/`
(`i18n`, `time`, `media`, `validate`, `events`, `access`, `userData`,
`fixtures`), contenu codé dans `convex/lib/contenus/coded/` (source unique,
lue par la migration ET par le repli des pages via `@convex/*`).

## Migration du contenu codé — à lancer UNE fois par déploiement

```bash
npx convex run contenus/migration:importCodedContent '{}'          # dev
npx convex run --prod contenus/migration:importCodedContent '{}'   # production
```

- Importe 14 événements (publiés, fuseau du lieu), 4 replays (les
  rediffusions du catalogue, sans vidéo : « bientôt disponible »), 5 catégories
  de partenariat et 5 thématiques (titres de `library.themes.*`, synthèses) —
  mêmes slugs, mêmes textes dans les cinq langues, même ordre. Rien pour la
  presse (aucun contenu codé).
- **Idempotente** : un slug déjà présent n'est pas réécrit ; une relance ne
  crée aucun doublon et n'écrase pas une fiche modifiée par un éditeur. Elle
  rend le nombre de fiches créées (`{events, replays, partners, themes}`) ;
  l'import est journalisé (`content.imported`) quand il a écrit quelque chose.
- La CI (`.github/workflows/e2e.yml`) la lance après les seeds de la
  préversion.

**Ordre de mise en service** : déployer les fonctions, lancer l'import, puis
seulement ouvrir le back-office aux éditeurs. Tant que l'import n'est pas
lancé, les pages publiques servent le contenu codé (table vide → repli) **mais
les inscriptions et rappels sont refusés** (`EVENT_CLOSED`) : le serveur ne
connaît plus que la table.

## Repli des pages publiques (`src/lib/contenus/load.ts`)

Chaque page lit Convex (`fetchQuery`) via `fetchOrFallback` : backend
injoignable **ou table vide** → contenu codé, page en 200. Dès qu'une table
porte un contenu publié, elle fait foi **entièrement** (pas de mélange : un
événement retiré ne revient pas du dépôt). Pages concernées : `/evenements`,
`/evenements/[slug]` (+ `agenda.ics`), `/evenements/calendrier`, `/replays`,
`/partenaires`, `/presse` (revue), `/thematiques`, `/thematiques/[slug]`,
`sitemap.xml`. Le contenu riche de la conférence inaugurale (programme,
intervenants, billetterie) reste codé et s'affiche sur sa fiche.

## Droits

| Action | Rang |
|---|---|
| Lire l'agenda, les replays, partenaires, presse, thématiques publiés | public |
| Voir le lien de visioconférence | compte connecté **inscrit** à l'événement |
| Lire / exporter les inscrits | modérateur (`/admin/evenements`) |
| Créer, éditer, publier, réordonner, supprimer ; médiathèque | éditeur (`/admin/contenus`) |
| Import du contenu codé | commande interne (`internalMutation`) |

## Sécurité et limites connues

- **CSP** (`next.config.ts`) : `frame-src` ouvert à `www.youtube-nocookie.com`
  et `player.vimeo.com` (lecteurs intégrés), `media-src 'self' https:` (replays
  en fichier). L'adresse intégrée est recalculée côté serveur depuis un lien
  validé, jamais recopiée telle que saisie.
- Les médias sont servis par l'URL de stockage Convex (`*.convex.cloud`, déjà
  autorisée en `img-src`) ; les images sont rendues `unoptimized` (pas de
  passage par l'optimiseur Next).
- Un inscrit **sans compte** ne voit pas le lien sur la page : il le reçoit
  par courriel (sans `AUTH_RESEND_KEY`, l'envoi échoue proprement et sera
  retenté au passage suivant du cron, comme les rappels).
- Les thématiques ne se suppriment pas (le slug relie publications, Tribune,
  appels à projets) : on les dépublie. Une thématique créée hors des cinq axes
  n'a pas de publications liées (les formulaires de dépôt restent sur
  `NETWORK_THEMES`).
- Un événement publié ne se supprime pas (inscriptions, rappels, liens
  partagés) : on l'annule ou on le dépublie. Seul un brouillon sans inscrit
  se supprime.
- Listes du back-office bornées (500 événements / replays, 200 partenaires,
  300 articles, 100 médias affichés, 50 résultats de recherche) : suffisant
  pour le volume d'un réseau ; une pagination sera à prévoir au-delà.
- La facette « mois » de l'agenda porte sur la date de DÉBUT.
- Suppression de compte : `deleteUserDataContenus(ctx, userId)`
  (`convex/lib/contenus/userData.ts`) efface la trace d'auteur (`updatedBy`,
  `uploadedBy`), pas les contenus — à brancher par l'orchestrateur.

## Variables d'environnement

Aucune nouvelle. Le courriel du lien de visioconférence utilise l'adaptateur
existant (`AUTH_RESEND_KEY`, `SITE_URL`).

## Tests

- `convex/contenus.test.ts` (convex-test) : droits (anonyme, visiteur, membre,
  modérateur refusés ; éditeur et admin acceptés), journal d'audit, brouillon
  invisible, annulation annoncée, fuseaux, saisies invalides, slug immuable,
  lien visio masqué et révélé au seul inscrit, courriel visio unique,
  inscription refusée (inconnu / annulé / passé) par l'action publique, export
  CSV journalisé, médiathèque (contenu réel, texte alternatif, dimensions,
  média utilisé non supprimable), replays / presse / ordre, migration fidèle
  (cinq langues) et idempotente, ménage E2E, suppression de compte.
- `convex/events.test.ts`, `convex/eventReminders.test.ts`,
  `convex/public-form-bounds.test.ts`, `convex/existence-oracle.test.ts` :
  mis à jour (événements insérés par `insertTestEvent`, datés relativement à
  l'horloge ; capacité ; date de rappel serveur).
- `tests/unit/contenus-libs.test.ts`, `tests/unit/contenus-localized.test.tsx`,
  `src/lib/events-content.test.ts` (facette mois, recherche).
- E2E (non joués ici) : `tests/e2e/contenus-evenements.spec.ts`,
  `tests/e2e/contenus-medias.spec.ts` ; specs existantes adaptées :
  `evenements.spec.ts` (plus de compte figé, la date décide),
  `event-register.spec.ts` (import préalable), `calendrier.spec.ts`
  (commentaire). Trois sessions dédiées ajoutées (`_sessions.ts`).
