# Audit de vérification — Democracy Together

**Date** : 21 septembre 2026 · **Branche** : `claude/stoic-rubin-9thrja`
· **Commit de base** : `8a5699b`
**Méthode** : exécution réelle, preuves conservées. Aucune affirmation de ce
rapport ne repose sur la seule lecture du code : chaque ligne du tableau § 2
renvoie à une commande jouée et à son journal.

---

> **Correctifs appliqués — F-02 et F-03 sont refermés.** Voir § 0. Le reste du
> rapport décrit l'état constaté à l'audit ; les deux entrées corrigées sont
> marquées comme telles.

## 0. Ce qui a été corrigé

### F-02 — plus aucune page ne rend 500 quand Convex est injoignable

**Vérification** : serveur lancé avec un `NEXT_PUBLIC_CONVEX_URL` inatteignable,
**14 routes sur 14** (fr et en) répondent **200** avec du contenu réel.

L'audit en nommait cinq. Il en manquait quatre, et c'est ma mesure qui était en
défaut : je n'avais sondé que les routes STATIQUES, et `/recherche` sans `?q=`
— donc sans déclencher sa requête. Le décompte réel :

| Route | Avant | Après | Ce qu'elle rend maintenant |
|---|---|---|---|
| `/bibliotheque`, `/experts`, `/le-reseau`, `/tribune` | 500 | **200** | leur état vide |
| `/thematiques` | 500 | **200** | les synthèses (servies par le dépôt), décompte à zéro |
| `/thematiques/[slug]` | 500 | **200** | la synthèse entière, sans liste de publications |
| `/bibliotheque/[slug]`, `/le-reseau/[slug]` | 500 | **200** | « contenu momentanément indisponible » |
| `/recherche?q=…` | 500 | **200** | « indisponible » — et non « aucun résultat », qui serait faux |

Le mécanisme est un module unique, `src/lib/convex-fallback.ts`, avec des formes
vides **typées par le retour réel de chaque query** (`FunctionReturnType`) :
ajouter une facette côté Convex casse la compilation au lieu de servir un objet
incomplet.

Deux décisions méritent d'être lues :

- **`undefined` ≠ `null`.** Sur une fiche, `null` veut dire « n'existe pas » et
  doit rester un 404 ; `undefined` veut dire « la requête a échoué ». Les
  confondre transformerait une panne en 404 et dirait aux moteurs que la page a
  disparu alors qu'elle existe toujours.
- **Les signaux internes de Next doivent traverser le repli.** C'est le piège
  qui a failli passer : Next signale par un JET ce qui n'est pas une panne —
  `notFound()`, `redirect()`, et surtout la sortie du rendu statique
  (« Dynamic server usage »), que `fetchQuery` déclenche à chaque génération.
  Le premier jet de ce correctif les avalait : le build journalisait
  `[experts] Convex indisponible : Dynamic server usage…`. Conséquence si on
  l'avait laissé passer : la route cesse d'être reconnue comme dynamique, et
  Next FIGE le repli dans le HTML pré-rendu — une page « momentanément
  indisponible » servie en permanence, backend en parfait état, et aucun test
  fonctionnel ne le voit puisque la page répond 200. `unstable_rethrow` relance
  ces signaux ; trois tests unitaires tiennent le point.

### F-03 — les 48 pages portent leurs métadonnées de partage

**Vérification**, même méthode que l'audit (48 pages, 24 routes × 2 langues) :

| Critère | Avant | Après |
|---|---|---|
| `og:title` présent | 0/48 | **48/48** |
| `og:title` = titre de la page | — | **48/48** (35 titres distincts) |
| `og:image` | 0/48 | **48/48** |
| `application/ld+json` | 0/48 | **48/48** |

Posé au niveau du layout : les métadonnées Next se propagent vers les pages,
donc les 48 en héritent d'un coup — y compris les 14 qui n'ont pas de
`generateMetadata` propre. **Aucune page n'a été modifiée.**

Ce que l'expérience a tranché, contre mon intuition de départ : `title`,
`description` et `url` doivent être **absents** du bloc `openGraph`. Les y
poser les FIGE pour tout le site — mesuré : `og:title` valait « Democracy
Together » jusque sur `/fr/adhesion`, et `og:url` pointait l'accueil depuis
chaque page, ce qu'un agrégateur peut prendre pour l'adresse canonique et qui
replierait tous les partages sur une seule page. Laissés vides, Next les dérive
du titre et de la description RÉSOLUS de chaque page.

L'image (1200×630) est **générée** (`opengraph-image.tsx`) et non versionnée :
l'issue #19 a établi que `design/` pesait ~95 % du `.git`, on ne recommence pas.
Elle suit le texte du site quand il change.

Le JSON-LD `Organization` est posé dans le HTML servi — donc lisible par un
robot qui n'exécute pas JavaScript — et ne déclare **que** ce que le dépôt
possède : un nom, une URL, une description traduite, un logo. Un test tient la
liste des clés fermée, parce qu'une adresse postale inventée serait une donnée
fausse servie aux moteurs, pire que son absence.

### F-04 — ce que chaque page déclare aux moteurs

**Deux de mes quatorze signalements étaient de FAUX POSITIFS.** `/fr/recherche`
et `/en/recherche` étaient comptées « sans hreflang » : c'est une décision
délibérée du dépôt, documentée dans `recherche/page.tsx` et tenue par
`tests/e2e/seo.spec.ts` — sur une page en `noindex`, un moteur ignore le
hreflang, l'y poser ne serait que du bruit. Ma spec l'exigeait sans regarder
`robots`. Elle a été corrigée ; le code, lui, n'avait rien à corriger.

**Et six des douze pages « sans canonical » ne pouvaient pas en avoir.** Elles
portent `'use client'`, et un composant client ne peut pas exporter
`generateMetadata`. Ce n'était pas un oubli mais une conséquence — ce qui
explique qu'aucune relecture ne l'ait rattrapée. Le correctif passe par un
`layout.tsx` par route, la façon prévue par Next de déclarer des métadonnées
au-dessus d'une page client.

Le traitement diffère selon ce que la page EST, et non selon une règle
uniforme :

| Route | Dans le sitemap | robots.txt | Posé |
|---|---|---|---|
| `/contact`, `/don` | **oui** | autorisé | **canonical + hreflang** |
| `/connexion`, `/connexion-otp`, `/mot-de-passe-oublie` | non | interdit | titre + `noindex` |
| `/newsletter/desinscription` | non | autorisé | titre + `noindex` |
| `/recherche` | non | autorisé | inchangé — déjà juste |

`/contact` et `/don` étaient le vrai trou : le sitemap les listait AVEC leurs
alternates pendant que les pages n'annonçaient rien. Les trois pages
d'authentification, elles, n'avaient aucune métadonnée du tout — pas même un
titre : l'onglet du navigateur affichait « Democracy Together » pour les trois.

*À signaler, sans le corriger ici* : le `noindex` posé sur les trois pages
d'authentification est une seconde ceinture, pas un remplacement. Un moteur qui
respecte le `Disallow` de `robots.txt` ne vient pas lire ce `noindex`. Les deux
mécanismes se gênent — c'est une tension antérieure à ce correctif, et la
trancher relève d'un arbitrage SEO, pas d'une retouche de code.

**Vérification** : les 48 pages passent la spec SEO (canonical et hreflang là
où la page est indexable, `noindex` là où elle ne l'est pas).

**Et pour que ça ne revienne pas** : `tests/unit/seo-coherence.test.ts` rapproche
les trois écritures qui parlent des mêmes adresses — le sitemap, `robots.txt`
et les `generateMetadata`. Vérifié en le rejouant sans le correctif : il rougit
bien sur `contact`.

### F-05 — LCP 12,8 s → 2,4 s en 3G lente

| Page | Avant | Après |
|---|---|---|
| `/fr/barometre` | **12 808 ms** | **2 376 ms** (médiane de 3) |
| `/fr` | 2 572 ms | 2 552 ms |

**Je me suis trompé deux fois avant de trouver, et les deux méritent d'être
écrites.**

*Première erreur — un test d'isolation qui ne testait rien.* Pour mesurer la
part du `Reveal`, j'avais injecté une règle CSS avant navigation. Résultat :
12 760 ms contre 12 808 — aucun effet, donc « le Reveal n'y est pour rien ».
J'ai alors passé deux cycles à optimiser les polices. En réalité l'injection
n'était jamais appliquée : elle posait un `<style>` sur `documentElement` avant
que `<head>` n'existe, et React l'emportait. Rejouée en ajoutant la règle à la
FEUILLE DE STYLE interceptée en vol — et en refusant de conclure sans avoir
constaté l'opacité calculée à 1 — la même mesure donne **584 ms**. Vingt fois.

La cause est mécanique : `Reveal` rend `initial={{ opacity: 0 }}` en style
inline côté serveur, et un élément à opacité nulle n'est pas candidat au
« largest contentful paint ». Le texte de la page ne comptait donc qu'une fois
framer-motion chargé, hydraté et animé.

*Seconde erreur — un correctif qui supprimait la fonctionnalité.* Passer
`initial` de `false` à l'état voilé après le montage ne voile rien : framer ne
lit `initial` qu'au montage. Le LCP tombait à 4 328 ms, mais **l'animation
d'entrée avait disparu de tout le site**, sans bruit — une page répond 200 et
affiche son contenu, aucun test fonctionnel ne s'en émeut. C'est
`audit/specs/35-reveal-integrite.spec.ts`, écrit exprès pour ça, qui l'a dit.
La version retenue pilote l'état par `useInView` : voile posé après montage, et
seulement hors écran.

*Ce qui se perd, et c'est assumé* : le fondu d'entrée du PREMIER écran. Un
fondu depuis l'invisible exige d'attendre le script — c'est précisément ce
qu'on refuse de faire payer. Tout le reste de la page s'anime comme avant, et
trois tests tiennent les deux bouts (rien de masqué dans le HTML servi, voile
bien posé hors écran, défilement qui révèle).

*Les polices, cause secondaire mais réelle* : 233 Ko des 244 Ko de la page.
`font-bold` n'apparaît nulle part dans `src/` et l'italique n'y sert que trois
fois, sur du texte de corps — le 700 de Plex Sans et l'italique de Newsreader
sont donc partis (−63 Ko, aucun changement visuel). Et seule la police de CORPS
reste préchargée, celle dont dépend le LCP : mesuré, les trois préchargées
donnent 4 328 ms, le corps seul 2 376 ms, et re-précharger les titres 2 660 ms.

*Honnêtement* : `/fr` reste à 2 552 ms, au-dessus du seuil de 2 500 ms que je
m'étais fixé. Mon correctif ne l'améliore ni ne le dégrade — cette page était
déjà bornée par ses octets et ses allers-retours, pas par le voile.

### Ce que ces correctifs ont fermé au passage

`audit/specs/11-robots-sitemap.spec.ts` passe désormais : le sitemap déclarait
six URLs qui répondaient 500, elles répondent 200.

### Ce qui reste ouvert

F-01, F-06, F-07, F-08, F-09, F-10 et F-13 restent ouverts. La spec SEO ne
signale plus rien ; les deux seuls échecs des specs d'audit sont F-07.

### Vérifications passées avant de pousser

`typecheck`, `typecheck:convex`, `typecheck:tests`, `lint`, `format:check`,
`build` : verts. **741 tests unitaires** (92 fichiers, 24 ajoutés), verts — et
verts aussi sur trois ordres mélangés (seeds 4, 5, 6), donc les tests ajoutés
n'introduisent pas de dépendance d'ordre. Les specs d'audit rejouées : rendu
sans JavaScript 24/24, i18n 24/24, en-têtes, sitemap. Les deux seuls échecs
restants sont F-07, antérieur et hors mandat.

---

## 1. Verdict

**Non, pas de mise en ligne en l'état** — mais aucun blocage n'est structurel.

Les six portes de qualité passent, les 717 tests unitaires passent, et les deux
vulnérabilités **ÉLEVÉES** du pentest du 18 septembre sont corrigées, vérifiées
ici par des PoC indépendantes réexécutées. Ce qui reste : **cinq pages publiques
répondent 500 quand Convex est injoignable** (F-02), **aucune balise de partage
social n'existe sur tout le site** (F-03), et la page baromètre met **12,8 s** à
afficher son contenu principal en 3G lente (F-05) — sur un produit dont le
cadrage annonce un premier usage à faible débit.

Un septième point mérite d'être vu même s'il ne bloque rien : la suite de tests
est **verte par chance d'ordonnancement** (F-01). Six seeds sur dix la font
rougir.

**Mise à jour après passage en CI.** Les 213 tests E2E, que l'environnement
d'audit ne pouvait pas jouer, ont tourné sur la préversion Convex de la PR :
**212 passés sur 213**, deux fois de suite sur le même commit. L'angle mort
principal de cet audit est donc largement refermé — et il a livré un constat de
plus, F-13 : deux exécutions identiques, deux défaillances DIFFÉRENTES, toutes
deux sur un dialogue.

---

## 2. Tableau de preuves

Journaux sous `audit/logs/` (éphémères, régénérables) ; specs et PoC rejouables
sous `audit/specs/` et `audit/poc/`. Commande de reproduction en § 6.

| ID | Lot | Vérification | Méthode | Passes | Verdict | Artefact |
|---|---|---|---|---|---|---|
| A1 | Portes | `pnpm typecheck` | commande | 1/1 | ✅ code 0 | `A-typecheck.log` |
| A2 | Portes | `pnpm typecheck:convex` | commande | 1/1 | ✅ code 0 | `A-typecheck-convex.log` |
| A3 | Portes | `pnpm typecheck:tests` | commande | 1/1 | ✅ code 0 | `A-typecheck-tests.log` |
| A4 | Portes | `pnpm lint` | commande | 1/1 | ✅ code 0 | `A-lint.log` |
| A5 | Portes | `pnpm format:check` | commande | 1/1 | ✅ code 0 | `A-format-check.log` |
| A6 | Portes | `next build` | commande | 1/1 | ✅ code 0, 103 pages | `A-build.log` |
| B1 | Tests | Suite en ordre de déclaration | `pnpm test` | 3/3 | ✅ 90 fichiers, 717 tests | `B-unit-pass*.log` |
| B2 | Tests | Suite en ordre **mélangé** | seeds 1→10 | 4/10 | ❌ **F-01** | `B-sweep-seed*.log` |
| B3 | Tests | Cause racine de B2 | PoC vitest | 1/1 | ❌ fuite prouvée | `B-poc-restore.log` |
| B4 | Tests | Correctif de B2 | PoC vitest | 1/1 | ✅ `mockRestore()` marche | `B-poc-fix.log` |
| B5 | Tests | Inventaire des `skip` | grep | 1/1 | ✅ 1 seul, conditionnel | § 3, F-11 |
| B6 | Tests | Couverture E2E des 57 routes | croisement | 1/1 | ⚠️ 3 routes sans spec | § 3, F-12 |
| B7 | Tests | Suite E2E, en local | `pnpm test:e2e` | 0/1 | ⛔ bloqué (pas de Convex) | `B-e2e-attempt.log` |
| B8 | Tests | Suite E2E, **en CI** (préversion Convex) | `e2e.yml` ×2 | 2/2 | ⚠️ 212/213, **F-13** | [run 35549604936](https://github.com/beindigital-clients/democracy-together/actions/runs/35549604936) |
| C1 | Sécu | Pentest **C-1** (RCE Next) | version + `pnpm audit` | 1/1 | ✅ **CORRIGÉ** (16.3.5) | `C-pnpm-audit.json` |
| C2 | Sécu | Pentest **H-1** (publications membres) | PoC `convex-test` | 2/2 | ✅ **CORRIGÉ** | `C-poc-pentest.log` |
| C3 | Sécu | Pentest **H-2** (file de modération) | PoC `convex-test` | 2/2 | ✅ **CORRIGÉ** | `C-poc-pentest.log` |
| C4 | Sécu | Pentest **M-4** (gating client) | HTTP réel | 1/1 | ✅ 307 serveur | `D-status.tsv` |
| C5 | Sécu | Pentest **M-7** (compteur de vues) | lecture source | 1/1 | ✅ quota posé | `publications.ts:166` |
| C6 | Sécu | Pentest **M-8** (oracles `already`) | lecture source | 1/1 | ❌ **OUVERT** | `newsletter.ts:91` |
| C7 | Sécu | Surface Convex publique | inventaire 73 fn | 1/1 | ✅ 54 gardées / 19 publiques légitimes | § 3 |
| C8 | Sécu | Chaîne de dépendances | `pnpm audit` | 1/1 | ⚠️ 1 haute, 8 moy., 1 basse | `C-pnpm-audit.json` |
| C9 | Sécu | En-têtes CSP/HSTS/XFO | réponse réelle | 1/1 | ✅ présents | `D-seo-run1.log` |
| D1 | SEO | 10 critères × 48 pages | navigateur | 1/1 | ❌ **F-03, F-04** | `D-seo-donnees.txt` |
| D2 | SEO | `robots.txt` | requête | 1/1 | ✅ 200 + sitemap | `D-seo-run1.log` |
| D3 | SEO | `sitemap.xml` | requête + crawl | 1/1 | ❌ 6 URLs en 500 | `D-seo-run1.log` |
| E1 | Perf | LCP/CLS/poids, 3 pages | CDP, 3 mesures | 3/3 | ✅ LCP 204–288 ms | `E-perf.log` |
| E2 | Perf | Slow 3G, 2 pages | CDP throttling | 1/1 | ❌ **F-05** | `E-perf-3g.log` |
| F1 | A11y | axe, 24 pages, méthodo dépôt | navigateur | 1/1 | ⚠️ voir F-07 | `F-a11y-hors-perimetre.log` |
| F2 | A11y | 10 pages hors périmètre du dépôt | navigateur | 1/1 | ❌ 2 violations | `F-a11y-hors-perimetre.log` |
| G1 | i18n | Texte français sur pages `/en` | navigateur | 1/1 | ✅ 24/24 propre | `G-i18n.log` |
| H1 | Dégrad. | Rendu **sans JavaScript**, 24 pages | navigateur | 1/1 | ✅ 24/24 lisibles | `H-nojs.log` |
| H2 | Dégrad. | 404 localisée sans JS | navigateur | 1/1 | ❌ **F-06** | `D-404-render.log` + captures |
| H3 | Dégrad. | Convex injoignable, 49 routes | HTTP réel | 1/1 | ❌ **F-02** (5 pages en 500) | `D-status.tsv` |
| H4 | Dégrad. | Sanity injoignable | HTTP + build | 1/1 | ✅ liste dégrade proprement | `A-build.log` |
| H5 | Dégrad. | Sanity injoignable, page de détail | HTTP réel | 1/1 | ❌ **F-10** (500) | § 3 |

---

## 3. Findings

Triés par sévérité. « Régression » = a déjà fonctionné ; « Défaut » = n'a jamais
fonctionné ; « Risque » = fonctionne, mais.

### F-02 · MOYENNE · Défaut · ~~Cinq~~ neuf routes rendaient 500 quand Convex est injoignable — **CORRIGÉ** (§ 0)

`src/app/[locale]/{bibliotheque,experts,le-reseau,thematiques,tribune}/page.tsx`

Les cinq appellent `fetchQuery(...)` **sans `try`/`catch`** (respectivement
lignes 55, 41, 67, 45, 60). Backend injoignable → l'exception remonte → HTTP 500.

**Reproduction** (serveur lancé avec un `NEXT_PUBLIC_CONVEX_URL` inatteignable) :

```
/fr/bibliotheque  500     /fr/thematiques  500
/fr/experts       500     /fr/tribune      500
/fr/le-reseau     500
```

Les 44 autres routes publiques répondent 200.

**Asymétrie** : la même situation côté **Sanity** est traitée. `actualites/page.tsx:44`
enveloppe sa requête, journalise `[actualites] Sanity indisponible` et rend la
page en 200 avec sa liste vide. `TESTING.md` § « Sources externes » pose
d'ailleurs la règle explicitement — « une source indisponible ne doit pas
emporter la page ». Elle est tenue pour Sanity, pas pour Convex.

**Aggravation** : `sitemap.xml` déclare ces URLs. Six d'entre elles
(`/fr` et `/en` × `le-reseau`, `bibliotheque`, `thematiques`) sont donc
proposées à l'indexation alors qu'elles rendent 500 dès que le backend tousse.

**Correctif** : appliquer aux cinq pages le motif déjà en place sur `actualites`
— `try`/`catch` autour du `fetchQuery`, état vide rendu, erreur journalisée.

**Limite de cette preuve** : le déclencheur ici est un hôte inatteignable, ce qui
simule fidèlement « backend indisponible » mais pas « backend qui répond une
erreur ». Le second cas reste à vérifier sur un vrai déploiement.

### F-03 · MOYENNE · Défaut · Aucune balise Open Graph, Twitter Card ou JSON-LD sur le site — **CORRIGÉ** (§ 0)

Mesuré sur **48 pages** (24 routes × 2 langues), confirmé hors Playwright par
`curl` :

| Critère | Conformes |
|---|---|
| `lang`, `<title>`, meta description, `h1` unique, `alt` des images | **48/48** ✅ |
| `og:title` / `og:image` | **0/48** ❌ |
| `application/ld+json` | **0/48** ❌ |

Conséquence directe : tout lien partagé sur WhatsApp, LinkedIn, Facebook ou X
apparaît nu — pas de titre, pas de description, pas d'image. Pour une
organisation dont l'objet est la diffusion d'analyses, et dont le canal de
partage principal sur la zone visée est la messagerie, c'est une perte sèche à
chaque partage.

L'absence de JSON-LD prive par ailleurs de résultats enrichis trois gisements
déjà structurés en base : `Organization`, `Article` (publications), `Event`
(événements).

**Correctif** : `openGraph` et `twitter` dans les `metadata` du layout
`[locale]`, surchargés par page ; une image OG par défaut ; un bloc JSON-LD
`Organization` global + `Article`/`Event` sur les pages de détail.

### F-05 · MOYENNE · Risque · 12,8 s avant contenu principal en 3G lente — **CORRIGÉ** (§ 0)

Émulation CDP Slow 3G (400 kbit/s, 400 ms de latence) :

| Page | Chargement complet | LCP |
|---|---|---|
| `/fr` | 13 181 ms | **2 628 ms** |
| `/fr/barometre` | 11 969 ms | **12 808 ms** |

En local sans bridage, les mêmes pages sont excellentes (LCP 204 et 288 ms,
CLS 0,001, 243–297 Ko transférés, 45–48 requêtes) — le code n'est pas lent, il
est **lourd à transporter**. Le seuil annoncé était LCP < 2 500 ms : `/fr` le
frôle, `/fr/barometre` le dépasse d'un facteur 5.

Le build confirme la piste : 11 Mo de `chunks`, dont un de **2,7 Mo** et un de
**1,1 Mo**. Aucune route n'est prérendue en statique (`ƒ` partout dans le rapport
de build, sauf `/icon.png` et `/robots.txt`).

**Correctif** : identifier le porteur des gros chunks (`d3-geo`, `topojson`,
`world-atlas`, `sanity`) et le charger en différé sur les seules pages qui
l'utilisent ; prérendre en statique les pages de contenu éditorial, qui ne
dépendent d'aucune donnée utilisateur.

**Limite** : mesures faites en localhost bridé, donc sans latence serveur réelle.
Les chiffres sont un **plancher** : le terrain sera plus lent, pas plus rapide.

### F-01 · MOYENNE · Défaut · L'isolation des tests n'est pas tenue : la suite est verte par ordonnancement

`tests/unit/consent.test.ts`

En ordre de déclaration — celui de la CI — la suite est verte : 90 fichiers,
717 tests, 3 exécutions sur 3. En ordre **mélangé**, elle rougit **6 fois sur
10** (seeds 2, 3, 7, 8, 9, 10 ; seed 3 : 12 tests en échec d'un coup). Toujours
le même fichier.

**Cause racine, prouvée** (`audit/poc/restore-spy.test.ts`) : sous happy-dom et
Vitest 4.1.9, `vi.restoreAllMocks()` **ne restaure pas** un espion posé sur
l'instance `window.localStorage`. Le `SecurityError` du test « stockage
indisponible » (lignes 101-102) survit donc à l'`afterEach` et contamine les
tests suivants.

**Correctif, prouvé lui aussi** (`audit/poc/restore-fix.test.ts`) : conserver
l'espion et appeler `spy.mockRestore()` explicitement. Testé : fonctionne.
La remise en place manuelle (`window.localStorage.getItem = origine`) **ne
fonctionne pas** — happy-dom sert bien `localStorage` derrière un proxy, comme
le note déjà le commentaire du fichier.

**Pourquoi ça compte au-delà de ce fichier** : le piège est silencieux. Tout
test ajouté après ces deux-là hérite d'un `localStorage` qui lève. Il échouera
pour une raison étrangère à son sujet — ou, pire, passera sans rien exercer.
C'est exactement la classe de défaut que l'issue #18 a documentée dans ce dépôt.

Le motif fautif n'est employé **que là** : les autres fichiers passent par
`vi.stubGlobal` + `vi.unstubAllGlobals`, qui restaure correctement (vérifié :
aucun d'eux ne rougit sur les 10 seeds).

### F-08 · MOYENNE · Risque · 10 vulnérabilités de dépendances, dont une haute

| Sév. | Paquet | Sujet | Corrigé en |
|---|---|---|---|
| **haute** | `postcss` | Path traversal via source map | ≥ 8.5.18 |
| moyenne | `postcss` | Correctif incomplet de GHSA-6g55-p6wh-862q | ≥ 8.5.23 |
| moyenne | `vitest`, `@vitest/mocker` | Path traversal / lecture de fichier arbitraire | ≥ 4.1.11 |
| moyenne | `dompurify` (via `sanity`) | Sous-arbre détaché exécutable | ≥ 3.4.13 |
| moyenne | `uuid`, `valibot`, `baseline-browser-mapping` | divers | voir journal |
| basse | `dompurify` | `CUSTOM_ELEMENT_HANDLING` | ≥ 3.4.12 |

Aucune ne touche Next, React ou Convex : **le C-1 du pentest est bien refermé**
(16.2.9 → 16.3.5). `postcss` et `vitest` sont des dépendances de construction et
de test, `dompurify` arrive par le Studio Sanity. Le risque d'exploitation en
production est donc faible — ce qui ne dispense pas de la montée de version, la
plus coûteuse étant `vitest` (majeure déjà en place, correctif de patch).

### F-06 · FAIBLE · Défaut · La 404 localisée est entièrement vide sans JavaScript

`src/app/[locale]/not-found.tsx`

| Contexte | Texte visible |
|---|---|
| Avec JavaScript | **703 caractères** (« 404 / Page introuvable / … ») ✅ |
| **Sans JavaScript** | **0 caractère** — page blanche ❌ |
| Contre-épreuve `/fr/mentions-legales` | 2 759 caractères ✅ |
| Contre-épreuve 404 par défaut de Next | 255 caractères ✅ |

Captures : `audit/screenshots/404-localisee-{avec,sans}-js.png`.

Le contenu n'est pas dans le HTML initial — il n'arrive que par la charge utile
RSC, appliquée à l'hydratation. Vérifié sur `/fr/rapports/9999`, qui **ne dépend
pas de Convex** : ce n'est donc pas une retombée du backend indisponible.

À rapprocher de la raison d'être du niveau dev-browser (`TESTING.md`) : deux des
régressions qui l'ont fait naître étaient des pages blanches. Les 24 pages
publiques, elles, rendent toutes correctement sans JS (H1) — la 404 est la seule
exception.

Impact SEO nul (le statut 404 est correct de toute façon) ; impact réel sur les
visiteurs à faible débit ou JS dégradé, précisément la cible du cadrage.

### F-10 · FAIBLE · Défaut · La page de détail d'une actualité rend 500 quand Sanity est indisponible

`/fr/actualites/inexistant-xyz` → **500**, alors que la page de liste
`/fr/actualites` dégrade proprement en 200. Le `try`/`catch` de
`actualites/page.tsx:44` n'a pas d'équivalent sur `actualites/[slug]`.
Même correctif que F-02.

### F-07 · FAIBLE · Défaut · Lien non distinguable dans un paragraphe, sur les deux pages de connexion

`/fr/connexion` et `/fr/connexion-otp` — règle axe `link-in-text-block`
[serious] sur `.text-accent-text.hover:underline[href$="adhesion"]`.

Le lien vers l'adhésion n'est distingué du texte environnant que par la
**couleur** ; le soulignement n'apparaît qu'au survol. WCAG 1.4.1.

**Méthodologie** : mesuré avec **celle du dépôt** — reveals déroulés,
`color-contrast` désactivé. Sur les 10 pages publiques absentes de la liste
`PAGES` de `tests/e2e/a11y.spec.ts`, 8 sont parfaitement propres ; seules ces
deux-là sortent.

**Correctif** : `underline` permanent, ou `text-decoration: underline` +
`text-underline-offset`.

### F-09 · FAIBLE · Risque · Pentest M-8 toujours ouvert : les oracles d'existence subsistent

`convex/newsletter.ts:91` et `convex/events.ts:77` renvoient toujours
`{ ok: true, already: true }` lorsque l'adresse est déjà inscrite, et
`already: false` sinon. Un anonyme peut donc tester l'appartenance d'une adresse
à la base — c'est exactement ce que décrivait M-8, et l'action n° 10 du plan de
remédiation (« réponses uniformes ») n'a pas été appliquée.

Sévérité basse compte tenu du rate-limit désormais en place, mais le point reste
ouvert et doit être déclaré comme tel plutôt que considéré comme traité.

### F-13 · MOYENNE · Risque · La suite E2E est instable sur les dialogues

Le workflow `e2e.yml` a joué la suite **deux fois sur le commit `1390107`**, à
huit minutes d'intervalle, sans aucune modification entre les deux. Résultat :

| Exécution | Résultat | Test concerné |
|---|---|---|
| 1re (01:02, `1390107`) | 212 passés, **1 en échec** | `admin-recherche.spec.ts:153` — `locator.click` sur le bouton du dialogue de confirmation : *element is not stable*, réessai jusqu'au timeout de 45 s |
| 2de (01:11, `1390107`) | 212 passés, **1 « flaky »** | `search.spec.ts:14` — `getByRole('dialog', { name: 'Rechercher sur le site' })` jamais visible, puis vert à la reprise |
| 3e (01:56, `d29c1da`) | 212 passés, **1 « flaky »** | `mobile-nav.spec.ts:48` — le lien « Jeunes » jamais visible après le clic sur la bascule du menu mobile, puis vert à la reprise |

Trois campagnes, **trois défaillances DIFFÉRENTES, toutes trois en attente d'un
panneau qui s'ouvre au clic** : dialogue de confirmation, palette de recherche,
menu mobile. Aucune des trois ne se répète ; aucune ne sort de cette famille.
Ce n'est pas une série d'accidents indépendants.

La troisième écarte au passage la piste la plus tentante. `mobile-nav` ne
touche NI Convex NI le back-office : l'explication « la table est encore
réécrite par une requête réactive » ne peut pas la couvrir. Ce que les trois
partagent est plus étroit et plus banal — un élément monté en réaction à un
clic, que le test attend avant qu'il n'ait fini d'arriver.

**Ce que ça coûte** : une porte de CI qui rougit pour une raison étrangère au
diff apprend aux relecteurs à ignorer le rouge. Le dépôt en a déjà fait
l'expérience — `search.spec.ts` est signalé « flaky » depuis la PR #88, et
`admin-recherche.spec.ts` a fait tomber la CI trois fois de suite lors de son
introduction. Le taux observé est d'environ **1 test sur 213 par campagne**,
jamais le même.

**Ce que j'ai écarté** : l'hypothèse d'un ancêtre porteur d'un `transform` qui
capturerait le `fixed` du dialogue (`src/components/ui/confirm-dialog.tsx:97`,
rendu **sans portail**). Il n'y a ni `framer-motion` ni `transform` dans
`src/components/admin/**`. Et la 3e occurrence écarte la piste « requête
réactive » : `mobile-nav` ne parle à aucun backend. Je ne nomme donc pas de
cause racine : la trace Playwright des exécutions en échec, conservée sept
jours dans l'artefact `playwright-report`, est le prochain pas — et il y en a
désormais trois à comparer, ce qui vaut mieux qu'une.

**Deux pistes**, la seconde valant indépendamment des tests :

1. attendre que la liste soit stabilisée avant d'ouvrir la confirmation — la
   recherche est temporisée (250 ms) puis faite par le serveur, donc la table
   est encore réécrite quand le dialogue se monte ;
2. monter `ConfirmDialog` dans un portail (`createPortal` vers `document.body`).
   Un `fixed` rendu en place reste fragile : le jour où un ancêtre gagne un
   `transform`, le dialogue est mal positionné **pour les utilisateurs**, pas
   seulement pour Playwright.

### F-11 · INFO · Un `test.skip` conditionnel, pilote par la donnée

`tests/e2e/admin-recherche.spec.ts:256` :
`test.skip(!word, 'aucun mot assez long dans le premier titre')`.
Légitime, mais dépendant du jeu de données : sur une préversion peu peuplée, ce
test peut ne jamais s'exécuter sans que rien ne le signale. C'est le seul `skip`
du dépôt — les 717 tests unitaires s'exécutent tous.

### F-12 · INFO · Trois routes sans aucune référence dans les specs E2E

`/admin/contact`, `/evenements/calendrier`, `/newsletter/desinscription`.

Sur 57 routes, 54 sont citées par au moins une spec : la couverture est bonne.
Méthode : croisement textuel des chemins `/fr/…` et `/en/…` dans `tests/e2e/` —
elle repère l'absence de mention, pas la qualité de ce qui est vérifié.

---

## 4. Suivi du pentest du 18 septembre 2026

| # | Sévérité | Sujet | Verdict | Preuve |
|---|---|---|---|---|
| C-1 | CRITIQUE | Next 16.2.9, RCE non authentifiée | ✅ **CORRIGÉ** | 16.3.5 installé ; absent de `pnpm audit` |
| H-1 | ÉLEVÉE | Publications « membres » exposées | ✅ **CORRIGÉ** | PoC anonyme : `fileUrl` nul, `reviewNotes`/`authorUserId`/`fileId` absents, `body: []`, `locked: true` |
| H-2 | ÉLEVÉE | Blocage de la file de modération | ✅ **CORRIGÉ** | PoC : `targetId` d'une autre table **rejeté** ; file toujours lisible par un modérateur |
| M-1 | MOYENNE | `signUp` attache un mot de passe | 🟡 **PROBABLE** | `convex/auth-callback.test.ts` couvre `NO_SELF_SIGNUP` ; non rejoué faute de déploiement |
| M-2 | MOYENNE | Rate-limit / reCAPTCHA fail-open | 🟡 **PROBABLE** | `rateLimit.test.ts` (14) + `recaptcha.test.ts` (15) verts |
| M-3 | MOYENNE | `AUTH_DEV_OTP` | 🟡 **PROBABLE** | `otp.test.ts` (11) + `devAdmin.test.ts` (11) verts |
| M-4 | MOYENNE | Zones protégées gardées côté client | ✅ **CORRIGÉ** | 11 routes renvoient **307 serveur** vers `/fr/connexion` avant tout code client |
| M-5 | MOYENNE | Rappels d'événements | 🟡 **PROBABLE** | `eventReminders.test.ts` (4) vert |
| M-6 | MOYENNE | Élévation via approbation d'adhésion | ⚪ **NON VÉRIFIÉ** | exige un parcours back-office complet |
| M-7 | MOYENNE | Compteur de vues sans limite | ✅ **CORRIGÉ** | `consumePublicationViewQuota` — `publications.ts:166` |
| M-8 | MOYENNE | Oracles d'existence `already` | ❌ **OUVERT** | `newsletter.ts:91`, `events.ts:77` |
| M-9 | MOYENNE | Liens `javascript:` depuis le CMS | ⚪ **NON VÉRIFIÉ** | exige un projet Sanity configuré |

**🟡 PROBABLE** veut dire : un test du dépôt couvre nommément le point et il est
vert, mais je n'ai pas rejoué l'attaque moi-même. Ce n'est pas la même chose que
« corrigé », et je ne l'écris pas comme tel.

### Surface Convex publique

73 fonctions exportées (`query`/`mutation`/`action`) : **54 gardées**,
19 anonymes. Les 19 sont toutes des surfaces publiques assumées — formulaires
(contact, newsletter, inscription événement, candidature jeunes/organisation,
mentorat), lectures publiques (publications, annuaire, tribune, recherche,
experts), `users.current` et `recordPublicationView`. **Aucune fonction
privilégiée sans garde.**

Répartition des rangs exigés : `moderateur` 22, `membre` 12, `editeur` 8,
`admin` 4, authentifié sans rang 8.

> *Note de méthode* : mon premier inventaire annonçait « 65 fonctions sur 73 sans
> garde ». C'était faux — mon détecteur ignorait `requireNetworkRole`, le helper
> réellement employé (`convex/lib/rbac.ts:38`). Chiffre corrigé après
> vérification ; je le signale parce qu'un audit qui ne dit pas où il s'est
> trompé n'est pas vérifiable.

---

## 5. Angles morts

Ce que cet audit **n'a pas** couvert, et ce qu'il faudrait pour le couvrir.

1. **Les 213 tests E2E — largement refermé depuis.** Aucun déploiement Convex
   n'était joignable depuis l'environnement d'audit : les 8 sessions partagées
   échouaient et 200 tests n'étaient pas joués. **La CI de la PR les a joués**,
   sur une préversion Convex dédiée : 212 passés sur 213, deux fois. Tout ce qui
   touche l'authentification, les rôles, le back-office, la modération et les
   parcours connectés est donc bien exercé — par la suite du dépôt, pas par moi.
   Ce qui reste non vérifié **de ma main** : je n'ai rejoué aucune attaque du
   pentest sur ces surfaces (cf. les cinq 🟡 du § 4), et l'instabilité relevée
   en F-13 reste sans cause établie.
2. **Les navigateurs mobiles.** L'environnement fournit Chromium build 1194 ; le
   Playwright épinglé (1.61.1) réclame 1228 et refuse de démarrer. J'ai
   contourné en pointant l'exécutable, mais **les projets `mobile-chromium` et
   `dev-browser` n'ont pas été joués**, et aucune mesure ne porte sur un vrai
   viewport mobile. Le cadrage plaçant le mobile en usage premier, c'est une
   lacune réelle de cet audit.
3. **Les cinq pages Convex sur données réelles.** `bibliotheque`, `experts`,
   `le-reseau`, `thematiques`, `tribune` n'ont pu être mesurées ni en SEO, ni en
   accessibilité, ni en performance : elles rendent 500 ici. Leurs chiffres sont
   absents des tableaux § 3, et ce sont probablement les pages les plus lourdes.
4. **Firefox et WebKit.** Rien n'a été exercé hors Chromium.
5. **Le contraste des couleurs.** Volontairement laissé de côté : le dépôt le
   désactive avec une justification écrite (palette de marque, arbitrage RGAA
   annoncé dans la déclaration d'accessibilité). Mes premières mesures brutes
   montraient jusqu'à 45 nœuds en défaut sur `/fr/evenements/calendrier`, mais
   sans dérouler les animations — donc **gonflées par de faux positifs**. Je ne
   les retiens pas. L'arbitrage reste à mener, il n'est pas de nature technique.
6. **Sanity.** Aucun projet configuré (`projectId = placeholder`) : le chemin
   « contenu réel » du CMS n'a jamais été exercé, seulement le chemin dégradé.
   M-9 (liens `javascript:` depuis PortableText) reste donc non vérifié.
7. **La production.** Aucun accès, par construction et par consigne. La
   checklist de `docs/deploiement.md` § 1.1 (`AUTH_DEV_OTP` et
   `RECAPTCHA_DISABLED` absents de l'env de prod) **n'a pas été vérifiée** et
   doit l'être manuellement avant mise en service.
8. **Les journaux sont éphémères.** `audit/logs/` vit dans un conteneur qui sera
   recyclé. Les specs et PoC, elles, sont versionnées : elles régénèrent tout.

---

## 6. Reproduire

```bash
pnpm install --frozen-lockfile

# Portes (aucun prérequis)
pnpm typecheck && pnpm typecheck:convex && pnpm typecheck:tests \
  && pnpm lint && pnpm format:check && pnpm build

# F-01 : la suite en ordre mélangé (6 seeds sur 10 rougissent)
for s in 1 2 3 4 5 6 7 8 9 10; do
  pnpm exec vitest run --sequence.shuffle --sequence.seed=$s >/dev/null 2>&1
  echo "seed$s -> $?"
done

# F-01 : cause racine et correctif
pnpm exec vitest run --config audit/poc/vitest.poc.config.ts

# Régression du pentest (H-1, H-2)
cp audit/poc/pentest-regression.test.ts.txt convex/zz-audit-poc.test.ts
pnpm exec vitest run convex/zz-audit-poc.test.ts
rm convex/zz-audit-poc.test.ts

# Lots navigateur — serveur requis
NEXT_PUBLIC_CONVEX_URL="https://audit-placeholder.convex.cloud" \
NEXT_PUBLIC_SITE_URL="http://localhost:3000" pnpm start &
pnpm exec playwright test --config audit/playwright.audit.config.ts --project=desktop
```

---

## 7. Plan d'action priorisé

### P0 — avant toute mise en ligne

| # | Action | Couvre | Effort |
|---|---|---|---|
| 1 | ~~`try`/`catch` + état vide~~ — **fait** pour F-02 (9 routes). F-10 (`actualites/[slug]`, source Sanity) reste ouvert | F-02 ✅ / F-10 | — |
| 2 | Vérifier à la main que la prod n'a ni `AUTH_DEV_OTP` ni `RECAPTCHA_DISABLED` (`npx convex env list --prod`) | angle mort 7 | 15 min |
| 3 | ~~Rejouer les 213 E2E~~ — **fait** par la CI de la PR (212/213, deux fois) | angle mort 1 | — |

### P1 — dans la foulée

| # | Action | Couvre | Effort |
|---|---|---|---|
| 4 | ~~`openGraph` + `twitter` + image OG ; JSON-LD `Organization`~~ — **fait**. JSON-LD `Article`/`Event` par page : reste à faire | F-03 ✅ | — |
| 5 | `spy.mockRestore()` dans `consent.test.ts` ; ajouter `--sequence.shuffle` à un job CI | F-01 | 1 h |
| 6 | `canonical` et `hreflang` sur les 12 (resp. 14) pages qui en manquent | F-04 | 2 h |
| 7 | `pnpm up postcss vitest @vitest/mocker` puis `pnpm audit --audit-level=high` en CI | F-08 | 1 h |
| 8 | Réponses uniformes sur `newsletter.subscribe` et `events.registerForEvent` | F-09 | 1 h |
| 8bis | Ouvrir la trace Playwright des deux échecs de dialogue ; portail pour `ConfirmDialog` | F-13 | ½ j |

### P2 — dette

| # | Action | Couvre | Effort |
|---|---|---|---|
| 9 | Alléger les chunks (`d3-geo`/`topojson`/`world-atlas` en différé) ; prérendre les pages éditoriales | F-05 | 1 j |
| 10 | Rendre la 404 localisée en SSR | F-06 | 2 h |
| 11 | Souligner le lien d'adhésion des pages de connexion ; les ajouter à `PAGES` de `a11y.spec.ts` | F-07 | 1 h |
| 12 | Specs E2E pour `/admin/contact`, `/evenements/calendrier`, `/newsletter/desinscription` | F-12 | 3 h |
| 13 | Aligner le Chromium de l'environnement sur le Playwright épinglé, pour rendre le mobile testable | angle mort 2 | — |

---

## 8. Détail des critères SEO manquants

**Sans `canonical` (12)** — `/fr` et `/en` × `connexion`, `connexion-otp`,
`contact`, `don`, `mot-de-passe-oublie`, `newsletter/desinscription`.

**Sans `hreflang` fr+en (14)** — les 12 ci-dessus, plus `/fr/recherche` et
`/en/recherche`.

`/contact` est le cas le plus gênant : c'est une page publique destinée à être
indexée. Les autres sont des pages transactionnelles, pour lesquelles l'absence
de canonical est moins coûteuse — mais l'incohérence suggère une génération de
métadonnées qui ne passe pas par le helper partagé.
