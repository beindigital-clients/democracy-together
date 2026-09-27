import type { Locale } from '@/i18n/routing';

// Baromètre de la démocratie (F-30) — contenu porté 1:1 depuis la maquette
// agence `design/rmdl-barometre.html`. TOUTES les valeurs sont des **données
// d'illustration** (scores/classements fictifs, c'est explicite dans la
// maquette) : aucune affirmation sur des pays réels. Module bilingue pensé pour
// basculer plus tard sur une table Convex `barometer` ou sur Sanity (la donnée
// pays est éditoriale, gérée par le secrétariat). Vérifié sans terme banni.

export type Trend = { dir: 'up' | 'down' | 'flat'; value: string };
export type RankRow = {
  pos: string;
  country: string;
  region: string; // libellé court (EUR/AFR)
  index: string;
  cat: 1 | 2 | 3 | 4 | 5;
  trend: Trend;
};
export type Profile = {
  country: string;
  region: string;
  score: string;
  cat: 1 | 2 | 3 | 4 | 5;
  bars: { label: string; value: number; cat: 1 | 2 | 3 | 4 | 5 }[];
};
export type Dimension = {
  ix: string;
  title: string;
  mean: string;
  cat: 1 | 2 | 3 | 4 | 5;
  body: string;
};

export type BarometerContent = {
  hero: {
    crumbHome: string; // fil d'Ariane — même clé que sur les événements
    eyebrow: string;
    title: string;
    lead: string;
    ctaMethod: string;
    ctaData: string;
    disclaimer: string;
  };
  kpis: { value: string; label: string }[];
  map: {
    title: string;
    lead: string;
    chips: string[];
    note: string;
    tilesLabel: string;
    interactiveHint: string;
    indexLabel: string;
    categoryLabel: string;
  };
  // Titre de la légende, affiché par le teaser d'accueil. Il vit ici, avec
  // la légende qu'il nomme : une seule source, deux pages (issue #34).
  legendLabel: string;
  legend: { label: string; range: string }[]; // 5 niveaux, du plus libre au moins
  ranking: {
    eyebrow: string;
    title: string;
    cta: string;
    caption: string;
    headers: {
      rank: string;
      country: string;
      index: string;
      category: string;
      trend: string;
    };
    rows: RankRow[];
  };
  profiles: { eyebrow: string; title: string; cta: string; items: Profile[] };
  dimensions: {
    eyebrow: string;
    title: string;
    lead: string;
    meanLabel: string;
    items: Dimension[];
  };
  methodology: {
    eyebrow: string;
    title: string;
    steps: { title: string; body: string }[];
    cta: string;
    guaranteesTitle: string;
    guarantees: { strong: string; rest: string }[];
    license: string;
  };
  datasets: {
    eyebrow: string;
    title: string;
    lead: string;
    headers: {
      dataset: string;
      formats: string;
      doi: string;
      codebook: string;
      /** Colonne de téléchargement : en-tête réservé aux lecteurs d'écran. */
      action: string;
    };
    codebookLabel: string;
    downloadLabel: string;
    rows: {
      name: string;
      sub: string;
      formats: string[];
      doi: string;
    }[];
  };
  contrib: {
    title: string;
    body: string;
    ctaPrimary: string;
    ctaSecondary: string;
  };
};

const fr: BarometerContent = {
  hero: {
    crumbHome: 'Accueil',
    eyebrow: 'Données ouvertes',
    title: 'Le Baromètre de la démocratie',
    lead: "Un indice composite Afrique-Europe, construit par méta-agrégation de sources sous licence ouverte. Méthodologie publiée, jeux de données citables en accès ouvert, supervision d'un comité scientifique indépendant.",
    ctaMethod: 'Note méthodologique',
    ctaData: 'Télécharger les données',
    disclaimer:
      "Données d'illustration. Les scores et classements présentés ici sont fictifs et servent uniquement à montrer la maquette.",
  },
  kpis: [
    { value: '42', label: 'pays couverts (illustration)' },
    { value: '5', label: 'sous-dimensions agrégées' },
    { value: 'CC-BY', label: 'licence des données ouvertes' },
  ],
  map: {
    title: "L'indice, pays par pays",
    lead: "Chaque territoire porte son score composite. Lecture prudente : il s'agit d'une agrégation, non d'un jugement.",
    chips: ['Tout', 'Afrique', 'Europe'],
    note: 'Vue illustrative',
    tilesLabel: 'Scores par pays (illustration)',
    interactiveHint: 'Survolez ou touchez un pays pour afficher son indice.',
    indexLabel: 'Indice composite',
    categoryLabel: 'Catégorie',
  },
  legendLabel: 'Indice de liberté',
  legend: [
    { label: 'Libre', range: '0.80 et plus' },
    { label: 'Plutôt libre', range: '0.65 à 0.79' },
    { label: 'Partiellement libre', range: '0.50 à 0.64' },
    { label: 'Peu libre', range: '0.35 à 0.49' },
    { label: 'Non libre', range: 'moins de 0.35' },
  ],
  ranking: {
    eyebrow: 'Édition 2026 · illustration',
    title: "Classement de l'indice composite",
    cta: 'Voir le jeu de données complet',
    caption:
      "Données d'illustration. Évolution indiquée par rapport à l'édition précédente.",
    headers: {
      rank: 'Rang',
      country: 'Pays',
      index: 'Indice',
      category: 'Catégorie',
      trend: 'Évolution',
    },
    rows: [
      {
        pos: '01',
        country: 'Belgique',
        region: 'EUR',
        index: '0.86',
        cat: 1,
        trend: { dir: 'up', value: '+0.02' },
      },
      {
        pos: '02',
        country: 'France',
        region: 'EUR',
        index: '0.83',
        cat: 1,
        trend: { dir: 'flat', value: '0.00' },
      },
      {
        pos: '03',
        country: 'Portugal',
        region: 'EUR',
        index: '0.82',
        cat: 1,
        trend: { dir: 'up', value: '+0.03' },
      },
      {
        pos: '04',
        country: 'Espagne',
        region: 'EUR',
        index: '0.80',
        cat: 1,
        trend: { dir: 'down', value: '-0.01' },
      },
      {
        pos: '05',
        country: 'Botswana',
        region: 'AFR',
        index: '0.72',
        cat: 2,
        trend: { dir: 'up', value: '+0.02' },
      },
      {
        pos: '06',
        country: 'Sénégal',
        region: 'AFR',
        index: '0.71',
        cat: 2,
        trend: { dir: 'up', value: '+0.04' },
      },
      {
        pos: '07',
        country: 'Afrique du Sud',
        region: 'AFR',
        index: '0.70',
        cat: 2,
        trend: { dir: 'flat', value: '0.00' },
      },
      {
        pos: '08',
        country: 'Ghana',
        region: 'AFR',
        index: '0.68',
        cat: 2,
        trend: { dir: 'down', value: '-0.02' },
      },
      {
        pos: '09',
        country: 'Grèce',
        region: 'EUR',
        index: '0.66',
        cat: 2,
        trend: { dir: 'up', value: '+0.01' },
      },
      {
        pos: '10',
        country: 'Namibie',
        region: 'AFR',
        index: '0.63',
        cat: 3,
        trend: { dir: 'up', value: '+0.03' },
      },
      {
        pos: '11',
        country: 'Kenya',
        region: 'AFR',
        index: '0.58',
        cat: 3,
        trend: { dir: 'up', value: '+0.02' },
      },
      {
        pos: '12',
        country: 'Maroc',
        region: 'AFR',
        index: '0.52',
        cat: 3,
        trend: { dir: 'down', value: '-0.01' },
      },
      {
        pos: '13',
        country: 'Tunisie',
        region: 'AFR',
        index: '0.49',
        cat: 4,
        trend: { dir: 'down', value: '-0.05' },
      },
      {
        pos: '14',
        country: 'Mali',
        region: 'AFR',
        index: '0.34',
        cat: 5,
        trend: { dir: 'down', value: '-0.04' },
      },
    ],
  },
  profiles: {
    eyebrow: 'Fiches pays',
    title: 'Aperçu de trois profils',
    cta: 'Toutes les fiches pays',
    items: [
      {
        country: 'France',
        region: 'Europe · membre fondateur',
        score: '0.83',
        cat: 1,
        bars: [
          { label: 'Gouvernance numérique', value: 78, cat: 2 },
          { label: 'Participation citoyenne', value: 81, cat: 1 },
          { label: 'Lutte anti-corruption', value: 74, cat: 2 },
          { label: 'Transitions démocratiques', value: 88, cat: 1 },
        ],
      },
      {
        country: 'Sénégal',
        region: 'Afrique · bureau de Dakar',
        score: '0.71',
        cat: 2,
        bars: [
          { label: 'Gouvernance numérique', value: 62, cat: 3 },
          { label: 'Participation citoyenne', value: 76, cat: 2 },
          { label: 'Lutte anti-corruption', value: 64, cat: 3 },
          { label: 'Transitions démocratiques', value: 79, cat: 2 },
        ],
      },
      {
        country: 'Tunisie',
        region: 'Afrique · point de vigilance',
        score: '0.49',
        cat: 4,
        bars: [
          { label: 'Gouvernance numérique', value: 51, cat: 3 },
          { label: 'Participation citoyenne', value: 46, cat: 4 },
          { label: 'Lutte anti-corruption', value: 42, cat: 4 },
          { label: 'Transitions démocratiques', value: 55, cat: 3 },
        ],
      },
    ],
  },
  dimensions: {
    eyebrow: "Composition de l'indice",
    title: 'Cinq sous-dimensions, alignées sur nos axes',
    lead: "L'indice composite agrège cinq sous-dimensions pondérées de façon égale. Les valeurs ci-dessous sont des moyennes du panel couvert. Données d'illustration.",
    meanLabel: 'moyenne',
    items: [
      {
        ix: 'D1',
        title: 'Gouvernance numérique',
        mean: '0.67',
        cat: 2,
        body: "Liberté d'accès, modération des plateformes, protection des données.",
      },
      {
        ix: 'D2',
        title: 'Participation citoyenne',
        mean: '0.71',
        cat: 2,
        body: 'Dispositifs locaux, société civile, droit de manifester.',
      },
      {
        ix: 'D3',
        title: 'Lutte anti-corruption',
        mean: '0.59',
        cat: 3,
        body: 'Transparence budgétaire, indépendance des contrôles, redevabilité.',
      },
      {
        ix: 'D4',
        title: 'Transitions démocratiques',
        mean: '0.64',
        cat: 3,
        body: 'Intégrité des scrutins, alternance, état de droit.',
      },
      {
        ix: 'D5',
        title: 'Crises globales',
        mean: '0.55',
        cat: 3,
        body: 'Résilience démocratique face aux chocs climatiques, sanitaires, sécuritaires.',
      },
    ],
  },
  methodology: {
    eyebrow: 'Transparence',
    title: "Comment l'indice est construit",
    steps: [
      {
        title: 'Collecte des sources',
        body: "Réunion d'indicateurs publics issus d'institutions et d'instituts de recherche, retenus uniquement sous licence ouverte et réutilisable.",
      },
      {
        title: 'Normalisation',
        body: 'Chaque indicateur est ramené à une échelle commune de 0 à 1, avec traitement explicite des valeurs manquantes et des ruptures de série.',
      },
      {
        title: 'Agrégation par sous-dimension',
        body: 'Les indicateurs sont regroupés en cinq sous-dimensions, puis combinés en un indice composite par pondération égale (choix documenté et discutable).',
      },
      {
        title: 'Revue scientifique',
        body: 'Un comité scientifique indépendant relit la méthode, signale les biais et valide chaque édition avant publication.',
      },
      {
        title: 'Publication ouverte',
        body: 'Données, codebook et code de calcul sont publiés ensemble, pour que chacun puisse reproduire, contester et améliorer le résultat.',
      },
    ],
    cta: 'Lire la méthodologie complète',
    guaranteesTitle: 'Garanties de méthode',
    guarantees: [
      {
        strong: 'Méta-agrégation',
        rest: ', pas de mesure de terrain propre : nous combinons des sources existantes plutôt que de produire un jugement isolé.',
      },
      {
        strong: 'Sources sous licence ouverte',
        rest: ' uniquement, traçables et citées une par une dans le codebook.',
      },
      {
        strong: 'Pondérations explicites',
        rest: ' et tests de sensibilité publiés à côté du résultat principal.',
      },
      {
        strong: 'Comité scientifique indépendant',
        rest: ' du secrétariat, chargé de la revue critique.',
      },
      {
        strong: 'Versionnage',
        rest: ' de chaque édition : les anciennes valeurs restent accessibles et comparables.',
      },
    ],
    license: 'Licence des données · CC-BY 4.0 · citation requise',
  },
  datasets: {
    eyebrow: 'Jeux de données',
    title: 'Télécharger et citer',
    lead: "Chaque jeu est versionné, accompagné de son codebook et d'un identifiant DOI citable. Données d'illustration.",
    headers: {
      dataset: 'Jeu de données',
      formats: 'Formats',
      doi: 'DOI',
      codebook: 'Codebook',
      action: 'Action',
    },
    codebookLabel: 'Codebook',
    downloadLabel: 'Télécharger',
    rows: [
      {
        name: 'Indice composite, édition 2026',
        sub: 'Scores pays et sous-dimensions, panel complet',
        formats: ['CSV', 'XLSX', 'JSON'],
        doi: '10.59000/dt.bar.2026',
      },
      {
        name: 'Séries longues 2015 à 2026',
        sub: 'Évolution annuelle par pays et par sous-dimension',
        formats: ['CSV', 'JSON'],
        doi: '10.59000/dt.bar.series',
      },
      {
        name: 'Sources et pondérations',
        sub: 'Liste des indicateurs sources, poids et licences',
        formats: ['CSV', 'XLSX'],
        doi: '10.59000/dt.bar.sources',
      },
      {
        name: 'Géométries de la carte',
        sub: 'Tracés simplifiés des pays, pour réutilisation',
        formats: ['JSON'],
        doi: '10.59000/dt.bar.geo',
      },
    ],
  },
  contrib: {
    title: 'Vous êtes un think tank membre ? Enrichissez les données pays.',
    body: 'Les éditions du Baromètre se construisent avec le réseau. Proposez des indicateurs, corrigez une valeur, documentez un contexte national : chaque contribution est revue, créditée et versionnée.',
    ctaPrimary: 'Contribuer aux données',
    ctaSecondary: 'Voir le protocole',
  },
};

const en: BarometerContent = {
  hero: {
    crumbHome: 'Home',
    eyebrow: 'Open data',
    title: 'The Democracy Barometer',
    lead: 'A composite Africa-Europe index, built by meta-aggregating open-licence sources. Published methodology, citable open-access datasets, overseen by an independent scientific committee.',
    ctaMethod: 'Methodology note',
    ctaData: 'Download the data',
    disclaimer:
      'Illustration data. The scores and rankings shown here are fictional and only serve to demonstrate the mock-up.',
  },
  kpis: [
    { value: '42', label: 'countries covered (illustration)' },
    { value: '5', label: 'aggregated sub-dimensions' },
    { value: 'CC-BY', label: 'open-data licence' },
  ],
  map: {
    title: 'The index, country by country',
    lead: 'Each territory carries its composite score. Read with care: this is an aggregation, not a verdict.',
    chips: ['All', 'Africa', 'Europe'],
    note: 'Illustrative view',
    tilesLabel: 'Scores by country (illustration)',
    interactiveHint: 'Hover or tap a country to see its index.',
    indexLabel: 'Composite index',
    categoryLabel: 'Category',
  },
  legendLabel: 'Freedom index',
  legend: [
    { label: 'Free', range: '0.80 and above' },
    { label: 'Mostly free', range: '0.65 to 0.79' },
    { label: 'Partly free', range: '0.50 to 0.64' },
    { label: 'Barely free', range: '0.35 to 0.49' },
    { label: 'Not free', range: 'below 0.35' },
  ],
  ranking: {
    eyebrow: '2026 edition · illustration',
    title: 'Composite index ranking',
    cta: 'See the full dataset',
    caption:
      'Illustration data. Change shown relative to the previous edition.',
    headers: {
      rank: 'Rank',
      country: 'Country',
      index: 'Index',
      category: 'Category',
      trend: 'Change',
    },
    rows: [
      {
        pos: '01',
        country: 'Belgium',
        region: 'EUR',
        index: '0.86',
        cat: 1,
        trend: { dir: 'up', value: '+0.02' },
      },
      {
        pos: '02',
        country: 'France',
        region: 'EUR',
        index: '0.83',
        cat: 1,
        trend: { dir: 'flat', value: '0.00' },
      },
      {
        pos: '03',
        country: 'Portugal',
        region: 'EUR',
        index: '0.82',
        cat: 1,
        trend: { dir: 'up', value: '+0.03' },
      },
      {
        pos: '04',
        country: 'Spain',
        region: 'EUR',
        index: '0.80',
        cat: 1,
        trend: { dir: 'down', value: '-0.01' },
      },
      {
        pos: '05',
        country: 'Botswana',
        region: 'AFR',
        index: '0.72',
        cat: 2,
        trend: { dir: 'up', value: '+0.02' },
      },
      {
        pos: '06',
        country: 'Senegal',
        region: 'AFR',
        index: '0.71',
        cat: 2,
        trend: { dir: 'up', value: '+0.04' },
      },
      {
        pos: '07',
        country: 'South Africa',
        region: 'AFR',
        index: '0.70',
        cat: 2,
        trend: { dir: 'flat', value: '0.00' },
      },
      {
        pos: '08',
        country: 'Ghana',
        region: 'AFR',
        index: '0.68',
        cat: 2,
        trend: { dir: 'down', value: '-0.02' },
      },
      {
        pos: '09',
        country: 'Greece',
        region: 'EUR',
        index: '0.66',
        cat: 2,
        trend: { dir: 'up', value: '+0.01' },
      },
      {
        pos: '10',
        country: 'Namibia',
        region: 'AFR',
        index: '0.63',
        cat: 3,
        trend: { dir: 'up', value: '+0.03' },
      },
      {
        pos: '11',
        country: 'Kenya',
        region: 'AFR',
        index: '0.58',
        cat: 3,
        trend: { dir: 'up', value: '+0.02' },
      },
      {
        pos: '12',
        country: 'Morocco',
        region: 'AFR',
        index: '0.52',
        cat: 3,
        trend: { dir: 'down', value: '-0.01' },
      },
      {
        pos: '13',
        country: 'Tunisia',
        region: 'AFR',
        index: '0.49',
        cat: 4,
        trend: { dir: 'down', value: '-0.05' },
      },
      {
        pos: '14',
        country: 'Mali',
        region: 'AFR',
        index: '0.34',
        cat: 5,
        trend: { dir: 'down', value: '-0.04' },
      },
    ],
  },
  profiles: {
    eyebrow: 'Country profiles',
    title: 'A look at three profiles',
    cta: 'All country profiles',
    items: [
      {
        country: 'France',
        region: 'Europe · founding member',
        score: '0.83',
        cat: 1,
        bars: [
          { label: 'Digital governance', value: 78, cat: 2 },
          { label: 'Citizen participation', value: 81, cat: 1 },
          { label: 'Anti-corruption', value: 74, cat: 2 },
          { label: 'Democratic transitions', value: 88, cat: 1 },
        ],
      },
      {
        country: 'Senegal',
        region: 'Africa · Dakar office',
        score: '0.71',
        cat: 2,
        bars: [
          { label: 'Digital governance', value: 62, cat: 3 },
          { label: 'Citizen participation', value: 76, cat: 2 },
          { label: 'Anti-corruption', value: 64, cat: 3 },
          { label: 'Democratic transitions', value: 79, cat: 2 },
        ],
      },
      {
        country: 'Tunisia',
        region: 'Africa · watch point',
        score: '0.49',
        cat: 4,
        bars: [
          { label: 'Digital governance', value: 51, cat: 3 },
          { label: 'Citizen participation', value: 46, cat: 4 },
          { label: 'Anti-corruption', value: 42, cat: 4 },
          { label: 'Democratic transitions', value: 55, cat: 3 },
        ],
      },
    ],
  },
  dimensions: {
    eyebrow: 'Index composition',
    title: 'Five sub-dimensions, aligned with our pillars',
    lead: 'The composite index aggregates five equally weighted sub-dimensions. The values below are averages across the covered panel. Illustration data.',
    meanLabel: 'average',
    items: [
      {
        ix: 'D1',
        title: 'Digital governance',
        mean: '0.67',
        cat: 2,
        body: 'Access freedom, platform moderation, data protection.',
      },
      {
        ix: 'D2',
        title: 'Citizen participation',
        mean: '0.71',
        cat: 2,
        body: 'Local mechanisms, civil society, right to protest.',
      },
      {
        ix: 'D3',
        title: 'Anti-corruption',
        mean: '0.59',
        cat: 3,
        body: 'Budget transparency, independent oversight, accountability.',
      },
      {
        ix: 'D4',
        title: 'Democratic transitions',
        mean: '0.64',
        cat: 3,
        body: 'Electoral integrity, peaceful turnover, rule of law.',
      },
      {
        ix: 'D5',
        title: 'Global crises',
        mean: '0.55',
        cat: 3,
        body: 'Democratic resilience in the face of climate, health and security shocks.',
      },
    ],
  },
  methodology: {
    eyebrow: 'Transparency',
    title: 'How the index is built',
    steps: [
      {
        title: 'Source collection',
        body: 'Gathering public indicators from institutions and research institutes, kept only under open, reusable licences.',
      },
      {
        title: 'Normalisation',
        body: 'Each indicator is rescaled to a common 0–1 scale, with explicit handling of missing values and series breaks.',
      },
      {
        title: 'Aggregation by sub-dimension',
        body: 'Indicators are grouped into five sub-dimensions, then combined into a composite index by equal weighting (a documented and debatable choice).',
      },
      {
        title: 'Scientific review',
        body: 'An independent scientific committee reviews the method, flags biases and validates each edition before publication.',
      },
      {
        title: 'Open publication',
        body: 'Data, codebook and computation code are published together, so anyone can reproduce, challenge and improve the result.',
      },
    ],
    cta: 'Read the full methodology',
    guaranteesTitle: 'Method guarantees',
    guarantees: [
      {
        strong: 'Meta-aggregation',
        rest: ', no field measurement of our own: we combine existing sources rather than producing an isolated verdict.',
      },
      {
        strong: 'Open-licence sources',
        rest: ' only, traceable and cited one by one in the codebook.',
      },
      {
        strong: 'Explicit weightings',
        rest: ' and sensitivity tests published alongside the main result.',
      },
      {
        strong: 'Independent scientific committee',
        rest: ', separate from the secretariat, in charge of critical review.',
      },
      {
        strong: 'Versioning',
        rest: ' of every edition: previous values stay accessible and comparable.',
      },
    ],
    license: 'Data licence · CC-BY 4.0 · citation required',
  },
  datasets: {
    eyebrow: 'Datasets',
    title: 'Download and cite',
    lead: 'Each dataset is versioned, comes with its codebook and a citable DOI. Illustration data.',
    headers: {
      dataset: 'Dataset',
      formats: 'Formats',
      doi: 'DOI',
      codebook: 'Codebook',
      action: 'Action',
    },
    codebookLabel: 'Codebook',
    downloadLabel: 'Download',
    rows: [
      {
        name: 'Composite index, 2026 edition',
        sub: 'Country and sub-dimension scores, full panel',
        formats: ['CSV', 'XLSX', 'JSON'],
        doi: '10.59000/dt.bar.2026',
      },
      {
        name: 'Long series 2015 to 2026',
        sub: 'Annual change by country and sub-dimension',
        formats: ['CSV', 'JSON'],
        doi: '10.59000/dt.bar.series',
      },
      {
        name: 'Sources and weightings',
        sub: 'List of source indicators, weights and licences',
        formats: ['CSV', 'XLSX'],
        doi: '10.59000/dt.bar.sources',
      },
      {
        name: 'Map geometries',
        sub: 'Simplified country outlines, for reuse',
        formats: ['JSON'],
        doi: '10.59000/dt.bar.geo',
      },
    ],
  },
  contrib: {
    title: 'Are you a member think tank? Enrich the country data.',
    body: 'Barometer editions are built with the network. Suggest indicators, correct a value, document a national context: every contribution is reviewed, credited and versioned.',
    ctaPrimary: 'Contribute data',
    ctaSecondary: 'See the protocol',
  },
};

const es: BarometerContent = {
  hero: {
    crumbHome: 'Inicio',
    eyebrow: 'Datos abiertos',
    title: 'El Barómetro de la democracia',
    lead: 'Un índice compuesto África-Europa, construido por metaagregación de fuentes con licencia abierta. Metodología publicada, conjuntos de datos citables en acceso abierto, supervisión de un comité científico independiente.',
    ctaMethod: 'Nota metodológica',
    ctaData: 'Descargar los datos',
    disclaimer:
      'Datos de ilustración. Las puntuaciones y clasificaciones aquí presentadas son ficticias y solo sirven para mostrar la maqueta.',
  },
  kpis: [
    { value: '42', label: 'países cubiertos (ilustración)' },
    { value: '5', label: 'subdimensiones agregadas' },
    { value: 'CC-BY', label: 'licencia de los datos abiertos' },
  ],
  map: {
    title: 'El índice, país por país',
    lead: 'Cada territorio lleva su puntuación compuesta. Lectura prudente: se trata de una agregación, no de un juicio.',
    chips: ['Todo', 'África', 'Europa'],
    note: 'Vista ilustrativa',
    tilesLabel: 'Puntuaciones por país (ilustración)',
    interactiveHint: 'Pase el cursor o toque un país para ver su índice.',
    indexLabel: 'Índice compuesto',
    categoryLabel: 'Categoría',
  },
  legendLabel: 'Índice de libertad',
  legend: [
    { label: 'Libre', range: '0.80 y más' },
    { label: 'Bastante libre', range: '0.65 a 0.79' },
    { label: 'Parcialmente libre', range: '0.50 a 0.64' },
    { label: 'Poco libre', range: '0.35 a 0.49' },
    { label: 'No libre', range: 'menos de 0.35' },
  ],
  ranking: {
    eyebrow: 'Edición 2026 · ilustración',
    title: 'Clasificación del índice compuesto',
    cta: 'Ver el conjunto de datos completo',
    caption:
      'Datos de ilustración. Evolución indicada respecto de la edición anterior.',
    headers: {
      rank: 'Puesto',
      country: 'País',
      index: 'Índice',
      category: 'Categoría',
      trend: 'Evolución',
    },
    rows: [
      {
        pos: '01',
        country: 'Bélgica',
        region: 'EUR',
        index: '0.86',
        cat: 1,
        trend: { dir: 'up', value: '+0.02' },
      },
      {
        pos: '02',
        country: 'Francia',
        region: 'EUR',
        index: '0.83',
        cat: 1,
        trend: { dir: 'flat', value: '0.00' },
      },
      {
        pos: '03',
        country: 'Portugal',
        region: 'EUR',
        index: '0.82',
        cat: 1,
        trend: { dir: 'up', value: '+0.03' },
      },
      {
        pos: '04',
        country: 'España',
        region: 'EUR',
        index: '0.80',
        cat: 1,
        trend: { dir: 'down', value: '-0.01' },
      },
      {
        pos: '05',
        country: 'Botsuana',
        region: 'AFR',
        index: '0.72',
        cat: 2,
        trend: { dir: 'up', value: '+0.02' },
      },
      {
        pos: '06',
        country: 'Senegal',
        region: 'AFR',
        index: '0.71',
        cat: 2,
        trend: { dir: 'up', value: '+0.04' },
      },
      {
        pos: '07',
        country: 'Sudáfrica',
        region: 'AFR',
        index: '0.70',
        cat: 2,
        trend: { dir: 'flat', value: '0.00' },
      },
      {
        pos: '08',
        country: 'Ghana',
        region: 'AFR',
        index: '0.68',
        cat: 2,
        trend: { dir: 'down', value: '-0.02' },
      },
      {
        pos: '09',
        country: 'Grecia',
        region: 'EUR',
        index: '0.66',
        cat: 2,
        trend: { dir: 'up', value: '+0.01' },
      },
      {
        pos: '10',
        country: 'Namibia',
        region: 'AFR',
        index: '0.63',
        cat: 3,
        trend: { dir: 'up', value: '+0.03' },
      },
      {
        pos: '11',
        country: 'Kenia',
        region: 'AFR',
        index: '0.58',
        cat: 3,
        trend: { dir: 'up', value: '+0.02' },
      },
      {
        pos: '12',
        country: 'Marruecos',
        region: 'AFR',
        index: '0.52',
        cat: 3,
        trend: { dir: 'down', value: '-0.01' },
      },
      {
        pos: '13',
        country: 'Túnez',
        region: 'AFR',
        index: '0.49',
        cat: 4,
        trend: { dir: 'down', value: '-0.05' },
      },
      {
        pos: '14',
        country: 'Malí',
        region: 'AFR',
        index: '0.34',
        cat: 5,
        trend: { dir: 'down', value: '-0.04' },
      },
    ],
  },
  profiles: {
    eyebrow: 'Fichas por país',
    title: 'Vistazo a tres perfiles',
    cta: 'Todas las fichas por país',
    items: [
      {
        country: 'Francia',
        region: 'Europa · miembro fundador',
        score: '0.83',
        cat: 1,
        bars: [
          { label: 'Gobernanza digital', value: 78, cat: 2 },
          { label: 'Participación ciudadana', value: 81, cat: 1 },
          { label: 'Lucha contra la corrupción', value: 74, cat: 2 },
          { label: 'Transiciones democráticas', value: 88, cat: 1 },
        ],
      },
      {
        country: 'Senegal',
        region: 'África · oficina de Dakar',
        score: '0.71',
        cat: 2,
        bars: [
          { label: 'Gobernanza digital', value: 62, cat: 3 },
          { label: 'Participación ciudadana', value: 76, cat: 2 },
          { label: 'Lucha contra la corrupción', value: 64, cat: 3 },
          { label: 'Transiciones democráticas', value: 79, cat: 2 },
        ],
      },
      {
        country: 'Túnez',
        region: 'África · punto de vigilancia',
        score: '0.49',
        cat: 4,
        bars: [
          { label: 'Gobernanza digital', value: 51, cat: 3 },
          { label: 'Participación ciudadana', value: 46, cat: 4 },
          { label: 'Lucha contra la corrupción', value: 42, cat: 4 },
          { label: 'Transiciones democráticas', value: 55, cat: 3 },
        ],
      },
    ],
  },
  dimensions: {
    eyebrow: 'Composición del índice',
    title: 'Cinco subdimensiones, alineadas con nuestros ejes',
    lead: 'El índice compuesto agrega cinco subdimensiones ponderadas por igual. Los valores siguientes son medias del panel cubierto. Datos de ilustración.',
    meanLabel: 'media',
    items: [
      {
        ix: 'D1',
        title: 'Gobernanza digital',
        mean: '0.67',
        cat: 2,
        body: 'Libertad de acceso, moderación de las plataformas, protección de los datos.',
      },
      {
        ix: 'D2',
        title: 'Participación ciudadana',
        mean: '0.71',
        cat: 2,
        body: 'Dispositivos locales, sociedad civil, derecho de manifestación.',
      },
      {
        ix: 'D3',
        title: 'Lucha contra la corrupción',
        mean: '0.59',
        cat: 3,
        body: 'Transparencia presupuestaria, independencia de los controles, rendición de cuentas.',
      },
      {
        ix: 'D4',
        title: 'Transiciones democráticas',
        mean: '0.64',
        cat: 3,
        body: 'Integridad de los comicios, alternancia, Estado de derecho.',
      },
      {
        ix: 'D5',
        title: 'Crisis globales',
        mean: '0.55',
        cat: 3,
        body: 'Resiliencia democrática frente a las conmociones climáticas, sanitarias y de seguridad.',
      },
    ],
  },
  methodology: {
    eyebrow: 'Transparencia',
    title: 'Cómo se construye el índice',
    steps: [
      {
        title: 'Recogida de las fuentes',
        body: 'Reunión de indicadores públicos procedentes de instituciones e institutos de investigación, seleccionados únicamente con licencia abierta y reutilizable.',
      },
      {
        title: 'Normalización',
        body: 'Cada indicador se lleva a una escala común de 0 a 1, con tratamiento explícito de los valores ausentes y de las rupturas de serie.',
      },
      {
        title: 'Agregación por subdimensión',
        body: 'Los indicadores se agrupan en cinco subdimensiones y luego se combinan en un índice compuesto mediante ponderación igual (una elección documentada y discutible).',
      },
      {
        title: 'Revisión científica',
        body: 'Un comité científico independiente revisa el método, señala los sesgos y valida cada edición antes de su publicación.',
      },
      {
        title: 'Publicación abierta',
        body: 'Los datos, el libro de códigos y el código de cálculo se publican conjuntamente, para que cualquiera pueda reproducir, refutar y mejorar el resultado.',
      },
    ],
    cta: 'Leer la metodología completa',
    guaranteesTitle: 'Garantías de método',
    guarantees: [
      {
        strong: 'Metaagregación',
        rest: ', sin medición de campo propia: combinamos fuentes existentes en lugar de producir un juicio aislado.',
      },
      {
        strong: 'Fuentes con licencia abierta',
        rest: ' únicamente, trazables y citadas una a una en el libro de códigos.',
      },
      {
        strong: 'Ponderaciones explícitas',
        rest: ' y pruebas de sensibilidad publicadas junto al resultado principal.',
      },
      {
        strong: 'Comité científico independiente',
        rest: ' de la secretaría, encargado de la revisión crítica.',
      },
      {
        strong: 'Versionado',
        rest: ' de cada edición: los valores antiguos siguen siendo accesibles y comparables.',
      },
    ],
    license: 'Licencia de los datos · CC-BY 4.0 · cita obligatoria',
  },
  datasets: {
    eyebrow: 'Conjuntos de datos',
    title: 'Descargar y citar',
    lead: 'Cada conjunto está versionado y va acompañado de su libro de códigos y de un identificador DOI citable. Datos de ilustración.',
    headers: {
      dataset: 'Conjunto de datos',
      formats: 'Formatos',
      doi: 'DOI',
      codebook: 'Libro de códigos',
      action: 'Acción',
    },
    codebookLabel: 'Libro de códigos',
    downloadLabel: 'Descargar',
    rows: [
      {
        name: 'Índice compuesto, edición 2026',
        sub: 'Puntuaciones por país y subdimensiones, panel completo',
        formats: ['CSV', 'XLSX', 'JSON'],
        doi: '10.59000/dt.bar.2026',
      },
      {
        name: 'Series largas 2015 a 2026',
        sub: 'Evolución anual por país y por subdimensión',
        formats: ['CSV', 'JSON'],
        doi: '10.59000/dt.bar.series',
      },
      {
        name: 'Fuentes y ponderaciones',
        sub: 'Lista de indicadores fuente, pesos y licencias',
        formats: ['CSV', 'XLSX'],
        doi: '10.59000/dt.bar.sources',
      },
      {
        name: 'Geometrías del mapa',
        sub: 'Trazados simplificados de los países, para su reutilización',
        formats: ['JSON'],
        doi: '10.59000/dt.bar.geo',
      },
    ],
  },
  contrib: {
    title: '¿Es un centro de estudios miembro? Enriquezca los datos por país.',
    body: 'Las ediciones del Barómetro se construyen con la red. Proponga indicadores, corrija un valor, documente un contexto nacional: cada aportación se revisa, se acredita y se versiona.',
    ctaPrimary: 'Contribuir a los datos',
    ctaSecondary: 'Ver el protocolo',
  },
};
const pt: BarometerContent = {
  hero: {
    crumbHome: 'Início',
    eyebrow: 'Dados abertos',
    title: 'O Barómetro da democracia',
    lead: 'Um índice compósito África-Europa, construído por metaagregação de fontes com licença aberta. Metodologia publicada, conjuntos de dados citáveis em acesso aberto, supervisão de um comité científico independente.',
    ctaMethod: 'Nota metodológica',
    ctaData: 'Descarregar os dados',
    disclaimer:
      'Dados de ilustração. As pontuações e classificações aqui apresentadas são fictícias e servem apenas para mostrar a maqueta.',
  },
  kpis: [
    { value: '42', label: 'países abrangidos (ilustração)' },
    { value: '5', label: 'subdimensões agregadas' },
    { value: 'CC-BY', label: 'licença dos dados abertos' },
  ],
  map: {
    title: 'O índice, país a país',
    lead: 'Cada território tem a sua pontuação compósita. Leitura prudente: trata-se de uma agregação, não de um julgamento.',
    chips: ['Tudo', 'África', 'Europa'],
    note: 'Vista ilustrativa',
    tilesLabel: 'Pontuações por país (ilustração)',
    interactiveHint: 'Passe o cursor ou toque num país para ver o seu índice.',
    indexLabel: 'Índice compósito',
    categoryLabel: 'Categoria',
  },
  legendLabel: 'Índice de liberdade',
  legend: [
    { label: 'Livre', range: '0.80 e mais' },
    { label: 'Bastante livre', range: '0.65 a 0.79' },
    { label: 'Parcialmente livre', range: '0.50 a 0.64' },
    { label: 'Pouco livre', range: '0.35 a 0.49' },
    { label: 'Não livre', range: 'menos de 0.35' },
  ],
  ranking: {
    eyebrow: 'Edição 2026 · ilustração',
    title: 'Classificação do índice compósito',
    cta: 'Ver o conjunto de dados completo',
    caption: 'Dados de ilustração. Evolução indicada face à edição anterior.',
    headers: {
      rank: 'Posição',
      country: 'País',
      index: 'Índice',
      category: 'Categoria',
      trend: 'Evolução',
    },
    rows: [
      {
        pos: '01',
        country: 'Bélgica',
        region: 'EUR',
        index: '0.86',
        cat: 1,
        trend: { dir: 'up', value: '+0.02' },
      },
      {
        pos: '02',
        country: 'França',
        region: 'EUR',
        index: '0.83',
        cat: 1,
        trend: { dir: 'flat', value: '0.00' },
      },
      {
        pos: '03',
        country: 'Portugal',
        region: 'EUR',
        index: '0.82',
        cat: 1,
        trend: { dir: 'up', value: '+0.03' },
      },
      {
        pos: '04',
        country: 'Espanha',
        region: 'EUR',
        index: '0.80',
        cat: 1,
        trend: { dir: 'down', value: '-0.01' },
      },
      {
        pos: '05',
        country: 'Botsuana',
        region: 'AFR',
        index: '0.72',
        cat: 2,
        trend: { dir: 'up', value: '+0.02' },
      },
      {
        pos: '06',
        country: 'Senegal',
        region: 'AFR',
        index: '0.71',
        cat: 2,
        trend: { dir: 'up', value: '+0.04' },
      },
      {
        pos: '07',
        country: 'África do Sul',
        region: 'AFR',
        index: '0.70',
        cat: 2,
        trend: { dir: 'flat', value: '0.00' },
      },
      {
        pos: '08',
        country: 'Gana',
        region: 'AFR',
        index: '0.68',
        cat: 2,
        trend: { dir: 'down', value: '-0.02' },
      },
      {
        pos: '09',
        country: 'Grécia',
        region: 'EUR',
        index: '0.66',
        cat: 2,
        trend: { dir: 'up', value: '+0.01' },
      },
      {
        pos: '10',
        country: 'Namíbia',
        region: 'AFR',
        index: '0.63',
        cat: 3,
        trend: { dir: 'up', value: '+0.03' },
      },
      {
        pos: '11',
        country: 'Quénia',
        region: 'AFR',
        index: '0.58',
        cat: 3,
        trend: { dir: 'up', value: '+0.02' },
      },
      {
        pos: '12',
        country: 'Marrocos',
        region: 'AFR',
        index: '0.52',
        cat: 3,
        trend: { dir: 'down', value: '-0.01' },
      },
      {
        pos: '13',
        country: 'Tunísia',
        region: 'AFR',
        index: '0.49',
        cat: 4,
        trend: { dir: 'down', value: '-0.05' },
      },
      {
        pos: '14',
        country: 'Mali',
        region: 'AFR',
        index: '0.34',
        cat: 5,
        trend: { dir: 'down', value: '-0.04' },
      },
    ],
  },
  profiles: {
    eyebrow: 'Fichas por país',
    title: 'Vista de três perfis',
    cta: 'Todas as fichas por país',
    items: [
      {
        country: 'França',
        region: 'Europa · membro fundador',
        score: '0.83',
        cat: 1,
        bars: [
          { label: 'Governação digital', value: 78, cat: 2 },
          { label: 'Participação cidadã', value: 81, cat: 1 },
          { label: 'Combate à corrupção', value: 74, cat: 2 },
          { label: 'Transições democráticas', value: 88, cat: 1 },
        ],
      },
      {
        country: 'Senegal',
        region: 'África · escritório de Dakar',
        score: '0.71',
        cat: 2,
        bars: [
          { label: 'Governação digital', value: 62, cat: 3 },
          { label: 'Participação cidadã', value: 76, cat: 2 },
          { label: 'Combate à corrupção', value: 64, cat: 3 },
          { label: 'Transições democráticas', value: 79, cat: 2 },
        ],
      },
      {
        country: 'Tunísia',
        region: 'África · ponto de vigilância',
        score: '0.49',
        cat: 4,
        bars: [
          { label: 'Governação digital', value: 51, cat: 3 },
          { label: 'Participação cidadã', value: 46, cat: 4 },
          { label: 'Combate à corrupção', value: 42, cat: 4 },
          { label: 'Transições democráticas', value: 55, cat: 3 },
        ],
      },
    ],
  },
  dimensions: {
    eyebrow: 'Composição do índice',
    title: 'Cinco subdimensões, alinhadas com os nossos eixos',
    lead: 'O índice compósito agrega cinco subdimensões ponderadas de forma igual. Os valores seguintes são médias do painel abrangido. Dados de ilustração.',
    meanLabel: 'média',
    items: [
      {
        ix: 'D1',
        title: 'Governação digital',
        mean: '0.67',
        cat: 2,
        body: 'Liberdade de acesso, moderação das plataformas, proteção dos dados.',
      },
      {
        ix: 'D2',
        title: 'Participação cidadã',
        mean: '0.71',
        cat: 2,
        body: 'Dispositivos locais, sociedade civil, direito de manifestação.',
      },
      {
        ix: 'D3',
        title: 'Combate à corrupção',
        mean: '0.59',
        cat: 3,
        body: 'Transparência orçamental, independência dos controlos, prestação de contas.',
      },
      {
        ix: 'D4',
        title: 'Transições democráticas',
        mean: '0.64',
        cat: 3,
        body: 'Integridade dos atos eleitorais, alternância, Estado de direito.',
      },
      {
        ix: 'D5',
        title: 'Crises globais',
        mean: '0.55',
        cat: 3,
        body: 'Resiliência democrática face aos choques climáticos, sanitários e de segurança.',
      },
    ],
  },
  methodology: {
    eyebrow: 'Transparência',
    title: 'Como é construído o índice',
    steps: [
      {
        title: 'Recolha das fontes',
        body: 'Reunião de indicadores públicos provenientes de instituições e institutos de investigação, retidos unicamente sob licença aberta e reutilizável.',
      },
      {
        title: 'Normalização',
        body: 'Cada indicador é reduzido a uma escala comum de 0 a 1, com tratamento explícito dos valores em falta e das quebras de série.',
      },
      {
        title: 'Agregação por subdimensão',
        body: 'Os indicadores são agrupados em cinco subdimensões e depois combinados num índice compósito por ponderação igual (escolha documentada e discutível).',
      },
      {
        title: 'Revisão científica',
        body: 'Um comité científico independente revê o método, assinala os enviesamentos e valida cada edição antes da publicação.',
      },
      {
        title: 'Publicação aberta',
        body: 'Dados, livro de códigos e código de cálculo são publicados em conjunto, para que qualquer pessoa possa reproduzir, contestar e melhorar o resultado.',
      },
    ],
    cta: 'Ler a metodologia completa',
    guaranteesTitle: 'Garantias de método',
    guarantees: [
      {
        strong: 'Metaagregação',
        rest: ', sem medição de terreno própria: combinamos fontes existentes em vez de produzir um julgamento isolado.',
      },
      {
        strong: 'Fontes com licença aberta',
        rest: ' unicamente, rastreáveis e citadas uma a uma no livro de códigos.',
      },
      {
        strong: 'Ponderações explícitas',
        rest: ' e testes de sensibilidade publicados ao lado do resultado principal.',
      },
      {
        strong: 'Comité científico independente',
        rest: ' do secretariado, encarregado da revisão crítica.',
      },
      {
        strong: 'Versionamento',
        rest: ' de cada edição: os valores antigos continuam acessíveis e comparáveis.',
      },
    ],
    license: 'Licença dos dados · CC-BY 4.0 · citação obrigatória',
  },
  datasets: {
    eyebrow: 'Conjuntos de dados',
    title: 'Descarregar e citar',
    lead: 'Cada conjunto é versionado e acompanhado do seu livro de códigos e de um identificador DOI citável. Dados de ilustração.',
    headers: {
      dataset: 'Conjunto de dados',
      formats: 'Formatos',
      doi: 'DOI',
      codebook: 'Livro de códigos',
      action: 'Ação',
    },
    codebookLabel: 'Livro de códigos',
    downloadLabel: 'Descarregar',
    rows: [
      {
        name: 'Índice compósito, edição 2026',
        sub: 'Pontuações por país e subdimensões, painel completo',
        formats: ['CSV', 'XLSX', 'JSON'],
        doi: '10.59000/dt.bar.2026',
      },
      {
        name: 'Séries longas 2015 a 2026',
        sub: 'Evolução anual por país e por subdimensão',
        formats: ['CSV', 'JSON'],
        doi: '10.59000/dt.bar.series',
      },
      {
        name: 'Fontes e ponderações',
        sub: 'Lista de indicadores de origem, pesos e licenças',
        formats: ['CSV', 'XLSX'],
        doi: '10.59000/dt.bar.sources',
      },
      {
        name: 'Geometrias do mapa',
        sub: 'Traçados simplificados dos países, para reutilização',
        formats: ['JSON'],
        doi: '10.59000/dt.bar.geo',
      },
    ],
  },
  contrib: {
    title: 'É um centro de estudos membro? Enriqueça os dados por país.',
    body: 'As edições do Barómetro constroem-se com a rede. Proponha indicadores, corrija um valor, documente um contexto nacional: cada contributo é revisto, creditado e versionado.',
    ctaPrimary: 'Contribuir para os dados',
    ctaSecondary: 'Ver o protocolo',
  },
};
const ar: BarometerContent = {
  hero: {
    crumbHome: 'الرئيسية',
    eyebrow: 'بيانات مفتوحة',
    title: 'مؤشر الديمقراطية',
    lead: 'مؤشر مركّب لأفريقيا وأوروبا، مبني على التجميع الفوقي لمصادر ذات رخص مفتوحة. منهجية منشورة، ومجموعات بيانات قابلة للاستشهاد في وصول مفتوح، وإشراف لجنة علمية مستقلة.',
    ctaMethod: 'مذكرة منهجية',
    ctaData: 'تنزيل البيانات',
    disclaimer:
      'بيانات توضيحية. الدرجات والترتيب المعروضة هنا افتراضية ولا تخدم سوى عرض النموذج الأولي.',
  },
  kpis: [
    { value: '42', label: 'بلداً مشمولاً (توضيحي)' },
    { value: '5', label: 'أبعاد فرعية مجمَّعة' },
    { value: 'CC-BY', label: 'رخصة البيانات المفتوحة' },
  ],
  map: {
    title: 'المؤشر، بلداً بلداً',
    lead: 'يحمل كل إقليم درجته المركّبة. وتُقرأ بتحفّظ: الأمر يتعلق بتجميع، لا بحكم.',
    chips: ['الكل', 'أفريقيا', 'أوروبا'],
    note: 'عرض توضيحي',
    tilesLabel: 'الدرجات حسب البلد (توضيحي)',
    interactiveHint: 'مرّروا المؤشر فوق بلد أو المسوه لعرض درجته.',
    indexLabel: 'المؤشر المركّب',
    categoryLabel: 'الفئة',
  },
  legendLabel: 'مؤشر الحرية',
  legend: [
    { label: 'حرّ', range: '0.80 فما فوق' },
    { label: 'حرّ إلى حد كبير', range: 'من 0.65 إلى 0.79' },
    { label: 'حرّ جزئياً', range: 'من 0.50 إلى 0.64' },
    { label: 'قليل الحرية', range: 'من 0.35 إلى 0.49' },
    { label: 'غير حرّ', range: 'أقل من 0.35' },
  ],
  ranking: {
    eyebrow: 'إصدار 2026 · توضيحي',
    title: 'ترتيب المؤشر المركّب',
    cta: 'الاطلاع على مجموعة البيانات الكاملة',
    caption: 'بيانات توضيحية. التطور مبيَّن مقارنةً بالإصدار السابق.',
    headers: {
      rank: 'الرتبة',
      country: 'البلد',
      index: 'المؤشر',
      category: 'الفئة',
      trend: 'التطور',
    },
    rows: [
      {
        pos: '01',
        country: 'بلجيكا',
        region: 'EUR',
        index: '0.86',
        cat: 1,
        trend: { dir: 'up', value: '+0.02' },
      },
      {
        pos: '02',
        country: 'فرنسا',
        region: 'EUR',
        index: '0.83',
        cat: 1,
        trend: { dir: 'flat', value: '0.00' },
      },
      {
        pos: '03',
        country: 'البرتغال',
        region: 'EUR',
        index: '0.82',
        cat: 1,
        trend: { dir: 'up', value: '+0.03' },
      },
      {
        pos: '04',
        country: 'إسبانيا',
        region: 'EUR',
        index: '0.80',
        cat: 1,
        trend: { dir: 'down', value: '-0.01' },
      },
      {
        pos: '05',
        country: 'بوتسوانا',
        region: 'AFR',
        index: '0.72',
        cat: 2,
        trend: { dir: 'up', value: '+0.02' },
      },
      {
        pos: '06',
        country: 'السنغال',
        region: 'AFR',
        index: '0.71',
        cat: 2,
        trend: { dir: 'up', value: '+0.04' },
      },
      {
        pos: '07',
        country: 'جنوب أفريقيا',
        region: 'AFR',
        index: '0.70',
        cat: 2,
        trend: { dir: 'flat', value: '0.00' },
      },
      {
        pos: '08',
        country: 'غانا',
        region: 'AFR',
        index: '0.68',
        cat: 2,
        trend: { dir: 'down', value: '-0.02' },
      },
      {
        pos: '09',
        country: 'اليونان',
        region: 'EUR',
        index: '0.66',
        cat: 2,
        trend: { dir: 'up', value: '+0.01' },
      },
      {
        pos: '10',
        country: 'ناميبيا',
        region: 'AFR',
        index: '0.63',
        cat: 3,
        trend: { dir: 'up', value: '+0.03' },
      },
      {
        pos: '11',
        country: 'كينيا',
        region: 'AFR',
        index: '0.58',
        cat: 3,
        trend: { dir: 'up', value: '+0.02' },
      },
      {
        pos: '12',
        country: 'المغرب',
        region: 'AFR',
        index: '0.52',
        cat: 3,
        trend: { dir: 'down', value: '-0.01' },
      },
      {
        pos: '13',
        country: 'تونس',
        region: 'AFR',
        index: '0.49',
        cat: 4,
        trend: { dir: 'down', value: '-0.05' },
      },
      {
        pos: '14',
        country: 'مالي',
        region: 'AFR',
        index: '0.34',
        cat: 5,
        trend: { dir: 'down', value: '-0.04' },
      },
    ],
  },
  profiles: {
    eyebrow: 'بطاقات البلدان',
    title: 'لمحة عن ثلاثة ملفات',
    cta: 'كل بطاقات البلدان',
    items: [
      {
        country: 'فرنسا',
        region: 'أوروبا · عضو مؤسِّس',
        score: '0.83',
        cat: 1,
        bars: [
          { label: 'الحوكمة الرقمية', value: 78, cat: 2 },
          { label: 'المشاركة المواطنة', value: 81, cat: 1 },
          { label: 'مكافحة الفساد', value: 74, cat: 2 },
          { label: 'الانتقالات الديمقراطية', value: 88, cat: 1 },
        ],
      },
      {
        country: 'السنغال',
        region: 'أفريقيا · مكتب داكار',
        score: '0.71',
        cat: 2,
        bars: [
          { label: 'الحوكمة الرقمية', value: 62, cat: 3 },
          { label: 'المشاركة المواطنة', value: 76, cat: 2 },
          { label: 'مكافحة الفساد', value: 64, cat: 3 },
          { label: 'الانتقالات الديمقراطية', value: 79, cat: 2 },
        ],
      },
      {
        country: 'تونس',
        region: 'أفريقيا · نقطة يقظة',
        score: '0.49',
        cat: 4,
        bars: [
          { label: 'الحوكمة الرقمية', value: 51, cat: 3 },
          { label: 'المشاركة المواطنة', value: 46, cat: 4 },
          { label: 'مكافحة الفساد', value: 42, cat: 4 },
          { label: 'الانتقالات الديمقراطية', value: 55, cat: 3 },
        ],
      },
    ],
  },
  dimensions: {
    eyebrow: 'تركيب المؤشر',
    title: 'خمسة أبعاد فرعية، منسجمة مع محاورنا',
    lead: 'يجمع المؤشر المركّب خمسة أبعاد فرعية موزونة بالتساوي. والقيم أدناه متوسطات العيّنة المشمولة. بيانات توضيحية.',
    meanLabel: 'المتوسط',
    items: [
      {
        ix: 'D1',
        title: 'الحوكمة الرقمية',
        mean: '0.67',
        cat: 2,
        body: 'حرية النفاذ، ومراجعة محتوى المنصات، وحماية المعطيات.',
      },
      {
        ix: 'D2',
        title: 'المشاركة المواطنة',
        mean: '0.71',
        cat: 2,
        body: 'الآليات المحلية، والمجتمع المدني، والحق في التظاهر.',
      },
      {
        ix: 'D3',
        title: 'مكافحة الفساد',
        mean: '0.59',
        cat: 3,
        body: 'شفافية الميزانية، واستقلال أجهزة الرقابة، والمساءلة.',
      },
      {
        ix: 'D4',
        title: 'الانتقالات الديمقراطية',
        mean: '0.64',
        cat: 3,
        body: 'نزاهة الاقتراع، والتناوب، ودولة القانون.',
      },
      {
        ix: 'D5',
        title: 'الأزمات العالمية',
        mean: '0.55',
        cat: 3,
        body: 'صمود الديمقراطية أمام الصدمات المناخية والصحية والأمنية.',
      },
    ],
  },
  methodology: {
    eyebrow: 'الشفافية',
    title: 'كيف يُبنى المؤشر',
    steps: [
      {
        title: 'جمع المصادر',
        body: 'تجميع مؤشرات عمومية صادرة عن مؤسسات ومعاهد بحث، لا يُعتمد منها إلا ما كان تحت رخصة مفتوحة قابلة لإعادة الاستخدام.',
      },
      {
        title: 'التوحيد المعياري',
        body: 'يُردّ كل مؤشر إلى سلّم مشترك من 0 إلى 1، مع معالجة صريحة للقيم الناقصة ولانقطاعات السلاسل.',
      },
      {
        title: 'التجميع حسب البعد الفرعي',
        body: 'تُجمَّع المؤشرات في خمسة أبعاد فرعية، ثم تُدمج في مؤشر مركّب بترجيح متساوٍ (خيار موثَّق وقابل للنقاش).',
      },
      {
        title: 'المراجعة العلمية',
        body: 'تراجع لجنة علمية مستقلة المنهجية، وتنبّه إلى التحيزات، وتصادق على كل إصدار قبل نشره.',
      },
      {
        title: 'النشر المفتوح',
        body: 'تُنشر البيانات ودليل الترميز وشيفرة الحساب معاً، حتى يتمكن الجميع من إعادة إنتاج النتيجة والاعتراض عليها وتحسينها.',
      },
    ],
    cta: 'قراءة المنهجية كاملة',
    guaranteesTitle: 'ضمانات المنهجية',
    guarantees: [
      {
        strong: 'تجميع فوقي',
        rest: '، بلا قياس ميداني خاص بنا: نجمع مصادر قائمة بدل إصدار حكم منفرد.',
      },
      {
        strong: 'مصادر ذات رخص مفتوحة',
        rest: ' حصراً، قابلة للتتبّع ومذكورة واحداً واحداً في دليل الترميز.',
      },
      {
        strong: 'أوزان صريحة',
        rest: ' واختبارات حساسية تُنشر إلى جانب النتيجة الرئيسية.',
      },
      {
        strong: 'لجنة علمية مستقلة',
        rest: ' عن الأمانة، مكلَّفة بالمراجعة النقدية.',
      },
      {
        strong: 'ترقيم الإصدارات',
        rest: ' لكل نسخة: تبقى القيم القديمة متاحة وقابلة للمقارنة.',
      },
    ],
    license: 'رخصة البيانات · CC-BY 4.0 · الاستشهاد إلزامي',
  },
  datasets: {
    eyebrow: 'مجموعات البيانات',
    title: 'التنزيل والاستشهاد',
    lead: 'كل مجموعة مرقَّمة الإصدار ومصحوبة بدليل ترميزها وبمعرِّف DOI قابل للاستشهاد. بيانات توضيحية.',
    headers: {
      dataset: 'مجموعة البيانات',
      formats: 'الصيغ',
      doi: 'DOI',
      codebook: 'دليل الترميز',
      action: 'إجراء',
    },
    codebookLabel: 'دليل الترميز',
    downloadLabel: 'تنزيل',
    rows: [
      {
        name: 'المؤشر المركّب، إصدار 2026',
        sub: 'درجات البلدان والأبعاد الفرعية، العيّنة الكاملة',
        formats: ['CSV', 'XLSX', 'JSON'],
        doi: '10.59000/dt.bar.2026',
      },
      {
        name: 'سلاسل زمنية 2015 إلى 2026',
        sub: 'التطور السنوي حسب البلد وحسب البعد الفرعي',
        formats: ['CSV', 'JSON'],
        doi: '10.59000/dt.bar.series',
      },
      {
        name: 'المصادر والأوزان',
        sub: 'لائحة المؤشرات المصدر وأوزانها ورخصها',
        formats: ['CSV', 'XLSX'],
        doi: '10.59000/dt.bar.sources',
      },
      {
        name: 'هندسة الخريطة',
        sub: 'رسوم مبسّطة لحدود البلدان، لإعادة الاستخدام',
        formats: ['JSON'],
        doi: '10.59000/dt.bar.geo',
      },
    ],
  },
  contrib: {
    title: 'هل أنتم مركز دراسات عضو؟ أثروا بيانات البلدان.',
    body: 'تُبنى إصدارات المؤشر مع الشبكة. اقترحوا مؤشرات، أو صحّحوا قيمة، أو وثّقوا سياقاً وطنياً: كل مساهمة تُراجَع وتُنسَب إلى صاحبها وتُرقَّم إصداراتها.',
    ctaPrimary: 'المساهمة في البيانات',
    ctaSecondary: 'الاطلاع على البروتوكول',
  },
};

// Table exhaustive par construction (cf. `projects-content.ts`).
const BY_LOCALE: Record<Locale, BarometerContent> = { fr, en, es, pt, ar };

export function getBarometerContent(locale: Locale): BarometerContent {
  return BY_LOCALE[locale];
}

// Couleur Tailwind de la catégorie (1 = plus libre … 5 = non libre).
export const CAT_BG = [
  'bg-bar-1',
  'bg-bar-2',
  'bg-bar-3',
  'bg-bar-4',
  'bg-bar-5',
] as const;
export const CAT_TEXT = [
  'text-bar-1',
  'text-bar-2',
  'text-bar-3',
  'text-bar-4',
  'text-bar-5',
] as const;

// Données de la carte (F-30) — INDÉPENDANTES de la locale d'affichage. `name`
// correspond au libellé anglais de world-atlas (countries-110m) pour colorer le
// bon pays ; `fr`/`en` servent l'affichage. Données d'illustration (cf. en-tête).
export type MapDatum = {
  name: string;
  /**
   * Libellé affiché, PAR LANGUE.
   *
   * C'était `fr` et `en`, lus par un ternaire `loc === 'en' ? d.en : d.fr` sur
   * la page Baromètre ET sur l'accueil : les trois langues ajoutées retombaient
   * donc sur le français, et la carte annonçait « Afrique du Sud » à un lecteur
   * arabophone. Une table indexée par la locale rend le cas impossible — il ne
   * compile plus si une langue manque.
   */
  label: Record<Locale, string>;
  region: 'afrique' | 'europe';
  cat: 1 | 2 | 3 | 4 | 5;
  index: string;
};

export const MAP_DATA: MapDatum[] = [
  {
    name: 'Belgium',
    label: {
      fr: 'Belgique',
      en: 'Belgium',
      es: 'Bélgica',
      pt: 'Bélgica',
      ar: 'بلجيكا',
    },
    region: 'europe',
    cat: 1,
    index: '0.86',
  },
  {
    name: 'France',
    label: {
      fr: 'France',
      en: 'France',
      es: 'Francia',
      pt: 'França',
      ar: 'فرنسا',
    },
    region: 'europe',
    cat: 1,
    index: '0.83',
  },
  {
    name: 'Portugal',
    label: {
      fr: 'Portugal',
      en: 'Portugal',
      es: 'Portugal',
      pt: 'Portugal',
      ar: 'البرتغال',
    },
    region: 'europe',
    cat: 1,
    index: '0.82',
  },
  {
    name: 'Spain',
    label: {
      fr: 'Espagne',
      en: 'Spain',
      es: 'España',
      pt: 'Espanha',
      ar: 'إسبانيا',
    },
    region: 'europe',
    cat: 1,
    index: '0.80',
  },
  {
    name: 'Botswana',
    label: {
      fr: 'Botswana',
      en: 'Botswana',
      es: 'Botsuana',
      pt: 'Botsuana',
      ar: 'بوتسوانا',
    },
    region: 'afrique',
    cat: 2,
    index: '0.72',
  },
  {
    name: 'Senegal',
    label: {
      fr: 'Sénégal',
      en: 'Senegal',
      es: 'Senegal',
      pt: 'Senegal',
      ar: 'السنغال',
    },
    region: 'afrique',
    cat: 2,
    index: '0.71',
  },
  {
    name: 'South Africa',
    label: {
      fr: 'Afrique du Sud',
      en: 'South Africa',
      es: 'Sudáfrica',
      pt: 'África do Sul',
      ar: 'جنوب أفريقيا',
    },
    region: 'afrique',
    cat: 2,
    index: '0.70',
  },
  {
    name: 'Ghana',
    label: {
      fr: 'Ghana',
      en: 'Ghana',
      es: 'Ghana',
      pt: 'Gana',
      ar: 'غانا',
    },
    region: 'afrique',
    cat: 2,
    index: '0.68',
  },
  {
    name: 'Greece',
    label: {
      fr: 'Grèce',
      en: 'Greece',
      es: 'Grecia',
      pt: 'Grécia',
      ar: 'اليونان',
    },
    region: 'europe',
    cat: 2,
    index: '0.66',
  },
  {
    name: 'Namibia',
    label: {
      fr: 'Namibie',
      en: 'Namibia',
      es: 'Namibia',
      pt: 'Namíbia',
      ar: 'ناميبيا',
    },
    region: 'afrique',
    cat: 3,
    index: '0.63',
  },
  {
    name: 'Kenya',
    label: {
      fr: 'Kenya',
      en: 'Kenya',
      es: 'Kenia',
      pt: 'Quénia',
      ar: 'كينيا',
    },
    region: 'afrique',
    cat: 3,
    index: '0.58',
  },
  {
    name: 'Morocco',
    label: {
      fr: 'Maroc',
      en: 'Morocco',
      es: 'Marruecos',
      pt: 'Marrocos',
      ar: 'المغرب',
    },
    region: 'afrique',
    cat: 3,
    index: '0.52',
  },
  {
    name: 'Tunisia',
    label: {
      fr: 'Tunisie',
      en: 'Tunisia',
      es: 'Túnez',
      pt: 'Tunísia',
      ar: 'تونس',
    },
    region: 'afrique',
    cat: 4,
    index: '0.49',
  },
  {
    name: 'Mali',
    label: {
      fr: 'Mali',
      en: 'Mali',
      es: 'Malí',
      pt: 'Mali',
      ar: 'مالي',
    },
    region: 'afrique',
    cat: 5,
    index: '0.34',
  },
];
