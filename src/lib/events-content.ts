import type { Locale } from '@/i18n/routing';

// Événements (F-23) — contenu porté 1:1 depuis les maquettes agence
// `design/rmdl-evenements.html` (liste) + `rmdl-evenement.html` (détail).
// Données d'illustration (dates/tarifs fictifs, c'est explicite dans la
// maquette). Liste d'événements en **données neutres** (clés de filtre stables
// pour l'URL) + dictionnaires de libellés bilingues (évite de dupliquer la
// liste). Pensé pour basculer plus tard sur une table Convex `events` (avec
// inscription/RSVP). Vérifié sans terme banni.

export type EventType = 'sommet' | 'webinaire' | 'atelier';
export type EventRegion = 'afrique' | 'europe' | 'en-ligne';
export type EventFormat = 'presentiel' | 'en-ligne' | 'hybride';
export type ThemeKey =
  | 'vie-reseau'
  | 'gouvernance-numerique'
  | 'participation'
  | 'anti-corruption'
  | 'transitions'
  | 'crises';

export type EventData = {
  slug: string;
  type: EventType;
  region: EventRegion;
  format: EventFormat;
  langs: ('fr' | 'en')[];
  theme: ThemeKey;
  cityKey: string;
  y: number;
  mo: number; // 1-12
  d: number;
  upcoming: boolean;
  durationMin?: number; // pour les rediffusions (événements passés)
};

// Liste neutre (la plus proche en haut). `when` dérivé pour le tri.
export const EVENTS: EventData[] = [
  {
    slug: 'conference-inaugurale',
    type: 'sommet',
    region: 'europe',
    format: 'hybride',
    langs: ['fr', 'en'],
    theme: 'vie-reseau',
    cityKey: 'paris',
    y: 2026,
    mo: 11,
    d: 14,
    upcoming: true,
  },
  {
    slug: 'webinaire-gouvernance-plateformes',
    type: 'webinaire',
    region: 'en-ligne',
    format: 'en-ligne',
    langs: ['fr', 'en'],
    theme: 'gouvernance-numerique',
    cityKey: 'online',
    y: 2026,
    mo: 12,
    d: 3,
    upcoming: true,
  },
  {
    slug: 'atelier-dakar-transparence-budgetaire',
    type: 'atelier',
    region: 'afrique',
    format: 'presentiel',
    langs: ['fr'],
    theme: 'anti-corruption',
    cityKey: 'dakar',
    y: 2026,
    mo: 9,
    d: 17,
    upcoming: true,
  },
  {
    slug: 'atelier-bruxelles-democratie-ue',
    type: 'atelier',
    region: 'europe',
    format: 'hybride',
    langs: ['fr', 'en'],
    theme: 'transitions',
    cityKey: 'bruxelles',
    y: 2026,
    mo: 10,
    d: 8,
    upcoming: true,
  },
  {
    slug: 'webinaire-jeunes-releve',
    type: 'webinaire',
    region: 'en-ligne',
    format: 'en-ligne',
    langs: ['fr'],
    theme: 'participation',
    cityKey: 'online',
    y: 2026,
    mo: 9,
    d: 24,
    upcoming: true,
  },
  {
    slug: 'atelier-dakar-integrite-electorale',
    type: 'atelier',
    region: 'afrique',
    format: 'presentiel',
    langs: ['fr', 'en'],
    theme: 'transitions',
    cityKey: 'dakar',
    y: 2026,
    mo: 10,
    d: 15,
    upcoming: true,
  },
  {
    slug: 'webinaire-desinformation-confiance',
    type: 'webinaire',
    region: 'en-ligne',
    format: 'en-ligne',
    langs: ['en'],
    theme: 'crises',
    cityKey: 'online',
    y: 2026,
    mo: 11,
    d: 5,
    upcoming: true,
  },
  {
    slug: 'atelier-bruxelles-souverainete-numerique',
    type: 'atelier',
    region: 'europe',
    format: 'presentiel',
    langs: ['fr', 'en'],
    theme: 'gouvernance-numerique',
    cityKey: 'bruxelles',
    y: 2026,
    mo: 11,
    d: 26,
    upcoming: true,
  },
  {
    slug: 'webinaire-financer-societe-civile',
    type: 'webinaire',
    region: 'en-ligne',
    format: 'hybride',
    langs: ['fr'],
    theme: 'participation',
    cityKey: 'dakar-online',
    y: 2026,
    mo: 12,
    d: 10,
    upcoming: true,
  },
  {
    slug: 'restitution-barometre-annuel',
    type: 'webinaire',
    region: 'en-ligne',
    format: 'en-ligne',
    langs: ['fr', 'en'],
    theme: 'vie-reseau',
    cityKey: 'online',
    y: 2026,
    mo: 12,
    d: 16,
    upcoming: true,
  },
  // passés (rediffusions)
  {
    slug: 'ia-generative-integrite-information',
    type: 'webinaire',
    region: 'en-ligne',
    format: 'en-ligne',
    langs: ['fr', 'en'],
    theme: 'gouvernance-numerique',
    cityKey: 'online',
    y: 2026,
    mo: 6,
    d: 4,
    upcoming: false,
    durationMin: 72,
  },
  {
    slug: 'atelier-dakar-financer-societe-civile',
    type: 'atelier',
    region: 'afrique',
    format: 'hybride',
    langs: ['fr'],
    theme: 'participation',
    cityKey: 'dakar',
    y: 2026,
    mo: 5,
    d: 22,
    upcoming: false,
    durationMin: 125,
  },
  {
    slug: 'reguler-plateformes-debat-public',
    type: 'webinaire',
    region: 'en-ligne',
    format: 'en-ligne',
    langs: ['fr', 'en'],
    theme: 'gouvernance-numerique',
    cityKey: 'online',
    y: 2026,
    mo: 4,
    d: 9,
    upcoming: false,
    durationMin: 58,
  },
  {
    slug: 'atelier-bruxelles-participation-locale',
    type: 'atelier',
    region: 'europe',
    format: 'hybride',
    langs: ['fr', 'en'],
    theme: 'participation',
    cityKey: 'bruxelles',
    y: 2026,
    mo: 3,
    d: 18,
    upcoming: false,
    durationMin: 100,
  },
];

export function whenOf(e: EventData): number {
  return e.y * 10000 + e.mo * 100 + e.d;
}

export const FEATURED_SLUG = 'conference-inaugurale';

export type EventFilters = {
  period: 'venir' | 'passes';
  types: string[];
  regions: string[];
  formats: string[];
  langs: string[];
  q?: string;
  sort: string;
};

export const EVENT_SORTS = ['date-asc', 'date-desc', 'az'] as const;

// --- Dictionnaires de libellés (bilingues) ---
type Labels = {
  hero: {
    crumbHome: string;
    eyebrow: string;
    title: string;
    lead: string;
    searchPlaceholder: string;
    searchCta: string;
  };
  featuredBadge: string;
  featured: {
    kicker: string;
    title: string;
    body: string;
    facts: { k: string; v: string }[];
    register: string;
    details: string;
  };
  filter: {
    title: string;
    reset: string;
    upcoming: string;
    past: string;
    type: string;
    region: string;
    format: string;
    lang: string;
  };
  results: {
    // Nom accessible de la section de résultats (`aria-label`) — annoncé par
    // les lecteurs d'écran, donc traduit comme tout le reste (issue #34).
    title: string;
    countUpcomingOne: string;
    countUpcomingMany: string;
    countPastOne: string;
    countPastMany: string;
    sortLabel: string;
    sorts: Record<string, string>;
    details: string;
    empty: string;
    emptyReset: string;
  };
  replays: {
    eyebrow: string;
    title: string;
    cta: string;
    watch: string;
    durationLabel: (m: number) => string;
    note: string;
  };
  types: Record<EventType, string>;
  regions: Record<EventRegion, string>;
  formats: Record<EventFormat, string>;
  themes: Record<ThemeKey, string>;
  cities: Record<string, string>;
  langName: Record<'fr' | 'en', string>;
  titles: Record<string, string>;
  // détail
  detail: DetailLabels;
};

type DetailLabels = {
  back: string;
  badges: (e: EventData) => string[];
  eyebrow: string;
  leadFallback: string;
  factDate: string;
  factPlace: string;
  factFormat: string;
  register: string;
  seeProgramme: string;
  visualPin: string;
  visualCap: string;
  sections: { day: string; programme: string; speakers: string; infos: string };
  // Badge d'un intervenant fondateur du réseau — texte visible, donc traduit
  // ici plutôt que choisi par un ternaire de locale dans le JSX (issue #34).
  founderBadge: string;
  related: string;
  resources: string;
  // contenu riche de la conférence (featured)
  conf: {
    lead: string;
    dayIntro: string[];
    progIntro: string;
    programme: {
      time: string;
      dur: string;
      kind: string;
      title: string;
      body: string;
      who?: string;
    }[];
    speakersIntro: string;
    speakers: {
      initials: string;
      name: string;
      role: string;
      founder?: boolean;
    }[];
    infos: { ic: string; title: string; body: string }[];
    ticket: {
      eyebrow: string;
      title: string;
      legend: string;
      tiers: { name: string; desc: string; price: string }[];
      disclaimer: string;
      reserve: string;
    };
    recap: { k: string; v: string }[];
    resources: { title: string; body: string }[];
  };
};

// Abréviations de mois du badge de date, une par langue.
//
// POURQUOI UNE TABLE ÉCRITE À LA MAIN plutôt que `Intl.DateTimeFormat`. Le
// badge attend une forme COURTE ET CAPITALISÉE (« JANV », pas « janv. ») que
// l'ICU ne produit dans aucune langue : il faudrait la retoucher après coup,
// et la retouche diffère d'une langue à l'autre — l'arabe n'a pas de
// capitales, et le point abréviatif du français n'existe pas en portugais.
// La table dit exactement ce qui s'affiche.
//
// L'ARABE N'ABRÈGE PAS ses noms de mois : la forme pleine y est la forme
// courte. Les noms retenus sont ceux en usage au Maghreb, zone visée par
// cette langue.
const MONTH_ABBR: Record<Locale, readonly string[]> = {
  fr: [
    'JANV',
    'FÉVR',
    'MARS',
    'AVR',
    'MAI',
    'JUIN',
    'JUIL',
    'AOÛT',
    'SEPT',
    'OCT',
    'NOV',
    'DÉC',
  ],
  en: [
    'JAN',
    'FEB',
    'MAR',
    'APR',
    'MAY',
    'JUN',
    'JUL',
    'AUG',
    'SEP',
    'OCT',
    'NOV',
    'DEC',
  ],
  es: [
    'ENE',
    'FEB',
    'MAR',
    'ABR',
    'MAY',
    'JUN',
    'JUL',
    'AGO',
    'SEP',
    'OCT',
    'NOV',
    'DIC',
  ],
  pt: [
    'JAN',
    'FEV',
    'MAR',
    'ABR',
    'MAI',
    'JUN',
    'JUL',
    'AGO',
    'SET',
    'OUT',
    'NOV',
    'DEZ',
  ],
  ar: [
    'يناير',
    'فبراير',
    'مارس',
    'أبريل',
    'ماي',
    'يونيو',
    'يوليوز',
    'غشت',
    'شتنبر',
    'أكتوبر',
    'نونبر',
    'دجنبر',
  ],
};

export function monthAbbr(e: Pick<EventData, 'mo'>, locale: Locale): string {
  return MONTH_ABBR[locale][e.mo - 1];
}

const fr: Labels = {
  hero: {
    crumbHome: 'Accueil',
    eyebrow: 'Agenda',
    title: 'Événements',
    lead: 'Un sommet mondial annuel à Paris, des webinaires thématiques ouverts à tous et des ateliers régionaux à Dakar et Bruxelles. Le calendrier des rencontres du réseau, à venir et en rediffusion.',
    searchPlaceholder: 'Rechercher un titre, une ville, un thème…',
    searchCta: 'Rechercher',
  },
  featuredBadge: 'À la une · Sommet',
  featured: {
    kicker: 'Conférence inaugurale · Présentiel et diffusion en ligne',
    title: 'Conférence inaugurale de Democracy Together',
    body: "Deux jours de débats entre think tanks d'Afrique et d'Europe, de tables rondes publiques et d'ateliers de travail. Ouverture par les membres fondateurs, restitution du Baromètre annuel et signature de la charte du réseau.",
    facts: [
      { k: 'Dates', v: '12 et 13 nov. 2026' },
      { k: 'Lieu', v: 'Paris, France' },
      { k: 'Langues', v: 'FR / EN' },
      { k: 'Accès', v: 'Sur inscription' },
    ],
    register: "S'inscrire",
    details: 'Détails',
  },
  filter: {
    title: 'Filtrer',
    reset: 'Réinitialiser',
    upcoming: 'À venir',
    past: 'Passés',
    type: 'Type',
    region: 'Région',
    format: 'Format',
    lang: 'Langue',
  },
  results: {
    title: 'Résultats',
    countUpcomingOne: 'événement à venir',
    countUpcomingMany: 'événements à venir',
    countPastOne: 'événement passé',
    countPastMany: 'événements passés',
    sortLabel: 'Trier par',
    sorts: {
      'date-asc': 'Date, plus proche',
      'date-desc': 'Date, plus lointaine',
      az: 'Titre A → Z',
    },
    details: 'Détails',
    empty: 'Aucun événement ne correspond à ces filtres.',
    emptyReset: 'Réinitialiser les filtres',
  },
  replays: {
    eyebrow: 'Rediffusions',
    title: 'Replays des événements passés',
    cta: 'Voir toutes les ressources',
    watch: '▶ Voir la rediffusion',
    durationLabel: (m) =>
      m >= 60
        ? `durée ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`
        : `durée ${m} min`,
    note: "Données d'illustration. Les rediffusions et durées sont fictives.",
  },
  types: {
    sommet: 'Sommet',
    webinaire: 'Webinaire',
    atelier: 'Atelier régional',
  },
  regions: { afrique: 'Afrique', europe: 'Europe', 'en-ligne': 'En ligne' },
  formats: {
    presentiel: 'Présentiel',
    'en-ligne': 'En ligne',
    hybride: 'Hybride',
  },
  themes: {
    'vie-reseau': 'Vie du réseau',
    'gouvernance-numerique': 'Gouvernance numérique',
    participation: 'Participation citoyenne',
    'anti-corruption': 'Lutte anti-corruption',
    transitions: 'Transitions démocratiques',
    crises: 'Crises globales',
  },
  cities: {
    paris: 'Paris',
    dakar: 'Dakar',
    bruxelles: 'Bruxelles',
    online: 'En ligne',
    'dakar-online': 'Dakar et en ligne',
  },
  langName: { fr: 'Français', en: 'Anglais' },
  titles: {
    'conference-inaugurale': 'Conférence inaugurale de Democracy Together',
    'webinaire-gouvernance-plateformes':
      "Webinaire : gouvernance des plateformes après l'IA",
    'atelier-dakar-transparence-budgetaire':
      'Atelier régional de Dakar : transparence budgétaire',
    'atelier-bruxelles-democratie-ue':
      "Atelier de Bruxelles : démocratie et politiques de l'UE",
    'webinaire-jeunes-releve': 'Webinaire jeunes : la relève au cœur du débat',
    'atelier-dakar-integrite-electorale':
      'Atelier régional de Dakar : intégrité électorale',
    'webinaire-desinformation-confiance':
      'Webinaire : désinformation et confiance civique',
    'atelier-bruxelles-souverainete-numerique':
      'Atelier de Bruxelles : souveraineté numérique européenne',
    'webinaire-financer-societe-civile':
      "Webinaire : financer la société civile en Afrique de l'Ouest",
    'restitution-barometre-annuel':
      'Restitution du Baromètre annuel de la démocratie',
    'ia-generative-integrite-information':
      "IA générative et intégrité de l'information",
    'atelier-dakar-financer-societe-civile':
      'Atelier régional de Dakar : financer la société civile',
    'reguler-plateformes-debat-public':
      'Réguler les plateformes sans affaiblir le débat public',
    'atelier-bruxelles-participation-locale':
      'Atelier de Bruxelles : participation citoyenne locale',
  },
  detail: {
    back: 'Tous les événements',
    badges: (e) => [
      fr.types[e.type],
      fr.formats[e.format],
      e.langs.map((l) => l.toUpperCase()).join(' / '),
    ],
    eyebrow: 'Democracy Together',
    leadFallback:
      'Rencontre du réseau Democracy Together. Programme détaillé et inscription à venir.',
    factDate: 'Date',
    factPlace: 'Lieu',
    factFormat: 'Format',
    register: "S'inscrire",
    seeProgramme: 'Voir le programme',
    visualPin: 'Paris · 2026',
    visualCap:
      "Image d'illustration. Lieu de la conférence : Paris, siège du réseau.",
    sections: {
      day: 'La journée',
      programme: 'Programme détaillé',
      speakers: 'Intervenants',
      infos: 'Infos pratiques',
    },
    founderBadge: 'Fondateur',
    related: 'Autres rendez-vous',
    resources: 'Replays et ressources',
    conf: {
      lead: "Une journée pour fonder publiquement le réseau : think tanks d'Afrique et d'Europe, chercheurs, responsables publics et jeunes engagés, réunis pour penser et défendre la démocratie.",
      dayIntro: [
        "La conférence inaugurale marque la naissance officielle de Democracy Together. Pendant une journée, le réseau présente sa raison d'être, ses premiers travaux et sa méthode : relier des think tanks d'Afrique et d'Europe pour produire une pensée démocratique partagée et citable.",
        "Le matin est consacré aux plénières de cadrage : état de la démocratie entre les deux continents, présentation du Baromètre Democracy Together et de la bibliothèque en accès ouvert. L'après-midi privilégie le travail en petits groupes : ateliers thématiques, table ronde intergénérationnelle, puis restitution publique. La journée se clôt sur une feuille de route et un appel à contributions.",
        "L'événement réunit environ 280 participants attendus (donnée d'illustration), avec une diffusion en direct pour les membres ne pouvant se déplacer.",
      ],
      progIntro:
        "Horaires de Paris (CET). Programme prévisionnel, susceptible d'ajustements jusqu'à l'ouverture.",
      programme: [
        {
          time: '08:30',
          dur: '45 min',
          kind: 'Accueil',
          title: 'Accueil des participants et café',
          body: "Émargement, remise des badges et café d'accueil dans le hall. Stand du réseau et de la bibliothèque en accès ouvert.",
        },
        {
          time: '09:15',
          dur: '30 min',
          kind: 'Plénière',
          title: 'Ouverture : pourquoi un réseau, maintenant',
          body: "Mot d'accueil des fondateurs et présentation de la mission de Democracy Together. Cadre de la journée et des engagements annoncés.",
          who: 'Avec Abdou Samb, Philippe Kourilsky et Pierre Vimont.',
        },
        {
          time: '09:45',
          dur: '75 min',
          kind: 'Plénière',
          title: "L'état de la démocratie, Afrique et Europe",
          body: 'Présentation des grands constats du premier rapport conjoint et lancement public du Baromètre Democracy Together, avec lecture croisée des indicateurs.',
          who: "Table d'experts du réseau, suivie d'un échange avec la salle.",
        },
        {
          time: '11:00',
          dur: '20 min',
          kind: 'Pause',
          title: 'Pause',
          body: 'Pause café et rencontres informelles.',
        },
        {
          time: '11:20',
          dur: '70 min',
          kind: 'Ateliers',
          title: 'Ateliers parallèles (au choix)',
          body: "Quatre ateliers en petits groupes : gouvernance numérique, participation citoyenne, lutte anti-corruption, transitions démocratiques. Choix de l'atelier à l'inscription.",
          who: 'Animés par les coordinateurs des pôles du réseau.',
        },
        {
          time: '12:30',
          dur: '90 min',
          kind: 'Déjeuner',
          title: 'Déjeuner',
          body: 'Déjeuner debout sur place, options végétariennes et halal. Espace presse ouvert.',
        },
        {
          time: '14:00',
          dur: '80 min',
          kind: 'Table ronde',
          title:
            'Démocratie et générations : transmettre, contester, renouveler',
          body: 'Dialogue intergénérationnel entre fondateurs, chercheurs et jeunes du réseau sur la place des nouvelles générations dans la vie démocratique.',
          who: 'Modération assurée par la rédaction du réseau.',
        },
        {
          time: '15:20',
          dur: '40 min',
          kind: 'Plénière',
          title: 'Restitution des ateliers',
          body: 'Synthèse publique des quatre ateliers et premières pistes de travail pour les groupes du réseau.',
        },
        {
          time: '16:00',
          dur: '45 min',
          kind: 'Clôture',
          title: 'Feuille de route et appel à contributions',
          body: "Annonce des prochains rendez-vous, des partenariats et de l'appel à contributions pour la bibliothèque. Clôture de la journée.",
        },
        {
          time: '16:45',
          dur: '75 min',
          kind: 'Réception',
          title: 'Réception et networking',
          body: 'Réception conviviale pour prolonger les échanges entre membres, partenaires et nouveaux contributeurs.',
        },
      ],
      speakersIntro:
        'Programmation en cours. Fondateurs et premiers intervenants confirmés ci-dessous (liste indicative).',
      speakers: [
        {
          initials: 'AS',
          name: 'Abdou Samb',
          role: 'Cofondateur de Democracy Together. Ouverture et clôture de la journée.',
          founder: true,
        },
        {
          initials: 'PK',
          name: 'Philippe Kourilsky',
          role: "Cofondateur de Democracy Together. Plénière d'ouverture.",
          founder: true,
        },
        {
          initials: 'PV',
          name: 'Pierre Vimont',
          role: "Cofondateur de Democracy Together. Plénière d'ouverture et table ronde.",
          founder: true,
        },
        {
          initials: 'KM',
          name: 'Khady Mensah',
          role: "Coordinatrice du pôle Gouvernance numérique. Atelier de l'après-midi.",
        },
        {
          initials: 'LT',
          name: 'Lassana Traoré',
          role: 'Chercheur, pôle Lutte anti-corruption. Plénière du matin.',
        },
        {
          initials: 'SD',
          name: 'Sira Diallo',
          role: 'Déléguée du Hub jeunes. Table ronde intergénérationnelle.',
        },
      ],
      infos: [
        {
          ic: 'Lieu',
          title: 'Maison des congrès, Paris 8e',
          body: "Adresse exacte et plan d'accès communiqués aux personnes inscrites par courriel, une semaine avant l'événement.",
        },
        {
          ic: 'Accès',
          title: 'Transports en commun',
          body: 'Métro et RER à proximité, station à moins de cinq minutes à pied. Stationnement vélo sécurisé. Pas de parking visiteurs sur place.',
        },
        {
          ic: 'Accessibilité',
          title: 'Site accessible PMR',
          body: "Salles de plain-pied, ascenseurs et sanitaires adaptés. Boucle magnétique en plénière. Pour tout besoin spécifique, contactez l'équipe à l'inscription.",
        },
        {
          ic: 'Langues',
          title: 'Français et anglais',
          body: 'Plénières en interprétation simultanée FR / EN. Ateliers tenus dans la langue annoncée pour chaque groupe.',
        },
        {
          ic: 'Restauration',
          title: 'Déjeuner et pauses inclus',
          body: "Café d'accueil, pauses et déjeuner debout compris dans l'inscription. Options végétariennes et halal proposées.",
        },
        {
          ic: 'En direct',
          title: 'Diffusion pour les membres',
          body: "Les plénières sont diffusées en direct pour les membres à distance. Lien d'accès envoyé la veille.",
        },
      ],
      ticket: {
        eyebrow: 'Billetterie',
        title: 'Inscription',
        legend: 'Type de billet',
        tiers: [
          {
            name: 'Membre Democracy Together',
            desc: 'Adhésion à jour',
            price: 'Offert',
          },
          {
            name: 'Standard',
            desc: 'Plein tarif, journée complète',
            price: '45 €',
          },
          {
            name: 'Étudiant / jeune',
            desc: 'Sur justificatif, moins de 28 ans',
            price: '15 €',
          },
        ],
        disclaimer:
          "Tarifs indicatifs, données d'illustration. Aucun paiement n'est effectué sur cette maquette. Les billets gratuits restent soumis à confirmation des places disponibles.",
        reserve: 'Réserver',
      },
      recap: [
        { k: 'Date', v: 'Sam. 14 nov. 2026' },
        { k: 'Horaire', v: '08:30 à 18:00' },
        { k: 'Lieu', v: 'Paris 8e, France' },
        { k: 'Format', v: 'Présentiel · direct membres' },
      ],
      resources: [
        {
          title: 'Replays des plénières',
          body: "Disponibles quelques jours après l'événement, en accès ouvert.",
        },
        {
          title: 'Supports des ateliers',
          body: 'Notes et présentations partagées avec les participants.',
        },
        {
          title: 'Synthèse de la journée',
          body: 'Compte rendu public publié dans la bibliothèque.',
        },
      ],
    },
  },
};

const en: Labels = {
  hero: {
    crumbHome: 'Home',
    eyebrow: 'Agenda',
    title: 'Events',
    lead: "An annual global summit in Paris, thematic webinars open to all, and regional workshops in Dakar and Brussels. The network's calendar of gatherings, upcoming and on replay.",
    searchPlaceholder: 'Search a title, a city, a topic…',
    searchCta: 'Search',
  },
  featuredBadge: 'Featured · Summit',
  featured: {
    kicker: 'Inaugural conference · In person and online broadcast',
    title: 'Democracy Together inaugural conference',
    body: 'Two days of debate between think tanks from Africa and Europe, public round tables and working sessions. Opening by the founding members, release of the annual Barometer and signing of the network charter.',
    facts: [
      { k: 'Dates', v: '12 & 13 Nov. 2026' },
      { k: 'Venue', v: 'Paris, France' },
      { k: 'Languages', v: 'FR / EN' },
      { k: 'Access', v: 'By registration' },
    ],
    register: 'Register',
    details: 'Details',
  },
  filter: {
    title: 'Filter',
    reset: 'Reset',
    upcoming: 'Upcoming',
    past: 'Past',
    type: 'Type',
    region: 'Region',
    format: 'Format',
    lang: 'Language',
  },
  results: {
    title: 'Results',
    countUpcomingOne: 'upcoming event',
    countUpcomingMany: 'upcoming events',
    countPastOne: 'past event',
    countPastMany: 'past events',
    sortLabel: 'Sort by',
    sorts: {
      'date-asc': 'Date, soonest',
      'date-desc': 'Date, latest',
      az: 'Title A → Z',
    },
    details: 'Details',
    empty: 'No event matches these filters.',
    emptyReset: 'Reset filters',
  },
  replays: {
    eyebrow: 'Replays',
    title: 'Replays of past events',
    cta: 'See all resources',
    watch: '▶ Watch the replay',
    durationLabel: (m) =>
      m >= 60
        ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}`
        : `${m} min`,
    note: 'Illustration data. Replays and durations are fictional.',
  },
  types: {
    sommet: 'Summit',
    webinaire: 'Webinar',
    atelier: 'Regional workshop',
  },
  regions: { afrique: 'Africa', europe: 'Europe', 'en-ligne': 'Online' },
  formats: { presentiel: 'In person', 'en-ligne': 'Online', hybride: 'Hybrid' },
  themes: {
    'vie-reseau': 'Network life',
    'gouvernance-numerique': 'Digital governance',
    participation: 'Citizen participation',
    'anti-corruption': 'Anti-corruption',
    transitions: 'Democratic transitions',
    crises: 'Global crises',
  },
  cities: {
    paris: 'Paris',
    dakar: 'Dakar',
    bruxelles: 'Brussels',
    online: 'Online',
    'dakar-online': 'Dakar and online',
  },
  langName: { fr: 'French', en: 'English' },
  titles: {
    'conference-inaugurale': 'Democracy Together inaugural conference',
    'webinaire-gouvernance-plateformes':
      'Webinar: platform governance after AI',
    'atelier-dakar-transparence-budgetaire':
      'Dakar regional workshop: budget transparency',
    'atelier-bruxelles-democratie-ue':
      'Brussels workshop: democracy and EU policy',
    'webinaire-jeunes-releve':
      'Youth webinar: the next generation at the heart of debate',
    'atelier-dakar-integrite-electorale':
      'Dakar regional workshop: electoral integrity',
    'webinaire-desinformation-confiance':
      'Webinar: disinformation and civic trust',
    'atelier-bruxelles-souverainete-numerique':
      'Brussels workshop: European digital sovereignty',
    'webinaire-financer-societe-civile':
      'Webinar: funding civil society in West Africa',
    'restitution-barometre-annuel': 'Release of the annual Democracy Barometer',
    'ia-generative-integrite-information':
      'Generative AI and information integrity',
    'atelier-dakar-financer-societe-civile':
      'Dakar regional workshop: funding civil society',
    'reguler-plateformes-debat-public':
      'Regulating platforms without weakening public debate',
    'atelier-bruxelles-participation-locale':
      'Brussels workshop: local citizen participation',
  },
  detail: {
    back: 'All events',
    badges: (e) => [
      en.types[e.type],
      en.formats[e.format],
      e.langs.map((l) => l.toUpperCase()).join(' / '),
    ],
    eyebrow: 'Democracy Together',
    leadFallback:
      'A Democracy Together network gathering. Detailed programme and registration coming soon.',
    factDate: 'Date',
    factPlace: 'Venue',
    factFormat: 'Format',
    register: 'Register',
    seeProgramme: 'See the programme',
    visualPin: 'Paris · 2026',
    visualCap:
      "Illustrative image. Conference venue: Paris, the network's seat.",
    sections: {
      day: 'The day',
      programme: 'Detailed programme',
      speakers: 'Speakers',
      infos: 'Practical info',
    },
    founderBadge: 'Founder',
    related: 'Other gatherings',
    resources: 'Replays and resources',
    conf: {
      lead: 'A day to publicly found the network: think tanks from Africa and Europe, researchers, public officials and engaged young people, gathered to think about and defend democracy.',
      dayIntro: [
        'The inaugural conference marks the official birth of Democracy Together. Over one day, the network presents its purpose, its first work and its method: connecting think tanks from Africa and Europe to produce shared, citable democratic thinking.',
        'The morning is devoted to framing plenaries: the state of democracy across the two continents, the launch of the Democracy Together Barometer and of the open-access library. The afternoon favours small-group work: thematic workshops, an intergenerational round table, then a public report-back. The day closes on a roadmap and a call for contributions.',
        'The event gathers around 280 expected participants (illustration figure), with a live broadcast for members unable to travel.',
      ],
      progIntro:
        'Paris time (CET). Provisional programme, subject to adjustments until the opening.',
      programme: [
        {
          time: '08:30',
          dur: '45 min',
          kind: 'Welcome',
          title: 'Welcome and coffee',
          body: 'Check-in, badge pick-up and welcome coffee in the hall. Network and open-access library stand.',
        },
        {
          time: '09:15',
          dur: '30 min',
          kind: 'Plenary',
          title: 'Opening: why a network, now',
          body: 'Welcome from the founders and presentation of the Democracy Together mission. Framing of the day and the announced commitments.',
          who: 'With Abdou Samb, Philippe Kourilsky and Pierre Vimont.',
        },
        {
          time: '09:45',
          dur: '75 min',
          kind: 'Plenary',
          title: 'The state of democracy, Africa and Europe',
          body: 'Presentation of the main findings of the first joint report and public launch of the Democracy Together Barometer, with a cross-reading of the indicators.',
          who: 'A network expert panel, followed by an exchange with the room.',
        },
        {
          time: '11:00',
          dur: '20 min',
          kind: 'Break',
          title: 'Break',
          body: 'Coffee break and informal encounters.',
        },
        {
          time: '11:20',
          dur: '70 min',
          kind: 'Workshops',
          title: 'Parallel workshops (your choice)',
          body: 'Four small-group workshops: digital governance, citizen participation, anti-corruption, democratic transitions. Workshop chosen at registration.',
          who: 'Led by the network pillar coordinators.',
        },
        {
          time: '12:30',
          dur: '90 min',
          kind: 'Lunch',
          title: 'Lunch',
          body: 'Standing lunch on site, vegetarian and halal options. Press area open.',
        },
        {
          time: '14:00',
          dur: '80 min',
          kind: 'Round table',
          title: 'Democracy and generations: passing on, contesting, renewing',
          body: "An intergenerational dialogue between founders, researchers and the network's young members on the place of new generations in democratic life.",
          who: 'Moderated by the network editorial team.',
        },
        {
          time: '15:20',
          dur: '40 min',
          kind: 'Plenary',
          title: 'Workshop report-back',
          body: 'Public synthesis of the four workshops and first work avenues for the network groups.',
        },
        {
          time: '16:00',
          dur: '45 min',
          kind: 'Closing',
          title: 'Roadmap and call for contributions',
          body: 'Announcement of upcoming events, partnerships and the call for contributions to the library. Closing of the day.',
        },
        {
          time: '16:45',
          dur: '75 min',
          kind: 'Reception',
          title: 'Reception and networking',
          body: 'A friendly reception to extend exchanges between members, partners and new contributors.',
        },
      ],
      speakersIntro:
        'Programming in progress. Founders and first confirmed speakers below (indicative list).',
      speakers: [
        {
          initials: 'AS',
          name: 'Abdou Samb',
          role: 'Co-founder of Democracy Together. Opening and closing of the day.',
          founder: true,
        },
        {
          initials: 'PK',
          name: 'Philippe Kourilsky',
          role: 'Co-founder of Democracy Together. Opening plenary.',
          founder: true,
        },
        {
          initials: 'PV',
          name: 'Pierre Vimont',
          role: 'Co-founder of Democracy Together. Opening plenary and round table.',
          founder: true,
        },
        {
          initials: 'KM',
          name: 'Khady Mensah',
          role: 'Coordinator of the Digital Governance pillar. Afternoon workshop.',
        },
        {
          initials: 'LT',
          name: 'Lassana Traoré',
          role: 'Researcher, Anti-corruption pillar. Morning plenary.',
        },
        {
          initials: 'SD',
          name: 'Sira Diallo',
          role: 'Youth Hub delegate. Intergenerational round table.',
        },
      ],
      infos: [
        {
          ic: 'Venue',
          title: 'Maison des congrès, Paris 8e',
          body: 'Exact address and access map sent to registered attendees by email, one week before the event.',
        },
        {
          ic: 'Access',
          title: 'Public transport',
          body: "Metro and RER nearby, station less than five minutes' walk away. Secure bike parking. No visitor car park on site.",
        },
        {
          ic: 'Accessibility',
          title: 'Wheelchair-accessible venue',
          body: 'Step-free rooms, lifts and adapted toilets. Hearing loop in plenary. For any specific need, contact the team at registration.',
        },
        {
          ic: 'Languages',
          title: 'French and English',
          body: 'Plenaries with simultaneous FR / EN interpretation. Workshops held in the language announced for each group.',
        },
        {
          ic: 'Catering',
          title: 'Lunch and breaks included',
          body: 'Welcome coffee, breaks and standing lunch included in the registration. Vegetarian and halal options offered.',
        },
        {
          ic: 'Live',
          title: 'Broadcast for members',
          body: 'Plenaries are broadcast live for remote members. Access link sent the day before.',
        },
      ],
      ticket: {
        eyebrow: 'Tickets',
        title: 'Registration',
        legend: 'Ticket type',
        tiers: [
          {
            name: 'Democracy Together member',
            desc: 'Membership up to date',
            price: 'Free',
          },
          { name: 'Standard', desc: 'Full price, full day', price: '€45' },
          { name: 'Student / youth', desc: 'On proof, under 28', price: '€15' },
        ],
        disclaimer:
          'Indicative prices, illustration data. No payment is taken on this mock-up. Free tickets remain subject to confirmation of available seats.',
        reserve: 'Book',
      },
      recap: [
        { k: 'Date', v: 'Sat. 14 Nov. 2026' },
        { k: 'Time', v: '08:30 to 18:00' },
        { k: 'Venue', v: 'Paris 8e, France' },
        { k: 'Format', v: 'In person · live for members' },
      ],
      resources: [
        {
          title: 'Plenary replays',
          body: 'Available a few days after the event, open access.',
        },
        {
          title: 'Workshop materials',
          body: 'Notes and presentations shared with participants.',
        },
        {
          title: 'Day synthesis',
          body: 'Public report published in the library.',
        },
      ],
    },
  },
};

const es: Labels = {
  hero: {
    crumbHome: 'Inicio',
    eyebrow: 'Agenda',
    title: 'Eventos',
    lead: 'Una cumbre mundial anual en París, seminarios web temáticos abiertos a todos y talleres regionales en Dakar y Bruselas. El calendario de los encuentros de la red, próximos y en diferido.',
    searchPlaceholder: 'Buscar un título, una ciudad, un tema…',
    searchCta: 'Buscar',
  },
  featuredBadge: 'Destacado · Cumbre',
  featured: {
    kicker: 'Conferencia inaugural · Presencial y difusión en línea',
    title: 'Conferencia inaugural de Democracy Together',
    body: 'Dos días de debates entre centros de estudios de África y de Europa, mesas redondas públicas y talleres de trabajo. Apertura a cargo de los miembros fundadores, presentación del Barómetro anual y firma de la carta de la red.',
    facts: [
      { k: 'Fechas', v: '12 y 13 nov. 2026' },
      { k: 'Lugar', v: 'París, Francia' },
      { k: 'Idiomas', v: 'FR / EN' },
      { k: 'Acceso', v: 'Previa inscripción' },
    ],
    register: 'Inscribirse',
    details: 'Detalles',
  },
  filter: {
    title: 'Filtrar',
    reset: 'Restablecer',
    upcoming: 'Próximos',
    past: 'Pasados',
    type: 'Tipo',
    region: 'Región',
    format: 'Formato',
    lang: 'Idioma',
  },
  results: {
    title: 'Resultados',
    countUpcomingOne: 'evento próximo',
    countUpcomingMany: 'eventos próximos',
    countPastOne: 'evento pasado',
    countPastMany: 'eventos pasados',
    sortLabel: 'Ordenar por',
    sorts: {
      'date-asc': 'Fecha, más cercana',
      'date-desc': 'Fecha, más lejana',
      az: 'Título A → Z',
    },
    details: 'Detalles',
    empty: 'Ningún evento coincide con estos filtros.',
    emptyReset: 'Restablecer los filtros',
  },
  replays: {
    eyebrow: 'Repeticiones',
    title: 'Repeticiones de los eventos pasados',
    cta: 'Ver todos los recursos',
    watch: '▶ Ver la repetición',
    durationLabel: (m) =>
      m >= 60
        ? `duración ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`
        : `duración ${m} min`,
    note: 'Datos de ilustración. Las repeticiones y duraciones son ficticias.',
  },
  types: {
    sommet: 'Cumbre',
    webinaire: 'Seminario web',
    atelier: 'Taller regional',
  },
  regions: { afrique: 'África', europe: 'Europa', 'en-ligne': 'En línea' },
  formats: {
    presentiel: 'Presencial',
    'en-ligne': 'En línea',
    hybride: 'Híbrido',
  },
  themes: {
    'vie-reseau': 'Vida de la red',
    'gouvernance-numerique': 'Gobernanza digital',
    participation: 'Participación ciudadana',
    'anti-corruption': 'Lucha contra la corrupción',
    transitions: 'Transiciones democráticas',
    crises: 'Crisis globales',
  },
  cities: {
    paris: 'París',
    dakar: 'Dakar',
    bruxelles: 'Bruselas',
    online: 'En línea',
    'dakar-online': 'Dakar y en línea',
  },
  langName: { fr: 'Francés', en: 'Inglés' },
  titles: {
    'conference-inaugurale': 'Conferencia inaugural de Democracy Together',
    'webinaire-gouvernance-plateformes':
      'Seminario web: gobernanza de las plataformas después de la IA',
    'atelier-dakar-transparence-budgetaire':
      'Taller regional de Dakar: transparencia presupuestaria',
    'atelier-bruxelles-democratie-ue':
      'Taller de Bruselas: democracia y políticas de la UE',
    'webinaire-jeunes-releve':
      'Seminario web joven: el relevo en el centro del debate',
    'atelier-dakar-integrite-electorale':
      'Taller regional de Dakar: integridad electoral',
    'webinaire-desinformation-confiance':
      'Seminario web: desinformación y confianza cívica',
    'atelier-bruxelles-souverainete-numerique':
      'Taller de Bruselas: soberanía digital europea',
    'webinaire-financer-societe-civile':
      'Seminario web: financiar la sociedad civil en África Occidental',
    'restitution-barometre-annuel':
      'Presentación del Barómetro anual de la democracia',
    'ia-generative-integrite-information':
      'IA generativa e integridad de la información',
    'atelier-dakar-financer-societe-civile':
      'Taller regional de Dakar: financiar la sociedad civil',
    'reguler-plateformes-debat-public':
      'Regular las plataformas sin debilitar el debate público',
    'atelier-bruxelles-participation-locale':
      'Taller de Bruselas: participación ciudadana local',
  },
  detail: {
    back: 'Todos los eventos',
    badges: (e) => [
      es.types[e.type],
      es.formats[e.format],
      e.langs.map((l) => l.toUpperCase()).join(' / '),
    ],
    eyebrow: 'Democracy Together',
    leadFallback:
      'Encuentro de la red Democracy Together. Programa detallado e inscripción próximamente.',
    factDate: 'Fecha',
    factPlace: 'Lugar',
    factFormat: 'Formato',
    register: 'Inscribirse',
    seeProgramme: 'Ver el programa',
    visualPin: 'París · 2026',
    visualCap:
      'Imagen de ilustración. Sede de la conferencia: París, sede de la red.',
    sections: {
      day: 'La jornada',
      programme: 'Programa detallado',
      speakers: 'Ponentes',
      infos: 'Información práctica',
    },
    founderBadge: 'Fundador',
    related: 'Otras citas',
    resources: 'Repeticiones y recursos',
    conf: {
      lead: 'Una jornada para fundar públicamente la red: centros de estudios de África y de Europa, investigadores, responsables públicos y jóvenes comprometidos, reunidos para pensar y defender la democracia.',
      dayIntro: [
        'La conferencia inaugural marca el nacimiento oficial de Democracy Together. Durante una jornada, la red presenta su razón de ser, sus primeros trabajos y su método: conectar centros de estudios de África y de Europa para producir un pensamiento democrático compartido y citable.',
        'La mañana se dedica a los plenarios de encuadre: estado de la democracia entre los dos continentes, presentación del Barómetro Democracy Together y de la biblioteca en acceso abierto. La tarde privilegia el trabajo en grupos reducidos: talleres temáticos, mesa redonda intergeneracional y luego puesta en común pública. La jornada se cierra con una hoja de ruta y una convocatoria de contribuciones.',
        'El evento reúne a unos 280 participantes previstos (dato de ilustración), con emisión en directo para los miembros que no puedan desplazarse.',
      ],
      progIntro:
        'Horario de París (CET). Programa provisional, sujeto a ajustes hasta la apertura.',
      programme: [
        {
          time: '08:30',
          dur: '45 min',
          kind: 'Acogida',
          title: 'Acogida de los participantes y café',
          body: 'Registro, entrega de acreditaciones y café de bienvenida en el vestíbulo. Puesto de la red y de la biblioteca en acceso abierto.',
        },
        {
          time: '09:15',
          dur: '30 min',
          kind: 'Plenario',
          title: 'Apertura: por qué una red, y por qué ahora',
          body: 'Palabras de bienvenida de los fundadores y presentación de la misión de Democracy Together. Encuadre de la jornada y de los compromisos anunciados.',
          who: 'Con Abdou Samb, Philippe Kourilsky y Pierre Vimont.',
        },
        {
          time: '09:45',
          dur: '75 min',
          kind: 'Plenario',
          title: 'El estado de la democracia, África y Europa',
          body: 'Presentación de las grandes constataciones del primer informe conjunto y lanzamiento público del Barómetro Democracy Together, con lectura cruzada de los indicadores.',
          who: 'Mesa de expertos de la red, seguida de un intercambio con la sala.',
        },
        {
          time: '11:00',
          dur: '20 min',
          kind: 'Pausa',
          title: 'Pausa',
          body: 'Pausa para el café y encuentros informales.',
        },
        {
          time: '11:20',
          dur: '70 min',
          kind: 'Talleres',
          title: 'Talleres paralelos (a elegir)',
          body: 'Cuatro talleres en grupos reducidos: gobernanza digital, participación ciudadana, lucha contra la corrupción, transiciones democráticas. La elección del taller se hace al inscribirse.',
          who: 'Dinamizados por los coordinadores de las áreas de la red.',
        },
        {
          time: '12:30',
          dur: '90 min',
          kind: 'Almuerzo',
          title: 'Almuerzo',
          body: 'Almuerzo de pie en el lugar, con opciones vegetarianas y halal. Sala de prensa abierta.',
        },
        {
          time: '14:00',
          dur: '80 min',
          kind: 'Mesa redonda',
          title: 'Democracia y generaciones: transmitir, cuestionar, renovar',
          body: 'Diálogo intergeneracional entre fundadores, investigadores y jóvenes de la red sobre el lugar de las nuevas generaciones en la vida democrática.',
          who: 'Moderación a cargo de la redacción de la red.',
        },
        {
          time: '15:20',
          dur: '40 min',
          kind: 'Plenario',
          title: 'Puesta en común de los talleres',
          body: 'Síntesis pública de los cuatro talleres y primeras líneas de trabajo para los grupos de la red.',
        },
        {
          time: '16:00',
          dur: '45 min',
          kind: 'Clausura',
          title: 'Hoja de ruta y convocatoria de contribuciones',
          body: 'Anuncio de las próximas citas, de las alianzas y de la convocatoria de contribuciones para la biblioteca. Clausura de la jornada.',
        },
        {
          time: '16:45',
          dur: '75 min',
          kind: 'Recepción',
          title: 'Recepción y contactos',
          body: 'Recepción distendida para prolongar los intercambios entre miembros, socios y nuevos contribuidores.',
        },
      ],
      speakersIntro:
        'Programación en curso. Fundadores y primeros ponentes confirmados a continuación (lista orientativa).',
      speakers: [
        {
          initials: 'AS',
          name: 'Abdou Samb',
          role: 'Cofundador de Democracy Together. Apertura y clausura de la jornada.',
          founder: true,
        },
        {
          initials: 'PK',
          name: 'Philippe Kourilsky',
          role: 'Cofundador de Democracy Together. Plenario de apertura.',
          founder: true,
        },
        {
          initials: 'PV',
          name: 'Pierre Vimont',
          role: 'Cofundador de Democracy Together. Plenario de apertura y mesa redonda.',
          founder: true,
        },
        {
          initials: 'KM',
          name: 'Khady Mensah',
          role: 'Coordinadora del área de Gobernanza digital. Taller de la tarde.',
        },
        {
          initials: 'LT',
          name: 'Lassana Traoré',
          role: 'Investigador, área de Lucha contra la corrupción. Plenario de la mañana.',
        },
        {
          initials: 'SD',
          name: 'Sira Diallo',
          role: 'Delegada del Hub joven. Mesa redonda intergeneracional.',
        },
      ],
      infos: [
        {
          ic: 'Lugar',
          title: 'Maison des congrès, París 8º',
          body: 'La dirección exacta y el plano de acceso se comunican por correo a las personas inscritas una semana antes del evento.',
        },
        {
          ic: 'Acceso',
          title: 'Transporte público',
          body: 'Metro y RER cerca, estación a menos de cinco minutos a pie. Aparcamiento seguro para bicicletas. No hay aparcamiento para visitantes en el lugar.',
        },
        {
          ic: 'Accesibilidad',
          title: 'Sede accesible para personas con movilidad reducida',
          body: 'Salas a nivel, ascensores y aseos adaptados. Bucle magnético en los plenarios. Para cualquier necesidad específica, contacte con el equipo al inscribirse.',
        },
        {
          ic: 'Idiomas',
          title: 'Francés e inglés',
          body: 'Plenarios con interpretación simultánea FR / EN. Los talleres se celebran en el idioma anunciado para cada grupo.',
        },
        {
          ic: 'Restauración',
          title: 'Almuerzo y pausas incluidos',
          body: 'Café de bienvenida, pausas y almuerzo de pie incluidos en la inscripción. Se ofrecen opciones vegetarianas y halal.',
        },
        {
          ic: 'En directo',
          title: 'Emisión para los miembros',
          body: 'Los plenarios se emiten en directo para los miembros a distancia. El enlace de acceso se envía la víspera.',
        },
      ],
      ticket: {
        eyebrow: 'Entradas',
        title: 'Inscripción',
        legend: 'Tipo de entrada',
        tiers: [
          {
            name: 'Miembro de Democracy Together',
            desc: 'Cuota al corriente',
            price: 'Gratuita',
          },
          {
            name: 'Estándar',
            desc: 'Tarifa completa, jornada entera',
            price: '45 €',
          },
          {
            name: 'Estudiante / joven',
            desc: 'Con justificante, menores de 28 años',
            price: '15 €',
          },
        ],
        disclaimer:
          'Tarifas orientativas, datos de ilustración. No se efectúa ningún pago en esta maqueta. Las entradas gratuitas siguen sujetas a confirmación de plazas disponibles.',
        reserve: 'Reservar',
      },
      recap: [
        { k: 'Fecha', v: 'Sáb. 14 nov. 2026' },
        { k: 'Horario', v: '08:30 a 18:00' },
        { k: 'Lugar', v: 'París 8º, Francia' },
        { k: 'Formato', v: 'Presencial · directo para miembros' },
      ],
      resources: [
        {
          title: 'Repeticiones de los plenarios',
          body: 'Disponibles unos días después del evento, en acceso abierto.',
        },
        {
          title: 'Materiales de los talleres',
          body: 'Notas y presentaciones compartidas con los participantes.',
        },
        {
          title: 'Síntesis de la jornada',
          body: 'Acta pública publicada en la biblioteca.',
        },
      ],
    },
  },
};

const pt: Labels = {
  hero: {
    crumbHome: 'Início',
    eyebrow: 'Agenda',
    title: 'Eventos',
    lead: 'Uma cimeira mundial anual em Paris, seminários online temáticos abertos a todos e oficinas regionais em Dakar e Bruxelas. O calendário dos encontros da rede, futuros e em diferido.',
    searchPlaceholder: 'Procurar um título, uma cidade, um tema…',
    searchCta: 'Procurar',
  },
  featuredBadge: 'Em destaque · Cimeira',
  featured: {
    kicker: 'Conferência inaugural · Presencial e difusão em linha',
    title: 'Conferência inaugural da Democracy Together',
    body: 'Dois dias de debates entre centros de estudos de África e da Europa, mesas-redondas públicas e oficinas de trabalho. Abertura pelos membros fundadores, apresentação do Barómetro anual e assinatura da carta da rede.',
    facts: [
      { k: 'Datas', v: '12 e 13 nov. 2026' },
      { k: 'Local', v: 'Paris, França' },
      { k: 'Línguas', v: 'FR / EN' },
      { k: 'Acesso', v: 'Mediante inscrição' },
    ],
    register: 'Inscrever-me',
    details: 'Detalhes',
  },
  filter: {
    title: 'Filtrar',
    reset: 'Repor',
    upcoming: 'Futuros',
    past: 'Passados',
    type: 'Tipo',
    region: 'Região',
    format: 'Formato',
    lang: 'Língua',
  },
  results: {
    title: 'Resultados',
    countUpcomingOne: 'evento futuro',
    countUpcomingMany: 'eventos futuros',
    countPastOne: 'evento passado',
    countPastMany: 'eventos passados',
    sortLabel: 'Ordenar por',
    sorts: {
      'date-asc': 'Data, mais próxima',
      'date-desc': 'Data, mais distante',
      az: 'Título A → Z',
    },
    details: 'Detalhes',
    empty: 'Nenhum evento corresponde a estes filtros.',
    emptyReset: 'Repor os filtros',
  },
  replays: {
    eyebrow: 'Repetições',
    title: 'Repetições dos eventos passados',
    cta: 'Ver todos os recursos',
    watch: '▶ Ver a repetição',
    durationLabel: (m) =>
      m >= 60
        ? `duração ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`
        : `duração ${m} min`,
    note: 'Dados de ilustração. As repetições e durações são fictícias.',
  },
  types: {
    sommet: 'Cimeira',
    webinaire: 'Seminário online',
    atelier: 'Oficina regional',
  },
  regions: { afrique: 'África', europe: 'Europa', 'en-ligne': 'Em linha' },
  formats: {
    presentiel: 'Presencial',
    'en-ligne': 'Em linha',
    hybride: 'Híbrido',
  },
  themes: {
    'vie-reseau': 'Vida da rede',
    'gouvernance-numerique': 'Governação digital',
    participation: 'Participação cidadã',
    'anti-corruption': 'Combate à corrupção',
    transitions: 'Transições democráticas',
    crises: 'Crises globais',
  },
  cities: {
    paris: 'Paris',
    dakar: 'Dakar',
    bruxelles: 'Bruxelas',
    online: 'Em linha',
    'dakar-online': 'Dakar e em linha',
  },
  langName: { fr: 'Francês', en: 'Inglês' },
  titles: {
    'conference-inaugurale': 'Conferência inaugural da Democracy Together',
    'webinaire-gouvernance-plateformes':
      'Seminário online: governação das plataformas depois da IA',
    'atelier-dakar-transparence-budgetaire':
      'Oficina regional de Dakar: transparência orçamental',
    'atelier-bruxelles-democratie-ue':
      'Oficina de Bruxelas: democracia e políticas da UE',
    'webinaire-jeunes-releve':
      'Seminário online jovem: a nova geração no centro do debate',
    'atelier-dakar-integrite-electorale':
      'Oficina regional de Dakar: integridade eleitoral',
    'webinaire-desinformation-confiance':
      'Seminário online: desinformação e confiança cívica',
    'atelier-bruxelles-souverainete-numerique':
      'Oficina de Bruxelas: soberania digital europeia',
    'webinaire-financer-societe-civile':
      'Seminário online: financiar a sociedade civil na África Ocidental',
    'restitution-barometre-annuel':
      'Apresentação do Barómetro anual da democracia',
    'ia-generative-integrite-information':
      'IA generativa e integridade da informação',
    'atelier-dakar-financer-societe-civile':
      'Oficina regional de Dakar: financiar a sociedade civil',
    'reguler-plateformes-debat-public':
      'Regular as plataformas sem enfraquecer o debate público',
    'atelier-bruxelles-participation-locale':
      'Oficina de Bruxelas: participação cidadã local',
  },
  detail: {
    back: 'Todos os eventos',
    badges: (e) => [
      pt.types[e.type],
      pt.formats[e.format],
      e.langs.map((l) => l.toUpperCase()).join(' / '),
    ],
    eyebrow: 'Democracy Together',
    leadFallback:
      'Encontro da rede Democracy Together. Programa detalhado e inscrição em breve.',
    factDate: 'Data',
    factPlace: 'Local',
    factFormat: 'Formato',
    register: 'Inscrever-me',
    seeProgramme: 'Ver o programa',
    visualPin: 'Paris · 2026',
    visualCap:
      'Imagem de ilustração. Local da conferência: Paris, sede da rede.',
    sections: {
      day: 'O dia',
      programme: 'Programa detalhado',
      speakers: 'Oradores',
      infos: 'Informações práticas',
    },
    founderBadge: 'Fundador',
    related: 'Outros encontros',
    resources: 'Repetições e recursos',
    conf: {
      lead: 'Um dia para fundar publicamente a rede: centros de estudos de África e da Europa, investigadores, responsáveis públicos e jovens empenhados, reunidos para pensar e defender a democracia.',
      dayIntro: [
        'A conferência inaugural marca o nascimento oficial da Democracy Together. Durante um dia, a rede apresenta a sua razão de ser, os seus primeiros trabalhos e o seu método: ligar centros de estudos de África e da Europa para produzir um pensamento democrático partilhado e citável.',
        'A manhã é dedicada aos plenários de enquadramento: estado da democracia entre os dois continentes, apresentação do Barómetro Democracy Together e da biblioteca em acesso aberto. A tarde privilegia o trabalho em pequenos grupos: oficinas temáticas, mesa-redonda intergeracional e depois partilha pública. O dia encerra com um roteiro e um apelo a contributos.',
        'O evento reúne cerca de 280 participantes previstos (dado de ilustração), com transmissão em direto para os membros que não possam deslocar-se.',
      ],
      progIntro:
        'Horas de Paris (CET). Programa provisório, sujeito a ajustes até à abertura.',
      programme: [
        {
          time: '08:30',
          dur: '45 min',
          kind: 'Acolhimento',
          title: 'Acolhimento dos participantes e café',
          body: 'Registo, entrega de crachás e café de boas-vindas no átrio. Banca da rede e da biblioteca em acesso aberto.',
        },
        {
          time: '09:15',
          dur: '30 min',
          kind: 'Plenário',
          title: 'Abertura: porquê uma rede, e porquê agora',
          body: 'Palavras de boas-vindas dos fundadores e apresentação da missão da Democracy Together. Enquadramento do dia e dos compromissos anunciados.',
          who: 'Com Abdou Samb, Philippe Kourilsky e Pierre Vimont.',
        },
        {
          time: '09:45',
          dur: '75 min',
          kind: 'Plenário',
          title: 'O estado da democracia, África e Europa',
          body: 'Apresentação das grandes constatações do primeiro relatório conjunto e lançamento público do Barómetro Democracy Together, com leitura cruzada dos indicadores.',
          who: 'Mesa de peritos da rede, seguida de troca de impressões com a sala.',
        },
        {
          time: '11:00',
          dur: '20 min',
          kind: 'Pausa',
          title: 'Pausa',
          body: 'Pausa para café e encontros informais.',
        },
        {
          time: '11:20',
          dur: '70 min',
          kind: 'Oficinas',
          title: 'Oficinas paralelas (à escolha)',
          body: 'Quatro oficinas em pequenos grupos: governação digital, participação cidadã, combate à corrupção, transições democráticas. A escolha da oficina faz-se na inscrição.',
          who: 'Dinamizadas pelos coordenadores dos polos da rede.',
        },
        {
          time: '12:30',
          dur: '90 min',
          kind: 'Almoço',
          title: 'Almoço',
          body: 'Almoço volante no local, com opções vegetarianas e halal. Sala de imprensa aberta.',
        },
        {
          time: '14:00',
          dur: '80 min',
          kind: 'Mesa-redonda',
          title: 'Democracia e gerações: transmitir, contestar, renovar',
          body: 'Diálogo intergeracional entre fundadores, investigadores e jovens da rede sobre o lugar das novas gerações na vida democrática.',
          who: 'Moderação assegurada pela redação da rede.',
        },
        {
          time: '15:20',
          dur: '40 min',
          kind: 'Plenário',
          title: 'Partilha das oficinas',
          body: 'Síntese pública das quatro oficinas e primeiras pistas de trabalho para os grupos da rede.',
        },
        {
          time: '16:00',
          dur: '45 min',
          kind: 'Encerramento',
          title: 'Roteiro e apelo a contributos',
          body: 'Anúncio dos próximos encontros, das parcerias e do apelo a contributos para a biblioteca. Encerramento do dia.',
        },
        {
          time: '16:45',
          dur: '75 min',
          kind: 'Receção',
          title: 'Receção e contactos',
          body: 'Receção descontraída para prolongar as trocas entre membros, parceiros e novos contribuidores.',
        },
      ],
      speakersIntro:
        'Programação em curso. Fundadores e primeiros oradores confirmados abaixo (lista indicativa).',
      speakers: [
        {
          initials: 'AS',
          name: 'Abdou Samb',
          role: 'Cofundador da Democracy Together. Abertura e encerramento do dia.',
          founder: true,
        },
        {
          initials: 'PK',
          name: 'Philippe Kourilsky',
          role: 'Cofundador da Democracy Together. Plenário de abertura.',
          founder: true,
        },
        {
          initials: 'PV',
          name: 'Pierre Vimont',
          role: 'Cofundador da Democracy Together. Plenário de abertura e mesa-redonda.',
          founder: true,
        },
        {
          initials: 'KM',
          name: 'Khady Mensah',
          role: 'Coordenadora do polo Governação digital. Oficina da tarde.',
        },
        {
          initials: 'LT',
          name: 'Lassana Traoré',
          role: 'Investigador, polo Combate à corrupção. Plenário da manhã.',
        },
        {
          initials: 'SD',
          name: 'Sira Diallo',
          role: 'Delegada do Hub jovem. Mesa-redonda intergeracional.',
        },
      ],
      infos: [
        {
          ic: 'Local',
          title: 'Maison des congrès, Paris 8.º',
          body: 'A morada exata e o plano de acesso são comunicados por correio eletrónico às pessoas inscritas, uma semana antes do evento.',
        },
        {
          ic: 'Acesso',
          title: 'Transportes públicos',
          body: 'Metro e RER nas imediações, estação a menos de cinco minutos a pé. Estacionamento seguro para bicicletas. Não há parque para visitantes no local.',
        },
        {
          ic: 'Acessibilidade',
          title: 'Instalações acessíveis a pessoas com mobilidade reduzida',
          body: 'Salas ao nível do solo, elevadores e instalações sanitárias adaptadas. Anel magnético nos plenários. Para qualquer necessidade específica, contacte a equipa na inscrição.',
        },
        {
          ic: 'Línguas',
          title: 'Francês e inglês',
          body: 'Plenários com interpretação simultânea FR / EN. As oficinas decorrem na língua anunciada para cada grupo.',
        },
        {
          ic: 'Restauração',
          title: 'Almoço e pausas incluídos',
          body: 'Café de boas-vindas, pausas e almoço volante incluídos na inscrição. São propostas opções vegetarianas e halal.',
        },
        {
          ic: 'Em direto',
          title: 'Transmissão para os membros',
          body: 'Os plenários são transmitidos em direto para os membros à distância. A ligação de acesso é enviada na véspera.',
        },
      ],
      ticket: {
        eyebrow: 'Bilhética',
        title: 'Inscrição',
        legend: 'Tipo de bilhete',
        tiers: [
          {
            name: 'Membro da Democracy Together',
            desc: 'Quota em dia',
            price: 'Gratuito',
          },
          {
            name: 'Normal',
            desc: 'Preço inteiro, dia completo',
            price: '45 €',
          },
          {
            name: 'Estudante / jovem',
            desc: 'Mediante comprovativo, menos de 28 anos',
            price: '15 €',
          },
        ],
        disclaimer:
          'Preços indicativos, dados de ilustração. Nenhum pagamento é efetuado nesta maqueta. Os bilhetes gratuitos continuam sujeitos a confirmação de lugares disponíveis.',
        reserve: 'Reservar',
      },
      recap: [
        { k: 'Data', v: 'Sáb. 14 nov. 2026' },
        { k: 'Horário', v: '08:30 às 18:00' },
        { k: 'Local', v: 'Paris 8.º, França' },
        { k: 'Formato', v: 'Presencial · direto para membros' },
      ],
      resources: [
        {
          title: 'Repetições dos plenários',
          body: 'Disponíveis alguns dias após o evento, em acesso aberto.',
        },
        {
          title: 'Materiais das oficinas',
          body: 'Notas e apresentações partilhadas com os participantes.',
        },
        {
          title: 'Síntese do dia',
          body: 'Relatório público publicado na biblioteca.',
        },
      ],
    },
  },
};

const ar: Labels = {
  hero: {
    crumbHome: 'الرئيسية',
    eyebrow: 'الأجندة',
    title: 'الفعاليات',
    lead: 'قمة عالمية سنوية بباريس، وندوات مواضيعية عبر الإنترنت مفتوحة للجميع، وورشات جهوية بداكار وبروكسل. أجندة لقاءات الشبكة، المقبلة منها والمتاحة لإعادة المشاهدة.',
    searchPlaceholder: 'ابحثوا عن عنوان أو مدينة أو موضوع…',
    searchCta: 'بحث',
  },
  featuredBadge: 'في الواجهة · قمة',
  featured: {
    kicker: 'المؤتمر التأسيسي · حضورياً وببث مباشر',
    title: 'المؤتمر التأسيسي لـ Democracy Together',
    body: 'يومان من النقاش بين مراكز دراسات من أفريقيا وأوروبا، وموائد مستديرة عمومية، وورشات عمل. الافتتاح على يد الأعضاء المؤسسين، وعرض المؤشر السنوي، وتوقيع ميثاق الشبكة.',
    facts: [
      { k: 'التواريخ', v: '12 و13 نونبر 2026' },
      { k: 'المكان', v: 'باريس، فرنسا' },
      { k: 'اللغات', v: 'FR / EN' },
      { k: 'الولوج', v: 'بالتسجيل المسبق' },
    ],
    register: 'التسجيل',
    details: 'التفاصيل',
  },
  filter: {
    title: 'تصفية',
    reset: 'إعادة الضبط',
    upcoming: 'القادمة',
    past: 'المنصرمة',
    type: 'النوع',
    region: 'المنطقة',
    format: 'الصيغة',
    lang: 'اللغة',
  },
  results: {
    title: 'النتائج',
    countUpcomingOne: 'فعالية قادمة',
    countUpcomingMany: 'فعاليات قادمة',
    countPastOne: 'فعالية منصرمة',
    countPastMany: 'فعاليات منصرمة',
    sortLabel: 'الترتيب حسب',
    sorts: {
      'date-asc': 'التاريخ، الأقرب',
      'date-desc': 'التاريخ، الأبعد',
      az: 'العنوان أبجدياً',
    },
    details: 'التفاصيل',
    empty: 'لا توجد فعالية تطابق هذه المرشحات.',
    emptyReset: 'إعادة ضبط المرشحات',
  },
  replays: {
    eyebrow: 'إعادة المشاهدة',
    title: 'تسجيلات الفعاليات المنصرمة',
    cta: 'الاطلاع على كل الموارد',
    watch: '▶ مشاهدة التسجيل',
    durationLabel: (m) =>
      m >= 60
        ? `المدة ${Math.floor(m / 60)} س ${String(m % 60).padStart(2, '0')}`
        : `المدة ${m} د`,
    note: 'بيانات توضيحية. التسجيلات والمدد افتراضية.',
  },
  types: {
    sommet: 'قمة',
    webinaire: 'ندوة عبر الإنترنت',
    atelier: 'ورشة جهوية',
  },
  regions: { afrique: 'أفريقيا', europe: 'أوروبا', 'en-ligne': 'عن بُعد' },
  formats: {
    presentiel: 'حضورياً',
    'en-ligne': 'عن بُعد',
    hybride: 'مختلط',
  },
  themes: {
    'vie-reseau': 'حياة الشبكة',
    'gouvernance-numerique': 'الحوكمة الرقمية',
    participation: 'المشاركة المواطنة',
    'anti-corruption': 'مكافحة الفساد',
    transitions: 'الانتقالات الديمقراطية',
    crises: 'الأزمات العالمية',
  },
  cities: {
    paris: 'باريس',
    dakar: 'داكار',
    bruxelles: 'بروكسل',
    online: 'عن بُعد',
    'dakar-online': 'داكار وعن بُعد',
  },
  langName: { fr: 'الفرنسية', en: 'الإنجليزية' },
  titles: {
    'conference-inaugurale': 'المؤتمر التأسيسي لـ Democracy Together',
    'webinaire-gouvernance-plateformes':
      'ندوة: حوكمة المنصات بعد الذكاء الاصطناعي',
    'atelier-dakar-transparence-budgetaire':
      'ورشة داكار الجهوية: شفافية الميزانية',
    'atelier-bruxelles-democratie-ue':
      'ورشة بروكسل: الديمقراطية وسياسات الاتحاد الأوروبي',
    'webinaire-jeunes-releve': 'ندوة الشباب: الجيل الصاعد في صلب النقاش',
    'atelier-dakar-integrite-electorale':
      'ورشة داكار الجهوية: نزاهة الانتخابات',
    'webinaire-desinformation-confiance': 'ندوة: التضليل والثقة المدنية',
    'atelier-bruxelles-souverainete-numerique':
      'ورشة بروكسل: السيادة الرقمية الأوروبية',
    'webinaire-financer-societe-civile':
      'ندوة: تمويل المجتمع المدني في غرب أفريقيا',
    'restitution-barometre-annuel': 'عرض المؤشر السنوي للديمقراطية',
    'ia-generative-integrite-information':
      'الذكاء الاصطناعي التوليدي ونزاهة المعلومة',
    'atelier-dakar-financer-societe-civile':
      'ورشة داكار الجهوية: تمويل المجتمع المدني',
    'reguler-plateformes-debat-public':
      'تنظيم المنصات دون إضعاف النقاش العمومي',
    'atelier-bruxelles-participation-locale':
      'ورشة بروكسل: المشاركة المواطنة المحلية',
  },
  detail: {
    back: 'كل الفعاليات',
    badges: (e) => [
      ar.types[e.type],
      ar.formats[e.format],
      e.langs.map((l) => l.toUpperCase()).join(' / '),
    ],
    eyebrow: 'Democracy Together',
    leadFallback:
      'لقاء لشبكة Democracy Together. البرنامج المفصّل والتسجيل قريباً.',
    factDate: 'التاريخ',
    factPlace: 'المكان',
    factFormat: 'الصيغة',
    register: 'التسجيل',
    seeProgramme: 'الاطلاع على البرنامج',
    visualPin: 'باريس · 2026',
    visualCap: 'صورة توضيحية. مكان انعقاد المؤتمر: باريس، مقر الشبكة.',
    sections: {
      day: 'برنامج اليوم',
      programme: 'البرنامج المفصّل',
      speakers: 'المتدخلون',
      infos: 'معلومات عملية',
    },
    founderBadge: 'عضو مؤسِّس',
    related: 'مواعيد أخرى',
    resources: 'التسجيلات والموارد',
    conf: {
      lead: 'يوم لتأسيس الشبكة علناً: مراكز دراسات من أفريقيا وأوروبا، وباحثون، ومسؤولون عموميون، وشباب منخرطون، يجتمعون للتفكير في الديمقراطية والدفاع عنها.',
      dayIntro: [
        'يشكّل المؤتمر التأسيسي الميلاد الرسمي لـ Democracy Together. وعلى مدى يوم كامل، تعرض الشبكة غايتها وأولى أعمالها ومنهجها: الربط بين مراكز دراسات من أفريقيا وأوروبا لإنتاج فكر ديمقراطي مشترك وقابل للاستشهاد.',
        'تُخصَّص الفترة الصباحية للجلسات العامة التأطيرية: حالة الديمقراطية بين القارتين، وتقديم مؤشر Democracy Together والمكتبة المفتوحة. أما فترة ما بعد الزوال فتُفضّل العمل في مجموعات صغيرة: ورشات مواضيعية، ومائدة مستديرة بين الأجيال، ثم عرض عمومي للخلاصات. ويُختتم اليوم بخارطة طريق ودعوة إلى المساهمة.',
        'يجمع الحدث نحو 280 مشاركاً متوقعاً (معطى توضيحي)، مع بث مباشر للأعضاء الذين يتعذّر عليهم الحضور.',
      ],
      progIntro:
        'التوقيت بتوقيت باريس (CET). برنامج مؤقت قابل للتعديل إلى حين الافتتاح.',
      programme: [
        {
          time: '08:30',
          dur: '45 د',
          kind: 'استقبال',
          title: 'استقبال المشاركين وقهوة',
          body: 'التسجيل، وتسليم الشارات، وقهوة الترحيب في البهو. ركن للشبكة وللمكتبة المفتوحة.',
        },
        {
          time: '09:15',
          dur: '30 د',
          kind: 'جلسة عامة',
          title: 'الافتتاح: لماذا شبكة، ولماذا الآن',
          body: 'كلمة ترحيب من المؤسسين وعرض لرسالة Democracy Together. تأطير اليوم والالتزامات المعلنة.',
          who: 'بمشاركة عبدو سامب وفيليب كوريلسكي وبيير فيمون.',
        },
        {
          time: '09:45',
          dur: '75 د',
          kind: 'جلسة عامة',
          title: 'حالة الديمقراطية في أفريقيا وأوروبا',
          body: 'عرض أبرز خلاصات التقرير المشترك الأول والإطلاق العلني لمؤشر Democracy Together، مع قراءة متقاطعة للمؤشرات الفرعية.',
          who: 'طاولة خبراء الشبكة، يليها نقاش مع الحاضرين.',
        },
        {
          time: '11:00',
          dur: '20 د',
          kind: 'استراحة',
          title: 'استراحة',
          body: 'استراحة قهوة ولقاءات غير رسمية.',
        },
        {
          time: '11:20',
          dur: '70 د',
          kind: 'ورشات',
          title: 'ورشات موازية (حسب الاختيار)',
          body: 'أربع ورشات في مجموعات صغيرة: الحوكمة الرقمية، والمشاركة المواطنة، ومكافحة الفساد، والانتقالات الديمقراطية. ويُحدَّد اختيار الورشة عند التسجيل.',
          who: 'ينشّطها منسقو أقطاب الشبكة.',
        },
        {
          time: '12:30',
          dur: '90 د',
          kind: 'غداء',
          title: 'غداء',
          body: 'غداء واقف بعين المكان، مع خيارات نباتية وحلال. فضاء الصحافة مفتوح.',
        },
        {
          time: '14:00',
          dur: '80 د',
          kind: 'مائدة مستديرة',
          title: 'الديمقراطية والأجيال: النقل والاعتراض والتجديد',
          body: 'حوار بين الأجيال يجمع المؤسسين والباحثين وشباب الشبكة حول موقع الأجيال الجديدة في الحياة الديمقراطية.',
          who: 'تتولى إدارته هيئة تحرير الشبكة.',
        },
        {
          time: '15:20',
          dur: '40 د',
          kind: 'جلسة عامة',
          title: 'عرض خلاصات الورشات',
          body: 'تركيب عمومي لأشغال الورشات الأربع وأولى مسارات العمل لمجموعات الشبكة.',
        },
        {
          time: '16:00',
          dur: '45 د',
          kind: 'اختتام',
          title: 'خارطة الطريق والدعوة إلى المساهمة',
          body: 'الإعلان عن المواعيد المقبلة والشراكات والدعوة إلى المساهمة في المكتبة. اختتام اليوم.',
        },
        {
          time: '16:45',
          dur: '75 د',
          kind: 'حفل استقبال',
          title: 'استقبال وتشبيك',
          body: 'حفل استقبال ودّي لتمديد التبادل بين الأعضاء والشركاء والمساهمين الجدد.',
        },
      ],
      speakersIntro:
        'البرمجة جارية. المؤسسون وأوائل المتدخلين المؤكَّدين أدناه (لائحة إرشادية).',
      speakers: [
        {
          initials: 'AS',
          name: 'عبدو سامب',
          role: 'شريك مؤسِّس لـ Democracy Together. افتتاح اليوم واختتامه.',
          founder: true,
        },
        {
          initials: 'PK',
          name: 'فيليب كوريلسكي',
          role: 'شريك مؤسِّس لـ Democracy Together. الجلسة العامة الافتتاحية.',
          founder: true,
        },
        {
          initials: 'PV',
          name: 'بيير فيمون',
          role: 'شريك مؤسِّس لـ Democracy Together. الجلسة الافتتاحية والمائدة المستديرة.',
          founder: true,
        },
        {
          initials: 'KM',
          name: 'خادي منساه',
          role: 'منسقة قطب الحوكمة الرقمية. ورشة ما بعد الزوال.',
        },
        {
          initials: 'LT',
          name: 'لسانا تراوري',
          role: 'باحث بقطب مكافحة الفساد. الجلسة العامة الصباحية.',
        },
        {
          initials: 'SD',
          name: 'سيرا ديالو',
          role: 'مندوبة فضاء الشباب. المائدة المستديرة بين الأجيال.',
        },
      ],
      infos: [
        {
          ic: 'المكان',
          title: 'دار المؤتمرات، الدائرة الثامنة بباريس',
          body: 'يُبلَّغ العنوان الدقيق وخريطة الوصول إلى المسجَّلين عبر البريد الإلكتروني، قبل أسبوع من الحدث.',
        },
        {
          ic: 'الوصول',
          title: 'النقل العمومي',
          body: 'الميترو والقطار الجهوي على مقربة، والمحطة على أقل من خمس دقائق مشياً. موقف دراجات آمن. لا يوجد موقف سيارات للزوار بعين المكان.',
        },
        {
          ic: 'إتاحة الوصول',
          title: 'فضاء مهيّأ للأشخاص ذوي الإعاقة الحركية',
          body: 'قاعات في المستوى نفسه، ومصاعد، ومرافق صحية مهيّأة. حلقة مغناطيسية في الجلسات العامة. ولأي حاجة خاصة، اتصلوا بالفريق عند التسجيل.',
        },
        {
          ic: 'اللغات',
          title: 'الفرنسية والإنجليزية',
          body: 'جلسات عامة بترجمة فورية FR / EN. وتُعقَد الورشات باللغة المعلنة لكل مجموعة.',
        },
        {
          ic: 'الإطعام',
          title: 'الغداء والاستراحات مشمولة',
          body: 'قهوة الترحيب والاستراحات والغداء الواقف مشمولة في التسجيل. وتُقترَح خيارات نباتية وحلال.',
        },
        {
          ic: 'البث المباشر',
          title: 'بث لفائدة الأعضاء',
          body: 'تُبثّ الجلسات العامة مباشرةً للأعضاء عن بُعد. ويُرسَل رابط الولوج في اليوم السابق.',
        },
      ],
      ticket: {
        eyebrow: 'التذاكر',
        title: 'التسجيل',
        legend: 'نوع التذكرة',
        tiers: [
          {
            name: 'عضو في Democracy Together',
            desc: 'اشتراك سارٍ',
            price: 'مجاناً',
          },
          {
            name: 'عادية',
            desc: 'التعرفة الكاملة، يوم كامل',
            price: '45 €',
          },
          {
            name: 'طالب / شاب',
            desc: 'بإثبات، دون 28 سنة',
            price: '15 €',
          },
        ],
        disclaimer:
          'تعرفات إرشادية وبيانات توضيحية. لا يُنجَز أي أداء في هذا النموذج الأولي. وتظل التذاكر المجانية رهينة بتأكيد توفر المقاعد.',
        reserve: 'الحجز',
      },
      recap: [
        { k: 'التاريخ', v: 'السبت 14 نونبر 2026' },
        { k: 'التوقيت', v: 'من 08:30 إلى 18:00' },
        { k: 'المكان', v: 'الدائرة الثامنة، باريس، فرنسا' },
        { k: 'الصيغة', v: 'حضورياً · بث مباشر للأعضاء' },
      ],
      resources: [
        {
          title: 'تسجيلات الجلسات العامة',
          body: 'متاحة بعد أيام قليلة من الحدث، في وصول مفتوح.',
        },
        {
          title: 'مواد الورشات',
          body: 'ملاحظات وعروض تُشارَك مع المشاركين.',
        },
        {
          title: 'تركيب اليوم',
          body: 'تقرير عمومي يُنشر في المكتبة.',
        },
      ],
    },
  },
};

// Table exhaustive par construction (cf. `projects-content.ts`).
const BY_LOCALE: Record<Locale, Labels> = { fr, en, es, pt, ar };

export function getEventsLabels(locale: Locale): Labels {
  return BY_LOCALE[locale];
}

// --- Filtres liste (URL-driven, comme la bibliothèque) ---
export const EVENT_FACETS = ['types', 'regions', 'formats', 'langs'] as const;
export type EventFacetKey = (typeof EVENT_FACETS)[number];
const EVENT_FACET_PARAM: Record<EventFacetKey, string> = {
  types: 'type',
  regions: 'region',
  formats: 'format',
  langs: 'lang',
};

function csv(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw
    ? raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
}

export function parseEventFilters(
  sp: Record<string, string | string[] | undefined>,
): EventFilters {
  const period =
    (Array.isArray(sp.period) ? sp.period[0] : sp.period) === 'passes'
      ? 'passes'
      : 'venir';
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim();
  const sortRaw = Array.isArray(sp.sort) ? sp.sort[0] : sp.sort;
  const sort = (EVENT_SORTS as readonly string[]).includes(sortRaw ?? '')
    ? (sortRaw as string)
    : 'date-asc';
  return {
    period,
    types: csv(sp.type),
    regions: csv(sp.region),
    formats: csv(sp.format),
    langs: csv(sp.lang),
    q: q || undefined,
    sort,
  };
}

export function buildEventHref(f: EventFilters): string {
  const sp = new URLSearchParams();
  if (f.period === 'passes') sp.set('period', 'passes');
  for (const key of EVENT_FACETS) {
    if (f[key].length) sp.set(EVENT_FACET_PARAM[key], f[key].join(','));
  }
  if (f.q) sp.set('q', f.q);
  if (f.sort && f.sort !== 'date-asc') sp.set('sort', f.sort);
  const qs = sp.toString();
  return qs ? `/evenements?${qs}` : '/evenements';
}

export function toggleEventHref(
  f: EventFilters,
  key: EventFacetKey,
  value: string,
): string {
  const cur = f[key];
  const next = cur.includes(value)
    ? cur.filter((v) => v !== value)
    : [...cur, value];
  return buildEventHref({ ...f, [key]: next });
}

export function hasActiveEventFilters(f: EventFilters): boolean {
  return Boolean(
    f.types.length ||
    f.regions.length ||
    f.formats.length ||
    f.langs.length ||
    f.q,
  );
}

function has(list: string[], value: string): boolean {
  return list.length === 0 || list.includes(value);
}

// Filtre + trie la liste pour une locale donnée (la recherche porte sur le titre
// + la ville + le thème traduits).
export function filterAndSortEvents(
  filters: EventFilters,
  labels: Labels,
): EventData[] {
  const wantUpcoming = filters.period === 'venir';
  const out = EVENTS.filter((e) => {
    if (e.upcoming !== wantUpcoming) return false;
    if (!has(filters.types, e.type)) return false;
    if (!has(filters.regions, e.region)) return false;
    if (!has(filters.formats, e.format)) return false;
    if (
      filters.langs.length &&
      !filters.langs.some((l) => e.langs.includes(l as 'fr' | 'en'))
    )
      return false;
    if (filters.q) {
      const q = filters.q.toLowerCase();
      const hay =
        `${labels.titles[e.slug]} ${labels.cities[e.cityKey]} ${labels.themes[e.theme]} ${labels.types[e.type]}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  out.sort((a, b) => {
    if (filters.sort === 'az')
      return labels.titles[a.slug].localeCompare(labels.titles[b.slug], 'fr');
    if (filters.sort === 'date-desc') return whenOf(b) - whenOf(a);
    return whenOf(a) - whenOf(b);
  });
  return out;
}

// Correspondance à tous les filtres SAUF une facette (et hors recherche `q`,
// qui s'applique toujours) — pour compter les options d'une facette dans le
// contexte des AUTRES filtres actifs + la période courante.
function matchesEventExcept(
  e: EventData,
  f: EventFilters,
  labels: Labels,
  except: EventFacetKey,
): boolean {
  if (e.upcoming !== (f.period === 'venir')) return false;
  if (except !== 'types' && !has(f.types, e.type)) return false;
  if (except !== 'regions' && !has(f.regions, e.region)) return false;
  if (except !== 'formats' && !has(f.formats, e.format)) return false;
  if (
    except !== 'langs' &&
    f.langs.length &&
    !f.langs.some((l) => e.langs.includes(l as 'fr' | 'en'))
  ) {
    return false;
  }
  if (f.q) {
    const q = f.q.toLowerCase();
    const hay =
      `${labels.titles[e.slug]} ${labels.cities[e.cityKey]} ${labels.themes[e.theme]} ${labels.types[e.type]}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

// Facettes « contextuelles » des événements (même principe que la bibliothèque) :
// chaque option est comptée sur les événements correspondant aux AUTRES filtres
// actifs (+ période). Les options sans événement disparaissent -> tout filtre
// cliquable donne >=1 résultat ; les valeurs cochées restent listées (à 0).
export function computeEventFacets(f: EventFilters, labels: Labels) {
  const tally = (
    list: EventData[],
    pick: (e: EventData) => string[],
    selected: string[],
  ): { value: string; count: number }[] => {
    const counts = new Map<string, number>();
    for (const v of selected) counts.set(v, 0);
    for (const e of list) {
      for (const v of pick(e)) counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, count }));
  };
  const sub = (except: EventFacetKey) =>
    EVENTS.filter((e) => matchesEventExcept(e, f, labels, except));
  return {
    types: tally(sub('types'), (e) => [e.type], f.types),
    regions: tally(sub('regions'), (e) => [e.region], f.regions),
    formats: tally(sub('formats'), (e) => [e.format], f.formats),
    langs: tally(sub('langs'), (e) => e.langs, f.langs),
  };
}
