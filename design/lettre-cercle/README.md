# Lettre d'invitation au Cercle des amis, et son annexe

Lettre qui invite à rejoindre le Cercle des amis de Democracy Together,
suivie d'une annexe d'exemples (deux messages de l'espace privé du Cercle, une
contribution KOHOP avec ses commentaires). En français et en anglais.

Texte source : « DT DOC AMIS Avec Annexe.docx » (Philippe Kourilsky), avec ses
corrections en rouge et ses réponses du 22/11/2026.

## Fichiers

- `lettre-fr.html`, `lettre-en.html` : les sources (texte et mise en page),
  une par langue. Comme pour la plaquette, il n'y a pas de gabarit commun : une
  modification du texte dans une langue doit être reportée à la main dans
  l'autre.
- `lettre.css` : la mise en page commune (couleurs et polices du site).
- `build.py` : imprime les PDF.
- `pdf/` : les PDF générés.

## Les PDF

Pour chaque langue (`fr`, `en`) :

| Fichier | Contenu | Pour qui |
|---|---|---|
| `democracy-together-invitation-cercle-<langue>-<signataire>.pdf` | Lettre signée + annexe | Les contacts de ce signataire |
| `democracy-together-invitation-cercle-<langue>-modele.pdf` | Lettre avec la signature à compléter + annexe | Modèle |
| `democracy-together-annexe-exemples-<langue>.pdf` | Annexe seule, avec une courte introduction | Les auteurs pressentis pour KOHOP |

## Régénérer les PDF

Depuis la racine du dépôt, avec un accès réseau (les polices viennent de
Google Fonts) :

```bash
python3 design/lettre-cercle/build.py
```

Le script utilise le navigateur headless de Playwright s'il est installé
(`pnpm exec playwright install chromium-headless-shell`), sinon Google Chrome.
Pour en choisir un autre, définir la variable `CHROME`.

## Ajouter un signataire

Chaque membre envoie la lettre à ses propres contacts, sous sa signature.
Pour ajouter un signataire :

1. Ajouter une entrée au tableau `SIGNATAIRES`, en bas de `lettre-fr.html` et
   de `lettre-en.html` (nom et qualité).
2. Ajouter sa clé à `SIGNERS` dans `build.py`.
3. Relancer `build.py`.

Les paramètres d'URL servent aussi à l'écran : `lettre-fr.html?signe=abdou-samb`,
`lettre-fr.html?mode=annexe`.

## Choix faits sur le texte

- Lettre : toutes les corrections en rouge du docx sont reprises. « Vous
  trouverez ci-joint la plaquette » devient « la plaquette et la note de
  présentation » (les deux seront jointes). Le point 3 invite à faire suivre la
  lettre et les deux documents. Un lien vers la page de dons du site s'ajoute
  au point 5. Le « ??? » laissé après l'adresse officielle est retiré.
- Annexe : un paragraphe de l'exemple sur l'éducation s'était collé au milieu
  de l'article de Philippe Kourilsky, il est retiré. Les coupures de mots
  héritées du PDF sont recollées. Les paragraphes de l'article sont
  reconstitués d'après le sens, à vérifier sur l'original de Telos.
- Le commentaire de Jean-Pierre Roth est repris mot pour mot (vérifié par
  comparaison automatique avec le docx), seules les coupures de ligne changent.
- Le deuxième message d'exemple du Cercle reçoit ses accents (représentative,
  conférences, réside, expériences) et « grand-chose ».
- Les deux commentaires imaginaires portent la mention « Commentaire
  imaginaire ».
- Version anglaise : l'article, les commentaires et la décision du rédacteur
  en chef sont traduits du français, ce que la mention de source indique.

## À confirmer avec Philippe Kourilsky

Confirmés le 23/11/2026 : la qualité des signataires (« Cofondateur de
Democracy Together » pour Philippe Kourilsky et Abdou Samb) et la mention
« Commentaire imaginaire » sur les deux commentaires d'exemple.

- L'accord de Jean-Pierre Roth pour la publication de son commentaire sous son
  nom, et la vérification de la recopie par David Ojcius.
- L'adresse officielle democracy-together.org (avec tiret), à vérifier avec
  Armelle Chapalain.
- Une version anglaise officielle de l'article, si elle existe, à substituer
  à la traduction.
