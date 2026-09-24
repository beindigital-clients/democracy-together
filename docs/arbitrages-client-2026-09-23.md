# Arbitrages à soumettre au client

**Date** : 23 septembre 2026
**Origine** : audit de vérification du 21 septembre (`docs/audit-verification-2026-09-21.md`)
**Usage** : le corps ci-dessous est **prêt à être envoyé au client**, sans retouche.

Ce document recense les points que l'audit a laissés ouverts **parce qu'ils ne
se tranchent pas techniquement**. Dans chaque cas les deux options sont
défendables : ce qui décide est ce que le réseau veut privilégier, pas ce que
le code permet. Aucun d'eux ne bloque une mise en ligne.

La correspondance avec le rapport est donnée à la fin, pour la relecture
interne — elle n'a pas à figurer dans le message envoyé.

---

## Message à envoyer

**Objet : Democracy Together — cinq décisions à prendre avant la mise en ligne**

Bonjour,

L'audit technique de la plateforme est terminé. L'essentiel a été corrigé, et
le détail est consigné dans le rapport de vérification. Restent **cinq points
qui ne sont pas des questions techniques, mais des choix qui vous
appartiennent** : à chaque fois, les deux options sont défendables, et le
résultat dépend de ce que vous voulez privilégier.

Aucun de ces cinq points ne bloque une mise en ligne. Ils gagnent simplement à
être tranchés plutôt que subis.

### 1. L'animation d'entrée de la page d'accueil, ou sa vitesse sur téléphone

La page d'accueil s'ouvre sur une animation séquencée : le titre apparaît mot à
mot, puis l'accroche, puis les boutons. C'est un parti pris fort, et il
fonctionne.

Il a un coût, que nous avons mesuré : sur un écran de téléphone, le texte
principal met **2 secondes** à s'afficher, contre 0,3 seconde sur ordinateur.
La raison tient à la largeur de l'écran : sur mobile c'est l'accroche qui
devient le plus grand élément de la page, et elle attend la fin de la séquence
du titre pour apparaître. Sur une connexion lente, on dépasse le seuil de
2,5 secondes au-delà duquel les moteurs de recherche considèrent la page comme
lente.

- **Garder l'animation** : l'accueil reste tel que conçu, au prix de ce délai
  sur mobile.
- **Y renoncer sur le premier écran seulement** : le contenu s'affiche
  immédiatement, les animations continuent de jouer sur le reste de la page en
  défilant. L'accueil perd son ouverture en fondu.

_Notre recommandation : y renoncer._ Le cadrage du projet annonce un premier
usage sur téléphone, souvent à faible débit. Nous avons déjà fait ce choix
ailleurs sur le site pour la même raison ; l'accueil est la dernière page à ne
pas l'avoir suivi.

### 2. Les candidatures d'adhésion : faut-il exiger que l'adresse de contact soit celle du compte ?

Quand un modérateur approuve une candidature d'organisation, le rôle de membre
est accordé **au compte connecté qui a déposé la demande** — pas à l'adresse de
contact saisie dans le formulaire. Les deux sont indépendantes, et c'est voulu :
sans cette liaison, un membre invité ne récupérerait jamais son adhésion.

L'écran de modération affiche désormais explicitement quel compte va être
élevé, et signale en clair lorsque son adresse diffère de celle du contact. Le
modérateur décide donc en connaissance de cause, ce qui n'était pas le cas.

La question qui reste : **faut-il aller plus loin et refuser toute candidature
dont les deux adresses diffèrent ?**

- **Non** : on garde la souplesse actuelle — une assistante peut déposer pour sa
  direction, un consultant pour l'organisation qu'il accompagne.
- **Oui** : on ferme la possibilité qu'un tiers obtienne un rôle en déposant au
  nom d'une organisation qui ne l'a pas mandaté, au prix de cas légitimes
  bloqués.

_Notre recommandation : non, en l'état._ L'information manquante a été ajoutée
là où la décision se prend ; c'est ce qui manquait réellement. Le durcissement
se justifierait si le réseau ouvrait l'adhésion très largement.

### 3. Les pages de connexion : masquées aux moteurs de recherche, mais de deux façons contradictoires

Les pages de connexion et de réinitialisation de mot de passe portent
aujourd'hui deux protections qui se neutralisent : une interdiction
d'exploration (le moteur ne vient pas), et une consigne de non-indexation
inscrite dans la page (que le moteur ne lira donc jamais, puisqu'il ne vient
pas).

Ce n'est pas un défaut visible, mais c'est une incohérence qu'un audit SEO
relèvera.

- **Retirer l'interdiction d'exploration** : le moteur passe, lit la consigne de
  non-indexation et l'applique. C'est la configuration la plus fiable.
- **Retirer la consigne dans la page** : on assume l'interdiction d'exploration
  seule, plus simple mais un peu moins sûre.

_Notre recommandation : la première._ C'est la pratique standard, et elle ne
coûte rien.

### 4. Les pages « introuvables » : uniformité ou justesse ?

Lorsqu'un visiteur ouvre un lien vers un contenu qui n'existe pas, la page
d'erreur s'affiche en français par défaut, y compris pour un visiteur
anglophone, tant que son navigateur n'a pas exécuté le code de la page. C'est
une limite de la technologie employée, que nous avons mesurée : elle ne se
contourne pas.

Trois rubriques du site pourraient toutefois y échapper, parce que leurs
contenus forment une liste fermée et connue à l'avance.

- **Ne rien faire** : le comportement reste le même partout. Un défaut, mais
  uniforme.
- **Corriger ces trois rubriques** : la page d'erreur y devient correctement
  traduite, et reste imparfaite ailleurs. Une incohérence, mais dans le bon
  sens.

_Notre recommandation : ne rien faire pour l'instant._ L'écart est faible et le
gain, invisible pour la quasi-totalité des visiteurs. À reconsidérer si la part
de visiteurs anglophones devient significative.

### 5. Le contraste des couleurs et la palette de marque

Certaines associations de couleurs de la charte — texte clair sur fond safran de
l'univers « Jeunes », couleurs des graphiques du baromètre en petit texte —
restent en deçà des seuils de contraste recommandés par le référentiel
d'accessibilité.

Les corriger revient à **s'écarter des couleurs validées avec l'agence**. Ce
point est déjà annoncé comme à traiter dans votre déclaration d'accessibilité ;
il n'est ni ignoré ni masqué, il attend l'arbitrage.

- **Conserver la palette** : la déclaration d'accessibilité continue de
  mentionner l'écart, ce qui est la démarche honnête.
- **Ajuster les teintes concernées** : mise en conformité, au prix d'un écart
  avec la charte.

_Notre recommandation : ouvrir le sujet avec l'agence de création plutôt que de
trancher côté technique._ Une variante des teintes concernées, réservée aux
petits textes, permettrait souvent de tenir les deux.

### Ce qui ne demande pas d'arbitrage

Tout le reste est traité et vérifié : sécurité, dégradation en cas de panne,
référencement, performances, accessibilité des parcours, couverture de tests.
Deux points techniques restent à notre charge et ne nécessitent pas votre
décision.

**Une seule action reste à confirmer avant la mise en ligne** : la vérification,
sur l'environnement de production, que les deux variables réservées au
développement en sont bien absentes. C'est une manipulation de quelques
minutes, mais elle ne peut être faite que par un accès direct à cet
environnement.

Nous restons à votre disposition pour en discuter.

Bien à vous,

---

## Notes internes — à ne pas transmettre

**Correspondance avec le rapport d'audit.**

| Message | Rapport                                   |
| ------- | ----------------------------------------- |
| Point 1 | F-14 (§ 3), mesuré au § 4quater           |
| Point 2 | M-6 (§ 4, § 4ter)                         |
| Point 3 | F-04 (§ 0), tension relevée sans la régler |
| Point 4 | F-06 (§ 0, § 3) — `dynamicParams`         |
| Point 5 | Angle mort 5 (§ 5)                        |

**Deux sujets ont été volontairement écartés du message**, parce qu'ils sont
internes et ne constituent pas des décisions client :

- **M-5** — où doit vivre la liste des événements pour que le serveur puisse
  valider un identifiant d'événement. Choix d'architecture ; le plafond absolu
  de rappels en attente est déjà posé.
- **M-1** — la provisionnalisation des mots de passe dans les tests
  automatisés, qui bloque un correctif déjà écrit.

**Aucun chiffre de contraste n'est cité au point 5, et c'est délibéré.** Les
mesures brutes de l'audit étaient gonflées par des faux positifs — texte mesuré
à opacité nulle, animations non déroulées — et ont été rétractées (§ 5,
angle mort 5). Les ressortir, même reformulées, reviendrait à republier un
chiffre que le rapport désavoue.

**L'action non arbitrable citée en fin de message** est la vérification de
`AUTH_DEV_OTP` et `RECAPTCHA_DISABLED` sur la production
(`npx convex env list --prod`, cf. `docs/deploiement.md` § 1.1 et l'angle
mort 7). Elle est nommée sans détail technique parce qu'elle conditionne la
mise en ligne et que le client doit savoir qu'elle reste due ; à qui elle
incombe dépend de qui détient les accès.

---

## Réponses reçues — 24 septembre 2026

| # | Sujet | Décision | Suite donnée |
| - | ----- | -------- | ------------ |
| 1 | Animation de l'accueil | **Garder l'animation** | Aucun code. F-14 reste ouvert et assumé ; le `test.fail()` de la garde F-05 devient la trace d'un choix, plus d'un constat en attente. |
| 2 | Adresses à l'approbation d'adhésion | **Non** | Aucun code. M-6 est clos : l'écran nomme le compte élevé, la souplesse est conservée. |
| 3 | Pages de connexion | **Retirer l'interdiction d'exploration** | **Fait.** `Disallow` retiré des trois tunnels, `noindex` conservé, et un garde interdit désormais de recombiner les deux. |
| 4 | Pages « introuvables » | **Corriger ces trois rubriques** | **Impossible en l'état** — voir ci-dessous. |
| 5 | Contraste | **Ajuster les teintes concernées** | **Commencé.** Un défaut trouvé et corrigé (−14 nœuds en sombre) ; le reste attend des valeurs de l'agence. |

### Point 4 — ce que j'avais annoncé était inexact, et la mesure le confirme

Deux erreurs, dont une dans le message envoyé :

1. **« La page d'erreur y devient correctement traduite » était faux.** Le
   rapport décrivait une 404 **bilingue**, servie sans l'en-tête ni le pied de
   page du site — pas une page traduite dans la langue du visiteur. J'ai
   surestimé le gain en le reformulant.
2. **Le gain lui-même n'existe pas.** Le rapport supposait qu'en posant
   `dynamicParams = false`, un paramètre inconnu cesserait de matcher et la 404
   redeviendrait rendue dans le HTML. C'était une hypothèse, pas une mesure.
   Mesurée : **18 caractères lisibles sans JavaScript avant comme après**. Une
   frontière `not-found` posée au niveau du segment ne change rien non plus.
   Le comportement de Next 16.3.5 ne dépend ni du drapeau ni de l'emplacement
   de la frontière : tout `notFound()` levé depuis une route qui matche n'émet
   pas son contenu.

La modification a donc été **retirée** : la livrer aurait laissé croire que ces
trois rubriques étaient corrigées alors que rien n'aurait changé pour un
visiteur.

**Ce qui reste possible**, et qui n'a pas été exploré par l'audit : intercepter
au niveau du middleware. Les trois jeux de paramètres étant fermés et connus,
le middleware peut reconnaître un paramètre inconnu et **réécrire** vers une
vraie route de page « introuvable », localisée, avec le statut 404. Une
réécriture rend une page normale — donc lisible sans JavaScript, dans la langue
du visiteur, avec l'en-tête et le pied de page. C'est un vrai développement, pas
un drapeau, et il faudrait le mesurer avant de le promettre.

### Point 5 — un défaut d'abord, la palette ensuite

La mesure a été **reprise à zéro** (`audit/specs/51-contraste.spec.ts`), les
premiers chiffres de l'audit ayant été rétractés. État réel, 24 pages
publiques, animations déroulées :

| Thème | Avant | Après le correctif |
| ----- | ----- | ------------------ |
| Clair | 36 nœuds, 14 paires | 36 nœuds, 14 paires |
| Sombre | 35 nœuds, 14 paires | **21 nœuds, 8 paires** |

**Le défaut corrigé n'était pas une question de teinte.** En thème sombre,
l'univers « jeunes » gardait ses couleurs de thème clair : la règle CSS exigeait
`data-theme` et `data-universe` sur le **même** élément, alors que le premier
vit sur `<html>` et le second sur un `<div>` de page. La variante sombre du
safran existait depuis le début et n'atteignait jamais la page. Corrigé avec la
valeur que le designer avait prévue — aucune couleur inventée.

**Ce qui reste demande des valeurs, pas du code.** Par famille :

| Famille | Paires | Nœuds | Ce qu'il faudrait décider |
| ------- | ------ | ----- | ------------------------- |
| Texte clair sur safran (`#f4f2ec` et ses variantes sur `#f58b1a`/`#f59024`, ratios 1,71 à 2,18) | 8 | 27 | Ce n'est pas un ajustement de teinte : il faut **inverser le texte** (encre foncée sur le safran) ou assombrir fortement le safran. Le premier préserve la couleur de marque. |
| Safran employé comme texte (`#f58b1a` sur `#f4f2ec`, 2,18) | 1 | 4 | Employer `--accent-text` (`#8a4a08`, ratio ≈ 5,9), qui existe déjà pour cet usage. Correctif de code, pas de palette. |
| Couleurs du baromètre en petit texte (`#2e6e8e`, `#9a4b3b`, `#7ba7b0`, `#cc8748` à 11–12,5 px) | 6 | 15 | Variantes assombries réservées aux libellés, ou libellés agrandis. |
| Gris sourds (`#8f9196`, `#8b8e96`, `#676a71`, ratios 2,73 à 3,93) | 3 | 6 | Nudges de quelques points de luminosité. |
| Deux cas limites (`#d8e0ed`/`#3a63a6` à 4,49 ; `#583a1b`/`#f58b1a` à 4,21) | 2 | 2 | À un cheveu du seuil. |

Je n'ai pas choisi ces valeurs : les inventer reviendrait à trancher la charte
à la place de l'agence, ce que ma propre recommandation déconseillait.
