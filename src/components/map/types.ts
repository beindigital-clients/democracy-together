// Contrat de données des visualisations régionales (carte SVG et globe).
//
// Le type vivait dans `region-map.tsx`, dont le composant n'est monté nulle
// part — l'audit § 5.9 en concluait que le fichier était mort, alors que le
// TYPE, lui, est bien vivant : il est produit par les pages (accueil,
// baromètre, annuaire) et consommé par `region-globe.tsx`. Le sortir d'ici
// découple ce contrat du sort du composant `RegionMap`, tranché avec #13
// (issue #40).
//
// Ce module ne doit garder AUCUNE dépendance d'exécution : il est importé par
// des composants client, tandis que la géométrie (`@/lib/region-geo`) embarque
// d3-geo et la topologie mondiale et reste calculée côté serveur.

export type RegionMapItem = {
  name: string; // libellé world-atlas (clé de correspondance)
  region?: 'afrique' | 'europe'; // pour le filtre par chips (optionnel)
  fill: string; // couleur de remplissage du pays
  title: string; // titre du panneau de détail (localisé)
  rows: { label: string; value: string; valueClassName?: string }[];
};
