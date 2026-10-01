// Content of the About page (F-11 vision/mission, F-12 founders &
// governance), ported 1:1 from the agency mock-up `design/rmdl-a-propos.html`.
// The page is served from this module, in the five languages: its texts are
// edited here, in the code. Keep this module pure (the tests import it).

import type { Locale } from '@/i18n/routing';

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
      "Un collectif de scientifiques, de diplomates et d'entrepreneurs réuni autour d'une conviction commune.",
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
        role: 'Diplomate, ancienne ambassadrice',
        bio: "Diplomate de carrière, ancienne élève de l'ENS et de l'ENA. Ambassadrice de France en Belgique, en Croatie puis aux Philippines, elle a été ambassadrice chargée de la lutte contre le VIH/sida et sous-directrice générale de l'Organisation mondiale de la santé de 2017 à 2020. Elle a auparavant dirigé les affaires internationales de l'Institut Pasteur.",
      },
      {
        name: 'Marie-Laure Salles',
        role: 'Sociologue des organisations',
        bio: "Directrice du Geneva Graduate Institute depuis 2020, première femme à la tête de l'institution depuis sa fondation en 1927. Docteure en sociologie de Harvard, elle a créé et dirigé l'École du management et de l'innovation de Sciences Po après avoir été doyenne du corps professoral de l'ESSEC. Ses travaux portent sur les transformations du capitalisme et la gouvernance transnationale.",
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
      'A collective of scientists, diplomats and entrepreneurs gathered around a shared conviction.',
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
        role: 'Diplomat, former ambassador',
        bio: 'Career diplomat and alumna of the ENS and the ENA. Ambassador of France to Belgium, Croatia and then the Philippines, she also served as France’s ambassador for the fight against HIV/AIDS and as Assistant Director-General of the World Health Organization from 2017 to 2020. She previously headed international affairs at the Institut Pasteur.',
      },
      {
        name: 'Marie-Laure Salles',
        role: 'Organisational sociologist',
        bio: 'Director of the Geneva Graduate Institute since 2020, the first woman to lead it since its founding in 1927. A Harvard PhD in sociology, she founded and led the Sciences Po School of Management and Innovation after serving as Dean of the Faculty at ESSEC. Her research focuses on the transformations of capitalism and transnational governance.',
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

const es: AboutContent = {
  hero: {
    eyebrow: 'Sobre nosotros',
    title: 'Conectar a los centros de estudios que defienden la democracia',
    lead: 'Democracy Together es una red internacional de centros de estudios, de África y de Europa, unida para agregar análisis, defender una voz común y reforzar capacidades al servicio de la democracia.',
  },
  vision: {
    eyebrow: 'Nuestra visión',
    statement:
      'Convertirnos en la plataforma de referencia mundial para el avance del pensamiento democrático, impulsando un ecosistema inclusivo en el que las ideas circulen entre los continentes.',
    attribution: 'Democracy Together · Declaración de visión',
  },
  mission: {
    eyebrow: 'Nuestra misión, en cuatro ejes',
    axes: [
      {
        n: '01',
        title: 'Agregar las reflexiones',
        body: 'Reunir los análisis producidos por los centros miembros en un corpus común, comparable y citable.',
      },
      {
        n: '02',
        title: 'Promover las ideas',
        body: 'Hacer circular las ideas mediante eventos, informes y alianzas institucionales.',
      },
      {
        n: '03',
        title: 'Reforzar capacidades',
        body: 'Acompañar a los centros emergentes y a los jóvenes investigadores hacia la autonomía y el rigor metodológico.',
      },
      {
        n: '04',
        title: 'Innovar e incluir',
        body: 'Cruzar perspectivas multidisciplinares y la diversidad geográfica, cultural y de género.',
      },
    ],
  },
  founders: {
    eyebrow: 'Fundadores',
    title: 'Quienes sostienen la red',
    intro:
      'Un colectivo de científicos, diplomáticos y emprendedores reunido en torno a una convicción común.',
    people: [
      {
        name: 'Abdou Samb',
        role: 'Ingeniero y matemático',
        bio: 'Presidente de A2S International en París y asesor de la Comisión Europea en materia de transformación digital. Nombrado «Africano del año 2025» en los Mission Africa Awards, fundó la Abdou Samb Foundation, dedicada al panafricanismo y a la regeneración de África.',
      },
      {
        name: 'Philippe Kourilsky',
        role: 'Biólogo, catedrático emérito',
        bio: 'Catedrático emérito del Collège de France y miembro de la Academia de Ciencias. Antiguo director del Instituto Pasteur y de su Red Internacional, antiguo presidente de la Singapore Immunology Network, autor de más de 350 publicaciones científicas.',
      },
      {
        name: 'Pierre Vimont',
        role: 'Diplomático',
        bio: 'Antiguo secretario general ejecutivo del Servicio Europeo de Acción Exterior (SEAE) de 2010 a 2015 y antiguo embajador de Francia en Estados Unidos. Hoy es senior fellow del Carnegie Endowment for International Peace.',
      },
      {
        name: 'Armelle Chapalain',
        role: 'Relaciones públicas',
        bio: 'Especialista en relaciones públicas y directora de la ESPTA. Galardonada con el Premio del Bien Común 2025.',
      },
      {
        name: 'Michèle Boccoz',
        role: 'Diplomática, antigua embajadora',
        bio: 'Diplomática de carrera, antigua alumna de la ENS y de la ENA. Embajadora de Francia en Bélgica, en Croacia y después en Filipinas, fue también embajadora encargada de la lucha contra el VIH/sida y subdirectora general de la Organización Mundial de la Salud de 2017 a 2020. Anteriormente dirigió los asuntos internacionales del Instituto Pasteur.',
      },
      {
        name: 'Marie-Laure Salles',
        role: 'Socióloga de las organizaciones',
        bio: 'Directora del Geneva Graduate Institute desde 2020, primera mujer al frente de la institución desde su fundación en 1927. Doctora en sociología por Harvard, creó y dirigió la Escuela de Management e Innovación de Sciences Po tras haber sido decana del profesorado de la ESSEC. Sus trabajos se centran en las transformaciones del capitalismo y la gobernanza transnacional.',
      },
    ],
  },
  governance: {
    eyebrow: 'Gobernanza y estructura',
    title: 'Una organización que se despliega por etapas',
    intro:
      'Democracy Together es una asociación francesa de tipo loi 1901 con sede en París. Su anclaje regional se establece progresivamente en torno a tres oficinas, cada una vinculada a un área de trabajo prioritaria.',
    hubs: [
      {
        city: 'París',
        scope: 'Sede',
        body: 'Coordinación general, alianzas institucionales europeas y organización de la conferencia inaugural.',
      },
      {
        city: 'Dakar',
        scope: 'África',
        body: 'Punto de anclaje continental, dedicado a los centros de estudios africanos y al refuerzo de capacidades locales.',
      },
      {
        city: 'Bruselas',
        scope: 'Europa',
        body: 'Interfaz con las instituciones de la Unión Europea y difusión de los trabajos de la red entre quienes deciden.',
      },
    ],
    framework: {
      title: 'Marco asociativo',
      body: 'Constituida como asociación de tipo loi 1901 (en proceso de creación), la estructura se apoya en unos estatutos abiertos a la adhesión de centros de estudios, investigadores y socios que comparten sus valores. La gobernanza distingue la orientación estratégica de la coordinación operativa.',
    },
    committees: {
      title: 'Comités',
      items: [
        {
          n: '01',
          name: 'Consejo científico',
          body: 'Garante del rigor y de la independencia de las publicaciones.',
        },
        {
          n: '02',
          name: 'Comité de alianzas',
          body: 'Eventos, informes conjuntos y relaciones institucionales.',
        },
        {
          n: '03',
          name: 'Unidad de jóvenes talentos',
          body: 'Mentoría, formación y acceso a los trabajos de la red.',
        },
      ],
    },
  },
  funding: {
    eyebrow: 'Financiación y transparencia',
    title: 'De dónde vienen nuestros medios',
    intro:
      'El modelo económico de la red combina varias fuentes, elegidas para preservar su independencia editorial. Ninguna debe poder influir en la orientación de los trabajos.',
    sources: [
      {
        name: 'Cuotas',
        body: 'Aportaciones anuales de los miembros y de los centros de estudios afiliados a la red.',
      },
      {
        name: 'Donaciones filantrópicas',
        body: 'Apoyos de fundaciones y mecenas comprometidos con la democracia.',
      },
      {
        name: 'Subvenciones',
        body: 'Apoyos de instituciones públicas, entre ellas la Unión Europea, sobre proyectos concretos.',
      },
      {
        name: 'Alianzas de RSC',
        body: 'Compromisos de empresas en el marco de su responsabilidad social corporativa.',
      },
      {
        name: 'Fondo específico',
        body: 'Partida reservada a los proyectos colaborativos impulsados por varios miembros.',
      },
    ],
    note: 'Democracy Together publicará sus cuentas y el reparto de sus recursos desde el primer ejercicio cerrado. Los porcentajes presentados en nuestros materiales son, en esta fase, datos de ilustración y se actualizarán cuando la asociación se constituya efectivamente.',
  },
  lineage: {
    eyebrow: 'En la estela de',
    title: 'Referencias que iluminan nuestro enfoque',
    intro:
      'Democracy Together se inscribe en una tradición de instituciones independientes situadas en el cruce de la investigación, la democracia y la tecnología. Sin afiliación: estas organizaciones inspiran nuestra exigencia.',
    refs: [
      {
        name: 'International IDEA',
        body: 'Apoyo a las instituciones y a los procesos democráticos a escala mundial.',
      },
      {
        name: 'Carnegie Endowment',
        body: 'Investigación sobre la paz internacional y las grandes transiciones geopolíticas.',
      },
      {
        name: 'Center for Democracy & Technology',
        body: 'Defensa de los derechos y las libertades en la era digital.',
      },
    ],
  },
  timeline: {
    eyebrow: 'Próximas etapas',
    title: 'Hitos del despliegue',
    intro:
      'El calendario siguiente fija los grandes hitos de la red para los próximos meses. Las fechas precisas se confirmarán a medida que avance la estructuración.',
    steps: [
      {
        date: '2025',
        title: 'Constitución del colectivo fundador',
        body: 'Reunión de los fundadores, redacción de los estatutos y definición de los cuatro ejes de misión.',
      },
      {
        date: 'Principios de 2026',
        title: 'Creación de la asociación',
        body: 'Depósito de los estatutos conforme a la loi 1901, apertura de la sede parisina y de las primeras adhesiones.',
      },
      {
        date: '2026',
        title: 'Lanzamiento oficial y conferencia inaugural en París',
        body: 'Presentación pública de la red, de los primeros trabajos y de la hoja de ruta África-Europa.',
      },
      {
        date: 'Por confirmar',
        title: 'Apertura progresiva de las oficinas regionales',
        body: 'Puesta en marcha de las delegaciones de Dakar y Bruselas, y primeros proyectos colaborativos financiados.',
      },
    ],
  },
  cta: {
    title: 'Únase a una red que se está construyendo',
    body: 'Centro de estudios, investigador, estudiante o socio: hay un lugar para usted en Democracy Together antes de su lanzamiento oficial.',
    primary: 'Unirme a la red',
    secondary: 'Contactar con nosotros',
  },
};
const pt: AboutContent = {
  hero: {
    eyebrow: 'Sobre nós',
    title: 'Ligar os centros de estudos que defendem a democracia',
    lead: 'A Democracy Together é uma rede internacional de centros de estudos, de África e da Europa, reunida para agregar análises, defender uma voz comum e reforçar capacidades ao serviço da democracia.',
  },
  vision: {
    eyebrow: 'A nossa visão',
    statement:
      'Tornar-nos a plataforma de referência mundial para o avanço do pensamento democrático, promovendo um ecossistema inclusivo onde as ideias circulem entre os continentes.',
    attribution: 'Democracy Together · Declaração de visão',
  },
  mission: {
    eyebrow: 'A nossa missão, em quatro eixos',
    axes: [
      {
        n: '01',
        title: 'Agregar as reflexões',
        body: 'Reunir as análises produzidas pelos centros membros num corpus comum, comparável e citável.',
      },
      {
        n: '02',
        title: 'Promover as ideias',
        body: 'Fazer circular as ideias através de eventos, relatórios e parcerias institucionais.',
      },
      {
        n: '03',
        title: 'Reforçar capacidades',
        body: 'Acompanhar os centros emergentes e os jovens investigadores rumo à autonomia e ao rigor metodológico.',
      },
      {
        n: '04',
        title: 'Inovar e incluir',
        body: 'Cruzar perspetivas multidisciplinares e a diversidade geográfica, cultural e de género.',
      },
    ],
  },
  founders: {
    eyebrow: 'Fundadores',
    title: 'Quem sustenta a rede',
    intro:
      'Um coletivo de cientistas, diplomatas e empreendedores reunido em torno de uma convicção comum.',
    people: [
      {
        name: 'Abdou Samb',
        role: 'Engenheiro e matemático',
        bio: 'Presidente da A2S International em Paris e consultor da Comissão Europeia em matéria de transformação digital. Nomeado «Africano do ano 2025» nos Mission Africa Awards, fundou a Abdou Samb Foundation, dedicada ao pan-africanismo e à regeneração de África.',
      },
      {
        name: 'Philippe Kourilsky',
        role: 'Biólogo, professor emérito',
        bio: 'Professor emérito do Collège de France e membro da Academia das Ciências. Antigo diretor do Instituto Pasteur e da sua Rede Internacional, antigo presidente da Singapore Immunology Network, autor de mais de 350 publicações científicas.',
      },
      {
        name: 'Pierre Vimont',
        role: 'Diplomata',
        bio: 'Antigo secretário-geral executivo do Serviço Europeu para a Ação Externa (SEAE) de 2010 a 2015 e antigo embaixador de França nos Estados Unidos. É hoje senior fellow do Carnegie Endowment for International Peace.',
      },
      {
        name: 'Armelle Chapalain',
        role: 'Relações públicas',
        bio: 'Especialista em relações públicas e diretora da ESPTA. Distinguida com o Prémio do Bem Comum 2025.',
      },
      {
        name: 'Michèle Boccoz',
        role: 'Diplomata, antiga embaixadora',
        bio: 'Diplomata de carreira, antiga aluna da ENS e da ENA. Embaixadora de França na Bélgica, na Croácia e depois nas Filipinas, foi também embaixadora encarregada da luta contra o VIH/sida e subdiretora-geral da Organização Mundial da Saúde de 2017 a 2020. Anteriormente, dirigiu os assuntos internacionais do Instituto Pasteur.',
      },
      {
        name: 'Marie-Laure Salles',
        role: 'Socióloga das organizações',
        bio: 'Diretora do Geneva Graduate Institute desde 2020, é a primeira mulher à frente da instituição desde a sua fundação, em 1927. Doutorada em sociologia por Harvard, criou e dirigiu a Escola de Gestão e Inovação da Sciences Po, depois de ter sido decana do corpo docente da ESSEC. Os seus trabalhos incidem sobre as transformações do capitalismo e a governação transnacional.',
      },
    ],
  },
  governance: {
    eyebrow: 'Governação e estrutura',
    title: 'Uma organização que se desenvolve por etapas',
    intro:
      'A Democracy Together é uma associação francesa do tipo loi 1901 com sede em Paris. A sua ancoragem regional estabelece-se progressivamente em torno de três escritórios, cada um ligado a uma área de trabalho prioritária.',
    hubs: [
      {
        city: 'Paris',
        scope: 'Sede',
        body: 'Coordenação geral, parcerias institucionais europeias e organização da conferência inaugural.',
      },
      {
        city: 'Dakar',
        scope: 'África',
        body: 'Ponto de ancoragem continental, dedicado aos centros de estudos africanos e ao reforço de capacidades locais.',
      },
      {
        city: 'Bruxelas',
        scope: 'Europa',
        body: 'Interface com as instituições da União Europeia e difusão dos trabalhos da rede junto de quem decide.',
      },
    ],
    framework: {
      title: 'Quadro associativo',
      body: 'Constituída como associação do tipo loi 1901 (em processo de criação), a estrutura assenta em estatutos abertos à adesão de centros de estudos, investigadores e parceiros que partilham os seus valores. A governação distingue a orientação estratégica da coordenação operacional.',
    },
    committees: {
      title: 'Comités',
      items: [
        {
          n: '01',
          name: 'Conselho científico',
          body: 'Garante do rigor e da independência das publicações.',
        },
        {
          n: '02',
          name: 'Comité de parcerias',
          body: 'Eventos, relatórios conjuntos e relações institucionais.',
        },
        {
          n: '03',
          name: 'Núcleo de jovens talentos',
          body: 'Mentoria, formação e acesso aos trabalhos da rede.',
        },
      ],
    },
  },
  funding: {
    eyebrow: 'Financiamento e transparência',
    title: 'De onde vêm os nossos meios',
    intro:
      'O modelo económico da rede combina várias fontes, escolhidas para preservar a sua independência editorial. Nenhuma delas deve poder pesar na orientação dos trabalhos.',
    sources: [
      {
        name: 'Quotas',
        body: 'Contribuições anuais dos membros e dos centros de estudos filiados na rede.',
      },
      {
        name: 'Donativos filantrópicos',
        body: 'Apoios de fundações e mecenas empenhados na democracia.',
      },
      {
        name: 'Subvenções',
        body: 'Apoios de instituições públicas, entre as quais a União Europeia, em projetos específicos.',
      },
      {
        name: 'Parcerias de RSE',
        body: 'Compromissos de empresas no âmbito da sua responsabilidade social.',
      },
      {
        name: 'Fundo dedicado',
        body: 'Verba reservada aos projetos colaborativos promovidos por vários membros.',
      },
    ],
    note: 'A Democracy Together publicará as suas contas e a repartição dos seus recursos logo a partir do primeiro exercício encerrado. As percentagens apresentadas nos nossos materiais são, nesta fase, dados de ilustração e serão atualizadas aquando da criação efetiva da associação.',
  },
  lineage: {
    eyebrow: 'Na linhagem de',
    title: 'Referências que iluminam a nossa abordagem',
    intro:
      'A Democracy Together inscreve-se numa tradição de instituições independentes no cruzamento da investigação, da democracia e da tecnologia. Sem filiação: estas organizações inspiram a nossa exigência.',
    refs: [
      {
        name: 'International IDEA',
        body: 'Apoio às instituições e aos processos democráticos à escala mundial.',
      },
      {
        name: 'Carnegie Endowment',
        body: 'Investigação sobre a paz internacional e as grandes transições geopolíticas.',
      },
      {
        name: 'Center for Democracy & Technology',
        body: 'Defesa dos direitos e das liberdades na era digital.',
      },
    ],
  },
  timeline: {
    eyebrow: 'Próximas etapas',
    title: 'Marcos do desenvolvimento',
    intro:
      'O calendário seguinte fixa os grandes marcos da rede para os próximos meses. As datas precisas serão confirmadas à medida que a estruturação avançar.',
    steps: [
      {
        date: '2025',
        title: 'Constituição do coletivo fundador',
        body: 'Reunião dos fundadores, redação dos estatutos e definição dos quatro eixos de missão.',
      },
      {
        date: 'Início de 2026',
        title: 'Criação da associação',
        body: 'Depósito dos estatutos ao abrigo da loi 1901, abertura da sede parisiense e das primeiras adesões.',
      },
      {
        date: '2026',
        title: 'Lançamento oficial e conferência inaugural em Paris',
        body: 'Apresentação pública da rede, dos primeiros trabalhos e do roteiro África-Europa.',
      },
      {
        date: 'A confirmar',
        title: 'Abertura progressiva dos escritórios regionais',
        body: 'Instalação das delegações de Dakar e de Bruxelas, e primeiros projetos colaborativos financiados.',
      },
    ],
  },
  cta: {
    title: 'Junte-se a uma rede que está a construir-se',
    body: 'Centro de estudos, investigador, estudante ou parceiro: há um lugar para si na Democracy Together antes do seu lançamento oficial.',
    primary: 'Juntar-me à rede',
    secondary: 'Contactar-nos',
  },
};
const ar: AboutContent = {
  hero: {
    eyebrow: 'من نحن',
    title: 'الربط بين مراكز الدراسات المدافعة عن الديمقراطية',
    lead: 'Democracy Together شبكة دولية من مراكز الدراسات، من أفريقيا وأوروبا، اجتمعت لتجميع التحليلات، وحمل صوت مشترك، وتعزيز القدرات في خدمة الديمقراطية.',
  },
  vision: {
    eyebrow: 'رؤيتنا',
    statement:
      'أن نصير المنصة المرجعية عالمياً للنهوض بالفكر الديمقراطي، عبر إرساء منظومة دامجة تنتقل فيها الأفكار بين القارات.',
    attribution: 'Democracy Together · بيان الرؤية',
  },
  mission: {
    eyebrow: 'رسالتنا في أربعة محاور',
    axes: [
      {
        n: '01',
        title: 'تجميع الأعمال الفكرية',
        body: 'جمع التحليلات التي تنتجها مراكز الدراسات الأعضاء في متن مشترك قابل للمقارنة وللاستشهاد.',
      },
      {
        n: '02',
        title: 'نشر الأفكار',
        body: 'تعميم الأفكار عبر الفعاليات والتقارير والشراكات المؤسسية.',
      },
      {
        n: '03',
        title: 'تعزيز القدرات',
        body: 'مرافقة مراكز الدراسات الناشئة والباحثين الشباب نحو الاستقلالية والدقة المنهجية.',
      },
      {
        n: '04',
        title: 'الابتكار والإدماج',
        body: 'تقاطع المقاربات المتعددة التخصصات مع التنوع الجغرافي والثقافي والنوعي.',
      },
    ],
  },
  founders: {
    eyebrow: 'المؤسسون',
    title: 'من يحملون الشبكة',
    intro: 'مجموعة من العلماء والدبلوماسيين ورواد الأعمال تجمعهم قناعة مشتركة.',
    people: [
      {
        name: 'عبدو سامب',
        role: 'مهندس ورياضياتي',
        bio: 'رئيس A2S International بباريس ومستشار لدى المفوضية الأوروبية في مجال التحول الرقمي. اختير «الأفريقي لسنة 2025» في جوائز Mission Africa، وأسّس مؤسسة عبدو سامب المكرَّسة للفكر الوحدوي الأفريقي ولنهضة أفريقيا.',
      },
      {
        name: 'فيليب كوريلسكي',
        role: 'عالم أحياء وأستاذ فخري',
        bio: 'أستاذ فخري في الكوليج دو فرانس وعضو أكاديمية العلوم. مدير سابق لمعهد باستور ولشبكته الدولية، ورئيس سابق لشبكة سنغافورة للمناعة، ومؤلف أكثر من 350 منشوراً علمياً.',
      },
      {
        name: 'بيير فيمون',
        role: 'دبلوماسي',
        bio: 'أمين عام تنفيذي سابق للدائرة الأوروبية للشؤون الخارجية (SEAE) بين 2010 و2015، وسفير سابق لفرنسا بالولايات المتحدة. وهو اليوم زميل أول في مؤسسة كارنيغي للسلام الدولي.',
      },
      {
        name: 'أرمِل شابالان',
        role: 'العلاقات العامة',
        bio: 'مختصة في العلاقات العامة ومديرة ESPTA. حائزة جائزة الصالح العام لسنة 2025.',
      },
      {
        name: 'ميشيل بوكوز',
        role: 'دبلوماسية وسفيرة سابقة',
        bio: 'دبلوماسية محترفة، خريجة دار المعلمين العليا (ENS) والمدرسة الوطنية للإدارة (ENA). سفيرة سابقة لفرنسا ببلجيكا ثم بكرواتيا ثم بالفلبين، وشغلت منصب السفيرة المكلفة بمكافحة فيروس نقص المناعة البشرية/الإيدز، ثم منصب المديرة العامة المساعدة لمنظمة الصحة العالمية بين 2017 و2020. وقبل ذلك أدارت الشؤون الدولية في معهد باستور.',
      },
      {
        name: 'ماري-لور سال',
        role: 'عالمة اجتماع المنظمات',
        bio: 'مديرة معهد جنيف للدراسات العليا (Geneva Graduate Institute) منذ 2020، وأول امرأة تتولى إدارته منذ تأسيسه سنة 1927. حاصلة على الدكتوراه في علم الاجتماع من جامعة هارفارد، أسّست مدرسة الإدارة والابتكار في Sciences Po وأدارتها، بعد أن شغلت منصب عميدة هيئة التدريس في ESSEC. تتناول أبحاثها تحولات الرأسمالية والحوكمة العابرة للحدود.',
      },
    ],
  },
  governance: {
    eyebrow: 'الحوكمة والهيكلة',
    title: 'تنظيم ينتشر على مراحل',
    intro:
      'Democracy Together جمعية خاضعة للقانون الفرنسي لسنة 1901 ومقرها بباريس. ويترسّخ حضورها الجهوي تدريجياً حول ثلاثة مكاتب، يرتبط كل منها بمجال عمل ذي أولوية.',
    hubs: [
      {
        city: 'باريس',
        scope: 'المقر',
        body: 'التنسيق العام، والشراكات المؤسسية الأوروبية، وتنظيم المؤتمر التأسيسي.',
      },
      {
        city: 'داكار',
        scope: 'أفريقيا',
        body: 'نقطة الارتكاز القارية، المخصصة لمراكز الدراسات الأفريقية ولتعزيز القدرات المحلية.',
      },
      {
        city: 'بروكسل',
        scope: 'أوروبا',
        body: 'واجهة التواصل مع مؤسسات الاتحاد الأوروبي وقناة إيصال أعمال الشبكة إلى صانعي القرار.',
      },
    ],
    framework: {
      title: 'الإطار الجمعوي',
      body: 'تأسست في شكل جمعية خاضعة لقانون 1901 (قيد الإحداث)، ويقوم الهيكل على نظام أساسي مفتوح لانضمام مراكز الدراسات والباحثين والشركاء الذين يتقاسمون قيمه. وتفصل الحوكمة بين التوجيه الاستراتيجي والتنسيق التنفيذي.',
    },
    committees: {
      title: 'اللجان',
      items: [
        {
          n: '01',
          name: 'المجلس العلمي',
          body: 'ضامن دقة المنشورات واستقلاليتها.',
        },
        {
          n: '02',
          name: 'لجنة الشراكات',
          body: 'الفعاليات والتقارير المشتركة والعلاقات المؤسسية.',
        },
        {
          n: '03',
          name: 'خلية المواهب الشابة',
          body: 'التوجيه والتكوين والنفاذ إلى أعمال الشبكة.',
        },
      ],
    },
  },
  funding: {
    eyebrow: 'التمويل والشفافية',
    title: 'من أين تأتي مواردنا',
    intro:
      'يجمع النموذج الاقتصادي للشبكة بين عدة مصادر اختيرت للحفاظ على استقلالها التحريري. ولا ينبغي لأي منها أن تؤثر في توجيه الأعمال.',
    sources: [
      {
        name: 'الاشتراكات',
        body: 'المساهمات السنوية للأعضاء ولمراكز الدراسات المنتسبة إلى الشبكة.',
      },
      {
        name: 'التبرعات الخيرية',
        body: 'دعم مؤسسات مانحة وداعمين منخرطين في قضية الديمقراطية.',
      },
      {
        name: 'المنح العمومية',
        body: 'دعم مؤسسات عمومية، من بينها الاتحاد الأوروبي، لمشاريع محددة.',
      },
      {
        name: 'شراكات المسؤولية المجتمعية',
        body: 'التزامات مقاولات في إطار مسؤوليتها المجتمعية.',
      },
      {
        name: 'صندوق مخصص',
        body: 'اعتماد مالي مرصود للمشاريع التعاونية التي يحملها عدة أعضاء.',
      },
    ],
    note: 'ستنشر Democracy Together حساباتها وتوزيع مواردها ابتداءً من أول سنة محاسبية مختتمة. أما النسب المئوية الواردة في موادنا فهي في هذه المرحلة بيانات توضيحية، وستُحدَّث عند الإحداث الفعلي للجمعية.',
  },
  lineage: {
    eyebrow: 'على خطى',
    title: 'مرجعيات تنير مقاربتنا',
    intro:
      'تندرج Democracy Together في تقليد مؤسسات مستقلة تقف عند تقاطع البحث والديمقراطية والتكنولوجيا. ودون أي انتساب إليها: هذه المنظمات تُلهم مستوى المتطلبات الذي نلتزم به.',
    refs: [
      {
        name: 'International IDEA',
        body: 'دعم المؤسسات والمسارات الديمقراطية على الصعيد العالمي.',
      },
      {
        name: 'Carnegie Endowment',
        body: 'البحث في السلم الدولي وفي التحولات الجيوسياسية الكبرى.',
      },
      {
        name: 'Center for Democracy & Technology',
        body: 'الدفاع عن الحقوق والحريات في العصر الرقمي.',
      },
    ],
  },
  timeline: {
    eyebrow: 'المراحل المقبلة',
    title: 'معالم الانتشار',
    intro:
      'يحدّد الجدول الزمني التالي المحطات الكبرى للشبكة في الأشهر المقبلة. وستُؤكَّد التواريخ الدقيقة تباعاً مع تقدّم الهيكلة.',
    steps: [
      {
        date: '2025',
        title: 'تشكيل المجموعة المؤسِّسة',
        body: 'اجتماع المؤسسين، وصياغة النظام الأساسي، وتحديد محاور الرسالة الأربعة.',
      },
      {
        date: 'مطلع 2026',
        title: 'إحداث الجمعية',
        body: 'إيداع النظام الأساسي وفق قانون 1901، وفتح المقر بباريس وأولى العضويات.',
      },
      {
        date: '2026',
        title: 'الإطلاق الرسمي والمؤتمر التأسيسي بباريس',
        body: 'التقديم العلني للشبكة ولأولى أعمالها ولخارطة الطريق بين أفريقيا وأوروبا.',
      },
      {
        date: 'لاحقاً',
        title: 'الفتح التدريجي للمكاتب الجهوية',
        body: 'إرساء فرعَي داكار وبروكسل، وانطلاق أولى المشاريع التعاونية الممولة.',
      },
    ],
  },
  cta: {
    title: 'انضموا إلى شبكة قيد البناء',
    body: 'مركز دراسات أو باحث أو طالب أو شريك: لكم مكان في Democracy Together قبل إطلاقها الرسمي.',
    primary: 'الانضمام إلى الشبكة',
    secondary: 'اتصلوا بنا',
  },
};

// Exhaustive table by construction (see `projects-content.ts`).
const BY_LOCALE: Record<Locale, AboutContent> = { fr, en, es, pt, ar };

export function getAboutContent(locale: Locale): AboutContent {
  return BY_LOCALE[locale];
}

// Initials for the founder badges (2 letters).
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}
