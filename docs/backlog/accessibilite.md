# Chantier « accessibilité » — F-08 (WCAG / RGAA)

## Ce qui est livré

- **Audit RGAA 4.1.2** sur 19 pages (fr et ar, clair et sombre, desktop et
  mobile) : [`docs/rgaa/audit-2026-09.md`](../rgaa/audit-2026-09.md) (méthode,
  limites, grille détaillée, preuve par critère) et
  [`docs/rgaa/grille.csv`](../rgaa/grille.csv) (statut par critère × page,
  avant et après correctifs).
- **Taux de conformité mesuré : 72,6 %** (53 C, 20 NC, 33 NA ; taux moyen par
  page 88,5 %). **Après correctifs : 100 % projeté**, à confirmer par
  contre-audit sur le build de production (les correctifs n’ont pas pu être
  re-mesurés : le serveur de l’environnement servait le build d’avant).
- **Correctifs dans le code** des 20 critères non conformes : 1.2, 1.9, 3.1,
  3.3, 5.4, 5.6, 6.1, 7.1, 7.5, 8.6, 8.7, 8.10, 9.1, 10.7, 10.11, 11.1, 11.6,
  11.13, 13.5, 13.8 — détail et fichiers au § 5 de l’audit. Les plus
  structurants :
  - globe : bouton pause/lecture de la rotation (13.8) ;
  - palette de recherche : structure ARIA valide, nombre de résultats annoncé,
    focus visible, champ titré (7.1, 7.5, 10.7, 11.1) ;
  - `StatusMessage` (`src/components/a11y/status-message.tsx`) : la
    confirmation qui remplace un formulaire prend le focus (10 formulaires) ;
  - `@/i18n/content-lang` : `lang`/`dir` des contenus écrits dans une autre
    langue que la page (annuaire, bibliothèque, recherche, Tribune) ; le
    backend expose la langue (`search.globalSearch`, `tribune.listPosts`) ;
  - titres de page de l’espace membre et du back-office (par écran) ;
  - jeton `--line-field` (bordure des champs à 3,7:1) et contour de focus
    rétabli sur `Input`/`Textarea`/`Select`.
- **Déclaration d’accessibilité** `/accessibilite` au format RGAA, cinq langues
  (`src/lib/legal-content.ts`) : état « partiellement conforme », taux
  **mesuré**, non-conformités, dérogations, contenus non évalués, technologies,
  environnement de test, outils, pages vérifiées, contact, voies de recours.
  Les énumérations sont rendues en listes (`LegalSection.items`).
- **Protocole lecteurs d’écran** :
  [`docs/rgaa/protocole-lecteurs-ecran.md`](../rgaa/protocole-lecteurs-ecran.md)
  — 5 combinaisons, 11 scénarios, résultats attendus, grille à remplir.

## Tests ajoutés

- `tests/e2e/a11y-clavier.spec.ts` (30) : lien d’évitement, parcours complet à
  la tabulation (focus visible, pas de piège) sur 17 pages + espace connecté,
  formulaires au clavier seul, palette / langue / menu mobile / dialogue de
  confirmation (Échap et retour du focus), globe.
- `tests/e2e/a11y-annonces.spec.ts` (16) : `role=alert`/`status`, erreurs
  reliées aux champs, focus sur les confirmations, noms accessibles
  (`toMatchAriaSnapshot`), `lang` des contenus en arabe, titres de page.
- `tests/e2e/a11y-affichage.spec.ts` (77) : reflow 320 px (fr + ar), zoom de
  page 200 %, zoom du texte 200 %, espacement du texte.
- `tests/unit/a11y-rgaa.test.tsx` (20) : correctifs vérifiables sans
  navigateur, et **cohérence de la déclaration avec `grille.csv`** (le taux
  affiché est recalculé depuis la grille).
- `convex/search.test.ts`, `convex/tribune.test.ts` : langue exposée.
- Instruments partagés dans `tests/e2e/_a11y.ts` ; sessions dédiées
  `a11yClavier`, `a11yAnnonces`, `a11yAffichage` (`tests/e2e/_sessions.ts`).

Contre le build d’avant les correctifs, les specs E2E passent partout sauf
sur les non-conformités corrigées et la nouvelle déclaration (106 / 123) — c’est le contre-audit
automatisé : elles doivent être entièrement vertes après fusion et nouveau
build.

## Variables d’environnement

Aucune.

## Activation

Rien à activer. Après mise en production :

1. jouer les trois specs `a11y-*` contre la production (ou une préversion) ;
2. dérouler le protocole lecteurs d’écran ;
3. mettre à jour `grille.csv` (colonnes « après »), `audit-2026-09.md` et la
   déclaration (taux, date, liste des non-conformités) — le test unitaire
   `a11y-rgaa.test.tsx` refuse une déclaration dont le taux ne correspond pas à
   la grille ;
4. compléter l’adresse postale de contact (marquée « à compléter »).

## Limites connues

- Pas de lecteur d’écran dans l’environnement : la restitution vocale n’est pas
  vérifiée (protocole fourni).
- Chromium seul ; zoom texte émulé ; validateur W3C injoignable (html-validate
  à la place).
- Hors code, avec leur responsable (§ 6 de l’audit) : PDF des membres, replays
  vidéo, légende provisoire de la photo d’accueil, alternatives des images
  Sanity, langue des descriptions d’annuaire (supposée française : un champ de
  langue serait une évolution utile), reCAPTCHA (tiers).
- Le nom accessible des entrées du menu d’administration devient « Libellé
  (Administration) » : trois specs E2E existantes (`admin-ecrans`, `admin-nav`,
  `admin`) et `tests/unit/admin-nav.test.tsx` ont été ajustées en conséquence.
