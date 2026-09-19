// Contenu de l'accueil (F-10), porté fidèlement depuis la maquette agence
// `design/rmdl-accueil.html` (8 sections). Couche de contenu bilingue, prête à
// basculer vers Sanity (mêmes formes de retour).

type Locale = 'fr' | 'en';

export type HomeContent = {
  hero: {
    eyebrow: string;
    title: string;
    lead: string;
    ctaPrimary: string;
    ctaSecondary: string;
    visualLabel: string;
    visualCaption: string;
    creds: { label: string; value: string }[];
  };
  mission: {
    title: string;
    cta: string;
    cells: { ix: string; title: string; body: string }[];
    barometer: { label: string; title: string; body: string };
  };
  analyses: {
    title: string;
    cta: string;
    featured: { tag: string; title: string; body: string; chips: string[] };
    items: { tag: string; title: string; body: string }[];
  };
  barometre: {
    eyebrow: string;
    title: string;
    body: string;
    countries: { name: string; score: string }[];
    legend: string[];
    note: string;
    mapLabel: string;
    links: string[];
  };
  axes: {
    title: string;
    items: { n: string; title: string; body: string }[];
  };
  events: {
    title: string;
    cta: string;
    featured: { tag: string; title: string; body: string; action: string };
    items: { date: string; kind: string; title: string; meta: string }[];
  };
  youth: {
    eyebrow: string;
    title: string;
    body: string;
    cta: string;
    steps: { n: string; title: string; body: string }[];
  };
  join: {
    title: string;
    body: string;
    plans: {
      label: string;
      title: string;
      features: string[];
      cta: string;
    }[];
  };
  newsletter: { title: string; body: string; cta: string; placeholder: string };
};

const fr: HomeContent = {
  hero: {
    eyebrow: 'Democracy Together',
    title: "La démocratie a besoin d'un réseau.",
    lead: "Democracy Together relie les think tanks d'Afrique et d'Europe pour produire, partager et défendre la pensée démocratique.",
    ctaPrimary: 'Rejoindre le réseau',
    ctaSecondary: 'Lire les analyses',
    visualLabel: 'Citoyens réunis en forum de débat',
    visualCaption:
      "Image d'illustration. En production : photographie documentaire, digne et diverse.",
    creds: [
      { label: 'Statut', value: 'Association loi 1901, siège à Paris' },
      { label: 'Bureaux', value: 'Paris, Dakar, Bruxelles' },
      {
        label: 'Fondé par',
        value: 'Abdou Samb, Philippe Kourilsky, Pierre Vimont',
      },
    ],
  },
  mission: {
    title: 'Agréger les idées, mobiliser la relève, peser sur les décisions',
    cta: 'Notre mission',
    cells: [
      {
        ix: '01 Agrégation',
        title: 'Rassembler la recherche démocratique en un seul lieu',
        body: "Collecter, synthétiser et diffuser les analyses des think tanks membres sur la gouvernance numérique, la participation citoyenne, l'anti-corruption et les transitions démocratiques.",
      },
      {
        ix: '02 Promotion',
        title: 'Porter les idées dans le débat',
        body: 'Sommet mondial à Paris, webinaires et ateliers régionaux, partenariats avec décideurs, ONG et institutions académiques.',
      },
      {
        ix: '03 Capacités',
        title: 'Soutenir la relève',
        body: 'Mentorat et formations pour les think tanks émergents et les jeunes contributeurs.',
      },
      {
        ix: '04 Inclusion',
        title: 'Diversité réelle',
        body: 'Perspectives multidisciplinaires et diversité géographique, culturelle et de genre.',
      },
    ],
    barometer: {
      label: 'Le Baromètre',
      title: 'Un indice Afrique-Europe pour mesurer la démocratie',
      body: "Notre actif différenciant : des données ouvertes et citables qui nourrissent le rapport annuel sur l'état de la démocratie.",
    },
  },
  analyses: {
    title: 'Dernières analyses',
    cta: 'Toute la bibliothèque',
    featured: {
      tag: 'Rapport annuel · 88 pages · FR / EN',
      title: "L'état de la démocratie entre l'Afrique et l'Europe",
      body: 'Une lecture croisée des trajectoires démocratiques de deux continents dont les destins sont liés, fondée sur les contributions de trente-huit think tanks membres.',
      chips: ['Transitions démocratiques', 'Données ouvertes'],
    },
    items: [
      {
        tag: 'Policy brief · Gouvernance numérique',
        title: 'Réguler les plateformes sans affaiblir le débat public',
        body: 'Quatre recommandations pour les régulateurs européens et ouest-africains.',
      },
      {
        tag: 'Note de synthèse · Anti-corruption',
        title: 'Suivre l’argent : transparence budgétaire et confiance civique',
        body: 'Ce que les marchés publics ouverts changent à la reddition de comptes.',
      },
      {
        tag: 'Working paper · Participation citoyenne',
        title: 'La jeunesse comme force démocratique, pas comme cible',
        body: 'Sept dispositifs d’engagement testés à Dakar et à Bruxelles.',
      },
    ],
  },
  barometre: {
    eyebrow: 'Données ouvertes',
    title: 'Le Baromètre de la démocratie',
    body: 'Un indice composite Afrique-Europe, une méthodologie publiée, des jeux de données citables. Données d’illustration.',
    countries: [
      { name: 'Belgique', score: '0.86' },
      { name: 'France', score: '0.83' },
      { name: 'Sénégal', score: '0.71' },
      { name: 'Ghana', score: '0.68' },
      { name: 'Tunisie', score: '0.49' },
    ],
    legend: [
      'Libre',
      'Plutôt libre',
      'Partiellement',
      'Peu libre',
      'Non libre',
    ],
    note: 'Survolez un pays. Données d’illustration.',
    mapLabel: 'Carte interactive (démo)',
    links: ['Explorer les fiches pays', 'Télécharger les données'],
  },
  axes: {
    title: 'Cinq axes de travail',
    items: [
      {
        n: '01',
        title: 'Gouvernance numérique',
        body: 'Plateformes, désinformation, libertés en ligne et régulation démocratique du numérique.',
      },
      {
        n: '02',
        title: 'Participation citoyenne',
        body: 'Engagement, délibération et confiance dans les institutions démocratiques.',
      },
      {
        n: '03',
        title: 'Lutte contre la corruption',
        body: 'Transparence budgétaire, intégrité publique et reddition de comptes.',
      },
      {
        n: '04',
        title: 'Transitions démocratiques',
        body: 'Sortie d’autoritarisme, alternances et résilience des transitions.',
      },
      {
        n: '05',
        title: 'Crises globales et démocratie',
        body: 'Climat, sécurité et migrations : l’impact des crises sur la gouvernance.',
      },
    ],
  },
  events: {
    title: 'Événements',
    cta: "Tout l'agenda",
    featured: {
      tag: 'Sommet inaugural · Paris',
      title: 'Conférence inaugurale de Democracy Together',
      body: 'Une journée de plénières et d’ateliers pour lancer le réseau et ses premiers travaux conjoints.',
      action: 'S’inscrire',
    },
    items: [
      {
        date: '03 Déc',
        kind: 'Webinaire',
        title: 'Désinformation électorale : défendre le scrutin',
        meta: 'En ligne · FR / EN',
      },
      {
        date: '22 Jan',
        kind: 'Atelier régional · Dakar',
        title: 'Financer la société civile en Afrique de l’Ouest',
        meta: 'Présentiel · Français',
      },
      {
        date: '14 Fév',
        kind: 'Atelier régional · Bruxelles',
        title: 'Le numérique au service de la délibération',
        meta: 'Hybride · FR / EN',
      },
    ],
  },
  youth: {
    eyebrow: 'Hub jeunes',
    title: 'Tu as moins de 35 ans et des idées pour la démocratie ?',
    body: 'Un espace pensé pour toi : un parcours progressif pour apprendre, contribuer, et être accompagné par des mentors du réseau.',
    cta: 'Rejoindre le hub jeunes',
    steps: [
      {
        n: '01',
        title: 'Découvrir',
        body: 'Comprendre les enjeux avec des formats courts et accessibles.',
      },
      {
        n: '02',
        title: 'Apprendre',
        body: 'Boîte à outils, webinaires et modules de renforcement de capacités.',
      },
      {
        n: '03',
        title: 'Contribuer',
        body: 'Publier une tribune, rejoindre un groupe de travail, candidater à une bourse.',
      },
      {
        n: '04',
        title: 'Mentorer',
        body: 'Être mis en relation avec un mentor expérimenté du réseau.',
      },
    ],
  },
  join: {
    title: 'Rejoindre le réseau',
    body: 'Trois façons d’en être. La cotisation est solidaire et ajustée selon le pays.',
    plans: [
      {
        label: 'Organisation',
        title: 'Think tank membre',
        features: [
          'Profil d’organisation et publications',
          'Accès aux projets et au fonds collaboratif',
          'Voix dans la gouvernance du réseau',
        ],
        cta: 'Candidater',
      },
      {
        label: 'Personne',
        title: 'Membre individuel',
        features: [
          'Profil d’expert dans l’annuaire',
          'Espaces collaboratifs et événements',
          'Lettre d’analyses réservée',
        ],
        cta: 'Adhérer',
      },
      {
        label: 'Moins de 35 ans',
        title: 'Jeune contributeur',
        features: [
          'Accès au hub jeunes',
          'Mentorat et bourses',
          'Publication accompagnée',
        ],
        cta: 'Nous rejoindre',
      },
    ],
  },
  newsletter: {
    title: 'La lettre d’analyses',
    body: 'Les travaux du réseau et le débat démocratique, deux fois par mois.',
    cta: 'S’abonner',
    placeholder: 'Votre e-mail',
  },
};

const en: HomeContent = {
  hero: {
    eyebrow: 'Democracy Together',
    title: 'Democracy needs a network.',
    lead: 'Democracy Together connects the think tanks of Africa and Europe to produce, share and defend democratic thought.',
    ctaPrimary: 'Join the network',
    ctaSecondary: 'Read the analyses',
    visualLabel: 'Citizens gathered in a debate forum',
    visualCaption:
      'Illustrative image. In production: documentary photography, dignified and diverse.',
    creds: [
      { label: 'Status', value: 'Non-profit (loi 1901), based in Paris' },
      { label: 'Offices', value: 'Paris, Dakar, Brussels' },
      {
        label: 'Founded by',
        value: 'Abdou Samb, Philippe Kourilsky, Pierre Vimont',
      },
    ],
  },
  mission: {
    title: 'Aggregate ideas, mobilise the next generation, shape decisions',
    cta: 'Our mission',
    cells: [
      {
        ix: '01 Aggregation',
        title: 'Bring democratic research together in one place',
        body: 'Collect, synthesise and share member think tanks’ analyses on digital governance, citizen participation, anti-corruption and democratic transitions.',
      },
      {
        ix: '02 Promotion',
        title: 'Carry ideas into the debate',
        body: 'A global summit in Paris, webinars and regional workshops, partnerships with decision-makers, NGOs and academic institutions.',
      },
      {
        ix: '03 Capacity',
        title: 'Support the next generation',
        body: 'Mentorship and training for emerging think tanks and young contributors.',
      },
      {
        ix: '04 Inclusion',
        title: 'Real diversity',
        body: 'Multidisciplinary perspectives and geographic, cultural and gender diversity.',
      },
    ],
    barometer: {
      label: 'The Barometer',
      title: 'An Africa–Europe index to measure democracy',
      body: 'Our differentiating asset: open, citable data that feeds the annual report on the state of democracy.',
    },
  },
  analyses: {
    title: 'Latest analyses',
    cta: 'The whole library',
    featured: {
      tag: 'Annual report · 88 pages · FR / EN',
      title: 'The state of democracy between Africa and Europe',
      body: 'A cross-reading of the democratic trajectories of two continents whose destinies are linked, based on the contributions of thirty-eight member think tanks.',
      chips: ['Democratic transitions', 'Open data'],
    },
    items: [
      {
        tag: 'Policy brief · Digital governance',
        title: 'Regulating platforms without weakening public debate',
        body: 'Four recommendations for European and West African regulators.',
      },
      {
        tag: 'Briefing note · Anti-corruption',
        title: 'Follow the money: budget transparency and civic trust',
        body: 'What open public procurement changes for accountability.',
      },
      {
        tag: 'Working paper · Citizen participation',
        title: 'Youth as a democratic force, not a target',
        body: 'Seven engagement mechanisms tested in Dakar and Brussels.',
      },
    ],
  },
  barometre: {
    eyebrow: 'Open data',
    title: 'The Democracy Barometer',
    body: 'A composite Africa–Europe index, a published methodology, citable datasets. Illustrative data.',
    countries: [
      { name: 'Belgium', score: '0.86' },
      { name: 'France', score: '0.83' },
      { name: 'Senegal', score: '0.71' },
      { name: 'Ghana', score: '0.68' },
      { name: 'Tunisia', score: '0.49' },
    ],
    legend: ['Free', 'Mostly free', 'Partly free', 'Barely free', 'Not free'],
    note: 'Hover a country. Illustrative data.',
    mapLabel: 'Interactive map (demo)',
    links: ['Explore country profiles', 'Download the data'],
  },
  axes: {
    title: 'Five areas of work',
    items: [
      {
        n: '01',
        title: 'Digital governance',
        body: 'Platforms, disinformation, online freedoms and democratic regulation of technology.',
      },
      {
        n: '02',
        title: 'Citizen participation',
        body: 'Engagement, deliberation and trust in democratic institutions.',
      },
      {
        n: '03',
        title: 'Fighting corruption',
        body: 'Budget transparency, public integrity and accountability.',
      },
      {
        n: '04',
        title: 'Democratic transitions',
        body: 'Exiting authoritarianism, transfers of power and the resilience of transitions.',
      },
      {
        n: '05',
        title: 'Global crises and democracy',
        body: 'Climate, security and migration: the impact of crises on governance.',
      },
    ],
  },
  events: {
    title: 'Events',
    cta: 'The full agenda',
    featured: {
      tag: 'Inaugural summit · Paris',
      title: 'Democracy Together inaugural conference',
      body: 'A day of plenaries and workshops to launch the network and its first joint work.',
      action: 'Register',
    },
    items: [
      {
        date: '03 Dec',
        kind: 'Webinar',
        title: 'Electoral disinformation: defending the vote',
        meta: 'Online · FR / EN',
      },
      {
        date: '22 Jan',
        kind: 'Regional workshop · Dakar',
        title: 'Funding civil society in West Africa',
        meta: 'In person · French',
      },
      {
        date: '14 Feb',
        kind: 'Regional workshop · Brussels',
        title: 'Technology in the service of deliberation',
        meta: 'Hybrid · FR / EN',
      },
    ],
  },
  youth: {
    eyebrow: 'Youth hub',
    title: 'Under 35 and full of ideas for democracy?',
    body: 'A space designed for you: a step-by-step path to learn, contribute and be supported by mentors from the network.',
    cta: 'Join the youth hub',
    steps: [
      {
        n: '01',
        title: 'Discover',
        body: 'Understand the issues through short, accessible formats.',
      },
      {
        n: '02',
        title: 'Learn',
        body: 'Toolkit, webinars and capacity-building modules.',
      },
      {
        n: '03',
        title: 'Contribute',
        body: 'Publish an op-ed, join a working group, apply for a grant.',
      },
      {
        n: '04',
        title: 'Be mentored',
        body: 'Get matched with an experienced mentor from the network.',
      },
    ],
  },
  join: {
    title: 'Join the network',
    body: 'Three ways to take part. Membership fees are solidarity-based and adjusted by country.',
    plans: [
      {
        label: 'Organisation',
        title: 'Member think tank',
        features: [
          'Organisation profile and publications',
          'Access to projects and the collaborative fund',
          'A voice in the network’s governance',
        ],
        cta: 'Apply',
      },
      {
        label: 'Individual',
        title: 'Individual member',
        features: [
          'Expert profile in the directory',
          'Collaborative spaces and events',
          'Members-only analysis letter',
        ],
        cta: 'Become a member',
      },
      {
        label: 'Under 35',
        title: 'Young contributor',
        features: [
          'Access to the youth hub',
          'Mentorship and grants',
          'Supported publication',
        ],
        cta: 'Join us',
      },
    ],
  },
  newsletter: {
    title: 'The analysis letter',
    body: 'The network’s work and the democratic debate, twice a month.',
    cta: 'Subscribe',
    placeholder: 'Your email',
  },
};

// Repli LOCAL pur (sans dépendance Sanity) : utilisé quand aucun document
// `homePage` n'est publié, et comme source de seed. Le fetch Sanity + fallback
// vit dans `src/lib/home.ts`. Garder ce module pur (les tests l'importent).
export function homeFallback(locale: Locale): HomeContent {
  return locale === 'en' ? en : fr;
}
