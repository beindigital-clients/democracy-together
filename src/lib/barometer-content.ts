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

export function getBarometerContent(locale: 'fr' | 'en'): BarometerContent {
  return locale === 'en' ? en : fr;
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
  fr: string;
  en: string;
  region: 'afrique' | 'europe';
  cat: 1 | 2 | 3 | 4 | 5;
  index: string;
};

export const MAP_DATA: MapDatum[] = [
  {
    name: 'Belgium',
    fr: 'Belgique',
    en: 'Belgium',
    region: 'europe',
    cat: 1,
    index: '0.86',
  },
  {
    name: 'France',
    fr: 'France',
    en: 'France',
    region: 'europe',
    cat: 1,
    index: '0.83',
  },
  {
    name: 'Portugal',
    fr: 'Portugal',
    en: 'Portugal',
    region: 'europe',
    cat: 1,
    index: '0.82',
  },
  {
    name: 'Spain',
    fr: 'Espagne',
    en: 'Spain',
    region: 'europe',
    cat: 1,
    index: '0.80',
  },
  {
    name: 'Botswana',
    fr: 'Botswana',
    en: 'Botswana',
    region: 'afrique',
    cat: 2,
    index: '0.72',
  },
  {
    name: 'Senegal',
    fr: 'Sénégal',
    en: 'Senegal',
    region: 'afrique',
    cat: 2,
    index: '0.71',
  },
  {
    name: 'South Africa',
    fr: 'Afrique du Sud',
    en: 'South Africa',
    region: 'afrique',
    cat: 2,
    index: '0.70',
  },
  {
    name: 'Ghana',
    fr: 'Ghana',
    en: 'Ghana',
    region: 'afrique',
    cat: 2,
    index: '0.68',
  },
  {
    name: 'Greece',
    fr: 'Grèce',
    en: 'Greece',
    region: 'europe',
    cat: 2,
    index: '0.66',
  },
  {
    name: 'Namibia',
    fr: 'Namibie',
    en: 'Namibia',
    region: 'afrique',
    cat: 3,
    index: '0.63',
  },
  {
    name: 'Kenya',
    fr: 'Kenya',
    en: 'Kenya',
    region: 'afrique',
    cat: 3,
    index: '0.58',
  },
  {
    name: 'Morocco',
    fr: 'Maroc',
    en: 'Morocco',
    region: 'afrique',
    cat: 3,
    index: '0.52',
  },
  {
    name: 'Tunisia',
    fr: 'Tunisie',
    en: 'Tunisia',
    region: 'afrique',
    cat: 4,
    index: '0.49',
  },
  {
    name: 'Mali',
    fr: 'Mali',
    en: 'Mali',
    region: 'afrique',
    cat: 5,
    index: '0.34',
  },
];
