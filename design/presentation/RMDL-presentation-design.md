# Direction et principes

Ce document présente le système de design du **Democracy Together** (Democracy Together) et l'ensemble des écrans maquettés. La direction visuelle vise une plateforme institutionnelle et éditoriale, crédible auprès des décideurs et des bailleurs, inclusive et performante, qui relie l'Afrique et l'Europe sans cliché.

**Lecture de la direction.** Une plateforme de think tanks, plus proche de Carnegie ou International IDEA que d'un produit SaaS. Un langage éditorial, typographique, au mouvement sobre et à l'accessibilité forte.

**Trois curseurs de design.** Variance 5 sur 10 (asymétrie éditoriale maîtrisée). Mouvement 3 sur 10 (sobre, pensé pour les connexions faibles). Densité 4 sur 10 (orienté contenu, aéré).

## Cinq partis pris

1. **Crédibilité avant effet.** Typographie sobre, hiérarchie nette, zéro artifice. Rien qui ressemble à une startup générique.
2. **Le texte est le produit.** Rapports, policy briefs, future revue. La lecture longue prime : serif éditorial, mesure de ligne contrôlée, contraste soigné.
3. **Inclusion réelle.** RGAA et WCAG AA partout, multilingue FR et EN dès l'architecture, prêt pour l'arabe (RTL) et les langues africaines.
4. **Léger par défaut.** Pensé pour la 3G de Dakar comme pour la fibre de Bruxelles. Peu de mouvement, images optimisées, rendu rapide, mobile d'abord.
5. **Deux univers, une ossature.** L'institutionnel (indigo, posé) et le hub jeunes (safran, vivant) partagent grille, composants et règles. Seul l'accent change.

# Système de design

## Couleurs

Une base neutre chaude, une encre profonde, et un seul accent par univers. L'accent choisi s'applique à toute une page, sans couleur surprise.

![Palette de couleurs Democracy Together](img/ds-couleurs.png)

**Neutres et encre**

| Rôle | Code | Usage |
|---|---|---|
| Papier | `#F4F2EC` | Fond de page |
| Surface | `#FBFAF5` | Cartes |
| Surface enfoncée | `#EFEDE4` | Zones de données |
| Encre | `#16191F` | Texte principal |
| Encre douce | `#454953` | Texte secondaire |
| Meta | `#646771` | Légendes (AA) |
| Filet | `#D9D6CD` | Bordures |

**Accents par univers**

| Univers | Accent | Survol / actif | Texte accessible |
|---|---|---|---|
| Institutionnel | Indigo `#1F3D6E` | `#16305A` | `#1F3D6E` |
| Jeunes | Safran `#DB8A34` | `#C2771F` | Ambre `#8F5510` |

**Échelle Baromètre (données, lisible au daltonisme)**

Libre `#2E6E8E` · Plutôt libre `#7BA7B0` · Partiellement `#E0B85C` · Peu libre `#CC8748` · Non libre `#9A4B3B`.

**Mode sombre**

Fond `#14171C`, surface `#1C2027`, texte `#ECEAE3`, indigo `#3A63A6`, safran `#E8A85A`. Aucun noir pur, aucun blanc pur.

## Typographie

Un serif éditorial pour la voix de publication, un sans humaniste multilingue pour l'interface, un monospace pour la donnée. Toutes libres et hébergeables, ce qui maîtrise le coût pour une association.

![Système typographique Democracy Together](img/ds-typo.png)

- **Newsreader** (serif) : titres, citations, corps des articles longs. Porte l'autorité d'une revue d'idées.
- **IBM Plex Sans** : interface, boutons, formulaires, métadonnées. Choisi pour sa couverture multilingue et son frère arabe (Plex Arabic) qui règle le RTL au niveau de la police.
- **IBM Plex Mono** : scores du Baromètre, dates, identifiants, KPI. La largeur fixe aligne les colonnes et signale la donnée vérifiable.

## Composants et fondations

![Composants Democracy Together](img/ds-composants.png)

- **Boutons** : primaire (aplat d'accent), secondaire (filet), fantôme. Contraste texte sur fond vérifié AA, retour tactile au clic.
- **Thématiques** : les 5 axes en pastilles (gouvernance numérique, participation citoyenne, lutte anti-corruption, transitions démocratiques, crises globales).
- **Formulaires** : label au-dessus du champ, aide ou erreur en dessous, jamais de placeholder en guise de label.
- **Forme** : chips et tags en pilule, tout le reste à 4px (cartes, boutons, champs), avatars et sceau en cercle.
- **Élévation** : ombres teintées encre, jamais noir pur. La hiérarchie passe d'abord par l'espace et le filet.

## Deux univers

Le hub jeunes n'est pas un autre site. Mêmes composants, même grille, même accessibilité. Il échange l'accent indigo contre le safran et adopte un ton plus direct.

![Univers jeunes (accent safran)](img/jeunes.png)

## Mode sombre

Chaque page fonctionne en clair et en sombre, piloté par un seul attribut. Les accents s'éclaircissent pour tenir le contraste AA.

![Accueil en mode sombre](img/accueil-dark.png)

## Accessibilité et multilingue

- Contraste AA minimum sur tout texte, focus visible, navigation clavier complète.
- Le mouvement respecte `prefers-reduced-motion` : tout s'arrête.
- FR et EN dès le départ, architecture i18n prête pour ES, PT et langues africaines, RTL prévu pour l'arabe.
- Formats locaux : dates, fuseaux, devises EUR et XOF.

# Les écrans

Onze pages partagent la même nav, le même footer, les mêmes tokens et les mêmes modes clair et sombre. Toutes sont reliées entre elles et navigables.

## Accueil

Hero éditorial, mission en bento, dernières analyses, carte interactive du Baromètre, événements, porte vers le hub jeunes, adhésion.

![Accueil](img/accueil.png)

## À propos et gouvernance

Vision et mission, fondateurs avec bios réelles (Abdou Samb, Philippe Kourilsky, Pierre Vimont), structure loi 1901 et bureaux Paris, Dakar, Bruxelles, financement et transparence.

![À propos et gouvernance](img/a-propos.png)

## Bibliothèque

Liste filtrable avec facettes fonctionnelles (thématique, type, région, langue, accès), recherche, tri et compteur en direct.

![Bibliothèque](img/bibliotheque.png)

## Fiche publication

DOI, citation exportable (APA, BibTeX, RIS), téléchargement, métriques d'impact, accès ouvert, publications liées.

![Fiche publication](img/publication.png)

## Baromètre

Carte choroplèthe interactive (survol et clic), classement des pays, fiches pays, sous-dimensions, méthodologie cadrée et jeux de données citables.

![Baromètre](img/barometre.png)

## Événements (agenda)

Recherche et filtres par type, région, format et langue, bascule à venir ou passés, événement en vedette et grille de cartes.

![Agenda des événements](img/evenements.png)

## Page événement et billetterie

Programme détaillé, intervenants, infos pratiques, et billetterie interactive (choix du tarif et quantité, total mis à jour).

![Page événement](img/evenement.png)

## Hub jeunes

Univers safran, parcours d'engagement en quatre étapes, gamification légère, programmes (mentorat, bourses, tribunes, campagnes).

![Hub jeunes](img/jeunes.png)

## Adhésion et cotisation

Sélecteur de type, estimateur de tarif solidaire (revenu du pays et devise EUR ou XOF), comparatif des avantages, aperçu de paiement, FAQ.

![Adhésion et cotisation](img/adhesion.png)

## Espace membre

Tableau de bord connecté : statut d'adhésion, KPI, contributions avec statut éditorial, activité récente, prochains événements.

![Espace membre](img/espace-membre.png)

## Système de design (référence)

La page vivante qui documente tokens, couleurs, typographie et composants, avec bascule univers et thème en direct.

![Système de design](img/style-guide.png)

# La suite

Cette maquette couvre l'ensemble du site public et l'amorce de l'espace membre. La stack cible recommandée dans le cadrage technique : Next.js plus Tailwind, PostgreSQL, CMS headless, hébergement UE, conforme RGPD.

Prochaine étape proposée : transformer ces écrans en projet Next.js réel, en commençant par un MVP de conférence pour le lancement 2026 (site institutionnel crédible, billetterie, don, newsletter), puis la plateforme réseau par phases.

Document établi par Be in Digital. Captures et données présentées à titre d'illustration.
