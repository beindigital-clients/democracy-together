# Protocole de restitution vocale — lecteurs d’écran

Complément de l’[audit RGAA du 27/09/2026](./audit-2026-09.md). L’audit a été
conduit sans lecteur d’écran : il a vérifié l’**arbre d’accessibilité** (ce que
le navigateur transmet aux aides techniques — noms, rôles, états, régions
live, focus), pas ce qui est **prononcé**. Ce protocole est à dérouler par une
personne, sur de vrais appareils, avant de déclarer la conformité, puis à
chaque évolution majeure de l’interface.

## 1. Ce que l’arbre d’accessibilité a déjà établi (et ce qu’il laisse ouvert)

| Vérifié par l’arbre d’accessibilité (tests automatisés) | Reste à entendre |
|---|---|
| Nom, rôle et état des contrôles clés (`toMatchAriaSnapshot` : en-tête, connexion) | Que le lecteur annonce bien « Langue FR, bouton, menu, réduit » et non un nom tronqué |
| Présence et contenu des régions `role="status"` / `role="alert"` au bon moment | Que le message est **effectivement prononcé**, une seule fois, sans couper la lecture en cours |
| Focus déplacé sur la confirmation d’un formulaire, sur le premier champ fautif, sur « Annuler » d’un dialogue | Que le lecteur lit le contenu à la prise de focus (et pas seulement « statut ») |
| `lang`/`dir` sur les blocs dans une autre langue | Que la **voix change** (français lu avec une voix française dans une page arabe) |
| `aria-activedescendant` de la palette de recherche | Que chaque option est annoncée à la flèche, avec sa position (« 2 sur 5 ») |

## 2. Combinaisons à tester

Celles de l’environnement de test du RGAA (base de référence), versions
stables les plus récentes à la date du test :

| # | Plateforme | Lecteur d’écran | Navigateur |
|---|---|---|---|
| A | Windows 11 | NVDA | Firefox |
| B | Windows 11 | JAWS | Firefox (et Chrome ou Edge si le temps le permet) |
| C | macOS | VoiceOver | Safari |
| D | iOS | VoiceOver | Safari |
| E | Android | TalkBack | Chrome |

Chaque scénario est joué en **français** ; les scénarios marqués « ar » le sont
aussi en **arabe** (voix arabe installée et active).

Réglages : lecteur d’écran en réglages par défaut, verbosité par défaut ;
navigateur à 100 % ; thème clair puis, pour S3 et S7, thème sombre (vérifier
qu’aucune information n’est perdue quand seul le rendu change).

## 3. Scénarios et résultats attendus

Pour chaque scénario : les **actions**, puis ce qui doit être **entendu**. Tout
écart est noté (combinaison, étape, ce qui a été entendu).

### S1 — Arriver sur l’accueil (fr, ar) — critères 8.5, 8.6, 12.6, 12.7, 9.1
1. Ouvrir `/fr`. Attendu : titre « Democracy Together » annoncé à l’ouverture.
2. Tab. Attendu : « Aller au contenu, lien ». Entrée, puis Tab : le focus est
   dans le contenu principal (premier lien du bandeau d’accueil).
3. Liste des repères (NVDA : `D` ; JAWS : `R` ; VoiceOver : rotor « Repères »).
   Attendu : bannière, navigation, principal, navigation « Le réseau »,
   « Analyses », « S’engager », informations sur le contenu.
4. Liste des titres. Attendu : un seul niveau 1 (« La démocratie a besoin d’un
   réseau. »), niveaux 2 et 3 sans saut.
5. En arabe (`/ar`) : la voix est arabe, la lecture va de droite à gauche,
   « الانتقال إلى المحتوى » est annoncé en premier.

### S2 — En-tête : langue, thème, globe (fr) — 7.1, 13.8
1. Tabuler jusqu’au sélecteur de langue. Attendu : « Langue FR, bouton de menu,
   réduit » (formulation selon le lecteur).
2. Entrée. Attendu : « Français, élément de menu, coché, 1 sur 5 ». Flèche bas :
   « English, … non coché, 2 sur 5 » — prononcé avec une voix **anglaise**
   (chaque item porte sa langue). Échap : retour sur « Langue FR, bouton ».
3. « Changer de thème » : annoncé « bouton bascule, non enfoncé » puis
   « enfoncé » après activation.
4. Sur `/fr/barometre`, atteindre « Mettre en pause la rotation du globe,
   bouton » ; l’activer. Attendu : le nom devient « Lancer la rotation du
   globe ».

### S3 — Palette de recherche (fr) — 7.1, 7.5, 12.9
1. Activer « Recherche » (ou Ctrl+K). Attendu : « Rechercher sur le site,
   dialogue » puis « Publication, membre, actualité…, zone de liste modifiable ».
2. Taper « democratie ». Attendu, sans action : « N résultats » (région
   `status`).
3. Flèche bas. Attendu : le titre de la publication, « option », position
   (« 1 sur N ») ; puis les membres, groupe « Membres du réseau ».
4. Taper « zzzxqkw ». Attendu : « Aucun résultat pour « zzzxqkw ». »
5. Échap. Attendu : retour sur « Recherche, bouton ». Aucun contenu de la
   palette ne reste lisible.

### S4 — Formulaire de contact (fr) — 11.1, 11.10, 7.5
1. `/fr/contact`, « Envoyer le message » sans rien saisir. Attendu : le focus
   va sur « Nom », annoncé « obligatoire, invalide » et suivi de son message
   d’erreur.
2. Tab sur chaque champ : chacun annonce son erreur (description).
3. Remplir correctement, envoyer. Attendu : « Message envoyé » et le texte de
   confirmation lus **automatiquement** (focus sur la confirmation) ; Tab
   repart de là, pas du haut de la page.

### S5 — Connexion refusée (fr) — 7.5, 11.10
1. `/fr/connexion`, adresse et mot de passe faux, Entrée. Attendu :
   « E-mail ou mot de passe incorrect. » annoncé immédiatement (région
   `alert`), le focus reste dans le formulaire.
2. « Afficher le mot de passe » : l’état change et le champ est relu.

### S6 — Adhésion (fr, ar) — 11.5, 11.6, 11.13, 7.5
1. `/fr/adhesion`, tabuler jusqu’au formulaire de candidature. Attendu :
   « Type de candidature, groupe », puis « Think tank / organisation, bouton
   radio, coché, 1 sur 2 ».
2. Flèche droite : « Chercheur / individuel, coché » ; le champ suivant est
   annoncé « Nom et prénom » (le libellé change avec le type).
3. Estimateur : changer le niveau de revenu. Attendu : le nouveau montant est
   annoncé poliment (région `aria-live`), sans interrompre.
4. Formulaire : le navigateur propose le remplissage automatique d’« E-mail »
   et de « Pays ».

### S7 — Bibliothèque et publication (fr, ar) — 6.1, 8.7, 9.1, 13.5
1. `/fr/bibliotheque`, liste des titres : « Liste des publications » (niveau
   2) avant les cartes (niveau 3), y compris sur mobile.
2. Sur une carte : le nom du lien contient le titre ; les compteurs sont lus
   « Téléchargements : 1 234 », « Citations : 12 » (pas « flèche vers le bas »).
3. Pagination : « Page 2, lien ».
4. `/ar/bibliotheque` : les titres français sont lus avec la voix **française**,
   de gauche à droite.
5. Fiche d’une publication : le contenu (résumé, points clés) change de voix
   selon sa langue ; la figure est annoncée avec sa légende.

### S8 — Baromètre : tableaux (fr) — 5.4, 5.6, 6.1
1. `/fr/barometre`, atteindre le tableau « Classement de l’indice composite »
   (NVDA/JAWS : `T`). Attendu : titre du tableau, nombre de lignes et de
   colonnes.
2. Navigation cellule par cellule (Ctrl+Alt+flèches) : l’en-tête de colonne
   est annoncé à chaque changement de colonne.
3. Tableau « Jeux de données » : son titre est annoncé ; sur un lien « CSV »,
   l’en-tête de ligne (nom du jeu de données) est annoncé.

### S9 — Annuaire en arabe — 8.7, 8.10
1. `/ar/le-reseau`, lire une carte. Attendu : pays et région en arabe, la
   description (française) lue avec la voix française.

### S10 — Espace membre et back-office (fr) — 8.6, 7.1, 7.5, 11.12
1. Se connecter, ouvrir `/fr/espace-membre`. Attendu : titre « Espace membre ·
   Democracy Together ».
2. `/fr/admin/utilisateurs`. Attendu : titre « Utilisateurs · Administration ·
   Democracy Together » ; menu « Administration, navigation », entrées
   « Utilisateurs (Administration), page courante ».
3. Changer le rôle d’un compte de test, « Appliquer ». Attendu : « Changer le
   rôle de … ?, dialogue », focus sur « Annuler ». Échap : retour sur
   « Appliquer ». Confirmer : « … est désormais « Visiteur » » annoncé.

### S11 — Mobile (D et E, fr et ar) — 12.9, 13.9, 7.1
1. Balayer l’accueil du début à la fin : ordre de lecture = ordre visuel ;
   aucun élément masqué n’est atteint.
2. « Ouvrir le menu, bouton, réduit » ; activer : « Menu, dialogue » ; le
   balayage reste dans le menu ; « Fermer le menu » le referme et rend le focus
   au bouton.
3. Tourner l’appareil en paysage : tout reste lisible.

## 4. Grille de résultats (à remplir)

| Scénario | A · NVDA/Firefox | B · JAWS/Firefox | C · VO/Safari macOS | D · VO/iOS | E · TalkBack/Chrome | Remarques |
|---|---|---|---|---|---|---|
| S1 | | | | | | |
| S2 | | | | | | |
| S3 | | | | | | |
| S4 | | | | | | |
| S5 | | | | | | |
| S6 | | | | | | |
| S7 | | | | | | |
| S8 | | | | | | |
| S9 | | | | | | |
| S10 | | | | | | |
| S11 | — | — | — | | | |

Notation : `OK` (résultat attendu entendu), `KO` (écart — décrire),
`Partiel`. Un `KO` sur une combinaison de la base de référence rend le critère
concerné non conforme : reporter l’écart dans `grille.csv` (colonnes « après »
de la page) et dans la déclaration d’accessibilité.
