import { routing } from '@/i18n/routing';
import type { EventFormat } from '@/lib/events-content';

// Métadonnées de partage et données structurées (audit F-03).
//
// Mesuré avant correctif : sur les 48 pages publiques (24 routes × 2 langues),
// ZÉRO balise Open Graph, zéro Twitter Card, zéro JSON-LD. Un lien partagé sur
// une messagerie ou un réseau social apparaissait nu — pas de titre, pas de
// description, pas d'image. Pour un réseau dont l'objet est la diffusion
// d'analyses, et dont le canal de partage principal sur la zone visée est la
// messagerie, c'est une perte à chaque partage.

// NOM PROPRE : il ne se traduit pas (même règle que le `title` du layout).
export const SITE_NAME = 'Democracy Together';

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

// Open Graph attend une étiquette de langue territorialisée (`fr_FR`), pas un
// code ISO court (`fr`). Une valeur absente vaut mieux qu'une valeur inventée :
// on ne devine pas le territoire d'une locale qu'on ne connaît pas.
const OG_LOCALES: Record<string, string> = {
  fr: 'fr_FR',
  en: 'en_US',
};

export function openGraphLocale(locale: string): string | undefined {
  return OG_LOCALES[locale];
}

/**
 * Les autres langues du site, au format attendu par `openGraph.alternateLocale`.
 * Sert à déclarer que la même page existe ailleurs, sans la répéter.
 */
export function alternateOpenGraphLocales(locale: string): string[] {
  return routing.locales
    .filter((l) => l !== locale)
    .map(openGraphLocale)
    .filter((l): l is string => Boolean(l));
}

/**
 * Bloc `alternates` d'une page indexable : adresse canonique + hreflang.
 *
 * La forme reprend EXACTEMENT celle que `src/app/sitemap.ts` déclare pour la
 * même page (fr, en, x-default) — son en-tête dit que les alternates du
 * sitemap sont « cohérents avec les canonicals posés par les
 * generateMetadata ». Deux écritures séparées de la même règle finissent par
 * diverger ; celle-ci est la seule.
 *
 * À NE PAS employer sur une page en `noindex` : un moteur y ignore le
 * hreflang, et le dépôt a tranché (issue #35) que l'ajouter ne serait que du
 * bruit. `/recherche` et les billets de Tribune en sont les cas testés.
 */
export function alternatesFor(locale: string, path: string) {
  const suffix = path ? `/${path}` : '';
  const languages: Record<string, string> = {
    'x-default': `${SITE_URL}/fr${suffix}`,
  };
  for (const l of routing.locales) languages[l] = `${SITE_URL}/${l}${suffix}`;
  return {
    canonical: `${SITE_URL}/${locale}${suffix}`,
    languages,
  };
}

/**
 * Identifiant du nœud `Organization` posé par le layout, sur toutes les pages.
 *
 * Les fiches de page (`Article`, `Event`) le RÉFÉRENCENT au lieu de recopier
 * l'organisation : deux copies d'une même entité finissent par diverger, et
 * schema.org prévoit exactement ce renvoi. Il n'est résoluble que parce que le
 * layout pose sa fiche sur chaque page — ce que la spec d'audit vérifie, sur
 * le HTML servi, plutôt que de s'y fier.
 */
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;

/**
 * Fiche `Organization` (schema.org), posée une fois pour tout le site.
 *
 * Volontairement minimale : on ne déclare que ce dont le dépôt dispose
 * réellement. Une adresse postale ou un profil social inventés seraient une
 * donnée fausse servie aux moteurs, ce qui est pire que leur absence.
 */
export function organizationJsonLd(description: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: SITE_NAME,
    url: SITE_URL,
    description,
    logo: `${SITE_URL}/brand/democracy-together-logo.png`,
  };
}

/**
 * Sérialise un objet JSON-LD pour le poser dans `<script type="…ld+json">`.
 *
 * `JSON.stringify` seul NE SUFFIT PAS dès que la valeur contient du texte
 * qu'on ne contrôle pas. Un analyseur HTML ferme un `<script>` sur la première
 * séquence `</script` qu'il rencontre, SANS regarder si elle est entre
 * guillemets JSON : un titre d'actualité saisi dans le CMS et valant
 * `Fin</script><img src=x onerror=alert(1)>` sortirait du bloc et rendrait sa
 * balise. C'est la même famille que M-9 (§ 4ter du rapport d'audit), sur une
 * autre surface — et c'est cette fonction, et non la vigilance de l'appelant,
 * qui la ferme.
 *
 * `\u003c` est un échappement JSON parfaitement légal : `JSON.parse` le
 * relit en `<`, donc un moteur reçoit la donnée intacte. On échappe TOUS les `<`
 * plutôt que la seule séquence `</script` — c'est moins fin et strictement
 * plus sûr.
 */
export function jsonLdScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

// Modes de participation schema.org, par format d'événement du dépôt. La table
// est exhaustive par construction : `Record<EventFormat, …>` fait échouer la
// compilation si un format est ajouté sans son mode.
const ATTENDANCE_MODE: Record<EventFormat, string> = {
  presentiel: 'https://schema.org/OfflineEventAttendanceMode',
  'en-ligne': 'https://schema.org/OnlineEventAttendanceMode',
  hybride: 'https://schema.org/MixedEventAttendanceMode',
};

/** Une date « jour entier » en `YYYY-MM-DD`, zéro-paddée. `mo` va de 1 à 12. */
export function isoDay({ y, mo, d }: { y: number; mo: number; d: number }) {
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export type EventJsonLdInput = {
  /** Titre affiché, déjà traduit. */
  name: string;
  slug: string;
  locale: string;
  /** Chapô affiché sur la page — pas celui de la page de liste. */
  description?: string;
  /** Jour de l'événement, en composantes. */
  start: { y: number; mo: number; d: number };
  format: EventFormat;
  /** Ville affichée, déjà traduite. Ignorée pour un événement en ligne. */
  placeName: string;
  /** Langues de l'événement, en codes BCP 47 courts. */
  inLanguage?: string[];
};

/**
 * Fiche `Event` d'une page de détail d'événement.
 *
 * Trois champs que Google recommande sont VOLONTAIREMENT absents, et chacun
 * pour une raison mesurable sur la page :
 *
 *  - `image` : la page sert `/library/paris.jpg` pour TOUS les événements, y
 *    compris ceux de Dakar, et sa propre légende dit « Image d'illustration ».
 *    La déclarer comme image de l'événement servirait une donnée fausse.
 *  - `offers` : les tarifs de la conférence sont fictifs (l'en-tête de
 *    `events-content.ts` le dit) et le bouton « réserver » mène à l'adhésion,
 *    pas à une billetterie. Annoncer un billet achetable serait un mensonge.
 *  - `performer` : les intervenants relèvent du même jeu de données
 *    d'illustration.
 *
 * Le principe est celui de `organizationJsonLd` : on ne déclare que ce que la
 * page montre réellement.
 */
export function eventJsonLd(input: EventJsonLdInput) {
  const url = `${SITE_URL}/${input.locale}/evenements/${input.slug}`;
  const place = {
    '@type': 'Place',
    name: input.placeName,
    address: { '@type': 'PostalAddress', addressLocality: input.placeName },
  };
  const virtual = { '@type': 'VirtualLocation', url };
  // `endDate` de schema.org est INCLUSIVE — contrairement au `DTEND` d'un
  // iCalendar « journée entière », qui désigne le lendemain (cf. `nextDay`
  // dans `src/lib/ics.ts`). Reprendre la date de fin de l'ICS donnerait ici un
  // événement de deux jours.
  const day = isoDay(input.start);

  return {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    startDate: day,
    endDate: day,
    eventStatus: 'https://schema.org/EventScheduled',
    eventAttendanceMode: ATTENDANCE_MODE[input.format],
    location:
      input.format === 'en-ligne'
        ? virtual
        : input.format === 'hybride'
          ? [place, virtual]
          : place,
    ...(input.inLanguage?.length ? { inLanguage: input.inLanguage } : {}),
    organizer: { '@id': ORGANIZATION_ID },
    url,
  };
}

export type ArticleJsonLdInput = {
  headline: string;
  slug: string;
  /** Préfixe d'URL de la page — la langue du billet peut en différer. */
  locale: string;
  description?: string;
  /** Date ISO servie par le CMS. */
  datePublished: string;
  inLanguage?: string;
};

/**
 * Fiche `Article` d'une page d'actualité.
 *
 * `author` est absent : le schéma Sanity du dépôt n'a pas de champ auteur
 * (`sanity/schemaTypes/documents/post.ts`). L'inventer — « Democracy
 * Together » en guise de personne — serait une donnée fausse ; l'éditeur
 * responsable est déjà déclaré par `publisher`.
 *
 * `image` est absent aussi, et c'est le cas intéressant : la requête
 * `postBySlugQuery` PROJETTE bien `coverUrl`, mais la page ne rend pas cette
 * image. Une fiche doit décrire ce que la page montre ; déclarer une image
 * absente du rendu, c'est décrire une autre page.
 *
 * À NE POSER QUE SUR LE RENDU RÉUSSI. Le rendu dégradé (Sanity injoignable)
 * porte déjà un `noindex` et n'affiche aucun article : une fiche y décrirait
 * un contenu que la page ne sert pas.
 */
export function articleJsonLd(input: ArticleJsonLdInput) {
  const url = `${SITE_URL}/${input.locale}/actualites/${input.slug}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: input.headline,
    ...(input.description ? { description: input.description } : {}),
    datePublished: input.datePublished,
    ...(input.inLanguage ? { inLanguage: input.inLanguage } : {}),
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    url,
    publisher: { '@id': ORGANIZATION_ID },
  };
}
