// Contenu de l'accueil (F-10), porté fidèlement depuis la maquette agence
// `design/rmdl-accueil.html` (8 sections). Couche de contenu bilingue, prête à
// basculer vers Sanity (mêmes formes de retour).

import type { Locale } from '@/i18n/routing';

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
const es: HomeContent = {
  hero: {
    eyebrow: 'Democracy Together',
    title: 'La democracia necesita una red.',
    lead: 'Democracy Together conecta a los centros de estudios de África y de Europa para producir, compartir y defender el pensamiento democrático.',
    ctaPrimary: 'Unirme a la red',
    ctaSecondary: 'Leer los análisis',
    visualLabel: 'Ciudadanos reunidos en un foro de debate',
    visualCaption:
      'Imagen de ilustración. En producción: fotografía documental, digna y diversa.',
    creds: [
      { label: 'Estatuto', value: 'Asociación loi 1901, sede en París' },
      { label: 'Oficinas', value: 'París, Dakar, Bruselas' },
      {
        label: 'Fundada por',
        value: 'Abdou Samb, Philippe Kourilsky, Pierre Vimont',
      },
    ],
  },
  mission: {
    title: 'Agregar las ideas, movilizar al relevo, pesar en las decisiones',
    cta: 'Nuestra misión',
    cells: [
      {
        ix: '01 Agregación',
        title: 'Reunir la investigación democrática en un solo lugar',
        body: 'Recoger, sintetizar y difundir los análisis de los centros miembros sobre gobernanza digital, participación ciudadana, lucha contra la corrupción y transiciones democráticas.',
      },
      {
        ix: '02 Promoción',
        title: 'Llevar las ideas al debate',
        body: 'Cumbre mundial en París, seminarios web y talleres regionales, alianzas con responsables públicos, ONG e instituciones académicas.',
      },
      {
        ix: '03 Capacidades',
        title: 'Apoyar al relevo',
        body: 'Mentoría y formación para los centros de estudios emergentes y los jóvenes contribuidores.',
      },
      {
        ix: '04 Inclusión',
        title: 'Diversidad real',
        body: 'Perspectivas multidisciplinares y diversidad geográfica, cultural y de género.',
      },
    ],
    barometer: {
      label: 'El Barómetro',
      title: 'Un índice África-Europa para medir la democracia',
      body: 'Nuestro activo diferencial: datos abiertos y citables que alimentan el informe anual sobre el estado de la democracia.',
    },
  },
  analyses: {
    title: 'Últimos análisis',
    cta: 'Toda la biblioteca',
    featured: {
      tag: 'Informe anual · 88 páginas · FR / EN',
      title: 'El estado de la democracia entre África y Europa',
      body: 'Una lectura cruzada de las trayectorias democráticas de dos continentes cuyos destinos están ligados, basada en las contribuciones de treinta y ocho centros de estudios miembros.',
      chips: ['Transiciones democráticas', 'Datos abiertos'],
    },
    items: [
      {
        tag: 'Policy brief · Gobernanza digital',
        title: 'Regular las plataformas sin debilitar el debate público',
        body: 'Cuatro recomendaciones para los reguladores europeos y de África Occidental.',
      },
      {
        tag: 'Nota de síntesis · Lucha contra la corrupción',
        title:
          'Seguir el dinero: transparencia presupuestaria y confianza cívica',
        body: 'Lo que la contratación pública abierta cambia en la rendición de cuentas.',
      },
      {
        tag: 'Working paper · Participación ciudadana',
        title: 'La juventud como fuerza democrática, no como objetivo',
        body: 'Siete dispositivos de participación puestos a prueba en Dakar y Bruselas.',
      },
    ],
  },
  barometre: {
    eyebrow: 'Datos abiertos',
    title: 'El Barómetro de la democracia',
    body: 'Un índice compuesto África-Europa, una metodología publicada, conjuntos de datos citables. Datos de ilustración.',
    countries: [
      { name: 'Bélgica', score: '0.86' },
      { name: 'Francia', score: '0.83' },
      { name: 'Senegal', score: '0.71' },
      { name: 'Ghana', score: '0.68' },
      { name: 'Túnez', score: '0.49' },
    ],
    legend: [
      'Libre',
      'Bastante libre',
      'Parcialmente',
      'Poco libre',
      'No libre',
    ],
    note: 'Pase el cursor sobre un país. Datos de ilustración.',
    mapLabel: 'Mapa interactivo (demostración)',
    links: ['Explorar las fichas por país', 'Descargar los datos'],
  },
  axes: {
    title: 'Cinco ejes de trabajo',
    items: [
      {
        n: '01',
        title: 'Gobernanza digital',
        body: 'Plataformas, desinformación, libertades en línea y regulación democrática de lo digital.',
      },
      {
        n: '02',
        title: 'Participación ciudadana',
        body: 'Compromiso, deliberación y confianza en las instituciones democráticas.',
      },
      {
        n: '03',
        title: 'Lucha contra la corrupción',
        body: 'Transparencia presupuestaria, integridad pública y rendición de cuentas.',
      },
      {
        n: '04',
        title: 'Transiciones democráticas',
        body: 'Salida del autoritarismo, alternancias y resiliencia de las transiciones.',
      },
      {
        n: '05',
        title: 'Crisis globales y democracia',
        body: 'Clima, seguridad y migraciones: el impacto de las crisis en la gobernanza.',
      },
    ],
  },
  events: {
    title: 'Eventos',
    cta: 'Toda la agenda',
    featured: {
      tag: 'Cumbre inaugural · París',
      title: 'Conferencia inaugural de Democracy Together',
      body: 'Una jornada de plenarios y talleres para lanzar la red y sus primeros trabajos conjuntos.',
      action: 'Inscribirse',
    },
    items: [
      {
        date: '03 dic',
        kind: 'Seminario web',
        title: 'Desinformación electoral: defender la votación',
        meta: 'En línea · FR / EN',
      },
      {
        date: '22 ene',
        kind: 'Taller regional · Dakar',
        title: 'Financiar la sociedad civil en África Occidental',
        meta: 'Presencial · Francés',
      },
      {
        date: '14 feb',
        kind: 'Taller regional · Bruselas',
        title: 'Lo digital al servicio de la deliberación',
        meta: 'Híbrido · FR / EN',
      },
    ],
  },
  youth: {
    eyebrow: 'Hub joven',
    title: '¿Tienes menos de 35 años e ideas para la democracia?',
    body: 'Un espacio pensado para ti: un itinerario progresivo para aprender, contribuir y contar con el acompañamiento de mentores de la red.',
    cta: 'Unirme al hub joven',
    steps: [
      {
        n: '01',
        title: 'Descubrir',
        body: 'Entender los retos con formatos breves y accesibles.',
      },
      {
        n: '02',
        title: 'Aprender',
        body: 'Caja de herramientas, seminarios web y módulos de refuerzo de capacidades.',
      },
      {
        n: '03',
        title: 'Contribuir',
        body: 'Publicar una tribuna, unirte a un grupo de trabajo, solicitar una beca.',
      },
      {
        n: '04',
        title: 'Mentorizar',
        body: 'Ser puesto en contacto con un mentor experimentado de la red.',
      },
    ],
  },
  join: {
    title: 'Unirse a la red',
    body: 'Tres formas de formar parte. La cuota es solidaria y se ajusta según el país.',
    plans: [
      {
        label: 'Organización',
        title: 'Centro de estudios miembro',
        features: [
          'Perfil de organización y publicaciones',
          'Acceso a los proyectos y al fondo colaborativo',
          'Voz en la gobernanza de la red',
        ],
        cta: 'Presentar candidatura',
      },
      {
        label: 'Persona',
        title: 'Miembro individual',
        features: [
          'Perfil de experto en el directorio',
          'Espacios colaborativos y eventos',
          'Carta de análisis reservada',
        ],
        cta: 'Adherirse',
      },
      {
        label: 'Menores de 35 años',
        title: 'Joven contribuidor',
        features: [
          'Acceso al hub joven',
          'Mentoría y becas',
          'Publicación acompañada',
        ],
        cta: 'Unirse a nosotros',
      },
    ],
  },
  newsletter: {
    title: 'La carta de análisis',
    body: 'Los trabajos de la red y el debate democrático, dos veces al mes.',
    cta: 'Suscribirse',
    placeholder: 'Su correo electrónico',
  },
};
const pt: HomeContent = {
  hero: {
    eyebrow: 'Democracy Together',
    title: 'A democracia precisa de uma rede.',
    lead: 'A Democracy Together liga os centros de estudos de África e da Europa para produzir, partilhar e defender o pensamento democrático.',
    ctaPrimary: 'Juntar-me à rede',
    ctaSecondary: 'Ler as análises',
    visualLabel: 'Cidadãos reunidos num fórum de debate',
    visualCaption:
      'Imagem de ilustração. Em produção: fotografia documental, digna e diversa.',
    creds: [
      { label: 'Estatuto', value: 'Associação loi 1901, sede em Paris' },
      { label: 'Escritórios', value: 'Paris, Dakar, Bruxelas' },
      {
        label: 'Fundada por',
        value: 'Abdou Samb, Philippe Kourilsky, Pierre Vimont',
      },
    ],
  },
  mission: {
    title: 'Agregar as ideias, mobilizar a nova geração, pesar nas decisões',
    cta: 'A nossa missão',
    cells: [
      {
        ix: '01 Agregação',
        title: 'Reunir a investigação democrática num só lugar',
        body: 'Recolher, sintetizar e difundir as análises dos centros membros sobre governação digital, participação cidadã, combate à corrupção e transições democráticas.',
      },
      {
        ix: '02 Promoção',
        title: 'Levar as ideias ao debate',
        body: 'Cimeira mundial em Paris, seminários online e oficinas regionais, parcerias com decisores, ONG e instituições académicas.',
      },
      {
        ix: '03 Capacidades',
        title: 'Apoiar a nova geração',
        body: 'Mentoria e formação para os centros de estudos emergentes e os jovens contribuidores.',
      },
      {
        ix: '04 Inclusão',
        title: 'Diversidade real',
        body: 'Perspetivas multidisciplinares e diversidade geográfica, cultural e de género.',
      },
    ],
    barometer: {
      label: 'O Barómetro',
      title: 'Um índice África-Europa para medir a democracia',
      body: 'O nosso ativo diferenciador: dados abertos e citáveis que alimentam o relatório anual sobre o estado da democracia.',
    },
  },
  analyses: {
    title: 'Últimas análises',
    cta: 'Toda a biblioteca',
    featured: {
      tag: 'Relatório anual · 88 páginas · FR / EN',
      title: 'O estado da democracia entre África e a Europa',
      body: 'Uma leitura cruzada das trajetórias democráticas de dois continentes cujos destinos estão ligados, assente nos contributos de trinta e oito centros de estudos membros.',
      chips: ['Transições democráticas', 'Dados abertos'],
    },
    items: [
      {
        tag: 'Policy brief · Governação digital',
        title: 'Regular as plataformas sem enfraquecer o debate público',
        body: 'Quatro recomendações para os reguladores europeus e da África Ocidental.',
      },
      {
        tag: 'Nota de síntese · Combate à corrupção',
        title: 'Seguir o dinheiro: transparência orçamental e confiança cívica',
        body: 'O que a contratação pública aberta muda na prestação de contas.',
      },
      {
        tag: 'Working paper · Participação cidadã',
        title: 'A juventude como força democrática, não como alvo',
        body: 'Sete dispositivos de participação testados em Dakar e em Bruxelas.',
      },
    ],
  },
  barometre: {
    eyebrow: 'Dados abertos',
    title: 'O Barómetro da democracia',
    body: 'Um índice compósito África-Europa, uma metodologia publicada, conjuntos de dados citáveis. Dados de ilustração.',
    countries: [
      { name: 'Bélgica', score: '0.86' },
      { name: 'França', score: '0.83' },
      { name: 'Senegal', score: '0.71' },
      { name: 'Gana', score: '0.68' },
      { name: 'Tunísia', score: '0.49' },
    ],
    legend: [
      'Livre',
      'Bastante livre',
      'Parcialmente',
      'Pouco livre',
      'Não livre',
    ],
    note: 'Passe o cursor sobre um país. Dados de ilustração.',
    mapLabel: 'Mapa interativo (demonstração)',
    links: ['Explorar as fichas por país', 'Descarregar os dados'],
  },
  axes: {
    title: 'Cinco eixos de trabalho',
    items: [
      {
        n: '01',
        title: 'Governação digital',
        body: 'Plataformas, desinformação, liberdades em linha e regulação democrática do digital.',
      },
      {
        n: '02',
        title: 'Participação cidadã',
        body: 'Envolvimento, deliberação e confiança nas instituições democráticas.',
      },
      {
        n: '03',
        title: 'Combate à corrupção',
        body: 'Transparência orçamental, integridade pública e prestação de contas.',
      },
      {
        n: '04',
        title: 'Transições democráticas',
        body: 'Saída do autoritarismo, alternâncias e resiliência das transições.',
      },
      {
        n: '05',
        title: 'Crises globais e democracia',
        body: 'Clima, segurança e migrações: o impacto das crises na governação.',
      },
    ],
  },
  events: {
    title: 'Eventos',
    cta: 'Toda a agenda',
    featured: {
      tag: 'Cimeira inaugural · Paris',
      title: 'Conferência inaugural da Democracy Together',
      body: 'Um dia de plenários e oficinas para lançar a rede e os seus primeiros trabalhos conjuntos.',
      action: 'Inscrever-me',
    },
    items: [
      {
        date: '03 dez',
        kind: 'Seminário online',
        title: 'Desinformação eleitoral: defender o ato de voto',
        meta: 'Em linha · FR / EN',
      },
      {
        date: '22 jan',
        kind: 'Oficina regional · Dakar',
        title: 'Financiar a sociedade civil na África Ocidental',
        meta: 'Presencial · Francês',
      },
      {
        date: '14 fev',
        kind: 'Oficina regional · Bruxelas',
        title: 'O digital ao serviço da deliberação',
        meta: 'Híbrido · FR / EN',
      },
    ],
  },
  youth: {
    eyebrow: 'Hub jovem',
    title: 'Tens menos de 35 anos e ideias para a democracia?',
    body: 'Um espaço pensado para ti: um percurso progressivo para aprender, contribuir e ser acompanhado por mentores da rede.',
    cta: 'Juntar-me ao hub jovem',
    steps: [
      {
        n: '01',
        title: 'Descobrir',
        body: 'Compreender os desafios com formatos curtos e acessíveis.',
      },
      {
        n: '02',
        title: 'Aprender',
        body: 'Caixa de ferramentas, seminários online e módulos de reforço de capacidades.',
      },
      {
        n: '03',
        title: 'Contribuir',
        body: 'Publicar uma tribuna, juntar-te a um grupo de trabalho, candidatar-te a uma bolsa.',
      },
      {
        n: '04',
        title: 'Ser mentor',
        body: 'Ser posto em contacto com um mentor experiente da rede.',
      },
    ],
  },
  join: {
    title: 'Juntar-se à rede',
    body: 'Três formas de fazer parte. A quota é solidária e ajustada consoante o país.',
    plans: [
      {
        label: 'Organização',
        title: 'Centro de estudos membro',
        features: [
          'Perfil de organização e publicações',
          'Acesso aos projetos e ao fundo colaborativo',
          'Voz na governação da rede',
        ],
        cta: 'Candidatar-me',
      },
      {
        label: 'Pessoa',
        title: 'Membro individual',
        features: [
          'Perfil de especialista no diretório',
          'Espaços colaborativos e eventos',
          'Carta de análises reservada',
        ],
        cta: 'Aderir',
      },
      {
        label: 'Menos de 35 anos',
        title: 'Jovem contribuidor',
        features: [
          'Acesso ao hub jovem',
          'Mentoria e bolsas',
          'Publicação acompanhada',
        ],
        cta: 'Juntar-me a nós',
      },
    ],
  },
  newsletter: {
    title: 'A carta de análises',
    body: 'Os trabalhos da rede e o debate democrático, duas vezes por mês.',
    cta: 'Subscrever',
    placeholder: 'O seu e-mail',
  },
};
const ar: HomeContent = {
  hero: {
    eyebrow: 'Democracy Together',
    title: 'الديمقراطية في حاجة إلى شبكة.',
    lead: 'تربط Democracy Together بين مراكز الدراسات في أفريقيا وأوروبا لإنتاج الفكر الديمقراطي وتقاسمه والدفاع عنه.',
    ctaPrimary: 'الانضمام إلى الشبكة',
    ctaSecondary: 'قراءة التحليلات',
    visualLabel: 'مواطنون مجتمعون في منتدى للنقاش',
    visualCaption:
      'صورة توضيحية. وفي النسخة النهائية: تصوير وثائقي يحفظ الكرامة ويعكس التنوع.',
    creds: [
      {
        label: 'الوضع القانوني',
        value: 'جمعية خاضعة لقانون 1901، مقرها بباريس',
      },
      { label: 'المكاتب', value: 'باريس، داكار، بروكسل' },
      {
        label: 'من تأسيس',
        value: 'عبدو سامب، فيليب كوريلسكي، بيير فيمون',
      },
    ],
  },
  mission: {
    title: 'تجميع الأفكار، وتعبئة الجيل الصاعد، والتأثير في القرارات',
    cta: 'رسالتنا',
    cells: [
      {
        ix: '01 التجميع',
        title: 'جمع البحث الديمقراطي في مكان واحد',
        body: 'جمع تحليلات مراكز الدراسات الأعضاء وتلخيصها ونشرها في مجالات الحوكمة الرقمية والمشاركة المواطنة ومكافحة الفساد والانتقالات الديمقراطية.',
      },
      {
        ix: '02 الترويج',
        title: 'حمل الأفكار إلى قلب النقاش',
        body: 'قمة عالمية بباريس، وندوات عبر الإنترنت وورشات جهوية، وشراكات مع صانعي القرار والمنظمات غير الحكومية والمؤسسات الأكاديمية.',
      },
      {
        ix: '03 القدرات',
        title: 'دعم الجيل الصاعد',
        body: 'توجيه وتكوين لفائدة مراكز الدراسات الناشئة والمساهمين الشباب.',
      },
      {
        ix: '04 الإدماج',
        title: 'تنوع حقيقي',
        body: 'مقاربات متعددة التخصصات وتنوع جغرافي وثقافي ونوعي.',
      },
    ],
    barometer: {
      label: 'المؤشر',
      title: 'مؤشر لأفريقيا وأوروبا لقياس الديمقراطية',
      body: 'ما يميّزنا: بيانات مفتوحة قابلة للاستشهاد تغذّي التقرير السنوي حول حالة الديمقراطية.',
    },
  },
  analyses: {
    title: 'أحدث التحليلات',
    cta: 'المكتبة كاملة',
    featured: {
      tag: 'تقرير سنوي · 88 صفحة · FR / EN',
      title: 'حالة الديمقراطية بين أفريقيا وأوروبا',
      body: 'قراءة متقاطعة للمسارات الديمقراطية لقارتين تتشابك مصائرهما، تستند إلى مساهمات ثمانية وثلاثين مركز دراسات عضواً.',
      chips: ['الانتقالات الديمقراطية', 'البيانات المفتوحة'],
    },
    items: [
      {
        tag: 'موجز سياسات · الحوكمة الرقمية',
        title: 'تنظيم المنصات دون إضعاف النقاش العمومي',
        body: 'أربع توصيات موجَّهة إلى الجهات المنظِّمة في أوروبا وغرب أفريقيا.',
      },
      {
        tag: 'مذكرة تركيبية · مكافحة الفساد',
        title: 'تتبّع المال: شفافية الميزانية والثقة المدنية',
        body: 'ما الذي تغيّره الصفقات العمومية المفتوحة في مجال المساءلة.',
      },
      {
        tag: 'ورقة عمل · المشاركة المواطنة',
        title: 'الشباب قوة ديمقراطية، لا فئة مستهدَفة',
        body: 'سبع آليات للانخراط جُرِّبت في داكار وبروكسل.',
      },
    ],
  },
  barometre: {
    eyebrow: 'بيانات مفتوحة',
    title: 'مؤشر الديمقراطية',
    body: 'مؤشر مركّب لأفريقيا وأوروبا، ومنهجية منشورة، ومجموعات بيانات قابلة للاستشهاد. بيانات توضيحية.',
    countries: [
      { name: 'بلجيكا', score: '0.86' },
      { name: 'فرنسا', score: '0.83' },
      { name: 'السنغال', score: '0.71' },
      { name: 'غانا', score: '0.68' },
      { name: 'تونس', score: '0.49' },
    ],
    legend: ['حرّ', 'حرّ إلى حد كبير', 'حرّ جزئياً', 'قليل الحرية', 'غير حرّ'],
    note: 'مرّروا المؤشر فوق بلد. بيانات توضيحية.',
    mapLabel: 'خريطة تفاعلية (عرض تجريبي)',
    links: ['استكشاف بطاقات البلدان', 'تنزيل البيانات'],
  },
  axes: {
    title: 'خمسة محاور عمل',
    items: [
      {
        n: '01',
        title: 'الحوكمة الرقمية',
        body: 'المنصات، والتضليل، والحريات على الإنترنت، والتنظيم الديمقراطي للمجال الرقمي.',
      },
      {
        n: '02',
        title: 'المشاركة المواطنة',
        body: 'الانخراط، والتداول، والثقة في المؤسسات الديمقراطية.',
      },
      {
        n: '03',
        title: 'مكافحة الفساد',
        body: 'شفافية الميزانية، ونزاهة المرفق العام، والمساءلة.',
      },
      {
        n: '04',
        title: 'الانتقالات الديمقراطية',
        body: 'الخروج من الاستبداد، والتناوب، وقدرة الانتقالات على الصمود.',
      },
      {
        n: '05',
        title: 'الأزمات العالمية والديمقراطية',
        body: 'المناخ والأمن والهجرة: أثر الأزمات على الحوكمة.',
      },
    ],
  },
  events: {
    title: 'الفعاليات',
    cta: 'الأجندة كاملة',
    featured: {
      tag: 'القمة التأسيسية · باريس',
      title: 'المؤتمر التأسيسي لـ Democracy Together',
      body: 'يوم من الجلسات العامة والورشات لإطلاق الشبكة وأولى أعمالها المشتركة.',
      action: 'التسجيل',
    },
    items: [
      {
        date: '03 دجنبر',
        kind: 'ندوة عبر الإنترنت',
        title: 'التضليل الانتخابي: الدفاع عن العملية الاقتراعية',
        meta: 'عن بُعد · FR / EN',
      },
      {
        date: '22 يناير',
        kind: 'ورشة جهوية · داكار',
        title: 'تمويل المجتمع المدني في غرب أفريقيا',
        meta: 'حضورياً · بالفرنسية',
      },
      {
        date: '14 فبراير',
        kind: 'ورشة جهوية · بروكسل',
        title: 'الرقمي في خدمة التداول',
        meta: 'مختلط · FR / EN',
      },
    ],
  },
  youth: {
    eyebrow: 'فضاء الشباب',
    title: 'عمرك دون 35 سنة ولديك أفكار من أجل الديمقراطية؟',
    body: 'فضاء صُمِّم من أجلك: مسار تدريجي للتعلّم والمساهمة والاستفادة من مرافقة موجّهين من الشبكة.',
    cta: 'الانضمام إلى فضاء الشباب',
    steps: [
      {
        n: '01',
        title: 'الاكتشاف',
        body: 'فهم الرهانات عبر صيغ قصيرة وميسّرة.',
      },
      {
        n: '02',
        title: 'التعلّم',
        body: 'حقيبة أدوات، وندوات عبر الإنترنت، ووحدات لتعزيز القدرات.',
      },
      {
        n: '03',
        title: 'المساهمة',
        body: 'نشر مقال رأي، أو الانضمام إلى مجموعة عمل، أو الترشح لمنحة.',
      },
      {
        n: '04',
        title: 'التوجيه',
        body: 'أن تُربَط بموجّه ذي خبرة من الشبكة.',
      },
    ],
  },
  join: {
    title: 'الانضمام إلى الشبكة',
    body: 'ثلاث طرق لتكون جزءاً منها. الاشتراك تضامني ويُعدَّل حسب البلد.',
    plans: [
      {
        label: 'منظمة',
        title: 'مركز دراسات عضو',
        features: [
          'ملف المنظمة ومنشوراتها',
          'النفاذ إلى المشاريع وإلى الصندوق التعاوني',
          'صوت في حوكمة الشبكة',
        ],
        cta: 'تقديم ترشيح',
      },
      {
        label: 'فرد',
        title: 'عضو فردي',
        features: [
          'ملف خبير في الدليل',
          'فضاءات عمل مشترك وفعاليات',
          'نشرة تحليلات محجوزة للأعضاء',
        ],
        cta: 'الانضمام',
      },
      {
        label: 'دون 35 سنة',
        title: 'مساهم شاب',
        features: [
          'النفاذ إلى فضاء الشباب',
          'التوجيه والمنح',
          'نشر مصحوب بمرافقة',
        ],
        cta: 'انضم إلينا',
      },
    ],
  },
  newsletter: {
    title: 'نشرة التحليلات',
    body: 'أعمال الشبكة والنقاش الديمقراطي، مرتين في الشهر.',
    cta: 'الاشتراك',
    placeholder: 'بريدكم الإلكتروني',
  },
};

// Table exhaustive par construction (cf. `projects-content.ts`).
const BY_LOCALE: Record<Locale, HomeContent> = { fr, en, es, pt, ar };

export function homeFallback(locale: Locale): HomeContent {
  return BY_LOCALE[locale];
}
