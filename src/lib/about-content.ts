// Contenu de la page À propos (F-11 vision/mission, F-12 fondateurs &
// gouvernance), porté 1:1 depuis la maquette agence `design/rmdl-a-propos.html`.
// COUCHE DE CONTENU : aujourd'hui statique/local, signature pensée pour basculer
// vers Sanity plus tard (getAboutContent garde la même forme de retour).

type Locale = 'fr' | 'en';

export type Founder = {
  name: string;
  role: string;
  bio: string;
};

export type AboutContent = {
  hero: { eyebrow: string; title: string; lead: string };
  vision: { eyebrow: string; statement: string; attribution: string };
  mission: {
    eyebrow: string;
    axes: { n: string; title: string; body: string }[];
  };
  founders: {
    eyebrow: string;
    title: string;
    intro: string;
    people: Founder[];
  };
  governance: {
    eyebrow: string;
    title: string;
    intro: string;
    hubs: { city: string; scope: string; body: string }[];
    framework: { title: string; body: string };
    committees: {
      title: string;
      items: { n: string; name: string; body: string }[];
    };
  };
  funding: {
    eyebrow: string;
    title: string;
    intro: string;
    sources: { name: string; body: string }[];
    note: string;
  };
  lineage: {
    eyebrow: string;
    title: string;
    intro: string;
    refs: { name: string; body: string }[];
  };
  timeline: {
    eyebrow: string;
    title: string;
    intro: string;
    steps: { date: string; title: string; body: string }[];
  };
  cta: { title: string; body: string; primary: string; secondary: string };
};

const fr: AboutContent = {
  hero: {
    eyebrow: 'À propos',
    title: 'Relier les think tanks qui défendent la démocratie',
    lead: "Democracy Together est un réseau international de think tanks, d'Afrique et d'Europe, réuni pour agréger les analyses, porter une voix commune et renforcer les capacités au service de la démocratie.",
  },
  vision: {
    eyebrow: 'Notre vision',
    statement:
      "Devenir la plateforme de référence mondiale pour l'avancement de la pensée démocratique, en favorisant un écosystème inclusif où les idées circulent entre les continents.",
    attribution: 'Democracy Together · Énoncé de vision',
  },
  mission: {
    eyebrow: 'Notre mission, en quatre axes',
    axes: [
      {
        n: '01',
        title: 'Agréger les réflexions',
        body: 'Rassembler les analyses produites par les think tanks membres en un corpus commun, comparable et citable.',
      },
      {
        n: '02',
        title: 'Promouvoir les idées',
        body: 'Faire circuler les idées par des événements, des rapports et des partenariats institutionnels.',
      },
      {
        n: '03',
        title: 'Renforcer les capacités',
        body: "Accompagner les think tanks émergents et les jeunes chercheurs vers l'autonomie et la rigueur méthodologique.",
      },
      {
        n: '04',
        title: 'Innover et inclure',
        body: 'Croiser les perspectives multidisciplinaires et la diversité géographique, culturelle et de genre.',
      },
    ],
  },
  founders: {
    eyebrow: 'Fondateurs',
    title: 'Celles et ceux qui portent le réseau',
    intro:
      "Un collectif de scientifiques, de diplomates et d'entrepreneurs réuni autour d'une conviction commune. Certains profils seront complétés à mesure que le réseau se structure.",
    people: [
      {
        name: 'Abdou Samb',
        role: 'Ingénieur et mathématicien',
        bio: "Président d'A2S International à Paris et conseiller à la Commission européenne sur la transformation numérique. Nommé « Africain de l'année 2025 » aux Mission Africa Awards, il a fondé l'Abdou Samb Foundation, dédiée au panafricanisme et à la régénération de l'Afrique.",
      },
      {
        name: 'Philippe Kourilsky',
        role: 'Biologiste, professeur émérite',
        bio: "Professeur émérite au Collège de France et membre de l'Académie des sciences. Ancien directeur de l'Institut Pasteur et de son Réseau international, ancien président du Singapore Immunology Network, auteur de plus de 350 publications scientifiques.",
      },
      {
        name: 'Pierre Vimont',
        role: 'Diplomate',
        bio: "Ancien secrétaire général exécutif du Service européen pour l'action extérieure (SEAE) de 2010 à 2015 et ancien ambassadeur de France aux États-Unis. Il est aujourd'hui senior fellow au Carnegie Endowment for International Peace.",
      },
      {
        name: 'Armelle Chapalain',
        role: 'Relations publiques',
        bio: "Spécialiste en relations publiques et directrice de l'ESPTA. Lauréate du Prix du bien commun 2025.",
      },
      {
        name: 'Michèle Boccoz',
        role: 'Fondatrice',
        bio: 'Profil à compléter.',
      },
      {
        name: 'Marie-Laure Salles',
        role: 'Fondatrice',
        bio: 'Profil à compléter.',
      },
    ],
  },
  governance: {
    eyebrow: 'Gouvernance & structure',
    title: 'Une organisation qui se déploie par étapes',
    intro:
      "Democracy Together est une association loi 1901 dont le siège est à Paris. Son ancrage régional s'établit progressivement autour de trois bureaux, chacun rattaché à une aire de travail prioritaire.",
    hubs: [
      {
        city: 'Paris',
        scope: 'Siège',
        body: 'Coordination générale, partenariats institutionnels européens et organisation de la conférence inaugurale.',
      },
      {
        city: 'Dakar',
        scope: 'Afrique',
        body: 'Point d’ancrage continental, dédié aux think tanks africains et au renforcement des capacités locales.',
      },
      {
        city: 'Bruxelles',
        scope: 'Europe',
        body: "Interface avec les institutions de l'Union européenne et relais des travaux du réseau auprès des décideurs.",
      },
    ],
    framework: {
      title: 'Cadre associatif',
      body: "Constituée en association loi 1901 (en cours de création), la structure repose sur des statuts ouverts à l'adhésion de think tanks, de chercheurs et de partenaires partageant ses valeurs. La gouvernance distingue l'orientation stratégique de l'animation opérationnelle.",
    },
    committees: {
      title: 'Comités',
      items: [
        {
          n: '01',
          name: 'Conseil scientifique',
          body: "Garant de la rigueur et de l'indépendance des publications.",
        },
        {
          n: '02',
          name: 'Comité des partenariats',
          body: 'Événements, rapports conjoints et relations institutionnelles.',
        },
        {
          n: '03',
          name: 'Cellule jeunes talents',
          body: 'Mentorat, formation et accès aux travaux du réseau.',
        },
      ],
    },
  },
  funding: {
    eyebrow: 'Financement & transparence',
    title: "D'où viennent nos moyens",
    intro:
      "Le modèle économique du réseau combine plusieurs sources, choisies pour préserver son indépendance éditoriale. Aucune ne doit pouvoir peser sur l'orientation des travaux.",
    sources: [
      {
        name: 'Cotisations',
        body: 'Contributions annuelles des membres et des think tanks affiliés au réseau.',
      },
      {
        name: 'Dons philanthropiques',
        body: 'Soutiens de fondations et de mécènes engagés pour la démocratie.',
      },
      {
        name: 'Subventions',
        body: "Appuis d'institutions publiques, dont l'Union européenne, sur projets ciblés.",
      },
      {
        name: 'Partenariats RSE',
        body: 'Engagements d’entreprises au titre de leur responsabilité sociétale.',
      },
      {
        name: 'Fonds dédié',
        body: 'Enveloppe réservée aux projets collaboratifs portés par plusieurs membres.',
      },
    ],
    note: "Democracy Together publiera ses comptes et la répartition de ses ressources dès le premier exercice clos. Les pourcentages présentés dans nos supports sont, à ce stade, des données d'illustration et seront actualisés à la création effective de l'association.",
  },
  lineage: {
    eyebrow: 'Dans la lignée de',
    title: 'Des références qui éclairent notre démarche',
    intro:
      "Democracy Together s'inscrit dans une tradition d'institutions indépendantes au croisement de la recherche, de la démocratie et de la technologie. Sans affiliation : ces organisations inspirent notre exigence.",
    refs: [
      {
        name: 'International IDEA',
        body: 'Soutien aux institutions et processus démocratiques à l’échelle mondiale.',
      },
      {
        name: 'Carnegie Endowment',
        body: 'Recherche sur la paix internationale et les grandes transitions géopolitiques.',
      },
      {
        name: 'Center for Democracy & Technology',
        body: 'Défense des droits et libertés à l’ère numérique.',
      },
    ],
  },
  timeline: {
    eyebrow: 'Prochaines étapes',
    title: 'Repères du déploiement',
    intro:
      'Le calendrier ci-dessous fixe les grands jalons du réseau pour les mois à venir. Les dates précises seront confirmées au fil de la structuration.',
    steps: [
      {
        date: '2025',
        title: 'Constitution du collectif fondateur',
        body: 'Réunion des fondateurs, rédaction des statuts et définition des quatre axes de mission.',
      },
      {
        date: 'Début 2026',
        title: "Création de l'association",
        body: 'Dépôt des statuts en loi 1901, ouverture du siège parisien et des premières adhésions.',
      },
      {
        date: '2026',
        title: 'Lancement officiel et conférence inaugurale à Paris',
        body: 'Présentation publique du réseau, des premiers travaux et de la feuille de route Afrique-Europe.',
      },
      {
        date: 'À suivre',
        title: 'Ouverture progressive des bureaux régionaux',
        body: 'Mise en place des relais de Dakar et de Bruxelles, et premiers projets collaboratifs financés.',
      },
    ],
  },
  cta: {
    title: 'Rejoignez un réseau qui se construit',
    body: 'Think tank, chercheur, étudiant ou partenaire : il y a une place pour vous dans Democracy Together avant son lancement officiel.',
    primary: 'Rejoindre le réseau',
    secondary: 'Nous contacter',
  },
};

const en: AboutContent = {
  hero: {
    eyebrow: 'About',
    title: 'Connecting the think tanks that defend democracy',
    lead: 'Democracy Together is an international network of think tanks, from Africa and Europe, united to aggregate analyses, carry a shared voice and strengthen capacity in the service of democracy.',
  },
  vision: {
    eyebrow: 'Our vision',
    statement:
      'To become the world’s reference platform for advancing democratic thought, fostering an inclusive ecosystem where ideas flow between continents.',
    attribution: 'Democracy Together · Vision statement',
  },
  mission: {
    eyebrow: 'Our mission, in four pillars',
    axes: [
      {
        n: '01',
        title: 'Aggregate analyses',
        body: 'Bring together the analyses produced by member think tanks into a shared, comparable and citable corpus.',
      },
      {
        n: '02',
        title: 'Promote ideas',
        body: 'Circulate ideas through events, reports and institutional partnerships.',
      },
      {
        n: '03',
        title: 'Strengthen capacity',
        body: 'Support emerging think tanks and young researchers towards autonomy and methodological rigour.',
      },
      {
        n: '04',
        title: 'Innovate and include',
        body: 'Combine multidisciplinary perspectives with geographic, cultural and gender diversity.',
      },
    ],
  },
  founders: {
    eyebrow: 'Founders',
    title: 'The people who carry the network',
    intro:
      'A collective of scientists, diplomats and entrepreneurs gathered around a shared conviction. Some profiles will be completed as the network takes shape.',
    people: [
      {
        name: 'Abdou Samb',
        role: 'Engineer and mathematician',
        bio: 'President of A2S International in Paris and adviser to the European Commission on digital transformation. Named “African of the Year 2025” at the Mission Africa Awards, he founded the Abdou Samb Foundation, dedicated to pan-Africanism and the regeneration of Africa.',
      },
      {
        name: 'Philippe Kourilsky',
        role: 'Biologist, emeritus professor',
        bio: 'Emeritus professor at the Collège de France and member of the Académie des sciences. Former director of the Institut Pasteur and its international network, former president of the Singapore Immunology Network, author of more than 350 scientific publications.',
      },
      {
        name: 'Pierre Vimont',
        role: 'Diplomat',
        bio: 'Former executive secretary-general of the European External Action Service (EEAS) from 2010 to 2015 and former Ambassador of France to the United States. He is now a senior fellow at the Carnegie Endowment for International Peace.',
      },
      {
        name: 'Armelle Chapalain',
        role: 'Public relations',
        bio: 'Public relations specialist and director of ESPTA. Winner of the 2025 Prix du bien commun.',
      },
      {
        name: 'Michèle Boccoz',
        role: 'Founder',
        bio: 'Profile to be completed.',
      },
      {
        name: 'Marie-Laure Salles',
        role: 'Founder',
        bio: 'Profile to be completed.',
      },
    ],
  },
  governance: {
    eyebrow: 'Governance & structure',
    title: 'An organisation rolling out in stages',
    intro:
      'Democracy Together is a French non-profit (association loi 1901) headquartered in Paris. Its regional presence is being established progressively around three offices, each tied to a priority area of work.',
    hubs: [
      {
        city: 'Paris',
        scope: 'Headquarters',
        body: 'General coordination, European institutional partnerships and the organisation of the inaugural conference.',
      },
      {
        city: 'Dakar',
        scope: 'Africa',
        body: 'Continental anchor point, dedicated to African think tanks and to strengthening local capacity.',
      },
      {
        city: 'Brussels',
        scope: 'Europe',
        body: 'Interface with the institutions of the European Union and a relay of the network’s work to decision-makers.',
      },
    ],
    framework: {
      title: 'Non-profit framework',
      body: 'Established as a French non-profit (association loi 1901, currently being created), the structure rests on statutes open to membership by think tanks, researchers and partners who share its values. Governance separates strategic direction from operational management.',
    },
    committees: {
      title: 'Committees',
      items: [
        {
          n: '01',
          name: 'Scientific council',
          body: 'Guarantor of the rigour and independence of publications.',
        },
        {
          n: '02',
          name: 'Partnerships committee',
          body: 'Events, joint reports and institutional relations.',
        },
        {
          n: '03',
          name: 'Young talent unit',
          body: 'Mentorship, training and access to the network’s work.',
        },
      ],
    },
  },
  funding: {
    eyebrow: 'Funding & transparency',
    title: 'Where our resources come from',
    intro:
      'The network’s economic model combines several sources, chosen to preserve its editorial independence. None should be able to weigh on the direction of its work.',
    sources: [
      {
        name: 'Membership fees',
        body: 'Annual contributions from members and affiliated think tanks.',
      },
      {
        name: 'Philanthropic donations',
        body: 'Support from foundations and patrons committed to democracy.',
      },
      {
        name: 'Grants',
        body: 'Support from public institutions, including the European Union, for targeted projects.',
      },
      {
        name: 'CSR partnerships',
        body: 'Corporate commitments as part of their social responsibility.',
      },
      {
        name: 'Dedicated fund',
        body: 'An envelope reserved for collaborative projects led by several members.',
      },
    ],
    note: 'Democracy Together will publish its accounts and the breakdown of its resources from the first closed financial year. Any percentages shown in our materials are, at this stage, illustrative and will be updated once the association is effectively created.',
  },
  lineage: {
    eyebrow: 'In the tradition of',
    title: 'References that inform our approach',
    intro:
      'Democracy Together follows a tradition of independent institutions at the crossroads of research, democracy and technology. Without affiliation: these organisations inspire our standards.',
    refs: [
      {
        name: 'International IDEA',
        body: 'Support for democratic institutions and processes worldwide.',
      },
      {
        name: 'Carnegie Endowment',
        body: 'Research on international peace and major geopolitical transitions.',
      },
      {
        name: 'Center for Democracy & Technology',
        body: 'Defence of rights and freedoms in the digital age.',
      },
    ],
  },
  timeline: {
    eyebrow: 'Next steps',
    title: 'Roll-out milestones',
    intro:
      'The schedule below sets the network’s major milestones for the coming months. Exact dates will be confirmed as the structure takes shape.',
    steps: [
      {
        date: '2025',
        title: 'Forming the founding collective',
        body: 'Meeting of the founders, drafting of the statutes and definition of the four mission pillars.',
      },
      {
        date: 'Early 2026',
        title: 'Creating the association',
        body: 'Filing of the loi 1901 statutes, opening of the Paris headquarters and first memberships.',
      },
      {
        date: '2026',
        title: 'Official launch and inaugural conference in Paris',
        body: 'Public presentation of the network, its first work and the Africa–Europe roadmap.',
      },
      {
        date: 'To come',
        title: 'Progressive opening of regional offices',
        body: 'Setting up the Dakar and Brussels relays, and first funded collaborative projects.',
      },
    ],
  },
  cta: {
    title: 'Join a network in the making',
    body: 'Think tank, researcher, student or partner: there is a place for you in Democracy Together before its official launch.',
    primary: 'Join the network',
    secondary: 'Contact us',
  },
};

// Repli LOCAL pur (sans dépendance Sanity) : utilisé quand aucun document
// `aboutPage` n'est publié, et comme source de seed. Le fetch Sanity + fallback
// vit dans `src/lib/about.ts`. Garder ce module pur (les tests l'importent).
export function aboutFallback(locale: Locale): AboutContent {
  return locale === 'en' ? en : fr;
}

// Initiales pour les pastilles fondateurs (2 lettres).
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}
