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
