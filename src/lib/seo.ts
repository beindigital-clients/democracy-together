import { routing } from '@/i18n/routing';
import type { EventFormat } from '@/lib/events-content';

// Sharing metadata and structured data (audit F-03).
//
// Measured before the fix: across the 48 public pages (24 routes × 2 languages),
// ZERO Open Graph tags, zero Twitter Cards, zero JSON-LD. A link shared in a
// messaging app or on a social network appeared bare — no title, no
// description, no image. For a network whose purpose is disseminating
// analyses, and whose main sharing channel in the target region is
// messaging, that is a loss on every share.

// PROPER NOUN: it is not translated (same rule as the layout's `title`).
export const SITE_NAME = 'Democracy Together';

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

// Open Graph expects a territorialized language tag (`fr_FR`), not a short
// ISO code (`fr`). A missing value is better than an invented one:
// we do not guess the territory of a locale we do not know.
const OG_LOCALES: Record<string, string> = {
  fr: 'fr_FR',
  en: 'en_US',
  // The territories chosen are those of each language's target audience, not
  // the most populous: Spain and Portugal for the diasporas and the
  // network's European partners, Egypt for Arabic — the written dialect of
  // the Maghrebi and Levantine press shares Modern Standard Arabic, and
  // `ar_EG` is the tag platforms most widely recognize for this
  // variant.
  es: 'es_ES',
  pt: 'pt_PT',
  ar: 'ar_EG',
};

export function openGraphLocale(locale: string): string | undefined {
  return OG_LOCALES[locale];
}

/**
 * The site's other languages, in the format expected by `openGraph.alternateLocale`.
 * Used to declare that the same page exists elsewhere, without repeating it.
 */
export function alternateOpenGraphLocales(locale: string): string[] {
  return routing.locales
    .filter((l) => l !== locale)
    .map(openGraphLocale)
    .filter((l): l is string => Boolean(l));
}

/**
 * `alternates` block of an indexable page: canonical address + hreflang.
 *
 * The shape follows EXACTLY the one `src/app/sitemap.ts` declares for the
 * same page (fr, en, x-default) — its header says the sitemap alternates
 * are "cohérents avec les canonicals posés par les generateMetadata". Two
 * separate writings of the same rule end up diverging; this one is the
 * only one.
 *
 * NOT to be used on a `noindex` page: a search engine ignores hreflang
 * there, and the repo decided (issue #35) that adding it would only be
 * noise. `/recherche` and Tribune posts are the tested cases.
 */
// The hreflang of ALL the site's languages, for a path without prefix.
//
// Measured on 27/09: 26 pages hard-coded `fr`, `en` and `x-default`,
// whereas the site is served in five languages and the sitemap, for its
// part, declares six alternates. A page in es/pt/ar that does not declare
// itself as an alternate passes for a duplicate. The language catalog is the
// routing one: a sixth language is added here without touching the pages.
export function hreflangFor(path: string): Record<string, string> {
  const suffix = path ? `/${path}` : '';
  const languages: Record<string, string> = {
    'x-default': `${SITE_URL}/fr${suffix}`,
  };
  for (const l of routing.locales) languages[l] = `${SITE_URL}/${l}${suffix}`;
  return languages;
}

export function alternatesFor(locale: string, path: string) {
  const suffix = path ? `/${path}` : '';
  return {
    canonical: `${SITE_URL}/${locale}${suffix}`,
    languages: hreflangFor(path),
  };
}

/**
 * Identifier of the `Organization` node set by the layout, on every page.
 *
 * Page entries (`Article`, `Event`) REFERENCE it instead of copying the
 * organization: two copies of the same entity end up diverging, and
 * schema.org provides exactly this reference. It is only resolvable because
 * the layout sets its entry on every page — which the audit spec checks, on
 * the served HTML, rather than relying on it.
 */
export const ORGANIZATION_ID = `${SITE_URL}/#organization`;

/**
 * `Organization` entry (schema.org), set once for the whole site.
 *
 * Deliberately minimal: we only declare what the repo actually has. An
 * invented postal address or social profile would be false data served to
 * search engines, which is worse than their absence.
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
 * Serializes a JSON-LD object to put it in `<script type="…ld+json">`.
 *
 * `JSON.stringify` alone is NOT ENOUGH as soon as the value contains text
 * we do not control. An HTML parser closes a `<script>` on the first
 * `</script` sequence it meets, WITHOUT checking whether it is inside JSON
 * quotes: a news title entered in the CMS with the value
 * `Fin</script><img src=x onerror=alert(1)>` would break out of the block and
 * render its tag. It is the same family as M-9 (§ 4ter of the audit report),
 * on another surface — and it is this function, not the caller's vigilance,
 * that closes it.
 *
 * `<` is a perfectly legal JSON escape: `JSON.parse` reads it back as
 * `<`, so a search engine receives the data intact. We escape ALL `<`s
 * rather than only the `</script` sequence — less precise and strictly
 * safer.
 */
export function jsonLdScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

// schema.org attendance modes, per event format of the repo. The table
// is exhaustive by construction: `Record<EventFormat, …>` fails compilation
// if a format is added without its mode.
const ATTENDANCE_MODE: Record<EventFormat, string> = {
  presentiel: 'https://schema.org/OfflineEventAttendanceMode',
  'en-ligne': 'https://schema.org/OnlineEventAttendanceMode',
  hybride: 'https://schema.org/MixedEventAttendanceMode',
};

/** An "all-day" date as `YYYY-MM-DD`, zero-padded. `mo` goes from 1 to 12. */
export function isoDay({ y, mo, d }: { y: number; mo: number; d: number }) {
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export type EventJsonLdInput = {
  /** Displayed title, already translated. */
  name: string;
  slug: string;
  locale: string;
  /** Standfirst shown on the page — not the one from the list page. */
  description?: string;
  /** Day of the event, as components. */
  start: { y: number; mo: number; d: number };
  format: EventFormat;
  /** Displayed city, already translated. Ignored for an online event. */
  placeName: string;
  /** Languages of the event, as short BCP 47 codes. */
  inLanguage?: string[];
};

/**
 * `Event` entry for an event detail page.
 *
 * Three fields Google recommends are DELIBERATELY absent, each one for a
 * reason that can be measured on the page:
 *
 *  - `image`: the page serves `/library/paris.jpg` for ALL events, including
 *    those in Dakar, and its own caption says "Image d'illustration".
 *    Declaring it as the event's image would serve false data.
 *  - `offers`: the conference prices are fictitious (the header of
 *    `events-content.ts` says so) and the "réserver" button leads to
 *    membership, not to a ticket office. Advertising a purchasable ticket
 *    would be a lie.
 *  - `performer`: the speakers belong to the same illustrative
 *    dataset.
 *
 * The principle is that of `organizationJsonLd`: we only declare what the
 * page actually shows.
 */
export function eventJsonLd(input: EventJsonLdInput) {
  const url = `${SITE_URL}/${input.locale}/evenements/${input.slug}`;
  const place = {
    '@type': 'Place',
    name: input.placeName,
    address: { '@type': 'PostalAddress', addressLocality: input.placeName },
  };
  const virtual = { '@type': 'VirtualLocation', url };
  // schema.org's `endDate` is INCLUSIVE — unlike the `DTEND` of an
  // "all-day" iCalendar event, which denotes the next day (see `nextDay`
  // in `src/lib/ics.ts`). Reusing the ICS end date here would yield a
  // two-day event.
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
  /** URL prefix of the page — the post's language may differ from it. */
  locale: string;
  description?: string;
  /** Publication day (`YYYY-MM-DD`, an ISO 8601 date). */
  datePublished: string;
  inLanguage?: string;
};

/**
 * `Article` entry for a news page.
 *
 * `author` is absent: an article (`contentNews`) has no author field.
 * Inventing one — "Democracy Together" posing as a person — would be false
 * data; the responsible publisher is already declared by `publisher`.
 *
 * `image` is absent too: an article has no image, and an entry must
 * describe what the page shows.
 *
 * TO BE SET ONLY ON A SUCCESSFUL RENDER. The degraded render (backend
 * unreachable) already carries a `noindex` and shows no article: an entry
 * there would describe content the page does not serve.
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
