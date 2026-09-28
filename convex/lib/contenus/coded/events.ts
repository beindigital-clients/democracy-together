// CODED EVENT CONTENT — SINGLE source, shared by the site and Convex.
//
// This data lived in `src/lib/events-content.ts` (Next side), out of
// the backend's reach: Convex is deployed separately and has no `@/` alias.
// It was moved down here, into a PURE module (no server import), for
// two uses that must read EXACTLY the same bytes:
//
//  - the internal import `contenus/migration:importCodedContent`, which copies this
//    catalog into the `contentEvents` table (same slugs, same titles in
//    the five languages);
//  - the FALLBACK for public pages (`src/lib/contenus/`), served as long as the
//    table is empty or the backend unreachable.
//
// A single copy, so no possible drift between the fallback and what the
// migration wrote. The site reads them through the `@convex/*` alias, as it
// already does for roles and the directory vocabulary.
//
// `upcoming` is the catalog's HISTORICAL flag: it no longer decides
// anything for display (the date does), but it says which events
// were replays — the migration derives the replays from it.

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
  // Event languages. The coded catalog only carries two (fr, en);
  // the table accepts the site's five languages.
  langs: SiteLocale[];
  theme: ThemeKey;
  cityKey: string;
  y: number;
  mo: number; // 1-12
  d: number;
  upcoming: boolean;
  durationMin?: number; // for replays (past events)
  // OPTIONAL replay link for a past event (A-10, campaign of
  // 27/09). Absent from the coded catalog; with the table, it comes from the
  // published replay attached to the event. The VIDEOCONFERENCE link, for its part,
  // is no longer carried by this public shape: it is reserved for registrants
  // (`contenus/events:myVisioAccess`) and never leaves an open query.
  replayUrl?: string;
};

// Neutral list (nearest at the top). `when` derived for sorting.
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
  // past (replays)
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

// Event titles, per language (formerly `labels.titles`).
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

// Venues (cities) by neutral key and per language (formerly `labels.cities`).
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

// Time zone of each venue in the catalog. The catalog only carried
// DAYS (y/mo/d), implicitly read in Paris time; the table requires a
// time zone to place the end of an event (registration closing) and
// format its dates. The time zone chosen is the venue's; "en ligne" follows
// the network's headquarters, in Paris.
export const CODED_CITY_TIMEZONES: Record<string, string> = {
  paris: 'Europe/Paris',
  dakar: 'Africa/Dakar',
  bruxelles: 'Europe/Brussels',
  online: 'Europe/Paris',
  'dakar-online': 'Africa/Dakar',
};

// Event featured on the agenda (the inaugural conference), whose
// record carries the coded rich content (program, speakers, ticketing).
export const CODED_FEATURED_SLUG = 'conference-inaugurale';
