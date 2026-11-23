# Note de présentation Democracy Together

Note de 4 pages A4 jointe à la lettre d'invitation au Cercle des amis, avec la
plaquette. Reconstruite le 23/11/2026 d'après le PDF
« democracy-together-presentation-fr.pdf » (version d'octobre 2026), dont la
source n'avait pas été conservée.

| Page | Contenu | Fond |
|---|---|---|
| 1 | Couverture : sigle DT, devise, anneau du logo autour du globe | Indigo |
| 2 | 01 Pourquoi Democracy Together, 02 Notre initiative (carte), vision et missions | Blanc, bandeau indigo |
| 3 | 03 KOHOP, 04 Correspondants, 05 Gouvernance | Blanc |
| 4 | 06 Comité d'honneur, 07 Les Amis, 08 Perspectives, contact | Indigo |

## Fichiers

- `note-fr.html` : la source (texte et mise en page).
- `build.mjs` : dessine la carte du monde en points (`carte-monde.svg`),
  récupère les pictogrammes Lucide (`visuels.js`), puis imprime le PDF et les
  aperçus. L'anneau du logo et le globe de couverture viennent de la plaquette
  (`../plaquette/visuels.js`, `../plaquette/globe-couverture.svg`).
- `democracy-together-presentation-fr.pdf` : le PDF.
- `apercu/page-1.png` à `page-4.png` : les aperçus.

## Régénérer le PDF

Depuis la racine du dépôt, avec les dépendances installées et un accès réseau
(les polices viennent de Google Fonts) :

```bash
node design/note-presentation/build.mjs
```

Le script indique la place qui reste en bas de chaque page. Si le navigateur
de Playwright attendu manque, passer un autre `chrome-headless-shell` dans
`PLAYWRIGHT_CHROMIUM_PATH`.

## Modifications par rapport au PDF d'octobre 2026

- Fond blanc au lieu du beige sur les pages 2 et 3.
- 03 KOHOP, évaluation par les pairs : « l'auteur sollicite trois relecteurs,
  pour en obtenir au moins deux » (règle de Philippe Kourilsky, 22/11/2026).
- 06 Comité d'honneur : ajout de « Harvey Fineberg, Professor emeritus,
  Harvard University », mention exacte demandée par Philippe Kourilsky le
  23/11/2026.
- 08 Contact : contact@democracy-together.org et democracy-together.org, avec
  tiret (domaine retenu le 22/11/2026).
- Corrections mineures : « choisies » (personnalités), « cofondateur ».

## À confirmer

- La version « augmentée » de la note, envoyée par Philippe Kourilsky à Abdou
  Samb, n'a pas été reçue : ses autres changements éventuels ne sont pas
  reportés ici.
- Le titre de Harvey Fineberg est en anglais, comme Philippe l'a écrit ; les
  autres titres du comité sont en français.
- « Publier sur KOHOP suppose l'adhésion au réseau » alors que la lettre
  invite les Amis du Cercle à écrire pour KOHOP.
- La section 07 décrit encore le Cercle des amis comme une liste de soutiens
  à formaliser ; la lettre annonce désormais un espace privé et une demande en
  ligne.
- La date « Paris, octobre 2026 » et la composition du conseil au
  15 octobre 2026.
- L'adresse contact@democracy-together.org doit exister avant l'envoi.
