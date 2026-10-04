# Plaquette de présentation Democracy Together

Plaquette de 8 pages pour présenter l'initiative et recruter des membres, en
deux langues (français, anglais) et deux formats (A4, petit livret A5).
Texte source : « DEMOCRACY TOGETHER Plaquette V1.docx » (Philippe Kourilsky,
25/09/2026), marqué « esquisse non totalement validée, ne pas diffuser ». Le
texte n'est pas encore validé : ne pas diffuser la plaquette avant l'accord du
client. La version anglaise est une traduction de la version française : elle
hérite de ce même statut de brouillon.

La V1 tenait en 4 pages très denses (environ 460 mots par page). La V2 passe à
8 pages, le format courant d'une plaquette, avec un texte condensé : environ
970 mots en tout, 120 à 150 par page intérieure, une idée par page.

| Page | Contenu | Fond |
|---|---|---|
| 1 | Couverture : « La démocratie a besoin d'un réseau », anneau du logo autour du globe | Indigo |
| 2 | Le constat : la crise, ses causes, la citation clé | Papier, bandeau indigo |
| 3 | Notre réponse : le réseau, ses trois engagements, notre pari | Papier |
| 4 | Vision, cinq missions, le champ couvert | Indigo |
| 5 | La méthode : des contributions courtes, de qualité, évaluées par les pairs | Papier |
| 6 | KOHOP : le parcours d'une contribution en cinq étapes, ses atouts | Papier clair |
| 7 | Les fondateurs, où en est le projet, le financement | Papier |
| 8 | Rejoindre le réseau : qui peut adhérer, ce que le réseau apporte, contact | Papier, bandeau indigo |

Imprimée pliée, la plaquette se lit en doubles pages : 2-3 (pourquoi, quoi),
4-5 (vision, méthode), 6-7 (plateforme, équipe).

## Repères pour une plaquette

- Nombre de pages : un multiple de 4 pour une impression pliée ou agrafée
  (4, 8, 12). 8 pages est le format standard d'une plaquette institutionnelle ;
  au-delà de 12, on passe au livret.
- Texte : 120 à 200 mots par page au plus, une idée par page, des titres qui
  portent le message à eux seuls.
- Le détail (biographies complètes, règlement de KOHOP) a sa place sur le site.

## Visuels

Pas de photo : celles du dossier `public/library` n'ont pas de droits connus
(l'une porte la signature d'un photographe, une autre montre le parlement
australien). Le graphisme repose sur la charte du site :

- l'anneau de rayons du logo, retracé en vecteur depuis
  `public/brand/democracy-together-logo.png` : entier sur la couverture, qui
  s'efface sur la page du constat (la crise), en soleil levant pour les jeunes, avec la
  place vide du logo (à midi) désignée « la vôtre » sur la dernière page ;
- les globes en points (monde, Afrique et Europe, Paris en orange) ;
- les pictogrammes Lucide, ceux du site ;
- les couleurs (indigo, orange, papier) et les polices (Newsreader, IBM Plex)
  de `src/app/globals.css` et `src/lib/fonts.ts`.

Les fondateurs sont représentés par leurs initiales dans un anneau. Il faudra
demander leurs portraits au client si l'on veut des photos.

## Fichiers

- `plaquette.html` : la source française (texte et mise en page). Elle s'ouvre
  aussi dans un navigateur, une fois `visuels.js` généré.
- `plaquette-en.html` : la source anglaise. Même mise en page, même CSS ; le
  texte est traduit à la main, il n'y a pas de gabarit partagé (voir
  « Modifier le texte »).
- `build.mjs` : trace l'anneau du logo, dessine les globes, récupère les
  pictogrammes (une fois, communs aux deux langues), puis imprime les PDF et
  les aperçus des deux sources.
- `visuels.js`, `globe-*.svg` : générés par `build.mjs`, communs aux deux
  langues, ne pas les éditer à la main.
- `democracy-together-plaquette-a4.pdf`, `-livret-a5.pdf`,
  `-livret-a5-impression.pdf` : les trois PDF français (8 pages en A4, 8 pages
  en A5, livret A5 monté sur 4 faces A4 pour l'imprimer au bureau — voir
  « Impression »).
- Les mêmes trois PDF en anglais, suffixés `-en` :
  `democracy-together-plaquette-a4-en.pdf`,
  `-livret-a5-en.pdf`, `-livret-a5-impression-en.pdf`.
- `apercu/fr/a4/`, `apercu/fr/a5/`, `apercu/en/a4/`, `apercu/en/a5/` : les
  aperçus page par page (`page-1.png` à `page-8.png`) et la vue d'ensemble en
  doubles pages (`planche.png`), par langue et par format.

## Régénérer le PDF

Depuis la racine du dépôt, avec les dépendances installées et un accès réseau
(les polices viennent de Google Fonts) :

```bash
node design/plaquette/build.mjs
```

Le script produit les six PDF d'un coup (deux langues × trois PDF). Chaque
bloc de texte est une zone de taille fixe (`class="zone"`) : pour chaque
langue, chaque format et chaque page, le script affiche la place qui reste
sous chaque zone en millimètres, et signale `OVERFLOW` quand un texte déborde.
Il s'arrête si une police n'a pas chargé.

Les deux formats partagent la même source. Les longueurs s'écrivent
`calc(N * var(--mm))` et suivent la taille de la page ; les tailles de texte
s'écrivent `calc(N * var(--pt))` pour le texte courant et `calc(N * var(--dpt))`
pour les titres (13 pt et plus). En A5, la mise en page est réduite à 70 %, les
titres aussi, mais le texte courant seulement à 80 % pour rester lisible
(environ 8,4 pt). L'attribut `data-format` de `<html>` choisit le format.

## Modifier le texte

Le français se modifie dans `plaquette.html`, l'anglais dans
`plaquette-en.html`. Les deux fichiers sont indépendants : une modification du
texte dans l'un doit être reportée à la main dans l'autre, il n'y a pas de
gabarit commun pour le contenu (seuls le CSS, `visuels.js` et les globes sont
partagés). Après une modification, relancer le script et vérifier les lignes
`OVERFLOW`, dans les deux langues.

Typographie française (`plaquette.html` uniquement) : `&nbsp;` avant les
deux-points et à l'intérieur des guillemets, `&#8239;` (espace fine insécable)
avant le point-virgule, le point d'interrogation et le point d'exclamation.
Typographie anglaise (`plaquette-en.html`) : ponctuation standard, sans espace
avant `:`, `;`, `?`, `!` ; guillemets anglais courbes `“ ”` et apostrophe
courbe `’` plutôt que les guillemets français « » et le `&nbsp;`/`&#8239;`.

Le conseil d'administration et le comité d'honneur iront page 7, à côté des
fondateurs ; le financement pourra alors passer en page 6 ou sur le site. À
reporter dans les deux langues le jour venu.

## Impression

Les deux langues s'impriment de la même façon ; remplacer simplement le nom
de fichier par sa variante `-en` pour la version anglaise.

- **A4** : pour l'envoi par e-mail et la lecture à l'écran.
- **Livret A5 chez un imprimeur** : envoyer `democracy-together-plaquette-livret-a5.pdf`
  (8 pages A5, finition piqûre à cheval, deux agrafes au pli). Il faudra
  ajouter 3 mm de fonds perdus et des traits de coupe ; les couleurs sont en
  RVB, l'imprimeur les convertit en CMJN.
- **Livret A5 au bureau** : imprimer
  `democracy-together-plaquette-livret-a5-impression.pdf` (2 feuilles A4) en
  recto verso, retournement sur le bord court, à taille réelle (100 %).
  Glisser la feuille 2 dans la feuille 1, plier au milieu, agrafer au pli.
  L'imprimante laisse une marge blanche autour des pages de couleur.

## Écarts avec le texte V1

Le texte a été condensé (environ 1 390 mots en V1, 970 en V2). Les faits, les
chiffres et les noms sont ceux du texte V1 ; rien n'a été ajouté sur le fond.

Titres et accroches :

- Couverture : « La démocratie a besoin d'un réseau » reprend le titre de la
  page d'accueil du site ; le sous-titre résume le positionnement.
- Page 3 : les trois points « Nous le voulons : (i) ouvert aux « jeunes »…
  (ii) mondial (iii) avec une attention particulière… » deviennent trois
  engagements explicites, chacun avec une phrase : « Ouvert aux jeunes »,
  « Mondial » (qui reprend « associant les pays développés et les pays en
  émergence »), « Attentif à l'Afrique et à l'Europe ».
- Page 8 : « Votre think tank a sa place dans le réseau » et la liste « Ce que
  le réseau vous apporte » regroupent des éléments dispersés dans le texte
  (visibilité, administration allégée, formations et financements ciblés,
  conférences et colloques, liberté d'action, fonds pour les projets
  collaboratifs).

Coupes, à valider :

- Page 2 : la phrase « Ils mènent des recherches indépendantes, influencent
  les politiques publiques et favorisent le débat citoyen » et la parenthèse
  « (par opposition à « illibérale ») ».
- Page 6 : « critères à élaborer », dans la récusation des relecteurs ; il
  reste l'exemple du coauteur.
- Page 7 : les biographies sont raccourcies. Disparaissent : la présidence du
  Singapore Immunology Network (Philippe Kourilsky), l'Abdou Samb Foundation et
  la phrase sur l'apport d'Abdou Samb au réseau, les domaines de travail de
  Pierre Vimont. Les versions complètes peuvent aller sur le site.

Corrections déjà faites en V1 et conservées : « récuser » au lieu de
« réfuter » des relecteurs, « rédacteur en chef » partout, « qualité
contrôlée » partout, « association loi 1901 », « fin novembre ou début
décembre 2026 ».

## Version anglaise

`plaquette-en.html` traduit le texte de `plaquette.html` page par page, sans
rien ajouter ni retrancher sur le fond. Quelques choix à signaler :

- « Le rédacteur en chef » et « l'auteur » (page 6, le parcours KOHOP) sont
  traduits par « the editor-in-chief » / « the author », repris ensuite par
  « they » plutôt que « he » : ce sont des fonctions, pas des personnes
  nommées, et rien dans le texte source n'indique le genre de leurs titulaires
  futurs.
- Pierre Vimont (page 7) : le texte source évite le sigle (« Service européen
  pour l'action extérieure »), question encore ouverte pour le français (voir
  plus bas). En anglais, le nom de l'organe est « European External Action
  Service » ; le sigle usuel « EEAS » est ajouté entre parenthèses, ce qui est
  le nom propre de l'institution, pas un raccourci de traduction.
- « Collège de France » et « Institut Pasteur » restent en français : ce sont
  les noms propres de ces institutions, également utilisés tels quels dans la
  presse anglophone. « Académie des sciences » devient « French Academy of
  Sciences », plus explicite pour un lecteur non francophone.
- « Association loi 1901 » (page 7 et le bas de la page 8) : la mention
  complète est gardée au bas de la page 8 (« Non-profit association (French
  “loi 1901”) · Paris ») ; dans la frise chronologie de la page 7, resserrée
  en « Non-profit association » faute de place dans la colonne, comme le
  français condense déjà le texte V1 par endroits (voir ci-dessus).
- Titre de la page 7 : « Ceux qui portent le projet » devient « Who’s behind
  the project » plutôt qu'une traduction mot à mot, pour tenir sur une ligne à
  la taille du titre.

## À valider avec le client

1. Les coupes et les titres listés ci-dessus.
2. La place vide de l'anneau désignée « la vôtre » en dernière page : l'idée
   prête un sens au dessin du logo ; le client doit l'approuver.
3. Les portraits des fondateurs, si l'on veut des photos à la place des initiales.
4. Pierre Vimont, dans le texte français : sigle « SEAE » ou nom complet ? La
   V2 donne le nom complet, sans sigle (la version anglaise, elle, utilise le
   nom anglais de l'institution et son sigle usuel « EEAS » — voir « Version
   anglaise »).
5. L'adresse du site et un QR code vers la page d'adhésion, dès que le domaine
   est fixé (democracytogether.org ?).
6. ~~Une version anglaise pour le recrutement hors des pays francophones.~~
   Faite (`plaquette-en.html`) : à relire, les choix de traduction sont listés
   dans « Version anglaise » ci-dessus.
7. Impression : quantité, imprimeur et papier, pour préparer la version avec
   fonds perdus (dans les deux langues).

À signaler aussi : la page d'accueil du site annonce des bureaux à « Paris ·
Dakar · Bruxelles », alors que le texte V1 dit que les pôles régionaux
« seront installés prochainement ». L'un des deux est à corriger.
