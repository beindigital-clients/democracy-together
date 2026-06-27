// F-16 — Espace presse / kit média. Page publique sans backend Convex : contenu
// éditorial local bilingue (même approche que `partners-content.ts` /
// `reports-content.ts`). On y trouve un boilerplate (présentation du réseau en
// un paragraphe), des FAITS CLÉS — uniquement des faits ÉTABLIS, AUCUN chiffre
// inventé type « X membres » — le contact presse (renvoi au formulaire
// /contact) et des ressources (liens vers /a-propos et vers les données
// ouvertes du Baromètre, CC-BY). Vérifié sans terme banni.

export type PressFact = {
  slug: string;
  label: string;
  value: string;
};

export type PressResource = {
  slug: string;
  label: string;
  description: string;
  href: string;
  external: boolean; // true = fichier de données (lien <a>), false = route interne (<Link>)
};

export type PressKit = {
  // Boilerplate : présentation du réseau en un paragraphe, réutilisable tel quel
  // par une rédaction (« à propos de Democracy Together »).
  boilerplate: string;
  facts: PressFact[];
  resources: PressResource[];
};

// Slugs neutres (partagés fr/en), ordre d'affichage des faits clés.
export const PRESS_FACT_SLUGS = [
  'statut',
  'perimetre',
  'axes',
  'barometre',
] as const;

export type PressFactSlug = (typeof PRESS_FACT_SLUGS)[number];

// Slugs neutres des ressources presse.
export const PRESS_RESOURCE_SLUGS = [
  'a-propos',
  'donnees',
  'codebook',
] as const;

export type PressResourceSlug = (typeof PRESS_RESOURCE_SLUGS)[number];

const fr: PressKit = {
  boilerplate:
    "Democracy Together est un réseau de think tanks, de chercheurs et de partenaires d'Afrique et d'Europe qui comparent honnêtement leurs expériences démocratiques, sans posture donneuse de leçons. Constitué en association loi 1901 (en cours de constitution), le réseau travaille autour de cinq axes — gouvernance numérique, participation citoyenne, lutte anti-corruption, transitions démocratiques et crises globales — et publie ses analyses ainsi qu'un Baromètre dont les données sont ouvertes et reproductibles.",
  facts: [
    {
      slug: 'statut',
      label: 'Statut',
      value:
        'Association loi 1901 en cours de constitution, à but non lucratif et à vocation indépendante.',
    },
    {
      slug: 'perimetre',
      label: 'Périmètre',
      value:
        "Un réseau bicontinental Afrique-Europe : think tanks, chercheurs et partenaires réunis autour d'une comparaison démocratique honnête.",
    },
    {
      slug: 'axes',
      label: 'Cinq axes de travail',
      value:
        'Gouvernance numérique, participation citoyenne, lutte anti-corruption, transitions démocratiques et crises globales.',
    },
    {
      slug: 'barometre',
      label: 'Baromètre en données ouvertes',
      value:
        'Un indice composite Afrique-Europe dont les données et le codebook sont publiés en accès ouvert sous licence CC-BY, pour être reproduits et contestés.',
    },
  ],
  resources: [
    {
      slug: 'a-propos',
      label: 'À propos du réseau',
      description:
        'Mission, gouvernance, fondateurs et méthode : la présentation détaillée de Democracy Together.',
      href: '/a-propos',
      external: false,
    },
    {
      slug: 'donnees',
      label: 'Données du Baromètre (CSV, CC-BY)',
      description:
        "L'indice composite Afrique-Europe en données ouvertes, prêtes à être citées et réutilisées.",
      href: '/fr/barometre/data/composite.csv',
      external: true,
    },
    {
      slug: 'codebook',
      label: 'Codebook du Baromètre (TXT)',
      description:
        'Le dictionnaire des variables et la méthode de construction de chaque indicateur.',
      href: '/fr/barometre/data/codebook.txt',
      external: true,
    },
  ],
};

const en: PressKit = {
  boilerplate:
    'Democracy Together is a network of think tanks, researchers and partners from Africa and Europe who compare their democratic experiences honestly, without lecturing. Set up as a French not-for-profit (loi 1901, in formation), the network works around five pillars — digital governance, citizen participation, anti-corruption, democratic transitions and global crises — and publishes its analyses alongside a Barometer whose data is open and reproducible.',
  facts: [
    {
      slug: 'statut',
      label: 'Status',
      value:
        'A French not-for-profit (loi 1901), in formation, independent and non-partisan.',
    },
    {
      slug: 'perimetre',
      label: 'Scope',
      value:
        'A two-continent Africa-Europe network: think tanks, researchers and partners gathered around an honest democratic comparison.',
    },
    {
      slug: 'axes',
      label: 'Five pillars of work',
      value:
        'Digital governance, citizen participation, anti-corruption, democratic transitions and global crises.',
    },
    {
      slug: 'barometre',
      label: 'Barometer as open data',
      value:
        'A composite Africa-Europe index whose data and codebook are published openly under a CC-BY licence, so they can be reproduced and challenged.',
    },
  ],
  resources: [
    {
      slug: 'a-propos',
      label: 'About the network',
      description:
        'Mission, governance, founders and method: the detailed presentation of Democracy Together.',
      href: '/a-propos',
      external: false,
    },
    {
      slug: 'donnees',
      label: 'Barometer data (CSV, CC-BY)',
      description:
        'The composite Africa-Europe index as open data, ready to be cited and reused.',
      href: '/fr/barometre/data/composite.csv',
      external: true,
    },
    {
      slug: 'codebook',
      label: 'Barometer codebook (TXT)',
      description:
        'The dictionary of variables and the construction method behind each indicator.',
      href: '/fr/barometre/data/codebook.txt',
      external: true,
    },
  ],
};

export function getPressKit(locale: 'fr' | 'en'): PressKit {
  return locale === 'en' ? en : fr;
}
