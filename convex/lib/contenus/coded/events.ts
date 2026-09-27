// CONTENU CODÉ DES ÉVÉNEMENTS — source UNIQUE, partagée par le site et Convex.
//
// Ces données vivaient dans `src/lib/events-content.ts` (côté Next), hors de
// portée du backend : Convex est déployé séparément et n'a pas l'alias `@/`.
// Elles sont descendues ici, dans un module PUR (aucun import serveur), pour
// deux usages qui doivent lire EXACTEMENT les mêmes octets :
//
//  - l'import interne `contenus/migration:importCodedContent`, qui recopie ce
//    catalogue dans la table `contentEvents` (mêmes slugs, mêmes titres dans
//    les cinq langues) ;
//  - le REPLI des pages publiques (`src/lib/contenus/`), servi tant que la
//    table est vide ou le backend injoignable.
//
// Une seule copie, donc aucune dérive possible entre le repli et ce que la
// migration a écrit. Le site les lit par l'alias `@convex/*`, comme il le fait
// déjà pour les rôles et le vocabulaire de l'annuaire.
//
// `upcoming` est l'indicateur HISTORIQUE du catalogue : il ne décide plus de
// rien à l'affichage (c'est la date qui le fait), mais il dit quels événements
// étaient des rediffusions — la migration en tire les replays.

import type { SiteLocale } from '../../locales';

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
  // Langues de l'événement. Le catalogue codé n'en porte que deux (fr, en) ;
  // la table accepte les cinq langues du site.
  langs: SiteLocale[];
  theme: ThemeKey;
  cityKey: string;
  y: number;
  mo: number; // 1-12
  d: number;
  upcoming: boolean;
  durationMin?: number; // pour les rediffusions (événements passés)
  // Lien OPTIONNEL de rediffusion d'un événement passé (A-10, campagne du
  // 27/09). Absent du catalogue codé ; avec la table, il vient du replay
  // publié rattaché à l'événement. Le lien de VISIOCONFÉRENCE, lui, n'est
  // plus porté par cette forme publique : il est réservé aux inscrits
  // (`contenus/events:myVisioAccess`) et ne sort jamais d'une requête ouverte.
  replayUrl?: string;
};

// Liste neutre (la plus proche en haut). `when` dérivé pour le tri.
export const CODED_EVENTS: EventData[] = [
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

// Titres des événements, par langue (anciennement `labels.titles`).
export const CODED_EVENT_TITLES: Record<SiteLocale, Record<string, string>> = {
  fr: {
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
  en: {
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
  es: {
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
  pt: {
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
  ar: {
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
};

// Lieux (villes) par clé neutre et par langue (anciennement `labels.cities`).
export const CODED_EVENT_CITIES: Record<SiteLocale, Record<string, string>> = {
  fr: {
    paris: 'Paris',
    dakar: 'Dakar',
    bruxelles: 'Bruxelles',
    online: 'En ligne',
    'dakar-online': 'Dakar et en ligne',
  },
  en: {
    paris: 'Paris',
    dakar: 'Dakar',
    bruxelles: 'Brussels',
    online: 'Online',
    'dakar-online': 'Dakar and online',
  },
  es: {
    paris: 'París',
    dakar: 'Dakar',
    bruxelles: 'Bruselas',
    online: 'En línea',
    'dakar-online': 'Dakar y en línea',
  },
  pt: {
    paris: 'Paris',
    dakar: 'Dakar',
    bruxelles: 'Bruxelas',
    online: 'Em linha',
    'dakar-online': 'Dakar e em linha',
  },
  ar: {
    paris: 'باريس',
    dakar: 'داكار',
    bruxelles: 'بروكسل',
    online: 'عن بُعد',
    'dakar-online': 'داكار وعن بُعد',
  },
};

// Fuseau horaire de chaque lieu du catalogue. Le catalogue ne portait que des
// JOURS (y/mo/d), lus implicitement à l'heure de Paris ; la table exige un
// fuseau pour situer la fin d'un événement (clôture des inscriptions) et
// formater ses dates. Le fuseau retenu est celui du lieu ; « en ligne » suit
// le siège du réseau, à Paris.
export const CODED_CITY_TIMEZONES: Record<string, string> = {
  paris: 'Europe/Paris',
  dakar: 'Africa/Dakar',
  bruxelles: 'Europe/Brussels',
  online: 'Europe/Paris',
  'dakar-online': 'Africa/Dakar',
};

// Événement mis en avant sur l'agenda (la conférence inaugurale), dont la
// fiche porte le contenu riche codé (programme, intervenants, billetterie).
export const CODED_FEATURED_SLUG = 'conference-inaugurale';
