import { internalMutation } from './_generated/server';

// DEV/TEST UNIQUEMENT (garde AUTH_DEV_OTP) : peuple la bibliothèque (F-32/F-34)
// avec les publications de démonstration de la maquette. Idempotent (ignore un
// slug déjà présent), donc rejouable. Données illustratives : titres et auteurs
// fictifs, aucune affirmation sur des travaux ou des personnes réelles.

type SeedPub = {
  slug: string;
  title: string;
  type: 'rapport' | 'policy-brief' | 'working-paper' | 'note' | 'dataset';
  theme: string;
  region: 'afrique' | 'europe' | 'mondial';
  languages: ('fr' | 'en')[];
  access: 'open' | 'members';
  authors: { name: string; role?: string }[];
  year: number;
  month: number; // 0-11
  abstract: string;
  keypoints: string[];
  body: string[];
  pages?: number;
  license?: string;
  downloads: number;
  citations: number;
  views?: number;
  doi: string;
  image: string;
};

const PUBS: SeedPub[] = [
  {
    slug: 'etat-democratie-afrique-europe',
    title: "L'état de la démocratie entre l'Afrique et l'Europe",
    type: 'rapport',
    theme: 'transitions',
    region: 'mondial',
    languages: ['fr', 'en'],
    access: 'open',
    authors: [
      { name: 'Aminata Wade', role: 'Chercheuse · Dakar' },
      { name: 'Pieter Vandenberghe', role: 'Analyste · Bruxelles' },
    ],
    year: 2026,
    month: 4,
    abstract:
      "Une lecture croisée des trajectoires démocratiques de deux continents dont les destins sont liés. Fondé sur les contributions de trente-huit think tanks membres, ce premier rapport annuel propose un état des lieux partagé et une grille de lecture commune pour l'Afrique et l'Europe.",
    keypoints: [
      'Les reculs démocratiques observés sur les deux continents partagent des mécanismes communs, mais appellent des réponses ancrées dans chaque contexte.',
      "La confiance institutionnelle, plus que le seul cadre légal, prédit la résilience d'une démocratie face aux chocs.",
      "L'implication des moins de 35 ans reste sous-exploitée comme levier de renouvellement démocratique.",
      'Une coopération structurée entre think tanks africains et européens accélère la circulation des solutions éprouvées.',
    ],
    body: [
      "Penser la démocratie entre l'Afrique et l'Europe suppose d'abord de renoncer à un récit unique. Les deux continents ne suivent pas la même trajectoire, et l'un n'est pas le futur ou le passé de l'autre. Ils affrontent pourtant des pressions convergentes : défiance envers les institutions, fragmentation de l'espace public, instrumentalisation du numérique.",
      "Ce rapport fait le pari d'une grille de lecture partagée. Plutôt que de classer les pays, il cherche à comprendre ce qui rend une démocratie capable d'absorber un choc sans se renier. La donnée y sert l'analyse, jamais le verdict.",
    ],
    pages: 88,
    license: 'CC BY 4.0',
    downloads: 1842,
    citations: 31,
    views: 4210,
    doi: '10.59000/dt.2026.100',
    image: '/library/parliament.jpg',
  },
  {
    slug: 'reguler-plateformes-debat-public',
    title: 'Réguler les plateformes sans affaiblir le débat public',
    type: 'policy-brief',
    theme: 'gouvernance-numerique',
    region: 'europe',
    languages: ['fr', 'en'],
    access: 'open',
    authors: [{ name: 'K. Mensah' }],
    year: 2026,
    month: 3,
    abstract:
      'Comment encadrer les grandes plateformes numériques sans transformer la modération en censure ? Ce policy brief compare les approches européennes récentes et propose des garde-fous procéduraux.',
    keypoints: [
      'La régulation gagne à viser les procédés (transparence, recours) plutôt que les contenus eux-mêmes.',
      "Un mécanisme d'appel indépendant réduit le risque de sur-modération.",
      'La portabilité des données limite le verrouillage des utilisateurs sans interdire les services.',
    ],
    body: [
      "Réguler une plateforme, ce n'est pas arbitrer chaque message : c'est rendre lisibles et contestables les décisions qui façonnent le débat. Les régimes les plus robustes misent sur l'obligation de transparence et le droit de recours plutôt que sur des listes de contenus interdits.",
      'Les auteurs plaident pour une régulation graduée, proportionnée à la taille et au pouvoir de marché, et adossée à un contrôle externe vérifiable.',
    ],
    downloads: 1204,
    citations: 18,
    doi: '10.59000/dt.2026.101',
    image: '/library/digital.jpg',
  },
  {
    slug: 'suivre-argent-transparence-budgetaire',
    title: "Suivre l'argent : transparence budgétaire et confiance civique",
    type: 'note',
    theme: 'anti-corruption',
    region: 'afrique',
    languages: ['fr'],
    access: 'open',
    authors: [{ name: 'L. Traoré' }, { name: 'M. Rossi' }],
    year: 2026,
    month: 3,
    abstract:
      "La transparence budgétaire est souvent présentée comme un remède à la corruption. Cette note examine à quelles conditions l'ouverture des comptes publics nourrit réellement la confiance des citoyens.",
    keypoints: [
      "Publier un budget ne suffit pas : encore faut-il qu'il soit lisible et relié aux résultats.",
      'Les portails de dépenses ont un effet mesurable quand la société civile peut les exploiter.',
      "L'opacité des marchés publics reste le principal angle mort.",
    ],
    body: [
      "Suivre l'argent public suppose des données ouvertes, mais surtout des intermédiaires capables de les traduire. Là où des collectifs citoyens s'emparent des portails budgétaires, la pression sur les gestionnaires augmente sensiblement.",
      "La note recommande d'arrimer la transparence à des indicateurs de service rendu, pour que la donnée serve le contrôle démocratique et non la seule conformité formelle.",
    ],
    downloads: 903,
    citations: 12,
    doi: '10.59000/dt.2026.102',
    image: '/library/justice.jpg',
  },
  {
    slug: 'jeunesse-force-democratique',
    title: 'La jeunesse comme force démocratique, pas comme cible',
    type: 'working-paper',
    theme: 'participation',
    region: 'mondial',
    languages: ['fr', 'en'],
    access: 'open',
    authors: [{ name: 'S. Diallo' }],
    year: 2026,
    month: 2,
    abstract:
      "Les moins de 35 ans sont souvent décrits comme désengagés. Ce working paper renverse la perspective : ils réinventent les formes de l'engagement, hors des cadres institutionnels classiques.",
    keypoints: [
      "Le désengagement apparent masque un déplacement vers des formes d'action plus directes.",
      "L'éducation civique gagne à partir des pratiques réelles plutôt que des institutions abstraites.",
      'Donner un pouvoir réel, et pas seulement une consultation, est la condition de la mobilisation durable.',
    ],
    body: [
      "Traiter la jeunesse comme une cible à convaincre, c'est manquer ce qui se joue : une génération qui agit, mais ailleurs que là où on l'attend. Les dispositifs de participation efficaces sont ceux qui délèguent une décision concrète.",
      "L'auteur propose une typologie des engagements juvéniles et des leviers institutionnels pour les reconnaître sans les domestiquer.",
    ],
    downloads: 758,
    citations: 9,
    doi: '10.59000/dt.2026.103',
    image: '/library/youth.jpg',
  },
  {
    slug: 'elections-sous-tension-integrite',
    title: "Élections sous tension : défendre l'intégrité du scrutin",
    type: 'policy-brief',
    theme: 'transitions',
    region: 'afrique',
    languages: ['fr', 'en'],
    access: 'open',
    authors: [{ name: 'N. Okafor' }, { name: 'J. Lemaire' }],
    year: 2026,
    month: 2,
    abstract:
      "Préparer une élection contestée ne se joue pas le jour du vote, mais des mois avant. Ce brief réunit les mesures qui protègent l'intégrité du scrutin dans les contextes les plus tendus.",
    keypoints: [
      "L'anticipation des contentieux désamorce une part des crises post-électorales.",
      'Des observateurs nationaux crédibles pèsent autant que les missions internationales.',
      'La chaîne de résultats doit être traçable de bout en bout pour résister à la contestation.',
    ],
    body: [
      "Défendre l'intégrité d'un scrutin, c'est sécuriser une chaîne : inscription, vote, dépouillement, transmission, proclamation. Une faille à n'importe quel maillon suffit à nourrir le soupçon.",
      'Les auteurs détaillent un socle de garanties applicables même à budget contraint, en priorisant la traçabilité et la formation des acteurs locaux.',
    ],
    downloads: 1120,
    citations: 22,
    doi: '10.59000/dt.2026.104',
    image: '/library/paris.jpg',
  },
  {
    slug: 'desinformation-ia-generative-risques',
    title: 'Désinformation et IA générative : cartographie des risques',
    type: 'rapport',
    theme: 'gouvernance-numerique',
    region: 'mondial',
    languages: ['en'],
    access: 'members',
    authors: [{ name: 'E. Novak' }],
    year: 2025,
    month: 11,
    abstract:
      "L'IA générative abaisse le coût de production de la désinformation. Ce rapport cartographie les risques pour les processus démocratiques et les contre-mesures disponibles.",
    keypoints: [
      "Le risque principal n'est pas le faux parfait, mais le doute généralisé qu'il installe.",
      'Le marquage de provenance des contenus est une défense partielle mais utile.',
      "L'éducation aux médias reste le levier le plus robuste à moyen terme.",
    ],
    body: [
      "Cartographier les risques de l'IA générative, c'est distinguer la fabrication de faux convaincants de leur diffusion à grande échelle. Le second problème, structurel, est le plus difficile à traiter.",
      "Le rapport propose une grille d'évaluation des menaces par étape du cycle électoral et une liste de contre-mesures hiérarchisées par coût et par efficacité.",
    ],
    downloads: 2310,
    citations: 47,
    doi: '10.59000/dt.2025.105',
    image: '/library/digital.jpg',
  },
  {
    slug: 'participation-citoyenne-locale-dispositifs',
    title: 'Participation citoyenne locale : sept dispositifs comparés',
    type: 'note',
    theme: 'participation',
    region: 'europe',
    languages: ['fr'],
    access: 'open',
    authors: [{ name: 'C. Bâ' }, { name: 'F. Mercier' }],
    year: 2025,
    month: 10,
    abstract:
      'Budgets participatifs, jurys citoyens, conventions tirées au sort : cette note compare sept dispositifs de participation locale et leurs effets réels sur la décision.',
    keypoints: [
      "L'impact dépend moins du format que du pouvoir effectivement délégué.",
      'Le tirage au sort élargit la diversité des participants mais exige un vrai accompagnement.',
      "Sans retour sur les décisions prises, la confiance s'érode rapidement.",
    ],
    body: [
      "Comparer des dispositifs de participation, c'est mesurer l'écart entre la promesse et la décision. Les plus efficaces engagent une obligation de suite : ce qui ressort de la délibération doit être traité, accepté ou refusé motif à l'appui.",
      'La note propose une grille de choix selon le type de décision et les ressources disponibles.',
    ],
    downloads: 642,
    citations: 8,
    doi: '10.59000/dt.2025.106',
    image: '/library/hero-home.jpg',
  },
  {
    slug: 'indicateurs-corruption-jeu-donnees',
    title: 'Indicateurs de corruption : jeu de données 2020 vers 2025',
    type: 'dataset',
    theme: 'anti-corruption',
    region: 'mondial',
    languages: ['fr', 'en'],
    access: 'open',
    authors: [{ name: 'Équipe Baromètre Democracy Together' }],
    year: 2025,
    month: 10,
    abstract:
      "Un jeu de données ouvert réunissant cinq ans d'indicateurs de corruption harmonisés sur le périmètre du réseau, documenté et réutilisable.",
    keypoints: [
      'Données harmonisées et documentées, prêtes pour la recherche reproductible.',
      'Couverture Afrique-Europe sur la période 2020-2025.',
      'Licence ouverte et dictionnaire de variables fourni.',
    ],
    body: [
      "Ce jeu de données agrège des sources publiques en un format unique, avec un journal des transformations appliquées. L'objectif est la transparence méthodologique autant que la richesse des chiffres.",
      'Le dictionnaire de variables et les scripts de préparation accompagnent les fichiers pour permettre la vérification indépendante.',
    ],
    downloads: 1980,
    citations: 14,
    doi: '10.59000/dt.2025.107',
    image: '/library/justice.jpg',
  },
  {
    slug: 'climat-gouvernance-epreuve-crises',
    title: "Climat et gouvernance : l'épreuve démocratique des crises",
    type: 'working-paper',
    theme: 'crises',
    region: 'mondial',
    languages: ['fr', 'en'],
    access: 'open',
    authors: [{ name: 'R. Haddad' }],
    year: 2025,
    month: 9,
    abstract:
      'Les chocs climatiques mettent les institutions sous tension. Ce working paper interroge ce que la gestion des crises révèle de la solidité démocratique.',
    keypoints: [
      "L'état d'urgence répété fragilise les contre-pouvoirs s'il n'est pas borné.",
      'La planification de long terme se heurte aux cycles électoraux courts.',
      "La participation locale améliore l'acceptabilité des mesures d'adaptation.",
    ],
    body: [
      "Gouverner la crise climatique, c'est arbitrer entre l'urgence et la délibération. Les démocraties résilientes sont celles qui parviennent à agir vite sans suspendre durablement le contrôle.",
      "L'auteur examine plusieurs cas récents et dégage des principes pour concilier réactivité et redevabilité.",
    ],
    downloads: 534,
    citations: 6,
    doi: '10.59000/dt.2025.108',
    image: '/library/parliament.jpg',
  },
  {
    slug: 'financer-societe-civile-afrique-ouest',
    title: "Financer la société civile en Afrique de l'Ouest",
    type: 'rapport',
    theme: 'participation',
    region: 'afrique',
    languages: ['fr'],
    access: 'members',
    authors: [{ name: 'A. Sow' }, { name: 'T. Lefebvre' }],
    year: 2025,
    month: 8,
    abstract:
      "Le financement conditionne l'indépendance des organisations citoyennes. Ce rapport analyse les modèles à l'œuvre en Afrique de l'Ouest et leurs effets sur l'autonomie.",
    keypoints: [
      'La dépendance à un bailleur unique fragilise la trajectoire des organisations.',
      'Les ressources locales, même modestes, renforcent la légitimité et la durée.',
      "La transparence des financements protège contre les soupçons d'instrumentalisation.",
    ],
    body: [
      "Financer la société civile, c'est aussi définir sa marge de manœuvre. Les organisations les plus solides diversifient leurs ressources et rendent leurs comptes publics.",
      "Le rapport propose des pistes pour des financements mixtes, prévisibles et compatibles avec l'indépendance éditoriale.",
    ],
    downloads: 870,
    citations: 11,
    doi: '10.59000/dt.2025.109',
    image: '/library/youth.jpg',
  },
  {
    slug: 'souverainete-numerique-dependance-autonomie',
    title: 'Souveraineté numérique : entre dépendance et autonomie',
    type: 'policy-brief',
    theme: 'gouvernance-numerique',
    region: 'europe',
    languages: ['fr', 'en'],
    access: 'open',
    authors: [{ name: 'M. Costa' }],
    year: 2025,
    month: 8,
    abstract:
      'La souveraineté numérique oscille entre repli et coopération. Ce brief clarifie les choix possibles pour les institutions démocratiques face à la dépendance technologique.',
    keypoints: [
      "La souveraineté ne signifie pas l'autarcie, mais la capacité de choisir.",
      'Les logiciels libres et les standards ouverts réduisent les dépendances critiques.',
      "La compétence publique interne est aussi stratégique que l'infrastructure.",
    ],
    body: [
      "Penser la souveraineté numérique, c'est arbitrer entre coût, sécurité et liberté d'action. Le tout-souverain est rarement réaliste ; la dépendance totale est rarement prudente.",
      "Le brief propose une méthode d'évaluation des dépendances par criticité, pour cibler les efforts là où ils comptent.",
    ],
    downloads: 1015,
    citations: 16,
    doi: '10.59000/dt.2025.110',
    image: '/library/digital.jpg',
  },
  {
    slug: 'migrations-democratie-recit-crise',
    title: 'Migrations et démocratie : dépasser le récit de la crise',
    type: 'note',
    theme: 'crises',
    region: 'europe',
    languages: ['fr'],
    access: 'open',
    authors: [{ name: 'H. Bensaïd' }],
    year: 2025,
    month: 6,
    abstract:
      'Le terme de « crise migratoire » sature le débat. Cette note propose une lecture plus froide des faits et de leurs effets sur les institutions démocratiques.',
    keypoints: [
      "Le cadrage en « crise » fausse l'évaluation des politiques publiques.",
      'Les chiffres réels contredisent souvent la perception dominante.',
      "L'intégration locale produit de meilleurs résultats que la gestion par l'urgence.",
    ],
    body: [
      "Dépasser le récit de la crise, c'est rendre au sujet sa complexité statistique et humaine. Les politiques construites sous le signe de l'urgence permanente se révèlent souvent coûteuses et peu efficaces.",
      'La note plaide pour des dispositifs ancrés dans les territoires et évalués sur la durée.',
    ],
    downloads: 489,
    citations: 5,
    doi: '10.59000/dt.2025.111',
    image: '/library/paris.jpg',
  },
  {
    slug: 'transitions-post-autoritaires-donnees',
    title: 'Transitions post-autoritaires : ce que disent les données',
    type: 'dataset',
    theme: 'transitions',
    region: 'mondial',
    languages: ['en'],
    access: 'open',
    authors: [{ name: 'Équipe Baromètre Democracy Together' }],
    year: 2025,
    month: 5,
    abstract:
      'Un jeu de données comparatif sur les transitions post-autoritaires, conçu pour tester empiriquement les hypothèses sur leur réussite ou leur échec.',
    keypoints: [
      'Variables harmonisées sur plusieurs décennies de transitions.',
      'Permet de comparer trajectoires réussies et reculs.',
      'Documentation et code de réplication inclus.',
    ],
    body: [
      "Ce que disent les données, c'est d'abord que les transitions ne suivent pas de loi unique. Le jeu permet de croiser durée, contexte et résultats sans présupposer l'issue.",
      "Les fichiers sont accompagnés d'un guide d'usage pour la recherche et l'enseignement.",
    ],
    downloads: 1340,
    citations: 19,
    doi: '10.59000/dt.2025.112',
    image: '/library/parliament.jpg',
  },
  {
    slug: 'confiance-institutionnelle-enquete-comparee',
    title: 'Confiance institutionnelle : enquête comparée Afrique-Europe',
    type: 'rapport',
    theme: 'participation',
    region: 'mondial',
    languages: ['fr', 'en'],
    access: 'open',
    authors: [{ name: 'P. Vimont' }, { name: 'A. Wade' }],
    year: 2025,
    month: 4,
    abstract:
      "La confiance dans les institutions est un indicateur avancé de la résilience démocratique. Ce rapport compare ses ressorts en Afrique et en Europe à partir d'une enquête harmonisée.",
    keypoints: [
      "La confiance se construit dans l'expérience concrète des services publics.",
      'La proximité institutionnelle pèse davantage que les discours.',
      'Les écarts intergénérationnels appellent des réponses différenciées.',
    ],
    body: [
      "Mesurer la confiance institutionnelle, c'est capter un signal précoce. Là où elle s'effondre, les chocs ultérieurs frappent plus fort. L'enquête met en évidence des leviers communs aux deux continents.",
      'Le rapport propose un tableau de bord partagé pour suivre cette confiance dans le temps.',
    ],
    downloads: 1560,
    citations: 27,
    doi: '10.59000/dt.2025.113',
    image: '/library/hero-home.jpg',
  },
];

// internalMutation : NON joignable depuis un client (défense en profondeur, cf.
// seed.seedDirectory). Invoquée via `npx convex run seedPublications:seedPublications`.
export const seedPublications = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.AUTH_DEV_OTP !== 'true') {
      throw new Error('Désactivé (AUTH_DEV_OTP).');
    }
    const now = Date.now();
    let inserted = 0;
    for (const p of PUBS) {
      const existing = await ctx.db
        .query('publications')
        .withIndex('by_slug', (q) => q.eq('slug', p.slug))
        .unique();
      if (existing) continue;
      const { month, ...rest } = p;
      await ctx.db.insert('publications', {
        ...rest,
        languages: [...p.languages],
        authors: p.authors.map((a) => ({ ...a })),
        keypoints: [...p.keypoints],
        body: [...p.body],
        publishedAt: Date.UTC(p.year, month, 15),
        status: 'published',
        createdAt: now,
      });
      inserted += 1;
    }
    return { inserted, total: PUBS.length };
  },
});
