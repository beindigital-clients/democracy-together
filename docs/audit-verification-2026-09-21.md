# Audit de vérification — Democracy Together

**Date** : 21 septembre 2026 · **Branche** : `claude/stoic-rubin-9thrja`
· **Commit de base** : `8a5699b`
**Méthode** : exécution réelle, preuves conservées. Aucune affirmation de ce
rapport ne repose sur la seule lecture du code : chaque ligne du tableau § 2
renvoie à une commande jouée et à son journal.

---

> **Correctifs appliqués — F-01 à F-10 sont refermés**, F-06 pour moitié
> seulement (le cadriciel ne permet pas l'autre). Voir § 0. Le reste du rapport
> décrit l'état CONSTATÉ À L'AUDIT ; les entrées corrigées sont marquées comme
> telles, et leur description d'origine est conservée — un rapport réécrit
> après coup ne dirait plus ce qui a été trouvé.
>
> **F-13 est CLOS.** Cause trouvée et corrigée pour les deux cas — visiteur
> anonyme et visiteur connecté : l'en-tête se décalait de 104 px au moment où
> l'authentification se résolvait, il lit désormais cet état au rendu serveur.
> Trois campagnes consécutives à zéro clic perdu, compteur corrigé. § 3.
>
> **F-12 est CORRIGÉ** (23/09) : les trois routes qu'aucune spec E2E ne citait
> en ont une — **57 routes sur 57**. 227 tests en CI, 0 échec, 0 instable.
>
> **F-01 à F-13 sont donc tous refermés**, F-06 pour moitié. Ce qui reste ne
> m'appartient pas : l'arbitrage produit de F-06, et la vérification manuelle
> des variables de production (angle mort 7).
>
> **L'angle mort 2 est refermé** (23/09) : la suite a tourné sur un vrai Pixel 7
> — 165 tests, 0 échec, instrument vérifié. Elle a livré **F-14** : l'accueil
> sert encore 7 `opacity:0` dans son HTML, et son LCP mobile est de 2 000 ms
> contre 312 ms en desktop. Le correctif F-05 ne l'avait jamais couvert, parce
> que `HomeHero` n'utilise pas `Reveal` — et parce que la garde ne regardait
> qu'une route. § 4quater.
>
> **Les neuf constats du pentest sont rejoués** (23/09) : plus aucun 🟡 ni ⚪.
> **M-9 est corrigé** — `javascript:` était neutralisé par React, mais
> `data:text/html` et `vbscript:` passaient tels quels ; liste blanche de
> schémas posée au rendu, à l'écriture et à la saisie. **M-6 : l'angle mort
> est comblé** — la file de modération nomme désormais le compte que
> l'approbation va élever, et signale sa discordance avec l'adresse de
> contact. § 4ter.
>
> **Les fiches de PAGE existent** (24/09) : `Event` et `Article` étaient
> annoncées comme faites au § 3 et « à faire » au § 7 — c'est le § 7 qui
> disait vrai. Elles sont posées, lues dans le HTML servi par 9 gardes, et
> ne déclarent NI image, NI tarif, NI auteur : rien que la page ne montre.
> Le correctif ouvrait au passage une sortie de balise depuis un titre de
> CMS ; elle est fermée avant d'avoir servi. § 0.

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

### F-03 (suite, 24/09) — les fiches de PAGE, et la porte qu'elles ouvraient

Le rapport se contredisait sur ce point, et c'est la première chose que ce lot
a corrigée. Le « Correctif » de F-03 (§ 3) annonçait « un bloc JSON-LD
`Organization` global **+ `Article`/`Event` sur les pages de détail** », quand
la ligne P1 n° 4 du plan d'action disait, elle, « JSON-LD `Article`/`Event` par
page : **reste à faire** ». C'est la seconde qui était vraie : sur les 48
pages, le seul bloc servi était `Organization`, et il répondait « qui publie »
sans jamais décrire **ce qui** est publié.

**Ce qui est posé.** `eventJsonLd` et `articleJsonLd` dans `src/lib/seo.ts`,
rendus dans le HTML servi par `evenements/[slug]` et `actualites/[slug]`. Les
deux **référencent** l'organisation du layout (`@id`) au lieu de la recopier :
deux copies d'une même entité finissent par diverger.

**Ce qui est volontairement ABSENT, et pourquoi.** La règle est celle que la
fiche `Organization` s'était déjà donnée — on ne déclare que ce que la page
montre — appliquée cette fois à des champs que Google recommande :

| Champ | Pourquoi il n'est pas déclaré |
|---|---|
| `image` (Event) | la page sert `/library/paris.jpg` pour TOUS les événements, Dakar compris, et sa **propre légende** dit « Image d'illustration » |
| `offers` | les tarifs de la conférence sont fictifs (l'en-tête de `events-content.ts` le dit) et le bouton « réserver » mène à l'adhésion, pas à une billetterie |
| `performer` | les intervenants relèvent du même jeu de données d'illustration |
| `author` (Article) | le schéma Sanity du dépôt n'a **pas** de champ auteur ; l'éditeur responsable est déjà déclaré par `publisher` |
| `image` (Article) | `postBySlugQuery` projette bien `coverUrl`, mais **la page ne rend pas cette image**. Une fiche décrit la page, pas la requête |

**Un piège attrapé au passage.** La même page sert déjà un iCalendar
(`agenda.ics`). Or les deux formats décrivent le même jour entier avec des
conventions **opposées** : le `DTEND` d'un VEVENT désigne le **lendemain**
(exclusif), là où `endDate` de schema.org désigne le **dernier jour**
(inclusif). Reprendre la date de fin de l'ICS aurait annoncé aux moteurs un
événement de deux jours. Un test tient les deux côtés à la fois — `DTEND` au
15 novembre, `endDate` au 14 — pour qu'aligner l'un sur l'autre fasse rougir
plutôt que dériver en silence.

**Et une porte, qui est le vrai résultat de ce lot.** Un titre d'actualité est
saisi dans le CMS : c'est du texte qu'on ne contrôle pas, et il partait droit
dans un `<script>` via `JSON.stringify`. Un analyseur HTML ferme un `<script>`
sur la première séquence `</script` qu'il rencontre, **sans regarder si elle
est entre guillemets JSON** : un titre valant `Fin</script><img src=x
onerror=…>` serait sorti du bloc et aurait rendu sa balise. C'est la famille de
M-9 (§ 4ter) sur une autre surface — et cette fois elle aurait été ouverte
**par le correctif lui-même**.

`jsonLdScript()` échappe tous les `<` en `<`, un échappement JSON
parfaitement légal que `JSON.parse` relit en `<` : le moteur reçoit la donnée
intacte, l'analyseur HTML ne voit jamais de balise. La fonction est appliquée
aux **trois** blocs, y compris celui du layout qui n'en avait pas besoin.
Témoin permanent dans `tests/unit/seo.test.ts` : un test affirme que
`JSON.stringify` **seul** laisse bien sortir la séquence, juste à côté de celui
qui vérifie qu'elle ne sort plus. Retirer l'échappement fait rougir 4 tests.

**Mesuré sur le HTML servi**, sans navigateur, par requête HTTP —
`audit/specs/16-donnees-structurees.spec.ts`, **9 gardes, 0 échec** :

| Vérifié | Résultat |
|---|---|
| fiche `Event` dans le HTML servi (donc sans JS) | ✅ conférence, webinaire, atelier |
| `name` de la fiche = `<h1>` **affiché** | ✅ fr et en |
| `startDate` = `endDate` = 2026-11-14, `DTEND` = 20261115 | ✅ les deux conventions côte à côte |
| lieu selon le format réel | ✅ `Place` / `VirtualLocation` / les deux |
| le renvoi `organizer` **se résout** sur la même page | ✅ `@id` identique |
| ni `image`, ni `offers`, ni `performer` | ✅ |
| CMS injoignable → **aucune** fiche `Article`, `noindex` maintenu | ✅ l'organisation, elle, reste |

**Non-vacuité, deux fois.** Un témoin permanent dans la spec exige les deux
réponses du même lecteur sur deux pages : l'organisation **oui** et l'événement
**non** sur la page de liste — une fonction qui renverrait toujours `[]`
passerait les gardes d'absence, une qui renverrait tout passerait celles de
présence, aucune ne passe les deux. Et en pointant les gardes sur une page sans
fiche, **6 des 9 rougissent**.

**Ce qui n'est PAS mesuré ici, et c'est écrit** : la fiche `Article` n'a jamais
été vue sur un article réel — Sanity n'a pas de projet configuré dans cet
environnement (angle mort 6), la page rend son panneau dégradé. Ce qui est
vérifié, c'est son **absence** là où elle serait fausse, plus le constructeur
lui-même en test unitaire. Le jour où un CMS sera branché, la garde du rendu
dégradé deviendra fausse et devra être reprise : c'est voulu, elle date l'état
de la dépendance.

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

### F-01 — la suite n'est plus verte par chance d'ordonnancement

**Vérification** : **30 graines mélangées consécutives, aucun échec.** Avant
correctif, six sur dix rougissaient.

Le correctif annoncé — `spy.mockRestore()` au lieu de `vi.restoreAllMocks()`,
qui ne restaure pas un espion posé sur l'instance `window.localStorage` sous
happy-dom — a été appliqué. Mais le balayage en a révélé **un second défaut
d'isolation, que l'audit n'avait pas vu** :

`input-otp` programme un `setTimeout` qu'il n'annule pas au démontage.
`cleanup()` démonte bien le composant, mais la minuterie survit au FICHIER :
elle se déclenche plus tard, appelle `setState`, et trouve un environnement
happy-dom déjà détruit — « ReferenceError: window is not defined », signalée
comme exception non capturée, et le run entier passe en échec **alors que les
771 tests sont verts**.

Mesuré avant/après, pour établir qu'il était bien antérieur et non introduit
par le premier correctif :

| | seed 6 | seed 11 |
|---|---|---|
| sans le correctif de F-01 | 1 échec sur 3 | **3 échecs sur 3** |
| avec | 0 sur 3 | 0 sur 3 |

Minuteries feintes sur ce seul test : ce qui est programmé pendant son
exécution est jeté avec elles, et les assertions étant synchrones, rien d'autre
ne change.

**Et pour que ça ne revienne pas** : `ci.yml` gagne une étape « Tests unitaires
(ordre mélangé) ». La graine est tirée à chaque exécution — c'est le but, on
veut explorer des ordres, pas en figer un. Vitest imprime la graine employée,
et `--sequence.seed=<n>` rejoue exactement le même ordre pour diagnostiquer.
Ce garde-fou n'aurait pas été tenable sans le second correctif : il aurait
rougi au hasard.

### F-06 — la moitié gagnable, et la limite du cadriciel

Le dépôt sert **deux** 404, et elles n'ont pas le même sort :

| Déclencheur | Fichier | HTML servi |
|---|---|---|
| adresse sans route du tout | `src/app/not-found.tsx` | ✅ rendue |
| `notFound()` depuis une route qui matche | `src/app/[locale]/not-found.tsx` | ❌ vide |

**Ce qui est corrigé** : la première. Elle n'existait pas — une adresse sans
route recevait la 404 par défaut de Next, en anglais, sans charte, hors du
site. C'est le reproche que l'audit § 5.1 faisait déjà, et qui n'avait été
traité que pour les `notFound()`. Elle est désormais bilingue (ce fichier vit
hors du segment `[locale]` : il n'a aucun contexte de langue, et deviner
d'après l'URL serait faux la moitié du temps), rendue dans le HTML, **lisible
sans JavaScript — 161 caractères mesurés**, avec un retour vers chaque langue.

**Ce qui ne l'est pas, et pourquoi.** La 404 localisée reste vide sans
JavaScript. Trois hypothèses ont été écartées par la mesure :

1. *la suspension du composant* — une version synchrone, sans traduction,
   donne exactement le même vide ;
2. *la place du fichier* — une `not-found` posée à la RACINE ne change rien
   pour ce cas, alors qu'elle est bien rendue pour une adresse sans route ;
3. *la coquille du layout* — son `<head>` est rendu, son `<body>` ne contient
   ni en-tête, ni pied de page, ni texte : `<div>` et scripts seulement.

C'est donc un comportement de Next 16.3.5 : une 404 levée par `notFound()`
depuis une route qui matche n'émet pas son contenu dans le HTML. Aucun
correctif userland ne le contourne sans renoncer à autre chose.

**L'arbitrage qui reste, et qui ne m'appartient pas.** Trois routes ont un jeu
de paramètres FERMÉ (`rapports/[year]`, `thematiques/[slug]`,
`evenements/[slug]`). En leur posant `dynamicParams = false`, un paramètre
inconnu cesse de matcher — ~~et la 404 redevient rendue dans le HTML~~.

> **RÉFUTÉ PAR LA MESURE (24/09).** Cette dernière affirmation était une
> hypothèse, écrite au présent de l'indicatif comme si elle avait été
> vérifiée. Elle ne l'avait pas été. Posé sur les trois routes et mesuré :
> **18 caractères lisibles sans JavaScript avant comme après**, contre 194
> pour une adresse sans route du tout. Une frontière `not-found` posée au
> niveau du SEGMENT — quatrième hypothèse, que l'audit n'avait pas testée —
> ne change rien non plus. Le comportement de Next 16.3.5 ne dépend ni du
> drapeau ni de l'emplacement de la frontière : tout `notFound()` levé depuis
> une route qui matche n'émet pas son contenu. Le client avait tranché en
> faveur de ce correctif le 23/09 ; il a été **retiré**, puisqu'il ne change
> rien pour un visiteur. Une piste subsiste, non explorée : une réécriture au
> niveau du middleware vers une vraie route « introuvable » localisée, qui
> rendrait une page normale avec le statut 404. Elle demande un vrai
> développement, et une mesure avant toute promesse.

Le reste du paragraphe décrit ce qu'on aurait payé, si le gain avait existé : Prix à
payer : ces trois routes servent alors la 404 racine, sans l'en-tête ni le pied
de page du site, dans une page bilingue plutôt que dans la langue du visiteur.
Et cela ne ferait rien pour `bibliotheque/[slug]`, `le-reseau/[slug]` ni
`tribune/[id]`, dont les paramètres viennent de Convex — donc trois routes
gagneraient là où trois autres resteraient en l'état, ce qui remplace un défaut
uniforme par une incohérence. C'est un choix de produit, pas de code.

### F-07 et les zones défilantes — ce qui était hors de portée du clavier

**Une attribution à corriger d'abord.** En rendant compte de ces deux
constats, j'ai d'abord annoncé « F-07 sur trois pages, dont `/fr/adhesion` ».
C'était faux : j'avais fusionné les violations de toutes les pages avec un
`sort -u` avant de les rattacher. Le détail par page dit autre chose — et le
présent rapport, lui, avait raison depuis le début.

| Page | Violation |
|---|---|
| `/fr/connexion`, `/fr/connexion-otp` (desktop + mobile) | `link-in-text-block` |
| `/fr/adhesion`, `/fr/barometre` (mobile) | `scrollable-region-focusable` |

**F-07** : « Pas encore de compte ? *Rejoindre* » portait `hover:underline`.
Au repos, seule la teinte séparait le lien de la phrase. Le survol ne compte
pas — il n'existe ni au clavier, ni au toucher, ni pour qui ne distingue pas
ces deux teintes (WCAG 1.4.1). Souligné par défaut désormais, vérifié sur le
**style calculé au repos** et non sur la présence de la classe.

**Zones défilantes** : un `<div class="overflow-x-auto">` nu défile à la souris
et pas au clavier. Ce qui dépasse devient littéralement inatteignable sans
souris, et sur un tableau ce sont des colonnes entières de données. Mesuré en
petit écran :

| Tableau | Débordement |
|---|---|
| Classement du baromètre | **129 px** |
| Jeux de données du baromètre | **292 px** |
| Comparatif de l'adhésion | **158 px** |

Une enveloppe partagée (`src/components/ui/scrollable-region.tsx`) rend la zone
focalisable **et la nomme** : créer un arrêt de tabulation vers une boîte
anonyme n'est guère mieux que de ne pas pouvoir y entrer. Le nom réutilise le
titre que la section porte déjà — aucune chaîne en dur, aucune clé de
traduction nouvelle. Rendu côté serveur, sans JavaScript.

Trois tableaux d'administration avaient le même défaut, mot pour mot. Ils sont
**hors du périmètre mesuré** (pages derrière authentification, absentes du
scan) mais ont été corrigés : livrer l'enveloppe en laissant trois occurrences
identiques du bogue qu'elle corrige n'aurait pas tenu debout. Il ne reste
**aucun** `overflow-x-auto` nu dans `src/`.

**Ce qui est testé, c'est le résultat.** La règle axe se satisfait d'un
`tabindex` : elle ne vérifie jamais qu'on atteint les colonnes hors écran.
`audit/specs/22-a11y-correctifs.spec.ts` appuie sur la touche et regarde
`scrollLeft` bouger (0 → 80 sur le classement). Garde vérifié non vacant par un
retour en arrière réel suivi d'une reconstruction : zéro zone déclarée,
`text-decoration-line: "none"`, les quatre tests rougissent.

### F-08 — neuf avis de dépendances ramenés à un

L'audit en comptait dix ; le monde avait bougé entre-temps, il en restait neuf.

| Paquet | Traitement |
|---|---|
| **postcss** | `^8.5.23` **et** un override `postcss@8` |
| **vitest** | `^4.1.11` (lui-même et `@vitest/mocker`) |
| **overrides** | bornés au majeur, comme les sept déjà présents : `dompurify@3`, `baseline-browser-mapping@2`, `valibot@1`, `@sanity/uuid@3` |

**Le point qui ne se lisait pas dans la liste** : remonter la dépendance
directe ne suffisait PAS. `@tailwindcss/postcss` gardait une copie imbriquée en
8.5.15, hors de portée du plancher — et c'était le **seul avis haut** de
l'arbre. Il a fallu l'override pour l'atteindre. Sans cette vérification,
j'aurais annoncé le haut corrigé alors qu'il était encore là.

`@sanity/uuid@3.0.3` méritait sa recherche : un simple **patch**, qui tire
`uuid@11.1.1` et supprime l'instance 8.3.2 sans override cross-majeur sur
`uuid`.

**Reste un avis, assumé et documenté dans `ci.yml`** : `GHSA-w5hq-g745-h8pq`
(uuid < 11.1.1, modéré) par `sanity > @sanity/cli > typeid-js > uuid`.
`typeid-js@1.2.0` est la dernière version publiée et dépend de `uuid ^10.0.0` —
aucun correctif amont. Le chemin est celui de la CLI Sanity, qui ne s'exécute
ni dans le serveur Next ni dans le paquet navigateur, et l'avis vise `v3/v5/v6`
appelés avec un `buf` quand `typeid-js` génère du v7.

**Le seuil de la CI reste à `high`, volontairement.** Le dépôt a écrit
pourquoi : un avis publié en amont peut faire rougir ce job sans qu'une ligne
ait changé, et l'abaisser confondrait « le code est cassé » et « le monde a
bougé ». Cet argument ne devient pas faux parce que l'arbre est propre
aujourd'hui.

### F-09 — cinq formulaires, pas deux

**Le constat sous-estimait la surface.** Le pentest nommait `newsletter` et
`events` ; l'inventaire en trouve **cinq** — `newsletter`, `events`,
`mentorship`, `youth`, `eventReminders`. Toutes des actions PUBLIQUES, non
authentifiées, toutes rendant `already: true/false`.

Une seule requête suffisait donc pour savoir si une adresse donnée figure dans
nos listes : appartenance à un réseau, inscription à un événement. Les plafonds
par IP et par formulaire ralentissent une énumération de masse ; ils ne coûtent
rien à une vérification ciblée.

La distinction reste dans la mutation **interne**, qui en a besoin pour ne pas
dupliquer ni recompter. Elle ne franchit plus la frontière publique. Rien n'est
perdu côté produit : vérifié sur les cinq, **aucun formulaire ne lisait
`already`** — tous affichent le même message de succès.

**Ce qui est testé n'est pas « le drapeau a disparu »** : c'est que les deux
réponses soient INDISCERNABLES, comparées entières et sérialisées
(`convex/existence-oracle.test.ts`). Un test sur l'absence du champ passerait
encore le jour où la distinction reviendrait sous un autre nom — `status:
'existing'`, un code d'erreur, un champ en plus. Vérifié non vacant : oracle
réintroduit, 5 des 10 tests rougissent en montrant la fuite exacte.

### F-10 — une panne Sanity rendait une page blanche

| | Avant | Après |
|---|---|---|
| Statut | 500 | **200** |
| Lisible sans JavaScript | **0 caractère** | **695 caractères** |
| Indexation du rendu dégradé | — | **`noindex, follow`** |

La page relançait l'erreur pour atteindre `error.tsx` — sauf qu'une frontière
d'erreur est un composant **client** : son contenu n'arrive que par la charge
utile RSC. La même panne sur `/fr/bibliotheque/…` rendait déjà 671 caractères
lisibles depuis F-02. Deux backends, deux comportements, et le pire des deux
sur la seule page adossée à Sanity.

**L'objection SEO du commentaire d'origine était juste, et elle est traitée,
pas écartée.** `generateMetadata` pose `noindex` sur le **seul** rendu dégradé,
pour qu'un moteur de passage pendant la panne ne remplace pas l'article par le
panneau « indisponible » dans son index. Sur un article réellement absent,
aucun `noindex` — la page rend son 404 et garde son référencement.

*Ce que je n'ai pas pu vérifier* : les branches « article présent » et « article
absent » de bout en bout, faute de projet Sanity joignable. Elles sont tenues
par `tests/unit/actualites-degradation.test.ts`, qui exerce les trois issues de
`generateMetadata` avec un client simulé — vérifié non vacant : sans le
correctif, 2 des 4 tests rougissent, les 2 autres verrouillent ce qui ne doit
pas changer.

*Au passage* : `@dt-sanity` manquait aux alias de vitest. Tout module qui en
dépend échouait à l'**import**, donc avant la moindre assertion — c'est ce qui
obligeait `seo-coherence.test.ts` à analyser le texte source au lieu
d'importer.

### F-13 — l'en-tête se décalait de 104 px sous le doigt — **CLOS**

Détail complet en § 3. **`JoinButton` rendait `null`** le temps que Convex
résolve l'état d'authentification, puis insérait 94 px dans une grappe ancrée à
droite : la bascule de langue et le bouton de recherche sautaient de **104 px
vers la gauche**, après le premier rendu. Un appui visant « EN » partait vers
une position que le bouton venait de quitter — mesuré, la cible réelle du clic
était le conteneur, jamais le bouton.

Le bouton était pourtant **hydraté et fonctionnel** : ce n'était pas un défaut
d'hydratation mais un clic qui rate sa cible.

**Il a fallu deux correctifs.** Le premier — `JoinButton` réservant sa place
pendant le chargement, comme `AuthButton` le faisait déjà — réglait le cas
anonyme et **aggravait de 94 px le cas connecté**, où cette place est ensuite
libérée. Aucune largeur réservée ne pouvait satisfaire les deux : ils n'ont pas
la même largeur finale. `site-header.tsx` lit donc l'authentification au **rendu
serveur** et la transmet aux trois îlots qui changeaient de largeur ; le HTML
servi porte dès lors la mise en page finale, anonyme comme connectée.

    écart servi → établi (anonyme)   103,9 px → 2,4 px → 0 px
    bascule à ×4, 0 ms                  0/40 → 12/12 → 12/12

**Ce que ce paragraphe affirmait avant le 23/09, et pourquoi c'était faux.** Il
disait « le symptôme persiste en CI », sur la foi de la campagne `be86237` et
de ses « quatre clics absorbés ». Ce décompte était **le mien, et il comptait
faux** : le helper relevait comme clic perdu ce qui était une navigation déjà en
vol, `page.url()` ne reflétant l'adresse qu'une fois celle-ci validée. La
signature en était un « déplacement de -998×-20 px » depuis (998, 20), c'est-à-dire
un **rectangle nul** et non une position. Les décomptes « trois par campagne »
puis « quatre » surestiment donc ; rétrospectivement je ne sais pas dans quelle
proportion, les journaux d'alors ne portant pas le mouchard.

Compteur corrigé, **trois campagnes consécutives à zéro clic perdu** :
`3459d11`, `c0e5534`, `76a03dd`. C'était le critère posé. Le cas connecté est
gardé en CI par `tests/e2e/header-stabilite.spec.ts`, qui assertit sa propre
non-vacance — il exige « Déconnexion » dans le HTML servi avant de comparer
quoi que ce soit.

**Cas résiduel assumé** : cookie « connecté » mais jeton expiré — le serveur
rend la variante connectée, le client la corrige, un décalage apparaît. Il n'est
plus systématique.

> Ce passage est resté périmé deux jours après la clôture de F-13, alors que le
> bandeau d'ouverture, le § 3 et le plan d'action disaient tous « clos ». Un
> rapport qui se contredit à trente lignes d'intervalle n'est pas une broutille
> de présentation : c'est la section « ce qui a été corrigé » qui affirmait le
> contraire de la correction.

### Ce que ces correctifs ont fermé au passage

`audit/specs/11-robots-sitemap.spec.ts` passe désormais : le sitemap déclarait
six URLs qui répondaient 500, elles répondent 200.

### Ce qui reste ouvert

**Deux points, et un seul est technique.**

1. ~~**F-13.**~~ **Clos** (§ 3) : décalage de l'en-tête corrigé pour les deux
   cas, gardé en CI, trois campagnes consécutives à zéro clic perdu. Subsiste
   un cas résiduel assumé et documenté — cookie « connecté » mais jeton expiré.
2. **L'arbitrage produit de F-06** — `dynamicParams = false` sur les trois
   routes à paramètres fermés. Ce n'est pas une décision d'ingénierie : on
   échangerait un défaut uniforme contre une incohérence. Elle revient au
   produit.

Reste aussi la vérification manuelle de l'angle mort 7 (variables de prod),
qu'aucun environnement d'audit ne peut faire à la place de quelqu'un ayant les
accès.

**Ajout du 23 septembre — les résidus du pentest.** La liste ci-dessus est
datée du 21 et ne portait que sur les constats F-*. Le rejeu des neuf constats
du pentest (§ 4bis, § 4ter) en laisse trois ouverts, tous écrits :

- **M-5** — la validation du slug d'événement. Le plafond absolu de rappels en
  attente est posé ; valider le slug demande que le backend connaisse la liste
  des événements, qui vit aujourd'hui dans `src/lib/events-content.ts`. C'est
  un choix d'architecture, pas une correction.
- **M-1** — le déni de service et l'oracle d'énumération sur `signUp`. Le
  correctif est écrit mais bloqué par la provisionnalisation des mots de passe
  en E2E.
- **M-6** — faut-il exiger que l'adresse de contact d'une candidature
  « organisation » corresponde au compte déposant ? L'écran dit désormais qui
  sera élevé et signale la discordance ; le durcissement, lui, est un
  arbitrage produit.

### Vérifications passées avant de pousser

`typecheck`, `typecheck:convex`, `typecheck:tests`, `lint`, `format:check`,
`build` : verts. `pnpm install --frozen-lockfile` vérifié aussi, puisque c'est
ainsi que la CI installe.

**787 tests unitaires** (95 fichiers), verts en ordre de déclaration **et** sur
ordres mélangés — 30 graines consécutives lors de F-01, 9 de plus depuis.

**Suite d'audit : 314 passées, 0 échec, code de sortie 0.** Elle était à
270/44 au moment où j'ai cru la lire verte (voir plus bas) ; elle est
désormais entièrement verte, pour la première fois.

**Une erreur de lecture, deux fois.** J'ai lu un bilan Playwright avec un
`tail` trop court et annoncé « 272 passed » : le vrai chiffre était
**270 passed / 44 failed**. Les bilans sont maintenant lus sur la ligne de
compte **et** sur le code de sortie, jamais sur la fin du flux. Aucun de ces 44
échecs n'était une régression — 36 relevaient de ma méthodologie a11y déjà
rétractée, 2 de la limite Next de F-06 exigée comme si elle était corrigeable,
2 de l'état *d'avant* F-05, et 4 de constats réellement ouverts, corrigés
depuis. Le bruit masquait d'ailleurs une vraie trouvaille :
`scrollable-region-focusable` était noyé sous 244 signalements de contraste.
**Un scan bruyant ne fait pas que surestimer — il cache.**

*Note d'outillage* : `NEXT_PUBLIC_*` est figé à la **compilation**. Un rebuild
fait sans ces variables sert des 500 qu'on prend volontiers pour une
régression. Les builds de vérification reprennent les valeurs du § 6.

---

## 1. Verdict

> **Ce verdict est celui du 21 septembre au matin, avant correctifs.** Il est
> conservé tel quel : c'est l'état constaté qui donne sa valeur au rapport.
> **Mise à jour après correctifs en fin de § 1.**

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

### Mise à jour après correctifs (21 septembre, soir)

**Le verdict s'inverse sur les trois blocages nommés ci-dessus.** Les cinq
pages Convex répondent 200 avec du contenu réel, les 48 pages portent leurs
métadonnées de partage, et le baromètre est passé de 12 808 ms à 2 376 ms en 3G
lente. La suite unitaire n'est plus verte par chance d'ordonnancement.

**F-01 à F-10 sont refermés**, F-06 pour moitié seulement — la 404 localisée
reste vide sans JavaScript, et c'est une limite de Next 16.3.5, pas du dépôt.

**Ce qui empêcherait encore de dire « allez-y » n'est pas technique** : la
vérification manuelle des variables de production (angle mort 7), et
l'arbitrage produit de F-06. F-13 ne bloque pas une mise en ligne — c'est une
porte de CI instable, pas un défaut visible par un visiteur — mais sa cause
racine reste inconnue et doit être déclarée comme telle.

### Suite (22 et 23 septembre)

Le paragraphe ci-dessus est daté du 21 au soir et reste tel quel : « la cause
racine reste inconnue » était vrai ce soir-là. Elle ne l'est plus.

**F-13 est CLOS** (§ 0 et § 3). La cause était un décalage de 104 px de
l'en-tête au moment où l'authentification se résolvait ; elle est corrigée pour
le visiteur anonyme comme pour le membre, gardée en CI, et trois campagnes
consécutives affichent zéro clic perdu — le compteur qui donnait les chiffres
précédents comptait faux, et c'est écrit là où il servait.

**F-12 est CORRIGÉ** : les trois routes qu'aucune spec E2E ne citait en ont
une. 227 tests en CI, 0 échec, 0 instable.

**F-01 à F-13 sont donc tous refermés**, F-06 pour moitié seulement.

**L'angle mort 2 est refermé** (§ 4quater) : le viewport mobile est mesuré, le
blocage Chromium est levé pour tout le monde, et le panneau de navigation
mobile — seul chemin de navigation sous 1120 px — est scanné pour la première
fois, puis gardé. La mesure a livré **F-14**, le premier constat NOUVEAU depuis
le 21 : l'accueil masque encore son contenu au rendu serveur, et son LCP mobile
est six fois celui du desktop. Le corriger est un arbitrage de produit.

**Les neuf constats du pentest du 18 septembre ont été rejoués** (§ 4, § 4bis,
§ 4ter) : il ne reste ni 🟡 « probable », ni ⚪ « non vérifié ». Le rejeu a
corrigé le rapport autant qu'il a corrigé le code — M-1 n'est **pas** une prise
de compte (mais le déni de service et l'énumération, eux, sont confirmés), M-2
restait ouvert sur le remplissage, et **les deux « prérequis d'environnement »
qui bloquaient M-6 et M-9 étaient faux** : les deux se vérifient sans navigateur
et sans CMS. Restent ouverts et **écrits comme tels** : la validation du slug
d'événement (M-5, choix d'architecture), la provisionnalisation E2E des mots de
passe (M-1) et l'arbitrage produit de M-6.

**Ce qui empêche encore de dire « allez-y » n'a pas bougé, et n'est toujours
pas technique** : la vérification manuelle des variables de production (angle
mort 7) et l'arbitrage produit de F-06.

### Suite (24 septembre)

Deux choses, et la seconde est la plus utile.

**La ligne P1 n° 4 est close.** Les fiches `Event` et `Article` sont posées et
mesurées sur le HTML servi (§ 0). Ce lot a d'abord corrigé une **contradiction
du rapport lui-même** : le « Correctif » de F-03 les annonçait faites, le plan
d'action les disait à faire. Aucune des deux n'existait.

**Le correctif ouvrait une porte, et c'est lui qui l'a fermée.** Poser du texte
de CMS dans un `<script>` par `JSON.stringify` seul aurait suffi : un titre
d'actualité contenant `</script` sort du bloc, l'analyseur HTML ne regarde pas
les guillemets JSON. Rien n'exploitait cela avant — il n'y avait pas de fiche
de page à servir. C'est donc un défaut qu'on allait **introduire**, attrapé en
l'écrivant, avec son témoin permanent à côté.

Ce que je retiens pour la méthode : ce lot n'a rien mesuré de nouveau sur le
site, il a **relu le rapport** et trouvé deux affirmations en désaccord l'une
avec l'autre. Une contradiction interne est un signal gratuit, et je ne l'avais
pas cherché une seule fois en trois jours.

**Et un quatrième artefact a menti — celui-là était écrit dans ce rapport.**
La recette du § 6 posait `NEXT_PUBLIC_CONVEX_URL` sur `pnpm start`, et sur lui
seul. Or une variable `NEXT_PUBLIC_*` est **inlinée dans le bundle client au
build** : le rendu serveur devenait correct et le client jetait `Missing
environment variable NEXT_PUBLIC_CONVEX_URL`, après quoi Next remplaçait la
page par sa coquille d'erreur. Conséquence, sur une campagne entière :
`html-has-lang` et `document-title` comptés « graves » sur **les 24 pages
publiques**, titres vides sur les 48 du lot SEO, 70 caractères de texte en 3G,
et un scan de contraste rendant **zéro paire** là où la mesure du 24/09 en
trouve 14.

Ce qui rend cette panne-là particulièrement traître : un `curl` sur les mêmes
adresses rend une page **parfaite**, `lang` compris. J'ai d'abord accusé la
charge du conteneur — plausible, et faux. C'est la capture des erreurs de page
dans le navigateur, pas une relecture, qui a donné la réponse en une ligne. Sur
un build correct, les mêmes **81 tests** (24 a11y + 48 SEO + 9 fiches de page)
passent tous : **0 violation grave**.

Le § 6 est corrigé en conséquence : les variables sont **exportées avant le
build**, et le pourquoi est écrit dans la recette elle-même.

**Ce que je corrigerais dans ma propre méthode**, puisque ce rapport sert aussi
à ça : trois de mes erreurs ont été trouvées par la mesure et non par
relecture — un test d'isolation qui n'isolait rien (F-05), un bilan lu sur la
fin du flux au lieu de la ligne de compte (deux fois), et une attribution faite
sur des violations fusionnées avant d'être rattachées (F-07). Les trois ont la
même forme : une conclusion tirée d'un instrument qu'on n'a pas vérifié.

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
| C6 | Sécu | Pentest **M-8** (oracles `already`) | lecture source | 1/1 | ❌ **OUVERT** — voir J4 | `newsletter.ts:91` |
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

**Vérifications des correctifs** — mêmes règles : chaque ligne est une commande
jouée. « Non vacant » signifie que le garde-fou a été vu ROUGIR sur le code
d'avant, et non seulement passer sur le code d'après.

| ID | Constat | Vérification | Résultat |
|---|---|---|---|
| J1 | F-07 | `text-decoration-line` **calculé** au repos, 2 pages × 2 projets | ✅ `underline` — non vacant |
| J2 | zones défilantes | `scrollLeft` après deux flèches, 3 tableaux débordants | ✅ 0 → 80 — non vacant |
| J3 | F-08 | `pnpm audit` avant / après ; `pnpm install --frozen-lockfile` | ✅ 9 avis → 1 ; verrou cohérent |
| J4 | F-09 | réponses **entières sérialisées**, 2 envois × 5 actions | ✅ indiscernables — 5/10 rougissent sans le correctif |
| J5 | F-10 | statut + texte sans JS + balise `robots` | ✅ 200 / 695 car. / `noindex, follow` — non vacant |
| J6 | F-13 | helpers exercés sur page **synthétique** perdant son 1er clic | ✅ 3 propriétés, dont l'échec quand l'effet ne vient jamais |
| J7 | portail | le dialogue n'est plus sous le conteneur appelant | ✅ + régression de focus attrapée par les tests en place |
| J8 | suite d'audit | campagne complète, **code de sortie lu** | ✅ 314 passées, 0 échec, code 0 |
| J9 | suite unitaire | ordre de déclaration + 3 ordres mélangés | ✅ 787 tests, 95 fichiers |
| J10 | M-6 | file de modération relue par la **vraie** query, PoC avant/après | ✅ 1 échec → 3/3 ; gardes permanentes rouges sur le code d'avant |
| J11 | M-9 | 9 variantes de schéma à travers le **vrai** `<PortableText>`, filtre désactivé puis restauré | ✅ 2/6 rouges sans le filtre, 6/6 avec — non vacant |
| J12 | angle mort 2 | suite d'audit sur Pixel 7, instrument mesuré avant les tests | ✅ 165 passées ; 412 px, `pointer: coarse`, tactile, UA Android |
| J13 | menu mobile | scan axe du panneau OUVERT, `<button>` sans nom injecté | ✅ 0 violation grave ; rougit sur `button-name [critical]` — non vacant |
| J14 | WCAG 2.5.8 | exception d'espacement calculée, témoin injecté (2 cibles de 16 px à 10 px) | ✅ 0 non-conformité sur 24 pages ; le témoin est bien détecté |
| J15 | F-14 | `opacity:0` comptés dans le HTML servi de 3 routes | ❌ `/fr` : 7 — `test.fail()` posé, arbitrage produit (§ 3) |
| J16 | F-06 | `dynamicParams = false` posé sur les 3 routes fermées, 404 relue sans JS | ❌ **18 caractères avant comme après** — le remède supposé ne marche pas ; modification retirée |
| J17 | contraste | axe sans exclusion, animations déroulées, 24 pages × 2 thèmes | ✅ 36 clair / 35 sombre ; défaut `data-universe` corrigé -> **21 en sombre** |
| J18 | F-04 | `noindex` et `Disallow` ne se cumulent plus, garde ajoutée | ✅ 5 routes en `noindex`, aucune interdite au crawl — rougit si on les recombine |
| J19 | F-03 (suite) | fiches `Event`/`Article` lues dans le HTML SERVI, par requête HTTP sans navigateur | ✅ 9 gardes ; 6 rougissent pointées sur une page sans fiche — non vacant |
| J20 | sérialisation JSON-LD | un titre CMS portant `</script` passé aux trois blocs | ✅ la séquence ne sort plus ; le témoin montre que `JSON.stringify` seul la laissait sortir |

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
`Organization` global.

> **Correction (24/09).** Cette ligne disait aussi « + `Article`/`Event` sur
> les pages de détail », ce qui était faux : seul `Organization` était posé,
> et la ligne P1 n° 4 du plan d'action le disait correctement (« reste à
> faire »). Les deux fiches de page existent depuis le 24/09 — voir
> « F-03 (suite) » au § 0, qui donne aussi ce qu'elles ne déclarent PAS.

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

### F-01 · MOYENNE · Défaut · L'isolation des tests n'est pas tenue : la suite est verte par ordonnancement — **CORRIGÉ** (§ 0)

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

### F-08 · MOYENNE · Risque · 10 vulnérabilités de dépendances, dont une haute — **CORRIGÉ** (§ 0)

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

> **Depuis** : neuf avis ramenés à un (§ 0). Le point qui ne se lisait pas dans
> ce tableau : remonter la dépendance directe de `postcss` ne suffisait pas —
> `@tailwindcss/postcss` gardait une copie imbriquée en 8.5.15, hors de portée
> du plancher, et c'était précisément le seul avis **haut**. Il a fallu un
> override pour l'atteindre.

### F-06 · FAIBLE · Défaut · La 404 localisée est entièrement vide sans JavaScript — **PARTIEL** (§ 0)

`src/app/[locale]/not-found.tsx`

| Contexte | Texte visible |
|---|---|
| Avec JavaScript | **703 caractères** (« 404 / Page introuvable / … ») ✅ |
| **Sans JavaScript** | **0 caractère** — page blanche ❌ |
| Contre-épreuve `/fr/mentions-legales` | 2 759 caractères ✅ |
| Contre-épreuve 404 par défaut de Next | 255 caractères ✅ |

Captures : `audit/screenshots/404-localisee-{avec,sans}-js-desktop.png` — le
nom porte le projet, les deux projets d'audit jouant la même spec.

Le contenu n'est pas dans le HTML initial — il n'arrive que par la charge utile
RSC, appliquée à l'hydratation. Vérifié sur `/fr/rapports/9999`, qui **ne dépend
pas de Convex** : ce n'est donc pas une retombée du backend indisponible.

À rapprocher de la raison d'être du niveau dev-browser (`TESTING.md`) : deux des
régressions qui l'ont fait naître étaient des pages blanches. Les 24 pages
publiques, elles, rendent toutes correctement sans JS (H1) — la 404 est la seule
exception.

Impact SEO nul (le statut 404 est correct de toute façon) ; impact réel sur les
visiteurs à faible débit ou JS dégradé, précisément la cible du cadrage.

### F-10 · FAIBLE · Défaut · La page de détail d'une actualité rend 500 quand Sanity est indisponible — **CORRIGÉ** (§ 0)

`/fr/actualites/inexistant-xyz` → **500**, alors que la page de liste
`/fr/actualites` dégrade proprement en 200. Le `try`/`catch` de
`actualites/page.tsx:44` n'a pas d'équivalent sur `actualites/[slug]`.
Même correctif que F-02.

> **Depuis** : 200 avec 695 caractères lisibles sans JavaScript, et `noindex,
> follow` sur le seul rendu dégradé (§ 0). Ce que ce constat ne disait pas, et
> qui est le vrai coût : la page ne rendait pas seulement 500, elle rendait
> **zéro caractère** dans le HTML servi — `error.tsx` est un composant client.
> Page blanche, donc, pour qui n'exécute pas JavaScript.

### F-07 · FAIBLE · Défaut · Lien non distinguable dans un paragraphe, sur les deux pages de connexion — **CORRIGÉ** (§ 0)

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

> **Depuis** : souligné par défaut, vérifié sur le style CALCULÉ au repos
> (§ 0). Ce constat visait juste : les deux pages de connexion, et elles
> seules. C'est mon compte rendu ultérieur qui y a ajouté `/fr/adhesion` à
> tort — cette page-là relevait des zones défilantes.

### F-09 · FAIBLE · Risque · Pentest M-8 toujours ouvert : les oracles d'existence subsistent — **CORRIGÉ** (§ 0)

`convex/newsletter.ts:91` et `convex/events.ts:77` renvoient toujours
`{ ok: true, already: true }` lorsque l'adresse est déjà inscrite, et
`already: false` sinon. Un anonyme peut donc tester l'appartenance d'une adresse
à la base — c'est exactement ce que décrivait M-8, et l'action n° 10 du plan de
remédiation (« réponses uniformes ») n'avait pas été appliquée au moment de
l'audit.

Sévérité basse compte tenu du rate-limit désormais en place, mais le point reste
ouvert et doit être déclaré comme tel plutôt que considéré comme traité.

> **Depuis, et ce constat SOUS-ESTIMAIT la surface** : l'oracle n'était pas sur
> deux fonctions mais sur **cinq** — `newsletter`, `events`, `mentorship`,
> `youth`, `eventReminders`, toutes des actions publiques non authentifiées.
> Les cinq rendent désormais une réponse identique que l'adresse soit connue ou
> non (§ 0). J'avais repris le périmètre du pentest sans l'inventorier
> moi-même : la même erreur que sur F-02, où cinq pages annoncées en valaient
> neuf.

### F-13 · MOYENNE · Risque · La suite E2E est instable sur les dialogues — **CLOS**

Le workflow `e2e.yml` a joué la suite **deux fois sur le commit `1390107`**, à
huit minutes d'intervalle, sans aucune modification entre les deux. Résultat :

| Exécution | Résultat | Test concerné |
|---|---|---|
| 1re (01:02, `1390107`) | 212 passés, **1 en échec** | `admin-recherche.spec.ts:153` — `locator.click` sur le bouton du dialogue de confirmation : *element is not stable*, réessai jusqu'au timeout de 45 s |
| 2de (01:11, `1390107`) | 212 passés, **1 « flaky »** | `search.spec.ts:14` — `getByRole('dialog', { name: 'Rechercher sur le site' })` jamais visible, puis vert à la reprise |
| 3e (01:56, `d29c1da`) | 212 passés, **1 « flaky »** | `mobile-nav.spec.ts:48` — le lien « Jeunes » jamais visible après le clic sur la bascule du menu mobile, puis vert à la reprise |
| 4e (06:03, `21cf456`) | 211 passés, **1 échec + 1 flaky** | `admin-recherche.spec.ts:153` à nouveau (échec dur), et `mobile-nav.spec.ts:48` (flaky) |
| 5e (relance, `21cf456`) | vert | — |

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

**Trois hypothèses écartées par la mesure** (et non par raisonnement) :

1. *un ancêtre porteur d'un `transform`* qui capturerait le `fixed` du
   dialogue — il n'y en a aucun dans `src/components/admin/**` ;
2. *une course à l'hydratation* — le correctif F-05 fait peindre la page avant
   hydratation, donc élargit la fenêtre d'un clic qui ne déclenche rien.
   Rejoué 5 fois en local puis 9 fois avec le processeur bridé ×1, ×4 et ×10 :
   tout passe ;
3. *la gouttière de barre de défilement*, qui recentrerait un dialogue
   `mx-auto` à chaque changement de hauteur — `scrollbar-gutter: stable` est
   déjà posé dans `globals.css`, avec un commentaire qui vise ce risque.

Reste, sur cinq campagnes : trois avec une défaillance, jamais deux fois le
même test d'affilée, toujours un panneau qui s'ouvre au clic. Le taux est
d'environ 1 test sur 213 par campagne.

**Ce que j'ai écarté aussi** : l'hypothèse d'un ancêtre porteur d'un `transform` qui
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

---

#### Mise à jour : une quatrième occurrence, et le constat se scinde

La CI du commit `2c08208` a rendu une **quatrième** défaillance —
`home.spec.ts:25`, le **sélecteur de langue**. Clic sur « EN » dans la
bannière, puis l'URL reste sur `/fr` : treize sondages.

**Ce n'est pas un panneau qui s'ouvre.** Le cadrage ci-dessus — « toujours un
panneau qui s'ouvre au clic » — est donc **faux**. Ce que les occurrences
partagent est à la fois plus large et plus précis : un **clic dont l'effet ne
se produit jamais**. Et trois des quatre ont exactement la même forme :
`page.goto()` suivi immédiatement d'un clic.

| Famille | Occurrences | Erreur |
|---|---|---|
| **A — effet jamais produit** | `search.spec:14`, `mobile-nav:48`, `home.spec:25` | l'assertion réessaie et n'aboutit pas |
| **B — boîte instable** | `admin-recherche:153` | *element is not stable*, en plein parcours chargé |

**Deux pistes de plus, écartées par la mesure :**

4. *l'animation d'entrée*. « element is not stable » est précisément ce que
   Playwright émet quand une boîte bouge encore entre deux images, et
   `reducedMotion` n'est posé nulle part globalement. Mais **aucun** des trois
   panneaux n'anime son entrée — rien que des `transition-colors`, qui ne
   déplacent aucune boîte.
5. *« lent » est exclu pour la famille A*. Les assertions qui ont échoué
   RÉESSAIENT : un panneau simplement lent les satisfait. Elles ne peuvent
   échouer que si le clic n'a produit **aucun** changement d'état. Le constat
   d'origine traitait les quatre comme une seule attente ; elles ne sont pas de
   la même nature.

**Un défaut réel trouvé, et corrigé pour lui-même** : `mobile-nav.tsx`
refermait le menu **au montage**. Un effet à dépendances court aussi au premier
rendu, donc un appui qui atterrit entre l'attachement du gestionnaire et le
vidage des effets est pris puis annulé. **NON REPRODUIT** — 45 tentatives,
processeur bridé jusqu'à ×6, navigation rendue au plus tôt (`waitUntil:
'commit'`) : le menu s'ouvre à chaque fois. Ce correctif n'est donc pas la
cause de F-13. Il tient tout seul : un effet qui dit « referme à chaque
NAVIGATION » ne doit pas s'exécuter quand il n'y a pas eu de navigation, et la
fenêtre qu'il ouvrait est d'autant plus large que l'appareil est lent —
c'est-à-dire chez le premier public visé. `locale-switcher.tsx`, lui, n'a aucun
effet de montage : rien à annuler.

**La piste 2 est appliquée** : `ConfirmDialog` passe par un portail. Ce
changement a introduit une régression que les tests unitaires en place ont
attrapée — le panneau n'existant pas au premier rendu, l'effet de focus ne
trouvait plus personne et le focus n'allait plus sur « Annuler », donc une
touche Entrée retombait sur l'action destructrice, exactement ce que cette
boîte existe pour empêcher. Corrigé, et deux tests épinglent le portail.

**Le symptôme est mitigé, pas effacé.** `tests/e2e/_panneau.ts` fournit deux
helpers — `ouvrirPanneau` (famille A avec un panneau) et `cliquerJusqua`
(famille A sans élément localisable, comme une URL). Ils ne re-cliquent que
tant que l'effet ne s'est pas produit — jamais deux fois sur une bascule déjà
ouverte — et **impriment le nombre d'essais** : une ligne
`[F-13] <nom> : N clics ont été nécessaires` dans le journal de CI dit que le
symptôme s'est produit et a été absorbé. Si l'effet ne vient jamais, le test
échoue comme avant. La suite E2E n'étant pas jouable dans l'environnement
d'audit, ils ont été vérifiés sur une page **synthétique** qui perd son premier
clic : les trois propriétés passent, y compris celle qui les empêche d'être une
mise sous le tapis.

**Le journal complet a été récupéré, et il a parlé.** Ces lignes s'impriment
tôt (`home.spec` passe tôt), donc aucun `tail` ne pouvait les voir ; le
téléchargement direct de l'artefact est refusé par la politique réseau de
l'environnement. Il a fallu passer par le contenu du job. Résultat, sur la
campagne du commit `148d099` :

```
[F-13] bascule de langue FR -> EN : 2 clics ont été nécessaires
```

**Le symptôme s'est produit et a été absorbé** — et, dans la MÊME campagne,
`home.spec.ts:13` a rougi (flaky) avec exactement la même erreur : attendu
`/en`, reçu `/fr`. Deux occurrences dans un seul run, sur le même geste. Le
sélecteur de langue pèse désormais **trois des six** occurrences connues.

---

#### Mise à jour : le constat se reproduit, en trente secondes

C'est la concentration ci-dessus qui a permis de le prendre. Le levier n'est
pas le hasard, **c'est le processeur**. Dans les conditions exactes des specs
(`page.goto()` par défaut), sur le même build :

| Bridage processeur | Bascules abouties |
|---|---|
| ×1 | **40/40** |
| ×4 | **0/40** |
| ×10 | **0/40** |

Un runner GitHub est plus lent que cette machine sans l'être autant qu'un
bridage ×4 : d'où le taux d'environ un test sur 213, et d'où l'impossibilité de
reproduire à la main jusqu'ici. `audit/specs/25-f13-reproduction.spec.ts`
versionne la mesure.

**Et ce n'est pas un défaut de test.** Sur un téléphone lent, le premier appui
sur « EN » ne fait rien, sans le moindre retour — le premier public visé par le
cadrage.

#### Ce que ce n'est PAS — quatre pistes fermées par la mesure

**1. Une lenteur.** À ×1 la bascule aboutit en 0,54 à 0,76 s (six mesures). À
×4, elle n'aboutit **jamais** : l'URL est encore `/fr` après vingt secondes
d'attente. Le clic est perdu, il n'est pas en retard.

**2. `useSearchParams()`.** `LocaleSwitcher` lit ce hook de RENDU alors que sa
valeur ne sert qu'au clic — piste séduisante, correctif d'une ligne
(`window.location.search` dans le gestionnaire). Mesuré après reconstruction :
**toujours 0/40**. Le changement a été **annulé**. Expédier un correctif avec
une justification fausse est pire que ne rien expédier.

**3. Le composant — et ici c'est MOI qui me trompais.** J'ai d'abord annoncé
que `LocaleSwitcher` perdait le clic là où `MobileNav` ne le perdait pas
(0/20 contre 20/20 à ×4), et j'en ai conclu que quelque chose distinguait ces
deux composants. **Ma comparaison opposait un contrôle desktop à un contrôle
mobile.** À viewport égal, sur la même page, au même instant :

| Geste, desktop, ×4 | à 0 ms | à 500 ms |
|---|---|---|
| ouvrir la palette de recherche (**état local**) | ✗ | ✓ |
| basculer la langue (**navigation**) | ✗ | ✓ |

Ils meurent et ressuscitent **ensemble**. La nature du geste n'y est pour rien,
le composant non plus. C'est le second test de
`audit/specs/25-f13-reproduction.spec.ts`, et son assertion ne porte pas sur
l'échec mais sur le fait que les deux se comportent pareil — c'est ce qui
disqualifie « c'est ce composant-là ».

**4. Le poids de la page.** `/fr/mentions-legales`, bien plus légère que
l'accueil, se comporte à l'identique : 0/3 à 0 ms, 3/3 à 500 ms.

#### La comparaison appariée — je la cherchais au mauvais endroit

J'écrivais ici qu'aucune comparaison strictement appariée n'était possible,
faute de contrôle cliquable aux **deux** viewports. C'était vrai, et hors
sujet : la paire appariée n'est pas entre deux viewports, elle est entre le
**haut** et le **bas** de la même page.

Au même viewport, au même bridage ×4, sur la même page, sans aucune attente :

| contrôle | position | clic dispatché | abouties |
| --- | --- | --- | --- |
| bascule de langue | en-tête | 1037 ms | **0/6** |
| bouton de thème | pied de page | 1060 ms | **5/5** |

Les deux colonnes viennent de sondes distinctes — l'une chronomètre le
dispatch, l'autre compte les aboutissements — jouées dans des conditions
identiques ; le test versé au dépôt, lui, mesure les deux taux dans une même
exécution (0/3 contre 3/3).

À 23 ms près c'est le même instant, pour des résultats opposés et
déterministes. Quatre explications tombent avec cette seule mesure :

- **« le clic arrive trop tôt »** — non : les deux arrivent ensemble ;
- **« il faut défiler jusqu'au pied de page, donc il attend »** — le retard est
  de 23 ms, pas de 500 ;
- **« c'est d'être rendu par le serveur »** — le bouton de thème et l'envoi du
  formulaire de contact sont dans le HTML serveur au même titre que la bascule
  de langue, et aboutissent tous deux dès 0 ms (5/5 et 6/6). La règle est
  fausse ;
- **le remplacement du nœud par React** — la sonde précédente le *suggérait*,
  et je la disais moi-même non vérifiée. Instrument refait : une marque posée
  en **propriété JS** sur le bouton (invisible de React, donc sans risque de
  provoquer la divergence qu'elle cherche) **survit au clic des deux côtés**.
  Réfutée.

S'y ajoute : **zéro message en console, zéro `pageerror`** pendant un clic
perdu. La perte est parfaitement silencieuse.

Restait une question : **pourquoi l'en-tête ?** La réponse tient en une
mesure, et elle ne parle pas d'hydratation du tout.

#### La cause : l'en-tête se décale de 104 px sous le doigt

Instrumenté au moment précis du clic, **la cible réelle n'est pas le bouton**,
mais `div.hidden.items-center.gap-2` — son conteneur. Et le bouton, lui, porte
bien ses props React : il est **hydraté et fonctionnel**. Ce n'est donc pas un
clic perdu faute de gestionnaire, c'est un clic **qui rate sa cible**.

| | |
| --- | --- |
| position de la bascule dans le HTML servi | x = **1102** |
| point calculé par Playwright | x = **1118** (centre du bouton) |
| position de la bascule **au moment du clic** | x = **998** |
| écart | **104 px vers la gauche** |

`JoinButton` rendait `null` le temps que Convex résolve l'état
d'authentification (`join-button.tsx`), puis insérait un bouton de 94 px dans
une grappe **ancrée à droite** (`ml-auto`, `site-header.tsx:41`) : tout ce qui
la précède recule d'autant. Playwright calcule les coordonnées, puis dispatche ;
sous bridage, l'en-tête reflue entre les deux. Un visiteur sur téléphone lent
vit exactement la même chose : l'en-tête se réorganise sous son doigt.

`AuthButton`, juste à côté, réservait déjà sa place (`h-5 w-16`). C'est ce
voisinage qui a fini par rendre l'écart lisible.

**Ce que cette cause explique, et qui était resté ouvert :**

- pourquoi le **pied de page** répondait au même instant — il ne reflue pas ;
- pourquoi la bascule du **menu mobile** répondait dès 0 ms — la grappe qui
  bouge est `hidden` sous 1120 px ; mesuré, la bascule mobile **ne se déplace
  pas d'un pixel** ;
- pourquoi un geste d'**état local** et un geste de **navigation** mouraient
  ensemble — ils sont voisins dans la grappe qui se déplace ;
- pourquoi un **second clic** aboutissait — il repart de coordonnées fraîches,
  ce que font précisément les helpers de `tests/e2e/_panneau.ts` ;
- pourquoi la fenêtre était **proportionnelle à la lenteur** de la machine —
  plus Convex tarde, plus le reflux est tardif ;
- pourquoi **rien** n'apparaissait en console — un clic sur un `div` ne produit
  rien.

**Le correctif et sa preuve.** `JoinButton` réserve sa place pendant le
chargement via `invisible` (`visibility: hidden`), qui conserve la boîte — donc
la largeur exacte dans toutes les langues, sans avoir à la deviner — et retire
l'élément du parcours au clavier et de l'arbre d'accessibilité.

| bridage | avant | après |
| --- | --- | --- |
| ×1 | 40/40 | **12/12** |
| ×4 | **0/40** | **12/12** |

**Garde de non-régression** : `tests/e2e/header-stabilite.spec.ts`, jouée en
CI. Elle compare deux états **déterministes** — la mise en page servie
(JavaScript désactivé) et la mise en page établie — plutôt que de faire la
course avec l'hydratation, ce qui l'aurait rendue vacante sur une machine
rapide. Vue **rougir sur le code d'avant (103,9 px)** et verte après
(**2,4 px**). Le résiduel de 2 px est l'écart entre le gabarit d'`AuthButton`
(64 px) et le lien « Connexion » (66 px).

#### Le cas connecté : l'état d'authentification lu au rendu serveur

La réservation de place ne réglait que le cas anonyme, et **aggravait** le cas
connecté : la place réservée y était ensuite libérée (`isAuthenticated` →
`null`), ce qui ajoutait 94 px à un mouvement qui existait déjà —
`NotificationBell` apparaissant (36 px) et `AuthButton` passant d'un gabarit de
64 px à « Espace membre · Déconnexion », bien plus large.

Aucune largeur réservée ne peut satisfaire les deux cas : ils n'ont pas la même
largeur finale, et la deviner serait faux dans une langue sur deux. **La seule
correction juste est de savoir, au rendu serveur, à qui l'on s'adresse.**

`site-header.tsx` est donc devenu un composant **asynchrone** : il lit
`isAuthenticatedNextjs()` et transmet la réponse aux trois îlots qui changeaient
de largeur. Le HTML servi porte dès lors la mise en page **finale**, pour un
visiteur anonyme comme pour un membre.

**Ce que cela coûte : rien.** Lire le cookie rend la page dynamique — mais ce
site l'est déjà entièrement. Vérifié dans `prerender-manifest.json` : quatre
routes prérendues (`_not-found`, `_global-error`, `icon.png`, `robots.txt`), et
**aucune page réelle**. Le middleware (`src/proxy.ts`) et
`ConvexAuthNextjsServerProvider` lisent déjà ce cookie.

**Mesuré.** Le résiduel de 2,4 px du cas anonyme disparaît lui aussi, puisque
le serveur rend « Connexion » au lieu du gabarit :

| | avant | réservation de place | lecture serveur |
| --- | --- | --- | --- |
| écart servi → établi (anonyme) | 103,9 px | 2,4 px | **0 px** |
| bascule à ×4, 0 ms | 0/40 | 12/12 | **12/12** |

**Le cas connecté est gardé en CI**, dans le même fichier, avec une session qui
lui est propre (règle de `_sessions.ts` : un fichier, sa session). Il n'est
mesurable que là — l'environnement d'audit n'a aucun déploiement Convex. Et il
**assertit sa propre non-vacance** : si la session était perdue, il comparerait
deux fois la mise en page anonyme et passerait sans rien vérifier ; il exige
donc que « Déconnexion » figure dans le HTML servi avant de comparer quoi que
ce soit.

**Cas résiduel assumé** : si le cookie dit « connecté » mais que le jeton est
expiré, le serveur rend la variante connectée et le client la corrige — un
décalage subsiste alors. C'est strictement mieux qu'auparavant, où il était
systématique.

#### Le symptôme se produit à chaque campagne

Le journal complet de trois campagnes consécutives porte la même ligne :

```
[F-13] bascule de langue FR -> EN : 2 clics ont été nécessaires
```

`2c08208`, `148d099`, `07f8ba1` — trois fois sur trois. Ce n'est donc pas un
accident rare : **c'est routinier**, et seul le helper le rendait invisible.
Sur `2c08208`, le test voisin `home.spec.ts:13`, qui fait le MÊME geste sans
garde, a d'ailleurs rougi. Il a été protégé depuis ; la campagne `07f8ba1` est
la première à finir **213 passés, 0 instable**.

Le décompte par campagne monte à mesure que les gardes couvrent le geste :
`0655b98` en portait **trois** (2 bascules de langue, 1 palette de recherche),
et `286965a` en porte **quatre**, toutes sur la bascule de langue :

```
[F-13] bascule de langue FR -> EN (accueil) : 2 clics ont été nécessaires
[F-13] bascule de langue FR -> EN : 2 clics ont été nécessaires
[F-13] bascule de langue FR→EN (bibliothèque filtrée) : 2 clics ont été nécessaires
[F-13] bascule de langue FR→EN (recherche) : 2 clics ont été nécessaires
```

Les deux dernières sont les gardes posées sur `locale-switch.spec.ts` : elles
ont servi **dès la première campagne qui les exerce**. Sans elles, ces deux
tests étaient exposés au rouge exactement comme `home.spec.ts:13` sur
`2c08208`. Campagne verte : **213 passés, 0 instable**.

**Et après le correctif du décalage, `be86237` en porte quatre de plus** — une
sur `home.spec.ts`, et les trois sites de `locale-switch.spec.ts`, `le-reseau`
compris, qui n'avait encore jamais figuré :

```
[F-13] bascule de langue FR -> EN : 2 clics ont été nécessaires
[F-13] bascule de langue FR→EN (bibliothèque filtrée) : 2 clics ont été nécessaires
[F-13] bascule de langue FR→EN (recherche) : 2 clics ont été nécessaires
[F-13] bascule de langue FR→EN (le-reseau) : 2 clics ont été nécessaires
```

J'attendais qu'elles tombent à zéro. Elles n'ont pas bougé. Le décalage mesuré
était réel et il est corrigé — **il n'était pas la seule cause**, et ce qui
reste ne se reproduit pas sur la machine d'audit.

Vérifié avant d'accuser l'instrument : sans bridage, `cliquerJusqua` ne compte
**aucun** clic supplémentaire sur ce même geste (quatre essais, 227 à 353 ms).
Son compteur ne surestime donc pas — ces quatre lignes sont des premiers clics
réellement sans effet.

**La campagne suivante, `4c63040`, la première instrumentée, en compte deux** —
les deux sur `home.spec.ts`, les trois sites de `locale-switch.spec.ts` ayant
disparu. Campagne verte : **214 passés, 0 instable** (le total confirme au
passage que la garde de stabilité tourne bien).

Deux réserves, et aucune ne doit être arrondie :

- **le mouchard n'a rien dit.** `boundingBox()` rend `null` dès qu'il juge
  l'élément non visible, et le verdict restait alors vide — un instrument muet,
  soit précisément le mode de défaillance que ce constat traque. Corrigé : il
  lit maintenant `getBoundingClientRect` et parle même quand il échoue ;
- **la sonde peut avoir déplacé le résultat.** Mesurer avant chaque clic ajoute
  un aller-retour, donc du temps. Le compte passe de quatre à deux dans la
  campagne même où la sonde apparaît. Une campagne ne permet pas de distinguer
  cela de la variance ordinaire ; il en faudra plusieurs.

**La campagne `0dda6c3` est la première à répondre**, et elle donne deux
réponses différentes :

```
[F-13] bascule de langue FR -> EN : 2 clics — le déclencheur s'était déplacé de -998×-20 px
[F-13] … (bibliothèque filtrée)  : 2 clics — sans déplacement du déclencheur
[F-13] … (recherche)             : 2 clics — sans déplacement du déclencheur
```

Pour les deux sites de `locale-switch.spec.ts`, **le bouton n'a pas bougé** :
ce qui reste n'est donc pas un décalage, c'est un autre mécanisme. La piste du
reflux est épuisée pour ces cas-là.

Le `-998×-20` de `home.spec.ts`, lui, est trop grand pour un reflux d'en-tête —
c'est la signature d'une mesure prise sur un document **déjà en cours de
navigation**. Auquel cas le premier clic avait porté et le compteur
surestime. Une seule donnée les sépare : l'URL au moment de chaque clic, que le
mouchard relève désormais. Validé contre un cas connu — la page synthétique de
`24-helper-panneau.spec.ts`, qui avale réellement le premier clic sans naviguer,
imprime « sans déplacement, **URL inchangée** ».

#### Le compteur comptait faux — correction

La campagne `6d9ba83` n'a plus qu'une ligne, et elle porte enfin tous les
éléments :

```
(recherche) : 2 clics — le déclencheur s'était déplacé de -998×-20 px, URL inchangée
```

Mesuré localement, la bascule est à **x = 998, y = 20**. Un « déplacement » de
`-998×-20` l'amène donc exactement à **(0, 0)** : ce n'est pas une position,
c'est un **rectangle nul** — ce que rend un élément d'un document qui n'a pas
encore fait sa mise en page. Vérifié au passage : il n'existe qu'**un seul**
bouton `lang="en"` dans l'en-tête, donc aucune confusion avec une copie masquée.

La séquence réelle est donc : le premier clic lance la navigation ; `page.url()`
ne reflète l'adresse qu'une fois celle-ci validée, donc le prédicat reste faux ;
le helper reclique — sur le document suivant, pas encore mis en page. **Le
premier clic avait porté.**

**Ce que cela corrige dans ce rapport.** Les décomptes « trois par campagne »,
puis « quatre », que j'ai mis en avant, **surestiment** : ils mêlaient des clics
réellement perdus et des navigations en vol. Je ne sais pas, rétrospectivement,
dans quelle proportion — les journaux d'alors ne portaient pas le mouchard.

**Ce que cela ne remet pas en cause**, et qu'il faut distinguer :

- l'**échec** de `home.spec.ts:13` sur `2c08208` (attendu `/en`, reçu `/fr`,
  treize sondages d'une assertion qui réessaie) : un effet qui ne vient jamais
  n'est pas une navigation lente ;
- la mesure locale **0/40 sous bridage ×4**, et son retour à 12/12 après le
  correctif du décalage.

Le helper attend désormais que l'effet se produise avant d'envisager un second
clic. Un clic réellement perdu épuise cette attente puis les 20 secondes de
`toPass`, et le test échoue comme avant — vérifié sur la page synthétique, qui
compte toujours ses deux clics.

#### Première campagne au compteur juste : zéro

`3459d11`, la première à porter le compteur corrigé : **aucune ligne `[F-13]`**,
214 passés, 0 instable.

C'est cohérent avec la mesure locale — 0/40 sous bridage ×4 avant le correctif
du décalage, 12/12 après. Le décalage de l'en-tête était bien la cause des
pertes **réelles** ; le reste des lignes comptait des navigations en vol.

**Trois campagnes consécutives à zéro**, compteur corrigé : `3459d11`,
`c0e5534`, `76a03dd`. C'était le critère posé, il est atteint — **F-13 est
clos.**

Une précision d'honnêteté : ces trois campagnes ne portent pas le même code.
La troisième embarque la lecture serveur de l'authentification, qui règle le
cas connecté. Elles ne constituent donc pas une ligne de base stable observée
trois fois, mais trois observations sur un code qui n'a fait que s'améliorer.
La dernière campagne compte **216 tests** — +2 par rapport aux précédentes :
la garde du cas connecté, et le provisionnement de sa session. Les deux ont
bien tourné.

Ces lignes ne sont pas du bruit à ignorer : elles sont le compteur du constat.
Elles comptent maintenant ce qu'elles prétendent.

#### Trois clics de plus mis à l'abri — et le reste laissé nu

Balayage de `tests/e2e/**` pour ce qui reste exposé, avec un filtre resserré :
un **bouton** (les liens font une navigation native, immunisée) cliqué juste
après `goto`, sans étape coûteuse en temps entre les deux — un `fill()` ou une
attente explicite laissent le temps d'hydrater. Une soixantaine de
correspondances brutes ; la **mesure** n'en retient qu'une :

`tests/e2e/locale-switch.spec.ts`, trois clics sur la bascule de langue — le
geste exact perdu à chaque campagne, et le seul fichier du dépôt qui l'émette
trois fois de suite juste après un `goto`. Ils passent désormais par
`cliquerJusqua`. Le **second** clic de chaque test reste nu, délibérément :
`router.replace` navigue côté client sans recharger le document, donc
l'application est déjà hydratée — s'il échouait un jour, ce serait un autre
mécanisme, et il doit rester visible.

Les autres candidats ont été mesurés, puis **laissés nus** : bouton de thème
5/5 dès 0 ms, envoi du formulaire de contact 6/6, bandeau cookies 5/5. Deux
d'entre eux contredisaient ma prédiction, et c'est le point : le helper absorbe
un mécanisme **mesuré**, il ne se répand pas par précaution.

Un discriminant utile est tombé en route : un contrôle **absent du HTML
serveur** ne peut pas perdre son clic, puisque Playwright attend qu'il
apparaisse et que son apparition prouve le montage. C'est le cas du bandeau
cookies (`useEffect` puis `if (!show) return null`) et du bouton « Prendre la
parole » de la tribune, qui n'existe que dans la charge RSC. La réciproque,
elle, est fausse — voir ci-dessus.

*Au passage, un piège d'instrument.* Le consentement aux cookies de l'audit
était figé sur l'origine `http://localhost:3000`. Le `localStorage` étant
cloisonné par origine, lancer l'audit sur un autre port fait réapparaître le
bandeau — `fixed inset-x-0 bottom-0 z-[80]` — qui **intercepte les clics sur le
pied de page** et s'ajoute à chaque scan d'accessibilité, **sans rien
signaler**. Aucune mesure publiée ici n'est touchée : la procédure du § 6 sert
sur `:3000`. Mais j'ai pris cette occlusion pour un résultat pendant trois
sondes, jusqu'à ce que le journal d'actionnabilité de Playwright la nomme.
`audit/playwright.audit.config.ts` construit désormais le consentement pour
l'origine réellement servie.

#### Ce que ça change pour le dépôt

Le constat n'était pas « la suite E2E est instable sur les dialogues », ni même
« l'en-tête est inerte ». C'était : **l'en-tête se réorganise après le premier
rendu, et un appui visant un de ses contrôles tombe à côté, sans le moindre
signal.** Un défaut de mise en page, pas d'hydratation — et un défaut qui
touchait les visiteurs avant les tests.

Les deux helpers de `tests/e2e/_panneau.ts` restent, et ils portent désormais
un **mouchard** : quand un second clic est nécessaire, le journal dit si le
déclencheur s'était déplacé entre les deux. La prochaine campagne répondra donc
d'elle-même à la question qui reste — « est-ce encore un décalage, ou autre
chose ? » — au lieu d'exiger une campagne de plus rien que pour la poser.

### F-14 · MOYENNE · Défaut · L'accueil masque encore son contenu au rendu serveur — le correctif F-05 ne l'a jamais couvert

**Constaté le 23/09**, en jouant la suite d'audit sur un viewport mobile pour la
première fois (§ 4quater).

| HTML servi | `opacity:0` |
|---|---|
| `/fr/barometre` | 0 |
| `/fr/a-propos` | 0 |
| **`/fr`** | **7** |

F-05 avait retiré le voile de `Reveal`, et sa garde vérifie `/fr/barometre` —
la page du constat. Mais **`HomeHero` n'utilise pas `Reveal`** : il pose ses
propres `motion.p` avec `initial={{ opacity: 0 }}`, c'est-à-dire exactement le
motif que F-05 a supprimé partout ailleurs. Corriger le composant ne pouvait
donc rien y faire, et une garde sur une seule route ne pouvait pas le dire.

**Pourquoi ça ne se voyait pas.** En desktop, le plus grand élément de `/fr`
est le `<h1>`, révélé mot à mot dès 0,18 s : il peint tôt, LCP 312 ms. Sur
412 px de large le `<h1>` rétrécit, et c'est le **paragraphe d'accroche** qui
devient le plus grand — or lui attend la fin de la séquence du titre
(`delay = 0,18 + 6 mots × 0,075 + 0,05`), puis 0,85 s de fondu.

Mesuré, sans contrainte réseau, médiane de trois :

| | desktop | mobile |
|---|---|---|
| LCP `/fr` | **312 ms** | **2 000 ms** |
| élément LCP | `<h1>` | `<p>` d'accroche |
| opacité du `<p>` | — | nulle jusqu'à 1 153 ms, pleine à 2 011 ms |

Six fois le desktop, sur la plateforme que le cadrage annonce comme premier
usage. En Slow-3G, `/fr` mesure 2 620 ms sur mobile — au-dessus du seuil de
2 500 ms que cet audit s'était fixé.

**Ce qui est fait ici** : la garde de F-05 porte désormais sur trois routes au
lieu d'une, et `/fr` y figure en `test.fail()` — le constat est documenté, la
suite reste honnête, et le jour où l'accueil est corrigé le test passe « de
façon inattendue » et demande qu'on le retire.

**Ce qui ne l'est pas, et pourquoi.** Le correctif est connu : c'est celui de
F-05 — rendre le HTML servi non voilé et piloter l'animation après montage.
Appliqué au hero, il revient à **renoncer au fondu d'entrée du premier écran de
l'accueil**. F-05 avait assumé ce renoncement pour `Reveal` (« un fondu depuis
l'invisible exige d'attendre le script ») ; sur un hero chorégraphié
volontairement — entrée séquentielle, titre mot à mot — c'est un arbitrage de
produit, pas une décision d'ingénierie. Il n'est pas pris ici.

Corollaire de méthode, et c'est le vrai enseignement : **une garde posée sur la
page du constat ne garde que cette page.** F-05 a été vérifié sur
`/fr/barometre` et déclaré clos ; l'accueil, plus visité, portait le même
défaut sans que rien ne le dise.

### F-11 · INFO · Un `test.skip` conditionnel, pilote par la donnée

`tests/e2e/admin-recherche.spec.ts:256` :
`test.skip(!word, 'aucun mot assez long dans le premier titre')`.
Légitime, mais dépendant du jeu de données : sur une préversion peu peuplée, ce
test peut ne jamais s'exécuter sans que rien ne le signale. C'est le seul `skip`
du dépôt — les 717 tests unitaires s'exécutent tous.

### F-12 · INFO · Trois routes sans aucune référence dans les specs E2E — **CORRIGÉ**

`/admin/contact`, `/evenements/calendrier`, `/newsletter/desinscription`.

Sur 57 routes, 54 sont citées par au moins une spec : la couverture est bonne.
Méthode : croisement textuel des chemins `/fr/…` et `/en/…` dans `tests/e2e/` —
elle repère l'absence de mention, pas la qualité de ce qui est vérifié.

**Les trois routes ont désormais leur fichier** : `calendrier.spec.ts` (5),
`desinscription.spec.ts` (3), `admin-contact.spec.ts` (2) — **57 sur 57**.

**Ce que chacune exigeait, et qui explique qu'elles soient restées de côté.**

- `/evenements/calendrier` est la seule route de ce dossier à ne dépendre
  d'AUCUN backend : sa grille vient de `buildMonthGrid` et ses événements de
  `EVENTS`, tous deux versionnés. Le mois est piloté par `?ym=`, jamais par
  l'horloge — les assertions sont donc déterministes, et c'est le seul de ces
  trois fichiers jouable depuis l'environnement d'audit. **Joué ici : 5/5.**
- `/newsletter/desinscription` n'existe qu'au bout d'un JETON, et aucun oracle
  de lecture ne le rendait — `isSubscribed` ne rend qu'un booléen. Sans lui,
  seules les branches d'ÉCHEC étaient testables, c'est-à-dire tout sauf la
  désinscription. D'où `newsletter:devUnsubToken`, `internalQuery` gardée par
  `AUTH_DEV_OTP`, sur le modèle exact de `isSubscribed` et
  `contact:latestForEmail`. **Ce n'est pas l'oracle refermé en F-09** : celui-là
  était public et non authentifié ; celui-ci est hors API publique et s'invoque
  par la CLI Convex, en contexte de confiance.
- `/admin/contact` écrit la donnée puis la modère : le fichier tient sa session
  de bout en bout, donc **session dédiée** (règle de `_sessions.ts`), au rang
  modérateur — le minimum qu'exigent `listMessages` et `setHandled`. Prendre un
  administrateur aurait fait passer le test le jour où la garde serait relevée
  par erreur.

**Un défaut trouvé en écrivant ces specs, et corrigé.** `Reveal` n'acceptait
pas `aria-label` ; seul `RevealGroup` le déclarait. Or
`evenements/calendrier/page.tsx` lui en passait un pour nommer la grille du
mois — le seul site du dépôt dans ce cas. **TypeScript ne le signale pas** : un
attribut JSX à tiret échappe au contrôle des propriétés en trop. Constaté sur
le HTML SERVI, avant correctif : `<section data-reveal="" class="…"
style="…">`, sans `aria-label`. Un `<section>` sans nom accessible n'est pas
exposé comme repère `region` — la grille était un conteneur anonyme. Après
correctif, `aria-label="Novembre 2026"` est bien servi, et
`calendrier.spec.ts` l'exige.

**Ce qui n'a PAS pu être vérifié d'ici** : les deux fichiers adossés à Convex
(`desinscription`, `admin-contact`), faute de déploiement joignable — sauf le
cas « sans jeton », qui n'appelle aucune mutation et passe ici. C'est la CI qui
les tranche.

**Trouvé APRÈS COUP, par une CI rouge, et corrigé.** `admin-moderation.spec.ts`
partageait la session `moderateur` avec `admin-ecrans.spec.ts` — son `describe`
s'intitulait d'ailleurs « session modérateur **partagée** ». C'est précisément
ce que `tests/e2e/_sessions.ts` proscrit depuis l'issue #38 : Playwright
exécute les FICHIERS en parallèle, deux contextes présentent donc le même jeton
de rafraîchissement, Convex Auth le fait tourner, le second passage ressemble à
un rejeu et la session meurt. Le symptôme annoncé s'est produit mot pour mot :
l'instantané d'échec est **la page de connexion**, et le bouton « Approuver »
se détache du DOM au milieu du parcours.

Deux exécutions l'ont montré, avec des ENSEMBLES DIFFÉRENTS de tests en échec
(trois, puis un seul) — c'est la signature d'une course, pas d'une régression
déterministe. `admin-moderation` écrit la candidature par le chemin public puis
la modère : il tient sa session d'un bout à l'autre, il prend donc la sienne.

**Reste ouvert, même famille** : `SESSIONS.membre` est partagée par **trois**
fichiers — `seo.spec.ts`, `library-submit.spec.ts` et `admin.spec.ts`. Deux
d'entre eux écrivent puis relisent. Aucune campagne ne les a encore fait
tomber ; la règle du dépôt dit pourtant que le mécanisme mord dès DEUX
contextes. Ce n'est pas corrigé ici — on ne corrige pas à l'aveugle ce qui n'a
pas encore échoué — mais c'est écrit, et c'est le premier endroit où regarder à
la prochaine CI rouge sur un de ces trois fichiers.

---

## 4. Suivi du pentest du 18 septembre 2026

| # | Sévérité | Sujet | Verdict | Preuve |
|---|---|---|---|---|
| C-1 | CRITIQUE | Next 16.2.9, RCE non authentifiée | ✅ **CORRIGÉ** | 16.3.5 installé ; absent de `pnpm audit` |
| H-1 | ÉLEVÉE | Publications « membres » exposées | ✅ **CORRIGÉ** | PoC anonyme : `fileUrl` nul, `reviewNotes`/`authorUserId`/`fileId` absents, `body: []`, `locked: true` |
| H-2 | ÉLEVÉE | Blocage de la file de modération | ✅ **CORRIGÉ** | PoC : `targetId` d'une autre table **rejeté** ; file toujours lisible par un modérateur |
| M-1 | MOYENNE | `signUp` attache un mot de passe | 🟠 **REJOUÉ — partiellement ouvert** | PoC : **pas de prise de compte** (`tokens: null`, 0 session) ; mais liaison acceptée, déni de service sur la victime et oracle d'énumération **confirmés** (§ 4bis) |
| M-2 | MOYENNE | Rate-limit / reCAPTCHA fail-open | ✅ **REJOUÉ — corrigé** | PoC : compteur non forgeable ✓, fail-closed sans secret ✓. Le **remplissage** était resté ouvert (1 Mo accepté et stocké) — **bornes posées** (§ 4bis) |
| M-3 | MOYENNE | `AUTH_DEV_OTP` | ✅ **REJOUÉ — corrigé** | PoC : **aucun** des huit oracles nommés par le pentest n'est public, et `latestDevCode` lève sans le drapeau (§ 4bis) |
| M-4 | MOYENNE | Zones protégées gardées côté client | ✅ **CORRIGÉ** | 11 routes renvoient **307 serveur** vers `/fr/connexion` avant tout code client |
| M-5 | MOYENNE | Rappels d'événements | 🟠 **REJOUÉ — atténué** | PoC : 5 rappels/h vers une adresse tierce, file rechargeable. **Plafond absolu posé** ; validation du slug **ouverte**, elle exige un choix d'architecture (§ 4bis) |
| M-6 | MOYENNE | Élévation via approbation d'adhésion | 🟠 **REJOUÉ — angle mort comblé** | PoC : le compte du DÉPOSANT devient « membre », pas l'adresse de contact — et la file ne nommait ce compte nulle part. `applicantEmail`/`applicantRole` **exposés et affichés**, discordance signalée (§ 4ter) |
| M-7 | MOYENNE | Compteur de vues sans limite | ✅ **CORRIGÉ** | `consumePublicationViewQuota` — `publications.ts:166` |
| M-8 | MOYENNE | Oracles d'existence `already` | ✅ **CORRIGÉ depuis** | ouvert à l'audit ; refermé sur **cinq** actions publiques, pas deux (§ 0, F-09) |
| M-9 | MOYENNE | Liens `javascript:` depuis le CMS | ✅ **REJOUÉ — corrigé** | PoC de rendu : `javascript:` est neutralisé **par React**, mais `data:text/html` et `vbscript:` passaient **tels quels**. Liste blanche de schémas posée au rendu, à l'écriture et à la saisie (§ 4ter) |

**🟡 PROBABLE** veut dire : un test du dépôt couvre nommément le point et il est
vert, mais je n'ai pas rejoué l'attaque moi-même. Ce n'est pas la même chose que
« corrigé », et je ne l'écris pas comme tel.

Il ne reste **aucun 🟡** : les quatre ont été rejoués le 23/09 (§ 4bis). Il ne
reste **aucun ⚪** non plus : les deux derniers l'ont été le 23/09 également
(§ 4ter). Les neuf constats du pentest ont donc tous été rejoués ici.

## 4bis. M-1, M-2, M-3, M-5 rejoués — ce que la mesure a dit

PoC indépendantes des tests du dépôt, sur le modèle de celles de H-1 et H-2 :
`audit/poc/pentest-m-regression.test.ts.txt`. Elles chargent `auth.ts`, ce que
la plupart des suites du dépôt excluent — c'était la condition pour rejouer
M-1, que le pentest disait « non exécuté » pour cette raison précise.

### Trois instruments ont menti avant de dire vrai

C'est la moitié du travail, et ça vaut d'être écrit : **aucun des trois
premiers détecteurs ne mesurait ce qu'il prétendait**.

1. `Boolean(api.otp.latestDevCode)` pour décider si une fonction est publique.
   L'objet `api` est un **proxy permissif** : `api.moduleQuiNexistePas.rien`
   est vrai lui aussi (vérifié). Ce détecteur annonçait **huit oracles
   publics** qui ne le sont pas — un faux positif que j'ai failli rapporter.
2. Appeler `t.query(api.otp.latestDevCode, …)` pour voir si l'appel est
   refusé. `convex-test` résout la référence **par son chemin** et n'applique
   pas la frontière public/interne : le handler s'exécute quand même.
3. `api.eventReminders.subscribe` — cette action s'appelle `requestReminder`.
   Le proxy fabrique la référence, l'appel échoue « fonction introuvable », et
   mon `catch` comptait cela comme un **refus**. Les deux tests M-5 passaient
   donc **à vide**, en annonçant une défense jamais exercée.

Ce qui porte réellement la visibilité d'une fonction est l'objet enregistré :
`internalQuery` pose `isInternal`, `query` pose `isPublic`. La PoC le lit là,
et vérifie à chaque exécution qu'elle reconnaît bien une query publique — sans
ce témoin, elle pourrait ne rien voir et l'annoncer comme une bonne nouvelle.

### M-3 — clos

Les **huit** oracles nommés par le pentest (`otp`, `contact`, `organizations`,
`newsletter`, `events`, `eventReminders`, `youth`, `mentorship`) sont tous des
`internalQuery` : hors API publique, appelables par aucun client. Et
`latestDevCode` lève sans `AUTH_DEV_OTP`. La double garde `NODE_ENV` que le
pentest proposait n'a pas été posée — elle est devenue sans objet, la fonction
n'étant plus atteignable même avec le drapeau.

### M-2 — corrigé, après un constat qui restait ouvert

Deux des trois angles tenaient déjà : le compteur de plafond ne dépend **pas**
de l'adresse fournie (mesuré : cinq adresses différentes incrémentent une même
clé), et reCAPTCHA **rejette** sans secret.

Le troisième ne tenait pas. Mesuré : un corps de **1 000 000 de caractères**
était accepté et **écrit en base**. `youth`, `mentorship` et `events`
bornaient leurs champs ; `contact`, `organizations` et l'adresse e-mail elle-même
ne bornaient rien.

**Corrigé** : bornes 120 / 200 / 4000 (les valeurs que le pentest proposait) et
254 caractères d'adresse, posée dans `isEmail` — donc valable d'un coup pour
les sept formulaires. Gardé par `convex/public-form-bounds.test.ts`, qui joue
**les deux côtés** de chaque borne : un test qui ne vérifierait que le refus
passerait encore le jour où la validation refuserait tout.

### M-1 — pas de prise de compte, mais deux conséquences confirmées

Mesuré, l'attaque littérale du pentest : `signIn('password', {flow:'signUp'})`
sur l'adresse d'un admin existant.

    signUp sur l'adresse de la victime   ACCEPTÉ
    authAccounts créé                    provider "password", emailVerified null
    sessions ouvertes                    0
    connexion ultérieure de l'attaquant  {"tokens": null}

**La bibliothèque bloque bien** : aucun jeton, aucune session. Ce n'est pas une
prise de compte, et l'assertion qui l'exigeait a dû être corrigée — elle
demandait une *levée*, alors que le backend répond « vérification requise ».
Exiger la mauvaise forme de refus aurait fait rougir un backend qui se défend.

En revanche, les deux conséquences que le pentest annonçait sont **confirmées** :

- **déni de service** : après le passage de l'attaquant, la victime ne peut plus
  poser son propre mot de passe — `Account … already exists` ;
- **énumération** : adresse inconnue → `NO_SELF_SIGNUP`, adresse connue →
  accepté. Une requête suffit pour savoir si une adresse est chez nous.

**Non corrigé, et c'est délibéré.** Le correctif proposé — refuser la liaison
`password` quand aucun compte n'existe — casserait le provisionnement des
sessions E2E : `tests/e2e/_helpers.ts` utilise précisément ce flux, faute
d'écran permettant à un membre invité de se donner un mot de passe. Fermer M-1
suppose donc d'abord de remplacer ce provisionnement (une `internalMutation`
de développement, dans la lignée de `devAdmin`), ce qui demande le hachage de
la bibliothèque. C'est un chantier, pas une ligne, et il est posé ici plutôt
que tranché en passant.

### M-5 — atténué, pas clos

Mesuré : un slug **inventé** est accepté, et **cinq** rappels vers une adresse
tierce sont enregistrés avant que le plafond horaire ne morde — un plafond qui
**se reconstitue**, donc cinq de plus l'heure suivante.

**Corrigé** : plafond **absolu** de rappels EN ATTENTE par adresse (5), qui ne
se recharge pas avec le temps — la PoC avance l'horloge de deux heures pour le
prouver, sans quoi elle testerait le compteur horaire et non le nouveau. Plus
un bornage de `eventDate` (ni passée, ni au-delà d'un an). La place se libère
quand un rappel part : c'est un plafond de file, pas un bannissement.

**Ouvert, et c'est un choix d'architecture** : valider `eventSlug` contre les
événements réels et calculer `eventDate` côté serveur supposent que le backend
CONNAISSE les événements. La liste vit dans `src/lib/events-content.ts`, côté
Next. La dupliquer créerait deux sources de vérité à tenir synchrones, sur une
donnée qui change à chaque événement ajouté. `events.ts` a exactement la même
limite sur `register`. Le point revient au produit.

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

## 4ter. M-6 et M-9 rejoués — les deux « prérequis » n'en étaient pas

Ces deux constats étaient les seuls ⚪ du tableau. Le motif inscrit en face de
chacun était un prérequis d'environnement : « exige un parcours back-office
complet » pour M-6, « exige un projet Sanity configuré » pour M-9. **Les deux
sont faux**, et il vaut la peine de dire pourquoi, parce que c'est le même
raccourci dans les deux cas : j'avais confondu *ce qu'il faut pour VOIR le
défaut* avec *ce qu'il faut pour le VÉRIFIER*.

- **M-6** est un parcours **backend de bout en bout** — dépôt public, file de
  modération, décision. `convex-test` le joue en entier. Le navigateur n'était
  nécessaire qu'à le regarder.
- **M-9** ne demande pas Sanity : la défense contre un lien hostile n'est pas
  dans le CMS, elle est dans le **rendu**. Un document Portable Text est un
  objet JSON qu'on écrit à la main en dix lignes, et le composant qui le rend
  se rend dans un test.

### M-6 — l'approbation élève un compte, et la file ne disait pas lequel

PoC : `audit/poc/pentest-m69-regression.test.ts.txt`. Mesure d'avant
correction : **1 échec / 2 succès**.

Ce que le rejeu confirme, et ce qu'il corrige de la description du pentest :

1. **Le mécanisme est réel.** Un visiteur connecté dépose une candidature au nom
   d'une organisation plausible, avec une adresse de contact qui n'est pas la
   sienne. Le modérateur approuve. C'est **le compte du déposant** qui devient
   « membre » — aucun compte n'est créé pour l'adresse de contact affichée.
2. **Ce n'est pas un défaut en soi.** Lier la candidature au compte déposant est
   voulu : sans cette liaison, un membre ne récupérerait jamais son adhésion.
   Le « correctif » consistant à délier les deux priverait les membres de leur
   adhésion pour faire taire un symptôme. Un test l'interdit explicitement.
3. **Le défaut est ailleurs, et il est net** : la file de modération ne portait
   **aucun champ** désignant ce compte. `listApplications` renvoyait le nom, le
   pays, l'adresse de contact, le message — rien sur le compte qui allait être
   élevé. Le modérateur jugeait une organisation et accordait un rôle à un
   inconnu, sans que rien à l'écran ne le lui dise.
4. **Le rejeu d'une décision était déjà fermé** : `ALREADY_REVIEWED` lève à la
   seconde décision. Le point correspondant du pentest est clos.

**Correctif.** `listApplications` expose `applicantEmail` et `applicantRole`
(une lecture par ligne de la page, dont la taille est déjà bornée par
`clampPageSize` — pas un balayage), et `/admin/candidatures` nomme ce compte
sous l'adresse de contact. Quand les deux **diffèrent**, l'écart est écrit en
toutes lettres : c'est la signature de l'abus décrit, et ce n'est pas au
modérateur de comparer deux adresses de tête. Une candidature anonyme remonte
`null` — surtout pas un repli sur `contactEmail`, qui ferait croire à un compte
qui n'existe pas.

Garde permanente : trois tests dans `convex/admin.test.ts`. Les deux premiers
échouent sur le code d'avant (le champ n'existait pas) ; le troisième passait
déjà, et c'est son rôle — il fixe le comportement voulu pour qu'on ne le
« corrige » pas par erreur.

**Ce qui reste ouvert.** Rien de technique. Il reste une question de produit,
qui n'est pas la mienne : faut-il exiger que l'adresse de contact d'une
candidature « organisation » corresponde au compte déposant ? Ce serait un
durcissement défendable et une gêne réelle (une assistante qui dépose pour sa
direction). L'écran dit désormais ce qu'il fait ; le reste est un arbitrage.

### M-9 — `javascript:` était le moins grave des trois schémas

PoC : `tests/unit/portable-text-liens.test.tsx` — un test de composant, écrit
pour rester dans le dépôt plutôt que pour être joué une fois.

Deux surfaces alimentent des `href` que ce dépôt n'écrit pas : les liens du
texte riche Sanity (annotation `link`) et `websiteUrl` d'une fiche d'annuaire,
renseignée à l'adhésion puis publiée sur `/le-reseau/[slug]`. Aucune des deux
ne regardait le schéma. Sur le texte riche, `ptComponents` ne déclarait même
pas de `marks` : c'est le composant `link` **par défaut** de
`@portabletext/react` qui s'appliquait, et il pose `value.href` tel quel.

Ce que la mesure a dit, et c'est l'essentiel du constat :

| Entrée | Ce que React 19 en fait |
|---|---|
| `javascript:alert(1)` | **neutralisé par React lui-même** : l'attribut est réécrit en `javascript:throw new Error('React has blocked a javascript: URL…')` |
| `data:text/html;base64,…` | **passe tel quel** — une page HTML complète, d'origine opaque, ouverte depuis un clic sur le site |
| `vbscript:msgbox(1)` | **passe tel quel** |

Autrement dit : le seul schéma que le pentest nommait est le seul contre lequel
le framework protégeait déjà, et les deux autres passaient. S'en remettre au
garde-fou de React, c'est se protéger du cas qu'il couvre et d'aucun autre.

**Correctif** — une liste blanche (`http:`, `https:`, `mailto:`), pas une liste
noire, et trois barrières :

1. **Rendu** (`src/lib/safe-href.ts` + `src/components/news/portable-text.tsx`)
   — c'est elle qui garde le dernier mot, parce que le contenu déjà publié
   n'est jamais revalidé. Un schéma refusé rend un `<span>` : le texte de
   l'auteur reste lu, seule la navigation disparaît. Un `<a>` sans `href`
   serait un lien mort, cliquable et silencieux. Les liens acceptés portent
   `rel="noopener noreferrer"`, qui manquait.
2. **Écriture** (`convex/lib/validation.ts` → `validateDirectoryFields`) — le
   champ « site web » n'accepte plus que `http`/`https`. Retenir la charge utile
   au seul affichage reviendrait à la stocker en attendant le prochain écran qui
   oubliera de filtrer.
3. **Saisie** (`sanity/schemaTypes/objects/blockContent.ts`) —
   `Rule.uri({ scheme })` sur l'annotation de lien, pour que le défaut se voie
   dans le CMS plutôt qu'en production.

Le filtre passe par `new URL` et non par un test de préfixe, et c'est délibéré :
l'analyseur du standard WHATWG — celui que le navigateur applique lui aussi à
l'attribut `href` — retire les tabulations et les retours à la ligne, ignore les
caractères de contrôle de tête et met le schéma en minuscules. `JaVaScRiPt:`,
`java\tscript:` et ` javascript:` sont donc comparés **normalisés**, là où un
`startsWith` écrit à la main les laisserait passer. Les neuf variantes sont dans
le test.

**Non-vacuité.** Les deux gardes ont été montrées capables d'échouer : filtre de
rendu désactivé → 2 tests rouges sur 6 avec le bon message (`schéma passé :
"javascript:alert(1)"`) ; validation d'écriture neutralisée → le test
`INVALID_WEBSITE` rougit. Restaurées, 6/6 et 17/17.

**Ce qui reste ouvert.** L'angle mort n°6 demeure entier pour tout le reste :
sans projet Sanity, le chemin « contenu réel » du CMS n'est toujours exercé par
personne. Ce qui change, c'est que **M-9 n'en dépendait pas** — et le supposer
aura coûté un constat classé « non vérifié » pendant cinq jours.

---

## 4quater. Le viewport mobile, mesuré pour la première fois

L'angle mort 2 disait : « les projets `mobile-chromium` et `dev-browser` n'ont
pas été joués, et aucune mesure ne porte sur un vrai viewport mobile ». Il
mélangeait deux causes, et une seule tenait.

**Le blocage Chromium est levé.** L'environnement fournit le build 1194, le
Playwright épinglé en réclame 1228. Le contournement existait déjà — pointer
l'exécutable — mais il vivait en dur dans la config d'AUDIT, donc il n'aidait
personne à jouer les projets du dépôt. `playwright.config.ts` lit désormais
`PLAYWRIGHT_CHROMIUM_PATH` : non définie, rien ne change (le cas de la CI, qui
installe le build attendu) ; définie, tous les projets démarrent.

    PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium pnpm test:e2e

**`dev-browser` reste injoué, pour une autre raison.** Il dépend du projet
`setup`, donc de sessions authentifiées, donc d'un déploiement Convex. C'est
l'angle mort 1 — pas celui-ci. Constaté : les onze sessions échouent, les 40
captures ne s'exécutent pas.

### Ce que la suite dit sur un Pixel 7

Le projet `mobile` de la config d'audit existait depuis le début et n'avait
jamais été joué. Rejoué tel quel : **165 tests, 0 échec** (desktop : 168, dont
6 propres au mobile qui s'y sautent ; campagne complète 333 passées, 9 sautées,
code de sortie 0).

C'est un résultat, et il faut dire ce qu'il ne vaut pas : l'essentiel de la
suite — SEO, en-têtes, robots, rendu sans JavaScript, i18n — lit des balises et
des réponses HTTP, que la largeur de la fenêtre ne change pas. Une suite verte
sur un viewport qu'elle n'avait jamais vu méritait donc d'abord qu'on vérifie
qu'elle l'avait vu cette fois : `audit/specs/50-mobile.spec.ts` commence par
mesurer l'instrument — 412 px, `(pointer: coarse)`, tactile présent, UA
Android, DPR 2,625.

### Deux écrans que personne n'avait regardés

**Le panneau de navigation mobile.** Sous 1120 px, la barre de bureau est
masquée : le menu tactile est le **seul** chemin de navigation du site. Il
n'était analysé par aucune garde — `a11y.spec.ts` tourne en desktop, où le
composant n'existe pas ; les specs `mobile-chromium` exercent des parcours et
n'analysent rien. Scanné pour la première fois : **0 violation grave**,
`aria-modal` correct, 10 liens, 16 signalements de contraste (règle différée,
arbitrage de palette connu). C'est propre — et depuis cette PR, une garde du
dépôt (`tests/e2e/mobile/a11y-menu.spec.ts`) le tient, en français et en
anglais. Vérifiée capable d'échouer : un `<button>` sans nom injecté dans le
panneau la fait rougir sur `button-name [critical]`.

**Les cibles tactiles (WCAG 2.2, critère 2.5.8, niveau AA).** Un balayage naïf
— « moins de 24 × 24 px » — rend **568 cibles sur 24 pages**. Publier ce nombre
aurait refait l'erreur que ce rapport dénonce ailleurs : un scan bruyant ne
fait pas que surestimer, il cache. La règle prévoit une exception d'espacement,
qui se calcule : un cercle de 24 px centré sur la cible ne doit recouper ni le
rectangle d'une autre cible, ni le cercle d'une autre cible sous-dimensionnée.
Appliquée, il reste **zéro** non-conformité, menu ouvert compris.

### L'instrument a menti deux fois avant de dire vrai

Ça vaut d'être écrit, parce que c'est la quatrième fois dans cet audit et que
les deux erreurs ont la même forme — une conclusion tirée d'un outil qu'on n'a
pas vérifié.

1. **Le détecteur 2.5.8 comparait les mauvais points.** Première version :
   distance de centre à centre pour toutes les voisines. La règle compare le
   cercle de la cible au **rectangle** des voisines pleine taille. Corrigé,
   puis re-corrigé : la seconde version passait le CENTRE des voisines à une
   fonction qui attendait leur coin supérieur gauche, ce qui décale chaque
   rectangle d'une demi-largeur. Elle annonçait une non-conformité à −6 px sur
   `/fr/connexion` ; mesurée à la main, la distance réelle est de 29 px pour 12
   exigés. Le détecteur porte maintenant un témoin injecté — deux cibles de
   16 px posées à 10 px d'écart — sans quoi son zéro ne prouverait rien.
2. **Un serveur périmé a fabriqué un faux correctif.** Après un `pkill` qui
   n'a pas abouti, l'ancien processus servait encore l'ancien build pendant que
   je mesurais le nouveau. Résultat affiché : LCP mobile 1 960 ms → 244 ms, un
   correctif « spectaculaire » sur `Reveal`. Sur un serveur propre : 2 000 ms,
   inchangé. Le correctif ne servait à rien — le voile de l'accueil ne vient
   pas de `Reveal` (F-14) — et il a été **retiré**. Un chunk répondant 500 en
   `text/plain` dans la console était le signe ; c'est lui qui a mis la puce à
   l'oreille, pas la relecture.

### Ce qui reste

**F-14** (§ 3) : l'accueil sert 7 `opacity:0` dans son HTML, son LCP mobile est
de 2 000 ms contre 312 ms en desktop, et le corriger demande de renoncer au
fondu d'entrée du premier écran — un arbitrage de produit. La garde de F-05
couvre désormais trois routes, `/fr` marquée `test.fail()`.

Restent aussi, inchangés : `dev-browser` (angle mort 1), Firefox et WebKit
(angle mort 4), et les cinq pages Convex sur données réelles (angle mort 3),
qui n'ont pas plus été mesurées en mobile qu'en desktop.

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
   pentest sur ces surfaces (cf. les cinq 🟡 du § 4). L'instabilité relevée en
   F-13 a désormais UNE cause corrigée et gardée en CI, mais elle n'a pas
   disparu des journaux.
2. ~~**Les navigateurs mobiles.**~~ **Refermé le 23/09 (§ 4quater), et ce point
   confondait deux causes.** Le blocage Chromium (build 1194 présent, 1228
   réclamé) est levé : `playwright.config.ts` accepte désormais
   `PLAYWRIGHT_CHROMIUM_PATH`, donc `mobile-chromium` se joue ici comme en CI.
   **La suite d'audit a tourné sur un vrai Pixel 7** — 165 tests, 0 échec — et
   l'instrument est vérifié (412 px, `pointer: coarse`, tactile, UA Android).
   `dev-browser`, lui, reste injoué : il dépend du projet `setup`, donc d'un
   déploiement Convex — c'est l'angle mort 1, pas celui-ci. La mesure a livré
   deux constats : le panneau de navigation mobile n'avait **jamais** été
   analysé par personne (il l'est, et il est propre), et **F-14** ci-dessous.
3. **Les cinq pages Convex sur données réelles.** `bibliotheque`, `experts`,
   `le-reseau`, `thematiques`, `tribune` n'ont pu être mesurées ni en SEO, ni en
   accessibilité, ni en performance : elles rendaient 500 ici. Leurs chiffres
   sont absents des tableaux § 3, et ce sont probablement les pages les plus
   lourdes. **Depuis F-02 elles répondent 200**, mais sur leur ÉTAT VIDE : la
   lacune demeure entière, puisque c'est le poids des données réelles qui
   importait.
4. **Firefox et WebKit.** Rien n'a été exercé hors Chromium.
5. **Le contraste des couleurs — MESURÉ le 24/09**, après arbitrage client
   (« ajuster les teintes concernées »). Il était volontairement laissé de côté :
   le dépôt le désactive avec une justification écrite (palette de marque,
   arbitrage RGAA annoncé dans la déclaration d'accessibilité), et mes premières
   mesures brutes — jusqu'à 45 nœuds sur une seule page, sans dérouler les
   animations — étaient **gonflées par de faux positifs**. Elles restent
   rétractées.
   **Repris proprement** (`audit/specs/51-contraste.spec.ts`, animations
   déroulées, un thème à la fois, 24 pages) : **36 nœuds en clair, 35 en
   sombre**, pour 14 paires de couleurs distinctes chacune — deux ordres de
   grandeur sous les premiers chiffres.
   La mesure a livré un **défaut, et non une question de teinte** : en thème
   sombre, l'univers « jeunes » gardait ses jetons de thème CLAIR, la règle CSS
   exigeant `data-theme` et `data-universe` sur le même élément alors que le
   premier vit sur `<html>` et le second sur un `<div>` de page. La variante
   sombre du safran existait depuis le début sans jamais atteindre la page.
   Corrigé avec la valeur prévue par le designer : **sombre passe de 35 à 21
   nœuds**, aucune couleur inventée.
   Le reste — texte clair sur safran (27 nœuds), couleurs du baromètre en petit
   texte, gris sourds — demande des VALEURS, pas du code, et relève de l'agence.
   Le détail par paire, avec ratios, est dans
   `docs/arbitrages-client-2026-09-23.md`.
6. **Sanity.** Aucun projet configuré (`projectId = placeholder`) : le chemin
   « contenu réel » du CMS n'a jamais été exercé, seulement le chemin dégradé.
   ~~M-9 (liens `javascript:` depuis PortableText) reste donc non vérifié.~~
   **Faux, et corrigé le 23/09** : M-9 se vérifie sur le composant de rendu,
   sans CMS (§ 4ter) — un document Portable Text s'écrit à la main. L'angle
   mort demeure pour tout le reste de cette page ; il ne couvrait simplement
   pas M-9.
   **La CI est dans le même cas** — son journal montre
   `Dataset not found for project ID "placeholder"`. Conséquence utile : le
   correctif F-10 est exercé à chaque campagne. Conséquence gênante : les deux
   autres branches de cette page (article présent, article absent) ne le sont
   par personne, et reposent sur un test unitaire à client simulé.
   **Et depuis le 24/09, la fiche `Article` aussi** : elle n'a jamais été vue
   sur un article réel. Ce qui est mesuré, c'est son ABSENCE sur le rendu
   dégradé — là où elle serait fausse — plus son constructeur en test
   unitaire.
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

# Régression du pentest (M-1, M-2, M-3, M-5) — 7 passées, 3 « expected fail »
# (les trois `it.fails` documentent les constats restés ouverts : cf. § 4bis)
cp audit/poc/pentest-m-regression.test.ts.txt convex/zz-audit-poc-m.test.ts
pnpm exec vitest run convex/zz-audit-poc-m.test.ts
rm convex/zz-audit-poc-m.test.ts

# Régression du pentest (M-6) — 3/3 depuis le correctif ; le premier test
# échouait avant lui (§ 4ter). Aucun navigateur, aucun back-office déployé.
cp audit/poc/pentest-m69-regression.test.ts.txt convex/zz-audit-poc-m6.test.ts
pnpm exec vitest run convex/zz-audit-poc-m6.test.ts
rm convex/zz-audit-poc-m6.test.ts

# M-9 — le PoC est resté dans le dépôt : sa défense est un composant de rendu,
# donc elle se garde par un test permanent plutôt que par un fichier à copier.
pnpm exec vitest run tests/unit/portable-text-liens.test.tsx

# Viewport mobile (angle mort 2) — serveur requis, cf. plus bas
pnpm exec playwright test --config audit/playwright.audit.config.ts --project=mobile

# Projets mobiles du DÉPÔT dans un environnement au Chromium dépareillé
PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium \
  pnpm exec playwright test --project=mobile-chromium

# Fiches de page (F-03 suite) — serveur requis, aucune dépendance navigateur :
# la spec lit le HTML servi par requête HTTP.
pnpm exec playwright test --config audit/playwright.audit.config.ts \
  --project=desktop audit/specs/16-donnees-structurees.spec.ts

# Lots navigateur — serveur requis.
#
# LES VARIABLES DOIVENT ÊTRE POSÉES AU BUILD, pas seulement au démarrage.
# Une variable `NEXT_PUBLIC_*` est INLINÉE dans le bundle client au moment du
# build : la poser sur `pnpm start` seul corrige le rendu serveur et laisse le
# client jeter `Missing environment variable NEXT_PUBLIC_CONVEX_URL`. Next
# remplace alors la page par sa coquille d'erreur (`#__next_error__`), et TOUT
# ce qui se mesure dans un navigateur devient faux en silence : `html-has-lang`
# et `document-title` « graves » sur les 24 pages publiques, titres vides sur
# les 48 du lot SEO, texte compté à 70 caractères en 3G, contraste à zéro
# paire. Un `curl`
# sur les mêmes adresses rend une page parfaite — c'est ce qui rend la panne
# difficile à voir. Mesuré le 24/09.
export NEXT_PUBLIC_CONVEX_URL="https://audit-placeholder.convex.cloud"
export NEXT_PUBLIC_SITE_URL="http://localhost:3000"
rm -rf .next && pnpm build
pnpm start &
pnpm exec playwright test --config audit/playwright.audit.config.ts --project=desktop
```

---

## 7. Plan d'action priorisé

### P0 — avant toute mise en ligne

| # | Action | Couvre | Effort |
|---|---|---|---|
| 1 | ~~`try`/`catch` + état vide~~ — **fait** pour F-02 (9 routes) **et pour F-10** (`actualites/[slug]`) | F-02 ✅ / F-10 ✅ | — |
| 2 | Vérifier à la main que la prod n'a ni `AUTH_DEV_OTP` ni `RECAPTCHA_DISABLED` (`npx convex env list --prod`) | angle mort 7 | 15 min |
| 3 | ~~Rejouer les 213 E2E~~ — **fait** par la CI de la PR (212/213, deux fois) | angle mort 1 | — |

### P1 — dans la foulée

| # | Action | Couvre | Effort |
|---|---|---|---|
| 4 | ~~`openGraph` + `twitter` + image OG ; JSON-LD `Organization`~~ — **fait**. ~~JSON-LD `Article`/`Event` par page~~ — **fait le 24/09**, et l'échappement du texte CMS avec (§ 0) | F-03 ✅ | — |
| 5 | ~~`spy.mockRestore()` ; `--sequence.shuffle` en CI~~ — **fait**, plus un second défaut d'isolation trouvé au passage | F-01 ✅ | — |
| 6 | ~~`canonical` et `hreflang`~~ — **fait**. Deux des quatorze signalements étaient de faux positifs (`/recherche`, en `noindex`) | F-04 ✅ | — |
| 7 | ~~Montées de version + `pnpm audit` en CI~~ — **fait** : 9 avis → 1. L'override `postcss@8` était indispensable, `pnpm up` seul n'aurait pas suffi | F-08 ✅ | — |
| 8 | ~~Réponses uniformes~~ — **fait**, et sur **cinq** actions publiques, pas deux | F-09 ✅ | — |
| 8bis | ~~Portail pour `ConfirmDialog`~~, ~~journal d'une campagne~~, ~~cause de l'en-tête~~, ~~cas **connecté**~~, ~~compteur faussé~~ — **tous faits**. F-13 clos : décalage corrigé pour les deux cas (lecture serveur de l'authentification), gardé en CI, trois campagnes à zéro (§ 3) | F-13 ✅ | — |

### P2 — dette

| # | Action | Couvre | Effort |
|---|---|---|---|
| 9 | Alléger les chunks (`d3-geo`/`topojson`/`world-atlas` en différé) ; prérendre les pages éditoriales | F-05 | 1 j |
| 10 | ~~Rendre la 404 localisée en SSR~~ — **impossible en userland** (limite Next mesurée). 404 racine livrée ; arbitrage `dynamicParams` à trancher | F-06 🟡 | — |
| 11 | ~~Souligner le lien d'adhésion~~ — **fait**, plus les zones défilantes inatteignables au clavier (2 pages publiques + 3 tableaux d'administration) | F-07 ✅ | — |
| 12 | ~~Specs E2E pour `/admin/contact`, `/evenements/calendrier`, `/newsletter/desinscription`~~ — **fait** : 10 tests, 3 fichiers, **57 routes sur 57** citées. Un défaut d'accessibilité trouvé au passage (`Reveal` n'acceptait pas `aria-label`) et corrigé | F-12 ✅ | — |
| 13 | ~~Aligner le Chromium de l'environnement sur le Playwright épinglé~~ — **fait** autrement : `PLAYWRIGHT_CHROMIUM_PATH` dans `playwright.config.ts`. Suite jouée sur Pixel 7, panneau mobile scanné et gardé | angle mort 2 ✅ | — |
| 14 | **Accueil : renoncer au fondu d'entrée du premier écran, ou l'assumer.** LCP mobile 2 000 ms contre 312 ms en desktop ; le correctif est celui de F-05, son coût est visuel | F-14 | arbitrage |

---

## 8. Détail des critères SEO manquants

> **État à l'audit — corrigé depuis (§ 0, F-04).** Deux des quatorze
> signalements ci-dessous étaient de **faux positifs** : `/fr/recherche` et
> `/en/recherche` sont en `noindex`, et un moteur ignore le hreflang d'une page
> qu'il n'indexe pas. C'est une décision écrite du dépôt, tenue par
> `tests/e2e/seo.spec.ts` ; ma spec l'exigeait sans regarder `robots`. **Elle a
> été corrigée, pas le code.** Et six des douze pages « sans canonical » ne
> POUVAIENT pas en avoir : elles portent `'use client'`, et un composant client
> ne peut pas exporter `generateMetadata` — une conséquence, pas un oubli.

**Sans `canonical` (12)** — `/fr` et `/en` × `connexion`, `connexion-otp`,
`contact`, `don`, `mot-de-passe-oublie`, `newsletter/desinscription`.

**Sans `hreflang` fr+en (14)** — les 12 ci-dessus, plus `/fr/recherche` et
`/en/recherche`.

`/contact` est le cas le plus gênant : c'est une page publique destinée à être
indexée. Les autres sont des pages transactionnelles, pour lesquelles l'absence
de canonical est moins coûteuse — mais l'incohérence suggère une génération de
métadonnées qui ne passe pas par le helper partagé.
