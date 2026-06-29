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
  { slug: 'conference-inaugurale', type: 'sommet', region: 'europe', format: 'hybride', langs: ['fr', 'en'], theme: 'vie-reseau', cityKey: 'paris', y: 2026, mo: 11, d: 14, upcoming: true },
  { slug: 'webinaire-gouvernance-plateformes', type: 'webinaire', region: 'en-ligne', format: 'en-ligne', langs: ['fr', 'en'], theme: 'gouvernance-numerique', cityKey: 'online', y: 2026, mo: 12, d: 3, upcoming: true },
  { slug: 'atelier-dakar-transparence-budgetaire', type: 'atelier', region: 'afrique', format: 'presentiel', langs: ['fr'], theme: 'anti-corruption', cityKey: 'dakar', y: 2026, mo: 9, d: 17, upcoming: true },
  { slug: 'atelier-bruxelles-democratie-ue', type: 'atelier', region: 'europe', format: 'hybride', langs: ['fr', 'en'], theme: 'transitions', cityKey: 'bruxelles', y: 2026, mo: 10, d: 8, upcoming: true },
  { slug: 'webinaire-jeunes-releve', type: 'webinaire', region: 'en-ligne', format: 'en-ligne', langs: ['fr'], theme: 'participation', cityKey: 'online', y: 2026, mo: 9, d: 24, upcoming: true },
  { slug: 'atelier-dakar-integrite-electorale', type: 'atelier', region: 'afrique', format: 'presentiel', langs: ['fr', 'en'], theme: 'transitions', cityKey: 'dakar', y: 2026, mo: 10, d: 15, upcoming: true },
  { slug: 'webinaire-desinformation-confiance', type: 'webinaire', region: 'en-ligne', format: 'en-ligne', langs: ['en'], theme: 'crises', cityKey: 'online', y: 2026, mo: 11, d: 5, upcoming: true },
  { slug: 'atelier-bruxelles-souverainete-numerique', type: 'atelier', region: 'europe', format: 'presentiel', langs: ['fr', 'en'], theme: 'gouvernance-numerique', cityKey: 'bruxelles', y: 2026, mo: 11, d: 26, upcoming: true },
  { slug: 'webinaire-financer-societe-civile', type: 'webinaire', region: 'en-ligne', format: 'hybride', langs: ['fr'], theme: 'participation', cityKey: 'dakar-online', y: 2026, mo: 12, d: 10, upcoming: true },
  { slug: 'restitution-barometre-annuel', type: 'webinaire', region: 'en-ligne', format: 'en-ligne', langs: ['fr', 'en'], theme: 'vie-reseau', cityKey: 'online', y: 2026, mo: 12, d: 16, upcoming: true },
  // passés (rediffusions)
  { slug: 'ia-generative-integrite-information', type: 'webinaire', region: 'en-ligne', format: 'en-ligne', langs: ['fr', 'en'], theme: 'gouvernance-numerique', cityKey: 'online', y: 2026, mo: 6, d: 4, upcoming: false, durationMin: 72 },
  { slug: 'atelier-dakar-financer-societe-civile', type: 'atelier', region: 'afrique', format: 'hybride', langs: ['fr'], theme: 'participation', cityKey: 'dakar', y: 2026, mo: 5, d: 22, upcoming: false, durationMin: 125 },
  { slug: 'reguler-plateformes-debat-public', type: 'webinaire', region: 'en-ligne', format: 'en-ligne', langs: ['fr', 'en'], theme: 'gouvernance-numerique', cityKey: 'online', y: 2026, mo: 4, d: 9, upcoming: false, durationMin: 58 },
  { slug: 'atelier-bruxelles-participation-locale', type: 'atelier', region: 'europe', format: 'hybride', langs: ['fr', 'en'], theme: 'participation', cityKey: 'bruxelles', y: 2026, mo: 3, d: 18, upcoming: false, durationMin: 100 },
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
  hero: { crumbHome: string; eyebrow: string; title: string; lead: string; searchPlaceholder: string; searchCta: string };
  featuredBadge: string;
  featured: { kicker: string; title: string; body: string; facts: { k: string; v: string }[]; register: string; details: string };
  filter: { title: string; reset: string; upcoming: string; past: string; type: string; region: string; format: string; lang: string };
  results: { countUpcomingOne: string; countUpcomingMany: string; countPastOne: string; countPastMany: string; sortLabel: string; sorts: Record<string, string>; details: string; empty: string; emptyReset: string };
  replays: { eyebrow: string; title: string; cta: string; watch: string; durationLabel: (m: number) => string; note: string };
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
  related: string;
  resources: string;
  // contenu riche de la conférence (featured)
  conf: {
    lead: string;
    dayIntro: string[];
    progIntro: string;
    programme: { time: string; dur: string; kind: string; title: string; body: string; who?: string }[];
    speakersIntro: string;
    speakers: { initials: string; name: string; role: string; founder?: boolean }[];
    infos: { ic: string; title: string; body: string }[];
    ticket: { eyebrow: string; title: string; legend: string; tiers: { name: string; desc: string; price: string }[]; disclaimer: string; reserve: string };
    recap: { k: string; v: string }[];
    resources: { title: string; body: string }[];
  };
};

function frenchMonth(mo: number): string {
  return ['JANV', 'FÉVR', 'MARS', 'AVR', 'MAI', 'JUIN', 'JUIL', 'AOÛT', 'SEPT', 'OCT', 'NOV', 'DÉC'][mo - 1];
}
function englishMonth(mo: number): string {
  return ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][mo - 1];
}

export function monthAbbr(e: Pick<EventData, 'mo'>, locale: 'fr' | 'en'): string {
  return locale === 'en' ? englishMonth(e.mo) : frenchMonth(e.mo);
}

const fr: Labels = {
  hero: {
    crumbHome: 'Accueil',
    eyebrow: 'Agenda',
    title: 'Événements',
    lead: "Un sommet mondial annuel à Paris, des webinaires thématiques ouverts à tous et des ateliers régionaux à Dakar et Bruxelles. Le calendrier des rencontres du réseau, à venir et en rediffusion.",
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
  filter: { title: 'Filtrer', reset: 'Réinitialiser', upcoming: 'À venir', past: 'Passés', type: 'Type', region: 'Région', format: 'Format', lang: 'Langue' },
  results: {
    countUpcomingOne: 'événement à venir',
    countUpcomingMany: 'événements à venir',
    countPastOne: 'événement passé',
    countPastMany: 'événements passés',
    sortLabel: 'Trier par',
    sorts: { 'date-asc': 'Date, plus proche', 'date-desc': 'Date, plus lointaine', az: 'Titre A → Z' },
    details: 'Détails',
    empty: 'Aucun événement ne correspond à ces filtres.',
    emptyReset: 'Réinitialiser les filtres',
  },
  replays: {
    eyebrow: 'Rediffusions',
    title: 'Replays des événements passés',
    cta: 'Voir toutes les ressources',
    watch: '▶ Voir la rediffusion',
    durationLabel: (m) => (m >= 60 ? `durée ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `durée ${m} min`),
    note: "Données d'illustration. Les rediffusions et durées sont fictives.",
  },
  types: { sommet: 'Sommet', webinaire: 'Webinaire', atelier: 'Atelier régional' },
  regions: { afrique: 'Afrique', europe: 'Europe', 'en-ligne': 'En ligne' },
  formats: { presentiel: 'Présentiel', 'en-ligne': 'En ligne', hybride: 'Hybride' },
  themes: {
    'vie-reseau': 'Vie du réseau',
    'gouvernance-numerique': 'Gouvernance numérique',
    participation: 'Participation citoyenne',
    'anti-corruption': 'Lutte anti-corruption',
    transitions: 'Transitions démocratiques',
    crises: 'Crises globales',
  },
  cities: { paris: 'Paris', dakar: 'Dakar', bruxelles: 'Bruxelles', online: 'En ligne', 'dakar-online': 'Dakar et en ligne' },
  langName: { fr: 'Français', en: 'Anglais' },
  titles: {
    'conference-inaugurale': 'Conférence inaugurale de Democracy Together',
    'webinaire-gouvernance-plateformes': "Webinaire : gouvernance des plateformes après l'IA",
    'atelier-dakar-transparence-budgetaire': 'Atelier régional de Dakar : transparence budgétaire',
    'atelier-bruxelles-democratie-ue': "Atelier de Bruxelles : démocratie et politiques de l'UE",
    'webinaire-jeunes-releve': 'Webinaire jeunes : la relève au cœur du débat',
    'atelier-dakar-integrite-electorale': 'Atelier régional de Dakar : intégrité électorale',
    'webinaire-desinformation-confiance': 'Webinaire : désinformation et confiance civique',
    'atelier-bruxelles-souverainete-numerique': 'Atelier de Bruxelles : souveraineté numérique européenne',
    'webinaire-financer-societe-civile': "Webinaire : financer la société civile en Afrique de l'Ouest",
    'restitution-barometre-annuel': 'Restitution du Baromètre annuel de la démocratie',
    'ia-generative-integrite-information': "IA générative et intégrité de l'information",
    'atelier-dakar-financer-societe-civile': 'Atelier régional de Dakar : financer la société civile',
    'reguler-plateformes-debat-public': 'Réguler les plateformes sans affaiblir le débat public',
    'atelier-bruxelles-participation-locale': 'Atelier de Bruxelles : participation citoyenne locale',
  },
  detail: {
    back: 'Tous les événements',
    badges: (e) => [fr.types[e.type], fr.formats[e.format], e.langs.map((l) => l.toUpperCase()).join(' / ')],
    eyebrow: 'Democracy Together',
    leadFallback: "Rencontre du réseau Democracy Together. Programme détaillé et inscription à venir.",
    factDate: 'Date',
    factPlace: 'Lieu',
    factFormat: 'Format',
    register: "S'inscrire",
    seeProgramme: 'Voir le programme',
    visualPin: 'Paris · 2026',
    visualCap: "Image d'illustration. Lieu de la conférence : Paris, siège du réseau.",
    sections: { day: 'La journée', programme: 'Programme détaillé', speakers: 'Intervenants', infos: 'Infos pratiques' },
    related: 'Autres rendez-vous',
    resources: 'Replays et ressources',
    conf: {
      lead: "Une journée pour fonder publiquement le réseau : think tanks d'Afrique et d'Europe, chercheurs, responsables publics et jeunes engagés, réunis pour penser et défendre la démocratie.",
      dayIntro: [
        "La conférence inaugurale marque la naissance officielle de Democracy Together. Pendant une journée, le réseau présente sa raison d'être, ses premiers travaux et sa méthode : relier des think tanks d'Afrique et d'Europe pour produire une pensée démocratique partagée et citable.",
        "Le matin est consacré aux plénières de cadrage : état de la démocratie entre les deux continents, présentation du Baromètre Democracy Together et de la bibliothèque en accès ouvert. L'après-midi privilégie le travail en petits groupes : ateliers thématiques, table ronde intergénérationnelle, puis restitution publique. La journée se clôt sur une feuille de route et un appel à contributions.",
        "L'événement réunit environ 280 participants attendus (donnée d'illustration), avec une diffusion en direct pour les membres ne pouvant se déplacer.",
      ],
      progIntro: 'Horaires de Paris (CET). Programme prévisionnel, susceptible d\'ajustements jusqu\'à l\'ouverture.',
      programme: [
        { time: '08:30', dur: '45 min', kind: 'Accueil', title: 'Accueil des participants et café', body: "Émargement, remise des badges et café d'accueil dans le hall. Stand du réseau et de la bibliothèque en accès ouvert." },
        { time: '09:15', dur: '30 min', kind: 'Plénière', title: 'Ouverture : pourquoi un réseau, maintenant', body: "Mot d'accueil des fondateurs et présentation de la mission de Democracy Together. Cadre de la journée et des engagements annoncés.", who: 'Avec Abdou Samb, Philippe Kourilsky et Pierre Vimont.' },
        { time: '09:45', dur: '75 min', kind: 'Plénière', title: "L'état de la démocratie, Afrique et Europe", body: 'Présentation des grands constats du premier rapport conjoint et lancement public du Baromètre Democracy Together, avec lecture croisée des indicateurs.', who: "Table d'experts du réseau, suivie d'un échange avec la salle." },
        { time: '11:00', dur: '20 min', kind: 'Pause', title: 'Pause', body: 'Pause café et rencontres informelles.' },
        { time: '11:20', dur: '70 min', kind: 'Ateliers', title: 'Ateliers parallèles (au choix)', body: "Quatre ateliers en petits groupes : gouvernance numérique, participation citoyenne, lutte anti-corruption, transitions démocratiques. Choix de l'atelier à l'inscription.", who: 'Animés par les coordinateurs des pôles du réseau.' },
        { time: '12:30', dur: '90 min', kind: 'Déjeuner', title: 'Déjeuner', body: 'Déjeuner debout sur place, options végétariennes et halal. Espace presse ouvert.' },
        { time: '14:00', dur: '80 min', kind: 'Table ronde', title: 'Démocratie et générations : transmettre, contester, renouveler', body: 'Dialogue intergénérationnel entre fondateurs, chercheurs et jeunes du réseau sur la place des nouvelles générations dans la vie démocratique.', who: 'Modération assurée par la rédaction du réseau.' },
        { time: '15:20', dur: '40 min', kind: 'Plénière', title: 'Restitution des ateliers', body: 'Synthèse publique des quatre ateliers et premières pistes de travail pour les groupes du réseau.' },
        { time: '16:00', dur: '45 min', kind: 'Clôture', title: 'Feuille de route et appel à contributions', body: 'Annonce des prochains rendez-vous, des partenariats et de l\'appel à contributions pour la bibliothèque. Clôture de la journée.' },
        { time: '16:45', dur: '75 min', kind: 'Réception', title: 'Réception et networking', body: 'Réception conviviale pour prolonger les échanges entre membres, partenaires et nouveaux contributeurs.' },
      ],
      speakersIntro: 'Programmation en cours. Fondateurs et premiers intervenants confirmés ci-dessous (liste indicative).',
      speakers: [
        { initials: 'AS', name: 'Abdou Samb', role: 'Cofondateur de Democracy Together. Ouverture et clôture de la journée.', founder: true },
        { initials: 'PK', name: 'Philippe Kourilsky', role: "Cofondateur de Democracy Together. Plénière d'ouverture.", founder: true },
        { initials: 'PV', name: 'Pierre Vimont', role: "Cofondateur de Democracy Together. Plénière d'ouverture et table ronde.", founder: true },
        { initials: 'KM', name: 'Khady Mensah', role: "Coordinatrice du pôle Gouvernance numérique. Atelier de l'après-midi." },
        { initials: 'LT', name: 'Lassana Traoré', role: 'Chercheur, pôle Lutte anti-corruption. Plénière du matin.' },
        { initials: 'SD', name: 'Sira Diallo', role: 'Déléguée du Hub jeunes. Table ronde intergénérationnelle.' },
      ],
      infos: [
        { ic: 'Lieu', title: 'Maison des congrès, Paris 8e', body: 'Adresse exacte et plan d\'accès communiqués aux personnes inscrites par courriel, une semaine avant l\'événement.' },
        { ic: 'Accès', title: 'Transports en commun', body: 'Métro et RER à proximité, station à moins de cinq minutes à pied. Stationnement vélo sécurisé. Pas de parking visiteurs sur place.' },
        { ic: 'Accessibilité', title: 'Site accessible PMR', body: "Salles de plain-pied, ascenseurs et sanitaires adaptés. Boucle magnétique en plénière. Pour tout besoin spécifique, contactez l'équipe à l'inscription." },
        { ic: 'Langues', title: 'Français et anglais', body: 'Plénières en interprétation simultanée FR / EN. Ateliers tenus dans la langue annoncée pour chaque groupe.' },
        { ic: 'Restauration', title: 'Déjeuner et pauses inclus', body: 'Café d\'accueil, pauses et déjeuner debout compris dans l\'inscription. Options végétariennes et halal proposées.' },
        { ic: 'En direct', title: 'Diffusion pour les membres', body: 'Les plénières sont diffusées en direct pour les membres à distance. Lien d\'accès envoyé la veille.' },
      ],
      ticket: {
        eyebrow: 'Billetterie',
        title: 'Inscription',
        legend: 'Type de billet',
        tiers: [
          { name: 'Membre Democracy Together', desc: 'Adhésion à jour', price: 'Offert' },
          { name: 'Standard', desc: 'Plein tarif, journée complète', price: '45 €' },
          { name: 'Étudiant / jeune', desc: 'Sur justificatif, moins de 28 ans', price: '15 €' },
        ],
        disclaimer: "Tarifs indicatifs, données d'illustration. Aucun paiement n'est effectué sur cette maquette. Les billets gratuits restent soumis à confirmation des places disponibles.",
        reserve: 'Réserver',
      },
      recap: [
        { k: 'Date', v: 'Sam. 14 nov. 2026' },
        { k: 'Horaire', v: '08:30 à 18:00' },
        { k: 'Lieu', v: 'Paris 8e, France' },
        { k: 'Format', v: 'Présentiel · direct membres' },
      ],
      resources: [
        { title: 'Replays des plénières', body: 'Disponibles quelques jours après l\'événement, en accès ouvert.' },
        { title: 'Supports des ateliers', body: 'Notes et présentations partagées avec les participants.' },
        { title: 'Synthèse de la journée', body: 'Compte rendu public publié dans la bibliothèque.' },
      ],
    },
  },
};

const en: Labels = {
  hero: {
    crumbHome: 'Home',
    eyebrow: 'Agenda',
    title: 'Events',
    lead: 'An annual global summit in Paris, thematic webinars open to all, and regional workshops in Dakar and Brussels. The network\'s calendar of gatherings, upcoming and on replay.',
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
  filter: { title: 'Filter', reset: 'Reset', upcoming: 'Upcoming', past: 'Past', type: 'Type', region: 'Region', format: 'Format', lang: 'Language' },
  results: {
    countUpcomingOne: 'upcoming event',
    countUpcomingMany: 'upcoming events',
    countPastOne: 'past event',
    countPastMany: 'past events',
    sortLabel: 'Sort by',
    sorts: { 'date-asc': 'Date, soonest', 'date-desc': 'Date, latest', az: 'Title A → Z' },
    details: 'Details',
    empty: 'No event matches these filters.',
    emptyReset: 'Reset filters',
  },
  replays: {
    eyebrow: 'Replays',
    title: 'Replays of past events',
    cta: 'See all resources',
    watch: '▶ Watch the replay',
    durationLabel: (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}` : `${m} min`),
    note: 'Illustration data. Replays and durations are fictional.',
  },
  types: { sommet: 'Summit', webinaire: 'Webinar', atelier: 'Regional workshop' },
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
  cities: { paris: 'Paris', dakar: 'Dakar', bruxelles: 'Brussels', online: 'Online', 'dakar-online': 'Dakar and online' },
  langName: { fr: 'French', en: 'English' },
  titles: {
    'conference-inaugurale': 'Democracy Together inaugural conference',
    'webinaire-gouvernance-plateformes': 'Webinar: platform governance after AI',
    'atelier-dakar-transparence-budgetaire': 'Dakar regional workshop: budget transparency',
    'atelier-bruxelles-democratie-ue': 'Brussels workshop: democracy and EU policy',
    'webinaire-jeunes-releve': 'Youth webinar: the next generation at the heart of debate',
    'atelier-dakar-integrite-electorale': 'Dakar regional workshop: electoral integrity',
    'webinaire-desinformation-confiance': 'Webinar: disinformation and civic trust',
    'atelier-bruxelles-souverainete-numerique': 'Brussels workshop: European digital sovereignty',
    'webinaire-financer-societe-civile': 'Webinar: funding civil society in West Africa',
    'restitution-barometre-annuel': 'Release of the annual Democracy Barometer',
    'ia-generative-integrite-information': 'Generative AI and information integrity',
    'atelier-dakar-financer-societe-civile': 'Dakar regional workshop: funding civil society',
    'reguler-plateformes-debat-public': 'Regulating platforms without weakening public debate',
    'atelier-bruxelles-participation-locale': 'Brussels workshop: local citizen participation',
  },
  detail: {
    back: 'All events',
    badges: (e) => [en.types[e.type], en.formats[e.format], e.langs.map((l) => l.toUpperCase()).join(' / ')],
    eyebrow: 'Democracy Together',
    leadFallback: 'A Democracy Together network gathering. Detailed programme and registration coming soon.',
    factDate: 'Date',
    factPlace: 'Venue',
    factFormat: 'Format',
    register: 'Register',
    seeProgramme: 'See the programme',
    visualPin: 'Paris · 2026',
    visualCap: 'Illustrative image. Conference venue: Paris, the network\'s seat.',
    sections: { day: 'The day', programme: 'Detailed programme', speakers: 'Speakers', infos: 'Practical info' },
    related: 'Other gatherings',
    resources: 'Replays and resources',
    conf: {
      lead: 'A day to publicly found the network: think tanks from Africa and Europe, researchers, public officials and engaged young people, gathered to think about and defend democracy.',
      dayIntro: [
        'The inaugural conference marks the official birth of Democracy Together. Over one day, the network presents its purpose, its first work and its method: connecting think tanks from Africa and Europe to produce shared, citable democratic thinking.',
        'The morning is devoted to framing plenaries: the state of democracy across the two continents, the launch of the Democracy Together Barometer and of the open-access library. The afternoon favours small-group work: thematic workshops, an intergenerational round table, then a public report-back. The day closes on a roadmap and a call for contributions.',
        'The event gathers around 280 expected participants (illustration figure), with a live broadcast for members unable to travel.',
      ],
      progIntro: 'Paris time (CET). Provisional programme, subject to adjustments until the opening.',
      programme: [
        { time: '08:30', dur: '45 min', kind: 'Welcome', title: 'Welcome and coffee', body: 'Check-in, badge pick-up and welcome coffee in the hall. Network and open-access library stand.' },
        { time: '09:15', dur: '30 min', kind: 'Plenary', title: 'Opening: why a network, now', body: 'Welcome from the founders and presentation of the Democracy Together mission. Framing of the day and the announced commitments.', who: 'With Abdou Samb, Philippe Kourilsky and Pierre Vimont.' },
        { time: '09:45', dur: '75 min', kind: 'Plenary', title: 'The state of democracy, Africa and Europe', body: 'Presentation of the main findings of the first joint report and public launch of the Democracy Together Barometer, with a cross-reading of the indicators.', who: 'A network expert panel, followed by an exchange with the room.' },
        { time: '11:00', dur: '20 min', kind: 'Break', title: 'Break', body: 'Coffee break and informal encounters.' },
        { time: '11:20', dur: '70 min', kind: 'Workshops', title: 'Parallel workshops (your choice)', body: 'Four small-group workshops: digital governance, citizen participation, anti-corruption, democratic transitions. Workshop chosen at registration.', who: 'Led by the network pillar coordinators.' },
        { time: '12:30', dur: '90 min', kind: 'Lunch', title: 'Lunch', body: 'Standing lunch on site, vegetarian and halal options. Press area open.' },
        { time: '14:00', dur: '80 min', kind: 'Round table', title: 'Democracy and generations: passing on, contesting, renewing', body: 'An intergenerational dialogue between founders, researchers and the network\'s young members on the place of new generations in democratic life.', who: 'Moderated by the network editorial team.' },
        { time: '15:20', dur: '40 min', kind: 'Plenary', title: 'Workshop report-back', body: 'Public synthesis of the four workshops and first work avenues for the network groups.' },
        { time: '16:00', dur: '45 min', kind: 'Closing', title: 'Roadmap and call for contributions', body: 'Announcement of upcoming events, partnerships and the call for contributions to the library. Closing of the day.' },
        { time: '16:45', dur: '75 min', kind: 'Reception', title: 'Reception and networking', body: 'A friendly reception to extend exchanges between members, partners and new contributors.' },
      ],
      speakersIntro: 'Programming in progress. Founders and first confirmed speakers below (indicative list).',
      speakers: [
        { initials: 'AS', name: 'Abdou Samb', role: 'Co-founder of Democracy Together. Opening and closing of the day.', founder: true },
        { initials: 'PK', name: 'Philippe Kourilsky', role: 'Co-founder of Democracy Together. Opening plenary.', founder: true },
        { initials: 'PV', name: 'Pierre Vimont', role: 'Co-founder of Democracy Together. Opening plenary and round table.', founder: true },
        { initials: 'KM', name: 'Khady Mensah', role: 'Coordinator of the Digital Governance pillar. Afternoon workshop.' },
        { initials: 'LT', name: 'Lassana Traoré', role: 'Researcher, Anti-corruption pillar. Morning plenary.' },
        { initials: 'SD', name: 'Sira Diallo', role: 'Youth Hub delegate. Intergenerational round table.' },
      ],
      infos: [
        { ic: 'Venue', title: 'Maison des congrès, Paris 8e', body: 'Exact address and access map sent to registered attendees by email, one week before the event.' },
        { ic: 'Access', title: 'Public transport', body: 'Metro and RER nearby, station less than five minutes\' walk away. Secure bike parking. No visitor car park on site.' },
        { ic: 'Accessibility', title: 'Wheelchair-accessible venue', body: 'Step-free rooms, lifts and adapted toilets. Hearing loop in plenary. For any specific need, contact the team at registration.' },
        { ic: 'Languages', title: 'French and English', body: 'Plenaries with simultaneous FR / EN interpretation. Workshops held in the language announced for each group.' },
        { ic: 'Catering', title: 'Lunch and breaks included', body: 'Welcome coffee, breaks and standing lunch included in the registration. Vegetarian and halal options offered.' },
        { ic: 'Live', title: 'Broadcast for members', body: 'Plenaries are broadcast live for remote members. Access link sent the day before.' },
      ],
      ticket: {
        eyebrow: 'Tickets',
        title: 'Registration',
        legend: 'Ticket type',
        tiers: [
          { name: 'Democracy Together member', desc: 'Membership up to date', price: 'Free' },
          { name: 'Standard', desc: 'Full price, full day', price: '€45' },
          { name: 'Student / youth', desc: 'On proof, under 28', price: '€15' },
        ],
        disclaimer: 'Indicative prices, illustration data. No payment is taken on this mock-up. Free tickets remain subject to confirmation of available seats.',
        reserve: 'Book',
      },
      recap: [
        { k: 'Date', v: 'Sat. 14 Nov. 2026' },
        { k: 'Time', v: '08:30 to 18:00' },
        { k: 'Venue', v: 'Paris 8e, France' },
        { k: 'Format', v: 'In person · live for members' },
      ],
      resources: [
        { title: 'Plenary replays', body: 'Available a few days after the event, open access.' },
        { title: 'Workshop materials', body: 'Notes and presentations shared with participants.' },
        { title: 'Day synthesis', body: 'Public report published in the library.' },
      ],
    },
  },
};

export function getEventsLabels(locale: 'fr' | 'en'): Labels {
  return locale === 'en' ? en : fr;
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
  return raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

export function parseEventFilters(
  sp: Record<string, string | string[] | undefined>,
): EventFilters {
  const period = (Array.isArray(sp.period) ? sp.period[0] : sp.period) === 'passes' ? 'passes' : 'venir';
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim();
  const sortRaw = Array.isArray(sp.sort) ? sp.sort[0] : sp.sort;
  const sort = (EVENT_SORTS as readonly string[]).includes(sortRaw ?? '') ? (sortRaw as string) : 'date-asc';
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
  const next = cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
  return buildEventHref({ ...f, [key]: next });
}

export function hasActiveEventFilters(f: EventFilters): boolean {
  return Boolean(f.types.length || f.regions.length || f.formats.length || f.langs.length || f.q);
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
    if (filters.langs.length && !filters.langs.some((l) => e.langs.includes(l as 'fr' | 'en'))) return false;
    if (filters.q) {
      const q = filters.q.toLowerCase();
      const hay = `${labels.titles[e.slug]} ${labels.cities[e.cityKey]} ${labels.themes[e.theme]} ${labels.types[e.type]}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  out.sort((a, b) => {
    if (filters.sort === 'az') return labels.titles[a.slug].localeCompare(labels.titles[b.slug], 'fr');
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
    const hay = `${labels.titles[e.slug]} ${labels.cities[e.cityKey]} ${labels.themes[e.theme]} ${labels.types[e.type]}`.toLowerCase();
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
